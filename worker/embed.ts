import {
  ActionRow,
  Container,
  LinkButton,
  TextDisplay,
  h,
  toComponentEmbedScript,
  type EmbedElement,
} from "discord-component-embed"
import { format, parseISO } from "date-fns"
import type { EventPublic, GroupViewResponse, Slot, SlotTally } from "../shared/types"
import { chatServiceName } from "../shared/types"

/**
 * Link previews for Discord. When someone pastes a group or event link, Discord
 * reads a component embed from the page's HTML and draws it in place of the
 * Open Graph card. The SPA's index.html has no per-page content, so the worker
 * builds the card from the database and writes it into the HTML it serves.
 */

/** A decided date, or a group's best-supported one. */
const GREEN = 0x22c55e
const NEUTRAL = 0x71717a

export interface Preview {
  title: string
  description: string
  /** The `<script>` tag, or null when the card failed Discord's rules. */
  card: string | null
}

function clip(text: string, max: number): string {
  const flat = text.trim()
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + "…" : flat
}

/** Discord renders markdown in a text display, so user text has its syntax escaped. */
function md(text: string): string {
  return text
    .replace(/([\\*_~`|#[\]<])/g, "\\$1")
    .replace(/^(\s*)([->])/gm, "$1\\$2")
}

function day(iso: string): string {
  return format(parseISO(iso), "EEE d MMM")
}

function time(slot: Pick<Slot, "startTime" | "endTime">): string {
  const { startTime, endTime } = slot
  if (startTime && endTime) return `${startTime} – ${endTime}`
  if (startTime) return `from ${startTime}`
  if (endTime) return `until ${endTime}`
  return ""
}

function when(slot: Slot): string {
  const t = time(slot)
  const label = slot.label ? ` (${md(clip(slot.label, 40))})` : ""
  return `**${day(slot.date)}**${t ? `, ${t}` : ""}${label}`
}

function toScript(root: EmbedElement): string | null {
  try {
    return toComponentEmbedScript(root)
  } catch (err) {
    // Discord would drop the card anyway; the Open Graph tags still stand.
    console.error("Component embed rejected:", err)
    return null
  }
}

function chatButton(url: string, pageUrl: string) {
  if (!url || url === pageUrl) return null
  return h(LinkButton, { url, label: clip(chatServiceName(url), 80) })
}

function turnout(e: EventPublic, t: SlotTally): string {
  const parts = [`${t.yes} in`]
  if (t.maybe) parts.push(`${t.maybe} maybe`)
  let line = parts.join(", ")
  if (e.minAttendees !== null) line += ` · ${t.score}/${e.minAttendees} needed`
  if (t.full) line += " · full"
  else if (t.spotsLeft !== null) line += ` · ${t.spotsLeft} left`
  return line
}

/** The status block: the chosen date if there is one, otherwise the leaders. */
function eventStatus(e: EventPublic): string {
  const tally = new Map(e.tallies.map((t) => [t.slotId, t]))

  if (e.mode === "oneoff" && e.lockedSlotId) {
    const slot = e.slots.find((s) => s.id === e.lockedSlotId)
    if (slot) {
      const t = tally.get(slot.id)
      return `✅ **It's on:** ${when(slot)}${t ? `\n-# ${t.yes} going` : ""}`
    }
  }

  const lines: string[] = []
  if (e.mode === "repeatable" && e.confirmedSlotIds.length) {
    const next = e.slots.find((s) => s.id === e.confirmedSlotIds[0])
    if (next) lines.push(`✅ **Next session:** ${when(next)}`)
  }

  const ranked = e.slots
    .map((slot) => ({ slot, t: tally.get(slot.id) }))
    .filter((r): r is { slot: Slot; t: SlotTally } => !!r.t && r.t.score > 0)
    .sort((a, b) => b.t.score - a.t.score || a.slot.date.localeCompare(b.slot.date))
    .slice(0, 3)

  if (ranked.length) {
    lines.push(lines.length ? "**Also popular**" : "**Leading so far**")
    for (const { slot, t } of ranked) {
      lines.push(`- ${when(slot)}${t.meetsQuorum ? " ✅" : ""}\n  -# ${turnout(e, t)}`)
    }
  } else if (!lines.length) {
    const n = e.slots.length
    lines.push(n ? `${n} date${n === 1 ? "" : "s"} to choose from. Nobody has answered yet.` : "No dates offered yet.")
  }
  return lines.join("\n")
}

function eventFooter(e: EventPublic): string {
  const bits: string[] = []
  if (e.roster.length) {
    const replied = e.roster.filter((r) => r.replied).length
    bits.push(`${replied} of ${e.roster.length} members replied`)
  } else {
    const n = e.participants.length
    bits.push(`${n} ${n === 1 ? "reply" : "replies"}`)
  }
  if (e.group) bits.push(md(clip(e.group.name, 60)))
  return "-# " + bits.join(" · ")
}

export function eventPreview(
  e: EventPublic,
  urls: { page: string; calendar: string },
): Preview {
  const decided =
    (e.mode === "oneoff" && !!e.lockedSlotId) || e.confirmedSlotIds.length > 0
  const status = eventStatus(e)
  const description = clip(e.description, 240)

  const chat = chatButton(e.chatUrl || e.group?.chatUrl || "", urls.page)
  const card = h(
    Container,
    { accentColor: decided || e.tallies.some((t) => t.meetsQuorum) ? GREEN : NEUTRAL },
    h(TextDisplay, null, `# ${md(clip(e.title, 100))}${description ? "\n" + md(description) : ""}`),
    h(TextDisplay, null, status),
    h(TextDisplay, null, eventFooter(e)),
    h(
      ActionRow,
      null,
      h(LinkButton, { url: urls.page, label: e.closed ? "See the result" : "Vote" }),
      decided ? h(LinkButton, { url: urls.calendar, label: "Add to calendar" }) : null,
      chat,
    ),
  )

  const summary = decided
    ? status.split("\n")[0].replace(/[*✅]/g, "").trim()
    : `Vote on ${e.slots.length} date${e.slots.length === 1 ? "" : "s"}.`
  return {
    title: e.title,
    description: clip(description || summary, 200),
    card: toScript(card),
  }
}

/** For a gated event opened without a token: nothing past what the group page shows. */
export function gatedEventPreview(
  groupName: string | null,
  pageUrl: string,
): Preview {
  const where = groupName ? ` in **${md(clip(groupName, 60))}**` : ""
  const text =
    `# A private event${where}\n` +
    "Open it with your access link to see the dates and vote."
  return {
    title: groupName ? `An event in ${groupName}` : "A private event",
    description: "Open it with your access link to see the dates and vote.",
    card: toScript(
      h(
        Container,
        { accentColor: NEUTRAL },
        h(TextDisplay, null, text),
        h(ActionRow, null, h(LinkButton, { url: pageUrl, label: "Open" })),
      ),
    ),
  }
}

export function groupPreview(view: GroupViewResponse, origin: string, pageUrl: string): Preview {
  const g = view.group
  const description = clip(g.description, 240)
  const members = `${g.memberCount} member${g.memberCount === 1 ? "" : "s"}`

  // Open events first, newest first within each, as the group page lists them.
  const events = [...view.events]
    .sort((a, b) => Number(a.closed) - Number(b.closed) || b.createdAt - a.createdAt)
    .slice(0, 4)
  const lines = events.map((ev) => {
    const title = `[${md(clip(ev.title, 60))}](${origin}/${ev.slug})`
    let status: string
    if (ev.lockedDate) status = `✅ ${day(ev.lockedDate)}`
    else if (ev.bestDate) status = `best so far ${day(ev.bestDate)}`
    else status = "no answers yet"
    const replied = ev.rosterSize ? ` · ${ev.replied}/${ev.rosterSize} replied` : ""
    return `- ${title}\n  -# ${status}${replied}`
  })
  const more = view.events.length - events.length

  const card = h(
    Container,
    { accentColor: NEUTRAL },
    h(TextDisplay, null, `# ${md(clip(g.name, 80))}${description ? "\n" + md(description) : ""}`),
    lines.length
      ? h(TextDisplay, null, lines.join("\n") + (more > 0 ? `\n-# and ${more} more` : ""))
      : null,
    h(TextDisplay, null, `-# ${members}`),
    h(
      ActionRow,
      null,
      h(LinkButton, { url: pageUrl, label: "Open group" }),
      chatButton(g.chatUrl, pageUrl),
    ),
  )

  const count = view.events.length
  return {
    title: g.name,
    description: clip(
      description || `${members} · ${count} event${count === 1 ? "" : "s"}`,
      200,
    ),
    card: toScript(card),
  }
}
