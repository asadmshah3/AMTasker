"use client"

import { useState } from "react"
import type { DateKey, TaskSchedule } from "@/lib/model/types"
import type { TaskDraft } from "@/lib/domain/tasks"
import { DAY_ABBR, DAY_SHORT } from "@/lib/date-utils"

interface TaskFormProps {
  initial: TaskDraft
  categories: string[]
  submitLabel: string
  onSubmit: (draft: TaskDraft) => void
  onCancel: () => void
}

type ScheduleType = TaskSchedule["type"]

const SCHEDULE_TYPES: { id: ScheduleType; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "custom", label: "Days" },
  { id: "once", label: "Once" },
]

const UNITS = ["minutes", "hours", "pages", "reps", "km", "times"]

export function emptyDraft(today: DateKey): TaskDraft {
  return { name: "", startDate: today, schedule: { type: "daily" }, showOnDashboard: true }
}

const inputClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"

export function TaskForm({ initial, categories, submitLabel, onSubmit, onCancel }: TaskFormProps) {
  const [draft, setDraft] = useState<TaskDraft>(initial)
  const [days, setDays] = useState<number[]>(initial.schedule.type === "custom" ? initial.schedule.days : [1, 3, 5])
  const [onceDate, setOnceDate] = useState<DateKey>(
    initial.schedule.type === "once" ? initial.schedule.date : initial.startDate,
  )
  const [targetText, setTargetText] = useState(initial.target !== undefined ? String(initial.target) : "")
  const [goalText, setGoalText] = useState(initial.goalTotal !== undefined ? String(initial.goalTotal) : "")

  const type = draft.schedule.type
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  function setType(next: ScheduleType) {
    const schedule: TaskSchedule =
      next === "custom" ? { type: "custom", days } : next === "once" ? { type: "once", date: onceDate } : { type: next }
    set("schedule", schedule)
  }

  function toggleDay(d: number) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b)
    setDays(next)
    set("schedule", { type: "custom", days: next })
  }

  const target = targetText.trim() === "" ? undefined : Number(targetText)
  const errors: string[] = []
  if (!draft.name.trim()) errors.push("Name is required.")
  if (draft.endDate && draft.endDate < draft.startDate) errors.push("End date is before the start date.")
  if (type === "custom" && days.length === 0) errors.push("Pick at least one day.")
  if (type === "once" && !onceDate) errors.push("Pick a date.")
  if (target !== undefined && !(target > 0)) errors.push("Target must be a positive number.")
  const goalTotal = goalText.trim() === "" ? undefined : Number(goalText)
  if (goalTotal !== undefined && !(goalTotal > 0)) errors.push("Goal total must be a positive number.")
  if (goalTotal !== undefined && !draft.deadline) errors.push("Set a deadline for the goal total.")
  if (draft.deadline && draft.deadline < draft.startDate) errors.push("Deadline is before the start date.")

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (errors.length > 0) return
    // A one-time task starts no later than its date.
    const startDate = type === "once" && onceDate < draft.startDate ? onceDate : draft.startDate
    onSubmit({ ...draft, startDate, target, goalTotal })
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border bg-background/50 p-3">
      <Field label="Name">
        <input
          data-autofocus
          autoFocus
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={40}
          placeholder="e.g. German B2"
          className={inputClass}
        />
      </Field>

      <Field label="Schedule" group>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Schedule">
          {SCHEDULE_TYPES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={type === s.id}
              onClick={() => setType(s.id)}
              className={`h-7 rounded-md border px-2.5 text-xs transition-colors ${
                type === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {type === "custom" && (
          <div className="mt-1.5 flex gap-1">
            {DAY_SHORT.map((label, d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                aria-label={DAY_ABBR[d]}
                title={DAY_ABBR[d]}
                onClick={() => toggleDay(d)}
                className={`h-7 w-7 rounded-md border font-mono text-xs transition-colors ${
                  days.includes(d)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {type === "once" && (
          <input
            type="date"
            value={onceDate}
            onChange={(e) => {
              setOnceDate(e.target.value)
              set("schedule", { type: "once", date: e.target.value })
            }}
            className={`${inputClass} mt-1.5 w-auto`}
            aria-label="Date"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Start date">
          <input
            type="date"
            required
            value={draft.startDate}
            onChange={(e) => e.target.value && set("startDate", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="End date (optional)">
          <input
            type="date"
            value={draft.endDate ?? ""}
            onChange={(e) => set("endDate", e.target.value || undefined)}
            className={inputClass}
          />
        </Field>
        <Field label="Target (optional)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            placeholder="e.g. 60"
            className={inputClass}
          />
        </Field>
        <Field label="Unit (optional)">
          <input
            list="task-units"
            value={draft.unit ?? ""}
            onChange={(e) => set("unit", e.target.value)}
            placeholder="e.g. minutes"
            maxLength={16}
            className={inputClass}
          />
          <datalist id="task-units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Deadline (optional)">
          <input
            type="date"
            value={draft.deadline ?? ""}
            onChange={(e) => set("deadline", e.target.value || undefined)}
            className={inputClass}
          />
        </Field>
        <Field label="Goal total by deadline">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            placeholder={draft.unit ? `e.g. 1200 ${draft.unit}` : "e.g. 30"}
            className={inputClass}
          />
        </Field>
      </div>
      <p className="-mt-1.5 text-[10px] text-muted-foreground">
        For goals like a course or a book: finish by the deadline. The total is in the task&apos;s unit and adds up the
        values you record. Unlike the end date, a deadline doesn&apos;t stop the task.
      </p>

      <Field label="Category (optional)">
        <input
          list="task-categories"
          value={draft.category ?? ""}
          onChange={(e) => set("category", e.target.value)}
          placeholder="e.g. Learning"
          maxLength={24}
          className={inputClass}
        />
        <datalist id="task-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <Field label="Description (optional)">
        <textarea
          value={draft.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          maxLength={280}
          className={`${inputClass} h-auto resize-y py-1.5`}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={draft.showOnDashboard}
          onChange={(e) => set("showOnDashboard", e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Show on dashboard
      </label>

      {errors.length > 0 && draft.name.trim() !== "" && (
        <p className="text-xs text-destructive" role="alert">
          {errors.join(" ")}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={errors.length > 0}
          className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

/** A labelled form field. `group` renders a div, for fields made of several controls. */
function Field({ label, group, children }: { label: string; group?: boolean; children: React.ReactNode }) {
  const Tag = group ? "div" : "label"
  return (
    <Tag className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </Tag>
  )
}
