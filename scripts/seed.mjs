/**
 * Reseeds the public demo group with made-up people.
 *
 *   node scripts/seed.mjs [baseUrl]
 *
 * Old admin keys for the demo events are passed via OLD_KEYS (comma separated)
 * so the script can clear a previous run; missing keys are simply skipped.
 */
const BASE = process.argv[2] ?? "https://when.cubityfir.st"
const OLD_KEYS = (process.env.OLD_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
const enc = encodeURIComponent

async function call(method, path, { body, ownerKey, groupKey, quiet } = {}) {
  const headers = {}
  if (body) headers["content-type"] = "application/json"
  if (ownerKey) headers["x-owner-key"] = ownerKey
  if (groupKey) headers["x-group-key"] = groupKey
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok && !quiet) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`)
  }
  return { status: res.status, data }
}

/* ------------------------------------------------------------------ dates */

function nextWeekday(weekday, minDays = 1) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + minDays)
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1)
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function plusWeeks(iso, weeks) {
  const d = new Date(iso + "T12:00:00")
  d.setDate(d.getDate() + weeks * 7)
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const GROUP = "club"
const fri = nextWeekday(5, 3)
const sat = nextWeekday(6, 3)

/* ----------------------------------------------------------------- clean */

// Remove anything left from a previous seed so the script is re-runnable.
for (const key of OLD_KEYS) {
  for (const slug of ["club/games-night", "club/quiz-night"]) {
    await call("DELETE", `/api/event?slug=${enc(slug)}`, { ownerKey: key, groupKey: key, quiet: true })
  }
  await call("DELETE", `/api/group?slug=${GROUP}`, { groupKey: key, quiet: true })
}

const probe = await call("GET", `/api/group?slug=${GROUP}`, { quiet: true })
if (probe.status === 200) {
  console.log(`\n/${GROUP} already exists, pass OLD_KEYS=<groupKey> to reseed it.`)
  process.exit(1)
}

/* ----------------------------------------------------------------- group */

const MEMBERS = [
  "Priya", "Marcus", "Aoife", "Tom", "Rachel", "Dev",
  "Steph", "Callum", "Nadia", "Joe", "Bea", "Olu",
]

const created = await call("POST", "/api/groups", {
  body: {
    slug: GROUP,
    name: "The Thursday Club",
    description:
      "A demo group with made-up people, so you can see how this works. Members share one link across every event.",
    chatUrl: "https://discord.gg/example",
    memberNames: MEMBERS,
  },
})
const groupKey = created.data.groupKey
const tokenByName = new Map(created.data.members.map((m) => [m.name, m.token]))

console.log(`\nGroup /${GROUP}: ${MEMBERS.length} members`)
console.log(`  admin: ${BASE}/${GROUP}?g=${groupKey}`)

/* ---------------------------------------------------------------- events */

async function seedEvent({ slug, title, description, accessMode, minAttendees, maxAttendees, countMaybe, slots, votes }) {
  const res = await call("POST", "/api/events", {
    groupKey,
    body: { slug, groupSlug: GROUP, title, description, accessMode, minAttendees, maxAttendees, countMaybe, slots },
  })
  const evSlug = res.data.slug

  const view = await call("GET", `/api/event?slug=${enc(evSlug)}`, { groupKey })
  const ids = view.data.event.slots.map((s) => s.id)

  for (const [name, pattern] of votes) {
    const v = {}
    pattern.replace(/\s/g, "").split("").forEach((ch, i) => {
      if (!ids[i] || ch === ".") return
      v[ids[i]] = ch === "y" ? "yes" : ch === "m" ? "maybe" : "no"
    })
    await call("POST", `/api/event/vote?slug=${enc(evSlug)}`, {
      body: { name, token: tokenByName.get(name), votes: v },
    })
  }

  const final = await call("GET", `/api/event?slug=${enc(evSlug)}`, { groupKey })
  const ev = final.data.event
  const waiting = ev.roster.filter((m) => !m.replied).length
  console.log(`\n  /${evSlug}  "${title}"  (${accessMode})`)
  console.log(`    ${ev.participants.length} replied, ${waiting} awaited`)
  for (const s of ev.slots) {
    const t = ev.tallies.find((x) => x.slotId === s.id)
    const when = s.startTime ? `${s.date} ${s.startTime}` : `${s.date} all day`
    const target = ev.minAttendees === null ? "-" : `/${ev.minAttendees}`
    const cap = t.full ? "  FULL" : t.spotsLeft !== null ? `  ${t.spotsLeft} left` : ""
    console.log(
      `    ${when.padEnd(22)} ${String(t.score).padStart(2)}${target}` +
        `  y${t.yes} m${t.maybe} n${t.no}${t.meetsQuorum ? "   <-- quorum" : ""}${cap}`,
    )
  }
}

// Members-only, with a real turnout threshold: the headline demo.
await seedEvent({
  slug: "games-night",
  title: "Board games night",
  description:
    "We need 9 to make the big game viable, and the table only seats 10. A date turns green once it gets there, and anyone past the cap joins the waiting list.",
  accessMode: "group",
  minAttendees: 9,
  maxAttendees: 10,
  countMaybe: false,
  slots: [
    { date: fri, startTime: "19:00", endTime: "23:00", label: "Early start" },
    { date: fri, startTime: "20:30", endTime: null, label: "Late start" },
    { date: sat, startTime: null, endTime: null, label: null },
    { date: plusWeeks(fri, 1), startTime: "19:00", endTime: "23:00", label: "Early start" },
    { date: plusWeeks(fri, 1), startTime: "20:30", endTime: null, label: "Late start" },
    { date: plusWeeks(sat, 1), startTime: null, endTime: null, label: null },
  ],
  //                     f1e f1l sat f2e f2l s2   (Joe and Bea never reply)
  votes: [
    ["Priya",  "y m n y y n"],
    ["Marcus", "n n y y y n"],
    ["Aoife",  "y m m y y y"],
    ["Tom",    "y y n y m n"],
    ["Rachel", "n n n y y m"],
    ["Dev",    "y m n y n y"],
    ["Steph",  "y y n y y n"],
    ["Callum", "n m m y m n"],
    ["Nadia",  "y y n y y y"],
    ["Olu",    "n n n y m y"],
  ],
})

// Open to anyone, and no minimum: just find the most popular night.
await seedEvent({
  slug: "quiz-night",
  title: "Pub quiz",
  description: "Open to anyone with the link, and no minimum, we just want the best night.",
  accessMode: "open",
  minAttendees: null,
  countMaybe: false,
  slots: [
    { date: nextWeekday(2, 3), startTime: "19:30", endTime: null, label: null },
    { date: nextWeekday(3, 3), startTime: "19:30", endTime: null, label: null },
    { date: plusWeeks(nextWeekday(2, 3), 1), startTime: "19:30", endTime: null, label: null },
  ],
  votes: [
    ["Priya",  "y n y"],
    ["Marcus", "y m y"],
    ["Aoife",  "n y y"],
    ["Tom",    "y n m"],
    ["Rachel", "y y n"],
  ],
})

console.log("\nMember links (each works across every event in the group):")
for (const [name, token] of [...tokenByName].slice(0, 3)) {
  console.log(`  ${name.padEnd(8)} ${BASE}/${GROUP}?t=${token}`)
}
console.log(`  … and ${tokenByName.size - 3} more\n`)
