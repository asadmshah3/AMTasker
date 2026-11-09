"use client"

import { useState } from "react"
import { ClipboardPen, Moon, PencilLine, Play, Square, Sunrise, X } from "lucide-react"
import type { Task, WorkNote } from "@/lib/model/types"
import { formatMinutes } from "@/lib/domain/planning"
import { PAGE_WIDTH_CLASS, pageWidthStyle } from "@/lib/page-width"
import { StopAt } from "./stop-at"
import { minutesToLog } from "@/lib/use-focus-timer"
import { formatClock, isoAt, minuteIn, parseClock, parseDuration, type Activity } from "@/lib/domain/timesheet"
import { toDateKey } from "@/lib/date-utils"

interface StatusBarProps {
  /** Page side space (0–100), so the bar lines up with the page. */
  sideSpace: number
  activity: Activity
  nowMs: number
  tasks: Task[]
  colors: Map<string, string>
  onStart: (taskId: string) => void
  onStop: () => void
  /** Discard the running session without logging it. */
  onDiscard: () => void
  onStopAt: (endMs: number) => void
  onStartDay: () => void
  /** The latest "what I'm doing" line of the running session. */
  detail?: WorkNote
  onAddDetail: (text: string) => void
  /**
   * Log free time you actually spent on a task: from `startMs` until now. With `keepGoing`, a focus
   * session is started from `startMs` instead (you're still doing it).
   */
  onLogFree: (log: { taskId: string; startMs: number; endMs?: number; detail: string; keepGoing: boolean }) => void
  /** The task of your last logged block, preselected in "Log this time". */
  lastTaskId?: string
  /** "bar" (default): the fixed bar at the bottom. "card": the same content, larger, inside a page. */
  variant?: "bar" | "card"
}

function since(nowMs: number, fromMs: number): string {
  return formatMinutes(Math.max(0, Math.floor((nowMs - fromMs) / 60_000)))
}

