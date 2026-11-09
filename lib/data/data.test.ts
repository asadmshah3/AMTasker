import { describe, expect, it } from "vitest"
import { exportCsv, exportJson, parseImport } from "./backup"
import { seedData } from "./seed"
import { entryId, type AppData, type Entry } from "../model/types"

/** Seed data plus entries given as [date, task index, status]. */
function withEntries(data: AppData, rows: [string, number, Entry["status"]][]): AppData {
  const at = "2026-09-05T12:00:00.000Z"
  const entries = rows.map(([date, i, status]) => {
    const taskId = data.tasks[i].id
    return { id: entryId(taskId, date), taskId, date, status, createdAt: at, updatedAt: at }
  })
  return { ...data, entries }
}

describe("parseImport", () => {
  it("round-trips an export", () => {
    const data = seedData("2026-09-21")
    const result = parseImport(exportJson(data))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual(data)
      expect(result.summary.tasks).toBe(4)
    }
  })

  it("rejects a file without a schema version", () => {
    expect(parseImport(JSON.stringify({ tasks: [] })).ok).toBe(false)
  })

  it("rejects invalid JSON and invalid data", () => {
    expect(parseImport("{").ok).toBe(false)
    const data = seedData("2026-09-21")
    const broken = {
      ...data,
      entries: [
        {
          ...data.entries[0],
          id: "x",
          taskId: "missing",
          date: "2026-09-21",
          status: "completed",
          createdAt: "",
          updatedAt: "",
        },
      ],
    }
    const result = parseImport(JSON.stringify(broken))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/unknown task/)
  })

  it("rejects a bad status value", () => {
    const data = withEntries(seedData("2026-09-07"), [["2026-09-07", 0, "completed"]])
    const bad = { ...data, entries: [{ ...data.entries[0], status: "done" }] }
    expect(parseImport(JSON.stringify(bad)).ok).toBe(false)
  })
})

describe("exportCsv", () => {
  it("writes a date × task matrix", () => {
    // 7 Sep 2026 is a Monday; "Office: development" is weekdays only.
    const data = withEntries(seedData("2026-09-05"), [
      ["2026-09-05", 0, "completed"],
      ["2026-09-07", 3, "not_completed"],
    ])
    const lines = exportCsv(data, "2026-09-08").replace("﻿", "").split("\r\n")
    expect(lines[0]).toBe("Date,German B2,Morning exercise,Reading,Office: development")
    expect(lines[1]).toBe("2026-09-05,completed,unresolved,unresolved,")
    expect(lines).toContain("2026-09-07,unresolved,unresolved,unresolved,not completed")
    expect(lines[lines.length - 1]).toBe("2026-09-08,,,,")
  })
})
