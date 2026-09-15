import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns"

/** Local-time ISO date (YYYY-MM-DD). Never use toISOString() - that shifts to UTC. */
export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

export function fromISODate(iso: string): Date {
  return parseISO(iso)
}

/** Today, as a local ISO date string. */
export function todayISO(): string {
  return toISODate(new Date())
}

/** The month the app should open on: the one containing today. */
export function defaultMonth(): Date {
  return startOfMonth(new Date())
}

export { addMonths, startOfMonth, isSameMonth }

/**
 * Every occurrence of `weekday` (0 = Monday) from `from` for `weeks` weeks.
 * Used by the "every Tuesday" shortcuts, which deliberately run past the end
 * of the month on screen.
 */
export function weekdayRun(weekday: number, from: Date, weeks: number): string[] {
  const start = new Date(from)
  start.setHours(12, 0, 0, 0)
  // Step forward to the first matching weekday.
  while ((start.getDay() + 6) % 7 !== weekday) start.setDate(start.getDate() + 1)

  const out: string[] = []
  const cursor = new Date(start)
  for (let i = 0; i < weeks; i++) {
    out.push(toISODate(cursor))
    cursor.setDate(cursor.getDate() + 7)
  }
  return out
}

/**
 * Six weeks of days covering `month`, starting on Monday, so the grid never
 * reflows between months.
 */
export function monthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function monthLabel(month: Date): string {
  return format(month, "MMMM yyyy")
}

export function weekdayLabels(): string[] {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "EEEEE"))
}

/** Monday-first short names, e.g. "Mon". */
export function weekdayShortLabels(): string[] {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "EEE"))
}

/** Monday-first plural names, e.g. "Tuesdays". */
export function weekdayPlural(index: number): string {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 })
  return format(addDays(start, index), "EEEE") + "s"
}

export function formatDayLong(iso: string): string {
  return format(parseISO(iso), "EEEE d MMMM yyyy")
}

export function formatDayShort(iso: string): string {
  return format(parseISO(iso), "EEE d MMM")
}

export function formatDayNumber(d: Date): string {
  return format(d, "d")
}

/** "19:00 – 22:00", "from 19:00", or "All day". */
export function formatTimeRange(
  startTime?: string | null,
  endTime?: string | null,
): string {
  if (!startTime && !endTime) return "All day"
  if (startTime && endTime) return `${startTime} – ${endTime}`
  if (startTime) return `from ${startTime}`
  return `until ${endTime}`
}

export function isPastISO(iso: string): boolean {
  return iso < todayISO()
}

export function lastDayOfMonthISO(month: Date): string {
  return toISODate(endOfMonth(month))
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return format(new Date(ts), "d MMM")
}

export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"
  } catch {
    return "Europe/London"
  }
}
