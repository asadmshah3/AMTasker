"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Bell,
  BellOff,
  CalendarDays,
  Download,
  FileText,
  FolderOpen,
  Link2Off,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sun,
  Sunset,
  Trash2,
} from "lucide-react"
import {
  QUADRANTS,
  type LoggerSection,
  type LoggerSectionId,
  type DateKey,
  type DayPlan,
  type Quadrant,
  type Settings,
  type Task,
  type TimeLog,
  type Todo,
  type WorkNote,
} from "@/lib/model/types"
import { addDays, formatLongLabel } from "@/lib/date-utils"
import {
  DAY_MINUTES,
  buildTimeline,
  formatClock,
  minuteIn,
  noteSpans,
  parseDuration,
  type Segment,
} from "@/lib/domain/timesheet"
import { formatHours, loggedMinutesOnDay, summarizePeriod } from "@/lib/domain/logger"
import { formatMinutes } from "@/lib/domain/planning"
import { downloadFile } from "@/lib/data/backup"
import { activeProfileId, profileKey, readRegistry } from "@/lib/profiles"
import {
  fileLinkSupported,
  forgetHandle,
  loadHandle,
  permissionOf,
  pickOpenFile,
  pickSaveFile,
  requestPermission,
  writeText,
  type TextFileHandle,
} from "@/lib/notepad-file"
import { askNotificationPermission, type Countdown } from "@/lib/use-countdown"

type Running = { taskId: string; startedAt: number } | null

const IDLE = "#ef4444"
const OFF_BG = "repeating-linear-gradient(45deg, var(--muted) 0 3px, transparent 3px 7px)"
const RUNNING_BG = (color: string) => `repeating-linear-gradient(135deg, ${color} 0 5px, transparent 5px 9px)`

// ---- Top row: yesterday / today / this week ------------------------------------------

export interface LoggerTotals {
  yesterday: number
  today: number
  week: number
  /** Minutes of the running timer today (not logged yet). */
  running: number
}

export function computeTotals(logs: TimeLog[], today: DateKey, running: Running, nowMs: number): LoggerTotals {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const runningToday = running
    ? Math.max(0, Math.min(minuteIn(today, nowMs), DAY_MINUTES) - Math.max(0, minuteIn(today, running.startedAt)))
    : 0
  return {
    yesterday: loggedMinutesOnDay(logs, addDays(today, -1)),
    today: loggedMinutesOnDay(logs, today),
    week: days.reduce((n, d) => n + loggedMinutesOnDay(logs, d), 0),
    running: Math.floor(runningToday),
  }
}

/** Shown on the Logger tab in place of the usual stats row. */
export function LoggerStats({ totals }: { totals: LoggerTotals }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat
        icon={<Sun className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
        color="#f59e0b"
        label="Today"
        minutes={totals.today}
        running={totals.running}
        capacity={24 * 60}
        of="24h"
        extra={
          totals.running > 0 ? (
            <span
              className="font-mono text-xs text-amber-600 dark:text-amber-400"
              title="A timer is running; it isn't logged until you stop it"
            >
              +{formatHours(totals.running)} running
            </span>
          ) : null
        }
      />
      <Stat
        icon={<Sunset className="h-3.5 w-3.5 text-violet-500" aria-hidden="true" />}
        color="#8b5cf6"
        label="Yesterday"
        minutes={totals.yesterday}
        capacity={24 * 60}
        of="24h"
      />
      <Stat
        icon={<CalendarDays className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />}
        color="#0ea5e9"
        label="This week (last 7 days)"
        minutes={totals.week}
        capacity={7 * 24 * 60}
        of="168h"
      />
    </div>
  )
}

function Stat({
  icon,
  color,
  label,
  minutes,
  running = 0,
  capacity,
  of,
  extra,
}: {
  icon: React.ReactNode
  color: string
  label: string
  minutes: number
  running?: number
  capacity: number
  of: string
  extra?: React.ReactNode
}) {
  const pct = Math.min(100, (minutes / capacity) * 100)
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-card px-2.5 py-2 sm:px-3 sm:py-2.5">
      <Ring
        pct={pct}
        runningPct={Math.min(100 - pct, (running / capacity) * 100)}
        color={color}
        label={`${label}: ${Math.round(pct)}% of ${of} logged`}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-mono text-lg font-semibold leading-none tabular-nums text-foreground">
            {formatHours(minutes)}
          </span>
          <span className="text-xs text-muted-foreground">/ {of} logged</span>
          {extra}
        </div>
        <div className="mt-1 flex items-center gap-1 truncate text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">
          {icon}
          {label}
        </div>
      </div>
    </div>
  )
}

