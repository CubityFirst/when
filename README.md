# when

Group availability polling on a custom slug — <https://when.cubityfir.st>

Put a group's night out on its own link (`when.cubityfir.st/club/games-night`), offer only the
days that suit, and let people vote. A date is only "on" once a minimum number of
people have said yes.

## What it does

### Groups own their prefix

The first path segment is a **group**: `/club` owns everything under `/club/...`.

- **Claim on first use** — creating `/club/games-night` when `club` is unclaimed
  makes the group and hands you its admin key. Nobody else can then add events
  under `club`.
- **One roster, every event** — a member gets a single token that works for every
  event in the group, including ones created later. Revoking removes them group-wide.
- **Who hasn't answered** — group events list the roster and show who is still
  outstanding, which is the point when you need 9 of 12.
- **One admin key** — the group key administers the group and all of its events, so
  there's no second secret per event.
- **A discussion link** — Discord, Slack, WhatsApp, whatever the group already uses.
  Shown on the group and on every event in it, for conversations that don't belong
  in a poll. Only `http(s)` URLs are stored.

Groups are optional: an event can stand alone with its own key.

### Events

- **Links are optional** — leave it blank and you get a short random one
  (`/kqf3mvt`, or `/club/kqf3mvt` inside a group). Or pick your own.
  Reserved first segments: `api`, `new`, `group(s)`, `event(s)`, `assets`, `static`,
  `about`, `_`.
- **Pre-selected days** — the organiser picks the dates. Everything else renders
  greyed out and struck through, and the server refuses votes for any slot that isn't
  part of the event.
- **Its own discussion link** — any event can carry one, including a
  standalone event with no group. It leads in the header, and the group's link is
  offered beside it when the two differ, so an event thread and the group channel
  can coexist. Same `http(s)`-only sanitising as the group's.
- **Times** — "Same time on every day" sets one start/end across all offered days;
  individual days can still carry several slots that are voted on separately, or stay
  as a single all-day option.
- **Picking days in bulk** — shift-click a range, or use the *Every Mon/Tue/…* chips
  with a horizon (4 weeks to 6 months) to offer every Tuesday, or every Wed + Thu +
  Sun, across as many months as you need. Pressing an active chip clears them again.
- **The calendar opens on today's month**, with today marked by a dot.
- **Calendar is the primary control** — click a day to cycle your answer
  in → maybe → can't → clear, and **shift-click to apply it across a range**.
  On a day with several time slots the click sets all of them; the per-slot
  toggles below stay in sync either way. Shift-click also works when picking
  the offered days, where it selects the whole range.
- **Long lists stay short** — the date lists and the day editor clamp to 3.5 entries,
  so the next one is half-visible rather than cut off cleanly, with a "Show all"
  toggle. Rows are measured, so uneven heights still land on a half-row. Name lists
  stop after three with a "+N more".
- **"Can't" is optional.** Leave it on when everyone has to attend and a single no
  kills the date; switch it off when you are only counting heads, and voters get
  yes/maybe only. Turning it off strips the option from the calendar cycle, the
  quick-fill row and the legend, and clears any "can't" answers already given so
  nothing is left that nobody can change. The server refuses "no" for such an event
  rather than storing it.
- **Three access modes**
  - *Open* — anyone with the link types their own name.
  - *Token* — one-off `abc-def-ghi` codes for this event only, revocable.
  - *Members only* — uses the group roster; no new links to hand out. A members-only
    request without a group is rejected rather than quietly downgraded to public.
- **A floor, a ceiling, or neither** — both optional.
  - *Minimum* — the number needed to make it worth doing (e.g. 9 for a games night).
    A date only turns green once it's met, with "maybe" optionally counting. Leave it
    off and dates are simply ranked by turnout.
  - *Maximum* — how many can actually play. Counted from **"in" votes only**, never
    maybes. A slot shows spots remaining, then "Full"; anyone past the cap is listed
    as a waiting list, in the order they said yes. Raising the cap promotes them.
