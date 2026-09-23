// One-off vs repeatable events, confirmed sessions, and asking everyone to
// re-check their answers without starting a new page.
const BASE = process.argv[2] ?? "http://127.0.0.1:8788"
const enc = (s) => encodeURIComponent(s)
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
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data, text }
}

const isoPlus = (days) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
// Far enough back that no timezone still calls it today.
const PAST = isoPlus(-3), D1 = isoPlus(7), D2 = isoPlus(8), D3 = isoPlus(9)
const rand = () => Math.random().toString(36).slice(2, 7)
const vevents = (ics) => (ics.match(/BEGIN:VEVENT/g) ?? []).length

console.log("\n=== 1. repeatable event hides past days ===")
const rSlug = "rep" + rand()
let r = await call("POST", "/api/events", {
  body: {
    slug: rSlug,
    title: "Weekly board games",
    accessMode: "open",
    mode: "repeatable",
    slots: [{ date: PAST }, { date: D1 }, { date: D2 }, { date: D3 }],
  },
})
ok(r.status === 201, "created", r.data)
const rKey = r.data.ownerKey
r = await call("GET", "/api/event?slug=" + enc(rSlug))
let ev = r.data.event
ok(ev.mode === "repeatable", "mode is repeatable", ev.mode)
ok(ev.slots.length === 3 && !ev.slots.some((s) => s.date === PAST), "past day not offered", ev.slots)
ok(Array.isArray(ev.confirmedSlotIds) && ev.confirmedSlotIds.length === 0, "no sessions yet")
const [s1, s2, s3] = ev.slots

console.log("\n=== 2. voting, and locking is refused ===")
r = await call("POST", `/api/event/vote?slug=${enc(rSlug)}`, {
  body: { name: "Alice", votes: { [s1.id]: "yes", [s2.id]: "yes" } },
})
ok(r.status === 200, "Alice voted")
const aliceEdit = r.data.editKey
r = await call("POST", `/api/event/vote?slug=${enc(rSlug)}`, { body: { name: "Bob", votes: { [s1.id]: "yes" } } })
ok(r.status === 200, "Bob voted")
r = await call("POST", `/api/event/lock?slug=${enc(rSlug)}`, { ownerKey: rKey, body: { slotId: s1.id } })
ok(r.status === 400, "lock on a repeatable event -> 400", r.status)

console.log("\n=== 3. confirming sessions keeps voting open ===")
r = await call("POST", `/api/event/sessions?slug=${enc(rSlug)}`, { body: { slotId: s1.id, confirmed: true } })
ok(r.status === 403, "confirm without owner key -> 403", r.status)
r = await call("POST", `/api/event/sessions?slug=${enc(rSlug)}`, {
  ownerKey: rKey,
  body: { slotId: "bogus", confirmed: true },
})
ok(r.status === 400, "confirm a foreign slot -> 400", r.status)
r = await call("POST", `/api/event/sessions?slug=${enc(rSlug)}`, {
  ownerKey: rKey,
  body: { slotId: s1.id, confirmed: true },
})
ok(r.status === 200, "confirmed D1")
r = await call("POST", `/api/event/sessions?slug=${enc(rSlug)}`, {
  ownerKey: rKey,
  body: { slotId: s2.id, confirmed: true },
})
ev = r.data.event
ok(ev.confirmedSlotIds.join() === [s1.id, s2.id].join(), "two sessions, earliest first", ev.confirmedSlotIds)
ok(ev.closed === false && ev.lockedSlotId === null, "still open")
r = await call("POST", `/api/event/vote?slug=${enc(rSlug)}`, { body: { name: "Cara", votes: { [s3.id]: "yes" } } })
ok(r.status === 200, "voting still works after confirming", r.status)