/** Donut showing the share logged (solid) and the running timer (faded) of the period. */
function Ring({ pct, runningPct, color, label }: { pct: number; runningPct: number; color: string; label: string }) {
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-12 w-12 shrink-0" role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--muted)" strokeWidth="5" />
        {runningPct > 0 && (
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke={color}
            strokeOpacity="0.35"
            strokeWidth="5"
            strokeDasharray={`${((pct + runningPct) / 100) * c} ${c}`}
          />
        )}
        {pct > 0 && (
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap={pct < 99 ? "round" : "butt"}
            strokeDasharray={`${(pct / 100) * c} ${c}`}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold tabular-nums text-foreground">
        {Math.round(pct)}%
      </span>
    </div>
  )
}

// ---- The tab ----------------------------------------------------------------------------

interface LoggerViewProps {
  today: DateKey
  nowMs: number
  tasks: Task[]
  colors: Map<string, string>
  logs: TimeLog[]
  notes: WorkNote[]
  plans: Map<DateKey, DayPlan>
  settings: Settings
  running: Running
  notepad: string
  onNotepad: (text: string) => void
  todos: Todo[]
  onAddTodo: (text: string, quadrant: Quadrant) => void
  onUpdateTodo: (id: string, patch: Partial<Pick<Todo, "text" | "quadrant" | "done">>) => void
  onDeleteTodo: (id: string) => void
  onClearDone: (quadrant: Quadrant) => void
  countdown: Countdown
  /** The status bar's content, shown large. */
  statusCard: React.ReactNode
  /** Visibility and order of the sections. */
  sections: LoggerSection[]
  onCustomize: () => void
}

/** Names for the Logger's sections (Manage → View → Logger sections). */
export const LOGGER_SECTION_LABELS: Record<LoggerSectionId, string> = {
  hours: "Logged hours (top row)",
  lines: "Logged time (yesterday · today · week)",
  notepad: "Notepad",
  priorities: "Priorities",
  countdown: "Countdown",
  now: "Now (large status)",
}

export function LoggerView(props: LoggerViewProps) {
  // The top row ("hours") is drawn by the page above the tabs; the rest here, in your order.
  const order = props.sections.filter((s) => s.visible && s.id !== "hours").map((s) => s.id)

  function render(id: LoggerSectionId) {
    switch (id) {
      case "lines":
        return <Lines {...props} />
      case "notepad":
        return <Notepad text={props.notepad} onChange={props.onNotepad} />
      case "priorities":
        return (
          <PriorityMatrix
            todos={props.todos}
            onAdd={props.onAddTodo}
            onUpdate={props.onUpdateTodo}
            onDelete={props.onDeleteTodo}
            onClearDone={props.onClearDone}
          />
        )
      case "countdown":
        return <CountdownTimer countdown={props.countdown} />
      case "now":
        return <NowCard>{props.statusCard}</NowCard>
      default:
        return null
    }
  }

  // Countdown and Now sit side by side when they are next to each other.
  const rows: LoggerSectionId[][] = []
  for (const id of order) {
    const last = rows[rows.length - 1]
    if (
      last &&
      last.length === 1 &&
      ((last[0] === "countdown" && id === "now") || (last[0] === "now" && id === "countdown"))
    )
      last.push(id)
    else rows.push([id])
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) =>
        row.length === 2 ? (
          <div
            key={row.join("+")}
            className={`grid gap-3 ${row[0] === "countdown" ? "lg:grid-cols-[minmax(0,22rem)_1fr]" : "lg:grid-cols-[1fr_minmax(0,22rem)]"}`}
          >
            {render(row[0])}
            {render(row[1])}
          </div>
        ) : (
          <div key={row[0]} className={row[0] === "countdown" ? "max-w-md" : undefined}>
            {render(row[0])}
          </div>
        ),
      )}
      {order.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
          All Logger sections are hidden.
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={props.onCustomize}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Customize Logger
        </button>
      </div>
    </div>
  )
}

function NowCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-lg border border-border bg-card">
      <header className="border-b border-border px-3 py-2.5">
        <h2 className="font-mono text-sm font-semibold text-foreground">Now</h2>
      </header>
      <div className="flex flex-1 items-center p-3">{children}</div>
    </section>
  )
}

// ---- Three lines: yesterday, today, this week ----------------------------------------------

function Lines({ today, nowMs, tasks, colors, logs, notes, plans, settings, running }: LoggerViewProps) {
  // Fixed to the window (not inside the box), so showing it never changes the section's size.
  const [tip, setTip] = useState<{ x: number; y: number; vw: number; vh: number; text: string } | null>(null)
  const yesterday = addDays(today, -1)
  const name = (id?: string) => tasks.find((t) => t.id === id)?.name ?? "Deleted task"
  const week = useMemo(
    () =>
      summarizePeriod(
        tasks,
        logs,
        Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)),
      ),
    [tasks, logs, today],
  )

  function show(e: React.MouseEvent, text: string) {
    setTip({ x: e.clientX, y: e.clientY, vw: window.innerWidth, vh: window.innerHeight, text })
  }

  function dayLine(day: DateKey, label: string, withRunning: boolean) {
    const tl = buildTimeline(day, logs, plans.get(day), settings, nowMs)
    const spans = noteSpans(day, notes, logs, withRunning ? running : null, nowMs)
    const pct = (m: number) => (Math.min(DAY_MINUTES, Math.max(0, m)) / DAY_MINUTES) * 100
    const describe = (s: Segment) => {
      const range = `${formatClock(s.from)}–${formatClock(s.to)}`
      const len = formatMinutes(s.to - s.from)
      if (s.kind === "task") {
        const details = spans
          .filter((sp) => sp.note.taskId === s.taskId && sp.from >= s.from && sp.from < s.to)
          .map((sp) => sp.note.text)
        return `${name(s.taskId)} (${len}) · ${range}${details.length ? ` — ${details.join(" → ")}` : ""}`
      }
      if (s.kind === "idle") return `Nothing logged (${len}) · ${range}`
      return `Off / sleep (${len}) · ${range}`
    }
    const runFrom = running && withRunning ? Math.max(0, minuteIn(day, running.startedAt)) : null
    const runTo = withRunning ? Math.min(DAY_MINUTES, minuteIn(day, nowMs)) : 0
    const logged = loggedMinutesOnDay(logs, day)
    return (
      <div className="grid grid-cols-[6.5rem_1fr_7rem] items-center gap-2">
        <span className="text-xs">
          <span className="block font-medium text-foreground">{label}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{formatLongLabel(day)}</span>
        </span>
        <div className="relative h-7 overflow-hidden rounded-sm border border-border bg-background">
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <span
              key={h}
              className="absolute top-0 h-full w-px bg-border"
              style={{ left: `${pct(h * 60)}%` }}
              aria-hidden="true"
            />
          ))}
          {tl.segments
            .filter((s) => s.kind !== "future")
            .map((s) => (
              <span
                key={`${s.from}-${s.kind}`}
                className="absolute top-0 h-full"
                style={{
                  left: `${pct(s.from)}%`,
                  width: `${pct(s.to) - pct(s.from)}%`,
                  background: s.kind === "task" ? colors.get(s.taskId!) : s.kind === "idle" ? IDLE : OFF_BG,
                  opacity: s.kind === "idle" ? 0.35 : 1,
                }}
                onMouseMove={(e) => show(e, describe(s))}
                aria-label={describe(s)}
              />
            ))}
          {runFrom !== null && runTo > runFrom && (
            <span
              className="absolute top-0 h-full"
              style={{
                left: `${pct(runFrom)}%`,
                width: `${pct(runTo) - pct(runFrom)}%`,
                background: RUNNING_BG(colors.get(running!.taskId) ?? "#f59e0b"),
              }}
              onMouseMove={(e) =>
                show(e, `${name(running!.taskId)} — running (${formatMinutes(runTo - runFrom)}), not logged yet`)
              }
              aria-label={`${name(running!.taskId)} running`}
            />
          )}
          {withRunning && (
            <span
              className="absolute top-0 h-full w-0.5 bg-foreground"
              style={{ left: `${pct(minuteIn(day, nowMs))}%` }}
              aria-hidden="true"
            />
          )}
        </div>
        <span className="text-right font-mono text-[11px] tabular-nums text-foreground">
          {formatHours(logged)} <span className="text-muted-foreground">/ 24h</span>
        </span>
      </div>
    )
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="font-mono text-sm font-semibold text-foreground">Logged time</h2>
        <p className="text-[11px] text-muted-foreground">
          Hover for the task, time and what you did · striped = timer running (not logged yet)
        </p>
      </header>
      <div className="space-y-2 p-3" onMouseLeave={() => setTip(null)}>
        <div className="grid grid-cols-[6.5rem_1fr_7rem] gap-2">
          <span />
          <div className="relative h-3">
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
              <span
                key={h}
                className="absolute -translate-x-1/2 font-mono text-[9px] text-muted-foreground"
                style={{ left: `${(h / 24) * 100}%` }}
              >
                {String(h).padStart(2, "0")}
              </span>
            ))}
          </div>
          <span />
        </div>
        {dayLine(today, "Today", true)}
        {dayLine(yesterday, "Yesterday", false)}
        <div className="grid grid-cols-[6.5rem_1fr_7rem] items-center gap-2">
          <span className="text-xs">
            <span className="block font-medium text-foreground">This week</span>
            <span className="font-mono text-[10px] text-muted-foreground">last 7 days, by task</span>
          </span>
          <div className="relative flex h-7 overflow-hidden rounded-sm border border-border bg-muted/40">
            {week.byTask.map((t) => (
              <span
                key={t.taskId}
                className="h-full"
                style={{ width: `${(t.minutes / week.capacity) * 100}%`, background: colors.get(t.taskId) }}
                onMouseMove={(e) =>
                  show(
                    e,
                    `${name(t.taskId)} — ${formatHours(t.minutes)} on ${t.days} day${t.days === 1 ? "" : "s"} · ${Math.round((t.minutes / Math.max(1, week.logged)) * 100)}% of logged time`,
                  )
                }
                aria-label={`${name(t.taskId)} ${formatHours(t.minutes)}`}
              />
            ))}
            <span
              className="h-full flex-1"
              onMouseMove={(e) => show(e, `Not logged — ${formatHours(week.capacity - week.logged)} of 168h`)}
              aria-label="Not logged"
            />
          </div>
          <span className="text-right font-mono text-[11px] tabular-nums text-foreground">
            {formatHours(week.logged)} <span className="text-muted-foreground">/ 168h</span>
          </span>
        </div>
      </div>
      {/* Outside the spaced list: space-y would add a top margin to it and move the rows. */}
      {tip && (
        <div
          className="pointer-events-none fixed z-50 max-w-md rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{
            left: Math.max(8, Math.min(tip.x + 12, tip.vw - 300)),
            ...(tip.y > tip.vh - 90 ? { bottom: tip.vh - tip.y + 12 } : { top: tip.y + 16 }),
          }}
          role="tooltip"
        >
          {tip.text}
        </div>
      )}
    </section>
  )
}

