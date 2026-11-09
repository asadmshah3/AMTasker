import type { DateKey, PausePeriod, Task, TaskSchedule, TaskStatus } from "../model/types"
import { DAY_ABBR, parseKey } from "../date-utils"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Editable task fields. */
export type TaskDraft = Pick<
  Task,
  | "name"
  | "description"
  | "category"
  | "startDate"
  | "endDate"
  | "deadline"
  | "goalTotal"
  | "schedule"
  | "target"
  | "unit"
  | "showOnDashboard"
>

export function createTask(draft: TaskDraft, sortOrder: number, now = new Date()): Task {
  const iso = now.toISOString()
  return {
    ...cleanDraft(draft),
    id: crypto.randomUUID(),
    status: "active",
    pausePeriods: [],
    sortOrder,
    createdAt: iso,
    updatedAt: iso,
  }
}

/** Trim strings and drop empty optional fields so stored tasks stay tidy. */
export function cleanDraft(draft: TaskDraft): TaskDraft {
  const text = (s?: string) => (s && s.trim() ? s.trim() : undefined)
  return {
    name: draft.name.trim(),
    description: text(draft.description),
    category: text(draft.category),
    startDate: draft.startDate,
    endDate: draft.endDate || undefined,
    deadline: draft.deadline || undefined,
    goalTotal: draft.goalTotal && draft.goalTotal > 0 ? draft.goalTotal : undefined,
    schedule: draft.schedule,
    target: draft.target && draft.target > 0 ? draft.target : undefined,
    unit: text(draft.unit),
    showOnDashboard: draft.showOnDashboard,
  }
}

/**
 * Change a task's lifecycle status on `today`, recording pause periods so that
 * past expectations are unaffected: pausing/archiving opens a period, resuming closes it.
 */
export function changeStatus(task: Task, next: TaskStatus, today: DateKey, now = new Date()): Task {
  if (task.status === next) return task
  let pausePeriods: PausePeriod[] = task.pausePeriods
  const open = pausePeriods.findIndex((p) => p.to === undefined)

  if (next === "active") {
    if (open >= 0) {
      const period = pausePeriods[open]
      pausePeriods =
        period.from >= today
          ? pausePeriods.filter((_, i) => i !== open) // paused and resumed the same day: no gap
          : pausePeriods.map((p, i) => (i === open ? { ...p, to: today } : p))
    }
  } else if (open < 0) {
    pausePeriods = [...pausePeriods, { from: today }]
  }

  return { ...task, status: next, pausePeriods, updatedAt: now.toISOString() }
}

/** Human-readable summary of a schedule for labels/badges. */
export function scheduleSummary(schedule: TaskSchedule): string {
  switch (schedule.type) {
    case "daily":
      return "Daily"
    case "weekdays":
      return "Weekdays"
    case "once": {
      const d = parseKey(schedule.date)
      return `Once · ${MONTHS[d.getMonth()]} ${d.getDate()}`
    }
    case "custom": {
      if (schedule.days.length === 0) return "No days"
      if (schedule.days.length === 7) return "Daily"
      const sorted = [...schedule.days].sort((a, b) => a - b)
      return sorted.map((d) => DAY_ABBR[d]).join(", ")
    }
  }
}

/** Short cell text for an entry value, e.g. "30/60m" or "45m". */
export function formatValue(task: Pick<Task, "target" | "unit">, value: number | undefined): string {
  if (value === undefined) return ""
  const unit = task.unit ? abbreviateUnit(task.unit) : ""
  return task.target ? `${value}/${task.target}${unit}` : `${value}${unit}`
}

function abbreviateUnit(unit: string): string {
  const u = unit.trim().toLowerCase()
  if (u === "minutes" || u === "minute" || u === "min" || u === "mins") return "m"
  if (u === "hours" || u === "hour" || u === "hr" || u === "hrs") return "h"
  return unit.length <= 3 ? unit : ` ${unit}`
}
