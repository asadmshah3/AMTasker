"use client"

import { useEffect } from "react"
import { Moon, Play, Square } from "lucide-react"
import { formatMinutes } from "@/lib/domain/planning"
import type { Activity } from "@/lib/domain/timesheet"

/**
 * A strip under the tabs that says at a glance whether time is being logged: green with a play
 * arrow while a timer runs, light red with a stop square while nothing is logged. The browser
 * tab's icon follows it, so it shows from other tabs too.
 */
export function ActivityBanner({
  activity,
  nowMs,
  taskName,
}: {
  activity: Activity
  nowMs: number
  taskName?: string
}) {
  useActivityFavicon(activity.kind)
  const since = (ms: number) => formatMinutes(Math.max(0, Math.floor((nowMs - ms) / 60_000)))

  if (activity.kind === "working") {
    return (
      <div
        className="flex items-center gap-3 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-3 py-2 text-emerald-900 dark:text-emerald-200"
        role="status"
        aria-label={`Logging: ${taskName} for ${since(activity.sinceMs)}`}
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
          <span
            className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-30 motion-reduce:animate-none"
            aria-hidden="true"
          />
          <Play className="relative ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wider">Logging</span>
          <span className="block truncate text-sm">
            <span className="font-semibold">{taskName ?? "Deleted task"}</span> ·{" "}
            <span className="font-mono tabular-nums">{since(activity.sinceMs)}</span>
          </span>
        </span>
      </div>
    )
  }

  if (activity.kind === "idle") {
    return (
      <div
        className="flex items-center gap-3 rounded-md border border-red-400/50 bg-red-500/10 px-3 py-2 text-red-900 dark:text-red-200"
        role="status"
        aria-label={`Stopped: nothing being logged for ${since(activity.sinceMs)}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-red-500 text-red-600 dark:text-red-400">
          <Square className="h-4 w-4 fill-current" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wider">Stopped</span>
          <span className="block truncate text-sm">
            Nothing being logged · <span className="font-mono tabular-nums">{since(activity.sinceMs)}</span>
          </span>
        </span>
      </div>
    )
  }

  // Before the day starts or after it was closed: not a warning.
  return (
    <div
      className="flex items-center gap-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-muted-foreground"
      role="status"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border">
        <Moon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-sm">
        {activity.kind === "closed" ? "Day closed — not logging" : "Day not started — not logging"}
      </span>
    </div>
  )
}

const ICONS: Partial<Record<Activity["kind"], string>> = {
  working:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#16a34a"/><path d="M12 9l12 7-12 7z" fill="#fff"/></svg>',
  idle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="7" fill="#dc2626"/><rect x="10" y="10" width="12" height="12" rx="1.5" fill="#fff"/></svg>',
}

/** Swap the browser tab's icon for a green play / red stop; the app icon otherwise. */
function useActivityFavicon(kind: Activity["kind"]) {
  useEffect(() => {
    const svg = ICONS[kind]
    if (!svg) return
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))
    const originals = links.map((l) => l.href)
    const href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    if (links.length) for (const l of links) l.href = href
    let added: HTMLLinkElement | null = null
    if (!links.length) {
      added = document.createElement("link")
      added.rel = "icon"
      added.href = href
      document.head.appendChild(added)
    }
    return () => {
      links.forEach((l, i) => (l.href = originals[i]))
      added?.remove()
    }
  }, [kind])
}
