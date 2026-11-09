"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { DateKey } from "./model/types"
import { profileKey } from "./profiles"

/** A running focus session. Kept in localStorage so a reload or a closed tab doesn't lose it. */
export interface FocusSession {
  taskId: string
  /** The day the minutes are logged to (the day the session started). */
  date: DateKey
  startedAt: number
  /** Session length in minutes; 0 = open-ended. */
  lengthMin: number
}

// Per profile: each person has their own running session.
const key = () => profileKey("amtasker:focus")
const EVENT = "amtasker:focus-change"

function read(): string | null {
  try {
    return localStorage.getItem(key())
  } catch {
    return null
  }
}

function parse(raw: string | null): FocusSession | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as FocusSession
    return typeof s.taskId === "string" && typeof s.startedAt === "number" ? s : null
  } catch {
    return null
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(EVENT, onChange)
  }
}

export function setFocusSession(session: FocusSession | null): void {
  try {
    if (session) localStorage.setItem(key(), JSON.stringify(session))
    else localStorage.removeItem(key())
  } catch {
    // Storage unavailable: the session still works until the page is closed.
  }
  window.dispatchEvent(new Event(EVENT))
}

/** The current focus session (null when none). Re-renders every second while one runs. */
export function useFocusSession(): { session: FocusSession | null; elapsedMs: number } {
  const raw = useSyncExternalStore(subscribe, read, () => null)
  const session = useMemo(() => parse(raw), [raw])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!session) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [session])

  return { session, elapsedMs: session ? Math.max(0, now - session.startedAt) : 0 }
}

/** Whole minutes to log for an elapsed time (rounded to the nearest minute). */
export function minutesToLog(elapsedMs: number): number {
  return Math.round(elapsedMs / 60_000)
}

/** A short two-tone chime, so the end of a session is noticed without a notification permission. */
export function playChime(): void {
  try {
    const ctx = new AudioContext()
    for (const [freq, at] of [
      [880, 0],
      [660, 0.25],
    ]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.15, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.4)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + 0.4)
    }
    setTimeout(() => void ctx.close(), 1000)
  } catch {
    // No audio available.
  }
}
