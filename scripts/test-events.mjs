const BASE = "http://127.0.0.1:8788"
const enc = (s) => encodeURIComponent(s)
let pass = 0, fail = 0

function ok(cond, label, extra) {
  if (cond) { pass++; console.log("  PASS " + label) }
  else { fail++; console.log("  FAIL " + label + (extra ? "  -> " + JSON.stringify(extra) : "")) }
}

async function call(method, path, { body, ownerKey } = {}) {
  const headers = {}
  if (body) headers["content-type"] = "application/json"
  if (ownerKey) headers["x-owner-key"] = ownerKey
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data }
}

const iso = (offsetDays) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

const D1 = iso(7), D2 = iso(8), D3 = iso(14)

console.log("\n=== 1. slug validation ===")
for (const [slug, shouldBeOk] of [
  ["free" + Math.random().toString(36).slice(2,7) + "/night", true],  // unclaimed prefix
  ["a" + Math.random().toString(36).slice(2,6) + "/b/c/d", true],
  ["a/b/c/d/e", false],
  ["api/thing", false],
  ["new", false],
  ["UPPER", true], // normalised to lowercase, not rejected
  ["has space", false],
  ["-lead", false],
]) {
  const r = await call("GET", "/api/slug-available?slug=" + encodeURIComponent(slug))
  ok(r.data.available === shouldBeOk, `slug "${slug}" available=${shouldBeOk}`, r.data)
}

console.log("\n=== 2. create open event (quorum 3, two slots on D1) ===")
const openSlug = "solo" + Math.random().toString(36).slice(2, 7)  // standalone: no group prefix
let r = await call("POST", "/api/events", {
  body: {
    slug: openSlug,
    title: "Blood on the Clocktower",
    description: "Need at least 3.",
    accessMode: "open",
    minAttendees: 3,
    countMaybe: false,
    slots: [
      { date: D1, startTime: "19:00", endTime: "22:00", label: "Early" },
      { date: D1, startTime: "20:00", endTime: null, label: "Late" },
      { date: D2, startTime: null, endTime: null, label: null },
      { date: D3, startTime: null, endTime: null, label: null },
    ],
  },
})
ok(r.status === 201, "created 201", r.data)
const ownerKey = r.data.ownerKey
ok(typeof ownerKey === "string" && ownerKey.length === 28, "owner key returned")

r = await call("GET", "/api/event?slug=" + enc(openSlug))
ok(r.status === 200, "public GET works without any key")
ok(r.data.event.slots.length === 4, "4 slots", r.data.event.slots.length)
ok(r.data.isOwner === false, "not owner without key")
ok(r.data.tokens === undefined, "tokens hidden from non-owner")
const slots = r.data.event.slots
const slotD1early = slots.find((s) => s.date === D1 && s.startTime === "19:00")
const slotD2 = slots.find((s) => s.date === D2)
ok(slotD2.startTime === null, "all-day slot has null start")

console.log("\n=== 3. duplicate slug rejected ===")
r = await call("POST", "/api/events", {
  body: { slug: openSlug, title: "x", accessMode: "open", minAttendees: 1, slots: [{ date: D1 }] },
})
ok(r.status === 409, "duplicate slug -> 409", r.status)

console.log("\n=== 4. owner recognised ===")
r = await call("GET", "/api/event?slug=" + enc(openSlug), { ownerKey })
ok(r.data.isOwner === true, "isOwner with correct key")
ok(Array.isArray(r.data.tokens), "tokens visible to owner")
r = await call("GET", "/api/event?slug=" + enc(openSlug), { ownerKey: "x".repeat(28) })
ok(r.data.isOwner === false, "wrong owner key rejected")

console.log("\n=== 5. voting + quorum ===")
const voters = [
  ["Alice", "yes"],
  ["Bob", "yes"],
  ["Cara", "yes"],
  ["Dan", "no"],
]
let aliceEditKey = null
for (const [name, value] of voters) {
  const votes = {}
  for (const s of slots) votes[s.id] = s.id === slotD1early.id ? value : "no"
  r = await call("POST", `/api/event/vote?slug=${enc(openSlug)}`, { body: { name, votes } })
  ok(r.status === 200, `${name} voted`, r.data)
  if (name === "Alice") aliceEditKey = r.data.editKey
}

r = await call("GET", "/api/event?slug=" + enc(openSlug))
let tally = r.data.event.tallies.find((t) => t.slotId === slotD1early.id)
ok(tally.yes === 3, "3 yes votes", tally)
ok(tally.no === 1, "1 no vote", tally)
ok(tally.meetsQuorum === true, "quorum met at 3/3")
const d2tally = r.data.event.tallies.find((t) => t.slotId === slotD2.id)
ok(d2tally.meetsQuorum === false, "other slot below quorum")
ok(tally.yesNames.sort().join(",") === "Alice,Bob,Cara", "yes names", tally.yesNames)

