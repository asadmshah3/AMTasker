import { describe, expect, it } from "vitest"
import { entryId, indexEntries, type DayPlan, type Entry, type EntryStatus, type Task } from "../model/types"
import { createTask } from "./tasks"
import {
  addTime,
  deadlineInfo,
  deadlineLabel,
  formatMinutes,
  missedYesterday,
  plannedMinutes,
  spentMinutes,
  summarizeWeek,
  tasksForDay,
  weekStart,
} from "./planning"

// 2026-10-05 is a Monday.
const MON = "2026-10-05"

function task(overrides: Partial<Task> = {}): Task {
  return {
    ...createTask({ name: "T", startDate: "2026-10-01", schedule: { type: "daily" }, showOnDashboard: true }, 0),
    ...overrides,
  }
}

function entry(t: Task, date: string, status: EntryStatus, extra: Partial<Entry> = {}): Entry {
  return { id: entryId(t.id, date), taskId: t.id, date, status, createdAt: "", updatedAt: "", ...extra }
}

function plan(date: string, extra: Partial<DayPlan> = {}): DayPlan {
  return { date, focus: [], planned: {}, updatedAt: "", ...extra }
}

describe("time", () => {
  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45m")
    expect(formatMinutes(60)).toBe("1h")
    expect(formatMinutes(85)).toBe("1h 25m")
  })

  it("reads time spent from the value for minute tasks and from minutes otherwise", () => {
    const read = task({ unit: "minutes" })
    const book = task({ unit: "pages" })
    expect(spentMinutes(read, entry(read, MON, "completed", { value: 30 }))).toBe(30)
    expect(spentMinutes(book, entry(book, MON, "completed", { value: 20, minutes: 40 }))).toBe(40)
    expect(spentMinutes(book, undefined)).toBe(0)
  })

  it("plans from the day plan, falling back to a minute target", () => {
    const read = task({ unit: "minutes", target: 30 })
    expect(plannedMinutes(read, undefined)).toBe(30)
    expect(plannedMinutes(read, plan(MON, { planned: { [read.id]: 45 } }))).toBe(45)
    expect(plannedMinutes(task({ unit: "pages", target: 20 }), undefined)).toBe(0)
  })

  it("adds timed minutes and picks a status from the target", () => {
    const read = task({ unit: "minutes", target: 30 })
    expect(addTime(read, undefined, 20)).toEqual({ status: "partial", value: 20, minutes: undefined })
    expect(addTime(read, entry(read, MON, "partial", { value: 20 }), 15)).toEqual({
      status: "partial",
      value: 35,
      minutes: undefined,
    })
    expect(addTime(read, undefined, 30).status).toBe("completed")
    const gym = task()
    expect(addTime(gym, entry(gym, MON, "completed", { minutes: 10 }), 25)).toEqual({
      status: "completed",
      value: undefined,
      minutes: 35,
    })
  })
})

describe("deadlines", () => {
  const course = task({ startDate: "2026-10-01", deadline: "2026-10-10", goalTotal: 10, unit: "lessons" })

  it("tracks progress against an even pace", () => {
    const entries = [
      entry(course, "2026-10-01", "completed", { value: 2 }),
      entry(course, "2026-10-02", "completed", { value: 1 }),
    ]
    // 4 of 10 days are over: pace says 4 lessons, 3 done → behind.
    const info = deadlineInfo(course, entries, MON)!
    expect(info.daysLeft).toBe(5)
    expect(info.progress).toBe(3)
    expect(info.expected).toBe(4)
    expect(deadlineInfo(course, entries, "2026-10-01")!.state).toBe("on_track")
    expect(info.state).toBe("behind")
    expect(deadlineLabel(info, "lessons")).toBe("5d left · 3/10 lessons")
  })

  it("reports done, due today and overdue", () => {
    const done = [entry(course, "2026-10-02", "completed", { value: 10 })]
    expect(deadlineInfo(course, done, MON)!.state).toBe("done")
    expect(deadlineInfo(course, [], "2026-10-10")!.state).toBe("due_today")
    expect(deadlineInfo(course, [], "2026-10-12")!.state).toBe("overdue")
    expect(deadlineLabel(deadlineInfo(course, [], "2026-10-12")!)).toBe("2d overdue · 0/10")
  })

  it("is null without a deadline", () => {
    expect(deadlineInfo(task(), [], MON)).toBeNull()
  })
})

describe("today", () => {
  it("puts focus tasks first, in focus order", () => {
    const a = task({ name: "A", sortOrder: 0 })
    const b = task({ name: "B", sortOrder: 1 })
    const c = task({ name: "C", sortOrder: 2 })
    const order = tasksForDay([a, b, c], MON, plan(MON, { focus: [c.id, b.id] })).map((t) => t.name)
    expect(order).toEqual(["C", "B", "A"])
  })

  it("flags tasks missed yesterday (not done or no entry), but not partial or skipped", () => {
    const a = task({ name: "A" })
    const b = task({ name: "B" })
    const c = task({ name: "C" })
    const d = task({ name: "D" })
    const sun = "2026-10-04"
    const entries = indexEntries([entry(a, sun, "not_completed"), entry(c, sun, "partial"), entry(d, sun, "skipped")])
    expect(missedYesterday([a, b, c, d], entries, MON).map((t) => t.name)).toEqual(["A", "B"])
  })
})

describe("weekly review", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-11")).toBe(MON) // Sunday
    expect(weekStart(MON)).toBe(MON)
    expect(weekStart("2026-10-07")).toBe(MON)
  })

  it("sums planned vs spent and completion up to today", () => {
    const read = task({ unit: "minutes", target: 20, startDate: MON })
    const entries = indexEntries([
      entry(read, MON, "completed", { value: 30 }),
      entry(read, "2026-10-06", "partial", { value: 10 }),
    ])
    const plans = new Map([[MON, plan(MON, { planned: { [read.id]: 30 }, reflection: "good" })]])
    const week = summarizeWeek([read], entries, plans, MON, "2026-10-07")
    expect(week.spentMinutes).toBe(40)
    // Mon planned 30; Tue–Sun fall back to the 20-minute target.
    expect(week.plannedMinutes).toBe(30 + 6 * 20)
    // Mon completed, Tue partial, Wed (today) not yet counted.
    expect(week.completionPct).toBe(75)
    expect(week.tasks[0]).toMatchObject({ expected: 3, completed: 1, partial: 1, missed: 0 })
    expect(week.days[0].reflection).toBe("good")
  })
})
