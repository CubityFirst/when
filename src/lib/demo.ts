/**
 * The /demo event: a stand-in for the worker that lives entirely in the
 * browser. The API client hands it every request for the demo slug, so the
 * real event page renders it unchanged, but nothing reaches the server and a
 * refresh starts over. It mirrors the worker's rules (and shares its tally
 * maths), so what a visitor sees is what a real event would do.
 */
import type {
  AccessMode,
  CreateEventBody,
  EventMode,
  EventPublic,
  EventToken,
  EventViewResponse,
  PublicParticipant,
  Slot,
  SlotInput,
  VoteBody,
  VoteValue,
} from "@shared/types"
import { tallySlots } from "@shared/tally"
import { guessTimezone, toISODate, todayISO } from "@/lib/dates"

export const DEMO_SLUG = "demo"
/** The organiser view is `/demo?k=demo`; the key means nothing anywhere else. */
export const DEMO_OWNER_KEY = "demo"

interface DemoSlot extends Slot {
  hidden: boolean
  confirmed: boolean
}

interface DemoParticipant {
  id: string
  name: string
  comment: string
  votes: Record<string, VoteValue>
  tokenId: string | null
  editKey: string
  voteRound: number
  updatedAt: number
}

interface DemoState {
  title: string
  description: string
  accessMode: AccessMode
  minAttendees: number | null
  maxAttendees: number | null
  allowNo: boolean
  chatUrl: string
  countMaybe: boolean
  timezone: string
  mode: EventMode
  lockedSlotId: string | null
  closed: boolean
  voteRound: number
  createdAt: number
  slots: DemoSlot[]
  participants: DemoParticipant[]
  tokens: EventToken[]
}

/* ------------------------------------------------------------ seed data */

let counter = 0
const newId = (prefix: string) => `${prefix}-${++counter}`

function randomKey(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

const randomToken = () => [randomKey(3), randomKey(3), randomKey(3)].join("-")

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Answers per person, one letter per slot below: y(es), m(aybe), n(o), - (blank). */
const PEOPLE: [name: string, answers: string, comment: string, hoursAgo: number][] = [
  ["Priya", "ymyynyy-m", "", 50],
  ["Tom", "nyyymny-y", "Happy to host on the 6th if that works.", 44],
  ["Aisha", "yny-yymny", "", 30],
  ["Ben", "m-ynyyy-n", "", 26],
  ["Chloe", "yym-nyymy", "Late start is better for me.", 20],
  ["Marek", "n-yy-mnyy", "", 9],
  ["Sofia", "-ymyyn-yy", "", 3],
]

function seed(): DemoState {
  const slots: SlotInput[] = [
    { date: daysFromNow(2), startTime: "19:00", endTime: "22:00" },
    { date: daysFromNow(4), startTime: "19:00", endTime: "22:00" },
    { date: daysFromNow(6), startTime: "17:00", endTime: "20:00", label: "Early" },
    { date: daysFromNow(6), startTime: "20:00", endTime: "23:00", label: "Late" },
    { date: daysFromNow(9), startTime: "19:00", endTime: "22:00" },
    { date: daysFromNow(11) },
    { date: daysFromNow(13), startTime: "19:00", endTime: "22:00" },
    { date: daysFromNow(16), startTime: "19:00", endTime: "22:00" },
    { date: daysFromNow(18) },
  ]
  const demoSlots: DemoSlot[] = slots.map((s, i) => ({
    id: newId("slot"),
    date: s.date,
    startTime: s.startTime ?? null,
    endTime: s.endTime ?? null,
    label: s.label ?? null,
    sortOrder: i,
    hidden: false,
    confirmed: false,
  }))

  const now = Date.now()
  const letters: Record<string, VoteValue> = { y: "yes", m: "maybe", n: "no" }
  const participants: DemoParticipant[] = PEOPLE.map(([name, answers, comment, hoursAgo]) => {
    const votes: Record<string, VoteValue> = {}
    demoSlots.forEach((s, i) => {
      const v = letters[answers[i]]
      if (v) votes[s.id] = v
    })
    return {
      id: newId("person"),
      name,
      comment,
      votes,
      tokenId: null,
      editKey: randomKey(24),
      voteRound: 0,
      updatedAt: now - hoursAgo * 3600_000,
    }
  })

  return {
    title: "Board games night",
    description:
      "Bring a game if you've got one. We need at least four to make a proper night of it.",
    accessMode: "open",
    minAttendees: 4,
    maxAttendees: null,
    allowNo: true,
    chatUrl: "",
    countMaybe: false,
    timezone: guessTimezone(),
    mode: "oneoff",
    lockedSlotId: null,
    closed: false,
    voteRound: 0,
    createdAt: now - 3 * 86400_000,
    slots: demoSlots,
    participants,
    tokens: [],
  }
}

let state: DemoState | null = null
const current = () => (state ??= seed())

/* ---------------------------------------------------------------- rules */

class DemoError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Days still open for voting; a repeatable event rolls past days off. */
function openSlots(s: DemoState): DemoSlot[] {
  const from = s.mode === "repeatable" ? todayISO() : ""
  return s.slots
    .filter((slot) => !slot.hidden && slot.date >= from)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.sortOrder - b.sortOrder ||
        (a.startTime ?? "").localeCompare(b.startTime ?? ""),
    )
}