console.log("\n=== 6. duplicate name rejected, edit key updates ===")
r = await call("POST", `/api/event/vote?slug=${enc(openSlug)}`, {
  body: { name: "alice", votes: { [slotD1early.id]: "no" } },
})
ok(r.status === 409, "duplicate name (case-insensitive) -> 409", r.status)

r = await call("POST", `/api/event/vote?slug=${enc(openSlug)}`, {
  body: { name: "Alice", votes: { [slotD1early.id]: "no" }, editKey: aliceEditKey },
})
ok(r.status === 200, "edit with editKey works")
r = await call("GET", "/api/event?slug=" + enc(openSlug))
tally = r.data.event.tallies.find((t) => t.slotId === slotD1early.id)
ok(tally.yes === 2, "Alice flipped to no -> 2 yes", tally)
ok(tally.meetsQuorum === false, "quorum lost")
ok(r.data.event.participants.length === 4, "still 4 participants (no dupe)")

console.log("\n=== 7. vote for foreign slot ignored ===")
r = await call("POST", `/api/event/vote?slug=${enc(openSlug)}`, {
  body: { name: "Eve", votes: { "not-a-real-slot": "yes", [slotD2.id]: "yes" } },
})
ok(r.status === 200, "accepted")
r = await call("GET", "/api/event?slug=" + enc(openSlug))
const eve = r.data.event.participants.find((p) => p.name === "Eve")
ok(Object.keys(eve.votes).length === 1, "bogus slot dropped", eve.votes)

console.log("\n=== 8. lock in requires owner + quorum path ===")
r = await call("POST", `/api/event/lock?slug=${enc(openSlug)}`, { body: { slotId: slotD2.id } })
ok(r.status === 403, "lock without owner key -> 403", r.status)
r = await call("POST", `/api/event/lock?slug=${enc(openSlug)}`, {
  ownerKey,
  body: { slotId: "bogus" },
})
ok(r.status === 400, "lock foreign slot -> 400", r.status)
r = await call("POST", `/api/event/lock?slug=${enc(openSlug)}`, { ownerKey, body: { slotId: slotD2.id } })
ok(r.status === 200 && r.data.event.lockedSlotId === slotD2.id, "locked")
ok(r.data.event.closed === true, "event closed on lock")

r = await call("POST", `/api/event/vote?slug=${enc(openSlug)}`, {
  body: { name: "Frank", votes: { [slotD2.id]: "yes" } },
})
ok(r.status === 410, "voting closed -> 410", r.status)

r = await call("POST", `/api/event/lock?slug=${enc(openSlug)}`, { ownerKey, body: { slotId: null } })
ok(r.data.event.lockedSlotId === null && r.data.event.closed === false, "unlock reopens")

console.log("\n=== 9. token-gated event ===")
const tokSlug = "private" + Math.random().toString(36).slice(2, 7)  // standalone
r = await call("POST", "/api/events", {
  body: {
    slug: tokSlug,
    title: "Private night",
    accessMode: "token",
    minAttendees: 2,
    slots: [{ date: D1 }, { date: D2 }],
    tokenLabels: ["Alice", "Bob"],
  },
})
ok(r.status === 201, "created token event")
const tOwnerKey = r.data.ownerKey
const [tokA, tokB] = r.data.tokens
ok(/^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/.test(tokA.token), "token format", tokA.token)

r = await call("GET", "/api/event?slug=" + enc(tokSlug))
ok(r.status === 401, "no token -> 401", r.status)
r = await call("GET", "/api/event?slug=" + enc(tokSlug) + "&t=bad-bad-bad")
ok(r.status === 403, "bad token -> 403", r.status)
r = await call("GET", "/api/event?slug=" + enc(tokSlug) + "&t=" + tokA.token)
ok(r.status === 200, "valid token -> 200")
ok(r.data.tokenLabel === "Alice", "token label returned for prefill", r.data.tokenLabel)
r = await call("GET", "/api/event?slug=" + enc(tokSlug), { ownerKey: tOwnerKey })
ok(r.status === 200, "owner bypasses token gate")

const tSlots = r.data.event.slots
r = await call("POST", `/api/event/vote?slug=${enc(tokSlug)}`, {
  body: { name: "Alice", votes: { [tSlots[0].id]: "yes" } },
})
ok(r.status === 401, "vote without token -> 401", r.status)
r = await call("POST", `/api/event/vote?slug=${enc(tokSlug)}`, {
  body: { name: "Alice", votes: { [tSlots[0].id]: "yes" }, token: tokA.token },
})
ok(r.status === 200, "vote with token works")
r = await call("POST", `/api/event/vote?slug=${enc(tokSlug)}`, {
  body: { name: "Alice again", votes: { [tSlots[1].id]: "yes" }, token: tokA.token },
})
ok(r.status === 200, "same token re-votes (updates)")
r = await call("GET", "/api/event?slug=" + enc(tokSlug) + "&t=" + tokA.token)
ok(r.data.event.participants.length === 1, "token binds to one participant", r.data.event.participants.length)
ok(r.data.you !== null && r.data.you.name === "Alice again", "you resolved via token")