- **One-off or repeatable** — chosen when the event is made and changeable later.
  - *One-off*: once a date has enough people the organiser can lock it, which closes
    voting and pins the result to the top of the page.
  - *Repeatable*: voting never closes. The organiser confirms any number of sessions,
    the next one is pinned to the top, and past days drop off the calendar (their
    votes are kept). Switching a locked one-off event to repeatable turns the locked
    date into the first session.
- **Ask everyone to re-check** — when plans change, the organiser can ask for fresh
  answers on the same page. Everyone's answers stay and keep counting, but each
  person sees a prompt and shows as "not re-checked" until they save again. On a
  one-off event this also releases the locked date.
- **Removing a date keeps its votes** — the day is hidden, not deleted, and adding it
  back brings its votes with it.
- **Add to your calendar** — once you've replied, the event page offers a calendar
  subscription for the event. It is empty until the organiser locks a date in, at
  which point the entry appears in your calendar by itself, with the time in the
  event's timezone, who's going in the notes and a link back. Unlocking removes it
  again, and re-locking a different day moves it. A repeatable event's feed carries
  one entry per confirmed session, including ones that have already happened. Once a date is locked there is
  also a one-off *Google Calendar* button for everyone, voter or not. A slot with a start but no end is shown as two hours; an end earlier than
  the start rolls over to the next morning. Gated events need the same token on the
  feed URL as on the page.

## Demo data

`/club` is a live demo group with twelve made-up members and two events — a
members-only one with a 9-person threshold, and an open one with no minimum. The
front page links to it.

```bash
OLD_KEYS=<previous group key> node scripts/seed.mjs
```

It refuses to clobber an existing `/club` unless you pass the old key.

## Accessibility and mobile

- **Answering is one card**: your name, the calendar, and Save. The per-date list is
  collapsed behind *Answer each date individually*, so most people never open it —
  it exists for dates carrying more than one time slot, and says so when there are any.
- **Answering is never all-or-nothing.** One marked date is enough to save; the rest
  stay genuinely blank rather than counting as a no. *Reset* sits with the quick-fill
  buttons, and someone who has already replied can clear everything to withdraw.
- **Vote states never rely on hue alone.** "In" is a solid fill, "maybe" is dotted and
  "can't" is diagonally striped; the legend swatches carry the same textures. Day numbers carry a
  drop shadow so they stay readable on top of the patterns.
- **Phone layout** is checked at 360px (the Android floor) as well as 390–430. Cards
  reorder so the form comes first, controls are 44px tall, and there is no horizontal
  scroll. The calendar is width-capped so it does not balloon on a desktop monitor.

## Auth model

No accounts. Three secrets, all opaque random strings:

| Key | Who holds it | Where it lives |
| --- | --- | --- |
| Group key | The group owner | Shown **once**, in `?g=`; SHA-256 hashed. Administers the group and every event in it |
| Owner key | A standalone event's creator | Shown **once**, in `?k=`; SHA-256 hashed |
| Member token | Each group member | Plaintext (the owner must be able to hand it out), sent as `?t=`; works across the whole group |
| Access token | A one-off event guest | Plaintext, `?t=`, scoped to a single event |
| Edit key | A voter in an open event | Returned on first vote, kept in `localStorage`, lets them come back and edit |

Keys are also cached in `localStorage` per slug so a return visit doesn't need the
query string. Losing the owner key means the event can't be administered again — the
creation screen makes you confirm you've saved it.

## Stack

