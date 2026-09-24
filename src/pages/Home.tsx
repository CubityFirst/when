import * as React from "react"
import { ArrowRightIcon, CalendarDaysIcon, KeyRoundIcon, UsersIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Link, navigate } from "@/lib/router"

/** A live, fake-data event used as the worked example on this page. */
import { DEMO_SLUG } from "@/lib/demo"

/** What a group event link looks like; only ever shown as a placeholder. */
const EXAMPLE_SLUG = "club/games-night"

const FEATURES = [
  {
    icon: CalendarDaysIcon,
    title: "Only the days that work",
    body: "You pick the dates up front, optionally with time slots. Everything else is greyed out, so nobody suggests a Tuesday you were never free on.",
  },
  {
    icon: UsersIcon,
    title: "A threshold, not a guess",
    body: "Set the number of people you actually need. Games night needs nine? The date only lights up once nine of them say yes.",
  },
  {
    icon: KeyRoundIcon,
    title: "Open link or invite tokens",
    body: "Share one link and let people type their name, or hand out single-use access tokens you can revoke at any time.",
  },
]

export function Home() {
  const [slug, setSlug] = React.useState("")

  function open(e: React.FormEvent) {
    e.preventDefault()
    const clean = slug
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/^\/+|\/+$/g, "")
    if (clean) navigate("/" + clean)
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:py-20">
      <header className="mb-14 text-center">
        <div className="bg-primary/10 text-primary ring-primary/20 mb-6 inline-flex size-12 items-center justify-center rounded-xl ring-1">
          <CalendarDaysIcon className="size-6" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Find a date everyone can
          <br className="hidden sm:block" /> actually make.
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg text-balance">
          Put your group's night out on its own link, like{" "}
          <Link
            to={`/${DEMO_SLUG}`}
            className="bg-muted hover:bg-accent rounded px-1.5 py-0.5 font-mono text-[0.9em] whitespace-nowrap underline-offset-4 transition-colors hover:underline"
          >
            when.cubityfir.st/{DEMO_SLUG}
          </Link>
          .
          <br />
          Offer only the days that suit, and let everyone vote.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="xl"
            render={<Link to="/new" />}
            className="w-full sm:w-auto"
          >
            Create an event
            <ArrowRightIcon />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="gap-3 p-5">
            <f.icon className="text-primary size-5" />
            <h2 className="font-medium">{f.title}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{f.body}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-10 gap-4 p-6">
        <div>
          <h2 className="font-medium">Already have a link?</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Enter the group and event path you were given, or try{" "}
            <Link to={`/${DEMO_SLUG}`} className="text-foreground underline underline-offset-4">
              the demo
            </Link>
            .
          </p>
        </div>
        <form onSubmit={open} className="flex flex-col gap-2 sm:flex-row">
          <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex h-9 flex-1 items-center rounded-md border pl-3 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]">
            <span className="text-muted-foreground shrink-0 text-sm select-none">
              when.cubityfir.st/
            </span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={EXAMPLE_SLUG}
              aria-label="Event link"
              className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!slug.trim()}>
            Open
          </Button>
        </form>
      </Card>

      <footer className="text-muted-foreground mt-16 text-center text-xs">
        No accounts. No email. Just a link.
      </footer>
    </div>
  )
}
