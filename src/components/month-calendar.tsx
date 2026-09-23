import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  addMonths,
  defaultMonth,
  formatDayNumber,
  isSameMonth,
  monthGrid,
  monthLabel,
  startOfMonth,
  todayISO,
  toISODate,
  weekdayLabels,
  weekdayPlural,
  weekdayRun,
  weekdayShortLabels,
} from "@/lib/dates"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type DayStatus = "yes" | "maybe" | "no" | "none"

export interface MonthCalendarProps {
  /**
   * Dates a person is allowed to interact with. When omitted every day is
   * live (owner picking days); when supplied everything else is greyed out.
   */
  enabledDates?: Set<string>
  /** Dates drawn as chosen - the owner's picked days. */
  selectedDates?: Set<string>
  /** Per-date vote status, used to tint cells on the voting screen. */
  statusByDate?: Record<string, DayStatus>
  /** Dates that have hit the attendance threshold. */
  quorumDates?: Set<string>
  /** Dates locked in as final: one for a one-off event, any number of sessions otherwise. */
  lockedDates?: Set<string>
  /** Dates carrying more than one time slot. */
  multiSlotDates?: Set<string>
  /** Plain click on an interactive day. */
  onDayClick?: (iso: string) => void
  /**
   * Shift-click on an interactive day. Receives every interactive date from
   * the previously clicked day through to this one, inclusive. When omitted,
   * shift-click falls back to `onDayClick`.
   */
  onRangeClick?: (isos: string[]) => void
  /**
   * Enables the "every Tuesday" chips. Receives the interactive dates of that
   * weekday in the visible month, plus whether they are already all selected.
   */
  onWeekdayToggle?: (isos: string[], allSelected: boolean) => void
  /** Block days before today. */
  disablePast?: boolean
  className?: string
  /** Controlled month; defaults to the month containing today. */
  month?: Date
  onMonthChange?: (month: Date) => void
  footer?: React.ReactNode
}

/**
 * Fill plus a texture, so the three answers stay distinguishable without
 * relying on being able to tell green from red.
 */
/**
 * Fill plus a texture, so the three answers stay distinguishable without
 * relying on being able to tell green from red. Text is pinned to white
 * rather than the theme foreground, because these sit on coloured fills.
 */
const STATUS_RING: Record<DayStatus, string> = {
  yes: "bg-success/30 text-white ring-1 ring-success/70 font-semibold",
  maybe: "bg-warning/20 text-white ring-1 ring-warning/70 vote-pattern-maybe",
  no: "bg-destructive/15 text-white ring-1 ring-destructive/60 vote-pattern-no",
  none: "",
}

export function MonthCalendar({
  enabledDates,
  selectedDates,
  statusByDate,
  quorumDates,
  lockedDates,
  multiSlotDates,
  onDayClick,
  onRangeClick,
  onWeekdayToggle,
  disablePast = true,
  className,
  month: monthProp,
  onMonthChange,
  footer,
}: MonthCalendarProps) {
  // Uncontrolled fallback opens on the month containing today.
  const [internalMonth, setInternalMonth] = React.useState(defaultMonth)
  const month = monthProp ?? internalMonth
  const setMonth = onMonthChange ?? setInternalMonth

  // Anchor for shift-click ranges: the last day clicked without shift.
  const anchorRef = React.useRef<string | null>(null)

  const days = React.useMemo(() => monthGrid(month), [month])
  const weekdays = React.useMemo(weekdayLabels, [])
  const weekdayNames = React.useMemo(weekdayShortLabels, [])
  const today = todayISO()

  const isInteractive = React.useCallback(
    (iso: string) => {
      if (disablePast && iso < today) return false
      return enabledDates ? enabledDates.has(iso) : true
    },
    [disablePast, today, enabledDates],
  )

  function handleClick(iso: string, shiftKey: boolean) {
    if (shiftKey && onRangeClick && anchorRef.current) {
      const [from, to] =
        anchorRef.current <= iso ? [anchorRef.current, iso] : [iso, anchorRef.current]

      // Walk the calendar day by day so the range covers dates outside the
      // visible month too.
      const range: string[] = []
      const cursor = new Date(from + "T12:00:00")
      const end = new Date(to + "T12:00:00")
      while (cursor <= end) {
        const cursorISO = toISODate(cursor)
        if (isInteractive(cursorISO)) range.push(cursorISO)
        cursor.setDate(cursor.getDate() + 1)
      }

      anchorRef.current = iso
      if (range.length) onRangeClick(range)
      return
    }

    anchorRef.current = iso
    onDayClick?.(iso)
  }

  return (
    <div className={cn("w-full max-w-[22rem] select-none", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{monthLabel(month)}</h3>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMonth(startOfMonth(new Date()))}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((w, i) => (
          <div
            key={i}
            className="text-muted-foreground pb-1 text-center text-xs font-medium tracking-wide uppercase"
          >
            {w}
          </div>
        ))}

        {days.map((day) => {
          const iso = toISODate(day)
          const outside = !isSameMonth(day, month)
          const isToday = iso === today
          const past = disablePast && iso < today
          const available = enabledDates ? enabledDates.has(iso) : !past
          const selected = selectedDates?.has(iso) ?? false
          const status = statusByDate?.[iso] ?? "none"
          const quorum = quorumDates?.has(iso) ?? false
          const locked = lockedDates?.has(iso) ?? false
          const interactive = isInteractive(iso) && !!onDayClick

          return (
            <button
              key={iso}
              type="button"
              disabled={!interactive}
              onClick={(e) => interactive && handleClick(iso, e.shiftKey)}
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-md text-base font-medium transition-all outline-none",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                outside && "opacity-35",
                // Unavailable: greyed out, clearly not a target.
                !available &&
                  "text-muted-foreground/45 cursor-not-allowed line-through decoration-1",
                available && !interactive && "text-foreground/80 cursor-default",
                interactive && "cursor-pointer hover:bg-accent",
                // Available but unvoted still reads as "open".
                available && status === "none" && !selected && "bg-accent/40 font-medium",
                status !== "none" && STATUS_RING[status],
                // Patterned fills are busy, so lift the numeral off them.
                (status !== "none" || selected) && "day-number",
                // White on the violet fill, lifted by the same shadow, rather
                // than the near-black primary foreground.
                selected && "bg-primary text-white font-semibold hover:bg-primary/90",
                locked && "ring-2 ring-success ring-offset-2 ring-offset-background",
              )}
            >
              {formatDayNumber(day)}

              {isToday && (
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-1 mx-auto h-1 w-1 rounded-full",
                    selected ? "bg-white" : "bg-primary",
                  )}
                />
              )}
              {quorum && !locked && (
                <span className="text-success absolute top-0.5 right-0.5">
                  <CheckIcon className="size-2.5" strokeWidth={3} />
                </span>
              )}
              {multiSlotDates?.has(iso) && (
                <span className="absolute top-1 left-1 text-[0.55rem] leading-none opacity-70">
                  ••
                </span>
              )}
            </button>
          )
        })}
      </div>

      {onWeekdayToggle && (
        <WeekdayChips
          month={month}
          names={weekdayNames}
          isInteractive={isInteractive}
          selectedDates={selectedDates}
          onToggle={onWeekdayToggle}
        />
      )}

      {footer}
    </div>
  )
}

