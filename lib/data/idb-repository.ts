import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import {
  SCHEMA_VERSION,
  defaultSettings,
  type AppData,
  type BacklogItem,
  type DayPlan,
  type Entry,
  type Settings,
  type Task,
  type TimeLog,
  type Todo,
  type WorkNote,
} from "../model/types"
import {
  backlogSchema,
  dayPlanSchema,
  entrySchema,
  settingsSchema,
  taskSchema,
  timeLogSchema,
  todoSchema,
  workNoteSchema,
} from "../model/schema"
import type { DataRepository, LoadResult } from "./repository"

const DB_VERSION = 1

type MetaRecord =
  | { key: "settings"; value: Settings }
  | { key: "schemaVersion"; value: number }
  | { key: "notepad"; value: string }
  | { key: "todos"; value: Todo[] }

interface AppDB extends DBSchema {
  tasks: { key: string; value: Task }
  entries: { key: string; value: Entry; indexes: { byTask: string; byDate: string } }
  backlog: { key: string; value: BacklogItem }
  dayPlans: { key: string; value: DayPlan }
  timeLogs: { key: string; value: TimeLog }
  workNotes: { key: string; value: WorkNote }
  meta: { key: string; value: MetaRecord }
}

const STORES = ["tasks", "entries", "backlog", "dayPlans", "timeLogs", "workNotes", "meta"] as const

export class IdbRepository implements DataRepository {
  private db: Promise<IDBPDatabase<AppDB>>

