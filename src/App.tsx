import * as React from "react"
import { Tooltip } from "@base-ui-components/react/tooltip"
import { Toaster } from "@/components/ui/toast"
import { Skeleton } from "@/components/ui/skeleton"
import { Home } from "@/pages/Home"
import { NewEvent } from "@/pages/NewEvent"
import { NewGroup } from "@/pages/NewGroup"
import { EventPage } from "@/pages/EventPage"
import { GroupPage } from "@/pages/GroupPage"
import { Link, usePathname } from "@/lib/router"
import * as api from "@/lib/api"

export default function App() {
  const pathname = usePathname()
  const slug = pathname.replace(/^\/+|\/+$/g, "").toLowerCase()

  return (
    <Tooltip.Provider delay={200}>
      <Toaster>
        <div className="flex min-h-dvh flex-col">
          <TopBar />
          <main className="flex-1">
            <Route slug={slug} />
          </main>
        </div>
      </Toaster>
    </Tooltip.Provider>
  )
}

function Route({ slug }: { slug: string }) {
  if (slug === "") return <Home />
  if (slug === "new") return <NewEvent />
  if (slug === "new/group") return <NewGroup />

  // Groups own exactly one segment, so anything deeper is always an event.
  if (slug.includes("/")) return <EventPage key={slug} slug={slug} />

  // A bare segment can be either a group or a randomly-named standalone event.
  return <ResolveSlug key={slug} slug={slug} />
}

function ResolveSlug({ slug }: { slug: string }) {
  const [kind, setKind] = React.useState<"group" | "event" | null>(null)

  React.useEffect(() => {
    let cancelled = false
    api
      .resolveSlug(slug)
      .then((res) => {
        if (!cancelled) setKind(res.type)
      })
      .catch(() => {
        // Let the event page render the not-found state.
        if (!cancelled) setKind("event")
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (kind === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-9 w-72 max-w-full" />
        <Skeleton className="mt-6 h-40 rounded-xl" />
      </div>
    )
  }

  return kind === "group" ? <GroupPage slug={slug} /> : <EventPage slug={slug} />
}

function TopBar() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-6" />
          when
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            to="/new/group"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            New group
          </Link>
          <Link
            to="/new"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            New event
          </Link>
        </nav>
      </div>
    </header>
  )
}
