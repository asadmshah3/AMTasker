import { describe, expect, it } from "vitest"
import { entryId, indexEntries, type Entry, type EntryStatus, type Task } from "../model/types"
import { isExpected } from "./expectation"
import { changeStatus, createTask, formatValue } from "./tasks"
import { countUnresolved, findUnresolved } from "./unresolved"
import { computeStats, currentStreak } from "./stats"

// 2026-09-21 is a Monday.
const MON = "2026-09-21"

function task(overrides: Partial<Task> = {}): Task {
  return {
    ...createTask({ name: "T", startDate: "2026-09-01", schedule: { type: "daily" }, showOnDashboard: true }, 0),
    ...overrides,
  }
}

function entry(t: Task, date: string, status: EntryStatus, value?: number): Entry {
  return { id: entryId(t.id, date), taskId: t.id, date, status, value, createdAt: "", updatedAt: "" }
}

describe("isExpected", () => {
  it("respects start and end dates", () => {
    const t = task({ startDate: "2026-09-10", endDate: "2026-09-20" })
    expect(isExpected(t, "2026-09-09")).toBe(false)
    expect(isExpected(t, "2026-09-10")).toBe(true)
    expect(isExpected(t, "2026-09-20")).toBe(true)
    expect(isExpected(t, "2026-09-21")).toBe(false)
  })

  it("handles weekday and custom schedules", () => {
    const weekdays = task({ schedule: { type: "weekdays" } })
    expect(isExpected(weekdays, MON)).toBe(true)
    expect(isExpected(weekdays, "2026-09-20")).toBe(false) // Sunday
    const mwf = task({ schedule: { type: "custom", days: [1, 3, 5] } })
    expect(isExpected(mwf, MON)).toBe(true)
    expect(isExpected(mwf, "2026-09-22")).toBe(false) // Tue
    expect(isExpected(mwf, "2026-09-23")).toBe(true) // Wed
  })

  it("handles one-time tasks", () => {
    const once = task({ schedule: { type: "once", date: MON } })
    expect(isExpected(once, MON)).toBe(true)
    expect(isExpected(once, "2026-09-22")).toBe(false)
  })

  it("excludes pause periods but keeps history before them", () => {
    let t = task()
    t = changeStatus(t, "paused", "2026-09-10")
    t = changeStatus(t, "active", "2026-09-15")
    expect(isExpected(t, "2026-09-09")).toBe(true)
    expect(isExpected(t, "2026-09-10")).toBe(false)
    expect(isExpected(t, "2026-09-14")).toBe(false)
    expect(isExpected(t, "2026-09-15")).toBe(true)
  })

  it("keeps archived tasks expected before the archive date", () => {
    const t = changeStatus(task(), "archived", "2026-09-10")
    expect(isExpected(t, "2026-09-09")).toBe(true)
    expect(isExpected(t, "2026-09-30")).toBe(false)
  })
})

describe("changeStatus", () => {
  it("drops an empty pause period when resumed the same day", () => {
    const t = changeStatus(changeStatus(task(), "paused", MON), "active", MON)
    expect(t.pausePeriods).toEqual([])
  })

  it("keeps the open period when a paused task is archived", () => {
    const t = changeStatus(changeStatus(task(), "paused", "2026-09-10"), "archived", "2026-09-12")
    expect(t.pausePeriods).toEqual([{ from: "2026-09-10" }])
  })
})

describe("findUnresolved", () => {
  it("lists expected past cells without entries, newest first", () => {
    const t = task({ startDate: "2026-09-19" })
    const days = findUnresolved([t], indexEntries([entry(t, "2026-09-20", "completed")]), MON)
    expect(days).toEqual([{ date: "2026-09-19", taskIds: [t.id] }])
  })

  it("does not report dates before a task started, or today", () => {
    const t = task({ startDate: MON })
    expect(findUnresolved([t], new Map(), MON)).toEqual([])
  })

  it("ignores archived tasks and skipped entries count as resolved", () => {
    const a = changeStatus(task({ startDate: "2026-09-18" }), "archived", "2026-09-20")
    const b = task({ startDate: "2026-09-20" })
    const days = findUnresolved([a, b], indexEntries([entry(b, "2026-09-20", "skipped")]), MON)
    expect(countUnresolved(days)).toBe(0)
  })
})

describe("stats", () => {
  it("does not penalise days before a new task started", () => {
    const old = task({ startDate: "2026-09-01" })
    const fresh = task({ startDate: MON })
    const entries = indexEntries(Array.from({ length: 7 }, (_, i) => entry(old, `2026-09-${15 + i}`, "completed")))
    const s = computeStats([old, fresh], entries, MON)
    // 7 old completions + today's unresolved fresh task: 7 / 8
    expect(s.weekPct).toBe(88)
    expect(s.todayTotal).toBe(2)
    expect(s.todayDone).toBe(1)
  })

  it("counts partial as half and excludes skipped", () => {
    const a = task()
    const b = task()
    const c = task()
    const entries = indexEntries([entry(a, MON, "completed"), entry(b, MON, "partial"), entry(c, MON, "skipped")])
    const s = computeStats([a, b, c], entries, MON)
    expect(s.todayTotal).toBe(2)
    expect(s.todayPct).toBe(75)
  })

  it("keeps the streak when today is unfinished and breaks on a missed day", () => {
    const t = task({ startDate: "2026-09-15" })
    const entries = indexEntries([
      entry(t, "2026-09-17", "not_completed"),
      entry(t, "2026-09-18", "completed"),
      entry(t, "2026-09-19", "skipped"),
      entry(t, "2026-09-20", "completed"),
    ])
    expect(currentStreak([t], entries, MON)).toBe(3)
  })
})

describe("formatValue", () => {
  it("formats values with target and unit", () => {
    expect(formatValue({ target: 60, unit: "minutes" }, 30)).toBe("30/60m")
    expect(formatValue({ unit: "minutes" }, 45)).toBe("45m")
    expect(formatValue({}, undefined)).toBe("")
  })
})
