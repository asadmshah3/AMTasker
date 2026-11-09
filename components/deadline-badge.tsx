import { CalendarClock, CircleCheck, TriangleAlert } from "lucide-react"
import { deadlineLabel, type DeadlineInfo } from "@/lib/domain/planning"
import { formatSheetDate } from "@/lib/date-utils"

const STATE_STYLE: Record<DeadlineInfo["state"], string> = {
  on_track: "border-border text-muted-foreground",
  behind: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  due_today: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  overdue: "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300",
  done: "border-lime-600/50 bg-lime-500/10 text-lime-800 dark:text-lime-300",
}

const STATE_TEXT: Record<DeadlineInfo["state"], string> = {
  on_track: "on track",
  behind: "behind pace",
  due_today: "due today",
  overdue: "overdue",
  done: "goal reached",
}

/** Countdown + goal progress for a task with a deadline. The state is spelled out, not only coloured. */
export function DeadlineBadge({
  info,
  unit,
  className = "",
}: {
  info: DeadlineInfo
  unit?: string
  className?: string
}) {
  const Icon = info.state === "done" ? CircleCheck : info.state === "on_track" ? CalendarClock : TriangleAlert
  const behind = info.state === "behind" ? " · behind" : ""
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded border px-1 py-px font-mono text-[9px] normal-case leading-tight tracking-normal ${STATE_STYLE[info.state]} ${className}`}
      title={`Deadline ${formatSheetDate(info.deadline)} — ${STATE_TEXT[info.state]}${
        info.expected !== undefined ? ` (pace: ${Math.round(info.expected * 10) / 10} by today)` : ""
      }`}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {deadlineLabel(info, unit)}
        {behind}
      </span>
    </span>
  )
}

/** Progress bar toward a goal total (empty when the task has no goal). */
export function GoalBar({ info }: { info: DeadlineInfo }) {
  if (info.progress === undefined || !info.goalTotal) return null
  const pct = Math.min(100, (info.progress / info.goalTotal) * 100)
  const pace = info.expected !== undefined ? Math.min(100, (info.expected / info.goalTotal) * 100) : undefined
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        className={`h-full rounded-full ${info.state === "behind" || info.state === "overdue" ? "bg-amber-500" : "bg-lime-500"}`}
        style={{ width: `${pct}%` }}
      />
      {pace !== undefined && (
        <div className="absolute top-0 h-full w-0.5 bg-foreground/50" style={{ left: `${pace}%` }} />
      )}
    </div>
  )
}
