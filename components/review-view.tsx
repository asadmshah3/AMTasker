"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { DateKey, DayPlan, EntryIndex, Task } from "@/lib/model/types"
import { addDays, formatLongLabel, formatRangeLabel } from "@/lib/date-utils"
import { formatMinutes, summarizeWeek, weekStart, type DeadlineInfo } from "@/lib/domain/planning"
import { DeadlineBadge, GoalBar } from "./deadline-badge"

interface ReviewViewProps {
  today: DateKey
  tasks: Task[]
  entries: EntryIndex
  plans: Map<DateKey, DayPlan>
  deadlines: Map<string, DeadlineInfo>
}

/** Weekly review: how the week went, planned vs spent, and the notes written at each shutdown. */
export function ReviewView({ today, tasks, entries, plans, deadlines }: ReviewViewProps) {
  const thisWeek = weekStart(today)
  const [monday, setMonday] = useState(thisWeek)
  const week = useMemo(
    () => summarizeWeek(tasks, entries, plans, monday, today),
    [tasks, entries, plans, monday, today],
  )
  const maxDay = Math.max(1, ...week.days.map((d) => Math.max(d.plannedMinutes, d.spentMinutes)))
  const reflections = week.days.filter((d) => d.reflection)
  const goals = tasks.filter((t) => t.status !== "archived" && deadlines.has(t.id))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5">
        <button
          type="button"
          onClick={() => setMonday(addDays(monday, -7))}
          className="inline-flex h-7 items-center rounded-md px-2 text-foreground hover:bg-accent"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-44 text-center font-mono text-sm font-medium text-foreground">
          {formatRangeLabel(monday, addDays(monday, 6))}
        </span>
        <button
          type="button"
          onClick={() => setMonday(addDays(monday, 7))}
          disabled={monday >= thisWeek}
          className="inline-flex h-7 items-center rounded-md px-2 text-foreground hover:bg-accent disabled:opacity-40"
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        {monday !== thisWeek && (
          <button
            type="button"
            onClick={() => setMonday(thisWeek)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            This week
          </button>
        )}
        <p className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
          Weekly review: what worked, what slipped, and what to change next week.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Completion" value={`${week.completionPct}%`} />
        <Tile label="Planned" value={formatMinutes(week.plannedMinutes)} />
        <Tile label="Spent" value={formatMinutes(week.spentMinutes)} />
        <Tile
          label="Spent vs plan"
          value={week.plannedMinutes ? `${Math.round((week.spentMinutes / week.plannedMinutes) * 100)}%` : "–"}
        />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="font-mono text-sm font-semibold text-foreground">Minutes per day</h2>
          <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-sm bg-muted-foreground/40" aria-hidden="true" /> planned
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-sm bg-lime-500" aria-hidden="true" /> spent
            </span>
          </span>
        </header>
        <ul className="space-y-1.5 p-3">
          {week.days.map((d) => (
            <li key={d.date} className="grid grid-cols-[7.5rem_1fr_7rem] items-center gap-2 text-xs">
              <span
                className={`font-mono ${d.date === today ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {formatLongLabel(d.date)}
              </span>
              <div className="space-y-0.5" aria-hidden="true">
                <div
                  className="h-1.5 rounded-sm bg-muted-foreground/40"
                  style={{ width: `${(d.plannedMinutes / maxDay) * 100}%` }}
                />
                <div
                  className="h-1.5 rounded-sm bg-lime-500"
                  style={{ width: `${(d.spentMinutes / maxDay) * 100}%` }}
                />
              </div>
              <span className="text-right font-mono tabular-nums text-foreground">
                {formatMinutes(d.spentMinutes)}
                <span className="text-muted-foreground"> / {formatMinutes(d.plannedMinutes)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[34rem] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">
                Task
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Done
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Partial
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Missed
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Planned
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Spent
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Difference
              </th>
            </tr>
          </thead>
          <tbody>
            {week.tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Nothing was scheduled this week.
                </td>
              </tr>
            ) : (
              week.tasks.map((r) => {
                const diff = r.spentMinutes - r.plannedMinutes
                return (
                  <tr key={r.task.id} className="border-b border-border last:border-b-0">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal text-foreground">
                      {r.task.name}
                    </th>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {r.completed}/{r.expected}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{r.partial}</td>
                    <td
                      className={`px-2 py-1.5 text-right font-mono tabular-nums ${r.missed ? "text-red-600 dark:text-red-400" : ""}`}
                    >
                      {r.missed}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatMinutes(r.plannedMinutes)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatMinutes(r.spentMinutes)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {r.plannedMinutes || r.spentMinutes
                        ? `${diff >= 0 ? "+" : "−"}${formatMinutes(Math.abs(diff))}`
                        : "–"}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-card">
          <header className="border-b border-border px-3 py-2.5">
            <h2 className="font-mono text-sm font-semibold text-foreground">Shutdown notes</h2>
          </header>
          {reflections.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No notes this week. Write one at the end of each day on Today.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {reflections.map((d) => (
                <li key={d.date} className="px-3 py-2">
                  <p className="font-mono text-[11px] text-muted-foreground">{formatLongLabel(d.date)}</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{d.reflection}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <header className="border-b border-border px-3 py-2.5">
            <h2 className="font-mono text-sm font-semibold text-foreground">Goals &amp; deadlines</h2>
          </header>
          {goals.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No tasks with deadlines.</p>
          ) : (
            <ul className="divide-y divide-border">
              {goals.map((t) => (
                <li key={t.id} className="space-y-1 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-foreground">{t.name}</span>
                    <DeadlineBadge info={deadlines.get(t.id)!} unit={t.unit} />
                  </div>
                  <GoalBar info={deadlines.get(t.id)!} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="font-mono text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
