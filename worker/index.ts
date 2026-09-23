import { Hono } from "hono"
import type {
  AccessMode,
  CreateEventBody,
  CreateEventResponse,
  CreateGroupBody,
  CreateGroupResponse,
  EventPublic,
  EventMode,
  EventToken,
  EventViewResponse,
  GroupEventSummary,
  GroupMember,
  GroupViewResponse,
  PublicParticipant,
  RosterEntry,
  Slot,
  SlotTally,
  VoteBody,
  VoteValue,
} from "../shared/types"
import { groupSlugOf, validateGroupSlug, validateSlug } from "../shared/types"
import { buildCalendar } from "../shared/calendar"

type Bindings = { DB: D1Database; ASSETS: Fetcher }

const app = new Hono<{ Bindings: Bindings }>()

/* ------------------------------------------------------------------ utils */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
/** No vowels, so a generated link can't accidentally spell something. */
const SLUG_ALPHABET = "bcdfghjkmnpqrstvwxyz23456789"

function randomKey(length = 22): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ""
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

function randomSlug(length = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ""
  for (const b of bytes) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length]
  return out
}

/** Short, readable, unambiguous token for handing out to people. */
function randomToken(): string {
  const raw = randomKey(9)
  return raw.slice(0, 3) + "-" + raw.slice(3, 6) + "-" + raw.slice(6, 9)
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** Length-safe comparison that avoids leaking position via early exit. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false
  const d = new Date(s + "T00:00:00Z")
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function cleanTime(v: unknown): string | null {
  if (typeof v !== "string" || v === "") return null
  return TIME_RE.test(v) ? v : null
}

function str(v: unknown, max: number, fallback = ""): string {
  if (typeof v !== "string") return fallback
  return v.trim().slice(0, max)
}

/** 0 and null both mean "no attendance threshold". */
function normaliseQuorum(v: unknown): number {
  const n = Math.floor(Number(v) || 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(500, n)
}

/**
 * Only http(s) links are kept. Anything else - javascript:, data:, garbage -
 * becomes an empty string, since this URL is rendered as a clickable link.
 */
function cleanUrl(v: unknown): string {
  const raw = str(v, 500)
  if (!raw) return ""
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return ""
    return url.toString()
  } catch {
    return ""
  }
}

function cleanMode(v: unknown): EventMode | null {
  return v === "oneoff" || v === "repeatable" ? v : null
}

/** Today's date, YYYY-MM-DD, on the event's wall clock (UTC for an unknown zone). */
function todayIn(zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/**
 * The earliest date still open for voting. Repeatable events roll forward, so
 * past days drop off (their votes are kept); one-off events keep every day.
 * Used as `date >= ?`, where "" lets everything through.
 */
function openFrom(row: Pick<EventRow, "mode" | "timezone">): string {
  return row.mode === "repeatable" ? todayIn(row.timezone) : ""
}

function splitNames(input: unknown, limit = 200): string[] {
  if (!Array.isArray(input)) return []
  return input.map((n) => str(n, 60)).filter(Boolean).slice(0, limit)
}

class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 410 | 429,
    message: string,
  ) {
    super(message)
  }
}

/* ------------------------------------------------------------------- rows */

interface GroupRow {
  id: string
  slug: string
  name: string
  description: string
  owner_key_hash: string
  chat_url: string
  created_at: number
  updated_at: number
}

interface EventRow {
  id: string
  slug: string
  group_id: string | null
  title: string
  description: string
  owner_key_hash: string
  access_mode: string
  min_attendees: number
  max_attendees: number
  allow_no: number
  chat_url: string
  count_maybe: number
  timezone: string
  mode: EventMode
  vote_round: number
  locked_slot_id: string | null
  closed: number
  created_at: number
  updated_at: number
}

interface MemberRow {
  id: string
  group_id: string
  name: string
  token: string
  revoked: number
  created_at: number
}

interface KeySource {
  req: {
    header: (k: string) => string | undefined
    query: (k: string) => string | undefined
  }
}

const eventKeyFrom = (c: KeySource) =>
  c.req.header("x-owner-key") ?? c.req.query("k") ?? null
const groupKeyFrom = (c: KeySource) =>
  c.req.header("x-group-key") ?? c.req.query("g") ?? null
const tokenFrom = (c: KeySource) => c.req.query("t") ?? null

/**
 * Slugs contain slashes (`club/games-night`), so they travel as a query
 * parameter. A greedy path wildcard would swallow sub-resource segments.
 */
function slugOf(c: KeySource): string {
  const slug = (c.req.query("slug") ?? "").toLowerCase()
  if (!slug) throw new HttpError(400, "Missing event.")
  return slug
}

async function getGroupBySlug(db: D1Database, slug: string) {
  return db.prepare("SELECT * FROM groups WHERE slug = ?").bind(slug).first<GroupRow>()
}

async function getEventBySlug(db: D1Database, slug: string): Promise<EventRow> {
  const row = await db
    .prepare("SELECT * FROM events WHERE slug = ?")
    .bind(slug)
    .first<EventRow>()
  if (!row) throw new HttpError(404, "No event lives at that link.")
  return row
}

/** Groups and events share one namespace, so a link resolves unambiguously. */
async function slugFree(db: D1Database, slug: string): Promise<boolean> {
  const [g, e] = await Promise.all([
    db.prepare("SELECT 1 FROM groups WHERE slug = ?").bind(slug).first(),
    db.prepare("SELECT 1 FROM events WHERE slug = ?").bind(slug).first(),
  ])
  return !g && !e
}

async function uniqueSlug(db: D1Database, prefix = ""): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const candidate = prefix ? prefix + "/" + randomSlug() : randomSlug()
    if (await slugFree(db, candidate)) return candidate
  }
  throw new HttpError(409, "Couldn't allocate a link - please try again.")
}

/* -------------------------------------------------------------------- auth */

async function groupOwns(group: GroupRow | null, key: string | null) {
  if (!group || !key) return false
  return safeEqual(await sha256(key), group.owner_key_hash)
}

