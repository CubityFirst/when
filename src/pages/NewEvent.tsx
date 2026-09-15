import * as React from "react"
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  ClockIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { MonthCalendar, CalendarLegend } from "@/components/month-calendar"
import { ClampedList } from "@/components/ui/clamped-list"
import { toast } from "@/components/ui/toast"
import * as api from "@/lib/api"
import { Link, navigate, useSearchParams } from "@/lib/router"
import { cn } from "@/lib/utils"
import { defaultMonth, formatDayLong, guessTimezone } from "@/lib/dates"
import type { AccessMode, CreateEventResponse, SlotInput } from "@shared/types"
import { validateSlug } from "@shared/types"

interface TimeSlot {
  key: string
  start: string
  end: string
  label: string
}

interface DayConfig {
  date: string
  slots: TimeSlot[]
}

let slotCounter = 0
const newSlot = (start = "19:00", end = ""): TimeSlot => ({
  key: `s${slotCounter++}`,
  start,
  end,
  label: "",
})

export function NewEvent() {
  const params = useSearchParams()
  const groupSlug = params.get("group")
  const groupKey = groupSlug ? api.keys.group(groupSlug) : null

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [customLink, setCustomLink] = React.useState(false)
  const [slug, setSlug] = React.useState("")
  const [days, setDays] = React.useState<DayConfig[]>([])
  const [month, setMonth] = React.useState(defaultMonth)
  // A single time applied to every offered day, so the common case needs no
  // per-day fiddling. Days can still be customised individually below.
  const [sameTime, setSameTime] = React.useState(false)
  const [defaultStart, setDefaultStart] = React.useState("19:00")
  const [defaultEnd, setDefaultEnd] = React.useState("")
  const [accessMode, setAccessMode] = React.useState<AccessMode>(
    groupSlug ? "group" : "open",
  )
  const [tokenNames, setTokenNames] = React.useState("")
  const [requireQuorum, setRequireQuorum] = React.useState(false)
  const [minAttendees, setMinAttendees] = React.useState(2)
  const [countMaybe, setCountMaybe] = React.useState(false)
  const [capacity, setCapacity] = React.useState(false)
  const [maxAttendees, setMaxAttendees] = React.useState(9)
  const [allowNo, setAllowNo] = React.useState(true)
  const [chatUrl, setChatUrl] = React.useState("")

  const [slugState, setSlugState] = React.useState<{
    checking: boolean
    ok: boolean | null
    reason: string | null
  }>({ checking: false, ok: null, reason: null })
  const [submitting, setSubmitting] = React.useState(false)
  const [created, setCreated] = React.useState<CreateEventResponse | null>(null)

  const selectedDates = React.useMemo(() => new Set(days.map((d) => d.date)), [days])
  const multiSlotDates = React.useMemo(
    () => new Set(days.filter((d) => d.slots.length > 1).map((d) => d.date)),
    [days],
  )

  /** What the link will actually be, for display. */
  const fullSlug = groupSlug ? `${groupSlug}/${slug}` : slug

  /* -------------------------------------------------------- slug checking */

  React.useEffect(() => {
    if (!customLink) {
      setSlugState({ checking: false, ok: null, reason: null })
      return
    }
    const clean = fullSlug.trim().toLowerCase()
    if (!slug.trim()) {
      setSlugState({ checking: false, ok: null, reason: null })
      return
    }
    const invalid = validateSlug(clean)
    if (invalid) {
      setSlugState({ checking: false, ok: false, reason: invalid })
      return
    }
    setSlugState({ checking: true, ok: null, reason: null })
    const id = setTimeout(async () => {
      try {
        const res = await api.checkSlug(clean, { kind: "event", groupKey })
        setSlugState({ checking: false, ok: res.available, reason: res.reason })
      } catch {
        setSlugState({ checking: false, ok: null, reason: null })
      }
    }, 400)
    return () => clearTimeout(id)
  }, [slug, fullSlug, customLink, groupKey])

  /* ------------------------------------------------------------- day edit */

  function toggleDay(iso: string) {
    setDays((prev) =>
      prev.some((d) => d.date === iso)
        ? prev.filter((d) => d.date !== iso)
        : [...prev, { date: iso, slots: defaultSlots() }].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
    )
  }

  /** Shift-click: offer every day in the range that isn't already offered. */
  function offerRange(dates: string[]) {
    setDays((prev) => {
      const have = new Set(prev.map((d) => d.date))
      const added = dates
        .filter((d) => !have.has(d))
        .map((date) => ({ date, slots: defaultSlots() }))
      return [...prev, ...added].sort((a, b) => a.date.localeCompare(b.date))
    })
  }

  function updateDay(iso: string, fn: (d: DayConfig) => DayConfig) {
    setDays((prev) => prev.map((d) => (d.date === iso ? fn(d) : d)))
  }

  /** Select or clear every occurrence of a weekday in the month on screen. */
  function toggleWeekday(dates: string[], allSelected: boolean) {
    if (!dates.length) return
    setDays((prev) => {
      if (allSelected) {
        const drop = new Set(dates)
        return prev.filter((d) => !drop.has(d.date))
      }
      const have = new Set(prev.map((d) => d.date))
      const added = dates
        .filter((d) => !have.has(d))
        .map((date) => ({ date, slots: defaultSlots() }))
      return [...prev, ...added].sort((a, b) => a.date.localeCompare(b.date))
    })
  }

  /** The slot list a newly offered day should start with. */
  function defaultSlots(): TimeSlot[] {
    return sameTime ? [newSlot(defaultStart, defaultEnd)] : []
  }

  /** Push the shared time onto every day that has no bespoke slots yet. */
  React.useEffect(() => {
    setDays((prev) =>
      prev.map((d) => {
        if (!sameTime) {
          // Only clear slots this control created, i.e. a single unlabelled one.
          return d.slots.length === 1 && !d.slots[0].label ? { ...d, slots: [] } : d
        }
        if (d.slots.length > 1 || d.slots.some((s) => s.label)) return d
        return { ...d, slots: [newSlot(defaultStart, defaultEnd)] }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameTime, defaultStart, defaultEnd])

  function applyTimesToAll(from: DayConfig) {
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        slots: from.slots.map((s) => ({ ...s, key: `s${slotCounter++}` })),
      })),
    )
    toast.success("Times copied to every selected day.")
  }

  /* -------------------------------------------------------------- submit */

  const tokenLabels = React.useMemo(
    () =>
      tokenNames
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [tokenNames],
  )

  const canSubmit =
    !!title.trim() &&
    (!customLink || slugState.ok === true) &&
    days.length > 0 &&
    !submitting

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)

    const slots: SlotInput[] = days.flatMap((d) =>
      d.slots.length === 0
        ? [{ date: d.date, startTime: null, endTime: null, label: null }]
        : d.slots.map((s) => ({
            date: d.date,
            startTime: s.start || null,
            endTime: s.end || null,
            label: s.label || null,
          })),
    )

    try {
      const res = await api.createEvent(
        {
          slug: customLink ? fullSlug.trim().toLowerCase() : undefined,
          groupSlug: groupSlug ?? undefined,
          title: title.trim(),
          description: description.trim(),
          accessMode,
          minAttendees: requireQuorum ? minAttendees : null,
          maxAttendees: capacity ? maxAttendees : null,
          allowNo,
          chatUrl: chatUrl.trim(),
          countMaybe,
          timezone: guessTimezone(),
          slots,
          tokenLabels: accessMode === "token" ? tokenLabels : undefined,
        },
        groupKey,
      )
      if (res.ownerKey) api.keys.setOwner(res.slug, res.ownerKey)
      if (res.groupKey && res.groupSlug) api.keys.setGroup(res.groupSlug, res.groupKey)
      setCreated(res)
    } catch (err) {
      toast.error(
        "Couldn't create the event",
        err instanceof Error ? err.message : undefined,
      )
      setSubmitting(false)
    }
  }

  if (created) return <CreatedPanel created={created} />

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <Button
        variant="ghost"
        size="sm"
        render={<Link to={groupSlug ? `/${groupSlug}` : "/"} />}
        className="mb-6 -ml-2"
      >
        <ArrowLeftIcon />
        {groupSlug ? "Back to group" : "Back"}
      </Button>

      <h1 className="text-3xl font-semibold tracking-tight">Create an event</h1>
      <p className="text-muted-foreground mt-2">
        {groupSlug ? (
          <>
            In the <code className="text-foreground">{groupSlug}</code> group.
          </>
        ) : (
          "Offer some dates and decide who gets to vote."
        )}
      </p>

      <form onSubmit={submit} className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>The basics</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Event title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Board games night"
                  maxLength={120}
                  required
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Anything people should know before they vote."
                  maxLength={2000}
                  rows={3}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="chat">Discussion link (optional)</Label>
                <Input
                  id="chat"
                  type="url"
                  value={chatUrl}
                  onChange={(e) => setChatUrl(e.target.value)}
                  placeholder="https://discord.gg/..."
                  maxLength={500}
                />
                <p className="text-muted-foreground text-xs">
                  A Discord invite, Slack channel or group chat for this event.
                  {groupSlug
                    ? " Shown alongside the group's own link."
                    : " Shown at the top of the page."}
                </p>
              </div>

              <Separator />

              <label className="flex cursor-pointer items-start gap-3">
                <Switch
                  checked={customLink}
                  onCheckedChange={setCustomLink}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Choose a custom link
                  <span className="text-muted-foreground block text-xs">
                    Off: we'll generate a short random one
                    {groupSlug ? ` under ${groupSlug}/` : ""}.
                  </span>
                </span>
              </label>

              {customLink && (
                <div className="flex flex-col gap-2">
                  <div
                    className={cn(
                      "border-input focus-within:ring-ring/50 flex h-9 items-center rounded-md border pl-3 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]",
                      slugState.ok === false && "border-destructive",
                      slugState.ok === true && "border-success",
                    )}
                  >
                    <span className="text-muted-foreground shrink-0 text-sm select-none">
                      when.cubityfir.st/{groupSlug ? `${groupSlug}/` : ""}
                    </span>
                    <Input
                      value={slug}
                      onChange={(e) => {
                        const v = e.target.value.toLowerCase().replace(/\s+/g, "-")
                        // Inside a group the prefix is fixed, so slashes are noise.
                        setSlug(groupSlug ? v.replace(/\//g, "") : v)
                      }}
                      placeholder={groupSlug ? "games-night" : "club/games-night"}
                      maxLength={100}
                      aria-label="Event link"
                      className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                    />
                    <span className="px-3">
                      {slugState.checking && (
                        <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
                      )}
                      {!slugState.checking && slugState.ok === true && (
                        <CheckIcon className="text-success size-4" />
                      )}
                      {!slugState.checking && slugState.ok === false && (
                        <XIcon className="text-destructive size-4" />
                      )}
                    </span>
                  </div>
                  {slugState.reason && (
                    <p className="text-destructive text-xs">{slugState.reason}</p>
                  )}
                  {!groupSlug && (
                    <p className="text-muted-foreground text-xs">
                      Use a slash to claim a group prefix. Creating{" "}
                      <code className="text-foreground">club/games-night</code>{" "}
                      makes <code className="text-foreground">club</code> yours.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Offer some dates</CardTitle>
              <CardDescription>
                Click the days that could work. Everything you don't pick is greyed
                out for voters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthCalendar
                month={month}
                onMonthChange={setMonth}
                selectedDates={selectedDates}
                multiSlotDates={multiSlotDates}
                onDayClick={toggleDay}
                onRangeClick={offerRange}
                onWeekdayToggle={toggleWeekday}
                disablePast
                footer={<CalendarLegend mode="pick" />}
              />

              <Separator className="my-4" />

              <label className="flex cursor-pointer items-start gap-3">
                <Switch
                  checked={sameTime}
                  onCheckedChange={setSameTime}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Same time on every day
                  <span className="text-muted-foreground block text-xs">
                    Off: each day is an all-day option. You can still give
                    individual days their own slots below.
                  </span>
                </span>
              </label>

              {sameTime && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    type="time"
                    value={defaultStart}
                    aria-label="Start time for every day"
                    onChange={(e) => setDefaultStart(e.target.value)}
                    className="w-32"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="time"
                    value={defaultEnd}
                    aria-label="End time for every day"
                    onChange={(e) => setDefaultEnd(e.target.value)}
                    className="w-32"
                  />
                  <span className="text-muted-foreground text-xs">
                    End time optional
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {days.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {days.length} {days.length === 1 ? "day" : "days"} offered
                </CardTitle>
                <CardDescription>
                  Leave a day as-is for an all-day option, or add time slots people
                  vote on separately.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ClampedList className="gap-3" noun="days">
                {days.map((day) => (
                  <div key={day.date} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {formatDayLong(day.date)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            updateDay(day.date, (d) => ({
                              ...d,
                              slots: [...d.slots, newSlot()],
                            }))
                          }
                        >
                          <PlusIcon />
                          Time slot
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove day"
                          onClick={() => toggleDay(day.date)}
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                    </div>

                    {day.slots.length === 0 ? (
                      <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                        <ClockIcon className="size-3.5" />
                        All day, one yes/no for the whole date.
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-col gap-2">
                        {day.slots.map((s, i) => (
                          <div key={s.key} className="flex flex-wrap items-center gap-2">
                            <Input
                              type="time"
                              value={s.start}
                              aria-label="Start time"
                              onChange={(e) =>
                                updateDay(day.date, (d) => ({
                                  ...d,
                                  slots: d.slots.map((x, j) =>
                                    j === i ? { ...x, start: e.target.value } : x,
                                  ),
                                }))
                              }
                              className="w-32"
                            />
                            <span className="text-muted-foreground text-sm">to</span>
                            <Input
                              type="time"
                              value={s.end}
                              aria-label="End time"
                              onChange={(e) =>
                                updateDay(day.date, (d) => ({
                                  ...d,
                                  slots: d.slots.map((x, j) =>
                                    j === i ? { ...x, end: e.target.value } : x,
                                  ),
                                }))
                              }
                              className="w-32"
                            />
                            <Input
                              value={s.label}
                              placeholder="Label (optional)"
                              maxLength={60}
                              onChange={(e) =>
                                updateDay(day.date, (d) => ({
                                  ...d,
                                  slots: d.slots.map((x, j) =>
                                    j === i ? { ...x, label: e.target.value } : x,
                                  ),
                                }))
                              }
                              className="min-w-32 flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remove slot"
                              onClick={() =>
                                updateDay(day.date, (d) => ({
                                  ...d,
                                  slots: d.slots.filter((_, j) => j !== i),
                                }))
                              }
                            >
                              <XIcon />
                            </Button>
                          </div>
                        ))}
                        {days.length > 1 && (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="self-start px-0"
                            onClick={() => applyTimesToAll(day)}
                          >
                            Use these times on every day
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                </ClampedList>
              </CardContent>
            </Card>
          )}
        </div>

        {/* --------------------------------------------------------- sidebar */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="size-4" />
                How many people
              </CardTitle>
              <CardDescription>
                Both optional: a floor to make it worth doing, a ceiling for how many
                can play.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="flex cursor-pointer items-start gap-3">
                <Switch
                  checked={requireQuorum}
                  onCheckedChange={setRequireQuorum}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Require a minimum number
                  <span className="text-muted-foreground block text-xs">
                    Off: just find the most popular date.
                  </span>
                </span>
              </label>

              {requireQuorum && (
                <>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Fewer"
                      disabled={minAttendees <= 1}
                      onClick={() => setMinAttendees((n) => Math.max(1, n - 1))}
                    >
                      –
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={minAttendees}
                      onChange={(e) =>
                        setMinAttendees(
                          Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                        )
                      }
                      aria-label="Minimum attendees"
                      className="tabular h-10 text-center text-lg font-semibold"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="More"
                      onClick={() => setMinAttendees((n) => Math.min(500, n + 1))}
                    >
                      +
                    </Button>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3">
                    <Switch
                      checked={countMaybe}
                      onCheckedChange={setCountMaybe}
                      className="mt-0.5"
                    />
                    <span className="text-sm">
                      Count "maybe" towards the total
                    </span>
                  </label>
                </>
              )}

              <Separator />

              <label className="flex cursor-pointer items-start gap-3">
                <Switch
                  checked={allowNo}
                  onCheckedChange={setAllowNo}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Let people say they can't make it
                  <span className="text-muted-foreground block text-xs">
                    Keep this on when everyone has to attend. Turn it off when you're
                    just gathering numbers, and voters then choose yes or maybe only.
                  </span>
                </span>
              </label>

              <Separator />

              <label className="flex cursor-pointer items-start gap-3">
                <Switch
                  checked={capacity}
                  onCheckedChange={setCapacity}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Cap the number of players
                  <span className="text-muted-foreground block text-xs">
                    Counts "in" votes only. Anyone past the cap joins a waiting list.
                  </span>
                </span>
              </label>

              {capacity && (
                <>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Fewer"
                      disabled={maxAttendees <= 1}
                      onClick={() => setMaxAttendees((n) => Math.max(1, n - 1))}
                    >
                      –
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={maxAttendees}
                      onChange={(e) =>
                        setMaxAttendees(
                          Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                        )
                      }
                      aria-label="Maximum players"
                      className="tabular h-10 text-center text-lg font-semibold"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="More"
                      onClick={() => setMaxAttendees((n) => Math.min(500, n + 1))}
                    >
                      +
                    </Button>
                  </div>
                  {requireQuorum && maxAttendees < minAttendees && (
                    <p className="text-warning text-xs">
                      The cap is below the minimum, so this event can never both fill
                      and go ahead.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRoundIcon className="size-4" />
                Who can vote?
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {[
                ...(groupSlug
                  ? [
                      {
                        value: "group" as const,
                        title: `${groupSlug} members only`,
                        body: "Uses the group roster. No new links to hand out.",
                      },
                    ]
                  : []),
                {
                  value: "open" as const,
                  title: "Anyone with the link",
                  body: "Voters type their own name. Simplest to share.",
                },
                {
                  value: "token" as const,
                  title: "One-off access tokens",
                  body: "Codes just for this event, revocable at any time.",
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAccessMode(opt.value)}
                  className={cn(
                    "cursor-pointer rounded-lg border p-3 text-left transition-all",
                    accessMode === opt.value
                      ? "border-primary bg-primary/5 ring-primary/30 ring-1"
                      : "hover:bg-accent/50",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {opt.title}
                    {accessMode === opt.value && (
                      <CheckIcon className="text-primary size-3.5" />
                    )}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {opt.body}
                  </span>
                </button>
              ))}

              {accessMode === "token" && (
                <div className="flex flex-col gap-2 pt-1">
                  <Separator />
                  <Label htmlFor="tokens" className="pt-2">
                    Generate tokens for
                  </Label>
                  <Textarea
                    id="tokens"
                    value={tokenNames}
                    onChange={(e) => setTokenNames(e.target.value)}
                    placeholder={"Alice\nBob\nCharlie"}
                    rows={4}
                  />
                  <p className="text-muted-foreground text-xs">
                    One name per line.{" "}
                    {tokenLabels.length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {tokenLabels.length} token
                        {tokenLabels.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Button type="submit" size="lg" disabled={!canSubmit} className="w-full">
            {submitting ? (
              <>
                <Loader2Icon className="animate-spin" />
                Creating…
              </>
            ) : (
              <>
                Create event
                <CheckIcon />
              </>
            )}
          </Button>
          {days.length === 0 && (
            <p className="text-muted-foreground -mt-3 text-center text-xs">
              Pick at least one day first.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------ done screen */

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
        >
          {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  )
}

function CreatedPanel({ created }: { created: CreateEventResponse }) {
  const [ack, setAck] = React.useState(false)
  const origin = window.location.origin
  const publicUrl = `${origin}/${created.slug}`

  // Group events are run from the group key; standalone ones from their own.
  const adminUrl = created.groupKey
    ? `${origin}/${created.groupSlug}?g=${created.groupKey}`
    : created.ownerKey
      ? `${publicUrl}?k=${created.ownerKey}`
      : null

  const needsAck = !!adminUrl

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-20">
      <div className="bg-success/10 text-success ring-success/20 mb-6 inline-flex size-12 items-center justify-center rounded-xl ring-1">
        <CheckIcon className="size-6" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Your event is live</h1>
      <p className="text-muted-foreground mt-2">
        {adminUrl
          ? "Share the first link. Keep the second one to yourself."
          : "Share this with your group."}
      </p>

      <Card className="mt-8">
        <CardContent className="flex flex-col gap-5">
          <CopyRow label="Share this with your group" value={publicUrl} />

          {adminUrl && (
            <>
              <Separator />
              <div className="flex flex-col gap-3">
                <CopyRow
                  label={
                    created.groupKey
                      ? `Admin link for the ${created.groupSlug} group, save it now`
                      : "Your admin link, save it now"
                  }
                  value={adminUrl}
                />
                <p className="text-warning text-xs">
                  {created.groupKey
                    ? `Creating this event claimed the "${created.groupSlug}" prefix for you. This admin link runs the group and every event in it, and it's only shown once.`
                    : "This is the only time the admin link is shown. Without it you can't edit dates, manage tokens or lock in a date."}
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Switch checked={ack} onCheckedChange={setAck} />
                  I've saved the admin link somewhere safe
                </label>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {created.tokens.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Access tokens</CardTitle>
            <CardDescription>
              Send each person their own link. It signs them in automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {created.tokens.map((t) => (
              <CopyRow
                key={t.token}
                label={t.label || "Unnamed"}
                value={`${publicUrl}?t=${t.token}`}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Button
        size="lg"
        className="mt-8 w-full"
        disabled={needsAck && !ack}
        onClick={() =>
          navigate(
            created.groupKey
              ? `/${created.slug}?g=${created.groupKey}`
              : created.ownerKey
                ? `/${created.slug}?k=${created.ownerKey}`
                : `/${created.slug}`,
          )
        }
      >
        Go to my event
      </Button>
    </div>
  )
}
