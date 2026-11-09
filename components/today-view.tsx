"use client"

import { useState } from "react"
import { CalendarClock, Moon, Play, RotateCcw, Square, Star, TriangleAlert } from "lucide-react"
import { MAX_FOCUS, entryId, type DateKey, type DayPlan, type EntryIndex, type Task } from "@/lib/model/types"
import type { EntryChange } from "@/lib/use-app-data"
import type { FocusSession } from "@/lib/use-focus-timer"
import { formatLongLabel } from "@/lib/date-utils"
import {
  formatMinutes,
  isMinuteUnit,
  missedYesterday,
  plannedMinutes,
  spentMinutes,
  tasksForDay,
  type DeadlineInfo,
} from "@/lib/domain/planning"
import { STATUS_META, nextStatus } from "./status"
import { DeadlineBadge, GoalBar } from "./deadline-badge"

type PlanPatch = Partial<Omit<DayPlan, "date" | "updatedAt">>

interface TodayViewProps {
  today: DateKey
  tasks: Task[]
  entries: EntryIndex
  plan: DayPlan | undefined
  /** Available minutes from the most recent day that set them, used as today's default. */
  lastAvailable: number | undefined
  deadlines: Map<string, DeadlineInfo>
  session: FocusSession | null
  onEntry: (change: EntryChange) => void
  onPlan: (patch: PlanPatch) => void
  onStartFocus: (taskId: string) => void
  onStopFocus: () => void
}

const inputClass =
  "h-7 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"

