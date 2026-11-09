"use client"

import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react"
import { entryId, type ColumnWidths, type DateKey, type EntryIndex, type RowOrder, type Task } from "@/lib/model/types"
import type { EntryChange } from "@/lib/use-app-data"
import { formatMonthYear, formatRowLabel, formatSheetDate, isWeekend } from "@/lib/date-utils"
import { isExpected } from "@/lib/domain/expectation"
import { formatValue, scheduleSummary } from "@/lib/domain/tasks"
import { STATUS_META, nextStatus, statusForKey } from "./status"
import { DeadlineBadge } from "./deadline-badge"
import type { DeadlineInfo } from "@/lib/domain/planning"
import { CellEditor, type CellTarget } from "./cell-editor"

interface ProgressTableProps {
  tasks: Task[]
  /** Oldest first. */
  dateKeys: DateKey[]
  rowOrder: RowOrder
  today: DateKey
  entries: EntryIndex
  onChange: (change: EntryChange) => void
  columnWidths: ColumnWidths
  onColumnWidthsChange: (widths: ColumnWidths) => void
  onResetColumnWidth: (id: string) => void
  deadlines?: Map<string, DeadlineInfo>
  /** Work details per cell (entryId → texts), shown in the cell tooltip. */
  workNotes?: Map<string, string[]>
}

const DATE_COL = "__date"
const DEFAULT_DATE_WIDTH = 150
const DEFAULT_TASK_WIDTH = 104
const MIN_WIDTH = 56
const MAX_WIDTH = 480
// The task-name row, coloured like the highlighted header row of a spreadsheet. Opaque because it is sticky.
const HEADER_BG = "bg-amber-200 dark:bg-[oklch(0.34_0.06_85)]"