- **shadcn/ui on [Base UI](https://base-ui.com)** (`@base-ui-components/react`) —
  shadcn's default primitives since July 2026. Components live in
  `src/components/ui/` and are ours to edit. Base UI uses `render` where Radix used
  `asChild`.
- Tailwind v4 (CSS-first config in `src/index.css`), React 19, Vite 6
- Cloudflare Worker + Hono for the API, D1 for storage, static assets served by the
  Worker's assets binding with SPA fallback

The month calendar (`src/components/month-calendar.tsx`) is hand-built on `date-fns`
— Base UI has no calendar primitive, and voting is tri-state per slot rather than
selection, so a date-picker wouldn't have fit anyway.

## API

Slugs contain slashes, so they travel as a **query parameter** rather than a path
wildcard — a greedy `:slug{.+}` swallows sub-resource segments like `/tokens/:id`.

| Method | Route | Auth |
| --- | --- | --- |
| `GET` | `/api/slug-available?slug=&kind=` | — |
| `GET` | `/api/resolve?slug=` | — |
| `POST` | `/api/groups` | — |
| `GET` | `/api/group?slug=&t=` | group key for the owner view |
| `PATCH` | `/api/group?slug=` | group |
| `POST` | `/api/group/members?slug=` | group |
| `DELETE` | `/api/group/members/:id?slug=` | group |
| `DELETE` | `/api/group?slug=` | group |
| `POST` | `/api/events` | group key, if the prefix is claimed |
| `GET` | `/api/event?slug=&t=&e=` | token, if the event is gated |
| `GET` | `/api/event/calendar.ics?slug=&t=&download=` | token, if the event is gated |
| `POST` | `/api/event/vote?slug=` | token, if gated |
| `PATCH` | `/api/event?slug=` | owner |
| `POST` | `/api/event/lock?slug=` | owner (one-off events) |
| `POST` | `/api/event/sessions?slug=` | owner (repeatable events) |
| `POST` | `/api/event/recheck?slug=` | owner |
| `POST` | `/api/event/tokens?slug=` | owner |
| `DELETE` | `/api/event/tokens/:tokenId?slug=` | owner |
| `DELETE` | `/api/event/participants/:id?slug=` | owner |
| `DELETE` | `/api/event?slug=` | owner |

Keys travel as `x-owner-key` / `x-group-key` headers, or `?k=` / `?g=` in links.
Non-owner responses never include tokens or edit keys.

Groups and events share one slug namespace, so `/club` resolves unambiguously.
A single-segment path could be either, so the SPA asks `/api/resolve`; anything with
a slash is always an event.

## Development

Setup, how to run the test scripts, and the commit convention are in
[CONTRIBUTING.md](./CONTRIBUTING.md).

```bash
npm install
npm run db:local          # apply schema.sql to the local D1
npx wrangler dev          # worker + assets on :8787
npm run dev               # optional: Vite HMR on :5173, proxying /api to :8787
```

## Deploy

```bash
npm run db:remote         # only when schema.sql changes
npm run deploy            # builds, then wrangler deploy
```

The custom domain `when.cubityfir.st` is declared in `wrangler.jsonc`, so Cloudflare
provisions DNS and the certificate on deploy.

## Migrations

`schema.sql` is the whole schema for a fresh database. Incremental changes live in
`migrations/` and are applied in order:

```bash
npx wrangler d1 execute when-db --remote --file=./migrations/002_groups.sql
```

## Schema notes

`min_attendees` and `max_attendees` store `0` for "unset" and the API maps that to
`null`; SQLite can't cheaply make an existing `NOT NULL` column nullable.

The capacity split is presentational: every "in" vote is stored, and `yes` is the
true count. The tally divides the yes-voters at the cap into `yesNames` and
`waitlistNames`, so lowering or raising the cap just re-slices them and never
discards a vote.

`slots` is one row per votable option — a whole day (`start_time IS NULL`) or a time
slot within one. Editing an event's dates keeps the row id for any day/time that
survives, so existing votes are preserved; only genuinely removed slots cascade their
votes away.

## Licence

[PolyForm Noncommercial 1.0.0](./LICENSE.md) — use, modify and share it freely for any
noncommercial purpose. Commercial use needs a separate licence from the copyright holder.