/** Always visible at the bottom: what you're doing right now, and for how long. */
export function StatusBar({
  sideSpace,
  activity,
  nowMs,
  tasks,
  colors,
  onStart,
  onStop,
  onDiscard,
  onStopAt,
  onStartDay,
  detail,
  onAddDetail,
  onLogFree,
  lastTaskId,
  variant = "bar",
}: StatusBarProps) {
  const [editing, setEditing] = useState(false)
  const [loggingFree, setLoggingFree] = useState(false)
  const [draft, setDraft] = useState("")
  const task = activity.kind === "working" ? tasks.find((t) => t.id === activity.taskId) : undefined
  const startable = tasks.filter((t) => t.status === "active")

  let dot: string
  let text: React.ReactNode
  if (activity.kind === "working") {
    dot = colors.get(activity.taskId) ?? "#3b82f6"
    text = (
      <>
        Working on <b className="font-semibold">{task?.name ?? "a deleted task"}</b>{" "}
        <span className="font-mono tabular-nums">({since(nowMs, activity.sinceMs)})</span>
        {detail && (
          <>
            {" · "}
            <i className="text-foreground/80">{detail.text}</i>{" "}
            <span className="font-mono tabular-nums text-muted-foreground">
              ({since(nowMs, Date.parse(detail.at))})
            </span>
          </>
        )}
      </>
    )
  } else if (activity.kind === "idle") {
    dot = "#ef4444"
    text = (
      <>
        <b className="font-semibold text-red-600 dark:text-red-400">Free</b> — nothing logged{" "}
        <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
          ({since(nowMs, activity.sinceMs)})
        </span>
      </>
    )
  } else if (activity.kind === "not_started") {
    dot = "#94a3b8"
    text = <>Day not started yet · usually starts {formatClock(activity.startsAt)}</>
  } else {
    dot = "#94a3b8"
    text = (
      <>
        Day closed <span className="font-mono tabular-nums">({since(nowMs, activity.sinceMs)} ago)</span>
      </>
    )
  }

  // Same signal as the strip under the tabs: green ▶ while logging, red ■ while nothing is logged.
  const tint =
    activity.kind === "working"
      ? "border-emerald-500/60 bg-emerald-100/95 dark:bg-emerald-950/90"
      : activity.kind === "idle"
        ? "border-red-400/60 bg-red-50/95 dark:bg-red-950/85"
        : "border-border bg-card/95"

  return (
    <div
      role={variant === "bar" ? "status" : "region"}
      aria-live={variant === "bar" ? "polite" : undefined}
      aria-label={variant === "card" ? "Now" : undefined}
      className={
        variant === "bar"
          ? `fixed inset-x-0 bottom-0 z-40 border-t shadow-[0_-2px_8px_rgba(0,0,0,0.06)] backdrop-blur ${tint}`
          : `w-full rounded-md border px-2 ${tint}`
      }
      // The card is the same bar scaled up, so every control keeps working the same way.
      style={variant === "card" ? { zoom: 1.35 } : undefined}
    >
      <div
        className={
          variant === "bar"
            ? `flex h-10 items-center gap-3 text-sm ${PAGE_WIDTH_CLASS}`
            : "flex min-h-10 flex-wrap items-center gap-3 text-sm"
        }
        style={variant === "bar" ? pageWidthStyle(sideSpace) : undefined}
      >
        {activity.kind === "working" ? (
          <span
            className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
            title="Logging"
          >
            <span
              className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-30 motion-reduce:animate-none"
              aria-hidden="true"
            />
            <Play className="relative ml-px h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </span>
        ) : activity.kind === "idle" ? (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 border-red-500 text-red-600 dark:text-red-400"
            title="Stopped"
          >
            <Square className="h-3 w-3 fill-current" aria-hidden="true" />
          </span>
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />
        )}
        {loggingFree && activity.kind === "idle" ? (
          <LogFreeForm
            sinceMs={activity.sinceMs}
            nowMs={nowMs}
            tasks={startable}
            defaultTaskId={lastTaskId}
            onLog={(log) => {
              onLogFree(log)
              setLoggingFree(false)
            }}
            onCancel={() => setLoggingFree(false)}
          />
        ) : editing && activity.kind === "working" ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) onAddDetail(draft)
              setDraft("")
              setEditing(false)
            }}
          >
            <span className="shrink-0 text-xs text-muted-foreground">{task?.name ?? "Task"} ·</span>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              onBlur={() => !draft.trim() && setEditing(false)}
              maxLength={200}
              placeholder="What are you doing now? e.g. learning German articles (Enter to save, Esc to cancel)"
              aria-label="What are you doing now"
              className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </form>
        ) : (
          <p
            className="min-w-0 flex-1 truncate text-foreground"
            title={detail ? `${task?.name}: ${detail.text}` : undefined}
          >
            {text}
          </p>
        )}

        {activity.kind === "idle" && !loggingFree && startable.length > 0 && (
          <button
            type="button"
            onClick={() => setLoggingFree(true)}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-red-500/50 px-2 text-xs text-foreground hover:bg-red-500/10"
            title="You were doing something in this time? Log it to a task."
          >
            <ClipboardPen className="h-3.5 w-3.5" aria-hidden="true" />
            Log this time
          </button>
        )}

        {activity.kind === "working" && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
            title="Note what you're doing on this task right now (kept in the day's work log)"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">What now?</span>
          </button>
        )}

        {activity.kind === "not_started" && (
          <button
            type="button"
            onClick={onStartDay}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
          >
            <Sunrise className="h-3.5 w-3.5" aria-hidden="true" />
            Start my day
          </button>
        )}
        {activity.kind === "closed" && <Moon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}

        {activity.kind === "working" && !editing && (
          <StopAt startedAt={activity.sinceMs} onStopAt={onStopAt} size="sm" />
        )}
        {activity.kind === "working" ? (
          <>
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              title={`Stop and add ${formatMinutes(minutesToLog(nowMs - activity.sinceMs))} to today's cell`}
            >
              <Square className="h-3 w-3" aria-hidden="true" />
              Stop &amp; log {formatMinutes(minutesToLog(nowMs - activity.sinceMs))}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Discard session without logging"
              title="Discard (don't log)"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          !loggingFree &&
          startable.length > 0 && (
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Start</span>
              <select
                value=""
                onChange={(e) => e.target.value && onStart(e.target.value)}
                className="h-7 max-w-40 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                aria-label="Start a focus session on a task"
              >
                <option value="">task…</option>
                {startable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )
        )}
      </div>
    </div>
  )
}

