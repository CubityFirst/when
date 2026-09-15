import { Toast as ToastPrimitive } from "@base-ui-components/react/toast"
import { CheckCircle2Icon, InfoIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export const toastManager = ToastPrimitive.createToastManager()

export const toast = {
  success: (title: string, description?: string) =>
    toastManager.add({ title, description, type: "success" }),
  error: (title: string, description?: string) =>
    toastManager.add({ title, description, type: "error" }),
  info: (title: string, description?: string) =>
    toastManager.add({ title, description, type: "info" }),
}

const ICONS = {
  success: CheckCircle2Icon,
  error: TriangleAlertIcon,
  info: InfoIcon,
} as const

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((t) => {
    const type = (t.type ?? "info") as keyof typeof ICONS
    const Icon = ICONS[type] ?? InfoIcon
    return (
      <ToastPrimitive.Root
        key={t.id}
        toast={t}
        className={cn(
          "bg-popover text-popover-foreground absolute right-0 bottom-0 left-auto z-[calc(1000-var(--toast-index))] w-[min(22rem,calc(100vw-2rem))]",
          "rounded-lg border p-4 shadow-lg select-none",
          "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+calc(var(--toast-index)*-15px)))_scale(calc(1-(var(--toast-index)*0.08)))]",
          "transition-[transform,opacity] duration-300 ease-out",
          "data-[expanded]:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+calc(var(--toast-offset-y)*-1)-calc(var(--toast-index)*var(--gap))))]",
          "data-[starting-style]:[transform:translateY(150%)] data-[starting-style]:opacity-0",
          "data-[ending-style]:opacity-0",
          "data-[ending-style]:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
          "after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        )}
        style={{ ["--gap" as string]: "0.75rem" }}
      >
        <div className="flex items-start gap-3">
          <Icon
            className={cn(
              "mt-0.5 size-4 shrink-0",
              type === "success" && "text-success",
              type === "error" && "text-destructive",
              type === "info" && "text-muted-foreground",
            )}
          />
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className="text-sm leading-tight font-medium" />
            <ToastPrimitive.Description className="text-muted-foreground mt-1 text-sm leading-snug" />
          </div>
          <ToastPrimitive.Close
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 shrink-0 rounded-sm p-1 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <XIcon className="size-3.5" />
          </ToastPrimitive.Close>
        </div>
      </ToastPrimitive.Root>
    )
  })
}

export function Toaster({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} timeout={4500}>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-[1000] mx-auto flex w-[min(22rem,calc(100vw-2rem))] outline-none">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}
