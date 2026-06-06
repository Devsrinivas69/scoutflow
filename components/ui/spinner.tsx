import * as React from "react"
import { cn } from "@/lib/utils"

export function Spinner({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("animate-spin rounded-full border-4 border-current border-t-transparent text-primary h-8 w-8", className)} {...props} />
  )
}