const field =
  "h-7 rounded-md border border-input bg-background px-1.5 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"

interface LogFreeFormProps {
  sinceMs: number
  nowMs: number
  tasks: Task[]
  defaultTaskId?: string
  onLog: StatusBarProps["onLogFree"]
  onCancel: () => void
}

/** Inline form in the status bar: what the "free" time was really spent on. */
function LogFreeForm({ sinceMs, nowMs, tasks, defaultTaskId, onLog, onCancel }: LogFreeFormProps) {
  const day = toDateKey(new Date(sinceMs))
  const sinceClock = formatClock(Math.floor(minuteIn(day, sinceMs)))
  // Preselect what you were doing last (if it's still an active task).
  const [taskId, setTaskId] = useState(
    tasks.some((t) => t.id === defaultTaskId) ? defaultTaskId! : (tasks[0]?.id ?? ""),
  )
  const [from, setFrom] = useState(sinceClock)
  const [forText, setForText] = useState("")
  const [text, setText] = useState("")
  // Unchanged "from" keeps the exact start of the free time; an edited one is that clock time today.
  const startMs = from === sinceClock ? sinceMs : Date.parse(isoAt(day, parseClock(from)))
  const freeMinutes = Math.floor((nowMs - startMs) / 60_000)
  // "for 6m": the block lasts that long from "from" (the rest stays free); empty = until now.
  const forMin = parseDuration(forText)
  const minutes = forMin ?? freeMinutes
  const tooLong = forMin !== null && forMin > freeMinutes
  const valid = !!taskId && minutes >= 1 && !tooLong && !(forText && forMin === null)

  function submit(keepGoing: boolean) {
    if (!valid) return
    if (keepGoing) {
      // Still doing it: with a duration, you've been at it that long (timer starts that long ago).
      onLog({ taskId, startMs: forMin !== null ? nowMs - forMin * 60_000 : startMs, detail: text, keepGoing })
    } else {
      onLog({
        taskId,
        startMs,
        endMs: forMin !== null ? startMs + forMin * 60_000 : undefined,
        detail: text,
        keepGoing,
      })
    }
  }

  return (
    <form
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1"
      onSubmit={(e) => {
        e.preventDefault()
        submit(false)
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <span className="shrink-0 text-xs text-muted-foreground">I was doing</span>
      <select
        autoFocus
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
        className={`${field} max-w-36`}
        aria-label="Task"
      >
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <span className="shrink-0 text-xs text-muted-foreground">from</span>
      <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={field} aria-label="From" />
      <span className="shrink-0 text-xs text-muted-foreground">for</span>
      <input
        value={forText}
        onChange={(e) => setForText(e.target.value)}
        maxLength={8}
        placeholder={formatMinutes(Math.max(0, freeMinutes))}
        aria-label="For how long"
        title="How long you did it: 6m, 45, 1h 5m, 1:05. Empty = until now."
        className={`${field} w-16`}
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
        placeholder="what exactly (optional)"
        aria-label="What exactly"
        className={`${field} min-w-28 flex-1`}
      />
      <button
        type="submit"
        disabled={!valid}
        className="h-7 shrink-0 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        title={
          forMin !== null
            ? `Record ${formatMinutes(forMin)} from ${from} and add it to the task's cell`
            : "Record this block (until now) and add the minutes to the task's cell"
        }
      >
        Log {valid ? formatMinutes(minutes) : ""}
      </button>
      <button
        type="button"
        disabled={!valid}
        onClick={() => submit(true)}
        className="h-7 shrink-0 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent disabled:opacity-40"
        title={
          forMin !== null
            ? `Start the timer as if you began ${formatMinutes(forMin)} ago: you're still doing it`
            : "Start the timer from that time: you're still doing it"
        }
      >
        Still doing it
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {forText && forMin === null && (
        <span className="text-[11px] text-destructive">Type a duration, e.g. 6m, 1h 5m.</span>
      )}
      {tooLong && (
        <span className="text-[11px] text-destructive">Longer than the free time ({formatMinutes(freeMinutes)}).</span>
      )}
      {!forText && minutes < 1 && (
        <span className="text-[11px] text-destructive">Start must be at least a minute ago.</span>
      )}
    </form>
  )
}
