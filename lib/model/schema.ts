import { z } from "zod"
import {
  APP_TABS,
  DEFAULT_HIDDEN_TABS,
  QUADRANTS,
  normalizeLoggerSections,
  type LoggerSection,
  DEFAULT_RANGE_DAYS,
  DEFAULT_SIDE_SPACE,
  ENTRY_STATUSES,
  MAX_RANGE_DAYS,
  MIN_RANGE_DAYS,
  SCHEMA_VERSION,
} from "./types"
import type { AppData, BacklogItem, DayPlan, Entry, Settings, Task, TimeLog, Todo, WorkNote } from "./types"

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")

const scheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("weekdays") }),
  z.object({ type: z.literal("custom"), days: z.array(z.number().int().min(0).max(6)) }),
  z.object({ type: z.literal("once"), date: dateKey }),
])

export const taskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  startDate: dateKey,
  endDate: dateKey.optional(),
  deadline: dateKey.optional(),
  goalTotal: z.number().positive().optional(),
  schedule: scheduleSchema,
  target: z.number().positive().optional(),
  unit: z.string().optional(),
  status: z.enum(["active", "paused", "archived"]),
  pausePeriods: z.array(z.object({ from: dateKey, to: dateKey.optional() })),
  showOnDashboard: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<Task>

export const entrySchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  date: dateKey,
  status: z.enum(ENTRY_STATUSES),
  value: z.number().optional(),
  minutes: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<Entry>

export const backlogSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  done: z.boolean(),
  createdAt: z.string(),
}) satisfies z.ZodType<BacklogItem>

export const dayPlanSchema = z.object({
  date: dateKey,
  focus: z.array(z.string()),
  planned: z.record(z.string(), z.number().nonnegative()),
  availableMinutes: z.number().nonnegative().optional(),
  reflection: z.string().optional(),
  shutdownAt: z.string().optional(),
  dayStartAt: z.string().optional(),
  dayEndAt: z.string().optional(),
  updatedAt: z.string(),
}) satisfies z.ZodType<DayPlan>

export const timeLogSchema = z
  .object({
    id: z.string().min(1),
    taskId: z.string().min(1),
    start: z.string(),
    end: z.string(),
    source: z.enum(["focus", "manual"]),
    createdAt: z.string(),
  })
  .refine((l) => Date.parse(l.end) > Date.parse(l.start), "time log ends before it starts") satisfies z.ZodType<TimeLog>

export const workNoteSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  at: z.string(),
  text: z.string().min(1),
  createdAt: z.string(),
}) satisfies z.ZodType<WorkNote>

export const todoSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  quadrant: z.enum(QUADRANTS),
  done: z.boolean(),
  createdAt: z.string(),
}) satisfies z.ZodType<Todo>

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM")

// Fields added after v2 shipped have defaults, so older settings and backups (which had
// `monthsPerPage`, now ignored) still load without losing column widths.
export const settingsSchema = z.object({
  columnWidths: z.record(z.string(), z.number()),
  rangeDays: z
    .number()
    .int()
    .min(MIN_RANGE_DAYS)
    .max(MAX_RANGE_DAYS)
    .catch(DEFAULT_RANGE_DAYS)
    .default(DEFAULT_RANGE_DAYS),
  rowOrder: z.enum(["oldest", "newest"]).catch("oldest").default("oldest"),
  dayStart: clockTime.catch("07:00").default("07:00"),
  dayEnd: clockTime.catch("23:00").default("23:00"),
  showFullDay: z.boolean().catch(false).default(false),
  sideSpace: z.number().min(0).max(100).catch(DEFAULT_SIDE_SPACE).default(DEFAULT_SIDE_SPACE),
  // Never hide every tab: an invalid or all-hidden list falls back to showing all.
  hiddenTabs: z
    .array(z.enum(APP_TABS))
    .refine((t) => new Set(t).size < APP_TABS.length)
    .catch([])
    .default(() => [...DEFAULT_HIDDEN_TABS]),
  loggerSections: z
    .array(z.object({ id: z.string(), visible: z.boolean() }))
    .catch([])
    .default([])
    .transform((s) => normalizeLoggerSections(s as LoggerSection[])),
}) satisfies z.ZodType<Settings>

export const appDataSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    tasks: z.array(taskSchema),
    entries: z.array(entrySchema),
    backlog: z.array(backlogSchema),
    dayPlans: z.array(dayPlanSchema),
    timeLogs: z.array(timeLogSchema),
    workNotes: z.array(workNoteSchema),
    notepad: z.string(),
    todos: z.array(todoSchema),
    settings: settingsSchema,
  })
  .superRefine((data, ctx) => {
    const taskIds = new Set(data.tasks.map((t) => t.id))
    if (taskIds.size !== data.tasks.length) {
      ctx.addIssue({ code: "custom", message: "duplicate task ids" })
    }
    const seen = new Set<string>()
    for (const e of data.entries) {
      if (!taskIds.has(e.taskId)) {
        ctx.addIssue({ code: "custom", message: `entry ${e.id} refers to unknown task ${e.taskId}` })
        return
      }
      const key = `${e.taskId}:${e.date}`
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: `duplicate entry for ${key}` })
        return
      }
      seen.add(key)
    }
  }) satisfies z.ZodType<AppData>

/** Human-readable summary of the first few validation problems. */
export function describeIssues(error: z.ZodError, max = 3): string {
  return error.issues
    .slice(0, max)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ")
}
