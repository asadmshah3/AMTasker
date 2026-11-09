import type { DateKey, Task, TaskSchedule } from "../model/types"
import { dayOfWeek } from "../date-utils"

function matchesSchedule(schedule: TaskSchedule, key: DateKey): boolean {
  switch (schedule.type) {
    case "daily":
      return true
    case "weekdays": {
      const d = dayOfWeek(key)
      return d >= 1 && d <= 5
    }
    case "custom":
      return schedule.days.includes(dayOfWeek(key))
    case "once":
      return schedule.date === key
  }
}

/** Whether the task was paused or archived on this date. */
function isPausedOn(task: Pick<Task, "pausePeriods">, key: DateKey): boolean {
  return task.pausePeriods.some((p) => key >= p.from && (p.to === undefined || key < p.to))
}

/** Whether the task is within its start/end dates on this date. */
function isWithinDates(task: Pick<Task, "startDate" | "endDate">, key: DateKey): boolean {
  return key >= task.startDate && (task.endDate === undefined || key <= task.endDate)
}

/**
 * Whether an entry is expected for this task on this date. Archived and paused
 * tasks remain expected on the dates before they were paused, so history and stats
 * don't change when a task is archived.
 */
export function isExpected(task: Task, key: DateKey): boolean {
  return isWithinDates(task, key) && !isPausedOn(task, key) && matchesSchedule(task.schedule, key)
}
