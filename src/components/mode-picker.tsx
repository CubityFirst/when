import type { ElementType } from "react"
import { CalendarCheckIcon, CheckIcon, RepeatIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { EventMode } from "@shared/types"

const MODES: { value: EventMode; title: string; body: string; icon: ElementType }[] = [
  {
    value: "oneoff",
    title: "One-off",
    body: "Find one date, lock it in and close voting.",
    icon: CalendarCheckIcon,
  },
  {
    value: "repeatable",
    title: "Repeatable",
    body: "Voting stays open. Confirm sessions as you go, and past days drop off.",
    icon: RepeatIcon,
  },
]

/** One-off vs repeatable, styled like the access-mode choice beside it. */
export function ModePicker({
  value,
  onChange,
  className,
}: {
  value: EventMode
  onChange: (mode: EventMode) => void
  className?: string
}) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-1", className)}>
      {MODES.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            "cursor-pointer rounded-lg border p-3 text-left transition-all",
            value === opt.value
              ? "border-primary bg-primary/5 ring-primary/30 ring-1"
              : "hover:bg-accent/50",
          )}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <opt.icon className="text-muted-foreground size-3.5" />
            {opt.title}
            {value === opt.value && <CheckIcon className="text-primary size-3.5" />}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-xs">{opt.body}</span>
        </button>
      ))}
    </div>
  )
}
