import type { DateKey, DayPlan, Settings, Task, TimeLog, WorkNote } from "../model/types"
import { addDays, daysBetween, parseKey, toDateKey } from "../date-utils"

export const DAY_MINUTES = 24 * 60

/** "07:30" → 450. Invalid input → 0. */
export function parseClock(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  return m ? Math.min(DAY_MINUTES, Number(m[1]) * 60 + Number(m[2])) : 0
}

/** 450 → "07:30"; 1440 → "24:00". */
export function formatClock(minute: number): string {
  const m = Math.round(minute)
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

/** Local midnight of a date key, in ms. */
function dayStartMs(day: DateKey): number {
  return parseKey(day).getTime()
}

/**
 * Clock position of a timestamp on `day`, in minutes (can be < 0 or > 1440 for other days).
 * Uses the wall clock, not time elapsed since midnight, so 23:30 is 1410 even on the 23- and
 * 25-hour days when daylight saving time starts or ends.
 */
export function minuteIn(day: DateKey, ms: number): number {
  const d = new Date(ms)
  const clock = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60_000
  return daysBetween(day, toDateKey(d)) * DAY_MINUTES + clock
}

/** ISO timestamp for a clock time on a day. */
export function isoAt(day: DateKey, minute: number): string {
  const d = parseKey(day)
  d.setMinutes(Math.round(minute))
  return d.toISOString()
}

export interface DayWindow {
  /** Minutes since midnight. */
  start: number
  end: number
  /** True when the start/end were marked for this day (not the usual times). */
  startMarked: boolean
  endMarked: boolean
}

/** The part of the day you're awake/working: marked start/end, else the usual times from settings. */
export function dayWindow(
  day: DateKey,
  plan: DayPlan | undefined,
  settings: Pick<Settings, "dayStart" | "dayEnd">,
): DayWindow {
  const clamp = (m: number) => Math.min(DAY_MINUTES, Math.max(0, m))
  const startIso = plan?.dayStartAt
  const endIso = plan?.dayEndAt ?? plan?.shutdownAt
  const start = startIso ? clamp(minuteIn(day, Date.parse(startIso))) : parseClock(settings.dayStart)
  let end = endIso ? clamp(minuteIn(day, Date.parse(endIso))) : parseClock(settings.dayEnd)
  if (end <= start) end = DAY_MINUTES
  return { start, end, startMarked: !!startIso, endMarked: !!endIso }
}

export interface LogPiece {
  logId: string
  taskId: string
  /** Minutes since midnight, clipped to the day. */
  from: number
  to: number
}

/** The parts of each time log that fall on `day`, sorted by start. */
export function logsOnDay(logs: TimeLog[], day: DateKey): LogPiece[] {
  const pieces: LogPiece[] = []
  for (const l of logs) {
    const from = Math.max(0, minuteIn(day, Date.parse(l.start)))
    const to = Math.min(DAY_MINUTES, minuteIn(day, Date.parse(l.end)))
    if (to > from) pieces.push({ logId: l.id, taskId: l.taskId, from, to })
  }
  return pieces.sort((a, b) => a.from - b.from)
}

export type SegmentKind = "task" | "idle" | "off" | "future"

export interface Segment {
  kind: SegmentKind
  taskId?: string
  from: number
  to: number
}

export interface DayTimeline {
  day: DateKey
  window: DayWindow
  segments: Segment[]
  /** Minutes per task id. */
  byTask: Map<string, number>
  logged: number
  idle: number
  off: number
}

/**
 * Split a day into segments: logged task time; idle (inside the day window, nothing logged);
 * off (outside the window, e.g. sleep); and future (later today). Logged time always wins,
 * even outside the window. Overlapping logs: the later-starting one is shown.
 */
export function buildTimeline(
  day: DateKey,
  logs: TimeLog[],
  plan: DayPlan | undefined,
  settings: Pick<Settings, "dayStart" | "dayEnd">,
  nowMs: number,
): DayTimeline {
  const window = dayWindow(day, plan, settings)
  const now = minuteIn(day, nowMs)
  const pieces = logsOnDay(logs, day)

  // Boundaries where the classification can change.
  const cuts = new Set<number>([0, DAY_MINUTES, window.start, window.end])
  if (now > 0 && now < DAY_MINUTES) cuts.add(now)
  for (const p of pieces) {
    cuts.add(p.from)
    cuts.add(p.to)
  }
  const points = [...cuts].sort((a, b) => a - b)

  const segments: Segment[] = []
  const byTask = new Map<string, number>()
  let logged = 0
  let idle = 0
  let off = 0
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    if (to <= from) continue
    const mid = (from + to) / 2
    let covering: LogPiece | undefined
    for (const p of pieces) if (p.from <= mid && mid < p.to) covering = p
    let seg: Segment
    if (covering) seg = { kind: "task", taskId: covering.taskId, from, to }
    else if (mid >= now) seg = { kind: "future", from, to }
    else if (mid < window.start || mid >= window.end) seg = { kind: "off", from, to }
    else seg = { kind: "idle", from, to }

    const len = to - from
    if (seg.kind === "task") {
      logged += len
      byTask.set(seg.taskId!, (byTask.get(seg.taskId!) ?? 0) + len)
    } else if (seg.kind === "idle") idle += len
    else if (seg.kind === "off") off += len

    const last = segments[segments.length - 1]
    if (last && last.kind === seg.kind && last.taskId === seg.taskId && last.to === from) last.to = to
    else segments.push(seg)
  }
  return { day, window, segments, byTask, logged, idle, off }
}

