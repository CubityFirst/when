import * as React from "react"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ClampedListProps extends React.ComponentProps<"div"> {
  /**
   * How many children to show collapsed. A fractional value leaves that much of
   * the next one visible, so it reads as "there's more below" rather than as a
   * clean edge. Rows are measured, so they don't have to be a uniform height.
   */
  entries?: number
  /** Noun for the toggle, e.g. "dates" -> "Show all 9 dates". */
  noun?: string
  /** Extra classes for the scrolling container (put the gap utilities here). */
  className?: string
}

export function ClampedList({
  entries = 3.5,
  noun,
  className,
  children,
  ...props
}: ClampedListProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = React.useState(false)
  const [clampHeight, setClampHeight] = React.useState<number | null>(null)
  const [total, setTotal] = React.useState(0)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    function measure() {
      const host = ref.current
      if (!host) return
      const kids = Array.from(host.children) as HTMLElement[]
      setTotal(kids.length)

      const whole = Math.floor(entries)
      // Clamp as soon as there is more than a whole row to hide, so a 4th
      // entry shows as the half-row peek rather than slipping through.
      if (kids.length <= entries) {
        setClampHeight(null)
        return
      }

      const gap = parseFloat(getComputedStyle(host).rowGap || "0") || 0
      let h = 0
      for (let i = 0; i < whole; i++) h += kids[i].offsetHeight + gap

      const fraction = entries - whole
      if (fraction > 0 && kids[whole]) h += kids[whole].offsetHeight * fraction

      setClampHeight(Math.round(h))
    }

    measure()

    // Rows change height on resize, and the list itself changes as votes land.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [entries, children])

  const clamped = clampHeight !== null && !expanded
  const hidden = Math.max(0, total - Math.floor(entries))

  return (
    <div {...props}>
      <div className="relative">
        <div
          ref={ref}
          className={cn("flex flex-col", clamped && "overflow-hidden", className)}
          style={clamped ? { maxHeight: clampHeight } : undefined}
          aria-hidden={false}
        >
          {children}
        </div>

        {clamped && (
          <div
            aria-hidden
            className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent"
          />
        )}
      </div>

      {clampHeight !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground mt-2 w-full"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUpIcon />
              Show less
            </>
          ) : (
            <>
              <ChevronDownIcon />
              Show all {total}
              {noun ? ` ${noun}` : ""}
              {hidden > 0 && ` (${hidden} more)`}
            </>
          )}
        </Button>
      )}
    </div>
  )
}

/**
 * A comma-separated run of names that stops after `max` and offers the rest
 * behind a toggle, so a 30-person yes list doesn't dominate a slot card.
 */
export function NameRun({
  names,
  label,
  max = 3,
  className,
}: {
  names: string[]
  label: string
  max?: number
  className?: string
}) {
  const [expanded, setExpanded] = React.useState(false)
  if (names.length === 0) return null

  const shown = expanded ? names : names.slice(0, max)
  const rest = names.length - shown.length

  return (
    <div className={cn("text-xs", className)}>
      <span className="text-muted-foreground">{label}: </span>
      {shown.join(", ")}
      {rest > 0 && !expanded && (
        <>
          {" "}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground cursor-pointer underline underline-offset-2"
            aria-expanded={false}
            onClick={() => setExpanded(true)}
          >
            +{rest} more
          </button>
        </>
      )}
      {expanded && names.length > max && (
        <>
          {" "}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground cursor-pointer underline underline-offset-2"
            aria-expanded
            onClick={() => setExpanded(false)}
          >
            show less
          </button>
        </>
      )}
    </div>
  )
}
