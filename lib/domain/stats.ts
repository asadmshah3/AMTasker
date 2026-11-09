import { entryId, type DateKey, type EntryIndex, type Task } from "../model/types"
import { addDays, recentDateKeys } from "../date-utils"
import { isExpected } from "./expectation"

export interface Stats {
  todayPct: number
  todayDone: number
  todayTotal: number
  streak: number
  weekPct: number
}

interface DayTally {
  /** Expected cells, excluding skipped ones. */
  counted: number
  /** completed = 1, partial = 0.5 */
  score: number
  completed: number
  /** Every expected cell is completed or skipped. */
  allDone: boolean
  expected: number
}

/**
 * Tally one day across all tasks (archived ones included — they are only expected
 * on dates before they were archived). Skipped cells don't count for or against.
 * Unresolved cells count as not done yet.
 */
function tallyDay(tasks: Task[], entries: EntryIndex, key: DateKey): DayTally {
  const tally: DayTally = { counted: 0, score: 0, completed: 0, allDone: true, expected: 0 }
  for (const task of tasks) {
    if (!isExpected(task, key)) continue
    tally.expected++
    const status = entries.get(entryId(task.id, key))?.status
    if (status === "skipped") continue
    tally.counted++
    if (status === "completed") {
      tally.score += 1
      tally.completed++
    } else {
      if (status === "partial") tally.score += 0.5
      tally.allDone = false
    }
  }
  return tally
}

function pct(score: number, counted: number): number {
  return counted === 0 ? 0 : Math.round((score / counted) * 100)
}

export function computeStats(tasks: Task[], entries: EntryIndex, today: DateKey): Stats {
  const t = tallyDay(tasks, entries, today)

  let weekScore = 0
  let weekCounted = 0
  for (const key of recentDateKeys(7, today)) {
    const d = key === today ? t : tallyDay(tasks, entries, key)
    weekScore += d.score
    weekCounted += d.counted
  }

  return {
    todayPct: pct(t.score, t.counted),
    todayDone: t.completed,
    todayTotal: t.counted,
    streak: currentStreak(tasks, entries, today),
    weekPct: pct(weekScore, weekCounted),
  }
}

/**
 * Consecutive days, ending today, where every expected task was completed or skipped.
 * Days with nothing expected neither extend nor break the streak; an unfinished today
 * doesn't break it either (the day isn't over).
 */
export function currentStreak(tasks: Task[], entries: EntryIndex, today: DateKey): number {
  if (tasks.length === 0) return 0
  const earliest = tasks.reduce((min, t) => (t.startDate < min ? t.startDate : min), today)
  let streak = 0
  for (let key = today; key >= earliest; key = addDays(key, -1)) {
    const d = tallyDay(tasks, entries, key)
    if (d.expected === 0) continue
    if (d.allDone) streak++
    else if (key !== today) break
  }
  return streak
}
