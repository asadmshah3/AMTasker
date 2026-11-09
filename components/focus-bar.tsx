"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Lightbulb, Square, Timer, X } from "lucide-react"
import type { DateKey, Task, TimeLog } from "@/lib/model/types"
import { formatMinutes } from "@/lib/domain/planning"
import { profileKey } from "@/lib/profiles"
import { StopAt } from "./stop-at"
import { minutesToLog, playChime, setFocusSession, useFocusSession, type FocusSession } from "@/lib/use-focus-timer"

const SESSION_LENGTHS = [25, 50, 0] as const
const lengthKey = () => profileKey("amtasker:focus-length")

function readLength(): number {
  try {
    const raw = localStorage.getItem(lengthKey())
    const n = Number(raw)
    return raw !== null && (SESSION_LENGTHS as readonly number[]).includes(n) ? n : 25
  } catch {
    return 25
  }
}

type AddTimeLog = (log: Pick<TimeLog, "taskId" | "start" | "end" | "source">, addToEntry: boolean) => void

/**
 * Start/stop focus sessions. Stopping records the session as a time block (for the TimeSheet)
 * and adds its minutes to the cell of the day it started.
 */
export function useFocus(tasks: Task[], onTimeLog: AddTimeLog) {
  const { session, elapsedMs } = useFocusSession()

  const log = useCallback(
    (s: FocusSession, ms: number) => {
      const minutes = minutesToLog(ms)
      if (!tasks.some((t) => t.id === s.taskId) || minutes < 1) return 0
      onTimeLog(
        {
          taskId: s.taskId,
          start: new Date(s.startedAt).toISOString(),
          end: new Date(s.startedAt + ms).toISOString(),
          source: "focus",
        },
        true,
      )
      return minutes
    },
    [tasks, onTimeLog],
  )

  const stop = useCallback(
    (save: boolean) => {
      if (!session) return 0
      const logged = save ? log(session, Date.now() - session.startedAt) : 0
      setFocusSession(null)
      return logged
    },
    [session, log],
  )

  /** Stop and log only up to `endMs` (you forgot to stop on time). */
  const stopAt = useCallback(
    (endMs: number) => {
      if (!session) return 0
      const logged = log(session, Math.max(0, endMs - session.startedAt))
      setFocusSession(null)
      return logged
    },
    [session, log],
  )

  /** Start a session now, or backdated to `startedAt` (when you'd already started without the timer). */
  const start = useCallback(
    (taskId: string, date: DateKey, startedAt: number = Date.now()) => {
      // Switching tasks logs the running session first: one thing at a time.
      if (session) log(session, Date.now() - session.startedAt)
      setFocusSession({ taskId, date, startedAt, lengthMin: readLength() })
    },
    [session, log],
  )

  return { session, elapsedMs, start, stop, stopAt }
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

interface FocusBarProps {
  session: FocusSession
  elapsedMs: number
  task: Task | undefined
  onStop: (save: boolean) => number
  onStopAt: (endMs: number) => void
  onCapture: (text: string) => void
}

/** Shown on every tab while a focus session runs: timer, stop/log, and the distraction catcher. */
export function FocusBar({ session, elapsedMs, task, onStop, onStopAt, onCapture }: FocusBarProps) {
  const [note, setNote] = useState("")
  const [captured, setCaptured] = useState(0)
  const chimed = useRef<number | null>(null)
  const lengthMs = session.lengthMin * 60_000
  const over = lengthMs > 0 && elapsedMs >= lengthMs
  const name = task?.name ?? "Deleted task"

  // Chime once when the planned session length is reached; keep counting after it.
  useEffect(() => {
    if (over && chimed.current !== session.startedAt) {
      chimed.current = session.startedAt
      playChime()
    }
  }, [over, session.startedAt])

  // The tab title shows the timer, so it is visible from other windows.
  useEffect(() => {
    const previous = document.title
    document.title = `${clock(elapsedMs)} · ${name}`
    return () => {
      document.title = previous
    }
  }, [elapsedMs, name])

  function setLength(lengthMin: number) {
    try {
      localStorage.setItem(lengthKey(), String(lengthMin))
    } catch {
      // ignore
    }
    setFocusSession({ ...session, lengthMin })
  }

  function capture(e: React.FormEvent) {
    e.preventDefault()
    const text = note.trim()
    if (!text) return
    onCapture(text)
    setNote("")
    setCaptured((n) => n + 1)
  }

  const pct = lengthMs > 0 ? Math.min(100, (elapsedMs / lengthMs) * 100) : 0

  return (
    <section
      aria-label="Focus session"
      className={`sticky top-0 z-40 overflow-hidden rounded-md border bg-card shadow-sm ${over ? "border-lime-500" : "border-primary/40"}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <Timer className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="text-[11px] text-muted-foreground">
            {over ? "Session complete — take a short break, or keep going." : "Focus on this one task."}
          </p>
        </div>
        <span className="font-mono text-xl font-semibold tabular-nums text-foreground" aria-live="off">
          {clock(elapsedMs)}
        </span>
        <div className="flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Session length">
          {SESSION_LENGTHS.map((len) => (
            <button
              key={len}
              type="button"
              role="radio"
              aria-checked={session.lengthMin === len}
              onClick={() => setLength(len)}
              className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                session.lengthMin === len
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {len ? `${len}m` : "open"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <StopAt startedAt={session.startedAt} onStopAt={onStopAt} />
          <button
            type="button"
            onClick={() => onStop(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            title={`Stop and add ${formatMinutes(minutesToLog(elapsedMs))} to today's cell`}
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            Stop &amp; log {formatMinutes(minutesToLog(elapsedMs))}
          </button>
          <button
            type="button"
            onClick={() => onStop(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Discard session without logging"
            title="Discard (don't log)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <form onSubmit={capture} className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-1.5">
        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Distracted by a thought? Jot it here (goes to Backlog) and get back to work."
          aria-label="Capture a distracting thought to the backlog"
          className="h-7 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
        {captured > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{captured} captured</span>}
      </form>
      {lengthMs > 0 && (
        <div className="h-0.5 bg-muted" aria-hidden="true">
          <div className={`h-full ${over ? "bg-lime-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </section>
  )
}