let feed = await call("GET", `/api/event/calendar.ics?slug=${enc(rSlug)}`)
ok(vevents(feed.text) === 2, "feed has one entry per session", vevents(feed.text))
const uids = [...feed.text.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim())
ok(uids.length === 2 && uids[0] !== uids[1], "each session has its own UID", uids)
ok(feed.text.replace(/\r\n[ \t]/g, "").includes("Going: Alice\\, Bob"), "D1 entry lists who's going")

r = await call("POST", `/api/event/sessions?slug=${enc(rSlug)}`, {
  ownerKey: rKey,
  body: { slotId: s2.id, confirmed: false },
})
ok(r.data.event.confirmedSlotIds.join() === s1.id, "unconfirmed D2", r.data.event.confirmedSlotIds)
feed = await call("GET", `/api/event/calendar.ics?slug=${enc(rSlug)}`)
ok(vevents(feed.text) === 1, "feed drops the unconfirmed session", vevents(feed.text))

console.log("\n=== 4. asking everyone to re-check ===")
r = await call("POST", `/api/event/recheck?slug=${enc(rSlug)}`, {})
ok(r.status === 403, "re-check without owner key -> 403", r.status)
r = await call("POST", `/api/event/recheck?slug=${enc(rSlug)}`, { ownerKey: rKey })
ok(r.status === 200, "re-check requested")
ev = r.data.event
ok(ev.participants.every((p) => p.needsRecheck), "everyone flagged", ev.participants.map((p) => p.needsRecheck))
ok(ev.confirmedSlotIds.join() === s1.id, "sessions survive a re-check")
const d1Tally = ev.tallies.find((t) => t.slotId === s1.id)
ok(d1Tally.yes === 2, "flagged answers still count", d1Tally)

r = await call("GET", `/api/event?slug=${enc(rSlug)}&e=${aliceEdit}`)
ok(r.data.you?.needsRecheck === true, "Alice sees she needs to re-check")
r = await call("POST", `/api/event/vote?slug=${enc(rSlug)}`, {
  body: { name: "Alice", votes: { [s1.id]: "yes" }, editKey: aliceEdit },
})
ok(r.status === 200, "Alice re-confirms")
r = await call("POST", `/api/event/vote?slug=${enc(rSlug)}`, { body: { name: "Dan", votes: { [s1.id]: "maybe" } } })
ev = (await call("GET", `/api/event?slug=${enc(rSlug)}`)).data.event
const flag = Object.fromEntries(ev.participants.map((p) => [p.name, p.needsRecheck]))
ok(flag.Alice === false && flag.Dan === false, "re-saved and new voters are current", flag)
ok(flag.Bob === true && flag.Cara === true, "the rest still flagged", flag)

console.log("\n=== 5. one-off: re-check releases the lock ===")
const oSlug = "one" + rand()
r = await call("POST", "/api/events", {
  body: { slug: oSlug, title: "Quiz", accessMode: "open", slots: [{ date: PAST }, { date: D1 }] },
})
const oKey = r.data.ownerKey
ev = (await call("GET", `/api/event?slug=${enc(oSlug)}`)).data.event
ok(ev.mode === "oneoff", "mode defaults to one-off", ev.mode)
ok(ev.slots.length === 2, "one-off keeps past days", ev.slots.length)
const oPast = ev.slots.find((s) => s.date === PAST)
const oD1 = ev.slots.find((s) => s.date === D1)
r = await call("POST", `/api/event/vote?slug=${enc(oSlug)}`, {
  body: { name: "Eve", votes: { [oPast.id]: "yes", [oD1.id]: "yes" } },
})
const eveEdit = r.data.editKey
r = await call("POST", `/api/event/sessions?slug=${enc(oSlug)}`, {
  ownerKey: oKey,
  body: { slotId: oD1.id, confirmed: true },
})
ok(r.status === 400, "sessions refused on a one-off event", r.status)
r = await call("POST", `/api/event/lock?slug=${enc(oSlug)}`, { ownerKey: oKey, body: { slotId: oD1.id } })
ok(r.data.event.lockedSlotId === oD1.id, "locked")
r = await call("POST", `/api/event/recheck?slug=${enc(oSlug)}`, { ownerKey: oKey })
ev = r.data.event
ok(ev.lockedSlotId === null && ev.closed === false, "re-check unlocks", ev)
ok(ev.participants[0].needsRecheck === true, "Eve flagged")
r = await call("POST", `/api/event/vote?slug=${enc(oSlug)}`, {
  body: { name: "Eve", votes: { [oPast.id]: "yes", [oD1.id]: "maybe" }, editKey: eveEdit },
})
ok(r.status === 200, "voting reopened")

