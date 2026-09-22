// Exercises /api/event/calendar.ics: empty until a date is locked, then one
// VEVENT that follows the lock, honouring the event's timezone and access mode.
const BASE = process.argv[2] ?? "http://127.0.0.1:8788"
let pass = 0, fail = 0

function ok(cond, label, extra) {
  if (cond) { pass++; console.log("  PASS " + label) }
  else { fail++; console.log("  FAIL " + label + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")) }
}

async function call(method, path, { body, ownerKey } = {}) {
  const headers = {}
  if (body) headers["content-type"] = "application/json"
  if (ownerKey) headers["x-owner-key"] = ownerKey
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data, headers: res.headers, text }
}

/** Fetches the feed and unfolds continuation lines so values can be matched whole. */
async function feed(slug, extra = "") {
  const res = await fetch(`${BASE}/api/event/calendar.ics?slug=${encodeURIComponent(slug)}${extra}`)
  const text = await res.text()
  return { status: res.status, headers: res.headers, raw: text, ics: text.replace(/\r\n[ \t]/g, "") }
}

const isoPlus = (days) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const compact = (iso) => iso.replace(/-/g, "")

const D1 = isoPlus(7), D2 = isoPlus(8), D3 = isoPlus(9)
const D3next = isoPlus(10)
const rand = () => Math.random().toString(36).slice(2, 7)

console.log("\n=== 1. open event in a fixed-offset zone (Asia/Tokyo, UTC+9) ===")
const slug = "cal" + rand()
let r = await call("POST", "/api/events", {
  body: {
    slug,
    title: "Games night, round 2; finals",
    description: "Bring snacks.",
    accessMode: "open",
    timezone: "Asia/Tokyo",
    slots: [
      { date: D1, startTime: "19:00", endTime: "22:00", label: "Late, night" },
      { date: D2 },
      { date: D3, startTime: "22:00", endTime: "01:00" },
      { date: D3, startTime: "19:00" },
    ],
  },
})
ok(r.status === 201, "created", r.data)
const ownerKey = r.data.ownerKey
let ev = (await call("GET", `/api/event?slug=${slug}`)).data.event
// Slots come back sorted by date and start time, so pick them by shape.
const timed = ev.slots.find((s) => s.date === D1)
const allDay = ev.slots.find((s) => s.date === D2)
const overnight = ev.slots.find((s) => s.date === D3 && s.startTime === "22:00")
const openEnded = ev.slots.find((s) => s.date === D3 && s.startTime === "19:00")

console.log("\n=== 2. before a lock the feed is a valid, empty calendar ===")
let f = await feed(slug)
ok(f.status === 200, "200")
ok((f.headers.get("content-type") || "").startsWith("text/calendar"), "text/calendar", f.headers.get("content-type"))
ok(f.headers.get("content-disposition") === `inline; filename="${slug}.ics"`, "inline disposition", f.headers.get("content-disposition"))
ok(f.ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0"), "starts with VCALENDAR")
ok(f.ics.includes("X-WR-CALNAME:Games night\\, round 2\\; finals · when"), "calendar name escaped", f.ics)
ok(!f.ics.includes("BEGIN:VEVENT"), "no VEVENT yet")
ok(f.raw.endsWith("END:VCALENDAR\r\n"), "CRLF terminated")

console.log("\n=== 3. two people say yes, organiser locks the timed slot ===")
for (const name of ["Ann, Lee", "Bob"]) {
  r = await call("POST", `/api/event/vote?slug=${slug}`, { body: { name, votes: { [timed.id]: "yes" } } })
  ok(r.status === 200, `vote ${name}`, r.data)
}
r = await call("POST", `/api/event/lock?slug=${slug}`, { ownerKey, body: { slotId: timed.id } })
ok(r.status === 200, "locked", r.data)

f = await feed(slug)
ok(f.ics.includes("BEGIN:VEVENT"), "VEVENT present")
ok(f.ics.includes(`DTSTART:${compact(D1)}T100000Z`), "19:00 JST -> 10:00Z", f.ics)
ok(f.ics.includes(`DTEND:${compact(D1)}T130000Z`), "22:00 JST -> 13:00Z", f.ics)
ok(f.ics.includes("SUMMARY:Games night\\, round 2\\; finals (Late\\, night)"), "summary carries label, escaped", f.ics)
ok(f.ics.includes("DESCRIPTION:Bring snacks.\\n\\nGoing: Ann\\, Lee\\, Bob\\n\\n"), "notes list who's going", f.ics)
// Under `wrangler dev` the request origin is the configured custom domain
// rather than 127.0.0.1, so only the path is pinned down.
const eventUrl = f.ics.match(/^URL:(.+)$/m)?.[1] ?? ""
ok(/^https?:\/\/[^/]+\//.test(eventUrl) && eventUrl.endsWith("/" + slug), "URL back to the event", eventUrl)
ok(f.ics.includes("STATUS:CONFIRMED"), "confirmed")
const uid = f.ics.match(/^UID:(.+)$/m)?.[1]
ok(uid && eventUrl && uid.endsWith("@" + new URL(eventUrl).hostname), "UID is scoped to the host", uid)
ok(f.raw.split("\r\n").every((l) => Buffer.byteLength(l) <= 75), "every line folded to 75 octets")

const again = await feed(slug)
ok(again.ics.match(/^UID:(.+)$/m)?.[1] === uid, "UID stable between fetches")

console.log("\n=== 4. download variant ===")
f = await feed(slug, "&download=1")
ok(f.headers.get("content-disposition") === `attachment; filename="${slug}.ics"`, "attachment disposition", f.headers.get("content-disposition"))
ok(f.ics.includes("BEGIN:VEVENT"), "same content")

console.log("\n=== 5. all-day, overnight and open-ended slots ===")
r = await call("POST", `/api/event/lock?slug=${slug}`, { ownerKey, body: { slotId: allDay.id } })
f = await feed(slug)
ok(f.ics.includes(`DTSTART;VALUE=DATE:${compact(D2)}`), "all-day DTSTART", f.ics)
ok(f.ics.includes(`DTEND;VALUE=DATE:${compact(D3)}`), "all-day DTEND is the next day", f.ics)
ok(f.ics.includes("SUMMARY:Games night\\, round 2\\; finals\r\n"), "no label, plain title", f.ics)
ok(f.ics.includes("DESCRIPTION:Bring snacks.\\n\\n" + eventUrl), "nobody going: notes skip the list", f.ics)

r = await call("POST", `/api/event/lock?slug=${slug}`, { ownerKey, body: { slotId: overnight.id } })
f = await feed(slug)
ok(f.ics.includes(`DTSTART:${compact(D3)}T130000Z`), "22:00 JST -> 13:00Z", f.ics)
ok(f.ics.includes(`DTEND:${compact(D3)}T160000Z`), "01:00 JST next day -> 16:00Z", f.ics)

r = await call("POST", `/api/event/lock?slug=${slug}`, { ownerKey, body: { slotId: openEnded.id } })
f = await feed(slug)
ok(f.ics.includes(`DTSTART:${compact(D3)}T100000Z`), "open-ended start", f.ics)
ok(f.ics.includes(`DTEND:${compact(D3)}T120000Z`), "open-ended runs two hours", f.ics)

console.log("\n=== 6. unlocking empties the feed again ===")
r = await call("POST", `/api/event/lock?slug=${slug}`, { ownerKey, body: { slotId: null } })
f = await feed(slug)
ok(f.status === 200 && !f.ics.includes("BEGIN:VEVENT"), "no VEVENT after unlock")

console.log("\n=== 7. an unknown timezone falls back to floating local time ===")
const floatSlug = "cal" + rand()
r = await call("POST", "/api/events", {
  body: { slug: floatSlug, title: "Float", accessMode: "open", timezone: "Mars/Olympus", slots: [{ date: D1, startTime: "19:00", endTime: "21:00" }] },
})
ev = (await call("GET", `/api/event?slug=${floatSlug}`)).data.event
await call("POST", `/api/event/lock?slug=${floatSlug}`, { ownerKey: r.data.ownerKey, body: { slotId: ev.slots[0].id } })
f = await feed(floatSlug)
ok(f.ics.includes(`DTSTART:${compact(D1)}T190000\r\n`), "floating DTSTART, no Z", f.ics)
ok(f.ics.includes(`DTEND:${compact(D1)}T210000\r\n`), "floating DTEND", f.ics)
await call("DELETE", `/api/event?slug=${floatSlug}`, { ownerKey: r.data.ownerKey })

console.log("\n=== 7b. Europe/London honours daylight saving ===")
const dstSlug = "cal" + rand()
r = await call("POST", "/api/events", {
  body: {
    slug: dstSlug, title: "DST", accessMode: "open", timezone: "Europe/London",
    slots: [
      { date: "2027-07-10", startTime: "19:00", endTime: "21:00" },
      { date: "2027-01-10", startTime: "19:00", endTime: "21:00" },
    ],
  },
})
ev = (await call("GET", `/api/event?slug=${dstSlug}`)).data.event
const summer = ev.slots.find((s) => s.date === "2027-07-10")
const winter = ev.slots.find((s) => s.date === "2027-01-10")
await call("POST", `/api/event/lock?slug=${dstSlug}`, { ownerKey: r.data.ownerKey, body: { slotId: summer.id } })
f = await feed(dstSlug)
ok(f.ics.includes("DTSTART:20270710T180000Z"), "BST: 19:00 -> 18:00Z", f.ics)
await call("POST", `/api/event/lock?slug=${dstSlug}`, { ownerKey: r.data.ownerKey, body: { slotId: winter.id } })
f = await feed(dstSlug)
ok(f.ics.includes("DTSTART:20270110T190000Z"), "GMT: 19:00 -> 19:00Z", f.ics)
await call("DELETE", `/api/event?slug=${dstSlug}`, { ownerKey: r.data.ownerKey })

console.log("\n=== 8. a gated event needs its token on the feed too ===")
const gated = "cal" + rand()
r = await call("POST", "/api/events", {
  body: { slug: gated, title: "Gated", accessMode: "token", tokenLabels: ["Ann"], slots: [{ date: D1 }] },
})
ok(r.status === 201, "created gated", r.data)
const token = r.data.tokens[0].token
f = await feed(gated)
ok(f.status === 401, "no token -> 401", f.status)
f = await feed(gated, "&t=nope-nope-nope")
ok(f.status === 403, "bad token -> 403", f.status)
f = await feed(gated, "&t=" + encodeURIComponent(token))
ok(f.status === 200 && f.ics.includes("BEGIN:VCALENDAR"), "valid token -> feed", f.status)
f = await feed(gated, "&k=" + encodeURIComponent(r.data.ownerKey))
ok(f.status === 200, "owner key -> feed", f.status)
await call("DELETE", `/api/event?slug=${gated}`, { ownerKey: r.data.ownerKey })

console.log("\n=== 9. unknown event ===")
f = await feed("nope" + rand())
ok(f.status === 404, "404")

await call("DELETE", `/api/event?slug=${slug}`, { ownerKey })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
