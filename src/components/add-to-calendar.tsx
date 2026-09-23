import * as React from "react"
import {
  CalendarPlusIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  RssIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/toast"
import { feedUrl, googleUrl, subscribeUrl } from "@/lib/calendar"
import { formatDayLong, formatTimeRange } from "@/lib/dates"
import type { EventPublic, Slot } from "@shared/types"

interface AddToCalendarProps {
  event: EventPublic
  /**
   * The locked-in slot (or a repeatable event's next session), or null while
   * nothing is decided.
   */
  slot: Slot | null
  /** Who said yes to that slot; goes into the calendar entry's notes. */
  going: string[]
  token: string | null
  className?: string
}

/**
 * Shown once someone has replied. Before a date is locked the only useful
 * thing is a subscription, which fills itself in when the organiser decides;
 * afterwards the one-off options appear too.
 */
export function AddToCalendar({ event, slot, going, token, className }: AddToCalendarProps) {
  const [copied, setCopied] = React.useState(false)
  const repeatable = event.mode === "repeatable"
  const feed = feedUrl(event.slug, token)

  async function copyFeed() {
    try {
      await navigator.clipboard.writeText(feed)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.info("Copy this link", feed)
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarPlusIcon className="size-4" />
          Add to your calendar
        </CardTitle>
        <CardDescription>
          {slot ? (
            <>
              {repeatable && "Next session: "}
              <span className="text-foreground font-medium">
                {formatDayLong(slot.date)}
              </span>
              {" · "}
              {formatTimeRange(slot.startTime, slot.endTime)}.{" "}
              {repeatable
                ? "Add this one, or subscribe to get every session as it's confirmed."
                : "Add it once, or subscribe so it follows any change."}
            </>
          ) : repeatable ? (
            "No sessions are confirmed yet. Subscribe now and each one appears in your calendar as the organiser confirms it."
          ) : (
            "No date is fixed yet. Subscribe now and it appears in your calendar the moment the organiser locks one in."
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {slot && (
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={googleUrl(event, slot, going)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Add to Google Calendar"
                />
              }
            >
              <ExternalLinkIcon />
              Google
            </Button>
          )}
          <Button
            variant={slot ? "ghost" : "outline"}
            size="sm"
            render={<a href={subscribeUrl(event.slug, token)} />}
          >
            <RssIcon />
            Subscribe
          </Button>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy feed link"
                  onClick={copyFeed}
                />
              }
            >
              {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
            </TooltipTrigger>
            <TooltipContent>{copied ? "Copied" : "Copy feed link"}</TooltipContent>
          </Tooltip>
        </div>

        <p className="text-muted-foreground text-xs">
          Subscribe opens Apple Calendar or Outlook. For Google Calendar, copy the feed
          link and add it under <span className="text-foreground">Other calendars → From URL</span>.
        </p>
      </CardContent>
    </Card>
  )
}
