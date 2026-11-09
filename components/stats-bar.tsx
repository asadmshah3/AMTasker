import { Flame, CalendarCheck, CalendarRange } from "lucide-react"
import type { Stats } from "@/lib/domain/stats"

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-card px-2.5 py-2 sm:px-3 sm:py-2.5">
      <div className={`hidden h-9 w-9 shrink-0 sm:flex items-center justify-center rounded-md ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-mono text-lg font-semibold leading-none tabular-nums text-foreground">{value}</span>
          {sub ? <span className="truncate text-xs text-muted-foreground">{sub}</span> : null}
        </div>
        <div className="mt-1 truncate text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">
          {label}
        </div>
      </div>
    </div>
  )
}

export function StatsBar({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <StatCard
        icon={<CalendarCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />}
        accent="bg-emerald-500/10"
        label="Today"
        value={`${stats.todayPct}%`}
        sub={`${stats.todayDone}/${stats.todayTotal} done`}
      />
      <StatCard
        icon={<Flame className="h-4 w-4 text-orange-500" aria-hidden="true" />}
        accent="bg-orange-500/10"
        label="Current streak"
        value={`${stats.streak}`}
        sub={stats.streak === 1 ? "day" : "days"}
      />
      <StatCard
        icon={<CalendarRange className="h-4 w-4 text-sky-500" aria-hidden="true" />}
        accent="bg-sky-500/10"
        label="Last 7 days"
        value={`${stats.weekPct}%`}
        sub="completion"
      />
    </div>
  )
}