function view(
  s: DemoState,
  opts: { owner: boolean; token: string | null; editKey: string | null },
): EventViewResponse {
  const slots = openSlots(s)
  const open = new Set(slots.map((slot) => slot.id))

  const participants: PublicParticipant[] = s.participants.map((p) => ({
    id: p.id,
    name: p.name,
    comment: p.comment,
    votes: Object.fromEntries(Object.entries(p.votes).filter(([id]) => open.has(id))),
    needsRecheck: p.voteRound < s.voteRound,
    updatedAt: p.updatedAt,
  }))

  const event: EventPublic = {
    id: "demo",
    slug: DEMO_SLUG,
    title: s.title,
    description: s.description,
    accessMode: s.accessMode,
    minAttendees: s.minAttendees,
    maxAttendees: s.maxAttendees,
    allowNo: s.allowNo,
    chatUrl: s.chatUrl,
    countMaybe: s.countMaybe,
    timezone: s.timezone,
    mode: s.mode,
    lockedSlotId: s.mode === "oneoff" ? s.lockedSlotId : null,
    confirmedSlotIds:
      s.mode === "repeatable" ? slots.filter((slot) => slot.confirmed).map((slot) => slot.id) : [],
    closed: s.mode === "oneoff" && s.closed,
    createdAt: s.createdAt,
    slots: slots.map(({ hidden: _h, confirmed: _c, ...slot }) => slot),
    participants,
    tallies: tallySlots(slots, participants, {
      quorum: s.minAttendees,
      capacity: s.maxAttendees,
      countMaybe: s.countMaybe,
    }),
    group: null,
    roster: [],
  }

  let you: PublicParticipant | null = null
  let tokenLabel: string | null = null
  const tokenRow = opts.token
    ? s.tokens.find((t) => t.token === opts.token && !t.revoked)
    : undefined
  if (tokenRow) {
    tokenLabel = tokenRow.label || null
    const mine = s.participants.find((p) => p.tokenId === tokenRow.id)
    if (mine) you = participants.find((p) => p.id === mine.id) ?? null
  }
  if (!you && opts.editKey) {
    const mine = s.participants.find((p) => p.editKey === opts.editKey)
    if (mine) you = participants.find((p) => p.id === mine.id) ?? null
  }

  const res: EventViewResponse = { event, isOwner: opts.owner, you, tokenLabel }
  if (opts.owner) {
    res.tokens = s.tokens.map((t) => ({
      ...t,
      claimedBy: s.participants.find((p) => p.tokenId === t.id)?.name ?? null,
    }))
  }
  return res
}

function requireReader(s: DemoState, owner: boolean, token: string | null) {
  if (owner || s.accessMode !== "token") return
  if (!token) throw new DemoError(401, "This event needs an access token.")
  if (!s.tokens.some((t) => t.token === token && !t.revoked)) {
    throw new DemoError(403, "That access token isn't valid.")
  }
}

function requireOwner(owner: boolean) {
  if (!owner) throw new DemoError(403, "That admin link isn't valid for this event.")
}

const cleanTime = (v: unknown) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const limit = (v: unknown) => {
  const n = Math.floor(Number(v) || 0)
  return n > 0 ? Math.min(500, n) : null
}

