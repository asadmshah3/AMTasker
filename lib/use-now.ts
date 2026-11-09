"use client"

import { useEffect, useState } from "react"

/** The current time in ms, refreshed every `intervalMs` and when the tab becomes visible again. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, intervalMs)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [intervalMs])
  return now
}
