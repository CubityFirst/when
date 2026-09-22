import { googleCalendarUrl } from "@shared/calendar"
import type { EventPublic, Slot } from "@shared/types"

/**
 * Links for getting an event into someone's calendar. The feed is per event
 * and rides on the same token the page used, so gated events stay gated.
 */

function feedPath(slug: string, token: string | null, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ slug, ...extra })
  if (token) params.set("t", token)
  return `/api/event/calendar.ics?${params.toString()}`
}

/** Absolute https URL of the feed, for pasting into "add calendar from URL". */
export function feedUrl(slug: string, token: string | null): string {
  return new URL(feedPath(slug, token), window.location.origin).toString()
}

/** The same feed as a webcal: link, which Apple Calendar and Outlook open as a subscription. */
export function subscribeUrl(slug: string, token: string | null): string {
  return feedUrl(slug, token).replace(/^https?:/, "webcal:")
}

/** One-off .ics download of the locked date. */
export function downloadUrl(slug: string, token: string | null): string {
  return feedPath(slug, token, { download: "1" })
}

/** A pre-filled Google Calendar "new event" page for the locked slot. */
export function googleUrl(event: EventPublic, slot: Slot, going: string[]): string {
  return googleCalendarUrl(
    {
      title: event.title,
      description: event.description,
      timezone: event.timezone,
      url: new URL(`/${event.slug}`, window.location.origin).toString(),
      going,
    },
    slot,
  )
}