/** An event is owned by its own key, or by the key of the group holding it. */
async function resolveEventOwner(
  db: D1Database,
  row: EventRow,
  c: KeySource,
): Promise<{ owner: boolean; group: GroupRow | null }> {
  const group = row.group_id
    ? ((await db
        .prepare("SELECT * FROM groups WHERE id = ?")
        .bind(row.group_id)
        .first<GroupRow>()) ?? null)
    : null

  const eventKey = eventKeyFrom(c)
  if (eventKey && safeEqual(await sha256(eventKey), row.owner_key_hash)) {
    return { owner: true, group }
  }
  if (await groupOwns(group, groupKeyFrom(c))) return { owner: true, group }
  return { owner: false, group }
}

/** Resolves a group-member token to its row, if it is live. */
async function memberFor(
  db: D1Database,
  groupId: string | null,
  token: string | null,
): Promise<MemberRow | null> {
  if (!groupId || !token) return null
  const row = await db
    .prepare("SELECT * FROM members WHERE group_id = ? AND token = ? AND revoked = 0")
    .bind(groupId, token)
    .first<MemberRow>()
  return row ?? null
}

/* ------------------------------------------------------------- assembling */

interface SlotRow {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  label: string | null
  sort_order: number
  confirmed: number
}
interface ParticipantRow {
  id: string
  name: string
  comment: string
  token_id: string | null
  member_id: string | null
  edit_key: string
  vote_round: number
  updated_at: number
}
interface VoteRow {
  participant_id: string
  slot_id: string
  value: string
}

async function buildEventView(
  db: D1Database,
  row: EventRow,
  opts: {
    owner: boolean
    group: GroupRow | null
    token?: string | null
    editKey?: string | null
    /** Keep days a repeatable event has rolled past, e.g. for the calendar feed. */
    includePast?: boolean
  },
): Promise<EventViewResponse> {
  const from = opts.includePast ? "" : openFrom(row)
  const [slotRes, partRes, voteRes] = await db.batch<Record<string, never>>([
    db
      .prepare(
        "SELECT id, date, start_time, end_time, label, sort_order, confirmed FROM slots WHERE event_id = ? AND hidden = 0 AND date >= ? ORDER BY date, sort_order, start_time",
      )
      .bind(row.id, from),
    db
      .prepare(
        "SELECT id, name, comment, token_id, member_id, edit_key, vote_round, updated_at FROM participants WHERE event_id = ? ORDER BY created_at",
      )
      .bind(row.id),
    db
      .prepare(
        "SELECT v.participant_id, v.slot_id, v.value FROM votes v JOIN participants p ON p.id = v.participant_id JOIN slots s ON s.id = v.slot_id WHERE p.event_id = ? AND s.hidden = 0 AND s.date >= ?",
      )
      .bind(row.id, from),
  ])

  const slotRows = (slotRes.results ?? []) as unknown as SlotRow[]

  const slots: Slot[] = slotRows.map((s) => ({
    id: s.id,
    date: s.date,
    startTime: s.start_time,
    endTime: s.end_time,
    label: s.label,
    sortOrder: s.sort_order,
  }))

  const votesByParticipant = new Map<string, Record<string, VoteValue>>()
  for (const v of (voteRes.results ?? []) as unknown as VoteRow[]) {
    let m = votesByParticipant.get(v.participant_id)
    if (!m) {
      m = {}
      votesByParticipant.set(v.participant_id, m)
    }
    m[v.slot_id] = v.value as VoteValue
  }

  const rawParticipants = (partRes.results ?? []) as unknown as ParticipantRow[]
  const participants: PublicParticipant[] = rawParticipants.map((p) => ({
    id: p.id,
    name: p.name,
    comment: p.comment,
    votes: votesByParticipant.get(p.id) ?? {},
    needsRecheck: p.vote_round < row.vote_round,
    updatedAt: p.updated_at,
  }))

  const quorum = row.min_attendees > 0 ? row.min_attendees : null
  const capacity = row.max_attendees > 0 ? row.max_attendees : null
  const allowNo = row.allow_no === 1
  const countMaybe = row.count_maybe === 1

  const tallies: SlotTally[] = slots.map((slot) => {
    const t: SlotTally = {
      slotId: slot.id,
      yes: 0,
      maybe: 0,
      no: 0,
      score: 0,
      meetsQuorum: false,
      spotsLeft: null,
      full: false,
      yesNames: [],
      waitlistNames: [],
      maybeNames: [],
      noNames: [],
    }
    for (const p of participants) {
      const v = p.votes[slot.id]
      if (v === "yes") {
        t.yes++
        t.yesNames.push(p.name)
      } else if (v === "maybe") {
        t.maybe++
        t.maybeNames.push(p.name)
      } else if (v === "no") {
        t.no++
        t.noNames.push(p.name)
      }
    }
    t.score = countMaybe ? t.yes + t.maybe : t.yes
    t.meetsQuorum = quorum !== null && t.score >= quorum

    // The cap applies to 'in' votes only. Participants come back in join order,
    // so the first N to say yes hold the places and the rest wait.
    if (capacity !== null) {
      t.spotsLeft = Math.max(0, capacity - t.yes)
      t.full = t.yes >= capacity
      t.waitlistNames = t.yesNames.slice(capacity)
      t.yesNames = t.yesNames.slice(0, capacity)
    }
    return t
  })

  // Roster: every live group member, and whether they've answered yet.
  let roster: RosterEntry[] = []
  if (opts.group) {
    const memberRows = await db
      .prepare(
        "SELECT id, name FROM members WHERE group_id = ? AND revoked = 0 ORDER BY created_at",
      )
      .bind(opts.group.id)
      .all<{ id: string; name: string }>()
    const replied = new Set(
      rawParticipants.map((p) => p.member_id).filter((x): x is string => !!x),
    )
    roster = (memberRows.results ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      replied: replied.has(m.id),
    }))
  }

  // Who is "you"?
  let you: PublicParticipant | null = null
  let tokenLabel: string | null = null

  if (opts.token) {
    const member = await memberFor(db, row.group_id, opts.token)
    if (member) {
      tokenLabel = member.name
      const mine = rawParticipants.find((p) => p.member_id === member.id)
      if (mine) you = participants.find((p) => p.id === mine.id) ?? null
    } else {
      const tokenRow = await db
        .prepare("SELECT id, label, revoked FROM tokens WHERE event_id = ? AND token = ?")
        .bind(row.id, opts.token)
        .first<{ id: string; label: string; revoked: number }>()
      if (tokenRow && tokenRow.revoked === 0) {
        tokenLabel = tokenRow.label || null
        const mine = rawParticipants.find((p) => p.token_id === tokenRow.id)
        if (mine) you = participants.find((p) => p.id === mine.id) ?? null
      }
    }
  }
  if (!you && opts.editKey) {
    const editKey = opts.editKey
    const mine = rawParticipants.find((p) => safeEqual(p.edit_key, editKey))
    if (mine) you = participants.find((p) => p.id === mine.id) ?? null
  }

  const event: EventPublic = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    accessMode: row.access_mode as AccessMode,
    minAttendees: quorum,
    maxAttendees: capacity,
    allowNo,
    chatUrl: row.chat_url ?? "",
    countMaybe,
    timezone: row.timezone,
    mode: row.mode,
    lockedSlotId: row.mode === "oneoff" ? row.locked_slot_id : null,
    confirmedSlotIds:
      row.mode === "repeatable" ? slotRows.filter((s) => s.confirmed === 1).map((s) => s.id) : [],
    closed: row.mode === "oneoff" && row.closed === 1,
    createdAt: row.created_at,
    slots,
    participants,
    tallies,
    group: opts.group
      ? {
          slug: opts.group.slug,
          name: opts.group.name,
          chatUrl: opts.group.chat_url ?? "",
        }
      : null,
    roster,
  }

  const view: EventViewResponse = { event, isOwner: opts.owner, you, tokenLabel }

  if (opts.owner) {
    interface TokenRow {
      id: string
      token: string
      label: string
      revoked: number
      created_at: number
      claimed_by: string | null
    }
    const tokenRows = await db
      .prepare(
        "SELECT t.id, t.token, t.label, t.revoked, t.created_at, p.name AS claimed_by FROM tokens t LEFT JOIN participants p ON p.token_id = t.id WHERE t.event_id = ? ORDER BY t.created_at",
      )
      .bind(row.id)
      .all<TokenRow>()
    view.tokens = (tokenRows.results ?? []).map(
      (t): EventToken => ({
        id: t.id,
        token: t.token,
        label: t.label,
        revoked: t.revoked === 1,
        claimedBy: t.claimed_by ?? null,
        createdAt: t.created_at,
      }),
    )
  }

  return view
}

