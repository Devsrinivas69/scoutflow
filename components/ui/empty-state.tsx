import * as React from "react"
import { Button } from "./button"

interface EmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  icon?: string
}

export function EmptyState({ title, description, actionLabel, onAction, icon = "inbox" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-muted/10 border border-border border-dashed rounded-xl my-4">
      <span className="material-symbols-outlined text-5xl text-muted-foreground/50 mb-4">{icon}</span>
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-base text-muted-foreground mb-6 max-w-md">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