console.log("\n=== 10. revoke token ===")
r = await call("GET", "/api/event?slug=" + enc(tokSlug), { ownerKey: tOwnerKey })
const tokBRow = r.data.tokens.find((t) => t.token === tokB.token)
r = await call("DELETE", `/api/event/tokens/${tokBRow.id}?slug=${enc(tokSlug)}`, { ownerKey: tOwnerKey })
ok(r.status === 200, "revoked")
r = await call("GET", "/api/event?slug=" + enc(tokSlug) + "&t=" + tokB.token)
ok(r.status === 403, "revoked token -> 403", r.status)

console.log("\n=== 11. edit dates preserves votes ===")
r = await call("GET", "/api/event?slug=" + enc(tokSlug), { ownerKey: tOwnerKey })
const keepSlot = r.data.event.slots.find((s) => s.date === D2)
const beforeTally = r.data.event.tallies.find((t) => t.slotId === keepSlot.id)
ok(beforeTally.yes === 1, "D2 has 1 yes before edit", beforeTally)
const d1Slot = r.data.event.slots.find((s) => s.date === D1)
r = await call("POST", `/api/event/vote?slug=${enc(tokSlug)}`, {
  body: { name: "Alice again", votes: { [d1Slot.id]: "yes", [keepSlot.id]: "yes" }, token: tokA.token },
})
ok(r.status === 200, "Alice says yes to D1 too")

r = await call("PATCH", "/api/event?slug=" + enc(tokSlug), {
  ownerKey: tOwnerKey,
  body: { slots: [{ date: D2 }, { date: D3 }] },
})
ok(r.status === 200, "dates patched")
const keptAfter = r.data.event.slots.find((s) => s.date === D2)
ok(keptAfter.id === keepSlot.id, "kept slot id stable")
const afterTally = r.data.event.tallies.find((t) => t.slotId === keptAfter.id)
ok(afterTally.yes === 1, "vote survived the edit", afterTally)
ok(r.data.event.slots.length === 2, "D1 removed", r.data.event.slots.length)
ok(!r.data.event.tallies.some((t) => t.slotId === d1Slot.id), "D1 has no tally while removed")
ok(
  r.data.event.participants.every((p) => !(d1Slot.id in p.votes)),
  "D1 votes not surfaced while removed",
)
r = await call("POST", `/api/event/vote?slug=${enc(tokSlug)}`, {
  body: { name: "Alice again", votes: { [keepSlot.id]: "yes" }, token: tokA.token },
})
ok(r.status === 200, "re-vote while D1 is removed")

r = await call("PATCH", "/api/event?slug=" + enc(tokSlug), {
  ownerKey: tOwnerKey,
  body: { slots: [{ date: D1 }, { date: D2 }, { date: D3 }] },
})
const d1Back = r.data.event.slots.find((s) => s.date === D1)
ok(d1Back.id === d1Slot.id, "re-added D1 keeps its old id")
const d1BackTally = r.data.event.tallies.find((t) => t.slotId === d1Back.id)
ok(d1BackTally.yes === 1, "D1 vote restored on re-add", d1BackTally)

console.log("\n=== 12. patch settings + remove participant ===")
r = await call("PATCH", "/api/event?slug=" + enc(tokSlug), {
  ownerKey: tOwnerKey,
  body: { minAttendees: 5, countMaybe: true, title: "Renamed" },
})
ok(r.data.event.minAttendees === 5 && r.data.event.countMaybe === true, "settings patched")
ok(r.data.event.title === "Renamed", "title patched")

const pid = r.data.event.participants[0].id
r = await call("DELETE", `/api/event/participants/${pid}?slug=${enc(tokSlug)}`, { ownerKey: tOwnerKey })
ok(r.data.event.participants.length === 0, "participant removed")

console.log("\n=== 13. 404 + SPA fallback ===")
r = await call("GET", "/api/event?slug=does/not/exist")
ok(r.status === 404, "missing event -> 404", r.status)
// wrangler dev --local does not implement not_found_handling, so the SPA
// fallback can only be checked against a deployed Worker.
if (BASE.includes("127.0.0.1") || BASE.includes("localhost")) {
  console.log("  SKIP SPA fallback (not implemented by wrangler dev --local)")
} else {
  const spa = await fetch(BASE + "/some/event-path")
  const html = await spa.text()
  ok(spa.status === 200 && html.includes('<div id="root">'), "SPA served for event path", spa.status)
  const root = await fetch(BASE + "/")
  ok(root.status === 200, "root served")
}

console.log("\n=== 14. delete event frees the slug ===")
r = await call("DELETE", "/api/event?slug=" + enc(tokSlug), { ownerKey: tOwnerKey })
ok(r.status === 200, "deleted")
r = await call("GET", "/api/slug-available?slug=" + encodeURIComponent(tokSlug))
ok(r.data.available === true, "slug free again")

console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`)
process.exit(fail ? 1 : 0)
