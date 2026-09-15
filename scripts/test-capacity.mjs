const BASE = process.argv[2] ?? "http://127.0.0.1:8788"
const enc = encodeURIComponent
let pass = 0, fail = 0
const ok = (c, l, x) => { if (c) { pass++; console.log("  PASS " + l) } else { fail++; console.log("  FAIL " + l + (x !== undefined ? "  -> " + JSON.stringify(x) : "")) } }

async function call(method, path, { body, ownerKey } = {}) {
  const headers = {}
  if (body) headers["content-type"] = "application/json"
  if (ownerKey) headers["x-owner-key"] = ownerKey
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const t = await res.text()
  let d = null; try { d = t ? JSON.parse(t) : null } catch { d = t }
  return { status: res.status, data: d }
}
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

console.log("\n=== max players (cap) ===")
let r = await call("POST", "/api/events", {
  body: { title: "Capped", accessMode: "open", minAttendees: 2, maxAttendees: 3,
          slots: [{ date: iso(5) }, { date: iso(6) }] },
})
const slug = r.data.slug, key = r.data.ownerKey
r = await call("GET", "/api/event?slug=" + enc(slug))
ok(r.data.event.maxAttendees === 3, "cap stored", r.data.event.maxAttendees)
const s0 = r.data.event.slots[0].id, s1 = r.data.event.slots[1].id
let t = r.data.event.tallies.find((x) => x.slotId === s0)
ok(t.spotsLeft === 3 && t.full === false, "3 spots left initially", t.spotsLeft)

// Five people say yes to slot 0; three maybe on slot 1.
for (const n of ["A", "B", "C", "D", "E"]) {
  await call("POST", "/api/event/vote?slug=" + enc(slug), {
    body: { name: n, votes: { [s0]: "yes", [s1]: "maybe" } },
  })
}
r = await call("GET", "/api/event?slug=" + enc(slug))
t = r.data.event.tallies.find((x) => x.slotId === s0)
ok(t.yes === 5, "yes count is the true total", t.yes)
ok(t.full === true, "slot reports full")
ok(t.spotsLeft === 0, "no spots left", t.spotsLeft)
ok(t.yesNames.join(",") === "A,B,C", "first 3 to say yes hold the places", t.yesNames)
ok(t.yesNames.length === 3, "confirmed list capped at 3", t.yesNames)
ok(t.waitlistNames.join(",") === "D,E", "overflow waitlisted in join order", t.waitlistNames)

// The cap must ignore 'maybe' entirely.
t = r.data.event.tallies.find((x) => x.slotId === s1)
ok(t.maybe === 5 && t.yes === 0, "slot 1 is all maybes", { yes: t.yes, maybe: t.maybe })
ok(t.full === false, "maybes never fill the cap")
ok(t.spotsLeft === 3, "cap untouched by maybes", t.spotsLeft)

console.log("\n--- uncapped events ---")
r = await call("POST", "/api/events", {
  body: { title: "Uncapped", accessMode: "open", slots: [{ date: iso(5) }] },
})
const u = r.data.slug
r = await call("GET", "/api/event?slug=" + enc(u))
ok(r.data.event.maxAttendees === null, "no cap by default", r.data.event.maxAttendees)
const ut = r.data.event.tallies[0]
ok(ut.spotsLeft === null && ut.full === false, "spotsLeft null when uncapped", ut.spotsLeft)
ok(ut.waitlistNames.length === 0, "nobody waitlisted when uncapped")

console.log("\n--- editing the cap ---")
r = await call("PATCH", "/api/event?slug=" + enc(slug), { ownerKey: key, body: { maxAttendees: 10 } })
t = r.data.event.tallies.find((x) => x.slotId === s0)
ok(r.data.event.maxAttendees === 10, "cap raised")
ok(t.full === false && t.waitlistNames.length === 0, "waiting list clears when the cap rises")
ok(t.yesNames.length === 5, "everyone confirmed again", t.yesNames.length)
r = await call("PATCH", "/api/event?slug=" + enc(slug), { ownerKey: key, body: { maxAttendees: null } })
ok(r.data.event.maxAttendees === null, "cap removed with null")
r = await call("PATCH", "/api/event?slug=" + enc(slug), { ownerKey: key, body: { maxAttendees: 0 } })
ok(r.data.event.maxAttendees === null, "0 means uncapped")

console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`)
process.exit(fail ? 1 : 0)
