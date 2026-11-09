"use client"

import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import type { DateKey, Entry, EntryStatus, Task } from "@/lib/model/types"
import type { EntryChange } from "@/lib/use-app-data"
import { formatLongLabel } from "@/lib/date-utils"
import { isMinuteUnit } from "@/lib/domain/planning"
import { STATUS_META, STATUS_ORDER, statusForKey } from "./status"

export interface CellTarget {
  task: Task
  date: DateKey
  anchor: HTMLElement
}

interface CellEditorProps {
  target: CellTarget | null
  entry: Entry | undefined
  onChange: (change: EntryChange) => void
  onClose: () => void
}

/** One shared popover for editing whichever cell was clicked. */
export function CellEditor({ target, entry, onChange, onClose }: CellEditorProps) {
  return (
    <Popover.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Popover.Portal>
        <Popover.Positioner anchor={target?.anchor} side="bottom" sideOffset={4} collisionPadding={8} className="z-50">
          <Popover.Popup
            finalFocus={target ? { current: target.anchor } : undefined}
            className="w-60 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none"
          >
            {target && (
              <EditorBody
                key={`${target.task.id}:${target.date}`}
                target={target}
                entry={entry}
                onChange={onChange}
                onClose={onClose}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function EditorBody({
  target,
  entry,
  onChange,
  onClose,
}: Required<Omit<CellEditorProps, "entry">> & { target: CellTarget; entry: Entry | undefined }) {
  const { task, date } = target
  const hasValue = task.target !== undefined || task.unit !== undefined
  // Minute tasks record time as their value; others get a separate "time spent" field.
  const hasMinutes = !isMinuteUnit(task.unit)
  const [value, setValue] = useState(entry?.value !== undefined ? String(entry.value) : "")
  const [minutes, setMinutes] = useState(entry?.minutes !== undefined ? String(entry.minutes) : "")
  const [notes, setNotes] = useState(entry?.notes ?? "")

  function parse(text: string): number | undefined {
    const n = Number(text)
    return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : undefined
  }

  function fields() {
    return {
      value: hasValue ? parse(value) : entry?.value,
      minutes: hasMinutes ? parse(minutes) : entry?.minutes,
      notes,
    }
  }

  function choose(status: EntryStatus | null) {
    if (status === null) onChange({ taskId: task.id, date, status: null })
    else onChange({ taskId: task.id, date, status, ...fields() })
    onClose()
  }

  /** Saving picks a sensible status when none is set: target met → completed, else partial. */
  function save() {
    const f = fields()
    let status = entry?.status
    if (!status) status = task.target && f.value !== undefined && f.value < task.target ? "partial" : "completed"
    onChange({ taskId: task.id, date, status, ...f })
    onClose()
  }

  const fieldClass =
    "h-7 w-full min-w-0 rounded border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-ring"

  return (
    <div
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        const s = statusForKey(e.key)
        if (s !== undefined) {
          e.preventDefault()
          choose(s)
        }
      }}
    >
      <div className="mb-2 px-1">
        <p className="truncate text-xs font-medium text-foreground">{task.name}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{formatLongLabel(date)}</p>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {STATUS_ORDER.map((s) => {
          const meta = STATUS_META[s]
          return (
            <button
              key={s}
              type="button"
              aria-pressed={entry?.status === s}
              onClick={() => choose(s)}
              className={`flex items-center gap-1.5 rounded border border-border px-2 py-1.5 text-left text-xs text-foreground transition-colors ${meta.button}`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[10px] ${meta.cell}`}
                aria-hidden="true"
              >
                {meta.symbol}
              </span>
              <span className="flex-1">{meta.label}</span>
              <kbd className="font-mono text-[9px] text-muted-foreground">{meta.key}</kbd>
            </button>
          )
        })}
      </div>

      <form
        className="mt-2 space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {(hasValue || hasMinutes) && (
          <div className="flex gap-1">
            {hasValue && (
              <label className="flex min-w-0 flex-1 items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={task.target ? `of ${task.target}` : "value"}
                  aria-label={`Value${task.unit ? ` in ${task.unit}` : ""}`}
                  className={fieldClass}
                />
                {task.unit && <span className="shrink-0 text-[10px] text-muted-foreground">{task.unit}</span>}
              </label>
            )}
            {hasMinutes && (
              <label className="flex min-w-0 flex-1 items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={5}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="time"
                  aria-label="Time spent in minutes"
                  className={fieldClass}
                />
                <span className="shrink-0 text-[10px] text-muted-foreground">min</span>
              </label>
            )}
          </div>
        )}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              save()
            }
          }}
          rows={2}
          maxLength={500}
          placeholder="Note (shown in the cell)"
          aria-label="Note"
          className="w-full resize-y rounded border border-input bg-background px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <button
          type="submit"
          className="h-7 w-full rounded bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          Save
        </button>
      </form>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5">
        <span className="text-[10px] text-muted-foreground">Keys 1–4 · 0 clears</span>
        <button
          type="button"
          onClick={() => choose(null)}
          disabled={!entry}
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
