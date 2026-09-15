import { Progress as ProgressPrimitive } from "@base-ui-components/react/progress"
import { cn } from "@/lib/utils"
import type * as React from "react"

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("w-full", className)}
      {...props}
    >
      <ProgressPrimitive.Track className="bg-secondary relative h-2 w-full overflow-hidden rounded-full">
        <ProgressPrimitive.Indicator
          className={cn(
            "bg-primary h-full w-full transition-all duration-500 ease-out",
            indicatorClassName,
          )}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
