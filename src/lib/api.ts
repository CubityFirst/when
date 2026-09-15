import type {
  CreateEventBody,
  CreateEventResponse,
  CreateGroupBody,
  CreateGroupResponse,
  EventViewResponse,
  GroupViewResponse,
  ResolveResponse,
  VoteBody,
  VoteResponse,
} from "@shared/types"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { ownerKey?: string | null; groupKey?: string | null } = {},
): Promise<T> {
  const { ownerKey, groupKey, ...rest } = init
  const headers = new Headers(rest.headers)
  if (rest.body) headers.set("content-type", "application/json")
  if (ownerKey) headers.set("x-owner-key", ownerKey)
  if (groupKey) headers.set("x-group-key", groupKey)

  const res = await fetch(path, { ...rest, headers })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`)
  }
  return data as T
}

/* ------------------------------------------------------------- local keys */

const OWNER_PREFIX = "when:owner:"
const GROUP_PREFIX = "when:group:"
const EDIT_PREFIX = "when:edit:"
const TOKEN_PREFIX = "when:token:"

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode - the URL still carries the key */
  }
}

export const keys = {
  owner: (slug: string) => read(OWNER_PREFIX + slug),
  setOwner: (slug: string, key: string) => write(OWNER_PREFIX + slug, key),
  group: (groupSlug: string) => read(GROUP_PREFIX + groupSlug),
  setGroup: (groupSlug: string, key: string) => write(GROUP_PREFIX + groupSlug, key),
  edit: (slug: string) => read(EDIT_PREFIX + slug),
  setEdit: (slug: string, key: string) => write(EDIT_PREFIX + slug, key),
  token: (slug: string) => read(TOKEN_PREFIX + slug),
  setToken: (slug: string, token: string) => write(TOKEN_PREFIX + slug, token),
}

/* ---------------------------------------------------------------- calls */

export function checkSlug(
  slug: string,
  opts: { kind?: "event" | "group"; groupKey?: string | null } = {},
) {
  const params = new URLSearchParams({ slug })
  if (opts.kind) params.set("kind", opts.kind)
  return request<{ available: boolean; reason: string | null }>(
    `/api/slug-available?${params.toString()}`,
    { groupKey: opts.groupKey },
  )
}

/** Single-segment links can be a group or a standalone event. */
export function resolveSlug(slug: string) {
  return request<ResolveResponse>(`/api/resolve?slug=${encodeURIComponent(slug)}`)
}

export function createEvent(body: CreateEventBody, groupKey?: string | null) {
  return request<CreateEventResponse>("/api/events", {
    method: "POST",
    groupKey,
    body: JSON.stringify(body),
  })
}

/* ----------------------------------------------------------------- groups */

export function createGroup(body: CreateGroupBody) {
  return request<CreateGroupResponse>("/api/groups", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function getGroup(
  slug: string,
  opts: { groupKey?: string | null; token?: string | null } = {},
) {
  const extra: Record<string, string> = {}
  if (opts.token) extra.t = opts.token
  return request<GroupViewResponse>(withSlug("/api/group", slug, extra), {
    groupKey: opts.groupKey,
  })
}

export function updateGroup(
  slug: string,
  groupKey: string,
  body: Partial<CreateGroupBody>,
) {
  return request<GroupViewResponse>(withSlug("/api/group", slug), {
    method: "PATCH",
    groupKey,
    body: JSON.stringify(body),
  })
}

export function addMembers(slug: string, groupKey: string, names: string[]) {
  return request<GroupViewResponse>(withSlug("/api/group/members", slug), {
    method: "POST",
    groupKey,
    body: JSON.stringify({ names }),
  })
}

export function removeMember(slug: string, groupKey: string, memberId: string) {
  return request<GroupViewResponse>(withSlug("/api/group/members/" + memberId, slug), {
    method: "DELETE",
    groupKey,
  })
}

export function deleteGroup(slug: string, groupKey: string) {
  return request<{ ok: true }>(withSlug("/api/group", slug), {
    method: "DELETE",
    groupKey,
  })
}

/**
 * Slugs contain slashes, so they ride along as a query parameter rather than
 * a path wildcard - otherwise `/tokens/:id` would be swallowed by the slug.
 */
function withSlug(path: string, slug: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ slug, ...extra })
  return `${path}?${params.toString()}`
}

export function getEvent(
  slug: string,
  opts: {
    ownerKey?: string | null
    groupKey?: string | null
    token?: string | null
    editKey?: string | null
  } = {},
) {
  const extra: Record<string, string> = {}
  if (opts.token) extra.t = opts.token
  if (opts.editKey) extra.e = opts.editKey
  return request<EventViewResponse>(withSlug("/api/event", slug, extra), {
    ownerKey: opts.ownerKey,
    groupKey: opts.groupKey,
  })
}

export function submitVote(slug: string, body: VoteBody) {
  return request<VoteResponse>(withSlug("/api/event/vote", slug), {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/** Either key can administer an event: its own, or its group's. */
export interface AdminKeys {
  ownerKey?: string | null
  groupKey?: string | null
}

export function updateEvent(
  slug: string,
  admin: AdminKeys,
  body: Partial<CreateEventBody>,
) {
  return request<EventViewResponse>(withSlug("/api/event", slug), {
    method: "PATCH",
    ...admin,
    body: JSON.stringify(body),
  })
}

export function lockSlot(slug: string, admin: AdminKeys, slotId: string | null) {
  return request<EventViewResponse>(withSlug("/api/event/lock", slug), {
    method: "POST",
    ...admin,
    body: JSON.stringify({ slotId }),
  })
}

export function createTokens(
  slug: string,
  admin: AdminKeys,
  payload: { labels?: string[]; count?: number },
) {
  return request<EventViewResponse>(withSlug("/api/event/tokens", slug), {
    method: "POST",
    ...admin,
    body: JSON.stringify(payload),
  })
}

export function revokeToken(slug: string, admin: AdminKeys, tokenId: string) {
  return request<EventViewResponse>(withSlug("/api/event/tokens/" + tokenId, slug), {
    method: "DELETE",
    ...admin,
  })
}

export function removeParticipant(
  slug: string,
  admin: AdminKeys,
  participantId: string,
) {
  return request<EventViewResponse>(
    withSlug("/api/event/participants/" + participantId, slug),
    { method: "DELETE", ...admin },
  )
}

export function deleteEvent(slug: string, admin: AdminKeys) {
  return request<{ ok: true }>(withSlug("/api/event", slug), {
    method: "DELETE",
    ...admin,
  })
}