export function ProgressTable({
  tasks,
  dateKeys,
  rowOrder,
  today,
  entries,
  onChange,
  columnWidths,
  onColumnWidthsChange,
  onResetColumnWidth,
  deadlines,
  workNotes,
}: ProgressTableProps) {
  const [drag, setDrag] = useState<{ id: string; width: number } | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startWidth: number; width: number } | null>(null)
  const [editing, setEditing] = useState<CellTarget | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => (rowOrder === "oldest" ? dateKeys : [...dateKeys].reverse()), [dateKeys, rowOrder])

  // Bring today (or the newest day of the page) into view whenever the visible range changes,
  // like opening a spreadsheet that is already scrolled to the current row.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = rowOrder === "oldest" ? el.scrollHeight : 0
  }, [rows, rowOrder, tasks.length])

  function widthFor(id: string): number {
    if (drag?.id === id) return drag.width
    return columnWidths[id] ?? (id === DATE_COL ? DEFAULT_DATE_WIDTH : DEFAULT_TASK_WIDTH)
  }

  function startResize(e: React.PointerEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    const startWidth = widthFor(id)
    dragRef.current = { id, startX: e.clientX, startWidth, width: startWidth }

    function onMove(ev: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      d.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, d.startWidth + (ev.clientX - d.startX)))
      setDrag({ id: d.id, width: d.width })
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      const d = dragRef.current
      dragRef.current = null
      if (d && d.width !== d.startWidth) onColumnWidthsChange({ [d.id]: d.width })
      setDrag(null)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="font-mono text-sm text-foreground">No tasks to show</p>
        <p className="text-sm text-muted-foreground">
          Add a task in Manage, or show finished tasks to review archived ones.
        </p>
      </div>
    )
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="max-h-[75vh] overflow-auto overscroll-contain rounded-lg border border-border bg-card"
      >
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          <colgroup>
            <col style={{ width: widthFor(DATE_COL) }} />
            {tasks.map((task) => (
              <col key={task.id} style={{ width: widthFor(task.id) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className={`sticky left-0 top-0 z-30 border-b border-r border-border px-3 py-2 text-left align-top ${HEADER_BG}`}
              >
                <span className="font-mono text-xs font-medium uppercase tracking-wide text-foreground/70">Date</span>
                <ResizeHandle onStart={(e) => startResize(e, DATE_COL)} onReset={() => onResetColumnWidth(DATE_COL)} />
              </th>
              {tasks.map((task) => (
                <th
                  key={task.id}
                  scope="col"
                  className={`sticky top-0 z-20 border-b border-r border-border px-2 py-2 text-left align-top last:border-r-0 ${HEADER_BG}`}
                >
                  <span
                    className={`block whitespace-normal break-words text-xs font-medium leading-tight ${
                      task.status === "archived" ? "italic text-muted-foreground" : "text-foreground"
                    }`}
                    title={[task.name, task.description].filter(Boolean).join(" — ")}
                  >
                    {task.name}
                  </span>
                  <span className="mt-0.5 block whitespace-normal break-words text-[9px] uppercase leading-tight tracking-wide text-foreground/60">
                    {task.status === "active" ? (
                      scheduleSummary(task.schedule)
                    ) : (
                      <span className={task.status === "paused" ? "text-orange-500" : ""}>{task.status}</span>
                    )}
                    {task.target ? ` · ${formatValue({ unit: task.unit }, task.target)}` : ""}
                  </span>
                  {deadlines?.has(task.id) && (
                    <DeadlineBadge info={deadlines.get(task.id)!} unit={task.unit} className="mt-1" />
                  )}
                  <ResizeHandle onStart={(e) => startResize(e, task.id)} onReset={() => onResetColumnWidth(task.id)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((key, i) => {
              const label = formatRowLabel(key)
              const isToday = key === today
              const newMonth = i === 0 || rows[i - 1].slice(0, 7) !== key.slice(0, 7)
              return (
                <Fragment key={key}>
                  {newMonth && (
                    <tr aria-hidden="true">
                      <td colSpan={tasks.length + 1} className="border-b border-border bg-muted/60 p-0">
                        <span className="sticky left-0 inline-block px-3 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {formatMonthYear(key)}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className="group">
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 border-b border-r border-border px-3 py-1 text-left align-middle ${
                        isToday ? "bg-sky-100 dark:bg-sky-950" : "bg-card group-hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-baseline gap-x-2">
                        <span
                          className={`font-mono text-xs tabular-nums text-foreground ${isToday ? "font-semibold" : ""}`}
                        >
                          {formatSheetDate(key)}
                        </span>
                        <span
                          className={`text-[10px] uppercase ${isWeekend(key) ? "text-orange-500/80" : "text-muted-foreground"}`}
                        >
                          {label.weekday}
                        </span>
                        {isToday && (
                          <span className="ml-auto rounded bg-primary px-1 py-0.5 text-[9px] font-semibold uppercase leading-none text-primary-foreground">
                            Today
                          </span>
                        )}
                      </div>
                    </th>
                    {tasks.map((task) => (
                      <Cell
                        key={task.id}
                        task={task}
                        date={key}
                        dateLabel={formatSheetDate(key)}
                        today={today}
                        entries={entries}
                        active={editing?.task.id === task.id && editing.date === key}
                        onEdit={(anchor) => setEditing({ task, date: key, anchor })}
                        details={workNotes?.get(entryId(task.id, key))}
                        onChange={onChange}
                      />
                    ))}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <CellEditor
        target={editing}
        entry={editing ? entries.get(entryId(editing.task.id, editing.date)) : undefined}
        onChange={onChange}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

interface CellProps {
  task: Task
  date: DateKey
  dateLabel: string
  today: DateKey
  entries: EntryIndex
  active: boolean
  onEdit: (anchor: HTMLElement) => void
  onChange: (change: EntryChange) => void
  details?: string[]
}

function Cell({ task, date, dateLabel, today, entries, active, onEdit, onChange, details }: CellProps) {
  const entry = entries.get(entryId(task.id, date))
  const expected = isExpected(task, date)

  let className: string
  let description: string
  if (entry) {
    className = STATUS_META[entry.status].cell
    description = STATUS_META[entry.status].label.toLowerCase()
  } else if (!expected) {
    className =
      "bg-[repeating-linear-gradient(45deg,var(--muted)_0,var(--muted)_3px,transparent_3px,transparent_7px)] opacity-60 hover:opacity-100"
    description = "not scheduled"
  } else {
    className = "bg-muted/30 hover:bg-muted"
    description = date < today ? "no entry yet" : "open"
  }

  const value = entry ? formatValue(task, entry.value) : ""
  const time = entry?.minutes ? `${entry.minutes}m` : ""
  // Like a spreadsheet cell, show what was written there (first line of the note).
  const note = entry?.notes?.split("\n")[0].trim() ?? ""

  return (
    <td className="border-b border-r border-border p-0 align-middle last:border-r-0">
      <button
        type="button"
        onClick={() => {
          const s = nextStatus(entry?.status)
          onChange(
            s === null
              ? { taskId: task.id, date, status: null }
              : { taskId: task.id, date, status: s, value: entry?.value },
          )
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onEdit(e.currentTarget)
        }}
        onKeyDown={(e) => {
          // Enter opens the editor (keyboard equivalent of right-click); Space cycles like a left-click.
          if (e.key === "Enter") {
            e.preventDefault()
            onEdit(e.currentTarget)
            return
          }
          const s = statusForKey(e.key)
          if (s === undefined) return
          e.preventDefault()
          onChange(
            s === null
              ? { taskId: task.id, date, status: null }
              : { taskId: task.id, date, status: s, value: entry?.value },
          )
        }}
        className={`flex h-full min-h-[1.75rem] w-full items-center gap-1 px-1 ${note ? "justify-start" : "justify-center"} font-mono text-[11px] transition-colors focus-visible:relative focus-visible:z-[5] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${className} ${
          active ? "outline-2 outline-offset-[-2px] outline-primary" : ""
        }`}
        aria-label={`${task.name} on ${dateLabel}: ${description}${value ? `, ${value}` : ""}${note ? `, note: ${note}` : ""}. Click to cycle status, right-click or Enter to edit, 1–4 to set.`}
        title={`${task.name} — ${dateLabel}: ${description}${value ? ` (${value})` : ""}${time ? ` · ${time} spent` : ""}${entry?.notes ? `\n${entry.notes}` : ""}${details?.length ? `\nWorked on: ${details.join(" → ")}` : ""}`}
      >
        {entry && <span aria-hidden="true">{STATUS_META[entry.status].symbol}</span>}
        {value && <span className="shrink-0">{value}</span>}
        {time && <span className="shrink-0 opacity-75">⏱{time}</span>}
        {note && <span className="truncate font-sans">{note}</span>}
      </button>
    </td>
  )
}

interface ResizeHandleProps {
  onStart: (e: React.PointerEvent) => void
  onReset: () => void
}

function ResizeHandle({ onStart, onReset }: ResizeHandleProps) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column (double-click to reset)"
      onPointerDown={onStart}
      onDoubleClick={onReset}
      className="absolute right-0 top-0 z-40 flex h-full w-1.5 cursor-col-resize touch-none select-none items-stretch bg-transparent transition-colors hover:bg-primary/50"
    />
  )
}
