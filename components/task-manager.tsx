"use client"

import { useMemo, useState } from "react"
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react"
import { ACCENTS, applyAccent, readAccent, type AccentId } from "@/lib/accent"
import { LOGGER_SECTION_LABELS } from "./logger-view"
import {
  APP_TABS,
  type AppData,
  type AppTab,
  type LoggerSection,
  type DateKey,
  type RowOrder,
  type Task,
  type TaskStatus,
} from "@/lib/model/types"

const TAB_LABELS: Record<AppTab, string> = {
  today: "Today",
  tracker: "Tracker",
  review: "Review",
  timesheet: "TimeSheet",
  logger: "Logger",
}
import { scheduleSummary, type TaskDraft } from "@/lib/domain/tasks"
import { Modal } from "./modal"
import { TaskForm, emptyDraft } from "./task-form"
import { DataPanel } from "./data-panel"
import { ProfilesPanel } from "./profiles"

export type ManagerTab = "tasks" | "data" | "view" | "profiles"
type Tab = ManagerTab

interface TaskManagerProps {
  open: boolean
  onClose: () => void
  today: DateKey
  data: AppData
  tasks: Task[]
  onAdd: (draft: TaskDraft) => void
  onUpdate: (id: string, draft: TaskDraft) => void
  onSetStatus: (id: string, status: TaskStatus) => void
  onDelete: (id: string) => void
  onReplaceAll: (data: AppData) => Promise<void>
  rangeDays: number
  onRangeDaysChange: (value: number) => void
  rowOrder: RowOrder
  onRowOrderChange: (value: RowOrder) => void
  minDays: number
  maxDays: number
  dayStart: string
  dayEnd: string
  onDayHoursChange: (dayStart: string, dayEnd: string) => void
  sideSpace: number
  onSideSpaceChange: (value: number) => void
  hiddenTabs: AppTab[]
  onHiddenTabsChange: (value: AppTab[]) => void
  loggerSections: LoggerSection[]
  onLoggerSectionsChange: (value: LoggerSection[]) => void
  /** Tab shown when the dialog opens (remount with a new key to apply). */
  initialTab?: ManagerTab
}