  /** `dbName`: one database per profile (see lib/profiles.ts). */
  constructor(dbName: string) {
    this.db = openDB<AppDB>(dbName, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Add later stores with `if (oldVersion < N)` blocks when DB_VERSION is raised.
        if (oldVersion < 1) {
          db.createObjectStore("tasks", { keyPath: "id" })
          const entries = db.createObjectStore("entries", { keyPath: "id" })
          entries.createIndex("byTask", "taskId")
          entries.createIndex("byDate", "date")
          db.createObjectStore("backlog", { keyPath: "id" })
          db.createObjectStore("dayPlans", { keyPath: "date" })
          db.createObjectStore("timeLogs", { keyPath: "id" })
          db.createObjectStore("workNotes", { keyPath: "id" })
          db.createObjectStore("meta", { keyPath: "key" })
        }
      },
    })
  }

  async load(): Promise<LoadResult> {
    const db = await this.db
    const tx = db.transaction(STORES, "readonly")
    const [rawTasks, rawEntries, rawBacklog, rawPlans, rawLogs, rawNotes, version, rawSettings, rawNotepad, rawTodos] =
      await Promise.all([
        tx.objectStore("tasks").getAll(),
        tx.objectStore("entries").getAll(),
        tx.objectStore("backlog").getAll(),
        tx.objectStore("dayPlans").getAll(),
        tx.objectStore("timeLogs").getAll(),
        tx.objectStore("workNotes").getAll(),
        tx.objectStore("meta").get("schemaVersion"),
        tx.objectStore("meta").get("settings"),
        tx.objectStore("meta").get("notepad"),
        tx.objectStore("meta").get("todos"),
      ])
    await tx.done

    if (!version) return { data: null, invalidRecords: 0 }
    if (version.value !== SCHEMA_VERSION) {
      throw new Error(`Stored data has schema version ${version.value}; this app expects ${SCHEMA_VERSION}.`)
    }

    let invalidRecords = 0
    function valid<T>(
      schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
      rows: unknown[],
    ): T[] {
      const out: T[] = []
      for (const row of rows) {
        const r = schema.safeParse(row)
        if (r.success) out.push(r.data)
        else invalidRecords++
      }
      return out
    }

    const tasks = valid<Task>(taskSchema, rawTasks)
    const taskIds = new Set(tasks.map((t) => t.id))
    const entries = valid<Entry>(entrySchema, rawEntries).filter((e) => taskIds.has(e.taskId))
    const settings = settingsSchema.safeParse(rawSettings?.value)

    return {
      data: {
        schemaVersion: SCHEMA_VERSION,
        tasks,
        entries,
        backlog: valid<BacklogItem>(backlogSchema, rawBacklog),
        dayPlans: valid<DayPlan>(dayPlanSchema, rawPlans),
        timeLogs: valid<TimeLog>(timeLogSchema, rawLogs).filter((l) => taskIds.has(l.taskId)),
        workNotes: valid<WorkNote>(workNoteSchema, rawNotes).filter((n) => taskIds.has(n.taskId)),
        notepad: typeof rawNotepad?.value === "string" ? rawNotepad.value : "",
        todos: valid<Todo>(todoSchema, Array.isArray(rawTodos?.value) ? rawTodos.value : []),
        settings: settings.success ? settings.data : defaultSettings(),
      },
      invalidRecords,
    }
  }

  async putTask(task: Task): Promise<void> {
    await (await this.db).put("tasks", task)
  }

  async deleteTask(taskId: string): Promise<void> {
    const db = await this.db
    const tx = db.transaction(["tasks", "entries", "timeLogs", "workNotes"], "readwrite")
    const entryKeys = await tx.objectStore("entries").index("byTask").getAllKeys(taskId)
    const logs = await tx.objectStore("timeLogs").getAll()
    const notes = await tx.objectStore("workNotes").getAll()
    await Promise.all([
      tx.objectStore("tasks").delete(taskId),
      ...entryKeys.map((k) => tx.objectStore("entries").delete(k)),
      ...logs.filter((l) => l.taskId === taskId).map((l) => tx.objectStore("timeLogs").delete(l.id)),
      ...notes.filter((n) => n.taskId === taskId).map((n) => tx.objectStore("workNotes").delete(n.id)),
    ])
    await tx.done
  }

  async putEntries(entries: Entry[]): Promise<void> {
    const tx = (await this.db).transaction("entries", "readwrite")
    await Promise.all(entries.map((e) => tx.store.put(e)))
    await tx.done
  }

  async deleteEntries(entryIds: string[]): Promise<void> {
    const tx = (await this.db).transaction("entries", "readwrite")
    await Promise.all(entryIds.map((id) => tx.store.delete(id)))
    await tx.done
  }

  async putBacklog(item: BacklogItem): Promise<void> {
    await (await this.db).put("backlog", item)
  }

  async deleteBacklog(id: string): Promise<void> {
    await (await this.db).delete("backlog", id)
  }

  async putDayPlan(plan: DayPlan): Promise<void> {
    await (await this.db).put("dayPlans", plan)
  }

  async putTimeLog(log: TimeLog): Promise<void> {
    await (await this.db).put("timeLogs", log)
  }

  async deleteTimeLog(id: string): Promise<void> {
    await (await this.db).delete("timeLogs", id)
  }

  async putWorkNote(note: WorkNote): Promise<void> {
    await (await this.db).put("workNotes", note)
  }

  async deleteWorkNote(id: string): Promise<void> {
    await (await this.db).delete("workNotes", id)
  }

  async putNotepad(text: string): Promise<void> {
    await (await this.db).put("meta", { key: "notepad", value: text })
  }

  async putTodos(todos: Todo[]): Promise<void> {
    await (await this.db).put("meta", { key: "todos", value: todos })
  }

  async putSettings(settings: Settings): Promise<void> {
    await (await this.db).put("meta", { key: "settings", value: settings })
  }

  async replaceAll(data: AppData): Promise<void> {
    const db = await this.db
    const tx = db.transaction(STORES, "readwrite")
    await Promise.all(STORES.map((s) => tx.objectStore(s).clear()))
    await Promise.all([
      ...data.tasks.map((t) => tx.objectStore("tasks").put(t)),
      ...data.entries.map((e) => tx.objectStore("entries").put(e)),
      ...data.backlog.map((b) => tx.objectStore("backlog").put(b)),
      ...data.dayPlans.map((p) => tx.objectStore("dayPlans").put(p)),
      ...data.timeLogs.map((l) => tx.objectStore("timeLogs").put(l)),
      ...data.workNotes.map((n) => tx.objectStore("workNotes").put(n)),
      tx.objectStore("meta").put({ key: "settings", value: data.settings }),
      tx.objectStore("meta").put({ key: "notepad", value: data.notepad }),
      tx.objectStore("meta").put({ key: "todos", value: data.todos }),
      tx.objectStore("meta").put({ key: "schemaVersion", value: SCHEMA_VERSION }),
    ])
    await tx.done
  }
}
