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

console.log("\n=== \"can't\" enabled (the default) ===")
let r = await call("POST", "/api/events", {
  body: { title: "Default", accessMode: "open", slots: [{ date: iso(4) }, { date: iso(5) }] },
})
let slug = r.data.slug, key = r.data.ownerKey
r = await call("GET", "/api/event?slug=" + enc(slug))
ok(r.data.event.allowNo === true, "allowNo defaults to true", r.data.event.allowNo)
let ids = r.data.event.slots.map((s) => s.id)
r = await call("POST", "/api/event/vote?slug=" + enc(slug), {
  body: { name: "Ann", votes: { [ids[0]]: "no", [ids[1]]: "yes" } },
})
r = await call("GET", "/api/event?slug=" + enc(slug))
ok(r.data.event.tallies.find((t) => t.slotId === ids[0]).no === 1, "a no is recorded")

console.log("\n=== \"can't\" disabled at creation ===")
r = await call("POST", "/api/events", {
  body: { title: "Numbers only", accessMode: "open", allowNo: false,
          slots: [{ date: iso(4) }, { date: iso(5) }] },
})
const nSlug = r.data.slug
r = await call("GET", "/api/event?slug=" + enc(nSlug))
ok(r.data.event.allowNo === false, "allowNo stored as false", r.data.event.allowNo)
const nIds = r.data.event.slots.map((s) => s.id)

r = await call("POST", "/api/event/vote?slug=" + enc(nSlug), {
  body: { name: "Ben", votes: { [nIds[0]]: "no", [nIds[1]]: "maybe" } },
})
ok(r.status === 200, "vote accepted")
r = await call("GET", "/api/event?slug=" + enc(nSlug))
const ben = r.data.event.participants.find((p) => p.name === "Ben")
ok(!(nIds[0] in ben.votes), "the 'no' was dropped, not stored", ben.votes)
ok(ben.votes[nIds[1]] === "maybe", "the maybe survived", ben.votes)
ok(r.data.event.tallies.every((t) => t.no === 0), "no tallies are all zero")

console.log("\n=== toggling it off clears existing answers ===")
r = await call("GET", "/api/event?slug=" + enc(slug))
ok(r.data.event.tallies.find((t) => t.slotId === ids[0]).no === 1, "starts with one no")
r = await call("PATCH", "/api/event?slug=" + enc(slug), { ownerKey: key, body: { allowNo: false } })
ok(r.status === 200 && r.data.event.allowNo === false, "switched off")
ok(r.data.event.tallies.every((t) => t.no === 0), "stranded 'no' answers removed",
   r.data.event.tallies.map((t) => t.no))
ok(r.data.event.tallies.find((t) => t.slotId === ids[1]).yes === 1, "yes answers untouched")

console.log("\n=== switching it back on ===")
r = await call("PATCH", "/api/event?slug=" + enc(slug), { ownerKey: key, body: { allowNo: true } })
ok(r.data.event.allowNo === true, "switched back on")
r = await call("POST", "/api/event/vote?slug=" + enc(slug), {
  body: { name: "Cal", votes: { [ids[0]]: "no" } },
})
r = await call("GET", "/api/event?slug=" + enc(slug))
ok(r.data.event.tallies.find((t) => t.slotId === ids[0]).no === 1, "no answers accepted again")

console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`)
process.exit(fail ? 1 : 0)
