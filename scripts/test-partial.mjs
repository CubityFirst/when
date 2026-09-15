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

console.log("\n=== partial answers ===")
let r = await call("POST", "/api/events", {
  body: { title: "Partial", accessMode: "open",
          slots: [{ date: iso(4) }, { date: iso(5) }, { date: iso(6) }, { date: iso(7) }] },
})
const slug = r.data.slug
r = await call("GET", "/api/event?slug=" + enc(slug))
const ids = r.data.event.slots.map((s) => s.id)
ok(ids.length === 4, "4 dates offered")

// Answer only one of the four.
r = await call("POST", "/api/event/vote?slug=" + enc(slug), {
  body: { name: "Ada", votes: { [ids[0]]: "yes" } },
})
ok(r.status === 200, "saved with 1 of 4 marked", r.data)
const adaKey = r.data.editKey

r = await call("GET", "/api/event?slug=" + enc(slug))
let ada = r.data.event.participants.find((p) => p.name === "Ada")
ok(Object.keys(ada.votes).length === 1, "only the marked date is stored", ada.votes)
ok(r.data.event.tallies.filter((t) => t.yes === 1).length === 1, "one slot has a yes")
ok(r.data.event.tallies.filter((t) => t.yes + t.maybe + t.no === 0).length === 3,
   "unmarked dates stay empty, not counted as no")

// Two of four, mixed.
r = await call("POST", "/api/event/vote?slug=" + enc(slug), {
  body: { name: "Ada", editKey: adaKey, votes: { [ids[1]]: "maybe", [ids[3]]: "no" } },
})
ok(r.status === 200, "re-saved a different partial set")
r = await call("GET", "/api/event?slug=" + enc(slug))
ada = r.data.event.participants.find((p) => p.name === "Ada")
ok(Object.keys(ada.votes).length === 2, "previous answers replaced, not merged", ada.votes)
ok(!(ids[0] in ada.votes), "the first date is blank again")

console.log("\n=== reset / withdraw ===")
r = await call("POST", "/api/event/vote?slug=" + enc(slug), {
  body: { name: "Ada", editKey: adaKey, votes: {} },
})
ok(r.status === 200, "an existing reply can be cleared entirely", r.data)
r = await call("GET", "/api/event?slug=" + enc(slug))
ada = r.data.event.participants.find((p) => p.name === "Ada")
ok(ada && Object.keys(ada.votes).length === 0, "participant kept, votes gone", ada?.votes)
ok(r.data.event.tallies.every((t) => t.yes + t.maybe + t.no === 0), "all tallies back to zero")

console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`)
process.exit(fail ? 1 : 0)
