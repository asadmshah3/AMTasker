/** Local calendar date, "YYYY-MM-DD". Compares correctly as a string. */
export type DateKey = string

export const SCHEMA_VERSION = 1

export const ENTRY_STATUSES = ["completed", "partial", "not_completed", "skipped"] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

/**
 * Which days a task is expected on (within its start/end dates).
 * - daily: every day
 * - weekdays: Monday–Friday
 * - custom: specific days of the week (0 = Sun … 6 = Sat)
 * - once: a single date
 */
export type TaskSchedule =
  { type: "daily" } | { type: "weekdays" } | { type: "custom"; days: number[] } | { type: "once"; date: DateKey }

export type TaskStatus = "active" | "paused" | "archived"

/**
 * A span during which no entries are expected (paused or archived).
 * `from` is inclusive; `to` is exclusive (the day the task resumed). Open-ended while `to` is unset.
 */
export interface PausePeriod {
  from: DateKey
  to?: DateKey
}

export interface Task {
  id: string
  name: string
  description?: string
  category?: string
  startDate: DateKey
  endDate?: DateKey
  /** Finish-by date for goals (a course, a book). Unlike endDate, it doesn't stop the task. */
  deadline?: DateKey
  /** Total amount to reach by the deadline, in the task's unit (e.g. 20 hours, 300 pages). */
  goalTotal?: number
  schedule: TaskSchedule
  target?: number
  unit?: string
  status: TaskStatus
  pausePeriods: PausePeriod[]
  showOnDashboard: boolean
  sortOrder: number
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
}

/** One task on one date. The absence of an Entry means "unresolved / no data". */
export interface Entry {
  id: string // always entryId(taskId, date)
  taskId: string
  date: DateKey
  status: EntryStatus
  value?: number
  /** Time spent, for tasks whose unit isn't minutes (for those, `value` is the time). */
  minutes?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

/** The plan and end-of-day review for one date. */
export interface DayPlan {
  date: DateKey
  /** Up to MAX_FOCUS task ids: the day's most important tasks. */
  focus: string[]
  /** Planned minutes per task id. */
  planned: Record<string, number>
  /** Minutes available for planned work that day. */
  availableMinutes?: number
  /** Shutdown note: what went well / what got in the way. */
  reflection?: string
  /** Set when the end-of-day shutdown was completed (ISO timestamp). */
  shutdownAt?: string
  /** When the day actually started (ISO timestamp); the usual start time is assumed when unset. */
  dayStartAt?: string
  /** When the day ended (ISO timestamp); falls back to shutdownAt, then the usual end time. */
  dayEndAt?: string
  updatedAt: string
}

/** A block of clock time spent on a task (from a focus session or added by hand). */
export interface TimeLog {
  id: string
  taskId: string
  /** ISO timestamps; `end` is after `start`. */
  start: string
  end: string
  source: "focus" | "manual"
  createdAt: string
}

/**
 * A line about what you're doing on a task at a moment ("learning CMake", "working on Conan").
 * It describes the work from `at` until the next detail for the task, or the end of that time block.
 */
export interface WorkNote {
  id: string
  taskId: string
  at: string // ISO timestamp
  text: string
  createdAt: string
}

export const MAX_FOCUS = 3

export interface BacklogItem {
  id: string
  text: string
  done: boolean
  createdAt: string // ISO timestamp
}

// columnWidths[columnId] = pixel width. "__date" is the reserved date column id.
export type ColumnWidths = Record<string, number>

/** "oldest" = spreadsheet order (oldest day at the top, today at the bottom). */
export type RowOrder = "oldest" | "newest"

export const MIN_RANGE_DAYS = 1
export const MAX_RANGE_DAYS = 366
export const DEFAULT_RANGE_DAYS = 30
export const DEFAULT_SIDE_SPACE = 50

export interface Settings {
  columnWidths: ColumnWidths
  /** How many days the dashboard shows at once. */
  rangeDays: number
  rowOrder: RowOrder
  /** Usual start and end of the day ("HH:MM"), used when a day isn't marked. */
  dayStart: string
  dayEnd: string
  /** TimeSheet: show all 24 hours (including the hours outside the day, e.g. sleep). */
  showFullDay: boolean
  /** Empty space beside the page, 0–100: 0 = full window width, 100 = page capped at 1280px. */
  sideSpace: number
  /** Tabs hidden from the tab bar (at least one stays visible). */
  hiddenTabs: AppTab[]
  /** Logger tab: which sections show, in this order. */
  loggerSections: LoggerSection[]
}

export const LOGGER_SECTIONS = ["hours", "lines", "notepad", "priorities", "countdown", "now"] as const
export type LoggerSectionId = (typeof LOGGER_SECTIONS)[number]
export interface LoggerSection {
  id: LoggerSectionId
  visible: boolean
}

/** Every known section exactly once: saved order first, then any new sections (shown) at the end. */
export function normalizeLoggerSections(saved: LoggerSection[] | undefined): LoggerSection[] {
  const seen = new Set<string>()
  const out: LoggerSection[] = []
  for (const s of saved ?? []) {
    if ((LOGGER_SECTIONS as readonly string[]).includes(s.id) && !seen.has(s.id)) {
      seen.add(s.id)
      out.push({ id: s.id, visible: s.visible !== false })
    }
  }
  for (const id of LOGGER_SECTIONS) if (!seen.has(id)) out.push({ id, visible: true })
  return out
}

export const APP_TABS = ["logger", "today", "tracker", "review", "timesheet"] as const
export type AppTab = (typeof APP_TABS)[number]
/** A new profile shows only Logger and Today; the others can be turned on in Manage → View. */
export const DEFAULT_HIDDEN_TABS: AppTab[] = ["tracker", "review", "timesheet"]

export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION
  tasks: Task[]
  entries: Entry[]
  backlog: BacklogItem[]
  dayPlans: DayPlan[]
  timeLogs: TimeLog[]
  workNotes: WorkNote[]
  /** Logger tab: free-form notepad text. */
  notepad: string
  /** Logger tab: priority-matrix to-dos. */
  todos: Todo[]
  settings: Settings
}

/** Eisenhower quadrants: do first (important+urgent), schedule, delegate, eliminate. */
export const QUADRANTS = ["do", "schedule", "delegate", "eliminate"] as const
export type Quadrant = (typeof QUADRANTS)[number]

export interface Todo {
  id: string
  text: string
  quadrant: Quadrant
  done: boolean
  createdAt: string
}

export function entryId(taskId: string, date: DateKey): string {
  return `${taskId}:${date}`
}

/** Fast lookup of entries by task and date. */
export type EntryIndex = Map<string, Entry>

export function indexEntries(entries: Entry[]): EntryIndex {
  const index: EntryIndex = new Map()
  for (const e of entries) index.set(entryId(e.taskId, e.date), e)
  return index
}

export function defaultSettings(): Settings {
  return {
    columnWidths: {},
    rangeDays: DEFAULT_RANGE_DAYS,
    rowOrder: "oldest",
    dayStart: "07:00",
    dayEnd: "23:00",
    showFullDay: false,
    sideSpace: DEFAULT_SIDE_SPACE,
    hiddenTabs: [...DEFAULT_HIDDEN_TABS],
    loggerSections: normalizeLoggerSections([]),
  }
}
