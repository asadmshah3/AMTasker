"use client"

import { useSyncExternalStore } from "react"
import { todayKey } from "./date-utils"
import type { DateKey } from "./model/types"

function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>
  function schedule() {
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
    timer = setTimeout(() => {
      onChange()
      schedule()
    }, nextMidnight.getTime() - now.getTime())
  }
  schedule()
  // Timers are throttled in background tabs; re-check when the tab becomes visible.
  document.addEventListener("visibilitychange", onChange)
  return () => {
    clearTimeout(timer)
    document.removeEventListener("visibilitychange", onChange)
  }
}

/** Today's date key, updated at midnight. Empty string during server rendering. */
export function useToday(): DateKey {
  return useSyncExternalStore(subscribe, todayKey, () => "")
}
