"use client"

import { useCallback, useMemo, useState, useSyncExternalStore } from "react"
import {
  Archive,
  ArrowDownUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  NotebookText,
  ListChecks,
  Settings2,
  Sun,
  Table2,
  TriangleAlert,
  X,
} from "lucide-react"
import { useAppData, type EntryChange } from "@/lib/use-app-data"
import { useToday } from "@/lib/use-today"
import { formatRangeLabel, lastRangePage, rangePageDateKeys, toDateKey } from "@/lib/date-utils"
import { APP_TABS, MAX_RANGE_DAYS, MIN_RANGE_DAYS, entryId, type AppTab } from "@/lib/model/types"
import { computeStats } from "@/lib/domain/stats"
import { countUnresolved, findUnresolved } from "@/lib/domain/unresolved"
import { deadlineInfo, type DeadlineInfo } from "@/lib/domain/planning"
import { StatsBar } from "./stats-bar"
import { ProgressTable } from "./progress-table"
import { BacklogNotes } from "./backlog-notes"
import { TaskManager } from "./task-manager"
import { MissingReview } from "./missing-review"
import { ThemeToggle } from "./theme-toggle"
import { STATUS_META, STATUS_ORDER } from "./status"
import { TodayView } from "./today-view"
import { ReviewView } from "./review-view"
import { FocusBar, useFocus } from "./focus-bar"
import { TimeSheetView } from "./timesheet-view"
import { StatusBar } from "./status-bar"
import { ActivityBanner } from "./activity-banner"
import { useNow } from "@/lib/use-now"
import { PAGE_WIDTH_CLASS, pageWidthStyle } from "@/lib/page-width"
import { profileKey } from "@/lib/profiles"
import { ProfileMenu } from "./profiles"
import { LoggerStats, LoggerView, computeTotals } from "./logger-view"
import { useCountdown } from "@/lib/use-countdown"
import type { ManagerTab } from "./task-manager"
import { currentActivity, currentDetail, taskColors } from "@/lib/domain/timesheet"

/** Quick choices in the toolbar; any other length can be set in Manage → View. */
const RANGE_PRESETS = [7, 14, 30, 60, 90, 180, 365]

type Tab = AppTab
const TABS: { id: Tab; label: string; icon: typeof Sun }[] = [
  { id: "logger", label: "Logger", icon: NotebookText },
  { id: "today", label: "Today", icon: Sun },
  { id: "tracker", label: "Tracker", icon: Table2 },
  { id: "review", label: "Review", icon: BarChart3 },
  { id: "timesheet", label: "TimeSheet", icon: Clock3 },
]
const tabKey = () => profileKey("amtasker:tab")
const TAB_EVENT = "amtasker:tab-change"

// The last-used tab is a per-browser convenience, kept in localStorage.
function subscribeTab(onChange: () => void): () => void {
  window.addEventListener(TAB_EVENT, onChange)
  return () => window.removeEventListener(TAB_EVENT, onChange)
}
function readTab(): Tab {
  try {
    const t = localStorage.getItem(tabKey())
    return APP_TABS.find((id) => id === t) ?? "logger"
  } catch {
    return "logger"
  }
}
function writeTab(tab: Tab): void {
  try {
    localStorage.setItem(tabKey(), tab)
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(TAB_EVENT))
}

