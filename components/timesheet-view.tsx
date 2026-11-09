"use client"

import { useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ListTree, Pencil, Plus, Trash2 } from "lucide-react"
import {
  entryId,
  type DateKey,
  type DayPlan,
  type EntryIndex,
  type Settings,
  type Task,
  type TimeLog,
  type WorkNote,
} from "@/lib/model/types"
import { STATUS_META } from "./status"
import { formatLongLabel, formatRangeLabel } from "@/lib/date-utils"
import { formatMinutes, spentMinutes } from "@/lib/domain/planning"
import {
  DAY_MINUTES,
  buildTimeline,
  formatClock,
  isoAt,
  logsOnDay,
  minuteIn,
  noteSpans,
  parseClock,
  parseDuration,
  weekDays,
  type DayTimeline,
  type NoteSpan,
  type Segment,
} from "@/lib/domain/timesheet"

type PlanPatch = Partial<Omit<DayPlan, "date" | "updatedAt">>

interface TimeSheetViewProps {
  today: DateKey
  nowMs: number
  tasks: Task[]
  colors: Map<string, string>
  entries: EntryIndex
  plans: Map<DateKey, DayPlan>
  logs: TimeLog[]
  settings: Settings
  rowOrder: Settings["rowOrder"]
  onPlan: (date: DateKey, patch: PlanPatch) => void
  onAddLog: (log: Pick<TimeLog, "taskId" | "start" | "end" | "source">, addToEntry: boolean) => void
  onDeleteLog: (id: string) => void
  onUpdateLog: (id: string, start: string, end: string) => void
  onShowFullDay: (value: boolean) => void
  notes: WorkNote[]
  running: { taskId: string; startedAt: number } | null
  onAddNote: (taskId: string, text: string, at: Date) => void
  onUpdateNote: (id: string, text: string) => void
  onDeleteNote: (id: string) => void
}

const IDLE = "#ef4444"
const OFF_BG = "repeating-linear-gradient(45deg, var(--muted) 0 3px, transparent 3px 7px)"