async function buildGroupView(
  db: D1Database,
  group: GroupRow,
  opts: { owner: boolean; token?: string | null },
): Promise<GroupViewResponse> {
  const memberRes = await db
    .prepare("SELECT * FROM members WHERE group_id = ? ORDER BY created_at")
    .bind(group.id)
    .all<MemberRow>()
  const members = memberRes.results ?? []
  const live = members.filter((m) => m.revoked === 0)

  interface EvRow {
    id: string
    slug: string
    title: string
    min_attendees: number
    count_maybe: number
    mode: EventMode
    timezone: string
    locked_slot_id: string | null
    closed: number
    created_at: number
  }
  const eventRes = await db
    .prepare(
      "SELECT id, slug, title, min_attendees, count_maybe, mode, timezone, locked_slot_id, closed, created_at FROM events WHERE group_id = ? ORDER BY created_at DESC",
    )
    .bind(group.id)
    .all<EvRow>()
  const eventRows = eventRes.results ?? []

  // One pass over every slot tally in the group, rather than per-event queries.
  interface AggRow {
    event_id: string
    slot_id: string
    date: string
    confirmed: number
    yes: number
    maybe: number
  }
  const agg = await db
    .prepare(
      `SELECT s.event_id AS event_id, s.id AS slot_id, s.date AS date, s.confirmed AS confirmed,
              SUM(CASE WHEN v.value = 'yes' THEN 1 ELSE 0 END) AS yes,
              SUM(CASE WHEN v.value = 'maybe' THEN 1 ELSE 0 END) AS maybe
         FROM slots s
         JOIN events e ON e.id = s.event_id
         LEFT JOIN votes v ON v.slot_id = s.id
        WHERE e.group_id = ? AND s.hidden = 0
        GROUP BY s.id`,
    )
    .bind(group.id)
    .all<AggRow>()

  const repliedRes = await db
    .prepare(
      `SELECT e.id AS event_id, COUNT(p.id) AS n
         FROM events e LEFT JOIN participants p ON p.event_id = e.id
        WHERE e.group_id = ?
        GROUP BY e.id`,
    )
    .bind(group.id)
    .all<{ event_id: string; n: number }>()
  const repliedBy = new Map((repliedRes.results ?? []).map((r) => [r.event_id, r.n]))

  const dateBySlot = new Map((agg.results ?? []).map((r) => [r.slot_id, r.date]))

  const events: GroupEventSummary[] = eventRows.map((ev) => {
    const from = openFrom(ev)
    let bestScore = 0
    let bestDate: string | null = null
    let nextSession: string | null = null
    for (const r of agg.results ?? []) {
      if (r.event_id !== ev.id || r.date < from) continue
      if (r.confirmed === 1 && (nextSession === null || r.date < nextSession)) {
        nextSession = r.date
      }
      const score = ev.count_maybe === 1 ? r.yes + r.maybe : r.yes
      if (score > bestScore) {
        bestScore = score
        bestDate = r.date
      }
    }
    return {
      slug: ev.slug,
      title: ev.title,
      minAttendees: ev.min_attendees > 0 ? ev.min_attendees : null,
      replied: repliedBy.get(ev.id) ?? 0,
      rosterSize: live.length,
      bestScore,
      bestDate,
      mode: ev.mode,
      lockedDate:
        ev.mode === "repeatable"
          ? nextSession
          : ev.locked_slot_id
            ? (dateBySlot.get(ev.locked_slot_id) ?? null)
            : null,
      closed: ev.mode === "oneoff" && ev.closed === 1,
      createdAt: ev.created_at,
    }
  })

  const you = opts.token ? await memberFor(db, group.id, opts.token) : null

  const view: GroupViewResponse = {
    group: {
      id: group.id,
      slug: group.slug,
      name: group.name,
      description: group.description,
      chatUrl: group.chat_url ?? "",
      memberCount: live.length,
      createdAt: group.created_at,
    },
    isOwner: opts.owner,
    events,
    roster: live.map((m) => ({ id: m.id, name: m.name })),
    you: you ? { id: you.id, name: you.name } : null,
  }

  if (opts.owner) {
    view.members = members.map(
      (m): GroupMember => ({
        id: m.id,
        name: m.name,
        token: m.token,
        revoked: m.revoked === 1,
        createdAt: m.created_at,
      }),
    )
  }

  return view
}

