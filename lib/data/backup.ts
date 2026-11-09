import { appDataSchema, describeIssues } from "../model/schema"
import { entryId, indexEntries, type AppData, type DateKey } from "../model/types"
import { addDays } from "../date-utils"
import { isExpected } from "../domain/expectation"

export function exportJson(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)
}

export interface ImportSummary {
  tasks: number
  entries: number
  backlog: number
  firstDate?: DateKey
  lastDate?: DateKey
}

export type ImportResult = { ok: true; data: AppData; summary: ImportSummary } | { ok: false; error: string }

/** Parse and fully validate a backup file. Nothing is written until the caller confirms. */
export function parseImport(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "The file is not valid JSON." }
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "The file does not contain AMTasker data." }
  }

  if (!("schemaVersion" in raw)) {
    return { ok: false, error: "The file does not contain AMTasker data." }
  }

  // Unknown keys (e.g. exportedAt) are stripped by the schema.
  const parsed = appDataSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: `The backup is invalid: ${describeIssues(parsed.error)}` }
  }

  const data = parsed.data
  const dates = data.entries.map((e) => e.date).sort()
  return {
    ok: true,
    data,
    summary: {
      tasks: data.tasks.length,
      entries: data.entries.length,
      backlog: data.backlog.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
    },
  }
}

const CSV_STATUS = {
  completed: "completed",
  partial: "partial",
  not_completed: "not completed",
  skipped: "skipped",
} as const

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Spreadsheet-friendly history: one row per date (oldest first), one column per task.
 * Cells: status (plus value when recorded), "unresolved" for a missing expected entry,
 * and empty when the task wasn't expected that day.
 */
export function exportCsv(data: AppData, today: DateKey): string {
  const tasks = [...data.tasks].sort((a, b) => a.sortOrder - b.sortOrder)
  const index = indexEntries(data.entries)
  const starts = [...tasks.map((t) => t.startDate), ...data.entries.map((e) => e.date)]
  const lines = [["Date", ...tasks.map((t) => (t.status === "archived" ? `${t.name} (archived)` : t.name))]]

  if (starts.length > 0) {
    const first = starts.reduce((min, d) => (d < min ? d : min))
    for (let key = first; key <= today; key = addDays(key, 1)) {
      lines.push([
        key,
        ...tasks.map((t) => {
          const e = index.get(entryId(t.id, key))
          if (e) {
            const value = e.value !== undefined ? ` (${e.value}${t.unit ? ` ${t.unit}` : ""})` : ""
            const minutes = e.minutes !== undefined ? ` [${e.minutes} min]` : ""
            return CSV_STATUS[e.status] + value + minutes
          }
          return isExpected(t, key) && key < today ? "unresolved" : ""
        }),
      ])
    }
  }

  // BOM so Excel detects UTF-8.
  return "﻿" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n")
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
