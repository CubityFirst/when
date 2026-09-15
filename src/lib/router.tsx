import * as React from "react"

/** Fires whenever the SPA location changes, including push/replace. */
const LOCATION_EVENT = "when:navigate"

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState({}, "", to)
  else window.history.pushState({}, "", to)
  window.dispatchEvent(new Event(LOCATION_EVENT))
}

export function usePathname(): string {
  const subscribe = React.useCallback((cb: () => void) => {
    window.addEventListener("popstate", cb)
    window.addEventListener(LOCATION_EVENT, cb)
    return () => {
      window.removeEventListener("popstate", cb)
      window.removeEventListener(LOCATION_EVENT, cb)
    }
  }, [])

  return React.useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => "/",
  )
}

export function useSearchParams(): URLSearchParams {
  const subscribe = React.useCallback((cb: () => void) => {
    window.addEventListener("popstate", cb)
    window.addEventListener(LOCATION_EVENT, cb)
    return () => {
      window.removeEventListener("popstate", cb)
      window.removeEventListener(LOCATION_EVENT, cb)
    }
  }, [])

  const search = React.useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  )
  return React.useMemo(() => new URLSearchParams(search), [search])
}

export function Link({
  to,
  children,
  ...props
}: React.ComponentProps<"a"> & { to: string }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(to)
      }}
      {...props}
    >
      {children}
    </a>
  )
}