/* -------------------------------------------------------------- endpoints */

const api = new Hono<{ Bindings: Bindings }>()

api.get("/slug-available", async (c) => {
  const slug = (c.req.query("slug") ?? "").toLowerCase()
  const kind = c.req.query("kind") === "group" ? "group" : "event"
  const invalid = kind === "group" ? validateGroupSlug(slug) : validateSlug(slug)
  if (invalid) return c.json({ available: false, reason: invalid })

  const free = await slugFree(c.env.DB, slug)
  if (!free) return c.json({ available: false, reason: "That link is already taken." })

  // A slug inside someone else's group isn't yours to take.
  if (kind === "event") {
    const gSlug = groupSlugOf(slug)
    if (gSlug) {
      const group = await getGroupBySlug(c.env.DB, gSlug)
      if (group && !(await groupOwns(group, groupKeyFrom(c)))) {
        return c.json({
          available: false,
          reason: `The "${gSlug}" group belongs to someone else.`,
        })
      }
    }
  }
  return c.json({ available: true, reason: null })
})

/** Tells the SPA whether a path is a group or an event. */
api.get("/resolve", async (c) => {
  const slug = (c.req.query("slug") ?? "").toLowerCase()
  if (!slug) throw new HttpError(400, "Missing slug.")
  if (await getGroupBySlug(c.env.DB, slug)) return c.json({ type: "group", slug })
  const event = await c.env.DB.prepare("SELECT 1 FROM events WHERE slug = ?")
    .bind(slug)
    .first()
  if (event) return c.json({ type: "event", slug })
  throw new HttpError(404, "Nothing lives at that link.")
})

/* ------------------------------------------------------------------ groups */

api.post("/groups", async (c) => {
  const body = await c.req.json<CreateGroupBody>().catch(() => null)
  if (!body) throw new HttpError(400, "Malformed request.")

  const name = str(body.name, 80)
  if (!name) throw new HttpError(400, "Give the group a name.")

  let slug = str(body.slug, 40).toLowerCase()
  if (slug) {
    const invalid = validateGroupSlug(slug)
    if (invalid) throw new HttpError(400, invalid)
    if (!(await slugFree(c.env.DB, slug))) {
      throw new HttpError(409, "That group link is already taken.")
    }
  } else {
    slug = await uniqueSlug(c.env.DB)
  }

  const groupKey = randomKey(28)
  const groupId = crypto.randomUUID()
  const now = Date.now()

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      "INSERT INTO groups (id, slug, name, description, owner_key_hash, chat_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      groupId,
      slug,
      name,
      str(body.description, 2000),
      await sha256(groupKey),
      cleanUrl(body.chatUrl),
      now,
      now,
    ),
  ]

  const members: GroupMember[] = []
  for (const memberName of splitNames(body.memberNames)) {
    const m: GroupMember = {
      id: crypto.randomUUID(),
      name: memberName,
      token: randomToken(),
      revoked: false,
      createdAt: now,
    }
    members.push(m)
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO members (id, group_id, name, token, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(m.id, groupId, m.name, m.token, now),
    )
  }

  await c.env.DB.batch(statements)
  const res: CreateGroupResponse = { slug, groupKey, members }
  return c.json(res, 201)
})

api.get("/group", async (c) => {
  const slug = slugOf(c)
  const group = await getGroupBySlug(c.env.DB, slug)
  if (!group) throw new HttpError(404, "No group lives at that link.")
  const owner = await groupOwns(group, groupKeyFrom(c))
  return c.json(await buildGroupView(c.env.DB, group, { owner, token: tokenFrom(c) }))
})

async function requireGroupOwner(c: {
  env: Bindings
  req: KeySource["req"]
}): Promise<GroupRow> {
  const slug = (c.req.query("slug") ?? "").toLowerCase()
  const group = await getGroupBySlug(c.env.DB, slug)
  if (!group) throw new HttpError(404, "No group lives at that link.")
  if (!(await groupOwns(group, groupKeyFrom(c)))) {
    throw new HttpError(403, "That admin link isn't valid for this group.")
  }
  return group
}

api.patch("/group", async (c) => {
  const group = await requireGroupOwner(c)
  const body = await c.req.json<Partial<CreateGroupBody>>().catch(() => null)
  if (!body) throw new HttpError(400, "Malformed request.")

  const sets: string[] = []
  const args: unknown[] = []
  if (typeof body.name === "string") {
    const n = str(body.name, 80)
    if (!n) throw new HttpError(400, "Give the group a name.")
    sets.push("name = ?")
    args.push(n)
  }
  if (typeof body.description === "string") {
    sets.push("description = ?")
    args.push(str(body.description, 2000))
  }
  if (typeof body.chatUrl === "string") {
    sets.push("chat_url = ?")
    args.push(cleanUrl(body.chatUrl))
  }
  if (sets.length) {
    sets.push("updated_at = ?")
    args.push(Date.now(), group.id)
    await c.env.DB.prepare("UPDATE groups SET " + sets.join(", ") + " WHERE id = ?")
      .bind(...args)
      .run()
  }

  const fresh = (await getGroupBySlug(c.env.DB, group.slug)) as GroupRow
  return c.json(await buildGroupView(c.env.DB, fresh, { owner: true }))
})