function vote(s: DemoState, body: VoteBody) {
  if (s.mode === "oneoff" && (s.closed || s.lockedSlotId)) {
    throw new DemoError(410, "Voting has closed for this event.")
  }

  let tokenId: string | null = null
  if (s.accessMode === "token") {
    if (!body.token) throw new DemoError(401, "This event needs an access token.")
    const t = s.tokens.find((t) => t.token === body.token && !t.revoked)
    if (!t) throw new DemoError(403, "That access token isn't valid.")
    tokenId = t.id
  }

  const name = text(body.name, 60)
  if (!name) throw new DemoError(400, "Please enter your name.")

  let existing = tokenId
    ? s.participants.find((p) => p.tokenId === tokenId)
    : body.editKey
      ? s.participants.find((p) => p.editKey === body.editKey)
      : undefined

  if (!existing && !tokenId) {
    // Open events: names are the identity, so refuse a silent collision.
    if (s.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new DemoError(
        409,
        "Someone already signed up with that name. Use a different name, or reopen your original link to edit.",
      )
    }
  }

  const open = new Set(openSlots(s).map((slot) => slot.id))
  const allowed: VoteValue[] = s.allowNo ? ["yes", "maybe", "no"] : ["yes", "maybe"]
  const answers = Object.entries(body.votes ?? {}).filter(
    ([id, v]) => open.has(id) && allowed.includes(v),
  )

  if (!existing) {
    existing = {
      id: newId("person"),
      name,
      comment: "",
      votes: {},
      tokenId,
      editKey: randomKey(24),
      voteRound: s.voteRound,
      updatedAt: Date.now(),
    }
    s.participants.push(existing)
  }

  // Only the dates on show are being re-answered; the rest stay put.
  const kept = Object.entries(existing.votes).filter(([id]) => !open.has(id))
  existing.votes = Object.fromEntries([...kept, ...answers])
  existing.name = name
  existing.comment = text(body.comment, 280)
  existing.voteRound = s.voteRound
  existing.updatedAt = Date.now()

  return { participantId: existing.id, editKey: existing.editKey }
}

