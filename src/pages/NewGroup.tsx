import * as React from "react"
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import * as api from "@/lib/api"
import { Link, navigate } from "@/lib/router"
import { cn } from "@/lib/utils"
import { validateGroupSlug } from "@shared/types"
import type { GroupMember } from "@shared/types"

export function NewGroup() {
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [chatUrl, setChatUrl] = React.useState("")
  const [customLink, setCustomLink] = React.useState(false)
  const [slug, setSlug] = React.useState("")
  const [memberNames, setMemberNames] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const [slugState, setSlugState] = React.useState<{
    checking: boolean
    ok: boolean | null
    reason: string | null
  }>({ checking: false, ok: null, reason: null })

  const [created, setCreated] = React.useState<{
    slug: string
    groupKey: string
    members: GroupMember[]
  } | null>(null)

  React.useEffect(() => {
    if (!customLink) {
      setSlugState({ checking: false, ok: null, reason: null })
      return
    }
    const clean = slug.trim().toLowerCase()
    if (!clean) {
      setSlugState({ checking: false, ok: null, reason: null })
      return
    }
    const invalid = validateGroupSlug(clean)
    if (invalid) {
      setSlugState({ checking: false, ok: false, reason: invalid })
      return
    }
    setSlugState({ checking: true, ok: null, reason: null })
    const id = setTimeout(async () => {
      try {
        const res = await api.checkSlug(clean, { kind: "group" })
        setSlugState({ checking: false, ok: res.available, reason: res.reason })
      } catch {
        setSlugState({ checking: false, ok: null, reason: null })
      }
    }, 400)
    return () => clearTimeout(id)
  }, [slug, customLink])

  const members = React.useMemo(
    () =>
      memberNames
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [memberNames],
  )

  const canSubmit =
    !!name.trim() && (!customLink || slugState.ok === true) && !submitting

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await api.createGroup({
        slug: customLink ? slug.trim().toLowerCase() : undefined,
        name: name.trim(),
        description: description.trim(),
        chatUrl: chatUrl.trim(),
        memberNames: members,
      })
      api.keys.setGroup(res.slug, res.groupKey)
      setCreated(res)
    } catch (err) {
      toast.error(
        "Couldn't create the group",
        err instanceof Error ? err.message : undefined,
      )
      setSubmitting(false)
    }
  }

  if (created) return <GroupCreated created={created} />

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <Button variant="ghost" size="sm" render={<Link to="/" />} className="mb-6 -ml-2">
        <ArrowLeftIcon />
        Back
      </Button>

      <h1 className="text-3xl font-semibold tracking-tight">Create a group</h1>
      <p className="text-muted-foreground mt-2">
        A group owns its part of the address and keeps the same people across every
        event you schedule.
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>The group</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Thursday board games crew"
                maxLength={80}
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="desc">Description (optional)</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
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
                Discord, Slack, WhatsApp, anywhere the group already talks. Shown on
                the group and on every event in it.
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
                  Off: we'll generate a short random one for you.
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
                    when.cubityfir.st/
                  </span>
                  <Input
                    value={slug}
                    onChange={(e) =>
                      setSlug(e.target.value.toLowerCase().replace(/[\s/]+/g, "-"))
                    }
                    placeholder="thursday-club"
                    maxLength={40}
                    aria-label="Group link"
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
                <p className="text-muted-foreground text-xs">
                  Your events then live at{" "}
                  <code className="text-foreground">
                    {slug || "thursday-club"}/whatever
                  </code>
                  , and nobody else can use that prefix.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="size-4" />
              Members (optional)
            </CardTitle>
            <CardDescription>
              Each gets one link that works for every event in the group. You can add
              more later.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Textarea
              value={memberNames}
              onChange={(e) => setMemberNames(e.target.value)}
              placeholder={"Alice\nBob\nCharlie"}
              rows={5}
            />
            {members.length > 0 && (
              <Badge variant="secondary" className="self-start">
                {members.length} member{members.length === 1 ? "" : "s"}
              </Badge>
            )}
          </CardContent>
        </Card>

        <Button type="submit" size="lg" disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2Icon className="animate-spin" />
              Creating…
            </>
          ) : (
            <>
              Create group
              <CheckIcon />
            </>
          )}
        </Button>
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

function GroupCreated({
  created,
}: {
  created: { slug: string; groupKey: string; members: GroupMember[] }
}) {
  const [ack, setAck] = React.useState(false)
  const origin = window.location.origin
  const adminUrl = `${origin}/${created.slug}?g=${created.groupKey}`

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-20">
      <div className="bg-success/10 text-success ring-success/20 mb-6 inline-flex size-12 items-center justify-center rounded-xl ring-1">
        <CheckIcon className="size-6" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Group created</h1>
      <p className="text-muted-foreground mt-2">
        You own <code className="text-foreground">/{created.slug}</code>. Every event
        you make under it is run from this one admin link.
      </p>

      <Card className="mt-8">
        <CardContent className="flex flex-col gap-4">
          <CopyRow label="Your admin link, save it now" value={adminUrl} />
          <p className="text-warning text-xs">
            This is the only time it's shown. Without it you can't add events, manage
            members or lock in dates.
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch checked={ack} onCheckedChange={setAck} />
            I've saved the admin link somewhere safe
          </label>
        </CardContent>
      </Card>

      {created.members.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Member links</CardTitle>
            <CardDescription>
              One each. These work for every event in the group.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {created.members.map((m) => (
              <CopyRow
                key={m.id}
                label={m.name}
                value={`${origin}/${created.slug}?t=${m.token}`}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Button
        size="lg"
        className="mt-8 w-full"
        disabled={!ack}
        onClick={() => navigate(`/${created.slug}?g=${created.groupKey}`)}
      >
        Go to my group
      </Button>
    </div>
  )
}
