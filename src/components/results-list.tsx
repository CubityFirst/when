import {
  CheckIcon,
  HelpCircleIcon,
  LockIcon,
  TrophyIcon,
  UnlockIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ClampedList, NameRun } from "@/components/ui/clamped-list"
import { cn } from "@/lib/utils"
import { formatDayLong, formatDayShort, formatTimeRange, isPastISO } from "@/lib/dates"
import type { EventPublic, Slot, SlotTally } from "@shared/types"

interface ResultsListProps {
  event: EventPublic
  tallyBySlot: Map<string, SlotTally>
  slotsByDate: Map<string, Slot[]>
  isOwner: boolean
  onLock: (slotId: string | null) => void | Promise<void>
  className?: string
}

export function ResultsList({
  event,
  tallyBySlot,
  slotsByDate,
  isOwner,
  onLock,
  className,
}: ResultsListProps) {
  const dates = [...slotsByDate.keys()].sort()

  // Best option first, so the obvious answer is easy to spot.
  const ranked = [...event.slots].sort(
    (a, b) =>
      (tallyBySlot.get(b.id)?.score ?? 0) - (tallyBySlot.get(a.id)?.score ?? 0),
  )
  const best = ranked[0]
  const bestScore = best ? (tallyBySlot.get(best.id)?.score ?? 0) : 0

  // What the page should say is happening: the locked date if there is one,
  // otherwise whichever option is currently ahead.
  const lockedSlot = event.slots.find((s) => s.id === event.lockedSlotId) ?? null
  const headSlot = lockedSlot ?? (bestScore > 0 ? best : null)
  const headTally = headSlot ? tallyBySlot.get(headSlot.id) : undefined
  const headline =
    headSlot && headTally
      ? { slot: headSlot, tally: headTally, locked: !!lockedSlot }
      : null

  // Other dates still on the table, excluding the one already headlined.
  const upcoming = [...new Set(event.slots.map((s) => s.date))]
    .filter((d) => !isPastISO(d) && d !== headSlot?.date)
    .sort()

  if (event.participants.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
            Nobody has replied yet. Share the link and the tallies will show up here.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Results</CardTitle>
        <CardDescription>
          {event.minAttendees === null ? (
            "Ranked by how many people can make it."
          ) : (
            <>
              A date turns green once {event.minAttendees}{" "}
              {event.minAttendees === 1 ? "person is" : "people are"} in
              {event.countMaybe ? " (maybes included)" : ""}.
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {headline && (
          <div
            className={cn(
              "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3",
              headline.locked
                ? "border-success/40 bg-success/10"
                : "border-primary/30 bg-primary/5",
            )}
          >
            <div>
              <p className="text-muted-foreground text-xs">
                {headline.locked ? "Locked in" : "Leading so far"}
              </p>
              <p className="font-medium">
                {formatDayLong(headline.slot.date)}
                {headline.slot.startTime ? ` · ${formatTimeRange(headline.slot.startTime, headline.slot.endTime)}` : ""}
              </p>
            </div>
            <div className="text-right text-sm">
              <span className="tabular font-medium">
                {headline.tally.score}
                {event.minAttendees !== null && `/${event.minAttendees}`}
              </span>
              <span className="text-muted-foreground"> in</span>
              {upcoming.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  also open:{" "}
                  {upcoming.slice(0, 2).map((d) => formatDayShort(d)).join(", ")}
                  {upcoming.length > 2 && ` +${upcoming.length - 2}`}
                </p>
              )}
            </div>
          </div>
        )}

        <ClampedList className="gap-4" noun="dates">
          {dates.map((date) => {
            const slots = slotsByDate.get(date)!
            return (
              <div key={date} className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">{formatDayLong(date)}</h4>

              {slots.map((slot) => {
                const t = tallyBySlot.get(slot.id)
                if (!t) return null
                const quorum = event.minAttendees
                const pct =
                  quorum === null
                    ? event.participants.length
                      ? (t.score / event.participants.length) * 100
                      : 0
                    : Math.min(100, (t.score / quorum) * 100)
                const locked = event.lockedSlotId === slot.id
                const isBest =
                  !!best && slot.id === best.id && bestScore > 0 && !event.lockedSlotId

                return (
                  <div
                    key={slot.id}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      t.meetsQuorum && "border-success/40 bg-success/5",
                      locked && "border-success ring-success/30 ring-1",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm">
                          {slot.label ? (
                            <span className="font-medium">{slot.label} · </span>
                          ) : null}
                          {formatTimeRange(slot.startTime, slot.endTime)}
                        </span>
                        {locked && (
                          <Badge variant="success" className="gap-1">
                            <LockIcon className="size-3" />
                            Locked in
                          </Badge>
                        )}
                        {!locked && t.meetsQuorum && (
                          <Badge variant="success" className="gap-1">
                            <CheckIcon className="size-3" />
                            Enough people
                          </Badge>
                        )}
                        {t.full && (
                          <Badge variant="warning" className="gap-1">
                            <UsersIcon className="size-3" />
                            Full
                          </Badge>
                        )}
                        {!t.full && t.spotsLeft !== null && t.spotsLeft <= 3 && t.yes > 0 && (
                          <Badge variant="muted">
                            {t.spotsLeft} {t.spotsLeft === 1 ? "spot" : "spots"} left
                          </Badge>
                        )}
                        {isBest && !t.meetsQuorum && (
                          <Badge variant="secondary" className="gap-1">
                            <TrophyIcon className="size-3" />
                            Best so far
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="text-success flex items-center gap-1" />
                              }
                            >
                              <CheckIcon className="size-3.5" />
                              <span className="tabular">{t.yes}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t.yesNames.length ? t.yesNames.join(", ") : "Nobody yet"}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="text-warning flex items-center gap-1" />
                              }
                            >
                              <HelpCircleIcon className="size-3.5" />
                              <span className="tabular">{t.maybe}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t.maybeNames.length
                                ? t.maybeNames.join(", ")
                                : "Nobody yet"}
                            </TooltipContent>
                          </Tooltip>

                          {event.allowNo && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <span className="text-muted-foreground flex items-center gap-1" />
                                }
                              >
                                <XIcon className="size-3.5" />
                                <span className="tabular">{t.no}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t.noNames.length ? t.noNames.join(", ") : "Nobody yet"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>

                        {isOwner && (
                          <Button
                            size="sm"
                            variant={
                              locked ? "outline" : t.meetsQuorum ? "success" : "outline"
                            }
                            // With no threshold any option with a yes can be locked.
                            disabled={
                              !locked &&
                              (quorum === null ? t.yes === 0 : !t.meetsQuorum)
                            }
                            onClick={() => onLock(locked ? null : slot.id)}
                          >
                            {locked ? (
                              <>
                                <UnlockIcon />
                                Reopen
                              </>
                            ) : (
                              <>
                                <LockIcon />
                                Lock in
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center gap-3">
                      <Progress
                        value={pct}
                        indicatorClassName={cn(
                          t.meetsQuorum ? "bg-success" : "bg-primary",
                        )}
                      />
                      <span className="text-muted-foreground tabular shrink-0 text-xs">
                        {quorum === null ? `${t.score} in` : `${t.score}/${quorum}`}
                        {event.maxAttendees !== null && ` · cap ${event.maxAttendees}`}
                      </span>
                    </div>

                    {(t.yesNames.length > 0 ||
                      t.maybeNames.length > 0 ||
                      t.waitlistNames.length > 0) && (
                      <div className="mt-2 flex flex-col gap-0.5">
                        <NameRun names={t.yesNames} label="In" />
                        <NameRun names={t.waitlistNames} label="Waiting list" />
                        <NameRun names={t.maybeNames} label="Maybe" />
                      </div>
                    )}
                  </div>
                )
                })}
              </div>
            )
          })}
        </ClampedList>

        {isOwner && !event.lockedSlotId && (
          <p className="text-muted-foreground border-t pt-3 text-xs">
            {event.minAttendees === null
              ? "Lock in whichever date you want. That closes voting and shows the result at the top of the page."
              : "Lock in a date once it has enough people. That closes voting and shows the result at the top of the page."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