function patch(s: DemoState, body: Partial<CreateEventBody>) {
  if (typeof body.title === "string") {
    const t = text(body.title, 120)
    if (!t) throw new DemoError(400, "Give your event a title.")
    s.title = t
  }
  if (typeof body.description === "string") s.description = text(body.description, 2000)
  if (body.accessMode === "group") throw new DemoError(400, "This event isn't part of a group.")
  if (body.accessMode === "open" || body.accessMode === "token") s.accessMode = body.accessMode
  if (body.minAttendees !== undefined) s.minAttendees = limit(body.minAttendees)
  if (body.maxAttendees !== undefined) s.maxAttendees = limit(body.maxAttendees)
  if (body.allowNo !== undefined) {
    s.allowNo = body.allowNo !== false
    // Withdrawing the option would otherwise strand answers nobody can change.
    if (!s.allowNo) {
      for (const p of s.participants) {
        p.votes = Object.fromEntries(Object.entries(p.votes).filter(([, v]) => v !== "no"))
      }
    }
  }
  if (typeof body.chatUrl === "string") {
    try {
      const url = new URL(body.chatUrl.trim())
      s.chatUrl = url.protocol === "http:" || url.protocol === "https:" ? url.toString() : ""
    } catch {
      s.chatUrl = ""
    }
  }
  if (body.countMaybe !== undefined) s.countMaybe = !!body.countMaybe

  if ((body.mode === "oneoff" || body.mode === "repeatable") && body.mode !== s.mode) {
    if (body.mode === "repeatable" && s.lockedSlotId) {
      const locked = s.slots.find((slot) => slot.id === s.lockedSlotId)
      if (locked) locked.confirmed = true
    }
    if (body.mode === "oneoff") for (const slot of s.slots) slot.confirmed = false
    s.mode = body.mode
    s.lockedSlotId = null
    s.closed = false
  }

  if (Array.isArray(body.slots)) {
    const keyOf = (d: string, a: string | null, b: string | null) => `${d}|${a ?? ""}|${b ?? ""}`
    const seen = new Set<string>()
    const incoming = body.slots
      .filter((x) => typeof x?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.date))
      .map((x) => ({
        date: x.date,
        startTime: cleanTime(x.startTime),
        endTime: cleanTime(x.endTime),
        label: text(x.label, 60) || null,
      }))
      .filter((x) => {
        const k = keyOf(x.date, x.startTime, x.endTime)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .sort((a, b) =>
        a.date === b.date
          ? (a.startTime ?? "").localeCompare(b.startTime ?? "")
          : a.date.localeCompare(b.date),
      )
    if (incoming.length === 0) throw new DemoError(400, "Keep at least one day on the calendar.")

    // Dropped days are hidden rather than deleted, so re-adding one brings its votes back.
    const byKey = new Map(
      s.slots.map((slot) => [keyOf(slot.date, slot.startTime ?? null, slot.endTime ?? null), slot]),
    )
    const keep = new Set<DemoSlot>()
    incoming.forEach((x, i) => {
      const slot = byKey.get(keyOf(x.date, x.startTime, x.endTime))
      if (slot) {
        Object.assign(slot, { label: x.label, sortOrder: i, hidden: false })
        keep.add(slot)
      } else {
        const fresh: DemoSlot = {
          id: newId("slot"),
          ...x,
          sortOrder: i,
          hidden: false,
          confirmed: false,
        }
        s.slots.push(fresh)
        keep.add(fresh)
      }
    })
    for (const slot of s.slots) {
      if (!keep.has(slot)) {
        slot.hidden = true
        slot.confirmed = false
      }
    }
  }
}

/* -------------------------------------------------------------- routing */

/** Whether a request built by the API client is for the demo event. */
export function isDemoRequest(path: string): boolean {
  return new URL(path, "http://demo.invalid").searchParams.get("slug") === DEMO_SLUG
}

/** Answers one API request as the worker would, as `{ status, data }`. */
export function demoRequest(
  path: string,
  method: string,
  headers: Headers,
  body: string | null,
): { status: number; data: unknown } {
  const url = new URL(path, "http://demo.invalid")
  const route = url.pathname
  const s = current()
  const owner = headers.get("x-owner-key") === DEMO_OWNER_KEY
  const token = url.searchParams.get("t")
  const json = (body ? JSON.parse(body) : {}) as Record<string, unknown>

  try {
    if (method === "GET" && route === "/api/resolve") {
      return { status: 200, data: { type: "event", slug: DEMO_SLUG } }
    }
    if (method === "GET" && route === "/api/event") {
      requireReader(s, owner, token)
      return { status: 200, data: view(s, { owner, token, editKey: url.searchParams.get("e") }) }
    }
    if (method === "POST" && route === "/api/event/vote") {
      return { status: 200, data: vote(s, json as unknown as VoteBody) }
    }

    requireOwner(owner)
    const ownerView = () => ({ status: 200, data: view(s, { owner: true, token: null, editKey: null }) })

    if (method === "PATCH" && route === "/api/event") {
      patch(s, json as Partial<CreateEventBody>)
      return ownerView()
    }
    if (method === "POST" && route === "/api/event/lock") {
      if (s.mode === "repeatable") {
        throw new DemoError(400, "Repeatable events confirm sessions rather than locking one date.")
      }
      const slotId = (json.slotId as string | null) ?? null
      if (slotId && !s.slots.some((slot) => slot.id === slotId && !slot.hidden)) {
        throw new DemoError(400, "That date isn't part of this event.")
      }
      s.lockedSlotId = slotId
      s.closed = !!slotId
      return ownerView()
    }
    if (method === "POST" && route === "/api/event/sessions") {
      if (s.mode !== "repeatable") {
        throw new DemoError(400, "Only repeatable events have sessions. Lock a date in instead.")
      }
      const slot = openSlots(s).find((x) => x.id === json.slotId)
      if (!slot) throw new DemoError(400, "That date isn't open on this event.")
      slot.confirmed = !!json.confirmed
      return ownerView()
    }
    if (method === "POST" && route === "/api/event/recheck") {
      s.voteRound++
      s.lockedSlotId = null
      s.closed = false
      return ownerView()
    }
    if (method === "POST" && route === "/api/event/tokens") {
      const labels = Array.isArray(json.labels)
        ? json.labels.map((l) => text(l, 60)).filter(Boolean).slice(0, 100)
        : []
      const list = labels.length
        ? labels
        : Array.from({ length: Math.max(1, Math.min(50, Number(json.count) || 1)) }, () => "")
      for (const label of list) {
        s.tokens.push({
          id: newId("token"),
          token: randomToken(),
          label,
          revoked: false,
          claimedBy: null,
          createdAt: Date.now(),
        })
      }
      return ownerView()
    }
    const tokenMatch = route.match(/^\/api\/event\/tokens\/(.+)$/)
    if (method === "DELETE" && tokenMatch) {
      const t = s.tokens.find((x) => x.id === tokenMatch[1])
      if (t) t.revoked = true
      return ownerView()
    }
    const personMatch = route.match(/^\/api\/event\/participants\/(.+)$/)
    if (method === "DELETE" && personMatch) {
      s.participants = s.participants.filter((p) => p.id !== personMatch[1])
      return ownerView()
    }
    if (method === "DELETE" && route === "/api/event") {
      throw new DemoError(400, "The demo can't be deleted. Refresh the page to put it back how it started.")
    }
    throw new DemoError(404, "That isn't part of the demo.")
  } catch (err) {
    if (err instanceof DemoError) return { status: err.status, data: { error: err.message } }
    throw err
  }
}
