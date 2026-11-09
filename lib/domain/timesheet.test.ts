import { describe, expect, it } from "vitest"
import type { DayPlan, TimeLog, WorkNote } from "../model/types"
import {
  buildTimeline,
  currentActivity,
  currentDetail,
  dayWindow,
  noteSpans,
  parseDuration,
  stopAtMs,
  formatClock,
  isoAt,
  logsOnDay,
  parseClock,
  weekDays,
  minuteIn,
} from "./timesheet"
import { loggedMinutesOnDay } from "./logger"

const DAY = "2026-10-17"
const settings = { dayStart: "07:00", dayEnd: "23:00" }
const at = (day: string, hhmm: string) => Date.parse(isoAt(day, parseClock(hhmm)))
const log = (taskId: string, from: string, to: string, day = DAY): TimeLog => ({
  id: `${taskId}-${from}`,
  taskId,
  start: isoAt(day, parseClock(from)),
  end: isoAt(day, parseClock(to)),
  source: "manual",
  createdAt: "",
})
const plan = (extra: Partial<DayPlan> = {}): DayPlan => ({ date: DAY, focus: [], planned: {}, updatedAt: "", ...extra })

describe("clock helpers", () => {
  it("parses and formats HH:MM", () => {
    expect(parseClock("07:30")).toBe(450)
    expect(formatClock(450)).toBe("07:30")
    expect(formatClock(1440)).toBe("24:00")
  })
})

describe("day window", () => {
  it("uses the usual hours unless the day is marked", () => {
    expect(dayWindow(DAY, undefined, settings)).toMatchObject({ start: 420, end: 1380, startMarked: false })
    const marked = dayWindow(DAY, plan({ dayStartAt: isoAt(DAY, 545), shutdownAt: isoAt(DAY, 1320) }), settings)
    expect(marked).toMatchObject({ start: 545, end: 1320, startMarked: true, endMarked: true })
  })
})

describe("timeline", () => {
  it("splits a finished day into off, idle and task time that add up to 24 hours", () => {
    const logs = [log("cpp", "09:00", "10:30"), log("ger", "18:00", "18:30")]
    const tl = buildTimeline(DAY, logs, undefined, settings, at("2026-10-18", "08:00"))
    expect(tl.byTask.get("cpp")).toBe(90)
    expect(tl.byTask.get("ger")).toBe(30)
    expect(tl.logged).toBe(120)
    expect(tl.off).toBe(7 * 60 + 60) // 00:00–07:00 and 23:00–24:00
    expect(tl.idle).toBe(16 * 60 - 120)
    expect(tl.logged + tl.idle + tl.off).toBe(1440)
    expect(tl.segments.map((s) => s.kind)).toEqual(["off", "idle", "task", "idle", "task", "idle", "off"])
  })

  it("leaves the rest of today as future, not idle", () => {
    const tl = buildTimeline(DAY, [log("cpp", "08:00", "09:00")], undefined, settings, at(DAY, "10:00"))
    expect(tl.idle).toBe(60 + 60) // 07:00–08:00 and 09:00–10:00
    expect(tl.segments.at(-1)).toMatchObject({ kind: "future", from: 600, to: 1440 })
  })

  it("shows logged time even outside the day window", () => {
    const tl = buildTimeline(DAY, [log("cpp", "05:00", "06:00")], undefined, settings, at("2026-10-18", "08:00"))
    expect(tl.byTask.get("cpp")).toBe(60)
    expect(tl.off).toBe(7 * 60 + 60 - 60)
  })

  it("clips blocks that cross midnight to each day", () => {
    const late: TimeLog = { ...log("cpp", "23:30", "23:59"), end: isoAt("2026-10-18", 30) }
    expect(logsOnDay([late], DAY)).toMatchObject([{ from: 1410, to: 1440 }])
    expect(logsOnDay([late], "2026-10-18")).toMatchObject([{ from: 0, to: 30 }])
  })
})

describe("current activity", () => {
  it("is working while a focus session runs", () => {
    expect(
      currentActivity(at(DAY, "10:00"), { taskId: "cpp", startedAt: at(DAY, "09:30") }, [], undefined, settings),
    ).toEqual({
      kind: "working",
      taskId: "cpp",
      sinceMs: at(DAY, "09:30"),
    })
  })

  it("is idle since the last block ended, or since the day started", () => {
    expect(currentActivity(at(DAY, "11:00"), null, [log("cpp", "09:00", "10:40")], undefined, settings)).toEqual({
      kind: "idle",
      sinceMs: at(DAY, "10:40"),
    })
    expect(currentActivity(at(DAY, "08:00"), null, [], undefined, settings)).toEqual({
      kind: "idle",
      sinceMs: at(DAY, "07:00"),
    })
    const marked = plan({ dayStartAt: isoAt(DAY, 400) })
    expect(currentActivity(at(DAY, "07:30"), null, [], marked, settings)).toEqual({
      kind: "idle",
      sinceMs: at(DAY, "06:40"),
    })
  })

  it("counts a block that was just logged, even if it ends a moment after the clock tick", () => {
    const justLogged = { ...log("cpp", "09:00", "10:00"), end: new Date(at(DAY, "10:00") + 5000).toISOString() }
    expect(currentActivity(at(DAY, "10:00"), null, [justLogged], undefined, settings)).toEqual({
      kind: "idle",
      sinceMs: at(DAY, "10:00"),
    })
  })

  it("is not started before the usual start, and closed after the day ended", () => {
    expect(currentActivity(at(DAY, "06:00"), null, [], undefined, settings)).toEqual({
      kind: "not_started",
      startsAt: 420,
    })
    const closed = plan({ shutdownAt: isoAt(DAY, 1290) })
    expect(currentActivity(at(DAY, "22:00"), null, [], closed, settings)).toEqual({
      kind: "closed",
      sinceMs: at(DAY, "21:30"),
    })
  })
})

