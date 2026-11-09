import { entryId, type DateKey, type DayPlan, type Entry, type EntryIndex, type Task } from "../model/types"
import { addDays, daysBetween } from "../date-utils"
import { isExpected } from "./expectation"

// ---- Time -----------------------------------------------------------------

/** Whether a task's unit is time in minutes (its value then *is* the time spent). */
export function isMinuteUnit(unit: string | undefined): boolean {
  const u = unit?.trim().toLowerCase()
  return u === "m" || u === "min" || u === "mins" || u === "minute" || u === "minutes"
}

/** Minutes spent on a task on one day, from the value (minute tasks) or the separate minutes field. */
export function spentMinutes(task: Pick<Task, "unit">, entry: Entry | undefined): number {
  if (!entry) return 0
  return (isMinuteUnit(task.unit) ? entry.value : entry.minutes) ?? 0
}

/** "1h 25m", "45m", "0m". */
export function formatMinutes(total: number): string {
  const m = Math.round(total)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

/** Planned minutes for a task on a day: the day's plan, else the task's target when it is in minutes. */
export function plannedMinutes(task: Task, plan: DayPlan | undefined): number {
  const planned = plan?.planned[task.id]
  if (planned !== undefined) return planned
  return isMinuteUnit(task.unit) ? (task.target ?? 0) : 0
}

/**
 * Add timed minutes to a day's entry. Returns the new value/minutes and a status:
 * an existing status is kept; otherwise completed when the target (minute tasks) is met, else partial.
 */
export function addTime(
  task: Task,
  entry: Entry | undefined,
  minutes: number,
): { status: Entry["status"]; value?: number; minutes?: number } {
  if (isMinuteUnit(task.unit)) {
    const value = (entry?.value ?? 0) + minutes
    const status = entry?.status ?? (task.target && value < task.target ? "partial" : "completed")
    return { status, value, minutes: entry?.minutes }
  }
  return { status: entry?.status ?? "partial", value: entry?.value, minutes: (entry?.minutes ?? 0) + minutes }
}

// ---- Deadlines ------------------------------------------------------------

export type DeadlineState = "on_track" | "behind" | "due_today" | "overdue" | "done"

export interface DeadlineInfo {
  deadline: DateKey
  /** Days from today to the deadline (negative once passed). */
  daysLeft: number
  /** Sum of recorded values since the start date, when the task has a goal total. */
  progress?: number
  goalTotal?: number
  /** Where progress should be by the start of today if work were spread evenly from start to deadline. */
  expected?: number
  state: DeadlineState
}

export function deadlineInfo(task: Task, entries: Entry[], today: DateKey): DeadlineInfo | null {
  if (!task.deadline) return null
  const daysLeft = daysBetween(today, task.deadline)
  let progress: number | undefined
  let expected: number | undefined
  if (task.goalTotal) {
    progress = 0
    for (const e of entries) if (e.taskId === task.id && e.value !== undefined) progress += e.value
    const span = Math.max(1, daysBetween(task.startDate, task.deadline) + 1)
    // Days already over (today is still in progress, so it isn't counted yet).
    const elapsed = Math.min(span, Math.max(0, daysBetween(task.startDate, today)))
    expected = (task.goalTotal * elapsed) / span
  }
  let state: DeadlineState
  if (progress !== undefined && task.goalTotal !== undefined && progress >= task.goalTotal) state = "done"
  else if (daysLeft < 0) state = "overdue"
  else if (daysLeft === 0) state = "due_today"
  else if (progress !== undefined && expected !== undefined && progress < expected) state = "behind"
  else state = "on_track"
  return { deadline: task.deadline, daysLeft, progress, goalTotal: task.goalTotal, expected, state }
}

/** Short label: "12d left · 8/20h", "due today", "3d overdue", "done". */
export function deadlineLabel(info: DeadlineInfo, unit?: string): string {
  const when =
    info.state === "done"
      ? "done"
      : info.daysLeft > 0
        ? `${info.daysLeft}d left`
        : info.daysLeft === 0
          ? "due today"
          : `${-info.daysLeft}d overdue`
  if (info.progress === undefined || info.goalTotal === undefined) return when
  const u = unit ? (isMinuteUnit(unit) ? "m" : unit.length <= 3 ? unit : ` ${unit}`) : ""
  return `${when} · ${round1(info.progress)}/${info.goalTotal}${u}`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ---- Today ----------------------------------------------------------------

/** Active tasks expected on `day`, focus tasks first (in focus order), then by sort order. */
export function tasksForDay(tasks: Task[], day: DateKey, plan: DayPlan | undefined): Task[] {
  const focus = plan?.focus ?? []
  return tasks
    .filter((t) => t.status === "active" && isExpected(t, day))
    .sort((a, b) => {
      const fa = focus.indexOf(a.id)
      const fb = focus.indexOf(b.id)
      if (fa !== fb) return (fa < 0 ? Infinity : fa) - (fb < 0 ? Infinity : fb)
      return a.sortOrder - b.sortOrder
    })
}

/**
 * "Never miss twice": active tasks that were expected yesterday but not done
 * (not completed, partial or skipped, including no entry at all).
 */
export function missedYesterday(tasks: Task[], entries: EntryIndex, today: DateKey): Task[] {
  const yesterday = addDays(today, -1)
  return tasks.filter((t) => {
    if (t.status !== "active" || !isExpected(t, yesterday) || !isExpected(t, today)) return false
    const status = entries.get(entryId(t.id, yesterday))?.status
    return status === undefined || status === "not_completed"
  })
}

// ---- Weekly review --------------------------------------------------------

/** Monday of the week containing `day`. */
export function weekStart(day: DateKey): DateKey {
  const [y, m, d] = day.split("-").map(Number)
  const dow = new Date(y, m - 1, d).getDay() // 0 = Sun
  return addDays(day, -((dow + 6) % 7))
}

export interface TaskWeek {
  task: Task
  expected: number
  completed: number
  partial: number
  missed: number
  plannedMinutes: number
  spentMinutes: number
}

export interface DayWeek {
  date: DateKey
  plannedMinutes: number
  spentMinutes: number
  reflection?: string
}

export interface WeekSummary {
  days: DayWeek[]
  tasks: TaskWeek[]
  plannedMinutes: number
  spentMinutes: number
  /** completed = 1, partial = 0.5; skipped and future days excluded. */
  completionPct: number
}

export function summarizeWeek(
  tasks: Task[],
  entries: EntryIndex,
  plans: Map<DateKey, DayPlan>,
  monday: DateKey,
  today: DateKey,
): WeekSummary {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const rows = new Map<string, TaskWeek>()
  const days: DayWeek[] = []
  let score = 0
  let counted = 0

  for (const date of dates) {
    const plan = plans.get(date)
    const day: DayWeek = { date, plannedMinutes: 0, spentMinutes: 0, reflection: plan?.reflection }
    for (const task of tasks) {
      const expected = isExpected(task, date)
      const entry = entries.get(entryId(task.id, date))
      // Same rule as the Today page: the day's plan, else a minute target, on days the task was due.
      const planned = expected ? plannedMinutes(task, plan) : (plan?.planned[task.id] ?? 0)
      const spent = spentMinutes(task, entry)
      if (!expected && !entry && !planned) continue
      let row = rows.get(task.id)
      if (!row) {
        row = { task, expected: 0, completed: 0, partial: 0, missed: 0, plannedMinutes: 0, spentMinutes: 0 }
        rows.set(task.id, row)
      }
      row.plannedMinutes += planned
      row.spentMinutes += spent
      day.plannedMinutes += planned
      day.spentMinutes += spent
      if (!expected || date > today) continue
      row.expected++
      const status = entry?.status
      if (status === "completed") row.completed++
      else if (status === "partial") row.partial++
      else if (status === "not_completed" || (status === undefined && date < today)) row.missed++
      if (status !== "skipped" && !(status === undefined && date === today)) {
        counted++
        score += status === "completed" ? 1 : status === "partial" ? 0.5 : 0
      }
    }
    days.push(day)
  }

  const taskRows = [...rows.values()].sort((a, b) => a.task.sortOrder - b.task.sortOrder)
  return {
    days,
    tasks: taskRows,
    plannedMinutes: days.reduce((n, d) => n + d.plannedMinutes, 0),
    spentMinutes: days.reduce((n, d) => n + d.spentMinutes, 0),
    completionPct: counted === 0 ? 0 : Math.round((score / counted) * 100),
  }
}
