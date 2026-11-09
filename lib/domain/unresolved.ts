import { entryId, type DateKey, type EntryIndex, type Task } from "../model/types"
import { addDays } from "../date-utils"
import { isExpected } from "./expectation"

export interface UnresolvedDay {
  date: DateKey
  taskIds: string[]
}

/**
 * Expected cells before `today` that have no entry, grouped by date (newest first).
 * Archived tasks are left out: the user has finished with them, and their gaps stay
 * visible (and editable) in the table.
 */
export function findUnresolved(tasks: Task[], entries: EntryIndex, today: DateKey): UnresolvedDay[] {
  const yesterday = addDays(today, -1)
  const byDate = new Map<DateKey, string[]>()

  for (const task of tasks) {
    if (task.status === "archived") continue
    const last = task.endDate && task.endDate < yesterday ? task.endDate : yesterday
    for (let key = task.startDate; key <= last; key = addDays(key, 1)) {
      if (!isExpected(task, key) || entries.has(entryId(task.id, key))) continue
      const list = byDate.get(key)
      if (list) list.push(task.id)
      else byDate.set(key, [task.id])
    }
  }

  return [...byDate.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([date, taskIds]) => ({ date, taskIds }))
}

export function countUnresolved(days: UnresolvedDay[]): number {
  return days.reduce((n, d) => n + d.taskIds.length, 0)
}