describe("week pages", () => {
  it("lists 7 days ending today, then the week before", () => {
    expect(weekDays(DAY, 0)).toEqual([
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      DAY,
    ])
    expect(weekDays(DAY, 1)[6]).toBe("2026-10-10")
  })
})

describe("work details", () => {
  const note = (taskId: string, hhmm: string, text: string): WorkNote => ({
    id: text,
    taskId,
    at: isoAt(DAY, parseClock(hhmm)),
    text,
    createdAt: "",
  })
  const notes = [
    note("fit", "09:10", "learning CMake"),
    note("fit", "10:00", "learning Conan"),
    note("ger", "20:00", "vocab"),
  ]
  const logs = [log("fit", "09:00", "10:30")]

  it("lasts until the next detail for the task, cut off at the end of its block", () => {
    const spans = noteSpans(DAY, notes, logs, null, at("2026-10-18", "08:00"))
    expect(spans.map((s) => [s.note.text, s.from, s.to])).toEqual([
      ["learning CMake", 550, 600],
      ["learning Conan", 600, 630],
      ["vocab", 1200, undefined], // not inside a time block
    ])
  })

  it("treats a running session as a block that ends now", () => {
    const spans = noteSpans(
      DAY,
      [note("ger", "20:00", "vocab")],
      [],
      { taskId: "ger", startedAt: at(DAY, "19:50") },
      at(DAY, "20:30"),
    )
    expect(spans[0]).toMatchObject({ from: 1200, to: 1230 })
  })

  it("finds the current detail of the running session", () => {
    expect(currentDetail(notes, { taskId: "fit", startedAt: at(DAY, "09:00") })?.text).toBe("learning Conan")
    expect(currentDetail(notes, { taskId: "fit", startedAt: at(DAY, "11:00") })).toBeUndefined()
    expect(currentDetail(notes, null)).toBeUndefined()
  })
})

describe("stop at", () => {
  it("ends the session at that clock time on the day it started", () => {
    expect(stopAtMs(at(DAY, "09:00"), "10:15")).toBe(at(DAY, "10:15"))
  })
  it("rolls over to the next day when the time is before the start (past midnight)", () => {
    expect(stopAtMs(at(DAY, "23:30"), "00:20")).toBe(at("2026-10-18", "00:20"))
  })
})

describe("typed durations", () => {
  it("reads minutes, hours and h:mm", () => {
    expect(parseDuration("10")).toBe(10)
    expect(parseDuration("10m")).toBe(10)
    expect(parseDuration("45 min")).toBe(45)
    expect(parseDuration("1h")).toBe(60)
    expect(parseDuration("1h 15m")).toBe(75)
    expect(parseDuration("1h15")).toBe(75)
    expect(parseDuration("1.5h")).toBe(90)
    expect(parseDuration("1:15")).toBe(75)
  })
  it("rejects empty, zero and nonsense", () => {
    expect(parseDuration("")).toBeNull()
    expect(parseDuration("0")).toBeNull()
    expect(parseDuration("abc")).toBeNull()
    expect(parseDuration("-5")).toBeNull()
  })
})

describe("daylight saving days", () => {
  // 25 Oct 2026 (clocks go back) and 29 Mar 2026 (clocks go forward) in Europe; ordinary days elsewhere.
  const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).getTime()
  const log = (start: number, end: number): TimeLog => ({
    id: "l",
    taskId: "t",
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    source: "manual",
    createdAt: new Date(start).toISOString(),
  })

  it("places times by the wall clock, so late evening stays inside the day", () => {
    expect(minuteIn("2026-10-25", at(2026, 10, 25, 23, 30))).toBe(23 * 60 + 30)
    expect(minuteIn("2026-03-29", at(2026, 3, 29, 23, 30))).toBe(23 * 60 + 30)
    expect(minuteIn("2026-10-25", at(2026, 10, 25, 12, 0))).toBe(12 * 60)
    expect(minuteIn("2026-10-25", at(2026, 10, 26, 0, 15))).toBe(24 * 60 + 15)
  })

  it("counts a block logged late on the day the clocks change", () => {
    expect(loggedMinutesOnDay([log(at(2026, 10, 25, 23, 0), at(2026, 10, 25, 23, 40))], "2026-10-25")).toBe(40)
    const overMidnight = [log(at(2026, 10, 25, 23, 30), at(2026, 10, 26, 0, 30))]
    expect(loggedMinutesOnDay(overMidnight, "2026-10-25")).toBe(30)
    expect(loggedMinutesOnDay(overMidnight, "2026-10-26")).toBe(30)
  })
})