api.post("/group/members", async (c) => {
  const group = await requireGroupOwner(c)
  const body = await c.req.json<{ names?: string[] }>().catch(() => null)
  const names = splitNames(body?.names, 100)
  if (!names.length) throw new HttpError(400, "Add at least one name.")

  const now = Date.now()
  await c.env.DB.batch(
    names.map((n) =>
      c.env.DB.prepare(
        "INSERT INTO members (id, group_id, name, token, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), group.id, n, randomToken(), now),
    ),
  )
  return c.json(await buildGroupView(c.env.DB, group, { owner: true }))
})

api.delete("/group/members/:memberId", async (c) => {
  const group = await requireGroupOwner(c)
  await c.env.DB.prepare("UPDATE members SET revoked = 1 WHERE id = ? AND group_id = ?")
    .bind(c.req.param("memberId"), group.id)
    .run()
  return c.json(await buildGroupView(c.env.DB, group, { owner: true }))
})

api.delete("/group", async (c) => {
  const group = await requireGroupOwner(c)
  await c.env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(group.id).run()
  return c.json({ ok: true })
})

/* ------------------------------------------------------------------ events */

api.post("/events", async (c) => {
  const body = await c.req.json<CreateEventBody>().catch(() => null)
  if (!body) throw new HttpError(400, "Malformed request.")

  const title = str(body.title, 120)
  if (!title) throw new HttpError(400, "Give your event a title.")

  let slug = str(body.slug, 100).toLowerCase()
  let groupSlug: string | null = str(body.groupSlug, 40).toLowerCase() || null

  if (slug) {
    const invalid = validateSlug(slug)
    if (invalid) throw new HttpError(400, invalid)
    // An explicit group plus a bare slug means "inside this group".
    if (groupSlug && !slug.includes("/")) slug = groupSlug + "/" + slug
  } else {
    slug = await uniqueSlug(c.env.DB, groupSlug ?? "")
  }
  groupSlug = groupSlugOf(slug) ?? groupSlug

  const rawSlots = Array.isArray(body.slots) ? body.slots.slice(0, 200) : []
  if (rawSlots.length === 0) {
    throw new HttpError(400, "Pick at least one day people can choose from.")
  }

  const seen = new Set<string>()
  const slots = rawSlots
    .filter((s) => isValidDate(s?.date))
    .map((s) => ({
      date: s.date,
      startTime: cleanTime(s.startTime),
      endTime: cleanTime(s.endTime),
      label: str(s.label, 60) || null,
    }))
    .filter((s) => {
      const key = s.date + "|" + (s.startTime ?? "") + "|" + (s.endTime ?? "")
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) =>
      a.date === b.date
        ? (a.startTime ?? "").localeCompare(b.startTime ?? "")
        : a.date.localeCompare(b.date),
    )
  if (slots.length === 0) throw new HttpError(400, "Those dates didn't look valid.")

  if (!(await slugFree(c.env.DB, slug))) {
    throw new HttpError(409, "That link is already taken.")
  }

  const now = Date.now()
  const statements: D1PreparedStatement[] = []

  // Resolve - or claim - the group namespace.
  let groupId: string | null = null
  let newGroupKey: string | null = null

  if (groupSlug) {
    const invalidGroup = validateGroupSlug(groupSlug)
    if (invalidGroup) throw new HttpError(400, invalidGroup)

    const existing = await getGroupBySlug(c.env.DB, groupSlug)
    if (existing) {
      if (!(await groupOwns(existing, groupKeyFrom(c)))) {
        throw new HttpError(
          403,
          `The "${groupSlug}" group belongs to someone else. Use its admin link, or pick a different group.`,
        )
      }
      groupId = existing.id
    } else {
      // Claim on first use: whoever creates the first event owns the namespace.
      groupId = crypto.randomUUID()
      newGroupKey = randomKey(28)
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO groups (id, slug, name, description, owner_key_hash, chat_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          groupId,
          groupSlug,
          groupSlug,
          "",
          await sha256(newGroupKey),
          "",
          now,
          now,
        ),
      )
    }
  }

  // Never silently downgrade a members-only request to a public event.
  if (body.accessMode === "group" && !groupId) {
    throw new HttpError(
      400,
      "Members-only needs a group. Create the event inside one, or pick a different access mode.",
    )
  }
  const accessMode: AccessMode =
    body.accessMode === "token" ? "token" : body.accessMode === "group" ? "group" : "open"

  const ownerKey = randomKey(28)
  const eventId = crypto.randomUUID()

  statements.push(
    c.env.DB.prepare(
      "INSERT INTO events (id, slug, group_id, title, description, owner_key_hash, access_mode, min_attendees, max_attendees, allow_no, chat_url, count_maybe, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      eventId,
      slug,
      groupId,
      title,
      str(body.description, 2000),
      await sha256(ownerKey),
      accessMode,
      normaliseQuorum(body.minAttendees),
      normaliseQuorum(body.maxAttendees),
      body.allowNo === false ? 0 : 1,
      cleanUrl(body.chatUrl),
      body.countMaybe ? 1 : 0,
      str(body.timezone, 64, "Europe/London"),
      cleanMode(body.mode) ?? "oneoff",
      now,
      now,
    ),
  )

  slots.forEach((s, i) => {
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO slots (id, event_id, date, start_time, end_time, label, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), eventId, s.date, s.startTime, s.endTime, s.label, i),
    )
  })

  const tokens: EventToken[] = []
  if (accessMode === "token") {
    for (const rawLabel of splitNames(body.tokenLabels)) {
      const t: EventToken = {
        id: crypto.randomUUID(),
        token: randomToken(),
        label: rawLabel,
        revoked: false,
        claimedBy: null,
        createdAt: now,
      }
      tokens.push(t)
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO tokens (id, event_id, token, label, created_at) VALUES (?, ?, ?, ?, ?)",
        ).bind(t.id, eventId, t.token, t.label, now),
      )
    }
  }

  await c.env.DB.batch(statements)

  const res: CreateEventResponse = {
    slug,
    // Group events run off the group key, so don't mint a second secret.
    ownerKey: groupId ? null : ownerKey,
    groupKey: newGroupKey,
    groupSlug,
    tokens,
  }
  return c.json(res, 201)
})

/**
 * Loads an event and enforces its access mode for a reader: owners always get
 * in, and gated events need a live token. Shared by the JSON view and the
 * calendar feed, so the feed can't leak a date the page wouldn't show.
 */
