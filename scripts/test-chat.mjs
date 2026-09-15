const BASE = process.argv[2] ?? "http://127.0.0.1:8788"
const enc = encodeURIComponent
let pass = 0, fail = 0
const ok = (c, l, x) => { if (c) { pass++; console.log("  PASS " + l) } else { fail++; console.log("  FAIL " + l + (x !== undefined ? "  -> " + JSON.stringify(x) : "")) } }

async function call(method, path, { body, groupKey, ownerKey } = {}) {
  const headers = {}
  if (body) headers["content-type"] = "application/json"
  if (groupKey) headers["x-group-key"] = groupKey
  if (ownerKey) headers["x-owner-key"] = ownerKey
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const t = await res.text()
  let d = null; try { d = t ? JSON.parse(t) : null } catch { d = t }
  return { status: res.status, data: d }
}
const rnd = () => Math.random().toString(36).slice(2, 7)
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

console.log("\n=== group chat link ===")
const g = "chat" + rnd()
let r = await call("POST", "/api/groups", {
  body: { slug: g, name: "Chatty", chatUrl: "https://discord.gg/abc123", memberNames: ["Ana"] },
})
ok(r.status === 201, "group created with chat url")
const key = r.data.groupKey
const memberToken = r.data.members[0].token

r = await call("GET", "/api/group?slug=" + enc(g))
ok(r.data.group.chatUrl === "https://discord.gg/abc123", "chat url public", r.data.group.chatUrl)

r = await call("POST", "/api/events", {
  groupKey: key,
  body: { groupSlug: g, title: "Night", accessMode: "group", slots: [{ date: iso(5) }] },
})
const ev = r.data.slug
r = await call("GET", "/api/event?slug=" + enc(ev) + "&t=" + memberToken)
ok(r.data.event.group.chatUrl === "https://discord.gg/abc123", "chat url surfaces on the event", r.data.event.group?.chatUrl)

console.log("\n--- dangerous schemes are discarded ---")
for (const bad of [
  "javascript:alert(document.cookie)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "not a url at all",
]) {
  const s2 = "bad" + rnd()
  const c = await call("POST", "/api/groups", { body: { slug: s2, name: "X", chatUrl: bad } })
  const v = await call("GET", "/api/group?slug=" + enc(s2))
  ok(v.data.group.chatUrl === "", "rejected: " + bad.slice(0, 32), v.data.group.chatUrl)
}

r = await call("PATCH", "/api/group?slug=" + enc(g), {
  groupKey: key, body: { chatUrl: "javascript:alert(1)" },
})
ok(r.data.group.chatUrl === "", "patch also sanitises", r.data.group.chatUrl)

r = await call("PATCH", "/api/group?slug=" + enc(g), {
  groupKey: key, body: { chatUrl: "https://slack.com/x" },
})
ok(r.data.group.chatUrl === "https://slack.com/x", "patch accepts https")
r = await call("PATCH", "/api/group?slug=" + enc(g), { groupKey: key, body: { chatUrl: "" } })
ok(r.data.group.chatUrl === "", "cleared by empty string")

// The block above deliberately cleared the group link; put one back so the
// fallback behaviour can be exercised.
await call("PATCH", "/api/group?slug=" + enc(g), {
  groupKey: key, body: { chatUrl: "https://slack.com/x" },
})

console.log("\n=== per-event chat links ===")

// A standalone event with no group in sight.
r = await call("POST", "/api/events", {
  body: { title: "Solo", accessMode: "open", chatUrl: "https://discord.gg/solo1",
          slots: [{ date: iso(5) }] },
})
const solo = r.data.slug, soloKey = r.data.ownerKey
r = await call("GET", "/api/event?slug=" + enc(solo))
ok(r.data.event.chatUrl === "https://discord.gg/solo1", "standalone event keeps its own link", r.data.event.chatUrl)
ok(r.data.event.group === null, "and has no group to inherit from")

// An event inside the group, with a link of its own.
r = await call("POST", "/api/events", {
  groupKey: key,
  body: { groupSlug: g, title: "Own thread", accessMode: "group",
          chatUrl: "https://discord.gg/thread9", slots: [{ date: iso(5) }] },
})
const threaded = r.data.slug
r = await call("GET", "/api/event?slug=" + enc(threaded) + "&t=" + memberToken)
ok(r.data.event.chatUrl === "https://discord.gg/thread9", "event link stored", r.data.event.chatUrl)
ok(r.data.event.group.chatUrl === "https://slack.com/x", "group link exposed separately", r.data.event.group.chatUrl)

// A group event with no link of its own still surfaces the group's.
r = await call("GET", "/api/event?slug=" + enc(ev) + "&t=" + memberToken)
ok(r.data.event.chatUrl === "", "no event link set", r.data.event.chatUrl)
ok(r.data.event.group.chatUrl !== "", "group link available as the fallback")

console.log("\n--- event links are sanitised too ---")
for (const bad of ["javascript:alert(1)", "data:text/html,x", "nonsense"]) {
  const c = await call("POST", "/api/events", {
    body: { title: "Bad", accessMode: "open", chatUrl: bad, slots: [{ date: iso(5) }] },
  })
  const v = await call("GET", "/api/event?slug=" + enc(c.data.slug))
  ok(v.data.event.chatUrl === "", "rejected: " + bad.slice(0, 26), v.data.event.chatUrl)
}

r = await call("PATCH", "/api/event?slug=" + enc(solo), {
  ownerKey: soloKey, body: { chatUrl: "javascript:alert(1)" },
})
ok(r.data.event.chatUrl === "", "patch sanitises the event link", r.data.event.chatUrl)
r = await call("PATCH", "/api/event?slug=" + enc(solo), {
  ownerKey: soloKey, body: { chatUrl: "https://discord.gg/updated" },
})
ok(r.data.event.chatUrl === "https://discord.gg/updated", "patch accepts https")
r = await call("PATCH", "/api/event?slug=" + enc(solo), { ownerKey: soloKey, body: { chatUrl: "" } })
ok(r.data.event.chatUrl === "", "cleared by empty string")

console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`)
process.exit(fail ? 1 : 0)