// ---- Notepad ----------------------------------------------------------------------------------

function Notepad({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const profileId = activeProfileId()
  const [handle, setHandle] = useState<TextFileHandle | null>(null)
  const [needsPermission, setNeedsPermission] = useState(false)
  const [fileState, setFileState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const supported = fileLinkSupported()
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Remember the height you drag the notepad to (per profile, in this browser).
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const heightKey = profileKey("amtasker:notepad-height")
    try {
      const saved = Number(localStorage.getItem(heightKey))
      if (saved >= 80) area.style.height = `${saved}px`
    } catch {
      // ignore
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          localStorage.setItem(heightKey, String(Math.round(area.offsetHeight)))
        } catch {
          // ignore
        }
      }, 300)
    })
    observer.observe(area)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  // Restore the linked file (if any) for this profile.
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    loadHandle(profileId)
      .then(async (h) => {
        if (cancelled || !h) return
        setHandle(h)
        setNeedsPermission((await permissionOf(h)) !== "granted")
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [profileId, supported])

  // Save into the linked file a moment after typing stops.
  useEffect(() => {
    if (!handle || needsPermission) return
    const t = setTimeout(() => {
      setFileState("saving")
      writeText(handle, text).then(
        () => setFileState("saved"),
        () => setFileState("error"),
      )
    }, 800)
    return () => clearTimeout(t)
  }, [text, handle, needsPermission])

  const profileName = readRegistry().profiles.find((p) => p.id === profileId)?.name ?? "notes"
  const lines = text ? text.split("\n").length : 0
  const btn =
    "inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent disabled:opacity-40"

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Notepad
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono">
            {lines} lines · {text.length} chars · saved in app
          </span>
          {supported && handle && !needsPermission && (
            <span className="font-mono" title="Every change is also written to this file">
              · {fileState === "error" ? "⚠ couldn't write" : fileState === "saving" ? "saving…" : "↳"} {handle.name}
            </span>
          )}
          {supported && handle && needsPermission && (
            <button
              type="button"
              onClick={async () => {
                if (await requestPermission(handle)) setNeedsPermission(false)
              }}
              className={`${btn} border-amber-500/60`}
            >
              Allow saving to {handle.name}
            </button>
          )}
          {supported && (
            <>
              <button
                type="button"
                className={btn}
                onClick={async () => {
                  try {
                    const h = await pickSaveFile(profileId, `amtasker-${profileName}-notes.txt`)
                    setHandle(h)
                    setNeedsPermission(false)
                    await writeText(h, text)
                    setFileState("saved")
                  } catch {
                    // cancelled
                  }
                }}
                title="Choose a .txt file; the notepad is saved into it automatically from now on"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save to file…
              </button>
              <button
                type="button"
                className={btn}
                onClick={async () => {
                  try {
                    const { handle: h, text: t } = await pickOpenFile(profileId)
                    if (text && !window.confirm("Replace the notepad with the file's contents?")) return
                    setHandle(h)
                    setNeedsPermission((await permissionOf(h)) !== "granted")
                    onChange(t)
                  } catch {
                    // cancelled
                  }
                }}
                title="Load a .txt file into the notepad and keep saving into it"
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> Open file…
              </button>
              {handle && (
                <button
                  type="button"
                  className={btn}
                  onClick={async () => {
                    await forgetHandle(profileId).catch(() => {})
                    setHandle(null)
                    setFileState("idle")
                  }}
                  title="Stop saving into the file (the file stays on disk)"
                >
                  <Link2Off className="h-3.5 w-3.5" aria-hidden="true" /> Unlink
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className={btn}
            onClick={() => downloadFile(`amtasker-${profileName}-notes.txt`, text, "text/plain;charset=utf-8")}
            disabled={!text}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download .txt
          </button>
        </div>
      </header>
      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="Paste anything here: notes, code snippets, URLs… It's saved as you type."
        aria-label="Notepad"
        className="block h-72 w-full resize-y bg-background px-3 py-2 font-mono text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
      />
    </section>
  )
}

// ---- Priority matrix (Eisenhower) -------------------------------------------------------------

const QUADRANT_META: Record<Quadrant, { title: string; sub: string; border: string; head: string; dot: string }> = {
  do: {
    title: "Do first",
    sub: "Important · Urgent",
    border: "border-red-500/50",
    head: "bg-red-500/10 text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
  schedule: {
    title: "Schedule",
    sub: "Important · Not urgent",
    border: "border-blue-500/50",
    head: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  delegate: {
    title: "Delegate",
    sub: "Not important · Urgent",
    border: "border-amber-500/50",
    head: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  eliminate: {
    title: "Eliminate",
    sub: "Not important · Not urgent",
    border: "border-slate-400/50",
    head: "bg-slate-400/10 text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400",
  },
}

const HIDE_DONE_KEY = "amtasker:priorities-hide-done"

function PriorityMatrix({
  todos,
  onAdd,
  onUpdate,
  onDelete,
  onClearDone,
}: {
  todos: Todo[]
  onAdd: LoggerViewProps["onAddTodo"]
  onUpdate: LoggerViewProps["onUpdateTodo"]
  onDelete: (id: string) => void
  onClearDone: (q: Quadrant) => void
}) {
  const [over, setOver] = useState<Quadrant | null>(null)
  // One switch for all four boxes; remembered per profile in this browser.
  const [hideDone, setHideDone] = useState(() => {
    try {
      return localStorage.getItem(profileKey(HIDE_DONE_KEY)) === "1"
    } catch {
      return false
    }
  })
  function toggleHideDone(hide: boolean) {
    setHideDone(hide)
    try {
      localStorage.setItem(profileKey(HIDE_DONE_KEY), hide ? "1" : "0")
    } catch {
      // ignore
    }
  }
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="font-mono text-sm font-semibold text-foreground">Priorities</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => toggleHideDone(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Hide done
          </label>
          <p className="text-[11px] text-muted-foreground">Drag items between quadrants · click text to edit</p>
        </div>
      </header>
      <div className="grid gap-2 p-2 md:grid-cols-2">
        {QUADRANTS.map((q) => {
          const meta = QUADRANT_META[q]
          const items = todos.filter((t) => t.quadrant === q)
          const doneCount = items.filter((t) => t.done).length
          return (
            <div
              key={q}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(q)
              }}
              onDragLeave={() => setOver((o) => (o === q ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                const id = e.dataTransfer.getData("text/todo-id")
                if (id) onUpdate(id, { quadrant: q })
              }}
              className={`flex min-h-40 flex-col rounded-md border-2 ${meta.border} ${over === q ? "ring-2 ring-ring" : ""}`}
            >
              <div className={`flex items-center justify-between gap-2 rounded-t px-2.5 py-1.5 ${meta.head}`}>
                <span className="text-sm font-semibold">
                  {meta.title} <span className="text-[11px] font-normal opacity-80">· {meta.sub}</span>
                </span>
                {doneCount > 0 && (
                  <span className="flex items-center gap-1">
                    {hideDone && <span className="text-[11px] opacity-70">{doneCount} done hidden</span>}
                    <button
                      type="button"
                      onClick={() => onClearDone(q)}
                      className="rounded px-1.5 text-[11px] hover:bg-background/60"
                    >
                      Clear done ({doneCount})
                    </button>
                  </span>
                )}
              </div>
              <ul className="flex-1 space-y-0.5 p-1.5">
                {items
                  .filter((t) => !hideDone || !t.done)
                  .map((t) => (
                    <TodoItem key={t.id} todo={t} dot={meta.dot} onUpdate={onUpdate} onDelete={onDelete} />
                  ))}
              </ul>
              <AddTodo onAdd={(text) => onAdd(text, q)} placeholder={`Add to ${meta.title.toLowerCase()}…`} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TodoItem({
  todo,
  dot,
  onUpdate,
  onDelete,
}: {
  todo: Todo
  dot: string
  onUpdate: LoggerViewProps["onUpdateTodo"]
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <li
      draggable={!editing}
      onDragStart={(e) => e.dataTransfer.setData("text/todo-id", todo.id)}
      className="group flex items-start gap-2 rounded px-1.5 py-1 hover:bg-accent/50"
    >
      <input
        type="checkbox"
        checked={todo.done}
        onChange={(e) => onUpdate(todo.id, { done: e.target.checked })}
        className="mt-1 h-3.5 w-3.5 shrink-0 accent-primary"
        aria-label={todo.done ? "Mark not done" : "Mark done"}
      />
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {editing ? (
        <input
          autoFocus
          defaultValue={todo.text}
          onBlur={(e) => {
            onUpdate(todo.id, { text: e.target.value })
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") setEditing(false)
          }}
          aria-label="Edit item"
          className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-sm text-foreground outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`min-w-0 flex-1 cursor-text whitespace-pre-wrap break-words text-left text-sm ${todo.done ? "text-muted-foreground line-through" : "text-foreground"}`}
          title="Click to edit · drag to move"
        >
          {todo.text}
        </button>
      )}
      <select
        value={todo.quadrant}
        onChange={(e) => onUpdate(todo.id, { quadrant: e.target.value as Quadrant })}
        className="h-6 w-6 shrink-0 cursor-pointer appearance-none rounded bg-transparent text-center text-[10px] text-muted-foreground opacity-0 hover:bg-accent focus:opacity-100 group-hover:opacity-100"
        aria-label="Move to quadrant"
        title="Move to…"
      >
        {QUADRANTS.map((q) => (
          <option key={q} value={q}>
            {QUADRANT_META[q].title}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onDelete(todo.id)}
        className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
        aria-label={`Delete ${todo.text}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  )
}

function AddTodo({ onAdd, placeholder }: { onAdd: (text: string) => void; placeholder: string }) {
  const [text, setText] = useState("")
  return (
    <form
      className="flex items-center gap-1 border-t border-border p-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        onAdd(text)
        setText("")
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
        aria-label="Add"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  )
}

// ---- Countdown (Pomodoro) ------------------------------------------------------------------------

const PRESETS: { label: string; minutes: number }[] = [
  { label: "Focus", minutes: 25 },
  { label: "Short break", minutes: 5 },
  { label: "Long break", minutes: 15 },
  { label: "Deep focus", minutes: 50 },
]

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return h ? `${h}:${mmss}` : mmss
}

function CountdownTimer({ countdown }: { countdown: Countdown }) {
  const { state, status, remainingMs, start, pause, reset, setPreset } = countdown
  const [custom, setCustom] = useState("")
  const [perm, setPerm] = useState<string>(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  )
  const pct = state.durationMs ? Math.min(100, ((state.durationMs - remainingMs) / state.durationMs) * 100) : 0
  const busy = status === "running" || status === "paused"
  const big = "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium"

  return (
    <section
      className={`rounded-lg border bg-card ${status === "done" ? "border-red-500 ring-2 ring-red-500/40" : "border-border"}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="font-mono text-sm font-semibold text-foreground">Countdown</h2>
        {perm === "granted" ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Bell className="h-3.5 w-3.5" aria-hidden="true" /> notification on
          </span>
        ) : perm === "denied" || perm === "unsupported" ? (
          <span
            className="flex items-center gap-1 text-[11px] text-muted-foreground"
            title="Allow notifications for this site in the browser's settings to get one"
          >
            <BellOff className="h-3.5 w-3.5" aria-hidden="true" /> chime only
          </span>
        ) : (
          <button
            type="button"
            onClick={async () => {
              askNotificationPermission()
              setTimeout(() => setPerm(Notification.permission), 1500)
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-foreground hover:bg-accent"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden="true" /> Enable notification
          </button>
        )}
      </header>
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={busy}
              onClick={() => setPreset(p.minutes, p.label)}
              aria-pressed={!busy && state.label === p.label && state.durationMs === p.minutes * 60_000}
              className="h-7 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent disabled:opacity-40 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {p.label} {p.minutes}m
            </button>
          ))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              const n = parseDuration(custom)
              if (n !== null && n > 0 && n <= 24 * 60) {
                setPreset(n, "Timer")
                setCustom("")
              }
            }}
          >
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              disabled={busy}
              placeholder="min"
              maxLength={8}
              aria-label="Custom length"
              title="Any length: 10, 45m, 1h 30m or 1:30"
              className="h-7 w-20 rounded-md border border-input bg-background px-1.5 text-center font-mono text-xs text-foreground outline-none focus:border-ring disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={busy || !custom}
              className="h-7 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent disabled:opacity-40"
            >
              Set
            </button>
          </form>
        </div>

        <div className="text-center">
          <div
            className={`font-mono text-6xl font-semibold tabular-nums ${status === "done" ? "animate-pulse text-red-600 dark:text-red-400" : "text-foreground"}`}
            aria-live="off"
          >
            {status === "done" ? "00:00" : clock(remainingMs)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {status === "done"
              ? `⏰ ${state.label} — time's up`
              : status === "paused"
                ? `${state.label} · paused`
                : status === "running"
                  ? `${state.label} · running`
                  : `${state.label} · ready`}
          </p>
          <div className="mx-auto mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className={`h-full ${status === "done" ? "bg-red-500" : "bg-primary"}`}
              style={{ width: `${status === "done" ? 100 : pct}%` }}
            />
          </div>
        </div>

        <div className="flex justify-center gap-2">
          {status === "running" ? (
            <button
              type="button"
              onClick={pause}
              className={`${big} border border-border text-foreground hover:bg-accent`}
            >
              <Pause className="h-4 w-4" aria-hidden="true" /> Pause
            </button>
          ) : status !== "done" ? (
            <button
              type="button"
              onClick={start}
              className={`${big} bg-primary text-primary-foreground hover:opacity-90`}
            >
              <Play className="h-4 w-4" aria-hidden="true" /> {status === "paused" ? "Resume" : "Start"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={reset}
            disabled={status === "idle"}
            className={`${big} border border-border text-foreground hover:bg-accent disabled:opacity-40`}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> {status === "done" ? "Done" : "Stop"}
          </button>
        </div>
      </div>
    </section>
  )
}
