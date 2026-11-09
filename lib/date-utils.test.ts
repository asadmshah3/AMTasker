import { describe, expect, it } from "vitest"
import { daysBetween, formatRangeLabel, formatSheetDate, lastRangePage, rangePageDateKeys } from "./date-utils"
import { settingsSchema } from "./model/schema"
import { DEFAULT_HIDDEN_TABS, normalizeLoggerSections } from "./model/types"

describe("rolling date range", () => {
  it("page 0 is the last N days ending today, oldest first", () => {
    const keys = rangePageDateKeys(30, 0, "2026-10-02")
    expect(keys).toHaveLength(30)
    expect(keys[0]).toBe("2026-09-03")
    expect(keys[29]).toBe("2026-10-02")
  })

  it("older pages continue without gaps or overlap", () => {
    const page1 = rangePageDateKeys(7, 1, "2026-10-02")
    expect(page1[0]).toBe("2026-09-19")
    expect(page1[6]).toBe("2026-09-25")
  })

  it("last page reaches the earliest date", () => {
    expect(daysBetween("2025-12-31", "2026-01-02")).toBe(2)
    expect(lastRangePage(30, "2026-10-02", "2026-10-02")).toBe(0)
    expect(lastRangePage(30, "2026-09-03", "2026-10-02")).toBe(0)
    expect(lastRangePage(30, "2026-09-02", "2026-10-02")).toBe(1)
    const last = lastRangePage(30, "2025-10-01", "2026-10-02")
    expect(rangePageDateKeys(30, last, "2026-10-02")[0] <= "2025-10-01").toBe(true)
  })

  it("formats dates like the spreadsheet", () => {
    expect(formatSheetDate("2026-06-16")).toBe("16 Jun 2026")
    expect(formatRangeLabel("2026-09-03", "2026-10-02")).toBe("3 Sep – 2 Oct 2026")
    expect(formatRangeLabel("2025-12-20", "2026-01-02")).toBe("20 Dec 2025 – 2 Jan 2026")
  })
})

describe("settings schema", () => {
  it("upgrades settings saved before the range setting existed, keeping column widths", () => {
    const parsed = settingsSchema.parse({ columnWidths: { a: 90 }, monthsPerPage: 2 })
    expect(parsed).toEqual({
      columnWidths: { a: 90 },
      rangeDays: 30,
      rowOrder: "oldest",
      dayStart: "07:00",
      dayEnd: "23:00",
      showFullDay: false,
      sideSpace: 50,
      hiddenTabs: DEFAULT_HIDDEN_TABS,
      loggerSections: normalizeLoggerSections([]),
    })
  })

  it("keeps hidden tabs, but never hides every tab", () => {
    expect(settingsSchema.parse({ columnWidths: {}, hiddenTabs: ["review", "timesheet"] }).hiddenTabs).toEqual([
      "review",
      "timesheet",
    ])
    expect(
      settingsSchema.parse({ columnWidths: {}, hiddenTabs: ["today", "tracker", "review", "timesheet", "logger"] })
        .hiddenTabs,
    ).toEqual([])
    expect(settingsSchema.parse({ columnWidths: {}, hiddenTabs: ["nope"] }).hiddenTabs).toEqual([])
  })

  it("falls back to the default for an out-of-range day count", () => {
    expect(settingsSchema.parse({ columnWidths: {}, rangeDays: 5000, rowOrder: "newest" }).rangeDays).toBe(30)
  })
})

describe("logger sections", () => {
  it("keeps your order and visibility, ignores unknown ids, and adds new sections at the end", () => {
    const saved = [
      { id: "notepad", visible: false },
      { id: "bogus", visible: true },
      { id: "lines", visible: true },
      { id: "notepad", visible: true },
    ] as Parameters<typeof normalizeLoggerSections>[0]
    expect(normalizeLoggerSections(saved).map((s) => `${s.id}:${s.visible}`)).toEqual([
      "notepad:false",
      "lines:true",
      "hours:true",
      "priorities:true",
      "countdown:true",
      "now:true",
    ])
  })
})