export function TodayView({
  today,
  tasks,
  entries,
  plan,
  lastAvailable,
  deadlines,
  session,
  onEntry,
  onPlan,
  onStartFocus,
  onStopFocus,
}: TodayViewProps) {
  const dayTasks = tasksForDay(tasks, today, plan)
  const focus = plan?.focus ?? []
  const missed = new Set(missedYesterday(tasks, entries, today).map((t) => t.id))
  const available = plan?.availableMinutes ?? lastAvailable

  let plannedTotal = 0
  let spentTotal = 0
  for (const t of dayTasks) {
    plannedTotal += plannedMinutes(t, plan)
    spentTotal += spentMinutes(t, entries.get(entryId(t.id, today)))
  }
  const overbooked = available !== undefined && available > 0 && plannedTotal > available
  const open = dayTasks.filter((t) => !entries.has(entryId(t.id, today))).length

  function toggleFocus(id: string) {
    onPlan({ focus: focus.includes(id) ? focus.filter((f) => f !== id) : [...focus, id].slice(0, MAX_FOCUS) })
  }

  function setPlanned(id: string, text: string) {
    const planned = { ...(plan?.planned ?? {}) }
    const n = Number(text)
    if (text.trim() === "" || !Number.isFinite(n) || n < 0) delete planned[id]
    else planned[id] = Math.round(n)
    onPlan({ planned })
  }

  const withDeadlines = tasks
    .filter((t) => t.status !== "archived" && deadlines.has(t.id))
    .sort((a, b) => deadlines.get(a.id)!.daysLeft - deadlines.get(b.id)!.daysLeft)

  return (
    <div className="flex flex-col gap-3">
      {missed.size > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <p>
            <span className="font-medium">Never miss twice:</span>{" "}
            {dayTasks
              .filter((t) => missed.has(t.id))
              .map((t) => t.name)
              .join(", ")}{" "}
            {missed.size === 1 ? "was" : "were"} missed yesterday. Even a small version today keeps the habit alive.
          </p>
        </div>
      )}

      {/* Plan */}
      <section className="rounded-lg border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-3 py-2.5">
          <div>
            <h2 className="font-mono text-sm font-semibold text-foreground">Plan · {formatLongLabel(today)}</h2>
            <p className="text-[11px] text-muted-foreground">
              Star up to {MAX_FOCUS} most important tasks and do them first. Plan minutes, then start a focus session.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-muted-foreground">
              Available
              <input
                key={`avail-${available ?? ""}`}
                type="number"
                min={0}
                step={15}
                defaultValue={available ?? ""}
                placeholder="min"
                onBlur={(e) => {
                  const n = Number(e.target.value)
                  onPlan({ availableMinutes: e.target.value.trim() && n >= 0 ? Math.round(n) : undefined })
                }}
                className={`${inputClass} w-20`}
                aria-label="Minutes available today"
              />
              min
            </label>
            <span
              className={`font-mono tabular-nums ${overbooked ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
            >
              Planned {formatMinutes(plannedTotal)}
              {available ? ` / ${formatMinutes(available)}` : ""}
            </span>
            <span className="font-mono tabular-nums text-foreground">Spent {formatMinutes(spentTotal)}</span>
          </div>
        </header>

        {overbooked && (
          <p className="flex items-center gap-1.5 border-b border-border bg-amber-500/10 px-3 py-1.5 text-xs text-foreground">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            Over-planned by {formatMinutes(plannedTotal - (available ?? 0))}. Trim the plan so it fits — a realistic day
            gets finished.
          </p>
        )}

        {dayTasks.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing is scheduled today. Add or schedule tasks in Manage.
          </p>
        ) : (
          <ul>
            {dayTasks.map((task) => {
              const entry = entries.get(entryId(task.id, today))
              const isFocus = focus.includes(task.id)
              const planned = plannedMinutes(task, plan)
              const spent = spentMinutes(task, entry)
              const running = session?.taskId === task.id
              const info = deadlines.get(task.id)
              const meta = entry ? STATUS_META[entry.status] : null
              return (
                <li
                  key={task.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-2 last:border-b-0 ${
                    isFocus ? "bg-amber-500/5" : ""
                  } ${running ? "outline-2 -outline-offset-2 outline-primary" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleFocus(task.id)}
                    disabled={!isFocus && focus.length >= MAX_FOCUS}
                    aria-pressed={isFocus}
                    aria-label={isFocus ? `Remove ${task.name} from focus` : `Make ${task.name} a focus task`}
                    title={!isFocus && focus.length >= MAX_FOCUS ? `Up to ${MAX_FOCUS} focus tasks` : "Focus task"}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Star className={`h-4 w-4 ${isFocus ? "fill-amber-400 text-amber-500" : ""}`} aria-hidden="true" />
                  </button>

                  <div className="min-w-32 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{task.name}</span>
                      {isFocus && (
                        <span className="rounded bg-amber-400/25 px-1 text-[9px] font-semibold uppercase text-amber-800 dark:text-amber-300">
                          Focus {focus.indexOf(task.id) + 1}
                        </span>
                      )}
                      {missed.has(task.id) && (
                        <span className="rounded border border-amber-500/60 px-1 text-[9px] uppercase text-amber-700 dark:text-amber-300">
                          missed yesterday
                        </span>
                      )}
                      {info && <DeadlineBadge info={info} unit={task.unit} />}
                    </div>
                    {planned > 0 && (
                      <div
                        className="mt-1 h-1 w-full max-w-60 overflow-hidden rounded-full bg-muted"
                        aria-hidden="true"
                      >
                        <div
                          className={`h-full rounded-full ${spent >= planned ? "bg-lime-500" : "bg-primary/60"}`}
                          style={{ width: `${Math.min(100, (spent / planned) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    Plan
                    <input
                      key={`${task.id}-${plan?.planned[task.id] ?? ""}`}
                      type="number"
                      min={0}
                      step={5}
                      defaultValue={plan?.planned[task.id] ?? ""}
                      placeholder={isMinuteUnit(task.unit) && task.target ? String(task.target) : "–"}
                      onBlur={(e) => setPlanned(task.id, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className={`${inputClass} w-16`}
                      aria-label={`Planned minutes for ${task.name}`}
                    />
                    m
                  </label>

                  <span
                    className="w-20 text-right font-mono text-xs tabular-nums text-foreground"
                    title="Time spent today"
                  >
                    {formatMinutes(spent)}
                    {planned > 0 && <span className="text-muted-foreground"> /{formatMinutes(planned)}</span>}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      const s = nextStatus(entry?.status)
                      onEntry(
                        s === null
                          ? { taskId: task.id, date: today, status: null }
                          : { taskId: task.id, date: today, status: s, value: entry?.value },
                      )
                    }}
                    className={`flex h-7 w-24 items-center justify-center gap-1 rounded-md border border-border text-xs transition-colors ${
                      meta ? meta.cell : "text-muted-foreground hover:bg-accent"
                    }`}
                    title="Click to cycle the status"
                    aria-label={`${task.name} today: ${meta ? meta.label : "no entry"}. Click to change.`}
                  >
                    {meta ? (
                      <>
                        <span aria-hidden="true">{meta.symbol}</span>
                        {meta.label}
                      </>
                    ) : (
                      "Mark…"
                    )}
                  </button>

                  {running ? (
                    <button
                      type="button"
                      onClick={onStopFocus}
                      className="inline-flex h-7 w-20 items-center justify-center gap-1 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      <Square className="h-3 w-3" aria-hidden="true" />
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartFocus(task.id)}
                      className="inline-flex h-7 w-20 items-center justify-center gap-1 rounded-md border border-border text-xs text-foreground hover:bg-accent"
                      title={session ? "Switch: logs the running session first" : "Start a focus session"}
                    >
                      <Play className="h-3 w-3" aria-hidden="true" />
                      Focus
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <Shutdown key={plan?.shutdownAt ?? "open"} plan={plan} open={open} onPlan={onPlan} />

        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-mono text-sm font-semibold text-foreground">Deadlines</h2>
          </header>
          {withDeadlines.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No deadlines. Give a goal (a course, a book) a deadline and total in Manage → edit task.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {withDeadlines.map((t) => {
                const info = deadlines.get(t.id)!
                return (
                  <li key={t.id} className="space-y-1 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-foreground">{t.name}</span>
                      <DeadlineBadge info={info} unit={t.unit} />
                    </div>
                    <GoalBar info={info} />
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/** End-of-day shutdown: a short reflection, then close the day. */
function Shutdown({
  plan,
  open,
  onPlan,
}: {
  plan: DayPlan | undefined
  open: number
  onPlan: (patch: PlanPatch) => void
}) {
  const [text, setText] = useState(plan?.reflection ?? "")
  const closed = plan?.shutdownAt !== undefined

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Moon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-mono text-sm font-semibold text-foreground">End-of-day shutdown</h2>
      </header>
      <div className="space-y-2 p-3">
        {closed ? (
          <>
            <p className="text-xs text-muted-foreground">
              Day closed at {new Date(plan!.shutdownAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              .
            </p>
            {plan?.reflection && <p className="whitespace-pre-wrap text-sm text-foreground">{plan.reflection}</p>}
            <button
              type="button"
              onClick={() => onPlan({ shutdownAt: undefined })}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reopen
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {open > 0
                ? `${open} task${open === 1 ? "" : "s"} still unmarked — mark them above.`
                : "Every task is marked."}{" "}
              Then note what went well, what got in the way, and the first thing for tomorrow.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => onPlan({ reflection: text })}
              rows={3}
              placeholder="Went well… Got in the way… Tomorrow first…"
              aria-label="Reflection for today"
              className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => onPlan({ reflection: text, shutdownAt: new Date().toISOString() })}
              className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Close the day
            </button>
          </>
        )}
      </div>
    </section>
  )
}