const HORIZONS = [
  { value: "4", label: "4 weeks" },
  { value: "8", label: "8 weeks" },
  { value: "13", label: "3 months" },
  { value: "26", label: "6 months" },
]

/**
 * "Every Tuesday" shortcuts. These deliberately run past the month on screen -
 * a weekly game night isn't confined to one calendar page - so the horizon is
 * chosen alongside the weekday.
 */
function WeekdayChips({
  month,
  names,
  isInteractive,
  selectedDates,
  onToggle,
}: {
  month: Date
  names: string[]
  isInteractive: (iso: string) => boolean
  selectedDates?: Set<string>
  onToggle: (isos: string[], allSelected: boolean) => void
}) {
  const [weeks, setWeeks] = React.useState("8")

  // Start from the month in view, but never offer a day that has already gone.
  const from = React.useMemo(() => {
    const monthStart = startOfMonth(month)
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    return monthStart > now ? monthStart : now
  }, [month])

  const runs = React.useMemo(
    () =>
      names.map((_, i) =>
        weekdayRun(i, from, Number(weeks)).filter((iso) => isInteractive(iso)),
      ),
    [names, from, weeks, isInteractive],
  )

  if (runs.every((r) => r.length === 0)) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground mr-0.5 text-xs">Every:</span>
      {names.map((name, i) => {
        const dates = runs[i]
        const all =
          dates.length > 0 && dates.every((d) => selectedDates?.has(d) ?? false)
        return (
          <button
            key={name}
            type="button"
            disabled={dates.length === 0}
            title={`${weekdayPlural(i)}: ${dates.length} of them`}
            aria-pressed={all}
            onClick={() => onToggle(dates, all)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs transition-colors",
              dates.length === 0
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "cursor-pointer hover:bg-accent",
              all &&
                "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {name}
          </button>
        )
      })}

      <span className="text-muted-foreground ml-1 text-xs">for</span>
      <Select value={weeks} onValueChange={(v) => setWeeks(String(v))} items={HORIZONS}>
        <SelectTrigger size="sm" className="h-7 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HORIZONS.map((h) => (
            <SelectItem key={h.value} value={h.value}>
              {h.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function CalendarLegend({
  mode,
  allowNo = true,
}: {
  mode: "vote" | "pick"
  allowNo?: boolean
}) {
  const items =
    mode === "vote"
      ? [
          { className: "bg-accent/40 border", label: "Available" },
          { className: "bg-success/40 ring-1 ring-success/70", label: "In" },
          {
            className: "bg-warning/25 ring-1 ring-warning/70 vote-pattern-maybe",
            label: "Maybe",
          },
          ...(allowNo
            ? [
                {
                  className:
                    "bg-destructive/20 ring-1 ring-destructive/60 vote-pattern-no",
                  label: "Can't",
                },
              ]
            : []),
          { className: "opacity-40 border border-dashed", label: "Not offered" },
        ]
      : [
          { className: "bg-primary", label: "Offered" },
          { className: "bg-accent/40 border", label: "Click to offer" },
        ]

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {items.map((it) => (
          <span key={it.label} className="flex items-center gap-1.5">
            <span className={cn("size-3.5 shrink-0 rounded-[4px]", it.className)} />
            {it.label}
          </span>
        ))}
      </div>
      {mode !== "vote" && (
        <p className="text-muted-foreground text-xs">
          Click a day to offer it. Shift-click to offer a whole range.
        </p>
      )}
    </div>
  )
}