async function requireEventReader(c: KeySource & { env: Bindings }) {
  const slug = slugOf(c)
  const row = await getEventBySlug(c.env.DB, slug)
  const { owner, group } = await resolveEventOwner(c.env.DB, row, c)
  const token = tokenFrom(c)

  if (!owner) {
    if (row.access_mode === "group") {
      if (!token) throw new HttpError(401, "This event is for group members.")
      if (!(await memberFor(c.env.DB, row.group_id, token))) {
        throw new HttpError(403, "That member token isn't valid.")
      }
    } else if (row.access_mode === "token") {
      if (!token) throw new HttpError(401, "This event needs an access token.")
      const valid = await c.env.DB.prepare(
        "SELECT 1 FROM tokens WHERE event_id = ? AND token = ? AND revoked = 0",
      )
        .bind(row.id, token)
        .first()
      // A group member's token also opens a token-gated event in their group.
      const member = await memberFor(c.env.DB, row.group_id, token)
      if (!valid && !member) throw new HttpError(403, "That access token isn't valid.")
    }
  }

  return { row, owner, group, token }
}

api.get("/event", async (c) => {
  const { row, owner, group, token } = await requireEventReader(c)
  return c.json(
    await buildEventView(c.env.DB, row, {
      owner,
      group,
      token,
      editKey: c.req.query("e") ?? null,
    }),
  )
})

/**
 * An iCalendar feed for one event. Subscribed calendars poll it, so the entry
 * appears by itself once the organiser locks a date and goes away if they
 * unlock it. A repeatable event carries one entry per confirmed session, past
 * ones included so they don't vanish from calendars once they've happened.
 * `?download=1` serves the same bytes as a file for one-off imports.
 */
api.get("/event/calendar.ics", async (c) => {
  const { row, owner, group, token } = await requireEventReader(c)
  const view = await buildEventView(c.env.DB, row, { owner, group, token, includePast: true })
  const { event } = view

  const chosen =
    event.mode === "repeatable"
      ? event.slots.filter((s) => event.confirmedSlotIds.includes(s.id))
      : event.slots.filter((s) => s.id === event.lockedSlotId)

  const origin = new URL(c.req.url).origin
  const host = new URL(c.req.url).hostname
  const body = buildCalendar(
    chosen.map((slot) => ({
      ev: {
        // A one-off event keeps its long-standing UID, so existing subscribers
        // see the same entry move rather than a new one appear.
        uid: event.mode === "repeatable" ? `${slot.id}@${host}` : `${row.id}@${host}`,
        title: row.title,
        description: row.description,
        timezone: row.timezone,
        url: `${origin}/${row.slug}`,
        sequence: Math.floor(row.updated_at / 1000),
        going: event.tallies.find((t) => t.slotId === slot.id)?.yesNames ?? [],
      },
      slot,
    })),
    { name: `${row.title} · when` },
  )

  const download = c.req.query("download") === "1"
  const filename = row.slug.replace(/\//g, "-") + ".ics"
  return c.body(body, 200, {
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    "cache-control": "private, max-age=300",
  })
})

api.post("/event/vote", async (c) => {
  const slug = slugOf(c)
  const row = await getEventBySlug(c.env.DB, slug)
  if (row.mode === "oneoff" && (row.closed === 1 || row.locked_slot_id)) {
    throw new HttpError(410, "Voting has closed for this event.")
  }

  const body = await c.req.json<VoteBody>().catch(() => null)
  if (!body) throw new HttpError(400, "Malformed request.")

  const suppliedToken = str(body.token, 40)
  const member = await memberFor(c.env.DB, row.group_id, suppliedToken || null)

  let name = str(body.name, 60)
  let tokenId: string | null = null
  const memberId: string | null = member?.id ?? null

  if (member) {
    // A member always votes under their roster name, so the roster stays honest.
    name = member.name
  } else if (row.access_mode === "group") {
    if (!suppliedToken) throw new HttpError(401, "This event is for group members.")
    throw new HttpError(403, "That member token isn't valid.")
  } else if (row.access_mode === "token") {
    if (!suppliedToken) throw new HttpError(401, "This event needs an access token.")
    const tokenRow = await c.env.DB.prepare(
      "SELECT id FROM tokens WHERE event_id = ? AND token = ? AND revoked = 0",
    )
      .bind(row.id, suppliedToken)
      .first<{ id: string }>()
    if (!tokenRow) throw new HttpError(403, "That access token isn't valid.")
    tokenId = tokenRow.id
  }

  if (!name) throw new HttpError(400, "Please enter your name.")

  // Find an existing participant to update.
  let existing: { id: string; edit_key: string } | null = null
  if (memberId) {
    existing = await c.env.DB.prepare(
      "SELECT id, edit_key FROM participants WHERE event_id = ? AND member_id = ?",
    )
      .bind(row.id, memberId)
      .first<{ id: string; edit_key: string }>()
  } else if (tokenId) {
    existing = await c.env.DB.prepare(
      "SELECT id, edit_key FROM participants WHERE event_id = ? AND token_id = ?",
    )
      .bind(row.id, tokenId)
      .first<{ id: string; edit_key: string }>()
  } else if (body.editKey) {
    existing = await c.env.DB.prepare(
      "SELECT id, edit_key FROM participants WHERE event_id = ? AND edit_key = ?",
    )
      .bind(row.id, str(body.editKey, 40))
      .first<{ id: string; edit_key: string }>()
  }

  const from = openFrom(row)
  const slotRows = await c.env.DB.prepare(
    "SELECT id FROM slots WHERE event_id = ? AND hidden = 0 AND date >= ?",
  )
    .bind(row.id, from)
    .all<{ id: string }>()
  const validSlots = new Set((slotRows.results ?? []).map((s) => s.id))

  // An event with "can't" switched off stores yes/maybe only; anything else
  // is dropped rather than quietly recorded.
  const allowed: string[] = row.allow_no === 1 ? ["yes", "maybe", "no"] : ["yes", "maybe"]
  const votes = Object.entries(body.votes ?? {}).filter(
    ([slotId, value]) => validSlots.has(slotId) && allowed.includes(value as string),
  ) as [string, VoteValue][]

  const now = Date.now()
  const participantId = existing?.id ?? crypto.randomUUID()
  const editKey = existing?.edit_key ?? randomKey(24)

  const statements: D1PreparedStatement[] = []
  if (existing) {
    statements.push(
      c.env.DB.prepare(
        "UPDATE participants SET name = ?, comment = ?, vote_round = ?, updated_at = ? WHERE id = ?",
      ).bind(name, str(body.comment, 280), row.vote_round, now, participantId),
      // Only the dates on show are being re-answered; votes on removed or past
      // dates stay put.
      c.env.DB.prepare(
        "DELETE FROM votes WHERE participant_id = ? AND slot_id IN (SELECT id FROM slots WHERE event_id = ? AND hidden = 0 AND date >= ?)",
      ).bind(participantId, row.id, from),
    )
  } else {
    if (!tokenId && !memberId) {
      // Open events: names are the identity, so refuse a silent collision
      // rather than letting one person overwrite another's votes.
      const dupe = await c.env.DB.prepare(
        "SELECT id FROM participants WHERE event_id = ? AND lower(name) = lower(?)",
      )
        .bind(row.id, name)
        .first()
      if (dupe) {
        throw new HttpError(
          409,
          "Someone already signed up with that name. Use a different name, or reopen your original link to edit.",
        )
      }
    }
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO participants (id, event_id, name, comment, token_id, member_id, edit_key, vote_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        participantId,
        row.id,
        name,
        str(body.comment, 280),
        tokenId,
        memberId,
        editKey,
        row.vote_round,
        now,
        now,
      ),
    )
  }

  for (const [slotId, value] of votes) {
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO votes (participant_id, slot_id, value) VALUES (?, ?, ?)",
      ).bind(participantId, slotId, value),
    )
  }

  await c.env.DB.batch(statements)
  return c.json({ participantId, editKey })
})

