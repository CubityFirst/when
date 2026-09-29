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

/** Fetches a page and pulls out the component embed, if any. */
async function page(path) {
  const res = await fetch(BASE + path, { headers: { "user-agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)" } })
  const html = await res.text()
  const m = html.match(/<script id="discord:component-embed" type="application\/json">([\s\S]*?)<\/script>/)
  const og = html.match(/<meta property="og:title" content="([^"]*)"/)
  return {
    status: res.status,
    html,
    card: m ? JSON.parse(m[1]) : null,
    ogTitle: og ? og[1] : null,
    text: m ? m[1] : "",
  }
}
const rnd = () => Math.random().toString(36).slice(2, 7)
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

console.log("\n=== discord link previews ===")
const g = "embed" + rnd()
let r = await call("POST", "/api/groups", {
  body: { slug: g, name: "Board <Games>", description: "Tuesdays & more", chatUrl: "https://discord.gg/abc123", memberNames: ["Ana", "Ben"] },
})
ok(r.status === 201, "group created")
const groupKey = r.data.groupKey
const memberToken = r.data.members[0].token

r = await call("POST", "/api/events", {
  groupKey,
  body: { groupSlug: g, title: "Open night", accessMode: "open", minAttendees: 2, slots: [{ date: iso(5), startTime: "19:00", endTime: "22:00" }, { date: iso(6) }] },
})
const open = r.data.slug
r = await call("GET", "/api/event?slug=" + enc(open))
const [first] = r.data.event.slots
for (const name of ["Ana", "Ben"]) {
  await call("POST", "/api/event/vote?slug=" + enc(open), { body: { name, votes: { [first.id]: "yes" } } })
}

r = await call("POST", "/api/events", {
  groupKey,
  body: { groupSlug: g, title: "Secret summit", accessMode: "group", slots: [{ date: iso(7) }] },
})
const gated = r.data.slug

console.log("\n--- open event ---")
let p = await page("/" + open)
ok(p.status === 200, "page loads")
ok(p.html.includes('<div id="root">'), "still the SPA shell")
ok(p.card?.component?.type === 17, "card has a container root", p.card)
ok(p.text.includes("Open night"), "card names the event")
ok(p.text.includes("2 in") && p.text.includes("2/2 needed"), "card shows the leading date's turnout")
ok(p.text.includes("discord.gg/abc123"), "card links the group chat")
ok(p.ogTitle === "Open night", "og:title set", p.ogTitle)
ok(/<title>Open night · when<\/title>/.test(p.html), "document title set")

console.log("\n--- locked event ---")
await call("POST", "/api/event/lock?slug=" + enc(open), { groupKey, body: { slotId: first.id } })
p = await page("/" + open)
ok(p.text.includes("It's on") && p.text.includes("19:00 – 22:00"), "card shows the locked date")
ok(p.text.includes("calendar.ics"), "card offers the calendar file")

console.log("\n--- gated event ---")
p = await page("/" + gated)
ok(!!p.card, "gated event still gets a card")
ok(!p.html.includes("Secret summit"), "title stays hidden without a token")
p = await page("/" + gated + "?t=" + memberToken)
ok(p.text.includes("Secret summit"), "a member token opens the card")
ok(p.text.includes("?t=" + memberToken), "vote button keeps the token")
p = await page("/" + gated + "?g=" + groupKey)
ok(!p.html.includes("Secret summit"), "owner keys don't open the card")
ok(!p.html.includes(groupKey), "owner key is never echoed into the page")

console.log("\n--- group ---")
p = await page("/" + g)
ok(p.text.includes("Board") && p.text.includes("2 members"), "group card names the group", p.text)
ok(p.ogTitle === "Board &lt;Games&gt;", "og:title is escaped", p.ogTitle)
ok(p.text.includes("Secret summit"), "group card lists its events, as the group page does")

console.log("\n--- other pages ---")
for (const path of ["/", "/new", "/demo", "/nothing-here-" + rnd()]) {
  p = await page(path)
  ok(p.status === 200 && !p.card && p.html.includes('<div id="root">'), `${path} serves the plain shell`)
}
const asset = await fetch(BASE + "/favicon.svg")
ok(asset.status === 200 && asset.headers.get("content-type")?.includes("svg"), "static assets untouched")

await call("DELETE", "/api/group?slug=" + enc(g), { groupKey })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
