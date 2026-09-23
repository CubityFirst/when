export type VoteValue = "yes" | "maybe" | "no"
export type AccessMode = "open" | "token" | "group"
/** One-off events lock a single date and close; repeatable ones stay open. */
export type EventMode = "oneoff" | "repeatable"

export interface GroupMember {
  id: string
  name: string
  /** Only sent to the group owner. */
  token?: string
  revoked: boolean
  createdAt: number
}

export interface GroupPublic {
  id: string
  slug: string
  name: string
  description: string
  /** Off-platform discussion link (Discord, Slack, WhatsApp…). "" when unset. */
  chatUrl: string
  memberCount: number
  createdAt: number
}

export interface GroupEventSummary {
  slug: string
  title: string
  minAttendees: number | null
  replied: number
  rosterSize: number
  bestScore: number
  bestDate: string | null
  mode: EventMode
  /** One-off: the locked date. Repeatable: the next confirmed session. */
  lockedDate: string | null
  closed: boolean
  createdAt: number
}

export interface GroupViewResponse {
  group: GroupPublic
  isOwner: boolean
  events: GroupEventSummary[]
  /** Owner-only: the full roster including each member's token. */
  members?: GroupMember[]
  /** Public roster - names only. */
  roster: { id: string; name: string }[]
  /** The member identified by the supplied token, if any. */
  you: { id: string; name: string } | null
}

export interface CreateGroupBody {
  /** Omit for a randomly generated one. */
  slug?: string
  name: string
  description?: string
  /** Must be an http(s) URL; anything else is discarded. */
  chatUrl?: string
  memberNames?: string[]
}

/** A friendly name for a chat link, derived from its host. */
export function chatServiceName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase()
    if (host.includes("discord")) return "Discord"
    if (host.includes("slack")) return "Slack"
    if (host.includes("whatsapp")) return "WhatsApp"
    if (host.includes("telegram") || host === "t.me") return "Telegram"
    if (host.includes("signal")) return "Signal"
    if (host.includes("matrix") || host.includes("element")) return "Matrix"
    if (host.includes("teams.microsoft")) return "Teams"
    if (host.includes("messenger") || host.includes("facebook")) return "Messenger"
    return host
  } catch {
    return "Chat"
  }
}

export interface CreateGroupResponse {
  slug: string
  groupKey: string
  members: GroupMember[]
}

export interface ResolveResponse {
  type: "group" | "event"
  slug: string
}

export interface SlotInput {
  date: string // YYYY-MM-DD
  startTime?: string | null // HH:MM
  endTime?: string | null // HH:MM
  label?: string | null
}

export interface Slot extends SlotInput {
  id: string
  sortOrder: number
}

export interface SlotTally {
  slotId: string
  yes: number
  maybe: number
  no: number
  score: number
  meetsQuorum: boolean
  /** Places left against the cap; null when there isn't one. */
  spotsLeft: number | null
  full: boolean
  /** In vote order, split at the cap. Everyone is in `yesNames` when uncapped. */
  yesNames: string[]
  waitlistNames: string[]
  maybeNames: string[]
  noNames: string[]
}

export interface PublicParticipant {
  id: string
  name: string
  comment: string
  votes: Record<string, VoteValue>
  /** The organiser asked everyone to re-check, and this person hasn't saved since. */
  needsRecheck: boolean
  updatedAt: number
}

export interface EventToken {
  id: string
  token: string
  label: string
  revoked: boolean
  claimedBy: string | null
  createdAt: number
}

export interface RosterEntry {
  id: string
  name: string
  replied: boolean
}

