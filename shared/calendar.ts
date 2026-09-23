/**
 * iCalendar (RFC 5545) output for an event's locked-in date or confirmed
 * sessions, shared by the worker (which serves the feed) and the app (which
 * builds "add to calendar" links from the same slot). Nothing here touches the
 * network or the DOM.
 */

export interface CalendarSlot {
  date: string // YYYY-MM-DD
  startTime?: string | null // HH:MM
  endTime?: string | null // HH:MM
  label?: string | null
}

export interface CalendarEvent {
  /** Stable identity for the feed entry, so re-syncs update rather than duplicate. */
  uid: string
  title: string
  description: string
  /** IANA name; falls back to floating local time when it isn't recognised. */
  timezone: string
  /** Where the event lives, put in the URL property and appended to the notes. */
  url: string
  /** Bumped whenever the locked date changes, so clients replace the old entry. */
  sequence: number
  /** Names of the people who said yes to the locked slot. */
  going: string[]
}

/** A slot that starts but never says when it ends is shown as this long. */
export const DEFAULT_DURATION_MINUTES = 120

/* -------------------------------------------------------------- time maths */

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0")
}

function parseDate(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number)
  return [y, m, d]
}

function parseTime(hm: string): [number, number] {
  const [h, m] = hm.split(":").map(Number)
  return [h, m]
}

/**
 * The offset (in minutes east of UTC) that `zone` applies at the given instant.
 * Throws for a zone Intl doesn't know, which the caller treats as "floating".
 */
function offsetAt(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  )
  return Math.round((asUtc - at.getTime()) / 60000)
}

/**
 * Wall-clock `date` + `time` in `zone`, as a UTC instant. Returns null when the
 * zone is unknown so the caller can emit a floating time instead of a wrong one.
 */
export function zonedToUtc(date: string, time: string, zone: string): Date | null {
  const [y, mo, d] = parseDate(date)
  const [h, mi] = parseTime(time)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  try {
    // First guess assumes the offset at the wall time read as UTC, then
    // re-checks at the corrected instant so DST transitions land correctly.
    let guess = wall - offsetAt(zone, new Date(wall)) * 60000
    guess = wall - offsetAt(zone, new Date(guess)) * 60000
    return new Date(guess)
  } catch {
    return null
  }
}

/** A slot's start and end as wall-clock instants, filling in a missing end. */
export function slotBounds(slot: CalendarSlot): {
  allDay: boolean
  start: { date: string; time: string }
  end: { date: string; time: string }
} {
  if (!slot.startTime) {
    // No start means all day, even when an end time was given.
    const next = addDaysISO(slot.date, 1)
    return { allDay: true, start: { date: slot.date, time: "00:00" }, end: { date: next, time: "00:00" } }
  }
  const [sh, sm] = parseTime(slot.startTime)
  const startMinutes = sh * 60 + sm
  let endMinutes: number
  if (slot.endTime) {
    const [eh, em] = parseTime(slot.endTime)
    endMinutes = eh * 60 + em
    // 22:00 – 01:00 ends the next morning.
    if (endMinutes <= startMinutes) endMinutes += 24 * 60
  } else {
    endMinutes = startMinutes + DEFAULT_DURATION_MINUTES
  }
  const endDate = addDaysISO(slot.date, Math.floor(endMinutes / (24 * 60)))
  const endClock = endMinutes % (24 * 60)
  return {
    allDay: false,
    start: { date: slot.date, time: slot.startTime },
    end: { date: endDate, time: `${pad(Math.floor(endClock / 60))}:${pad(endClock % 60)}` },
  }
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = parseDate(iso)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/* ------------------------------------------------------------- formatting */

/** `20260921T190000Z` for a UTC instant. */
export function icsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/** `20260921T190000` for a wall-clock date + time (no zone). */
export function icsLocal(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`
}

/** `20260921` for an all-day date. */
export function icsDate(date: string): string {
  return date.replace(/-/g, "")
}

/** Escapes a TEXT value: backslashes, semicolons, commas and newlines. */
export function icsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/** Folds a content line at 75 octets, continuing with a single space. */
function fold(line: string): string[] {
  const out: string[] = []
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return [line]
  let chunk = ""
  let size = 0
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length
    const limit = out.length === 0 ? 75 : 74 // continuation lines start with a space
    if (size + len > limit) {
      out.push(out.length === 0 ? chunk : " " + chunk)
      chunk = ""
      size = 0
    }
    chunk += ch
    size += len
  }
  if (chunk) out.push(out.length === 0 ? chunk : " " + chunk)
  return out
}

/** The DTSTART/DTEND pair for a slot, zoned when possible and floating otherwise. */
export function slotDateLines(slot: CalendarSlot, zone: string): string[] {
  const b = slotBounds(slot)
  if (b.allDay) {
    return [`DTSTART;VALUE=DATE:${icsDate(b.start.date)}`, `DTEND;VALUE=DATE:${icsDate(b.end.date)}`]
  }
  const start = zonedToUtc(b.start.date, b.start.time, zone)
  const end = zonedToUtc(b.end.date, b.end.time, zone)
  if (start && end) return [`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`]
  return [`DTSTART:${icsLocal(b.start.date, b.start.time)}`, `DTEND:${icsLocal(b.end.date, b.end.time)}`]
}

/** The event's title with the slot label, e.g. "Games night (Late)". */
export function calendarSummary(title: string, slot: CalendarSlot | null): string {
  return slot?.label ? `${title} (${slot.label})` : title
}

/** The notes body: the description, who's going, and a link back. */
export function calendarNotes(ev: Pick<CalendarEvent, "description" | "going" | "url">): string {
  const parts: string[] = []
  if (ev.description.trim()) parts.push(ev.description.trim())
  if (ev.going.length) parts.push(`Going: ${ev.going.join(", ")}`)
  parts.push(ev.url)
  return parts.join("\n\n")
}

/**
 * A complete VCALENDAR with one VEVENT per entry. With no entries it is a
 * valid, empty calendar, which is what a subscriber sees until the organiser
 * locks a date in (or confirms a session); entries appear on their next
 * refresh, and vanish again if the date is unlocked.
 */
export function buildCalendar(
  entries: { ev: CalendarEvent; slot: CalendarSlot }[],
  opts: { name: string; now?: Date } = { name: "when" },
): string {
  const now = opts.now ?? new Date()
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//when//availability polling//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(opts.name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ]
  for (const { ev, slot } of entries) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${icsUtc(now)}`,
      `SEQUENCE:${Math.max(0, Math.floor(ev.sequence))}`,
      ...slotDateLines(slot, ev.timezone),
      `SUMMARY:${icsText(calendarSummary(ev.title, slot))}`,
      `DESCRIPTION:${icsText(calendarNotes(ev))}`,
      `URL:${ev.url}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")
  return lines.flatMap(fold).join("\r\n") + "\r\n"
}

/**
 * A Google Calendar "create event" link for a slot. Times are passed as wall
 * clock plus `ctz`, so Google does the zone maths itself.
 */
export function googleCalendarUrl(
  ev: Pick<CalendarEvent, "title" | "description" | "timezone" | "url" | "going">,
  slot: CalendarSlot,
): string {
  const b = slotBounds(slot)
  const dates = b.allDay
    ? `${icsDate(b.start.date)}/${icsDate(b.end.date)}`
    : `${icsLocal(b.start.date, b.start.time)}/${icsLocal(b.end.date, b.end.time)}`
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: calendarSummary(ev.title, slot),
    dates,
    details: calendarNotes(ev),
  })
  if (!b.allDay) params.set("ctz", ev.timezone)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