/** How you spent each day, midnight to midnight: one coloured timeline per day. */
export function TimeSheetView({
  today,
  nowMs,
  tasks,
  colors,
  entries,
  plans,
  logs,
  settings,
  rowOrder,
  onPlan,
  onAddLog,
  onDeleteLog,
  onUpdateLog,
  onShowFullDay,
  notes,
  running,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}: TimeSheetViewProps) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<DateKey>(today)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const days = useMemo(() => weekDays(today, page), [today, page])
  const timelines = useMemo(
    () => days.map((d) => buildTimeline(d, logs, plans.get(d), settings, nowMs)),
    [days, logs, plans, settings, nowMs],
  )
  const spansByDay = useMemo(
    () => new Map(days.map((d) => [d, noteSpans(d, notes, logs, running, nowMs)])),
    [days, notes, logs, running, nowMs],
  )
  const rows = rowOrder === "oldest" ? timelines : [...timelines].reverse()
  const taskName = (id?: string) => tasks.find((t) => t.id === id)?.name ?? "Deleted task"

  // Visible span: the whole day, or (sleep hidden) from the earliest start to the latest end/activity, in whole hours.
  const full = settings.showFullDay
  let spanFrom = 0
  let spanTo = DAY_MINUTES
  if (!full) {
    spanFrom = DAY_MINUTES
    spanTo = 0
    for (const t of timelines) {
      const first = t.segments.find((s) => s.kind === "task" || s.kind === "idle")
      const last = [...t.segments].reverse().find((s) => s.kind === "task" || s.kind === "idle")
      spanFrom = Math.min(spanFrom, t.window.start, first?.from ?? DAY_MINUTES)
      spanTo = Math.max(spanTo, t.window.end, last?.to ?? 0)
    }
    spanFrom = Math.floor(spanFrom / 60) * 60
    spanTo = Math.min(DAY_MINUTES, Math.ceil(spanTo / 60) * 60)
    if (spanTo <= spanFrom) {
      spanFrom = 0
      spanTo = DAY_MINUTES
    }
  }
  const span = spanTo - spanFrom
  const pct = (m: number) => ((Math.min(spanTo, Math.max(spanFrom, m)) - spanFrom) / span) * 100
  const hours: number[] = []
  const step = span > 12 * 60 ? 120 : 60
  for (let h = spanFrom; h <= spanTo; h += step) hours.push(h)

  function label(seg: Segment, day: DateKey): string {
    const range = `${formatClock(seg.from)}–${formatClock(seg.to)}`
    const len = formatMinutes(seg.to - seg.from)
    if (seg.kind === "task") {
      const details = (spansByDay.get(day) ?? [])
        .filter((s) => s.note.taskId === seg.taskId && s.from >= seg.from && s.from < seg.to)
        .map((s) => s.note.text)
      return `${taskName(seg.taskId)} (${len}) · ${range}${details.length ? ` — ${details.join(" → ")}` : ""}`
    }
    if (seg.kind === "idle") return `Nothing logged (${len}) · ${range}`
    if (seg.kind === "off") return `Off / sleep (${len}) · ${range}`
    return `Later today · ${range}`
  }

  function showTip(e: React.MouseEvent, text: string) {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text })
  }

  const usedTasks = tasks.filter((t) => timelines.some((tl) => tl.byTask.has(t.id)))
  const selectedTimeline = timelines.find((t) => t.day === selected)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-2 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            className="inline-flex h-7 items-center rounded-md px-2 text-foreground hover:bg-accent"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-40 text-center font-mono text-sm font-medium text-foreground">
            {formatRangeLabel(days[0], days[days.length - 1])}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="inline-flex h-7 items-center rounded-md px-2 text-foreground hover:bg-accent disabled:opacity-40"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          {page > 0 && (
            <button
              type="button"
              onClick={() => {
                setPage(0)
                setSelected(today)
              }}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Today
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-foreground">
          <input
            type="checkbox"
            checked={full}
            onChange={(e) => onShowFullDay(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Show full 24 hours (incl. sleep / off hours)
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {usedTasks.map((t) => (
            <span key={t.id} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors.get(t.id) }} aria-hidden="true" />
              {t.name}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: IDLE }} aria-hidden="true" />
            Nothing logged
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-sm border border-border"
              style={{ background: OFF_BG }}
              aria-hidden="true"
            />
            Off / sleep
          </span>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="font-mono text-sm font-semibold text-foreground">Time sheet</h2>
          <p className="text-[11px] text-muted-foreground">
            Hover a block for details · click a day to see its blocks, add time, or set when the day started.
          </p>
        </header>
        <div ref={wrapRef} className="relative overflow-x-auto px-3 py-3" onMouseLeave={() => setTip(null)}>
          <div className="min-w-[44rem]">
            {/* Hour ruler (same columns and padding as the day rows) */}
            <div className="grid grid-cols-[7.5rem_1fr_9rem] gap-2 px-1">
              <span />
              <div className="relative h-4">
                {hours.map((h) => (
                  <span
                    key={h}
                    className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground"
                    style={{ left: `${pct(h)}%` }}
                  >
                    {formatClock(h)}
                  </span>
                ))}
              </div>
              <span />
            </div>
            <ul className="mt-1 space-y-1.5">
              {rows.map((tl) => {
                // Days before you started logging time (no blocks, no marked start) aren't judged.
                const tracked = tl.logged > 0 || tl.window.startMarked || tl.day === today
                return (
                  <li key={tl.day}>
                    <button
                      type="button"
                      onClick={() => setSelected(tl.day)}
                      aria-pressed={selected === tl.day}
                      className={`grid w-full grid-cols-[7.5rem_1fr_9rem] items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent/60 ${
                        selected === tl.day ? "bg-accent" : ""
                      }`}
                    >
                      <span
                        className={`font-mono text-xs ${tl.day === today ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                      >
                        {formatLongLabel(tl.day)}
                        {tl.window.startMarked && (
                          <span className="ml-1 text-[9px] text-muted-foreground" title="Day start marked">
                            ▸{formatClock(tl.window.start)}
                          </span>
                        )}
                      </span>
                      <div className="relative h-6 overflow-hidden rounded-sm border border-border bg-background">
                        {hours.map((h) => (
                          <span
                            key={h}
                            className="absolute top-0 h-full w-px bg-border"
                            style={{ left: `${pct(h)}%` }}
                            aria-hidden="true"
                          />
                        ))}
                        {!tracked && (
                          <span className="absolute inset-0 flex items-center justify-center bg-muted/50 text-[10px] text-muted-foreground">
                            Not tracked
                          </span>
                        )}
                        {tracked &&
                          tl.segments
                            .filter((s) => s.to > spanFrom && s.from < spanTo && s.kind !== "future")
                            .map((s) => (
                              <span
                                key={`${s.from}-${s.kind}`}
                                className="absolute top-0 h-full"
                                style={{
                                  left: `${pct(s.from)}%`,
                                  width: `${pct(s.to) - pct(s.from)}%`,
                                  background:
                                    s.kind === "task" ? colors.get(s.taskId!) : s.kind === "idle" ? IDLE : OFF_BG,
                                  opacity: s.kind === "idle" ? 0.55 : 1,
                                }}
                                onMouseMove={(e) => showTip(e, label(s, tl.day))}
                                aria-label={label(s, tl.day)}
                              />
                            ))}
                        {tl.day === today && (
                          <span
                            className="absolute top-0 h-full w-0.5 bg-foreground"
                            style={{ left: `${pct(minuteIn(today, nowMs))}%` }}
                            title="Now"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <span className="text-right font-mono text-[11px] tabular-nums">
                        {tracked ? (
                          <>
                            <span className="text-foreground">{formatMinutes(tl.logged)}</span>
                            <span className="text-muted-foreground"> logged</span>
                            {tl.idle >= 1 && (
                              <span className="block text-red-600 dark:text-red-400">
                                {formatMinutes(tl.idle)} nothing
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          {tip && (
            <div
              className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
              style={{ left: tip.x + 12, top: tip.y + 12 }}
              role="tooltip"
            >
              {tip.text}
            </div>
          )}
        </div>
      </section>

      {selectedTimeline && (
        <DayDetails
          key={selected}
          timeline={selectedTimeline}
          today={today}
          tasks={tasks}
          colors={colors}
          entries={entries}
          plan={plans.get(selected)}
          logs={logs}
          settings={settings}
          onPlan={(patch) => onPlan(selected, patch)}
          onAddLog={onAddLog}
          onDeleteLog={onDeleteLog}
          onUpdateLog={onUpdateLog}
        />
      )}

      {selectedTimeline && (
        <WorkLog
          key={`log-${selected}`}
          timeline={selectedTimeline}
          today={today}
          tasks={tasks}
          colors={colors}
          entries={entries}
          spans={spansByDay.get(selected) ?? []}
          running={running}
          onAddNote={onAddNote}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
        />
      )}
    </div>
  )
}

interface DayDetailsProps {
  timeline: DayTimeline
  today: DateKey
  tasks: Task[]
  colors: Map<string, string>
  entries: EntryIndex
  plan: DayPlan | undefined
  logs: TimeLog[]
  settings: Settings
  onPlan: (patch: PlanPatch) => void
  onAddLog: TimeSheetViewProps["onAddLog"]
  onDeleteLog: (id: string) => void
  onUpdateLog: (id: string, start: string, end: string) => void
}

const input =
  "h-7 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"

/** One day: when it started/ended, where the time went, and its time blocks. */
function DayDetails({
  timeline,
  today,
  tasks,
  colors,
  entries,
  plan,
  logs,
  settings,
  onPlan,
  onAddLog,
  onDeleteLog,
  onUpdateLog,
}: DayDetailsProps) {
  const [editingLog, setEditingLog] = useState<string | null>(null)
  const [editFrom, setEditFrom] = useState("")
  const [editTo, setEditTo] = useState("")
  const { day, window } = timeline
  const pieces = logsOnDay(logs, day)
  const active = tasks.filter((t) => t.status !== "archived")
  const [taskId, setTaskId] = useState(active[0]?.id ?? "")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const fromMin = from ? parseClock(from) : NaN
  const toMin = to ? parseClock(to) : NaN
  const valid = !!taskId && toMin > fromMin

  // Time recorded in the grid for this day that isn't placed on the clock (typed in, not timed).
  const unplaced = tasks
    .map((t) => ({
      task: t,
      minutes: spentMinutes(t, entries.get(entryId(t.id, day))) - (timeline.byTask.get(t.id) ?? 0),
    }))
    .filter((u) => u.minutes >= 1)

  function setEdge(which: "dayStartAt" | "dayEndAt", value: string) {
    onPlan({ [which]: value ? isoAt(day, parseClock(value)) : undefined })
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="font-mono text-sm font-semibold text-foreground">{formatLongLabel(day)}</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            Day started
            <input
              type="time"
              defaultValue={window.startMarked ? formatClock(window.start) : ""}
              onBlur={(e) => setEdge("dayStartAt", e.target.value)}
              className={input}
              aria-label="Day started at"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Day ended
            <input
              type="time"
              defaultValue={window.endMarked && window.end < DAY_MINUTES ? formatClock(window.end) : ""}
              onBlur={(e) => setEdge("dayEndAt", e.target.value)}
              className={input}
              aria-label="Day ended at"
            />
          </label>
          {day === today && !plan?.dayStartAt && (
            <button
              type="button"
              onClick={() => onPlan({ dayStartAt: new Date().toISOString() })}
              className="h-7 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
            >
              Mark start now
            </button>
          )}
          <span className="text-[11px]">
            Unmarked days use your usual {settings.dayStart}–{settings.dayEnd} (Manage → View).
          </span>
        </div>
      </header>

      <div className="grid gap-4 p-3 md:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Where the time went
          </h3>
          <ul className="space-y-1 text-sm">
            {[...timeline.byTask.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([id, minutes]) => (
                <li key={id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: colors.get(id) }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-foreground">
                      {tasks.find((t) => t.id === id)?.name ?? "Deleted task"}
                    </span>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-foreground">{formatMinutes(minutes)}</span>
                </li>
              ))}
            <li className="flex items-center justify-between gap-2 border-t border-border pt-1">
              <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: IDLE }} aria-hidden="true" />
                Nothing logged (in your day)
              </span>
              <span className="font-mono text-xs tabular-nums text-red-600 dark:text-red-400">
                {formatMinutes(timeline.idle)}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm border border-border"
                  style={{ background: OFF_BG }}
                  aria-hidden="true"
                />
                Off / sleep
              </span>
              <span className="font-mono text-xs tabular-nums">{formatMinutes(timeline.off)}</span>
            </li>
          </ul>
          {unplaced.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Recorded in the grid without clock times:{" "}
              {unplaced.map((u) => `${u.task.name} ${formatMinutes(u.minutes)}`).join(", ")}. Add a block to place it on
              the timeline.
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Time blocks</h3>
          {pieces.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No blocks. Focus sessions add them automatically, or add one below.
            </p>
          ) : (
            <ul className="space-y-1">
              {pieces.map((p) => {
                const source = logs.find((l) => l.id === p.logId)?.source
                if (editingLog === p.logId) {
                  const f = parseClock(editFrom)
                  const t = parseClock(editTo)
                  const ok = !!editFrom && !!editTo && t > f
                  return (
                    <li key={p.logId}>
                      <form
                        className="flex flex-wrap items-center gap-1.5 rounded-md bg-accent/50 p-1.5 text-sm"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (!ok) return
                          onUpdateLog(p.logId, isoAt(day, f), isoAt(day, t))
                          setEditingLog(null)
                        }}
                        onKeyDown={(e) => e.key === "Escape" && setEditingLog(null)}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: colors.get(p.taskId) }}
                          aria-hidden="true"
                        />
                        <input
                          autoFocus
                          type="time"
                          value={editFrom}
                          onChange={(e) => setEditFrom(e.target.value)}
                          className={input}
                          aria-label="Block from"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input
                          type="time"
                          value={editTo}
                          onChange={(e) => setEditTo(e.target.value)}
                          className={input}
                          aria-label="Block to"
                        />
                        <span className="text-xs text-muted-foreground">or length</span>
                        <input
                          placeholder={String(Math.round(p.to - p.from))}
                          maxLength={8}
                          onChange={(e) => {
                            const len = parseDuration(e.target.value)
                            if (len !== null && editFrom)
                              setEditTo(formatClock(Math.min(DAY_MINUTES - 1, parseClock(editFrom) + len)))
                          }}
                          className={`${input} w-16`}
                          aria-label="Block length (minutes)"
                          title="Minutes from the start: 10, 45m, 1h 15m or 1:15 (sets the end time)"
                        />
                        <span className="text-xs text-muted-foreground">min</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {ok
                            ? `${formatMinutes(t - f)} (was ${formatMinutes(p.to - p.from)})`
                            : "end must be after start"}
                        </span>
                        <button
                          type="submit"
                          disabled={!ok}
                          className="h-7 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingLog(null)}
                          className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent"
                        >
                          Cancel
                        </button>
                      </form>
                    </li>
                  )
                }
                return (
                  <li key={p.logId} className="group flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: colors.get(p.taskId) }}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatClock(p.from)}–{formatClock(p.to)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {tasks.find((t) => t.id === p.taskId)?.name ?? "Deleted task"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{source === "focus" ? "focus" : "added"}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLog(p.logId)
                        setEditFrom(formatClock(Math.round(p.from)))
                        setEditTo(formatClock(Math.min(DAY_MINUTES - 1, Math.round(p.to))))
                      }}
                      className="rounded p-1 text-muted-foreground opacity-60 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                      aria-label="Edit block times"
                      title="Change start/end (the day's total is adjusted by the difference)"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLog(p.logId)}
                      className="rounded p-1 text-muted-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete block"
                      title="Delete block (its minutes are removed from the day's total)"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <form
            className="mt-3 flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (!valid) return
              onAddLog({ taskId, start: isoAt(day, fromMin), end: isoAt(day, toMin), source: "manual" }, true)
              setFrom("")
              setTo("")
            }}
          >
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className={`${input} max-w-44`}
              aria-label="Task"
            >
              {active.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={input}
              aria-label="From"
              required
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={input}
              aria-label="To"
              required
            />
            <button
              type="submit"
              disabled={!valid}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add block
            </button>
            {from && to && !valid && <span className="text-[11px] text-destructive">End must be after start.</span>}
          </form>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Added blocks also add their minutes to that day&apos;s cell.
          </p>
        </div>
      </div>
    </section>
  )
}

interface WorkLogProps {
  timeline: DayTimeline
  today: DateKey
  tasks: Task[]
  colors: Map<string, string>
  entries: EntryIndex
  spans: NoteSpan[]
  running: { taskId: string; startedAt: number } | null
  onAddNote: (taskId: string, text: string, at: Date) => void
  onUpdateNote: (id: string, text: string) => void
  onDeleteNote: (id: string) => void
}

/** "What I did": each task worked on that day, its time, its cell, and the details written while working. */
function WorkLog({
  timeline,
  today,
  tasks,
  colors,
  entries,
  spans,
  running,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}: WorkLogProps) {
  const { day } = timeline
  const active = tasks.filter((t) => t.status !== "archived")
  const [taskId, setTaskId] = useState(running?.taskId ?? active[0]?.id ?? "")
  const [time, setTime] = useState("")
  const [text, setText] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)

  // Tasks with time, a cell entry, or details that day, in the order they were first worked on.
  const firstSeen = new Map<string, number>()
  for (const s of timeline.segments)
    if (s.kind === "task" && !firstSeen.has(s.taskId!)) firstSeen.set(s.taskId!, s.from)
  for (const sp of spans) if (!firstSeen.has(sp.note.taskId)) firstSeen.set(sp.note.taskId, sp.from)
  for (const t of tasks) if (!firstSeen.has(t.id) && entries.has(entryId(t.id, day))) firstSeen.set(t.id, DAY_MINUTES)
  const worked = [...firstSeen.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)

  // An empty time means "now", which only makes sense today.
  const canAdd = !!taskId && !!text.trim() && (!!time || day === today)

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
          <ListTree className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          What I did · {formatLongLabel(day)}
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Details come from &quot;What now?&quot; in the status bar while you work, or add them here. Click a detail to
          edit it.
        </p>
      </header>

      {worked.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nothing recorded on this day.</p>
      ) : (
        <ul className="divide-y divide-border">
          {worked.map((id) => {
            const task = tasks.find((t) => t.id === id)
            const entry = entries.get(entryId(id, day))
            const minutes = timeline.byTask.get(id) ?? 0
            const taskSpans = spans.filter((s) => s.note.taskId === id)
            return (
              <li key={id} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: colors.get(id) }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-foreground">{task?.name ?? "Deleted task"}</span>
                  {minutes > 0 && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatMinutes(minutes)}
                    </span>
                  )}
                  {entry && (
                    <span className={`rounded px-1 text-[10px] ${STATUS_META[entry.status].cell}`}>
                      {STATUS_META[entry.status].symbol} {STATUS_META[entry.status].label}
                    </span>
                  )}
                  {entry?.notes && <span className="text-xs italic text-muted-foreground">“{entry.notes}”</span>}
                </div>
                {taskSpans.length > 0 && (
                  <ol className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
                    {taskSpans.map((sp) => (
                      <li key={sp.note.id} className="group flex items-baseline gap-2 text-sm">
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatClock(sp.from)}
                        </span>
                        {editingId === sp.note.id ? (
                          <input
                            autoFocus
                            defaultValue={sp.note.text}
                            maxLength={200}
                            onBlur={(e) => {
                              onUpdateNote(sp.note.id, e.target.value)
                              setEditingId(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur()
                              if (e.key === "Escape") setEditingId(null)
                            }}
                            aria-label="Edit detail"
                            className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-sm text-foreground outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingId(sp.note.id)}
                            className="min-w-0 truncate text-left text-foreground hover:underline"
                            title="Click to edit"
                          >
                            {sp.note.text}
                          </button>
                        )}
                        {sp.to !== undefined && (
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            ({formatMinutes(sp.to - sp.from)})
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteNote(sp.note.id)}
                          className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                          aria-label={`Delete detail ${sp.note.text}`}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form
        className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canAdd) return
          onAddNote(taskId, text, time ? new Date(Date.parse(isoAt(day, parseClock(time)))) : new Date())
          setText("")
          setTime("")
        }}
      >
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          className={`${input} max-w-44`}
          aria-label="Task"
        >
          {active.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={input}
          aria-label="At"
          title={day === today ? "Leave empty for now" : "Time of the detail"}
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="e.g. learning CMake for the build"
          aria-label="Detail"
          className={`${input} min-w-48 flex-1 font-sans`}
        />
        <button
          type="submit"
          disabled={!canAdd}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add detail
        </button>
      </form>
    </section>
  )
}
