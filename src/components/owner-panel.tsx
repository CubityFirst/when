import * as React from "react"
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UserMinusIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { MonthCalendar, CalendarLegend } from "@/components/month-calendar"
import { toast } from "@/components/ui/toast"
import * as api from "@/lib/api"
import { cn } from "@/lib/utils"
import { defaultMonth, formatDayLong, relativeTime } from "@/lib/dates"
import { navigate } from "@/lib/router"
import type { AccessMode, EventViewResponse, SlotInput } from "@shared/types"

interface OwnerPanelProps {
  slug: string
  admin: api.AdminKeys
  view: EventViewResponse
  setView: (v: EventViewResponse) => void
  onReload: () => Promise<void>
  className?: string
}

export function OwnerPanel({
  slug,
  admin,
  view,
  setView,
  onReload,
  className,
}: OwnerPanelProps) {
  const { event } = view

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SettingsIcon className="size-4" />
          Organiser controls
        </CardTitle>
        <CardDescription>Only visible to you, via your admin link.</CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="dates">Dates</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
            <TabsTrigger value="people">
              People
              {event.participants.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {event.participants.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <SettingsTab slug={slug} admin={admin} view={view} setView={setView} />
          </TabsContent>
          <TabsContent value="dates">
            <DatesTab slug={slug} admin={admin} view={view} setView={setView} />
          </TabsContent>
          <TabsContent value="access">
            <AccessTab slug={slug} admin={admin} view={view} setView={setView} />
          </TabsContent>
          <TabsContent value="people">
            <PeopleTab
              slug={slug}
              admin={admin}
              view={view}
              setView={setView}
              onReload={onReload}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------- settings */

function SettingsTab({
  slug,
  admin,
  view,
  setView,
}: Omit<OwnerPanelProps, "onReload">) {
  const { event } = view
  const [title, setTitle] = React.useState(event.title)
  const [description, setDescription] = React.useState(event.description)
  const [requireQuorum, setRequireQuorum] = React.useState(event.minAttendees !== null)
  const [minAttendees, setMinAttendees] = React.useState(event.minAttendees ?? 2)
  const [capacity, setCapacity] = React.useState(event.maxAttendees !== null)
  const [maxAttendees, setMaxAttendees] = React.useState(event.maxAttendees ?? 9)
  const [allowNo, setAllowNo] = React.useState(event.allowNo)
  const [chatUrl, setChatUrl] = React.useState(event.chatUrl)
  const [countMaybe, setCountMaybe] = React.useState(event.countMaybe)
  const [saving, setSaving] = React.useState(false)

  const effectiveQuorum = requireQuorum ? minAttendees : null
  const effectiveCap = capacity ? maxAttendees : null
  const dirty =
    title !== event.title ||
    description !== event.description ||
    effectiveQuorum !== event.minAttendees ||
    effectiveCap !== event.maxAttendees ||
    allowNo !== event.allowNo ||
    chatUrl !== event.chatUrl ||
    countMaybe !== event.countMaybe

  async function save() {
    setSaving(true)
    try {
      setView(
        await api.updateEvent(slug, admin, {
          title,
          description,
          minAttendees: effectiveQuorum,
          maxAttendees: effectiveCap,
          allowNo,
          chatUrl,
          countMaybe,
        }),
      )
      toast.success("Settings saved.")
    } catch (err) {
      toast.error("Couldn't save", err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="o-title">Title</Label>
        <Input
          id="o-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="o-desc">Description</Label>
        <Textarea
          id="o-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="o-chat">Discussion link</Label>
        <Input
          id="o-chat"
          type="url"
          value={chatUrl}
          onChange={(e) => setChatUrl(e.target.value)}
          placeholder="https://discord.gg/..."
          maxLength={500}
        />
        <p className="text-muted-foreground text-xs">
          Just for this event.
          {event.group
            ? " Shown next to the group's own link."
            : " Clear the field to remove it."}
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <Switch checked={requireQuorum} onCheckedChange={setRequireQuorum} />
        Require a minimum number of people
      </label>

      {requireQuorum && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="o-min">People needed to trigger the event</Label>
            <Input
              id="o-min"
              type="number"
              min={1}
              max={500}
              value={minAttendees}
              onChange={(e) =>
                setMinAttendees(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
              }
              className="tabular w-32"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <Switch checked={countMaybe} onCheckedChange={setCountMaybe} />
            Count "maybe" towards the total
          </label>
        </>
      )}

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <Switch checked={allowNo} onCheckedChange={setAllowNo} className="mt-0.5" />
        <span>
          Let people say they can't make it
          <span className="text-muted-foreground block text-xs">
            Off: voters choose yes or maybe only.
            {event.allowNo && " Existing \u201ccan\u2019t\u201d answers are cleared."}
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <Switch checked={capacity} onCheckedChange={setCapacity} />
        Cap the number of players
      </label>

      {capacity && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="o-max">Maximum players ("in" votes only)</Label>
          <Input
            id="o-max"
            type="number"
            min={1}
            max={500}
            value={maxAttendees}
            onChange={(e) =>
              setMaxAttendees(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
            }
            className="tabular w-32"
          />
        </div>
      )}

      <div className="flex items-center gap-2 border-t pt-4">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          Save changes
        </Button>
        <DeleteEventButton slug={slug} admin={admin} />
      </div>
    </div>
  )
}

function DeleteEventButton({ slug, admin }: { slug: string; admin: api.AdminKeys }) {
  const [busy, setBusy] = React.useState(false)

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" className="text-destructive hover:bg-destructive/10" />
        }
      >
        <Trash2Icon />
        Delete event
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this event?</DialogTitle>
          <DialogDescription>
            This removes the event, every vote and every token. The link{" "}
            <code className="text-foreground">/{slug}</code> becomes free again. This
            can't be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await api.deleteEvent(slug, admin)
                navigate("/")
              } catch {
                toast.error("Couldn't delete the event.")
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------------------- dates */

function DatesTab({ slug, admin, view, setView }: Omit<OwnerPanelProps, "onReload">) {
  const { event } = view
  const [month, setMonth] = React.useState(defaultMonth)
  const [dates, setDates] = React.useState<Set<string>>(
    () => new Set(event.slots.map((s) => s.date)),
  )
  const [saving, setSaving] = React.useState(false)

  const original = React.useMemo(
    () => new Set(event.slots.map((s) => s.date)),
    [event.slots],
  )
  const dirty =
    dates.size !== original.size || [...dates].some((d) => !original.has(d))

  const removed = [...original].filter((d) => !dates.has(d))

  async function save() {
    setSaving(true)
    try {
      // Keep the existing time slots for days that survive; new days start all-day.
      const slots: SlotInput[] = []
      for (const date of [...dates].sort()) {
        const existing = event.slots.filter((s) => s.date === date)
        if (existing.length) {
          for (const s of existing) {
            slots.push({
              date,
              startTime: s.startTime,
              endTime: s.endTime,
              label: s.label,
            })
          }
        } else {
          slots.push({ date, startTime: null, endTime: null, label: null })
        }
      }
      setView(await api.updateEvent(slug, admin, { slots }))
      toast.success("Dates updated.")
    } catch (err) {
      toast.error("Couldn't save", err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <p className="text-muted-foreground text-sm">
        Add or remove days people can vote on. Votes for days you keep are preserved.
      </p>

      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        selectedDates={dates}
        onDayClick={(iso) =>
          setDates((prev) => {
            const next = new Set(prev)
            if (next.has(iso)) next.delete(iso)
            else next.add(iso)
            return next
          })
        }
        onRangeClick={(isos) =>
          setDates((prev) => {
            const next = new Set(prev)
            for (const iso of isos) next.add(iso)
            return next
          })
        }
        onWeekdayToggle={(isos, allSelected) =>
          setDates((prev) => {
            const next = new Set(prev)
            for (const iso of isos) {
              if (allSelected) next.delete(iso)
              else next.add(iso)
            }
            return next
          })
        }
        disablePast={false}
        footer={<CalendarLegend mode="pick" />}
      />

      {removed.length > 0 && (
        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm">
          <p className="font-medium">
            Removing {removed.length} {removed.length === 1 ? "day" : "days"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Votes cast for {removed.map(formatDayLong).join(", ")} will be deleted.
          </p>
        </div>
      )}

      <Button onClick={save} disabled={!dirty || saving || dates.size === 0} className="self-start">
        {saving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        Save dates
      </Button>
    </div>
  )
}

/* ---------------------------------------------------------------- access */

function AccessTab({ slug, admin, view, setView }: Omit<OwnerPanelProps, "onReload">) {
  const { event, tokens = [] } = view
  const [labels, setLabels] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const origin = window.location.origin

  async function setMode(mode: AccessMode) {
    try {
      setView(await api.updateEvent(slug, admin, { accessMode: mode }))
      toast.success(
        mode === "token" ? "Event is now token-only." : "Event is now open to anyone.",
      )
    } catch (err) {
      toast.error("Couldn't save", err instanceof Error ? err.message : undefined)
    }
  }

  async function addTokens() {
    const list = labels
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    setBusy(true)
    try {
      setView(
        await api.createTokens(slug, admin, {
          labels: list.length ? list : undefined,
          count: list.length ? undefined : 1,
        }),
      )
      setLabels("")
      toast.success(list.length ? `${list.length} tokens created.` : "Token created.")
    } catch (err) {
      toast.error("Couldn't create", err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ...(event.group
              ? [
                  {
                    value: "group" as const,
                    title: `${event.group.slug} members only`,
                    body: "Uses the group roster.",
                  },
                ]
              : []),
            { value: "open" as const, title: "Anyone with the link", body: "Voters type their own name." },
            { value: "token" as const, title: "One-off tokens", body: "Codes just for this event." },
          ]
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            className={cn(
              "rounded-lg border p-3 text-left transition-all cursor-pointer",
              event.accessMode === opt.value
                ? "border-primary bg-primary/5 ring-primary/30 ring-1"
                : "hover:bg-accent/50",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {opt.title}
              {event.accessMode === opt.value && (
                <CheckIcon className="text-primary size-3.5" />
              )}
            </span>
            <span className="text-muted-foreground mt-0.5 block text-xs">{opt.body}</span>
          </button>
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Label htmlFor="new-tokens" className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          Issue new tokens
        </Label>
        <Textarea
          id="new-tokens"
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
          placeholder={"One name per line, or leave blank for a single unnamed token"}
          rows={3}
        />
        <Button onClick={addTokens} disabled={busy} className="self-start" variant="secondary">
          {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Create tokens
        </Button>
      </div>

      {tokens.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Issued tokens</Label>
          <div className="flex flex-col divide-y rounded-lg border">
            {tokens.map((t) => (
              <TokenRow
                key={t.id}
                token={t}
                url={`${origin}/${slug}?t=${t.token}`}
                onRevoke={async () => {
                  try {
                    setView(await api.revokeToken(slug, admin, t.id))
                    toast.success("Token revoked.")
                  } catch (err) {
                    toast.error(
                      "Couldn't revoke",
                      err instanceof Error ? err.message : undefined,
                    )
                  }
                }}
              />
            ))}
          </div>
          {event.accessMode === "open" && (
            <p className="text-muted-foreground text-xs">
              These tokens are inactive while the event is open to anyone.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function TokenRow({
  token,
  url,
  onRevoke,
}: {
  token: { id: string; token: string; label: string; revoked: boolean; claimedBy: string | null }
  url: string
  onRevoke: () => void
}) {
  const [copied, setCopied] = React.useState(false)

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 p-2.5",
        token.revoked && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <code className="text-sm">{token.token}</code>
          {token.label && <span className="text-muted-foreground text-xs">{token.label}</span>}
          {token.revoked && (
            <Badge variant="muted" className="text-[0.65rem]">
              Revoked
            </Badge>
          )}
          {token.claimedBy && !token.revoked && (
            <Badge variant="secondary" className="text-[0.65rem]">
              Used by {token.claimedBy}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Copy invite link"
          disabled={token.revoked}
          onClick={async () => {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
        </Button>
        {!token.revoked && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Revoke token"
            className="text-destructive hover:bg-destructive/10"
            onClick={onRevoke}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- people */

function PeopleTab({ slug, admin, view, setView }: OwnerPanelProps) {
  const { event } = view

  if (event.participants.length === 0) {
    return (
      <p className="text-muted-foreground pt-4 text-sm">
        No replies yet. Share the link to get started.
      </p>
    )
  }

  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {event.participants.map((p) => {
        const yes = Object.values(p.votes).filter((v) => v === "yes").length
        return (
          <div key={p.id} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                <Badge variant="muted" className="text-[0.65rem]">
                  {yes} yes
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                replied {relativeTime(p.updatedAt)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${p.name}`}
              className="text-destructive hover:bg-destructive/10"
              onClick={async () => {
                try {
                  setView(await api.removeParticipant(slug, admin, p.id))
                  toast.success(`${p.name} removed.`)
                } catch (err) {
                  toast.error(
                    "Couldn't remove",
                    err instanceof Error ? err.message : undefined,
                  )
                }
              }}
            >
              <UserMinusIcon />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