export interface EventPublic {
  id: string
  slug: string
  title: string
  description: string
  accessMode: AccessMode
  /** null means no attendance threshold. */
  minAttendees: number | null
  /** Capacity cap counted from 'in' votes only; null means unlimited. */
  maxAttendees: number | null
  /** When false, voters choose only yes or maybe, with no "can't" option. */
  allowNo: boolean
  /** This event's own discussion link. "" when it relies on its group's. */
  chatUrl: string
  countMaybe: boolean
  timezone: string
  mode: EventMode
  /** One-off only; repeatable events confirm sessions instead. */
  lockedSlotId: string | null
  /** Repeatable only: confirmed sessions still on the calendar, earliest first. */
  confirmedSlotIds: string[]
  closed: boolean
  createdAt: number
  slots: Slot[]
  participants: PublicParticipant[]
  tallies: SlotTally[]
  /** The owning group, when the event lives under one. */
  group: { slug: string; name: string; chatUrl: string } | null
  /** Group members and whether they've answered. Empty for standalone events. */
  roster: RosterEntry[]
}

export interface EventViewResponse {
  event: EventPublic
  isOwner: boolean
  /** Present only when isOwner */
  tokens?: EventToken[]
  /** The participant identified by the supplied token / edit key, if any */
  you: PublicParticipant | null
  /** Label attached to the supplied access token, used to prefill the name */
  tokenLabel?: string | null
}

export interface CreateEventBody {
  /** Omit for a randomly generated link. */
  slug?: string
  /** Create inside this group. Inferred from `slug` when it has 2+ segments. */
  groupSlug?: string
  title: string
  description?: string
  accessMode: AccessMode
  /** null or 0 means no attendance threshold. */
  minAttendees?: number | null
  /** null or 0 means no capacity cap. */
  maxAttendees?: number | null
  /** Defaults to true. When false, "no" answers are refused and cleared. */
  allowNo?: boolean
  /** Must be an http(s) URL; anything else is discarded. */
  chatUrl?: string
  countMaybe?: boolean
  timezone?: string
  /** Defaults to "oneoff". */
  mode?: EventMode
  slots: SlotInput[]
  tokenLabels?: string[]
}

export interface CreateEventResponse {
  slug: string
  /** Only for standalone events; group events are run from the group key. */
  ownerKey: string | null
  /** Returned when this call also claimed the group namespace. */
  groupKey: string | null
  groupSlug: string | null
  tokens: EventToken[]
}

export interface VoteBody {
  name: string
  comment?: string
  votes: Record<string, VoteValue>
  editKey?: string
  token?: string
}

export interface VoteResponse {
  participantId: string
  editKey: string
}

export interface ApiError {
  error: string
}

export const RESERVED_SLUGS = new Set([
  "api",
  "new",
  "group",
  "groups",
  "event",
  "events",
  "assets",
  "static",
  "favicon.ico",
  "robots.txt",
  "manifest.json",
  "about",
  "_",
])

export const SLUG_SEGMENT = /^[a-z0-9]+(?:[-][a-z0-9]+)*$/

/**
 * Validates an event slug such as `club/games-night` or a standalone `quiz-night`.
 * Returns null when valid.
 */
export function validateSlug(slug: string): string | null {
  if (!slug) return "Pick a link for your event."
  if (slug.length > 100) return "That link is too long (max 100 characters)."
  const segments = slug.split("/")
  if (segments.length > 4) return "Use at most 4 path segments."
  for (const s of segments) {
    if (!SLUG_SEGMENT.test(s)) {
      return "Use lowercase letters, numbers and hyphens, separated by /."
    }
  }
  if (RESERVED_SLUGS.has(segments[0])) {
    return `"${segments[0]}" is reserved, pick something else.`
  }
  return null
}

/** A group owns exactly one path segment. */
export function validateGroupSlug(slug: string): string | null {
  if (!slug) return "Pick a short name for the group."
  if (slug.length > 40) return "Group links are 40 characters at most."
  if (slug.includes("/")) return "A group is a single word, with no slashes."
  if (!SLUG_SEGMENT.test(slug)) {
    return "Use lowercase letters, numbers and hyphens."
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `"${slug}" is reserved, pick something else.`
  }
  return null
}

/** The group segment of an event slug, or null when the event is standalone. */
export function groupSlugOf(eventSlug: string): string | null {
  const parts = eventSlug.split("/")
  return parts.length > 1 ? parts[0] : null
}