/* ------------------------------------------------------------- owner-only */

async function requireEventOwner(c: {
  env: Bindings
  req: KeySource["req"]
}): Promise<{ row: EventRow; group: GroupRow | null }> {
  const slug = (c.req.query("slug") ?? "").toLowerCase()
  const row = await getEventBySlug(c.env.DB, slug)
  const { owner, group } = await resolveEventOwner(c.env.DB, row, c)
  if (!owner) throw new HttpError(403, "That admin link isn't valid for this event.")
  return { row, group }
}

api.patch("/event", async (c) => {
  const { row, group } = await requireEventOwner(c)
  const body = await c.req.json<Partial<CreateEventBody>>().catch(() => null)
  if (!body) throw new HttpError(400, "Malformed request.")

  const sets: string[] = []
  const args: unknown[] = []

  if (typeof body.title === "string") {
    const t = str(body.title, 120)
    if (!t) throw new HttpError(400, "Give your event a title.")
    sets.push("title = ?")
    args.push(t)
  }
  if (typeof body.description === "string") {
    sets.push("description = ?")
    args.push(str(body.description, 2000))
  }
  if (
    body.accessMode === "open" ||
    body.accessMode === "token" ||
    body.accessMode === "group"
  ) {
    if (body.accessMode === "group" && !row.group_id) {
      throw new HttpError(400, "This event isn't part of a group.")
    }
    sets.push("access_mode = ?")
    args.push(body.accessMode)
  }
  if (body.minAttendees !== undefined) {
    sets.push("min_attendees = ?")
    args.push(normaliseQuorum(body.minAttendees))
  }
  if (body.maxAttendees !== undefined) {
    sets.push("max_attendees = ?")
    args.push(normaliseQuorum(body.maxAttendees))
  }
  const disablingNo = body.allowNo === false
  if (body.allowNo !== undefined) {
    sets.push("allow_no = ?")
    args.push(disablingNo ? 0 : 1)
  }
  if (typeof body.chatUrl === "string") {
    sets.push("chat_url = ?")
    args.push(cleanUrl(body.chatUrl))
  }
  if (body.countMaybe !== undefined) {
    sets.push("count_maybe = ?")
    args.push(body.countMaybe ? 1 : 0)
  }

  const statements: D1PreparedStatement[] = []

  // Switching mode carries the decision across: a locked date becomes the first
  // confirmed session, and going back to one-off drops the sessions (voting is
  // left open so the organiser can lock one).
  const mode = cleanMode(body.mode)
  if (mode && mode !== row.mode) {
    sets.push("mode = ?", "locked_slot_id = NULL", "closed = 0")
    args.push(mode)
    if (mode === "repeatable" && row.locked_slot_id) {
      statements.push(
        c.env.DB.prepare("UPDATE slots SET confirmed = 1 WHERE id = ?").bind(row.locked_slot_id),
      )
    }
    if (mode === "oneoff") {
      statements.push(
        c.env.DB.prepare("UPDATE slots SET confirmed = 0 WHERE event_id = ?").bind(row.id),
      )
    }
  }

  if (sets.length) {
    sets.push("updated_at = ?")
    args.push(Date.now(), row.id)
    statements.unshift(
      c.env.DB.prepare("UPDATE events SET " + sets.join(", ") + " WHERE id = ?").bind(
        ...args,
      ),
    )
  }

  // Withdrawing the option would otherwise strand answers nobody can change.
  if (disablingNo) {
    statements.push(
      c.env.DB.prepare(
        "DELETE FROM votes WHERE value = 'no' AND slot_id IN (SELECT id FROM slots WHERE event_id = ?)",
      ).bind(row.id),
    )
  }

  // Replacing the day/slot set: keep ids for slots that still exist so votes survive.
  // Dropped slots are hidden rather than deleted, and re-adding one brings its votes back.
  if (Array.isArray(body.slots)) {
    interface ExistingSlot {
      id: string
      date: string
      start_time: string | null
      end_time: string | null
    }
    const existing = await c.env.DB.prepare(
      "SELECT id, date, start_time, end_time FROM slots WHERE event_id = ?",
    )
      .bind(row.id)
      .all<ExistingSlot>()

    const keyOf = (d: string, s: string | null, e: string | null) =>
      d + "|" + (s ?? "") + "|" + (e ?? "")
    const byKey = new Map(
      (existing.results ?? []).map((s) => [keyOf(s.date, s.start_time, s.end_time), s.id]),
    )

    const seen2 = new Set<string>()
    const incoming = body.slots
      .slice(0, 200)
      .filter((s) => isValidDate(s?.date))
      .map((s) => ({
        date: s.date,
        startTime: cleanTime(s.startTime),
        endTime: cleanTime(s.endTime),
        label: str(s.label, 60) || null,
      }))
      .filter((s) => {
        const k = keyOf(s.date, s.startTime, s.endTime)
        if (seen2.has(k)) return false
        seen2.add(k)
        return true
      })
      .sort((a, b) =>
        a.date === b.date
          ? (a.startTime ?? "").localeCompare(b.startTime ?? "")
          : a.date.localeCompare(b.date),
      )

    if (incoming.length === 0) {
      throw new HttpError(400, "Keep at least one day on the calendar.")
    }

    const keep = new Set<string>()
    incoming.forEach((s, i) => {
      const id = byKey.get(keyOf(s.date, s.startTime, s.endTime))
      if (id) {
        keep.add(id)
        statements.push(
          c.env.DB.prepare("UPDATE slots SET label = ?, sort_order = ?, hidden = 0 WHERE id = ?").bind(
            s.label,
            i,
            id,
          ),
        )
      } else {
        statements.push(
          c.env.DB.prepare(
            "INSERT INTO slots (id, event_id, date, start_time, end_time, label, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ).bind(crypto.randomUUID(), row.id, s.date, s.startTime, s.endTime, s.label, i),
        )
      }
    })

    for (const s of existing.results ?? []) {
      if (!keep.has(s.id)) {
        statements.push(c.env.DB.prepare("UPDATE slots SET hidden = 1, confirmed = 0 WHERE id = ?").bind(s.id))
      }
    }
  }

  if (statements.length) await c.env.DB.batch(statements)

  const fresh = await getEventBySlug(c.env.DB, row.slug)
  return c.json(await buildEventView(c.env.DB, fresh, { owner: true, group }))
})

api.post("/event/lock", async (c) => {
  const { row, group } = await requireEventOwner(c)
  if (row.mode === "repeatable") {
    throw new HttpError(400, "Repeatable events confirm sessions rather than locking one date.")
  }
  const body = await c.req.json<{ slotId: string | null }>().catch(() => null)
  const slotId = body?.slotId ?? null

  if (slotId) {
    const belongs = await c.env.DB.prepare(
      "SELECT 1 FROM slots WHERE id = ? AND event_id = ? AND hidden = 0",
    )
      .bind(slotId, row.id)
      .first()
    if (!belongs) throw new HttpError(400, "That date isn't part of this event.")
  }

  await c.env.DB.prepare(
    "UPDATE events SET locked_slot_id = ?, closed = ?, updated_at = ? WHERE id = ?",
  )
    .bind(slotId, slotId ? 1 : 0, Date.now(), row.id)
    .run()

  const fresh = await getEventBySlug(c.env.DB, row.slug)
  return c.json(await buildEventView(c.env.DB, fresh, { owner: true, group }))
})

/** Repeatable events: confirm (or un-confirm) one session. Voting stays open. */
api.post("/event/sessions", async (c) => {
  const { row, group } = await requireEventOwner(c)
  if (row.mode !== "repeatable") {
    throw new HttpError(400, "Only repeatable events have sessions. Lock a date in instead.")
  }
  const body = await c.req
    .json<{ slotId: string; confirmed: boolean }>()
    .catch(() => null)
  if (!body || typeof body.slotId !== "string") throw new HttpError(400, "Malformed request.")

  const belongs = await c.env.DB.prepare(
    "SELECT 1 FROM slots WHERE id = ? AND event_id = ? AND hidden = 0 AND date >= ?",
  )
    .bind(body.slotId, row.id, openFrom(row))
    .first()
  if (!belongs) throw new HttpError(400, "That date isn't open on this event.")

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE slots SET confirmed = ? WHERE id = ?").bind(
      body.confirmed ? 1 : 0,
      body.slotId,
    ),
    c.env.DB.prepare("UPDATE events SET updated_at = ? WHERE id = ?").bind(Date.now(), row.id),
  ])

  const fresh = await getEventBySlug(c.env.DB, row.slug)
  return c.json(await buildEventView(c.env.DB, fresh, { owner: true, group }))
})

