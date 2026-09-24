import { FlaskConicalIcon, SettingsIcon, UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DEMO_OWNER_KEY } from "@/lib/demo"
import { navigate } from "@/lib/router"

/**
 * Sits above the demo event. Switching views keeps whatever the visitor has
 * done, since the demo's state lives for as long as the page does.
 */
export function DemoBanner({ asOrganiser }: { asOrganiser: boolean }) {
  return (
    <div className="border-primary/30 bg-primary/5 mb-8 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <FlaskConicalIcon className="text-primary mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-medium">This is a demo</p>
          <p className="text-muted-foreground text-sm">
            The people are made up and nothing you do is saved. Try it out, then refresh
            to start again.
          </p>
        </div>
      </div>

      <div
        role="group"
        aria-label="Demo view"
        className="bg-muted flex shrink-0 gap-1 self-start rounded-lg p-1 sm:self-center"
      >
        <Button
          size="sm"
          variant={asOrganiser ? "ghost" : "secondary"}
          aria-pressed={!asOrganiser}
          onClick={() => navigate("/demo", { replace: true })}
        >
          <UserIcon />
          Voter view
        </Button>
        <Button
          size="sm"
          variant={asOrganiser ? "secondary" : "ghost"}
          aria-pressed={asOrganiser}
          onClick={() => navigate(`/demo?k=${DEMO_OWNER_KEY}`, { replace: true })}
        >
          <SettingsIcon />
          Organiser view
        </Button>
      </div>
    </div>
  )
}
