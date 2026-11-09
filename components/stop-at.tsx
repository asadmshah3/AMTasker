"use client"

import { useState } from "react"
import { Clock3, X } from "lucide-react"
import { formatMinutes } from "@/lib/domain/planning"
import { parseDuration, stopAtMs } from "@/lib/domain/timesheet"

/**
 * "Stop at…": log a running session only up to when you really stopped, given either the clock
 * time you stopped or how long you actually worked (from the session's start).
 */
export function StopAt({
  startedAt,
  onStopAt,
  size = "md",
}: {
  startedAt: number
  onStopAt: (endMs: number) => void
  size?: "sm" | "md"
}) {
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState("")
  const [worked, setWorked] = useState("")
  const [error, setError] = useState("")
  const h = size === "sm" ? "h-7 text-xs" : "h-8 text-sm"
  const workedMin = parseDuration(worked)
  // Whichever box was filled in last wins (the other is cleared on input).
  const endMs = workedMin !== null ? startedAt + workedMin * 60_000 : time ? stopAtMs(startedAt, time) : null
  const minutes = endMs !== null ? Math.round((endMs - startedAt) / 60_000) : 0
  const field = `${h} rounded-md border border-input bg-background px-1.5 font-mono text-foreground outline-none focus:border-ring`

  function close() {
    setOpen(false)
    setTime("")
    setWorked("")
    setError("")
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex ${h} shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-foreground hover:bg-accent`}
        title="Forgot to stop? Log only up to when you really stopped, or how long you actually worked"
      >
        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
        Stop at…
      </button>
    )
  }

  return (
    <form
      className="flex shrink-0 flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault()
        if (worked && workedMin === null) return setError("Type minutes, e.g. 10, 45m, 1h 15m.")
        if (endMs === null) return
        if (endMs > Date.now()) {
          return setError(workedMin !== null ? "That's longer than the timer has run." : "That's in the future.")
        }
        if (endMs - startedAt < 60_000) return setError("Less than a minute after the start.")
        onStopAt(endMs)
        close()
      }}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <span className="text-xs text-muted-foreground">stopped at</span>
      <input
        type="time"
        value={time}
        onChange={(e) => {
          setTime(e.target.value)
          setWorked("")
          setError("")
        }}
        aria-label="Stopped at"
        className={field}
      />
      <span className="text-xs text-muted-foreground">or worked</span>
      <input
        autoFocus
        value={worked}
        onChange={(e) => {
          setWorked(e.target.value)
          setTime("")
          setError("")
        }}
        placeholder="10"
        maxLength={8}
        aria-label="Worked for (minutes)"
        title="Minutes from the start: 10, 45m, 1h 15m or 1:15"
        className={`${field} w-16`}
      />
      <span className="text-xs text-muted-foreground">min</span>
      <button
        type="submit"
        disabled={endMs === null}
        className={`${h} rounded-md bg-primary px-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40`}
      >
        Log {minutes > 0 ? formatMinutes(minutes) : ""}
      </button>
      <button
        type="button"
        onClick={close}
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {error && (
        <span className="text-[11px] text-destructive" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
