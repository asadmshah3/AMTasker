import { describe, expect, it } from "vitest"
import type { TimeLog } from "../model/types"
import { isoAt, parseClock } from "./timesheet"
import { coveredMinutes, formatHours, loggedMinutesOnDay, summarizePeriod } from "./logger"

const log = (taskId: string, day: string, from: string, to: string, endDay = day): TimeLog => ({
  id: `${taskId}${day}${from}`,
  taskId,
  start: isoAt(day, parseClock(from)),
  end: isoAt(endDay, parseClock(to)),
  source: "focus",
  createdAt: "",
})

describe("logger totals", () => {
  it("counts overlapping blocks once", () => {
    expect(
      coveredMinutes([
        { from: 60, to: 120 },
        { from: 90, to: 150 },
        { from: 200, to: 210 },
      ]),
    ).toBe(100)
  })

  it("sums a day's blocks, clipping ones that cross midnight", () => {
    const logs = [log("a", "2026-10-21", "09:00", "10:30"), log("b", "2026-10-21", "23:30", "00:30", "2026-10-22")]
    expect(loggedMinutesOnDay(logs, "2026-10-21")).toBe(120)
    expect(loggedMinutesOnDay(logs, "2026-10-22")).toBe(30)
  })

  it("summarises a period per task with days worked and 24h capacity per day", () => {
    const logs = [
      log("a", "2026-10-20", "09:00", "10:00"),
      log("a", "2026-10-21", "09:00", "09:30"),
      log("b", "2026-10-21", "18:00", "20:00"),
    ]
    const s = summarizePeriod([{ id: "a" }, { id: "b" }], logs, ["2026-10-20", "2026-10-21"])
    expect(s.capacity).toBe(2 * 1440)
    expect(s.logged).toBe(210)
    expect(s.byTask).toEqual([
      { taskId: "b", minutes: 120, days: 1 },
      { taskId: "a", minutes: 90, days: 2 },
    ])
  })

  it("formats hours compactly", () => {
    expect(formatHours(45)).toBe("45m")
    expect(formatHours(420)).toBe("7h")
    expect(formatHours(425)).toBe("7h 05m")
  })
})
