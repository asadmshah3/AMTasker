import type { AppData, BacklogItem, DayPlan, Entry, Settings, Task, TimeLog, Todo, WorkNote } from "../model/types"

export interface LoadResult {
  /** null when nothing has been stored yet. */
  data: AppData | null
  /** Stored records that failed validation and were left out (they are not deleted). */
  invalidRecords: number
}

/**
 * Persistence boundary. The UI only talks to this interface, so the IndexedDB
 * implementation can later be swapped for (or synced with) a backend.
 */
export interface DataRepository {
  load(): Promise<LoadResult>
  putTask(task: Task): Promise<void>
  /** Deletes the task and all of its entries. */
  deleteTask(taskId: string): Promise<void>
  putEntries(entries: Entry[]): Promise<void>
  deleteEntries(entryIds: string[]): Promise<void>
  putBacklog(item: BacklogItem): Promise<void>
  deleteBacklog(id: string): Promise<void>
  putDayPlan(plan: DayPlan): Promise<void>
  putTimeLog(log: TimeLog): Promise<void>
  deleteTimeLog(id: string): Promise<void>
  putWorkNote(note: WorkNote): Promise<void>
  deleteWorkNote(id: string): Promise<void>
  putNotepad(text: string): Promise<void>
  putTodos(todos: Todo[]): Promise<void>
  putSettings(settings: Settings): Promise<void>
  /** Atomically replaces everything (used by import, migration and seeding). */
  replaceAll(data: AppData): Promise<void>
}
