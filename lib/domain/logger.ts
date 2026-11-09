import type { DateKey, Task, TimeLog } from "../model/types"
import { DAY_MINUTES, logsOnDay } from "./timesheet"

/** Minutes covered by the pieces (overlapping blocks are counted once). */
export function coveredMinutes(pieces: { from: number; to: number }[]): number {
  const sorted = [...pieces].sort((a, b) => a.from - b.from)
  let total = 0
  let end = -Infinity
  for (const p of sorted) {
    if (p.to <= end) continue
    total += p.to - Math.max(p.from, end)
    end = p.to
  }
  return total
}

/** Logged minutes on a day, from time blocks clipped to that day. */
export function loggedMinutesOnDay(logs: TimeLog[], day: DateKey): number {
  return coveredMinutes(logsOnDay(logs, day))
}

export interface TaskShare {
  taskId: string
  minutes: number
  /** On how many of the days the task had time. */
  days: number
}

export interface PeriodSummary {
  days: DateKey[]
  /** All minutes in the period (24h × days). */
  capacity: number
  logged: number
  byTask: TaskShare[]
}

/** Logged time per task over several days (e.g. the last 7), largest first, in the tasks' order on ties. */
export function summarizePeriod(tasks: Pick<Task, "id">[], logs: TimeLog[], days: DateKey[]): PeriodSummary {
  const minutes = new Map<string, number>()
  const daysWith = new Map<string, number>()
  let logged = 0
  for (const day of days) {
    const pieces = logsOnDay(logs, day)
    logged += coveredMinutes(pieces)
    const seen = new Set<string>()
    for (const p of pieces) {
      minutes.set(p.taskId, (minutes.get(p.taskId) ?? 0) + (p.to - p.from))
      seen.add(p.taskId)
    }
    for (const id of seen) daysWith.set(id, (daysWith.get(id) ?? 0) + 1)
  }
  const order = new Map(tasks.map((t, i) => [t.id, i]))
  const byTask = [...minutes.entries()]
    .map(([taskId, m]) => ({ taskId, minutes: m, days: daysWith.get(taskId) ?? 0 }))
    .sort((a, b) => b.minutes - a.minutes || (order.get(a.taskId) ?? 99) - (order.get(b.taskId) ?? 99))
  return { days, capacity: days.length * DAY_MINUTES, logged, byTask }
}

/** "7h", "7h 05m", "45m" — compact hours for the Logger's top row. */
export function formatHours(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${String(r).padStart(2, "0")}m` : `${h}h`
}