/**
 * Ask everyone to look at their answers again, on the same page. Answers are
 * kept and still count; each person shows as not re-confirmed until they save.
 * A one-off event is unlocked too, since nobody could re-vote otherwise.
 */
api.post("/event/recheck", async (c) => {
  const { row, group } = await requireEventOwner(c)
  await c.env.DB.prepare(
    "UPDATE events SET vote_round = vote_round + 1, locked_slot_id = NULL, closed = 0, updated_at = ? WHERE id = ?",
  )
    .bind(Date.now(), row.id)
    .run()

  const fresh = await getEventBySlug(c.env.DB, row.slug)
  return c.json(await buildEventView(c.env.DB, fresh, { owner: true, group }))
})

api.post("/event/tokens", async (c) => {
  const { row, group } = await requireEventOwner(c)
  const body = await c.req.json<{ labels?: string[]; count?: number }>().catch(() => null)

  const labels = splitNames(body?.labels, 100)
  const list = labels.length
    ? labels
    : Array.from({ length: Math.max(1, Math.min(50, body?.count ?? 1)) }, () => "")

  const now = Date.now()
  await c.env.DB.batch(
    list.map((label) =>
      c.env.DB.prepare(
        "INSERT INTO tokens (id, event_id, token, label, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), row.id, randomToken(), str(label, 60), now),
    ),
  )
  return c.json(await buildEventView(c.env.DB, row, { owner: true, group }))
})

api.delete("/event/tokens/:tokenId", async (c) => {
  const { row, group } = await requireEventOwner(c)
  await c.env.DB.prepare("UPDATE tokens SET revoked = 1 WHERE id = ? AND event_id = ?")
    .bind(c.req.param("tokenId"), row.id)
    .run()
  return c.json(await buildEventView(c.env.DB, row, { owner: true, group }))
})

api.delete("/event/participants/:participantId", async (c) => {
  const { row, group } = await requireEventOwner(c)
  await c.env.DB.prepare("DELETE FROM participants WHERE id = ? AND event_id = ?")
    .bind(c.req.param("participantId"), row.id)
    .run()
  return c.json(await buildEventView(c.env.DB, row, { owner: true, group }))
})

api.delete("/event", async (c) => {
  const { row } = await requireEventOwner(c)
  await c.env.DB.prepare("DELETE FROM events WHERE id = ?").bind(row.id).run()
  return c.json({ ok: true })
})

app.route("/api", api)

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status)
  }
  console.error("Unhandled error:", err)
  return c.json({ error: "Something went wrong on our end." }, 500)
})

app.notFound((c) => c.json({ error: "Not found." }, 404))

export default app
