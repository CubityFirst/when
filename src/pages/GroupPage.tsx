import * as React from "react"
import {
  AlertCircleIcon,
  CalendarCheckIcon,
  CalendarPlusIcon,
  CheckIcon,
  CopyIcon,
  LockIcon,
  Loader2Icon,
  MessageCircleIcon,
  PlusIcon,
  RepeatIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import * as api from "@/lib/api"
import { ApiError } from "@/lib/api"
import { Link, navigate, useSearchParams } from "@/lib/router"
import { cn } from "@/lib/utils"
import { formatDayShort, relativeTime } from "@/lib/dates"
import type { GroupViewResponse } from "@shared/types"
import { chatServiceName } from "@shared/types"

export function GroupPage({ slug }: { slug: string }) {
  const params = useSearchParams()
  const groupKey = params.get("g") ?? api.keys.group(slug)
  const token = params.get("t") ?? api.keys.token(slug)

  const [view, setView] = React.useState<GroupViewResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await api.getGroup(slug, { groupKey, token })
      setView(res)
      setError(null)
      if (groupKey && res.isOwner) api.keys.setGroup(slug, groupKey)
      if (token) api.keys.setToken(slug, token)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server.")
    }
  }, [slug, groupKey, token])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-24 text-center">
        <AlertCircleIcon className="text-muted-foreground mx-auto size-10" />
        <h1 className="mt-4 text-2xl font-semibold">Nothing here</h1>
        <p className="text-muted-foreground mt-2">{error}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" render={<Link to="/" />}>
            Go home
          </Button>
          <Button render={<Link to="/new" />}>Create an event</Button>
        </div>
      </div>
    )
  }

  if (!view) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-9 w-72 max-w-full" />
        <Skeleton className="mt-6 h-40 rounded-xl" />
      </div>
    )
  }

  const { group, isOwner, events } = view

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
              <UsersIcon className="size-3.5" />
              <span className="font-mono">/{group.slug}</span>
              <Badge variant="muted">Group</Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {group.name}
            </h1>
            {group.description && (
              <p className="text-muted-foreground mt-2 max-w-2xl whitespace-pre-wrap">
                {group.description}
              </p>
            )}
            <p className="text-muted-foreground mt-2 text-sm">
              {group.memberCount} {group.memberCount === 1 ? "member" : "members"} ·{" "}
              {events.length} {events.length === 1 ? "event" : "events"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {group.chatUrl && (
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href={group.chatUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  />
                }
              >
                <MessageCircleIcon />
                {chatServiceName(group.chatUrl)}
              </Button>
            )}
            {view.you && (
              <Badge variant="secondary">Signed in as {view.you.name}</Badge>
            )}
            {isOwner && (
              <Button
                size="sm"
                onClick={() => navigate(`/new?group=${group.slug}`)}
              >
                <CalendarPlusIcon />
                New event
              </Button>
            )}
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {events.length === 0
              ? "No events yet."
              : "Everything this group is trying to schedule."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {events.length === 0 && isOwner && (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => navigate(`/new?group=${group.slug}`)}
            >
              <PlusIcon />
              Create the first one
            </Button>
          )}

          {events.map((ev) => {
            const met = ev.minAttendees !== null && ev.bestScore >= ev.minAttendees
            return (
              <Link
                key={ev.slug}
                to={`/${ev.slug}${groupKey && isOwner ? `?g=${groupKey}` : token ? `?t=${token}` : ""}`}
                className={cn(
                  "hover:bg-accent/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 transition-colors",
                  ev.lockedDate && "border-success/40 bg-success/5",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{ev.title}</span>
                    {ev.mode === "repeatable" && (
                      <Badge variant="muted" className="gap-1">
                        <RepeatIcon className="size-3" />
                        Repeatable
                      </Badge>
                    )}
                    {ev.lockedDate && (
                      <Badge variant="success" className="gap-1">
                        {ev.mode === "repeatable" ? (
                          <>
                            <CalendarCheckIcon className="size-3" />
                            Next {formatDayShort(ev.lockedDate)}
                          </>
                        ) : (
                          <>
                            <LockIcon className="size-3" />
                            {formatDayShort(ev.lockedDate)}
                          </>
                        )}
                      </Badge>
                    )}
                    {!ev.lockedDate && met && (
                      <Badge variant="success">
                        {ev.mode === "repeatable" ? "Ready to confirm" : "Ready to lock"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                    /{ev.slug}
                  </p>
                </div>
                <div className="text-muted-foreground text-right text-sm">
                  <div className="tabular">
                    {ev.replied}
                    {ev.rosterSize > 0 && ` / ${ev.rosterSize}`} replied
                  </div>
                  <div className="text-xs">
                    {ev.minAttendees !== null
                      ? `best ${ev.bestScore}/${ev.minAttendees}`
                      : `best ${ev.bestScore} free`}
                  </div>
                </div>
              </Link>
            )
          })}
        </CardContent>
      </Card>

      {isOwner && groupKey && (
        <OwnerControls
          slug={slug}
          groupKey={groupKey}
          view={view}
          setView={setView}
        />
      )}

      {!isOwner && view.roster.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {view.roster.map((m) => (
              <Badge key={m.id} variant="muted">
                {m.name}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ owner tools */

function OwnerControls({
  slug,
  groupKey,
  view,
  setView,
}: {
  slug: string
  groupKey: string
  view: GroupViewResponse
  setView: (v: GroupViewResponse) => void
}) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SettingsIcon className="size-4" />
          Group settings
        </CardTitle>
        <CardDescription>Only visible to you, via your admin link.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">
              Members
              {view.roster.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {view.roster.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <MembersTab slug={slug} groupKey={groupKey} view={view} setView={setView} />
          </TabsContent>
          <TabsContent value="details">
            <DetailsTab slug={slug} groupKey={groupKey} view={view} setView={setView} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function MembersTab({
  slug,
  groupKey,
  view,
  setView,
}: {
  slug: string
  groupKey: string
  view: GroupViewResponse
  setView: (v: GroupViewResponse) => void
}) {
  const [names, setNames] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const origin = window.location.origin
  const members = view.members ?? []

  async function add() {
    const list = names
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!list.length) return
    setBusy(true)
    try {
      setView(await api.addMembers(slug, groupKey, list))
      setNames("")
      toast.success(`${list.length} member${list.length === 1 ? "" : "s"} added.`)
    } catch (err) {
      toast.error("Couldn't add", err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <p className="text-muted-foreground text-sm">
        Each member gets one link that works for every event in this group, now and
        for any you create later.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="new-members">Add members</Label>
        <Textarea
          id="new-members"
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder={"One name per line"}
          rows={3}
        />
        <Button onClick={add} disabled={busy || !names.trim()} className="self-start" variant="secondary">
          {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Add
        </Button>
      </div>

      {members.length > 0 && (
        <div className="flex flex-col divide-y rounded-lg border">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              url={`${origin}/${slug}?t=${m.token}`}
              onRevoke={async () => {
                try {
                  setView(await api.removeMember(slug, groupKey, m.id))
                  toast.success(`${m.name} removed.`)
                } catch (err) {
                  toast.error(
                    "Couldn't remove",
                    err instanceof Error ? err.message : undefined,
                  )
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MemberRow({
  member,
  url,
  onRevoke,
}: {
  member: { id: string; name: string; token?: string; revoked: boolean }
  url: string
  onRevoke: () => void
}) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 p-2.5",
        member.revoked && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{member.name}</span>
        <code className="text-muted-foreground text-xs">{member.token}</code>
        {member.revoked && (
          <Badge variant="muted" className="text-[0.65rem]">
            Removed
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Copy ${member.name}'s link`}
          disabled={member.revoked}
          onClick={async () => {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
        </Button>
        {!member.revoked && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${member.name}`}
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

function DetailsTab({
  slug,
  groupKey,
  view,
  setView,
}: {
  slug: string
  groupKey: string
  view: GroupViewResponse
  setView: (v: GroupViewResponse) => void
}) {
  const [name, setName] = React.useState(view.group.name)
  const [description, setDescription] = React.useState(view.group.description)
  const [chatUrl, setChatUrl] = React.useState(view.group.chatUrl)
  const [saving, setSaving] = React.useState(false)
  const dirty =
    name !== view.group.name ||
    description !== view.group.description ||
    chatUrl !== view.group.chatUrl

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="g-name">Group name</Label>
        <Input
          id="g-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="g-desc">Description</Label>
        <Textarea
          id="g-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="g-chat">Discussion link</Label>
        <Input
          id="g-chat"
          type="url"
          value={chatUrl}
          onChange={(e) => setChatUrl(e.target.value)}
          placeholder="https://discord.gg/..."
          maxLength={500}
        />
        <p className="text-muted-foreground text-xs">
          For longer conversations that don't belong on a poll. Shown to everyone who
          can see the group. Clear the field to remove it.
        </p>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Label className="text-xs">Your admin link, keep it private</Label>
        <div className="flex gap-2">
          <Input
            readOnly
            value={`${window.location.origin}/${slug}?g=${groupKey}`}
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy admin link"
            onClick={() =>
              navigator.clipboard.writeText(
                `${window.location.origin}/${slug}?g=${groupKey}`,
              )
            }
          >
            <CopyIcon />
          </Button>
        </div>
      </div>

      <Button
        className="self-start"
        disabled={!dirty || saving}
        onClick={async () => {
          setSaving(true)
          try {
            setView(
              await api.updateGroup(slug, groupKey, { name, description, chatUrl }),
            )
            toast.success("Group updated.")
          } catch (err) {
            toast.error("Couldn't save", err instanceof Error ? err.message : undefined)
          } finally {
            setSaving(false)
          }
        }}
      >
        {saving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        Save changes
      </Button>

      <p className="text-muted-foreground text-xs">
        Created {relativeTime(view.group.createdAt)}.
      </p>
    </div>
  )
}
