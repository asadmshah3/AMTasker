"use client"

import { useState } from "react"
import type { EntryStatus, Task } from "@/lib/model/types"
import type { EntryChange } from "@/lib/use-app-data"
import { countUnresolved, type UnresolvedDay } from "@/lib/domain/unresolved"
import { formatLongLabel } from "@/lib/date-utils"
import { Modal } from "./modal"
import { STATUS_META, STATUS_ORDER } from "./status"

interface MissingReviewProps {
  open: boolean
  onClose: () => void
  days: UnresolvedDay[]
  tasks: Task[]
  onResolve: (changes: EntryChange[]) => void
}

const PAGE = 14

/** Compact list of past expected entries with no answer, resolvable one at a time or per day. */
export function MissingReview({ open, onClose, days, tasks, onResolve }: MissingReviewProps) {
  const [shown, setShown] = useState(PAGE)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const total = countUnresolved(days)

  function resolve(date: string, taskIds: string[], status: EntryStatus) {
    onResolve(taskIds.map((taskId) => ({ taskId, date, status })))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Missing entries"
      width="max-w-xl"
      actions={
        <button
          type="button"
          onClick={onClose}
          data-autofocus
          className="h-7 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Later
        </button>
      }
    >
      {total === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="font-mono text-sm text-foreground">All caught up ✓</p>
          <p className="mt-1 text-xs text-muted-foreground">Every past entry has an answer.</p>
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto">
          <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            {total} {total === 1 ? "entry has" : "entries have"} no answer yet. Unanswered is not the same as not done —
            pick what actually happened, or come back later.
          </p>
          <ol>
            {days.slice(0, shown).map((day) => (
              <li key={day.date} className="border-b border-border px-4 py-2 last:border-b-0">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-xs font-semibold text-foreground">{formatLongLabel(day.date)}</h3>
                  {day.taskIds.length > 1 && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>All:</span>
                      <StatusButtons
                        compact
                        label={`all tasks on ${formatLongLabel(day.date)}`}
                        onPick={(s) => resolve(day.date, day.taskIds, s)}
                      />
                    </div>
                  )}
                </div>
                <ul className="space-y-1">
                  {day.taskIds.map((taskId) => {
                    const task = byId.get(taskId)
                    if (!task) return null
                    return (
                      <li key={taskId} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm text-foreground">{task.name}</span>
                        <StatusButtons
                          label={`${task.name} on ${formatLongLabel(day.date)}`}
                          onPick={(s) => resolve(day.date, [taskId], s)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ol>
          {days.length > shown && (
            <div className="border-t border-border p-2 text-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Show older ({days.length - shown} more days)
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function StatusButtons({
  label,
  onPick,
  compact,
}: {
  label: string
  onPick: (s: EntryStatus) => void
  compact?: boolean
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {STATUS_ORDER.map((s) => {
        const meta = STATUS_META[s]
        return (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            aria-label={`Mark ${label} as ${meta.label.toLowerCase()}`}
            title={meta.label}
            className={`inline-flex items-center gap-1 rounded border border-border text-xs text-foreground transition-colors ${meta.button} ${
              compact ? "h-6 px-1.5" : "h-7 px-2"
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] ${meta.cell}`}
              aria-hidden="true"
            >
              {meta.symbol}
            </span>
            {!compact && <span className="hidden sm:inline">{meta.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