export function AppShell() {
  const store = useAppData()
  const { status, tasks, entryIndex, settings, dayPlans } = store
  const storedTab = useSyncExternalStore(subscribeTab, readTab, () => "logger" as Tab)
  // Tabs can be hidden in Manage → View; if the last-used one is hidden, show the first visible tab.
  const visibleTabs = TABS.filter((t) => !settings.hiddenTabs.includes(t.id))
  const shownTabs = visibleTabs.length ? visibleTabs : TABS
  const tab: Tab = shownTabs.some((t) => t.id === storedTab) ? storedTab : shownTabs[0].id
  const today = useToday()
  const ready = status === "ready" && today !== ""

  const [managerOpen, setManagerOpen] = useState(false)
  const [managerTab, setManagerTab] = useState<ManagerTab>("tasks")
  const [page, setPage] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  // null = not decided yet; the review opens automatically once per session.
  const [reviewOpen, setReviewOpen] = useState<boolean | null>(null)

  const { rangeDays, rowOrder } = settings

  const { applyEntries, addBacklog } = store
  const onEntry = useCallback((change: EntryChange) => applyEntries([change]), [applyEntries])
  const focus = useFocus(tasks, store.addTimeLog)
  // The focus timer already re-renders every second while a session runs; otherwise a 15 s tick is enough.
  const tickMs = useNow(15_000)
  const nowMs = focus.session ? Math.max(tickMs, focus.session.startedAt + focus.elapsedMs) : tickMs
  const colors = useMemo(() => taskColors(tasks), [tasks])
  // The Logger's countdown is watched here so its alarm goes off whichever tab is open.
  const countdown = useCountdown()
  // The task of the most recently ended block: what you were doing last.
  const lastTaskId = useMemo(() => {
    let last: { end: string; taskId: string } | undefined
    for (const l of store.data.timeLogs) if (!last || l.end > last.end) last = l
    return last?.taskId
  }, [store.data.timeLogs])

  // Details per cell (task + date), for the Tracker's cell tooltips.
  const notesByCell = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const n of [...store.data.workNotes].sort((a, b) => (a.at < b.at ? -1 : 1))) {
      const key = entryId(n.taskId, toDateKey(new Date(n.at)))
      map.set(key, [...(map.get(key) ?? []), n.text])
    }
    return map
  }, [store.data.workNotes])
  const activity = useMemo(
    () => currentActivity(nowMs, focus.session, store.data.timeLogs, dayPlans.get(today), settings),
    [nowMs, focus.session, store.data.timeLogs, dayPlans, today, settings],
  )

  const deadlines = useMemo(() => {
    const map = new Map<string, DeadlineInfo>()
    if (!today) return map
    for (const t of tasks) {
      const info = deadlineInfo(t, store.data.entries, today)
      if (info) map.set(t.id, info)
    }
    return map
  }, [tasks, store.data.entries, today])

  const lastAvailable = useMemo(() => {
    let best: { date: string; minutes: number } | undefined
    for (const p of dayPlans.values()) {
      if (p.availableMinutes !== undefined && p.date <= today && (!best || p.date > best.date)) {
        best = { date: p.date, minutes: p.availableMinutes }
      }
    }
    return best?.minutes
  }, [dayPlans, today])

  const unresolved = useMemo(
    () => (ready ? findUnresolved(tasks, entryIndex, today) : []),
    [ready, tasks, entryIndex, today],
  )
  const unresolvedCount = countUnresolved(unresolved)
  const showReview = reviewOpen ?? (ready && unresolvedCount > 0)

  const stats = useMemo(() => computeStats(tasks, entryIndex, today || "0000-00-00"), [tasks, entryIndex, today])

  const tableTasks = useMemo(
    () => tasks.filter((t) => t.showOnDashboard && (showArchived || t.status !== "archived")),
    [tasks, showArchived],
  )
  const archivedCount = tasks.filter((t) => t.status === "archived").length

  const earliestKey = useMemo(() => {
    let min = today
    for (const t of tasks) if (t.startDate < min) min = t.startDate
    for (const k of entryIndex.values()) if (k.date < min) min = k.date
    return min
  }, [entryIndex, tasks, today])

  const maxPage = ready ? lastRangePage(rangeDays, earliestKey, today) : 0
  const currentPage = Math.min(page, maxPage)
  // Oldest first; the table reverses it for "newest first".
  const dateKeys = useMemo(
    () => (ready ? rangePageDateKeys(rangeDays, currentPage, today) : []),
    [ready, rangeDays, currentPage, today],
  )
  const rangeLabel = dateKeys.length ? formatRangeLabel(dateKeys[0], dateKeys[dateKeys.length - 1]) : ""

  function changeRange(days: number) {
    store.setRangeDays(days)
    setPage(0)
  }

  function statusBar(variant: "bar" | "card") {
    return (
      <StatusBar
        variant={variant}
        sideSpace={settings.sideSpace}
        activity={activity}
        nowMs={nowMs}
        tasks={tasks}
        colors={colors}
        onStart={(taskId) => focus.start(taskId, today)}
        onStop={() => focus.stop(true)}
        onDiscard={() => focus.stop(false)}
        onStopAt={focus.stopAt}
        onStartDay={() => store.updateDayPlan(today, { dayStartAt: new Date().toISOString() })}
        detail={currentDetail(store.data.workNotes, focus.session)}
        onAddDetail={(text) => focus.session && store.addWorkNote(focus.session.taskId, text)}
        lastTaskId={lastTaskId}
        onLogFree={({ taskId, startMs, endMs, detail, keepGoing }) => {
          if (keepGoing) focus.start(taskId, toDateKey(new Date(startMs)), startMs)
          else {
            const end = Math.min(endMs ?? Date.now(), Date.now())
            store.addTimeLog(
              { taskId, start: new Date(startMs).toISOString(), end: new Date(end).toISOString(), source: "manual" },
              true,
            )
          }
          if (detail.trim()) store.addWorkNote(taskId, detail, new Date(startMs))
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <div
        className={`flex flex-col gap-3 py-3 sm:py-4 ${PAGE_WIDTH_CLASS}`}
        style={pageWidthStyle(settings.sideSpace)}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-mono text-base font-semibold leading-tight text-foreground">AMTasker</h1>
              <p className="text-xs text-muted-foreground">Daily task and time logger</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unresolvedCount > 0 && (
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/60 bg-amber-500/10 px-2.5 text-sm text-foreground transition-colors hover:bg-amber-500/20"
              >
                <Inbox className="h-4 w-4" aria-hidden="true" />
                <span className="font-mono tabular-nums">{unresolvedCount}</span>
                <span className="hidden sm:inline">to review</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setManagerOpen(true)}
              disabled={!ready}
              aria-label="Manage"
              title="Manage tasks, data, view and profiles"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Manage</span>
            </button>
            <ProfileMenu
              onManage={() => {
                setManagerTab("profiles")
                setManagerOpen(true)
              }}
            />
            <ThemeToggle />
          </div>
        </header>

        {store.notice && (
          <div
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              status === "error" ? "border-destructive/50 bg-destructive/10" : "border-amber-500/50 bg-amber-500/10"
            }`}
            role="alert"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-foreground">{store.notice}</p>
            {status !== "error" && (
              <button
                type="button"
                onClick={store.dismissNotice}
                aria-label="Dismiss"
                className="rounded p-0.5 hover:bg-accent"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {tab === "logger" ? (
          settings.loggerSections.some((s) => s.id === "hours" && s.visible) && (
            <LoggerStats totals={computeTotals(store.data.timeLogs, today || "0000-00-00", focus.session, nowMs)} />
          )
        ) : (
          <StatsBar stats={stats} />
        )}

        <nav className="flex gap-1 rounded-md border border-border bg-card p-1" aria-label="Views">
          {shownTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => writeTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded px-3 text-sm transition-colors sm:flex-none ${
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        {ready && (
          <ActivityBanner
            activity={activity}
            nowMs={nowMs}
            taskName={activity.kind === "working" ? tasks.find((t) => t.id === activity.taskId)?.name : undefined}
          />
        )}

        {ready && focus.session && (
          <FocusBar
            session={focus.session}
            elapsedMs={focus.elapsedMs}
            task={tasks.find((t) => t.id === focus.session!.taskId)}
            onStop={focus.stop}
            onStopAt={focus.stopAt}
            onCapture={addBacklog}
          />
        )}

        {ready && tab === "today" && (
          <TodayView
            today={today}
            tasks={tasks}
            entries={entryIndex}
            plan={dayPlans.get(today)}
            lastAvailable={lastAvailable}
            deadlines={deadlines}
            session={focus.session}
            onEntry={onEntry}
            onPlan={(patch) => store.updateDayPlan(today, patch)}
            onStartFocus={(taskId) => focus.start(taskId, today)}
            onStopFocus={() => focus.stop(true)}
          />
        )}

        {ready && tab === "timesheet" && (
          <TimeSheetView
            today={today}
            nowMs={nowMs}
            tasks={tasks}
            colors={colors}
            entries={entryIndex}
            plans={dayPlans}
            logs={store.data.timeLogs}
            settings={settings}
            rowOrder={rowOrder}
            onPlan={store.updateDayPlan}
            onAddLog={store.addTimeLog}
            onDeleteLog={store.deleteTimeLog}
            onUpdateLog={store.updateTimeLog}
            onShowFullDay={(showFullDay) => store.setDaySettings({ showFullDay })}
            notes={store.data.workNotes}
            running={focus.session}
            onAddNote={store.addWorkNote}
            onUpdateNote={store.updateWorkNote}
            onDeleteNote={store.deleteWorkNote}
          />
        )}

        {ready && tab === "logger" && (
          <LoggerView
            today={today}
            nowMs={nowMs}
            tasks={tasks}
            colors={colors}
            logs={store.data.timeLogs}
            notes={store.data.workNotes}
            plans={dayPlans}
            settings={settings}
            running={focus.session}
            notepad={store.data.notepad}
            onNotepad={store.setNotepad}
            todos={store.data.todos}
            onAddTodo={store.addTodo}
            onUpdateTodo={store.updateTodo}
            onDeleteTodo={store.deleteTodo}
            onClearDone={store.clearDoneTodos}
            countdown={countdown}
            statusCard={statusBar("card")}
            sections={settings.loggerSections}
            onCustomize={() => {
              setManagerTab("view")
              setManagerOpen(true)
            }}
          />
        )}

        {ready && tab === "review" && (
          <ReviewView today={today} tasks={tasks} entries={entryIndex} plans={dayPlans} deadlines={deadlines} />
        )}

        {tab === "tracker" && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1.5">
              <div className="flex items-center gap-1">
                <label className="sr-only" htmlFor="range-days">
                  Days shown
                </label>
                <select
                  id="range-days"
                  value={rangeDays}
                  onChange={(e) => changeRange(Number(e.target.value))}
                  disabled={!ready}
                  className="h-7 rounded-md border border-border bg-card px-1.5 text-sm text-foreground hover:bg-accent"
                >
                  {(RANGE_PRESETS.includes(rangeDays)
                    ? RANGE_PRESETS
                    : [...RANGE_PRESETS, rangeDays].sort((a, b) => a - b)
                  ).map((d) => (
                    <option key={d} value={d}>
                      Last {d} {d === 1 ? "day" : "days"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(maxPage, currentPage + 1))}
                  disabled={currentPage >= maxPage}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Previous ${rangeDays} days`}
                  title={`Previous ${rangeDays} days`}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-36 text-center font-mono text-xs font-medium text-foreground sm:text-sm">
                  {rangeLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage <= 0}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Next ${rangeDays} days`}
                  title={`Next ${rangeDays} days`}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => store.setRowOrder(rowOrder === "oldest" ? "newest" : "oldest")}
                  disabled={!ready}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Switch row order"
                >
                  <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden md:inline">{rowOrder === "oldest" ? "Today at bottom" : "Today at top"}</span>
                </button>
                {currentPage > 0 && (
                  <button
                    type="button"
                    onClick={() => setPage(0)}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Today
                  </button>
                )}
              </div>
              <Legend />
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${
                  showArchived
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                Archived
                {archivedCount > 0 && (
                  <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                    {archivedCount}
                  </span>
                )}
              </button>
            </div>

            {ready ? (
              <ProgressTable
                tasks={tableTasks}
                dateKeys={dateKeys}
                rowOrder={rowOrder}
                today={today}
                entries={entryIndex}
                onChange={onEntry}
                deadlines={deadlines}
                workNotes={notesByCell}
                columnWidths={settings.columnWidths}
                onColumnWidthsChange={store.setColumnWidths}
                onResetColumnWidth={store.resetColumnWidth}
              />
            ) : status === "error" ? null : (
              <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
            )}

            <p className="text-center text-xs text-muted-foreground">
              Click a cell to cycle Completed → Partial → Not done → Skipped → empty; right-click (or Enter) opens its
              editor for values and notes. Or focus a cell and press 1–4 (0 clears). Drag a column edge to resize. Data
              is saved locally in your browser — back it up from Manage → Data.
            </p>
          </>
        )}

        {ready && (tab === "today" || tab === "tracker") && (
          <BacklogNotes
            items={store.backlog}
            onAdd={store.addBacklog}
            onToggle={store.toggleBacklog}
            onUpdate={store.updateBacklog}
            onDelete={store.deleteBacklog}
          />
        )}
      </div>

      {ready && (
        <>
          {statusBar("bar")}
          <MissingReview
            open={showReview}
            onClose={() => setReviewOpen(false)}
            days={unresolved}
            tasks={tasks}
            onResolve={store.applyEntries}
          />
          <TaskManager
            key={`${managerOpen}-${managerTab}`}
            initialTab={managerTab}
            open={managerOpen}
            onClose={() => {
              setManagerOpen(false)
              setManagerTab("tasks")
            }}
            today={today}
            data={store.data}
            tasks={tasks}
            onAdd={store.addTask}
            onUpdate={store.updateTask}
            onSetStatus={store.setTaskStatus}
            onDelete={store.deleteTask}
            onReplaceAll={store.replaceAll}
            rangeDays={rangeDays}
            onRangeDaysChange={changeRange}
            rowOrder={rowOrder}
            onRowOrderChange={store.setRowOrder}
            minDays={MIN_RANGE_DAYS}
            maxDays={MAX_RANGE_DAYS}
            dayStart={settings.dayStart}
            dayEnd={settings.dayEnd}
            onDayHoursChange={(dayStart, dayEnd) => store.setDaySettings({ dayStart, dayEnd })}
            sideSpace={settings.sideSpace}
            onSideSpaceChange={(sideSpace) => store.setDaySettings({ sideSpace })}
            loggerSections={settings.loggerSections}
            onLoggerSectionsChange={(loggerSections) => store.setDaySettings({ loggerSections })}
            hiddenTabs={settings.hiddenTabs}
            onHiddenTabsChange={(hiddenTabs) => store.setDaySettings({ hiddenTabs })}
          />
        </>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {STATUS_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span
            className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] ${STATUS_META[s].cell}`}
            aria-hidden="true"
          >
            {STATUS_META[s].symbol}
          </span>
          {STATUS_META[s].label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="h-3.5 w-3.5 rounded-sm border border-border bg-muted/30" aria-hidden="true" />
        No entry
      </span>
    </div>
  )
}
