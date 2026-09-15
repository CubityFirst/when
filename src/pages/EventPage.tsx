import * as React from "react"
import {
  AlertCircleIcon,
  CalendarDaysIcon,
  CheckIcon,
  KeyRoundIcon,
  LockIcon,
  Loader2Icon,
  MessageCircleIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MonthCalendar, CalendarLegend, type DayStatus } from "@/components/month-calendar"
import { VotePanel } from "@/components/vote-panel"
import { ResultsList } from "@/components/results-list"
import { OwnerPanel } from "@/components/owner-panel"
import { toast } from "@/components/ui/toast"
import * as api from "@/lib/api"
import { ApiError } from "@/lib/api"
import { Link, navigate, useSearchParams } from "@/lib/router"
import { defaultMonth, formatDayLong, formatTimeRange } from "@/lib/dates"
import type { EventViewResponse, VoteValue } from "@shared/types"
import { chatServiceName, groupSlugOf } from "@shared/types"

export function EventPage({ slug }: { slug: string }) {
  const params = useSearchParams()

  // Keys can arrive in the URL or from a previous visit in this browser.
  const ownerKey = params.get("k") ?? api.keys.owner(slug)
  const editKey = params.get("e") ?? api.keys.edit(slug)

  // A group's key and its members' tokens are stored against the group prefix,
  // so they work across every event under it.
  const gSlug = groupSlugOf(slug)
  const groupKey = params.get("g") ?? (gSlug ? api.keys.group(gSlug) : null)
  const token =
    params.get("t") ?? api.keys.token(slug) ?? (gSlug ? api.keys.token(gSlug) : null)

  const admin: api.AdminKeys = { ownerKey, groupKey }

  const [view, setView] = React.useState<EventViewResponse | null>(null)
  const [error, setError] = React.useState<{ status: number; message: string } | null>(
    null,
  )
  const [loading, setLoading] = React.useState(true)

  // The calendar opens on the month containing today.
  const [month, setMonth] = React.useState(defaultMonth)

  const [draft, setDraft] = React.useState<Record<string, VoteValue>>({})
  const [name, setName] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getEvent(slug, { ownerKey, groupKey, token, editKey })
      setView(res)
      setError(null)
      if (ownerKey) api.keys.setOwner(slug, ownerKey)
      if (groupKey && res.isOwner && gSlug) api.keys.setGroup(gSlug, groupKey)
      if (token) api.keys.setToken(slug, token)
      if (res.you) {
        setDraft(res.you.votes)
        setName(res.you.name)
      } else if (res.tokenLabel) {
        setName(res.tokenLabel)
      }
    } catch (err) {
      if (err instanceof ApiError) setError({ status: err.status, message: err.message })
      else setError({ status: 0, message: "Couldn't reach the server." })
    } finally {
      setLoading(false)
    }
  }, [slug, ownerKey, groupKey, gSlug, token, editKey])

  React.useEffect(() => {
    void load()
  }, [load])

  /* --------------------------------------------------------------- states */

  if (loading && !view) return <EventSkeleton />

  if (error?.status === 401 || error?.status === 403) {
    return <TokenGate slug={slug} message={error.message} />
  }

  if (error || !view) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-24 text-center">
        <AlertCircleIcon className="text-muted-foreground mx-auto size-10" />
        <h1 className="mt-4 text-2xl font-semibold">
          {error?.status === 404 ? "Nothing here" : "Something went wrong"}
        </h1>
        <p className="text-muted-foreground mt-2">{error?.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" render={<Link to="/" />}>
            Go home
          </Button>
          <Button render={<Link to="/new" />}>Create an event</Button>
        </div>
      </div>
    )
  }

  const { event, isOwner } = view

  /* ------------------------------------------------------ derived display */

  const slotsByDate = new Map<string, typeof event.slots>()
  for (const s of event.slots) {
    const list = slotsByDate.get(s.date) ?? []
    list.push(s)
    slotsByDate.set(s.date, list)
  }

  const tallyBySlot = new Map(event.tallies.map((t) => [t.slotId, t]))
  const enabledDates = new Set(event.slots.map((s) => s.date))
  const multiSlotDates = new Set(
    [...slotsByDate.entries()].filter(([, v]) => v.length > 1).map(([k]) => k),
  )

  // A day is tinted by the strongest thing you said about any of its slots.
  const statusByDate: Record<string, DayStatus> = {}
  for (const [date, slots] of slotsByDate) {
    const values = slots.map((s) => draft[s.id]).filter(Boolean) as VoteValue[]
    statusByDate[date] = values.includes("yes")
      ? "yes"
      : values.includes("maybe")
        ? "maybe"
        : values.length && values.every((v) => v === "no")
          ? "no"
          : "none"
  }

  const quorumDates = new Set(
    event.slots
      .filter((s) => tallyBySlot.get(s.id)?.meetsQuorum)
      .map((s) => s.date),
  )

  const lockedSlot = event.slots.find((s) => s.id === event.lockedSlotId) ?? null
  const votingClosed = event.closed || !!event.lockedSlotId
  const waiting = event.roster.filter((m) => !m.replied)

  /** in -> maybe -> can't -> clear, skipping "can't" when it isn't offered. */
  const NEXT: Record<DayStatus, VoteValue | null> = {
    none: "yes",
    yes: "maybe",
    maybe: event.allowNo ? "no" : null,
    no: null,
  }

  /** Applies one vote value to every slot on the given days. */
  function applyToDays(dates: string[], value: VoteValue | null) {
    setDraft((prev) => {
      const next = { ...prev }
      for (const date of dates) {
        for (const slot of slotsByDate.get(date) ?? []) {
          if (value === null) delete next[slot.id]
          else next[slot.id] = value
        }
      }
      return next
    })
  }

  function cycleDay(iso: string) {
    applyToDays([iso], NEXT[statusByDate[iso] ?? "none"])
  }

  /** Shift-click: take the clicked day's next value and spread it over the range. */
  function cycleRange(dates: string[]) {
    const last = dates[dates.length - 1]
    applyToDays(dates, NEXT[statusByDate[last] ?? "none"])
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      {/* ------------------------------------------------------------ head */}
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
              <CalendarDaysIcon className="size-3.5" />
              {event.group ? (
                <span className="font-mono">
                  <Link
                    to={`/${event.group.slug}${groupKey ? `?g=${groupKey}` : token ? `?t=${token}` : ""}`}
                    className="hover:text-foreground underline underline-offset-2"
                  >
                    {event.group.slug}
                  </Link>
                  /{event.slug.slice(event.group.slug.length + 1)}
                </span>
              ) : (
                <span className="font-mono">/{event.slug}</span>
              )}
              {event.accessMode === "token" && (
                <Badge variant="muted" className="gap-1">
                  <KeyRoundIcon className="size-3" />
                  Token only
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {event.title}
            </h1>
            {event.description && (
              <p className="text-muted-foreground mt-2 max-w-2xl whitespace-pre-wrap">
                {event.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* The event's own link leads; the group's is offered alongside it
                when it points somewhere different. */}
            {event.chatUrl && (
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href={event.chatUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  />
                }
              >
                <MessageCircleIcon />
                Discuss on {chatServiceName(event.chatUrl)}
              </Button>
            )}
            {event.group?.chatUrl && event.group.chatUrl !== event.chatUrl && (
              <Button
                variant={event.chatUrl ? "ghost" : "outline"}
                size="sm"
                render={
                  <a
                    href={event.group.chatUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  />
                }
              >
                <MessageCircleIcon />
                {event.chatUrl
                  ? `${event.group.slug} on ${chatServiceName(event.group.chatUrl)}`
                  : `Discuss on ${chatServiceName(event.group.chatUrl)}`}
              </Button>
            )}
            {isOwner && (
              <Badge variant="secondary" className="gap-1">
                <SettingsIcon className="size-3" />
                You're the organiser
              </Badge>
            )}
          </div>
        </div>

        {lockedSlot && (
          <div className="border-success/40 bg-success/10 mt-6 flex flex-wrap items-center gap-3 rounded-xl border p-4">
            <LockIcon className="text-success size-5 shrink-0" />
            <div>
              <p className="font-medium">
                Locked in: {formatDayLong(lockedSlot.date)}
              </p>
              <p className="text-muted-foreground text-sm">
                {formatTimeRange(lockedSlot.startTime, lockedSlot.endTime)}
                {" · "}
                {tallyBySlot.get(lockedSlot.id)?.yes ?? 0} going
              </p>
            </div>
          </div>
        )}
      </header>

      {/* The calendar is the control, so it lives inside the answer card. */}
      {(() => {
        const calendar = (
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            enabledDates={enabledDates}
            statusByDate={statusByDate}
            quorumDates={quorumDates}
            lockedDate={lockedSlot?.date ?? null}
            multiSlotDates={multiSlotDates}
            onDayClick={votingClosed ? undefined : cycleDay}
            onRangeClick={votingClosed ? undefined : cycleRange}
            disablePast={false}
            footer={<CalendarLegend mode="vote" allowNo={event.allowNo} />}
          />
        )

        return (
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_19rem] lg:items-start">
            <div className="contents lg:flex lg:flex-col lg:gap-6">
              {votingClosed ? (
                <Card className="order-1 lg:order-none">
                  <CardContent>{calendar}</CardContent>
                </Card>
              ) : (
                <VotePanel
                  className="order-1 lg:order-none"
                  calendar={calendar}
                  event={event}
                  slotsByDate={slotsByDate}
                  draft={draft}
                  setDraft={setDraft}
                  name={name}
                  setName={setName}
                  you={view.you}
                  token={token}
                  editKey={view.you ? editKey : null}
                  onSaved={async (newEditKey) => {
                    api.keys.setEdit(slug, newEditKey)
                    await load()
                    toast.success("Your availability is saved.")
                  }}
                />
              )}

              <ResultsList
                className="order-3 lg:order-none"
                event={event}
                tallyBySlot={tallyBySlot}
                slotsByDate={slotsByDate}
                isOwner={isOwner}
                onLock={async (slotId) => {
                  if (!ownerKey && !groupKey) return
                  try {
                    const res = await api.lockSlot(slug, admin, slotId)
                    setView(res)
                    toast.success(slotId ? "Date locked in." : "Voting reopened.")
                  } catch (err) {
                    toast.error(
                      "Couldn't update",
                      err instanceof Error ? err.message : undefined,
                    )
                  }
                }}
              />

              {isOwner && (ownerKey || groupKey) && (
                <OwnerPanel
                  className="order-4 lg:order-none"
                  slug={slug}
                  admin={admin}
                  view={view}
                  setView={setView}
                  onReload={load}
                />
              )}
            </div>

            {/* ----------------------------------------------------- status */}
            <div className="contents lg:flex lg:flex-col lg:gap-6 lg:sticky lg:top-6 lg:self-start">
              <Card className="order-2 lg:order-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <UsersIcon className="size-4" />
                    {event.minAttendees === null
                      ? "No minimum"
                      : `Needs ${event.minAttendees} ${event.minAttendees === 1 ? "person" : "people"}`}
                    {event.maxAttendees !== null && ` · max ${event.maxAttendees}`}
                  </CardTitle>
                  <CardDescription>
                    {event.participants.length}{" "}
                    {event.participants.length === 1 ? "person has" : "people have"}{" "}
                    replied so far
                    {event.minAttendees !== null && event.countMaybe
                      ? " · maybes count towards the total"
                      : ""}
                    .
                  </CardDescription>
                </CardHeader>

                {(event.participants.length > 0 || waiting.length > 0) && (
                  <CardContent className="flex flex-col gap-4">
                    {event.participants.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-muted-foreground text-xs font-medium">
                          Replied
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {event.participants.map((p) => (
                            <Badge
                              key={p.id}
                              variant="secondary"
                              className="text-[0.7rem]"
                            >
                              {p.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {waiting.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-muted-foreground text-xs font-medium">
                          Waiting on {waiting.length} of {event.roster.length}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {waiting.map((m) => (
                            <Badge key={m.id} variant="muted" className="text-[0.7rem]">
                              {m.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/* ---------------------------------------------------------------- pieces */

function EventSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-9 w-80 max-w-full" />
      <Skeleton className="mt-3 h-4 w-full max-w-lg" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[24rem_1fr]">
        <Skeleton className="h-96 rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

function TokenGate({ slug, message }: { slug: string; message: string }) {
  const [value, setValue] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = value.trim()
    if (!t) return
    setBusy(true)
    try {
      await api.getEvent(slug, { token: t })
      api.keys.setToken(slug, t)
      navigate(`/${slug}?t=${encodeURIComponent(t)}`, { replace: true })
    } catch (err) {
      toast.error(
        "That didn't work",
        err instanceof Error ? err.message : undefined,
      )
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-24">
      <Card>
        <CardHeader>
          <div className="bg-primary/10 text-primary ring-primary/20 mb-2 inline-flex size-10 items-center justify-center rounded-lg ring-1">
            <KeyRoundIcon className="size-5" />
          </div>
          <CardTitle>This event is invite-only</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="token">Access token</Label>
              <Input
                id="token"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="abc-def-ghi"
                autoComplete="off"
                autoFocus
                className="font-mono"
              />
            </div>
            <Button type="submit" disabled={!value.trim() || busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              Continue
            </Button>
            <p className="text-muted-foreground text-center text-xs">
              Ask whoever organised the event for your code.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
