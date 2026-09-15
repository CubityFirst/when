const BASE = process.argv[2] ?? "http://127.0.0.1:8788"
const enc = encodeURIComponent
let pass = 0, fail = 0

function ok(cond, label, extra) {
  if (cond) { pass++; console.log("  PASS " + label) }
  else { fail++; console.log("  FAIL " + label + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")) }
}

async function call(method, path, { body, ownerKey, groupKey } = {}) {
  const headers = {}
  if (body) headers["content-type"] = "application/json"
  if (ownerKey) headers["x-owner-key"] = ownerKey
  if (groupKey) headers["x-group-key"] = groupKey
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data }
}

const iso = (n) => {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const D1 = iso(7), D2 = iso(8), D3 = iso(14)
const rnd = () => Math.random().toString(36).slice(2, 7)

let r

console.log("\n=== 1. explicit group creation ===")
const gSlug = "grp" + rnd()
r = await call("POST", "/api/groups", {
  body: { slug: gSlug, name: "Test Crew", description: "hi", memberNames: ["Alice", "Bob", "Cara"] },
})
ok(r.status === 201, "group created", r.data)
const gKey = r.data.groupKey
const [mAlice, mBob] = r.data.members
ok(r.data.members.length === 3, "3 members", r.data.members.length)
ok(/^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/.test(mAlice.token), "member token format", mAlice.token)

r = await call("GET", "/api/resolve?slug=" + enc(gSlug))
ok(r.data.type === "group", "resolves as group", r.data)

r = await call("GET", "/api/group?slug=" + enc(gSlug))
ok(r.status === 200 && r.data.isOwner === false, "public group view")
ok(r.data.members === undefined, "member tokens hidden from public", r.data.members)
ok(r.data.roster.length === 3, "public roster names only", r.data.roster)

r = await call("GET", "/api/group?slug=" + enc(gSlug), { groupKey: gKey })
ok(r.data.isOwner === true, "owner recognised")
ok(Array.isArray(r.data.members) && !!r.data.members[0].token, "owner sees tokens")

console.log("\n=== 2. namespace ownership ===")
r = await call("POST", "/api/events", {
  body: { slug: gSlug + "/night", title: "Night", accessMode: "group", slots: [{ date: D1 }] },
})
ok(r.status === 403, "event in someone else's group -> 403", r.status)

r = await call("POST", "/api/events", {
  groupKey: gKey,
  body: {
    slug: gSlug + "/night", title: "Games Night", accessMode: "group",
    minAttendees: 2, slots: [{ date: D1 }, { date: D2 }, { date: D3 }],
  },
})
ok(r.status === 201, "owner can create in the group", r.data)
ok(r.data.ownerKey === null, "no second key minted for group events", r.data.ownerKey)
ok(r.data.groupKey === null, "no new group claimed", r.data.groupKey)
const evSlug = r.data.slug

r = await call("GET", "/api/slug-available?slug=" + enc(gSlug + "/other"))
ok(r.data.available === false, "slug in foreign group not available", r.data)
r = await call("GET", "/api/slug-available?slug=" + enc(gSlug + "/other") + "&g=" + gKey)
ok(r.data.available === true, "available to the group owner", r.data)

console.log("\n=== 3. claim on first use ===")
const claimSlug = "claim" + rnd()
r = await call("POST", "/api/events", {
  body: { slug: claimSlug + "/first", title: "First", accessMode: "open", slots: [{ date: D1 }] },
})
ok(r.status === 201, "unclaimed prefix accepted")
ok(typeof r.data.groupKey === "string", "group key returned on claim", r.data.groupKey)
ok(r.data.groupSlug === claimSlug, "group slug reported", r.data.groupSlug)
const claimKey = r.data.groupKey
r = await call("GET", "/api/resolve?slug=" + enc(claimSlug))
ok(r.data.type === "group", "claimed prefix is now a group")
r = await call("POST", "/api/events", {
  body: { slug: claimSlug + "/second", title: "Second", accessMode: "open", slots: [{ date: D1 }] },
})
ok(r.status === 403, "prefix now locked to its owner", r.status)
r = await call("POST", "/api/events", {
  groupKey: claimKey,
  body: { slug: claimSlug + "/second", title: "Second", accessMode: "open", slots: [{ date: D1 }] },
})
ok(r.status === 201, "owner may add more")

console.log("\n=== 4. group key administers its events ===")
r = await call("GET", "/api/event?slug=" + enc(evSlug), { groupKey: gKey })
ok(r.data.isOwner === true, "group key grants event ownership")
r = await call("GET", "/api/event?slug=" + enc(evSlug), { groupKey: "x".repeat(28) })
ok(r.status === 401 || r.data?.isOwner === false, "wrong group key does not", r.status)

console.log("\n=== 5. group-gated access ===")
r = await call("GET", "/api/event?slug=" + enc(evSlug))
ok(r.status === 401, "no token -> 401", r.status)
r = await call("GET", "/api/event?slug=" + enc(evSlug) + "&t=bad-bad-bad")
ok(r.status === 403, "bad token -> 403", r.status)
r = await call("GET", "/api/event?slug=" + enc(evSlug) + "&t=" + mAlice.token)
ok(r.status === 200, "member token opens the event")
ok(r.data.tokenLabel === "Alice", "name prefilled from roster", r.data.tokenLabel)
ok(r.data.event.roster.length === 3, "roster present", r.data.event.roster.length)
ok(r.data.event.roster.every((m) => m.replied === false), "nobody replied yet")

const slots = r.data.event.slots
console.log("\n=== 6. member voting + roster tracking ===")
r = await call("POST", "/api/event/vote?slug=" + enc(evSlug), {
  body: { name: "Not Alice", token: mAlice.token, votes: { [slots[0].id]: "yes" } },
})
ok(r.status === 200, "member voted")
r = await call("GET", "/api/event?slug=" + enc(evSlug) + "&t=" + mAlice.token)
ok(r.data.event.participants[0].name === "Alice", "vote recorded under roster name, not supplied name",
   r.data.event.participants[0].name)
const aliceEntry = r.data.event.roster.find((m) => m.name === "Alice")
ok(aliceEntry.replied === true, "Alice shows as replied")
ok(r.data.event.roster.filter((m) => !m.replied).length === 2, "2 still awaited")
ok(r.data.you && r.data.you.name === "Alice", "you resolved via member token")

r = await call("POST", "/api/event/vote?slug=" + enc(evSlug), {
  body: { name: "Alice", token: mAlice.token, votes: { [slots[1].id]: "yes" } },
})
ok(r.status === 200, "member re-votes")
r = await call("GET", "/api/event?slug=" + enc(evSlug) + "&t=" + mAlice.token)
ok(r.data.event.participants.length === 1, "still one participant for that member",
   r.data.event.participants.length)

console.log("\n=== 7. member token works across every event in the group ===")
r = await call("POST", "/api/events", {
  groupKey: gKey,
  body: { groupSlug: gSlug, title: "Second event", accessMode: "group", slots: [{ date: D1 }] },
})
ok(r.status === 201, "second group event created (random slug)")
const ev2 = r.data.slug
ok(ev2.startsWith(gSlug + "/"), "random slug sits under the group", ev2)
r = await call("GET", "/api/event?slug=" + enc(ev2) + "&t=" + mBob.token)
ok(r.status === 200, "same member token opens a brand-new event")

r = await call("POST", "/api/events", {
  body: { title: "Orphan", accessMode: "group", slots: [{ date: D1 }] },
})
ok(r.status === 400, "members-only without a group -> 400, never downgraded to open", r.status)

console.log("\n=== 8. revoking a member ===")
r = await call("GET", "/api/group?slug=" + enc(gSlug), { groupKey: gKey })
const bobRow = r.data.members.find((m) => m.name === "Bob")
r = await call("DELETE", "/api/group/members/" + bobRow.id + "?slug=" + enc(gSlug), { groupKey: gKey })
ok(r.status === 200, "member revoked")
r = await call("GET", "/api/event?slug=" + enc(ev2) + "&t=" + mBob.token)
ok(r.status === 403, "revoked token locked out group-wide", r.status)
r = await call("GET", "/api/group?slug=" + enc(gSlug))
ok(r.data.roster.length === 2, "roster shrank", r.data.roster.length)

console.log("\n=== 9. random slugs ===")
r = await call("POST", "/api/events", {
  body: { title: "Standalone", accessMode: "open", slots: [{ date: D1 }] },
})
ok(r.status === 201, "event with no slug created")
const randSlug = r.data.slug
ok(/^[bcdfghjkmnpqrstvwxyz23456789]{7}$/.test(randSlug), "random slug shape", randSlug)
ok(!randSlug.includes("/"), "standalone, no group")
ok(typeof r.data.ownerKey === "string", "standalone gets its own key")
ok(r.data.groupKey === null, "no group claimed")
r = await call("GET", "/api/resolve?slug=" + enc(randSlug))
ok(r.data.type === "event", "resolves as event")

r = await call("POST", "/api/groups", { body: { name: "Nameless" } })
ok(r.status === 201 && /^[bcdfghjkmnpqrstvwxyz23456789]{7}$/.test(r.data.slug),
   "group with random slug", r.data.slug)

console.log("\n=== 10. optional quorum ===")
r = await call("POST", "/api/events", {
  body: { title: "No minimum", accessMode: "open", slots: [{ date: D1 }, { date: D2 }] },
})
const noqSlug = r.data.slug
const noqKey = r.data.ownerKey
r = await call("GET", "/api/event?slug=" + enc(noqSlug))
ok(r.data.event.minAttendees === null, "minAttendees null when omitted", r.data.event.minAttendees)
ok(r.data.event.tallies.every((t) => t.meetsQuorum === false), "no slot claims quorum")

const nq = r.data.event.slots
await call("POST", "/api/event/vote?slug=" + enc(noqSlug), {
  body: { name: "Zoe", votes: { [nq[0].id]: "yes" } },
})
r = await call("POST", "/api/event/lock?slug=" + enc(noqSlug), {
  ownerKey: noqKey, body: { slotId: nq[0].id },
})
ok(r.status === 200 && r.data.event.lockedSlotId === nq[0].id, "can lock without a threshold")

r = await call("POST", "/api/events", {
  body: { title: "Zero means none", accessMode: "open", minAttendees: 0, slots: [{ date: D1 }] },
})
r = await call("GET", "/api/event?slug=" + enc(r.data.slug))
ok(r.data.event.minAttendees === null, "0 normalises to null", r.data.event.minAttendees)

console.log("\n=== 11. patch quorum on and off ===")
r = await call("PATCH", "/api/event?slug=" + enc(evSlug), {
  groupKey: gKey, body: { minAttendees: 5 },
})
ok(r.data.event.minAttendees === 5, "threshold set", r.data.event.minAttendees)
r = await call("PATCH", "/api/event?slug=" + enc(evSlug), {
  groupKey: gKey, body: { minAttendees: null },
})
ok(r.data.event.minAttendees === null, "threshold cleared", r.data.event.minAttendees)

console.log("\n=== 12. group deletion cascades ===")
r = await call("DELETE", "/api/group?slug=" + enc(claimSlug), { groupKey: "nope".repeat(7) })
ok(r.status === 403, "delete needs the group key", r.status)
r = await call("DELETE", "/api/group?slug=" + enc(claimSlug), { groupKey: claimKey })
ok(r.status === 200, "group deleted")
r = await call("GET", "/api/event?slug=" + enc(claimSlug + "/first"))
ok(r.status === 404, "its events went too", r.status)
r = await call("GET", "/api/slug-available?slug=" + enc(claimSlug), )
ok(r.data.available === true, "prefix freed")

console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`)
process.exit(fail ? 1 : 0)
