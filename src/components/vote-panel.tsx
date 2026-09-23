import * as React from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  EraserIcon,
  HelpCircleIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ClampedList } from "@/components/ui/clamped-list"
import { toast } from "@/components/ui/toast"
import * as api from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatDayLong, formatTimeRange, isPastISO } from "@/lib/dates"
import type { EventPublic, PublicParticipant, Slot, VoteValue } from "@shared/types"

const CHOICES: { value: VoteValue; label: string; icon: React.ElementType; cls: string }[] =
  [
    {
      value: "yes",
      label: "Yes",
      icon: CheckIcon,
      cls: "data-[pressed]:bg-success data-[pressed]:text-success-foreground",
    },
    {
      value: "maybe",
      label: "Maybe",
      icon: HelpCircleIcon,
      cls: "data-[pressed]:bg-warning data-[pressed]:text-warning-foreground data-[pressed]:vote-pattern-maybe",
    },
    {
      value: "no",
      label: "No",
      icon: XIcon,
      cls: "data-[pressed]:bg-destructive data-[pressed]:text-destructive-foreground data-[pressed]:vote-pattern-no",
    },
  ]

interface VotePanelProps {
  event: EventPublic
  slotsByDate: Map<string, Slot[]>
  draft: Record<string, VoteValue>
  setDraft: React.Dispatch<React.SetStateAction<Record<string, VoteValue>>>
  name: string
  setName: (v: string) => void
  you: PublicParticipant | null
  token: string | null
  editKey: string | null
  onSaved: (editKey: string) => void | Promise<void>
  /** The month calendar, rendered inline as the primary way to answer. */
  calendar: React.ReactNode
  className?: string
}

export function VotePanel({
  event,
  slotsByDate,
  draft,
  setDraft,
  name,
  setName,
  you,
  token,
  editKey,
  onSaved,
  calendar,
  className,
}: VotePanelProps) {
  const [saving, setSaving] = React.useState(false)
  const [showDetail, setShowDetail] = React.useState(false)

  // "Can't" is only offered when the organiser wants a decisive no.
  const choices = event.allowNo ? CHOICES : CHOICES.filter((c) => c.value !== "no")

  const dates = [...slotsByDate.keys()].sort()
  const answered = Object.keys(draft).length
  const total = event.slots.length

  // Days carrying more than one time slot can't be fully answered from the
  // calendar alone, so the detail list is worth pointing at.
  const multiSlotDays = dates.filter((d) => (slotsByDate.get(d)?.length ?? 0) > 1).length

  function setAll(value: VoteValue) {
    setDraft(Object.fromEntries(event.slots.map((s) => [s.id, value])))
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Add your name first.")
      return
    }
    setSaving(true)
    try {
      const res = await api.submitVote(event.slug, {
        name: name.trim(),
        votes: draft,
        token: token ?? undefined,
        editKey: editKey ?? undefined,
      })
      await onSaved(res.editKey)
    } catch (err) {
      toast.error("Couldn't save", err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  // Marking every date is not required - one answer is enough, and someone who
  // has already replied may clear the lot to withdraw.
  const canSave = !saving && !!name.trim() && (answered > 0 || !!you)
  // The one case where Save is disabled for a reason that isn't obvious.
  const needsName = !name.trim() && answered > 0

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{you ? "Update your availability" : "Your availability"}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {you?.needsRecheck && (
          <div className="border-warning/50 bg-warning/10 flex gap-3 rounded-lg border p-3 text-sm">
            <RefreshCwIcon className="text-warning mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">The organiser has asked everyone to re-check</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Your previous answers are filled in below. Change anything that's moved on,
                then save to confirm. Until you do, your old answers still count.
              </p>
            </div>
          </div>
        )}

        {/* 1 - who you are */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sam"
            maxLength={60}
            autoComplete="name"
            className="h-11 text-base sm:h-9 sm:text-sm"
            disabled={!!you && event.accessMode !== "open"}
          />
          {you && (
            <p className="text-muted-foreground text-xs">
              You've already replied, so saving again replaces your answers.
            </p>
          )}
        </div>

        {/* 2 - answer straight on the calendar, with quick fill just under
            its legend */}
        <div className="flex flex-col items-center gap-4">
          {calendar}

          <div className="flex w-full flex-wrap items-center justify-center gap-2">
            <span className="text-muted-foreground w-full text-center text-xs">Quick fill</span>
            {choices.map((c) => (
              <Button
                key={c.value}
                type="button"
                variant="outline"
                size="sm"
                className="h-9 sm:h-8"
                onClick={() => setAll(c.value)}
              >
                <c.icon />
                All {c.label.toLowerCase()}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-9 sm:h-8"
              disabled={answered === 0}
              onClick={() => setDraft({})}
            >
              <EraserIcon />
              Reset
            </Button>
          </div>
        </div>

        {/* 3 - save, without needing the detail list at all */}
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-sm">
              {answered} of {total} marked
            </span>
            <span
              aria-live="polite"
              className={cn(
                "text-xs",
                needsName ? "text-warning font-medium" : "text-muted-foreground",
              )}
            >
              {needsName
                ? "Add your name above to save."
                : answered === total
                  ? "All done, save when you're ready."
                  : "Leave any you don't mind blank."}
            </span>
          </div>
          <Button
            onClick={save}
            disabled={!canSave}
            size="lg"
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
            {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {you?.needsRecheck
              ? "Confirm my answers"
              : you
                ? "Update my answers"
                : "Save my availability"}
          </Button>
        </div>

        {/* 4 - optional: per-slot precision */}
        <div>
          <Separator className="mb-3" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground -ml-2 h-auto py-1.5"
            aria-expanded={showDetail}
            onClick={() => setShowDetail((v) => !v)}
          >
            <SlidersHorizontalIcon />
            {showDetail ? "Hide" : "Answer"} each date individually
            <ChevronDownIcon
              className={cn("transition-transform", showDetail && "rotate-180")}
            />
          </Button>

          {!showDetail && multiSlotDays > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">
              {multiSlotDays} {multiSlotDays === 1 ? "date has" : "dates have"} more than
              one time. Open this to answer those separately.
            </p>
          )}

          {showDetail && (
            <ClampedList className="mt-3 gap-3" noun="dates">
              {dates.map((date) => {
                const slots = slotsByDate.get(date)!
                const past = isPastISO(date)
                return (
                  <div
                    key={date}
                    id={`day-${date}`}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      past && "opacity-55",
                    )}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{formatDayLong(date)}</span>
                      {past && (
                        <Badge variant="muted" className="text-[0.65rem]">
                          In the past
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {slots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="text-muted-foreground min-w-0 text-sm">
                            {slot.label ? (
                              <>
                                <span className="text-foreground">{slot.label}</span>
                                {" · "}
                              </>
                            ) : null}
                            {formatTimeRange(slot.startTime, slot.endTime)}
                          </span>

                          <ToggleGroup
                            variant="outline"
                            size="sm"
                            value={draft[slot.id] ? [draft[slot.id]] : []}
                            onValueChange={(vals) => {
                              const next = vals[vals.length - 1] as VoteValue | undefined
                              setDraft((prev) => {
                                const copy = { ...prev }
                                if (!next) delete copy[slot.id]
                                else copy[slot.id] = next
                                return copy
                              })
                            }}
                          >
                            {choices.map((c) => (
                              <ToggleGroupItem
                                key={c.value}
                                value={c.value}
                                aria-label={c.label}
                                className={cn("h-10 px-4 sm:h-8 sm:px-3", c.cls)}
                              >
                                <c.icon />
                                <span className="hidden sm:inline">{c.label}</span>
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </ClampedList>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