console.log("\n=== 6. switching modes ===")
await call("POST", `/api/event/lock?slug=${enc(oSlug)}`, { ownerKey: oKey, body: { slotId: oD1.id } })
r = await call("PATCH", `/api/event?slug=${enc(oSlug)}`, { ownerKey: oKey, body: { mode: "repeatable" } })
ev = r.data.event
ok(ev.mode === "repeatable", "switched to repeatable")
ok(ev.lockedSlotId === null && !ev.closed, "lock released")
ok(ev.confirmedSlotIds.join() === oD1.id, "locked date became a session", ev.confirmedSlotIds)
ok(!ev.slots.some((s) => s.id === oPast.id), "past day dropped off")

r = await call("POST", `/api/event/vote?slug=${enc(oSlug)}`, {
  body: { name: "Eve", votes: { [oD1.id]: "yes" }, editKey: eveEdit },
})
ok(r.status === 200, "Eve re-votes on what's left")

r = await call("PATCH", `/api/event?slug=${enc(oSlug)}`, { ownerKey: oKey, body: { mode: "oneoff" } })
ev = r.data.event
ok(ev.mode === "oneoff" && ev.confirmedSlotIds.length === 0, "back to one-off, sessions cleared")
ok(ev.lockedSlotId === null && !ev.closed, "left open to lock again")
const eve = ev.participants.find((p) => p.name === "Eve")
ok(eve.votes[oPast.id] === "yes", "past-day vote kept through the round trip", eve.votes)
ok(eve.votes[oD1.id] === "yes", "new vote kept too", eve.votes)

console.log("\n=== 7. group summary ===")
const gSlug = "grp" + rand()
r = await call("POST", "/api/groups", { body: { slug: gSlug, name: "Club", memberNames: ["Ann"] } })
ok(r.status === 201, "group created", r.data)
const gKey = r.data.groupKey
r = await call("POST", "/api/events", {
  groupKey: gKey,
  body: {
    slug: gSlug + "/weekly",
    title: "Weekly",
    accessMode: "open",
    mode: "repeatable",
    slots: [{ date: PAST }, { date: D1 }, { date: D2 }],
  },
})
ok(r.status === 201, "repeatable group event created", r.data)
ev = (await call("GET", `/api/event?slug=${enc(gSlug + "/weekly")}`, { groupKey: gKey })).data.event
await call("POST", `/api/event/sessions?slug=${enc(gSlug + "/weekly")}`, {
  groupKey: gKey,
  body: { slotId: ev.slots.find((s) => s.date === D2).id, confirmed: true },
})
r = await call("GET", `/api/group?slug=${gSlug}`)
const summary = r.data.events[0]
ok(summary.mode === "repeatable", "summary carries the mode", summary)
ok(summary.lockedDate === D2, "summary shows the next session", summary.lockedDate)

// clean up
await call("DELETE", `/api/event?slug=${enc(rSlug)}`, { ownerKey: rKey })
await call("DELETE", `/api/event?slug=${enc(oSlug)}`, { ownerKey: oKey })
await call("DELETE", `/api/group?slug=${gSlug}`, { groupKey: gKey })

console.log(`\n================  ${pass} passed, ${fail} failed  ================`)
process.exit(fail ? 1 : 0)
