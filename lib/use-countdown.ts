"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { profileKey } from "./profiles"
import { playChime } from "./use-focus-timer"

/**
 * The Logger tab's countdown (Pomodoro) timer. Independent of task logging. Kept in localStorage
 * per profile so a reload or another tab doesn't lose it; the alarm is watched by the page shell,
 * so it fires whichever tab is open.
 */
export interface CountdownState {
  durationMs: number
  label: string
  /** Running: when it reaches zero. */
  endsAt?: number
  /** Paused: what was left. */
  remainingMs?: number
  /** The endsAt the alarm already went off for (so it fires once). */
  alertedFor?: number
}

export type CountdownStatus = "idle" | "running" | "paused" | "done"

const DEFAULT: CountdownState = { durationMs: 25 * 60_000, label: "Focus" }
const key = () => profileKey("amtasker:countdown")
const EVENT = "amtasker:countdown-change"

function read(): string {
  try {
    return localStorage.getItem(key()) ?? ""
  } catch {
    return ""
  }
}

function write(state: CountdownState) {
  try {
    localStorage.setItem(key(), JSON.stringify(state))
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

function parse(raw: string): CountdownState {
  if (!raw) return DEFAULT
  try {
    const s = JSON.parse(raw) as CountdownState
    return typeof s.durationMs === "number" && s.durationMs > 0 ? s : DEFAULT
  } catch {
    return DEFAULT
  }
}

function countdownStatus(s: CountdownState, now: number): CountdownStatus {
  if (s.endsAt !== undefined) return now >= s.endsAt ? "done" : "running"
  if (s.remainingMs !== undefined) return "paused"
  return "idle"
}

function remainingOf(s: CountdownState, now: number): number {
  if (s.endsAt !== undefined) return Math.max(0, s.endsAt - now)
  if (s.remainingMs !== undefined) return s.remainingMs
  return s.durationMs
}

async function notify(label: string) {
  playChime()
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("⏰ Time's up", {
        body: `${label} timer finished`,
        tag: "amtasker-countdown",
        requireInteraction: true,
      })
    }
  } catch {
    // notifications unavailable
  }
}

/** Ask once for notification permission (needs a click, so it's called from Start). */
export function askNotificationPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission()
  } catch {
    // ignore
  }
}

export function useCountdown() {
  const raw = useSyncExternalStore(subscribe, read, () => "")
  const state = useMemo(() => parse(raw), [raw])
  const [now, setNow] = useState(() => Date.now())

  // Tick while running; fire the alarm once when it reaches zero.
  useEffect(() => {
    if (state.endsAt === undefined) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (t >= state.endsAt! && state.alertedFor !== state.endsAt) {
        write({ ...state, alertedFor: state.endsAt })
        void notify(state.label)
      }
    }
    tick()
    const id = setInterval(tick, 500)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [state])

  const status = countdownStatus(state, now)

  // While the alarm is showing, the browser tab title says so.
  useEffect(() => {
    if (status !== "done") return
    const previous = document.title
    document.title = `⏰ Time's up — ${state.label}`
    return () => {
      document.title = previous
    }
  }, [status, state.label])

  const start = useCallback(() => {
    askNotificationPermission()
    const ms = state.remainingMs ?? state.durationMs
    write({ durationMs: state.durationMs, label: state.label, endsAt: Date.now() + ms })
  }, [state])

  const pause = useCallback(() => {
    if (state.endsAt === undefined) return
    write({ durationMs: state.durationMs, label: state.label, remainingMs: Math.max(0, state.endsAt - Date.now()) })
  }, [state])

  const reset = useCallback(() => write({ durationMs: state.durationMs, label: state.label }), [state])

  const setPreset = useCallback(
    (minutes: number, label: string) => write({ durationMs: Math.round(minutes * 60_000), label }),
    [],
  )

  return { state, status, remainingMs: remainingOf(state, now), start, pause, reset, setPreset }
}

export type Countdown = ReturnType<typeof useCountdown>