/**
 * Minutes from a typed duration: "10", "10m", "45 min", "1h", "1h 15m", "1.5h", "1:15".
 * Returns null when it can't be read or isn't positive.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (!t) return null
  let m: RegExpExecArray | null
  if ((m = /^(\d+):([0-5]\d)$/.exec(t))) return positive(Number(m[1]) * 60 + Number(m[2]))
  if ((m = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?)?$/.exec(t))) return positive(Math.round(Number(m[1])))
  if ((m = /^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?(?:\s*(\d+)\s*(?:m|min|mins|minutes?)?)?$/.exec(t))) {
    return positive(Math.round(Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0)))
  }
  return null
}

function positive(n: number): number | null {
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * End time for "I stopped at HH:MM": on the day the session started, or the next day when that
 * clock time is earlier than the start (the session ran past midnight).
 */
export function stopAtMs(startedAt: number, hhmm: string): number {
  const day = toDateKey(new Date(startedAt))
  const end = Date.parse(isoAt(day, parseClock(hhmm)))
  return end > startedAt ? end : Date.parse(isoAt(addDays(day, 1), parseClock(hhmm)))
}

// ---- Work notes ("what I'm doing") ------------------------------------------

export interface NoteSpan {
  note: WorkNote
  /** Minutes since midnight of the day. */
  from: number
  /** Until the next detail for the task or the end of its time block; undefined when not inside a block. */
  to?: number
}

/**
 * The details written on `day`, oldest first, each with how long it lasted: from its time until the
 * next detail for the same task, cut off at the end of the time block it falls in. A running focus
 * session counts as a block that ends now.
 */
export function noteSpans(
  day: DateKey,
  notes: WorkNote[],
  logs: TimeLog[],
  running: { taskId: string; startedAt: number } | null,
  nowMs: number,
): NoteSpan[] {
  const blocks = logsOnDay(logs, day)
  if (running) {
    const from = Math.max(0, minuteIn(day, running.startedAt))
    const to = Math.min(DAY_MINUTES, minuteIn(day, nowMs))
    if (to > from) blocks.push({ logId: "running", taskId: running.taskId, from, to })
  }
  const onDay = notes
    .map((note) => ({ note, from: minuteIn(day, Date.parse(note.at)) }))
    .filter((n) => n.from >= 0 && n.from < DAY_MINUTES)
    .sort((a, b) => a.from - b.from)
  return onDay.map(({ note, from }) => {
    const block = blocks.find((b) => b.taskId === note.taskId && b.from <= from && from < b.to)
    if (!block) return { note, from }
    const next = onDay.find((n) => n.note.taskId === note.taskId && n.from > from && n.from < block.to)
    return { note, from, to: next ? next.from : block.to }
  })
}

/** The latest detail written for the running session's task since the session started. */
export function currentDetail(
  notes: WorkNote[],
  running: { taskId: string; startedAt: number } | null,
): WorkNote | undefined {
  if (!running) return undefined
  let latest: WorkNote | undefined
  for (const n of notes) {
    if (n.taskId !== running.taskId || Date.parse(n.at) < running.startedAt) continue
    if (!latest || n.at > latest.at) latest = n
  }
  return latest
}

// ---- Current activity (status bar) -----------------------------------------

export type Activity =
  | { kind: "working"; taskId: string; sinceMs: number }
  | { kind: "idle"; sinceMs: number }
  | { kind: "not_started"; startsAt: number }
  | { kind: "closed"; sinceMs: number }

/**
 * What's happening right now: a running focus session; otherwise idle since the later of the
 * last logged block and the start of today's day window; "not started" before the window;
 * "closed" after the day was ended.
 */
export function currentActivity(
  nowMs: number,
  session: { taskId: string; startedAt: number } | null,
  logs: TimeLog[],
  plan: DayPlan | undefined,
  settings: Pick<Settings, "dayStart" | "dayEnd">,
): Activity {
  if (session) return { kind: "working", taskId: session.taskId, sinceMs: session.startedAt }
  const today = toDateKey(new Date(nowMs))
  const window = dayWindow(today, plan, settings)
  const startMs = Date.parse(isoAt(today, window.start))
  const endMs = Date.parse(isoAt(today, window.end))
  // Latest end of any block that has started (a just-logged block may end a moment after `nowMs`).
  let lastEnd = -Infinity
  for (const l of logs) {
    if (Date.parse(l.start) <= nowMs) lastEnd = Math.max(lastEnd, Math.min(nowMs, Date.parse(l.end)))
  }
  if (window.endMarked && nowMs >= endMs) return { kind: "closed", sinceMs: Math.max(endMs, lastEnd) }
  if (nowMs < startMs && lastEnd < dayStartMs(today)) return { kind: "not_started", startsAt: window.start }
  return { kind: "idle", sinceMs: Math.max(lastEnd, Math.min(startMs, nowMs)) }
}

/** The 7 days of a TimeSheet page, oldest first; page 0 ends today. */
export function weekDays(today: DateKey, page: number, count = 7): DateKey[] {
  const end = addDays(today, -page * count)
  return Array.from({ length: count }, (_, i) => addDays(end, i - count + 1))
}

/**
 * Distinct, colour-blind-friendly-ish colours for tasks. Red is reserved for idle time and grey
 * for off time, so neither appears here. Assigned by position, so a task keeps its colour.
 */
const TASK_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#ec4899", // pink
  "#22c55e", // green
  "#0ea5e9", // sky
  "#a16207", // brown
  "#6366f1", // indigo
  "#84cc16", // lime
  "#d946ef", // fuchsia
  "#0f766e", // dark teal
]

export function taskColors(tasks: Pick<Task, "id">[]): Map<string, string> {
  return new Map(tasks.map((t, i) => [t.id, TASK_COLORS[i % TASK_COLORS.length]]))
}