export function TaskManager(props: TaskManagerProps) {
  const { open, onClose } = props
  const [tab, setTab] = useState<Tab>(props.initialTab ?? "tasks")

  const tabs = (
    <div className="mr-1 flex rounded-md border border-border p-0.5" role="tablist">
      {(["tasks", "data", "view", "profiles"] as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => setTab(t)}
          className={`rounded px-2 py-0.5 text-xs capitalize transition-colors ${
            tab === t
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title="Manage" actions={tabs}>
      <div className="max-h-[75vh] overflow-y-auto p-4">
        {tab === "tasks" && <TasksTab {...props} />}
        {tab === "data" && <DataPanel data={props.data} today={props.today} onReplaceAll={props.onReplaceAll} />}
        {tab === "view" && <ViewTab {...props} />}
        {tab === "profiles" && <ProfilesPanel />}
      </div>
    </Modal>
  )
}

function TasksTab({ today, data, tasks, onAdd, onUpdate, onSetStatus, onDelete }: TaskManagerProps) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const categories = useMemo(
    () => [...new Set(tasks.map((t) => t.category).filter((c): c is string => !!c))].sort(),
    [tasks],
  )
  const entryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of data.entries) counts.set(e.taskId, (counts.get(e.taskId) ?? 0) + 1)
    return counts
  }, [data.entries])

  const groups: { title: string; items: Task[] }[] = [
    {
      title: "Current",
      items: tasks.filter((t) => t.status === "active" && t.startDate <= today && !(t.endDate && t.endDate < today)),
    },
    { title: "Planned", items: tasks.filter((t) => t.status === "active" && t.startDate > today) },
    { title: "Paused", items: tasks.filter((t) => t.status === "paused") },
    {
      title: "Ended",
      items: tasks.filter((t) => t.status === "active" && t.endDate !== undefined && t.endDate < today),
    },
    { title: "Archived", items: tasks.filter((t) => t.status === "archived") },
  ]

  return (
    <div className="space-y-4">
      {adding ? (
        <TaskForm
          initial={emptyDraft(today)}
          categories={categories}
          submitLabel="Add task"
          onSubmit={(draft) => {
            onAdd(draft)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          data-autofocus
          onClick={() => {
            setAdding(true)
            setEditingId(null)
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New task
        </button>
      )}

      {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}

      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <section key={group.title} className="space-y-1">
            <h3 className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              {group.title} ({group.items.length})
            </h3>
            {group.items.map((task) =>
              editingId === task.id ? (
                <TaskForm
                  key={task.id}
                  initial={task}
                  categories={categories}
                  submitLabel="Save"
                  onSubmit={(draft) => {
                    onUpdate(task.id, draft)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : confirmDelete === task.id ? (
                <DeleteConfirm
                  key={task.id}
                  task={task}
                  entryCount={entryCounts.get(task.id) ?? 0}
                  onArchive={() => {
                    onSetStatus(task.id, "archived")
                    setConfirmDelete(null)
                  }}
                  onDelete={() => {
                    onDelete(task.id)
                    setConfirmDelete(null)
                  }}
                  onCancel={() => setConfirmDelete(null)}
                />
              ) : (
                <TaskRow
                  key={task.id}
                  task={task}
                  onEdit={() => {
                    setEditingId(task.id)
                    setAdding(false)
                  }}
                  onSetStatus={(s) => onSetStatus(task.id, s)}
                  onDelete={() => setConfirmDelete(task.id)}
                />
              ),
            )}
          </section>
        ))}
    </div>
  )
}

const iconButton =
  "inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"

function TaskRow({
  task,
  onEdit,
  onSetStatus,
  onDelete,
}: {
  task: Task
  onEdit: () => void
  onSetStatus: (s: TaskStatus) => void
  onDelete: () => void
}) {
  const archived = task.status === "archived"
  return (
    <div className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-accent/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-sm ${archived ? "text-muted-foreground" : "text-foreground"}`}>
            {task.name}
          </span>
          {task.category && (
            <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              {task.category}
            </span>
          )}
          {!task.showOnDashboard && (
            <span className="shrink-0 text-[10px] text-muted-foreground" title="Hidden from the dashboard">
              hidden
            </span>
          )}
        </div>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {scheduleSummary(task.schedule)} · from {task.startDate}
          {task.endDate ? ` to ${task.endDate}` : ""}
          {task.target ? ` · ${task.target}${task.unit ? ` ${task.unit}` : ""}` : ""}
          {task.deadline
            ? ` · due ${task.deadline}${task.goalTotal ? ` (${task.goalTotal}${task.unit ? ` ${task.unit}` : ""})` : ""}`
            : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={onEdit} className={iconButton} aria-label={`Edit ${task.name}`} title="Edit">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {task.status === "active" && (
          <button
            type="button"
            onClick={() => onSetStatus("paused")}
            className={iconButton}
            aria-label={`Pause ${task.name}`}
            title="Pause"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        {task.status === "paused" && (
          <button
            type="button"
            onClick={() => onSetStatus("active")}
            className={iconButton}
            aria-label={`Resume ${task.name}`}
            title="Resume"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        {archived ? (
          <button
            type="button"
            onClick={() => onSetStatus("active")}
            className={iconButton}
            aria-label={`Restore ${task.name}`}
            title="Restore"
          >
            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSetStatus("archived")}
            className={iconButton}
            aria-label={`Archive ${task.name}`}
            title="Archive (keeps history)"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className={`${iconButton} hover:bg-destructive/10 hover:text-destructive`}
          aria-label={`Delete ${task.name}`}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function DeleteConfirm({
  task,
  entryCount,
  onArchive,
  onDelete,
  onCancel,
}: {
  task: Task
  entryCount: number
  onArchive: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2" role="alert">
      <p className="text-sm text-foreground">
        Delete &ldquo;{task.name}&rdquo;
        {entryCount > 0 ? ` and its ${entryCount} recorded ${entryCount === 1 ? "entry" : "entries"}` : ""}? This
        can&rsquo;t be undone.
      </p>
      {entryCount > 0 && task.status !== "archived" && (
        <p className="mt-0.5 text-xs text-muted-foreground">Archiving hides the task but keeps its history.</p>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          Cancel
        </button>
        {entryCount > 0 && task.status !== "archived" && (
          <button
            type="button"
            onClick={onArchive}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground hover:bg-accent"
          >
            Archive instead
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-white hover:opacity-90"
        >
          Delete permanently
        </button>
      </div>
    </div>
  )
}

function ViewTab({
  rangeDays,
  onRangeDaysChange,
  rowOrder,
  onRowOrderChange,
  minDays,
  maxDays,
  dayStart,
  dayEnd,
  onDayHoursChange,
  sideSpace,
  onSideSpaceChange,
  hiddenTabs,
  onHiddenTabsChange,
  loggerSections,
  onLoggerSectionsChange,
}: TaskManagerProps) {
  const [accent, setAccent] = useState<AccentId>(() => readAccent())
  const move = (i: number, by: -1 | 1) => {
    const next = [...loggerSections]
    const [item] = next.splice(i, 1)
    next.splice(i + by, 0, item)
    onLoggerSectionsChange(next)
  }
  const [draft, setDraft] = useState(String(rangeDays))
  const parsed = Number(draft)
  const valid = Number.isInteger(parsed) && parsed >= minDays && parsed <= maxDays

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/50 px-3 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Days shown</p>
          <p className="text-[11px] text-muted-foreground">
            How many days of history the dashboard shows at once ({minDays}–{maxDays}). Default 30.
          </p>
        </div>
        <form
          className="flex shrink-0 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) onRangeDaysChange(parsed)
          }}
        >
          <button
            type="button"
            onClick={() => {
              const next = Math.max(minDays, rangeDays - 1)
              setDraft(String(next))
              onRangeDaysChange(next)
            }}
            disabled={rangeDays <= minDays}
            className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label="Fewer days"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={minDays}
            max={maxDays}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => (valid ? onRangeDaysChange(parsed) : setDraft(String(rangeDays)))}
            aria-label="Days shown"
            aria-invalid={!valid}
            className="h-7 w-16 rounded-md border border-border bg-card px-2 text-center font-mono text-sm text-foreground aria-invalid:border-destructive"
          />
          <button
            type="button"
            onClick={() => {
              const next = Math.min(maxDays, rangeDays + 1)
              setDraft(String(next))
              onRangeDaysChange(next)
            }}
            disabled={rangeDays >= maxDays}
            className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label="More days"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/50 px-3 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Row order</p>
          <p className="text-[11px] text-muted-foreground">
            Spreadsheet order puts the oldest day at the top and today at the bottom.
          </p>
        </div>
        <div className="flex shrink-0 rounded-md border border-border p-0.5" role="radiogroup" aria-label="Row order">
          {(
            [
              ["oldest", "Today at bottom"],
              ["newest", "Today at top"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rowOrder === value}
              onClick={() => onRowOrderChange(value)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                rowOrder === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-border bg-background/50 px-3 py-3">
        <p className="text-sm font-medium text-foreground">Colour theme</p>
        <p className="text-[11px] text-muted-foreground">
          Colours the page background, cards, buttons, tabs and highlights, in light and dark mode. Saved per profile.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour theme">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={accent === a.id}
              onClick={() => {
                applyAccent(a.id)
                setAccent(a.id)
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs text-foreground transition-colors hover:bg-accent ${
                accent === a.id ? "border-primary ring-2 ring-ring/40" : "border-border"
              }`}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-border"
                style={{ background: a.swatch }}
                aria-hidden="true"
              />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-border bg-background/50 px-3 py-3">
        <p className="text-sm font-medium text-foreground">Logger sections</p>
        <p className="text-[11px] text-muted-foreground">
          Show, hide and reorder what the Logger tab shows. Hidden sections keep their data.
        </p>
        <ul className="mt-2 space-y-1">
          {loggerSections.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={s.visible}
                  onChange={(e) =>
                    onLoggerSectionsChange(
                      loggerSections.map((x) => (x.id === s.id ? { ...x, visible: e.target.checked } : x)),
                    )
                  }
                  className="h-4 w-4 accent-primary"
                />
                <span className={`truncate ${s.visible ? "" : "text-muted-foreground line-through"}`}>
                  {LOGGER_SECTION_LABELS[s.id]}
                </span>
              </label>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className={`${iconButton} disabled:opacity-30`}
                aria-label={`Move ${LOGGER_SECTION_LABELS[s.id]} up`}
              >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === loggerSections.length - 1}
                className={`${iconButton} disabled:opacity-30`}
                aria-label={`Move ${LOGGER_SECTION_LABELS[s.id]} down`}
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border border-border bg-background/50 px-3 py-3">
        <p className="text-sm font-medium text-foreground">Tabs</p>
        <p className="text-[11px] text-muted-foreground">
          Hide tabs you don&apos;t use. Hiding only removes the button; nothing is lost, and at least one tab stays
          visible.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Visible tabs">
          {APP_TABS.map((t) => {
            const shown = !hiddenTabs.includes(t)
            const lastShown = shown && hiddenTabs.length >= APP_TABS.length - 1
            return (
              <button
                key={t}
                type="button"
                aria-pressed={shown}
                disabled={lastShown}
                onClick={() => onHiddenTabsChange(shown ? [...hiddenTabs, t] : hiddenTabs.filter((h) => h !== t))}
                title={
                  lastShown
                    ? "At least one tab stays visible"
                    : shown
                      ? `Hide ${TAB_LABELS[t]}`
                      : `Show ${TAB_LABELS[t]}`
                }
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors disabled:cursor-not-allowed ${
                  shown
                    ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
                    : "border-border text-muted-foreground line-through hover:bg-accent hover:text-foreground"
                }`}
              >
                {shown ? (
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {TAB_LABELS[t]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-md border border-border bg-background/50 px-3 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="side-space" className="text-sm font-medium text-foreground">
            Page width
          </label>
          <span className="font-mono text-[11px] text-muted-foreground">
            {sideSpace === 0 ? "full width" : sideSpace === 100 ? "narrow (1280px)" : `${sideSpace}% side space`}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Space left empty on both sides. Less space shows more task columns; drag and watch the page behind.
        </p>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Wide</span>
          <input
            id="side-space"
            type="range"
            min={0}
            max={100}
            step={5}
            value={sideSpace}
            onChange={(e) => onSideSpaceChange(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-primary"
          />
          <span>Narrow</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/50 px-3 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Usual day</p>
          <p className="text-[11px] text-muted-foreground">
            When your day normally starts and ends. The TimeSheet counts unlogged time inside it as &quot;nothing
            logged&quot; and treats the rest as off/sleep. Mark a different start on any day.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <input
            type="time"
            defaultValue={dayStart}
            onBlur={(e) => e.target.value && onDayHoursChange(e.target.value, dayEnd)}
            className="h-7 rounded-md border border-border bg-card px-1.5 font-mono text-xs text-foreground"
            aria-label="Usual day start"
          />
          to
          <input
            type="time"
            defaultValue={dayEnd}
            onBlur={(e) => e.target.value && onDayHoursChange(dayStart, e.target.value)}
            className="h-7 rounded-md border border-border bg-card px-1.5 font-mono text-xs text-foreground"
            aria-label="Usual day end"
          />
        </div>
      </div>
    </div>
  )
}
