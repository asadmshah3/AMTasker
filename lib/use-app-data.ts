"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  MAX_RANGE_DAYS,
  MIN_RANGE_DAYS,
  SCHEMA_VERSION,
  defaultSettings,
  entryId,
  indexEntries,
  type AppData,
  type BacklogItem,
  type ColumnWidths,
  type DateKey,
  type DayPlan,
  type Entry,
  type EntryStatus,
  type RowOrder,
  type Task,
  type TaskStatus,
  type TimeLog,
  type Todo,
  type WorkNote,
} from "./model/types"
import type { DataRepository } from "./data/repository"
import { IdbRepository } from "./data/idb-repository"
import { seedData } from "./data/seed"
import { changeStatus, cleanDraft, createTask, type TaskDraft } from "./domain/tasks"
import { addTime, isMinuteUnit } from "./domain/planning"
import { todayKey } from "./date-utils"
import { DEFAULT_PROFILE_ID, activeProfileId, dbNameFor } from "./profiles"

export type LoadStatus = "loading" | "ready" | "error"

/**
 * A cell change: status plus optional value, or null to clear the entry (back to unresolved).
 * `minutes` and `notes` are kept as they are unless the change includes them.
 */
export type EntryChange =
  | {
      taskId: string
      date: DateKey
      status: EntryStatus
      value?: number
      minutes?: number
      notes?: string
    }
  | {
      taskId: string
      date: DateKey
      status: null
    }

interface InitResult {
  repo: DataRepository
  data: AppData
  notice: string | null
}

function emptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    entries: [],
    backlog: [],
    dayPlans: [],
    timeLogs: [],
    workNotes: [],
    notepad: "",
    todos: [],
    settings: defaultSettings(),
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Shared across mounts so StrictMode's double effects can't seed twice.
let initPromise: Promise<InitResult> | null = null

function initialize(): Promise<InitResult> {
  initPromise ??= (async () => {
    const profileId = activeProfileId()
    const repo = new IdbRepository(dbNameFor(profileId))
    const { data: stored, invalidRecords } = await repo.load()
    if (stored) {
      const notice =
        invalidRecords > 0
          ? `${invalidRecords} stored record(s) could not be read and are hidden. Export a backup before making big changes.`
          : null
      return { repo, data: stored, notice }
    }
    // The first profile starts with example tasks; profiles added later start empty.
    const data = profileId === DEFAULT_PROFILE_ID ? seedData(todayKey()) : emptyData()
    await repo.replaceAll(data)
    return { repo, data, notice: null }
  })()
  initPromise.catch(() => {
    initPromise = null
  })
  return initPromise
}

export function useAppData() {
  const [data, setData] = useState<AppData>(emptyData)
  const [status, setStatus] = useState<LoadStatus>("loading")
  const [notice, setNotice] = useState<string | null>(null)
  const dataRef = useRef(data)
  const repoRef = useRef<DataRepository | null>(null)

  /** Apply a new state synchronously so back-to-back actions see each other's changes. */
  const commit = useCallback((next: AppData) => {
    dataRef.current = next
    setData(next)
  }, [])

  const persist = useCallback((op: (repo: DataRepository) => Promise<void>) => {
    const repo = repoRef.current
    if (!repo) return
    op(repo).catch((err) =>
      setNotice(`Couldn't save your last change (${errorMessage(err)}). Export a backup to be safe.`),
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    initialize().then(
      (result) => {
        if (cancelled) return
        repoRef.current = result.repo
        commit(result.data)
        setNotice(result.notice)
        setStatus("ready")
      },
      (err) => {
        if (cancelled) return
        setNotice(`Couldn't open local storage: ${errorMessage(err)}`)
        setStatus("error")
      },
    )
    return () => {
      cancelled = true
    }
  }, [commit])

  // ---- Tasks -------------------------------------------------------------

  const updateTasks = useCallback(
    (tasks: Task[], changed: Task) => {
      commit({ ...dataRef.current, tasks })
      persist((repo) => repo.putTask(changed))
    },
    [commit, persist],
  )

  const addTask = useCallback(
    (draft: TaskDraft) => {
      if (!draft.name.trim()) return
      const tasks = dataRef.current.tasks
      const sortOrder = tasks.reduce((max, t) => Math.max(max, t.sortOrder), -1) + 1
      const task = createTask(draft, sortOrder)
      updateTasks([...tasks, task], task)
    },
    [updateTasks],
  )

  const updateTask = useCallback(
    (id: string, draft: TaskDraft) => {
      if (!draft.name.trim()) return
      const current = dataRef.current.tasks.find((t) => t.id === id)
      if (!current) return
      const task: Task = { ...current, ...cleanDraft(draft), updatedAt: new Date().toISOString() }
      updateTasks(
        dataRef.current.tasks.map((t) => (t.id === id ? task : t)),
        task,
      )
    },
    [updateTasks],
  )

  const setTaskStatus = useCallback(
    (id: string, next: TaskStatus) => {
      const current = dataRef.current.tasks.find((t) => t.id === id)
      if (!current) return
      const task = changeStatus(current, next, todayKey())
      updateTasks(
        dataRef.current.tasks.map((t) => (t.id === id ? task : t)),
        task,
      )
    },
    [updateTasks],
  )

  const deleteTask = useCallback(
    (id: string) => {
      const prev = dataRef.current
      const { [id]: _width, ...columnWidths } = prev.settings.columnWidths
      void _width
      const settings = { ...prev.settings, columnWidths }
      commit({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== id),
        entries: prev.entries.filter((e) => e.taskId !== id),
        settings,
      })
      persist(async (repo) => {
        await repo.deleteTask(id)
        await repo.putSettings(settings)
      })
    },
    [commit, persist],
  )

  // ---- Entries -----------------------------------------------------------

  const applyEntries = useCallback(
    (changes: EntryChange[]) => {
      if (changes.length === 0) return
      const prev = dataRef.current
      const index = indexEntries(prev.entries)
      const now = new Date().toISOString()
      const puts: Entry[] = []
      const deletes: string[] = []
      for (const c of changes) {
        const id = entryId(c.taskId, c.date)
        const existing = index.get(id)
        if (c.status === null) {
          if (existing) {
            index.delete(id)
            deletes.push(id)
          }
          continue
        }
        const entry: Entry = {
          ...existing,
          id,
          taskId: c.taskId,
          date: c.date,
          status: c.status,
          value: c.value,
          minutes: "minutes" in c ? c.minutes : existing?.minutes,
          notes: "notes" in c ? c.notes?.trim() || undefined : existing?.notes,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        if (entry.value === undefined) delete entry.value
        if (entry.minutes === undefined) delete entry.minutes
        if (entry.notes === undefined) delete entry.notes
        index.set(id, entry)
        puts.push(entry)
      }
      commit({ ...prev, entries: [...index.values()] })
      persist(async (repo) => {
        if (puts.length) await repo.putEntries(puts)
        if (deletes.length) await repo.deleteEntries(deletes)
      })
    },
    [commit, persist],
  )

  // ---- Day plans ---------------------------------------------------------

  const updateDayPlan = useCallback(
    (date: DateKey, patch: Partial<Omit<DayPlan, "date" | "updatedAt">>) => {
      const prev = dataRef.current
      const existing = prev.dayPlans.find((p) => p.date === date)
      const plan: DayPlan = {
        focus: [],
        planned: {},
        ...existing,
        ...patch,
        date,
        updatedAt: new Date().toISOString(),
      }
      if (plan.reflection !== undefined && !plan.reflection.trim()) delete plan.reflection
      commit({ ...prev, dayPlans: [...prev.dayPlans.filter((p) => p.date !== date), plan] })
      persist((repo) => repo.putDayPlan(plan))
    },
    [commit, persist],
  )

  // ---- Time logs ---------------------------------------------------------

  /**
   * Record a block of clock time on a task. With `addToEntry`, the minutes are also added to the
   * entry of the day the block starts on (the grid's time total), picking a status if none is set.
   */
  const addTimeLog = useCallback(
    (log: Pick<TimeLog, "taskId" | "start" | "end" | "source">, addToEntry: boolean) => {
      const minutes = Math.round((Date.parse(log.end) - Date.parse(log.start)) / 60_000)
      if (!(minutes > 0)) return
      const full: TimeLog = { ...log, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
      commit({ ...dataRef.current, timeLogs: [...dataRef.current.timeLogs, full] })
      persist((repo) => repo.putTimeLog(full))
      if (!addToEntry) return
      const task = dataRef.current.tasks.find((t) => t.id === log.taskId)
      if (!task) return
      const date = todayKey(new Date(log.start))
      const entry = dataRef.current.entries.find((e) => e.taskId === task.id && e.date === date)
      applyEntries([{ taskId: task.id, date, ...addTime(task, entry, minutes) }])
    },
    [applyEntries, commit, persist],
  )

  /**
   * Delete a block; its minutes are taken back off that day's entry total (not below zero).
   * If that leaves the cell with no time and no note, the cell is cleared (back to unanswered).
   */
  const deleteTimeLog = useCallback(
    (id: string) => {
      const log = dataRef.current.timeLogs.find((l) => l.id === id)
      if (!log) return
      commit({ ...dataRef.current, timeLogs: dataRef.current.timeLogs.filter((l) => l.id !== id) })
      persist((repo) => repo.deleteTimeLog(id))
      const task = dataRef.current.tasks.find((t) => t.id === log.taskId)
      const date = todayKey(new Date(log.start))
      const entry = dataRef.current.entries.find((e) => e.taskId === log.taskId && e.date === date)
      if (!task || !entry) return
      const minutes = Math.round((Date.parse(log.end) - Date.parse(log.start)) / 60_000)
      const change = addTime(task, entry, -minutes)
      const remaining = Math.max(0, (isMinuteUnit(task.unit) ? change.value : change.minutes) ?? 0)
      if (remaining === 0 && !entry.notes) {
        applyEntries([{ taskId: task.id, date, status: null }])
        return
      }
      applyEntries([
        {
          taskId: task.id,
          date,
          status: change.status,
          value: change.value !== undefined ? Math.max(0, change.value) : undefined,
          minutes: change.minutes !== undefined ? Math.max(0, change.minutes) || undefined : undefined,
        },
      ])
    },
    [applyEntries, commit, persist],
  )

  /**
   * Change a block's start/end. The cell of the day the block started on is adjusted by the
   * difference (e.g. 3h 40m → 1h 15m takes 2h 25m off), never below zero; its status is kept.
   */
  const updateTimeLog = useCallback(
    (id: string, start: string, end: string) => {
      const log = dataRef.current.timeLogs.find((l) => l.id === id)
      if (!log || !(Date.parse(end) > Date.parse(start))) return
      const updated: TimeLog = { ...log, start, end }
      commit({ ...dataRef.current, timeLogs: dataRef.current.timeLogs.map((l) => (l.id === id ? updated : l)) })
      persist((repo) => repo.putTimeLog(updated))
      const length = (l: TimeLog) => Math.round((Date.parse(l.end) - Date.parse(l.start)) / 60_000)
      const delta = length(updated) - length(log)
      const task = dataRef.current.tasks.find((t) => t.id === log.taskId)
      if (!task || delta === 0) return
      const date = todayKey(new Date(log.start))
      const entry = dataRef.current.entries.find((e) => e.taskId === log.taskId && e.date === date)
      if (!entry && delta < 0) return
      const change = addTime(task, entry, delta)
      applyEntries([
        {
          taskId: task.id,
          date,
          status: change.status,
          value: change.value !== undefined ? Math.max(0, change.value) : undefined,
          minutes: change.minutes !== undefined ? Math.max(0, change.minutes) || undefined : undefined,
        },
      ])
    },
    [applyEntries, commit, persist],
  )

  // ---- Work notes (what you're doing on a task) ----------------------------

  const addWorkNote = useCallback(
    (taskId: string, text: string, at: Date = new Date()) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const note: WorkNote = {
        id: crypto.randomUUID(),
        taskId,
        at: at.toISOString(),
        text: trimmed,
        createdAt: new Date().toISOString(),
      }
      commit({ ...dataRef.current, workNotes: [...dataRef.current.workNotes, note] })
      persist((repo) => repo.putWorkNote(note))
    },
    [commit, persist],
  )

  const deleteWorkNote = useCallback(
    (id: string) => {
      commit({ ...dataRef.current, workNotes: dataRef.current.workNotes.filter((n) => n.id !== id) })
      persist((repo) => repo.deleteWorkNote(id))
    },
    [commit, persist],
  )

  const updateWorkNote = useCallback(
    (id: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return deleteWorkNote(id)
      const current = dataRef.current.workNotes.find((n) => n.id === id)
      if (!current || current.text === trimmed) return
      const note = { ...current, text: trimmed }
      commit({ ...dataRef.current, workNotes: dataRef.current.workNotes.map((n) => (n.id === id ? note : n)) })
      persist((repo) => repo.putWorkNote(note))
    },
    [commit, persist, deleteWorkNote],
  )

  // ---- Logger: notepad and priority-matrix to-dos -----------------------------

  // Typing updates state at once; the database write waits for a short pause.
  const notepadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setNotepad = useCallback(
    (text: string) => {
      commit({ ...dataRef.current, notepad: text })
      if (notepadTimer.current) clearTimeout(notepadTimer.current)
      notepadTimer.current = setTimeout(() => persist((repo) => repo.putNotepad(text)), 400)
    },
    [commit, persist],
  )

  const putTodos = useCallback(
    (todos: Todo[]) => {
      commit({ ...dataRef.current, todos })
      persist((repo) => repo.putTodos(todos))
    },
    [commit, persist],
  )

  const addTodo = useCallback(
    (text: string, quadrant: Todo["quadrant"]) => {
      const trimmed = text.trim()
      if (!trimmed) return
      putTodos([
        ...dataRef.current.todos,
        { id: crypto.randomUUID(), text: trimmed, quadrant, done: false, createdAt: new Date().toISOString() },
      ])
    },
    [putTodos],
  )

  const updateTodo = useCallback(
    (id: string, patch: Partial<Pick<Todo, "text" | "quadrant" | "done">>) => {
      if (patch.text !== undefined && !patch.text.trim()) {
        putTodos(dataRef.current.todos.filter((t) => t.id !== id))
        return
      }
      putTodos(
        dataRef.current.todos.map((t) => (t.id === id ? { ...t, ...patch, text: patch.text?.trim() ?? t.text } : t)),
      )
    },
    [putTodos],
  )

  const deleteTodo = useCallback((id: string) => putTodos(dataRef.current.todos.filter((t) => t.id !== id)), [putTodos])

  const clearDoneTodos = useCallback(
    (quadrant?: Todo["quadrant"]) =>
      putTodos(dataRef.current.todos.filter((t) => !t.done || (quadrant && t.quadrant !== quadrant))),
    [putTodos],
  )

  // ---- Settings ----------------------------------------------------------

  const updateSettings = useCallback(
    (patch: Partial<AppData["settings"]>) => {
      const settings = { ...dataRef.current.settings, ...patch }
      commit({ ...dataRef.current, settings })
      persist((repo) => repo.putSettings(settings))
    },
    [commit, persist],
  )

  const setColumnWidths = useCallback(
    (widths: ColumnWidths) => updateSettings({ columnWidths: { ...dataRef.current.settings.columnWidths, ...widths } }),
    [updateSettings],
  )

  const resetColumnWidth = useCallback(
    (id: string) => {
      const { [id]: _removed, ...columnWidths } = dataRef.current.settings.columnWidths
      void _removed
      updateSettings({ columnWidths })
    },
    [updateSettings],
  )

  const setRangeDays = useCallback(
    (rangeDays: number) =>
      updateSettings({ rangeDays: Math.max(MIN_RANGE_DAYS, Math.min(MAX_RANGE_DAYS, Math.round(rangeDays))) }),
    [updateSettings],
  )

  const setRowOrder = useCallback((rowOrder: RowOrder) => updateSettings({ rowOrder }), [updateSettings])

  const setDaySettings = useCallback(
    (
      patch: Partial<
        Pick<AppData["settings"], "dayStart" | "dayEnd" | "showFullDay" | "sideSpace" | "hiddenTabs" | "loggerSections">
      >,
    ) => updateSettings(patch),
    [updateSettings],
  )

  // ---- Backlog -----------------------------------------------------------

  const putBacklog = useCallback(
    (backlog: BacklogItem[], changed: BacklogItem) => {
      commit({ ...dataRef.current, backlog })
      persist((repo) => repo.putBacklog(changed))
    },
    [commit, persist],
  )

  const addBacklog = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const item: BacklogItem = {
        id: crypto.randomUUID(),
        text: trimmed,
        done: false,
        createdAt: new Date().toISOString(),
      }
      putBacklog([item, ...dataRef.current.backlog], item)
    },
    [putBacklog],
  )

  const deleteBacklog = useCallback(
    (id: string) => {
      commit({ ...dataRef.current, backlog: dataRef.current.backlog.filter((b) => b.id !== id) })
      persist((repo) => repo.deleteBacklog(id))
    },
    [commit, persist],
  )

  const updateBacklog = useCallback(
    (id: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return deleteBacklog(id)
      const current = dataRef.current.backlog.find((b) => b.id === id)
      if (!current) return
      const item = { ...current, text: trimmed }
      putBacklog(
        dataRef.current.backlog.map((b) => (b.id === id ? item : b)),
        item,
      )
    },
    [deleteBacklog, putBacklog],
  )

  const toggleBacklog = useCallback(
    (id: string) => {
      const current = dataRef.current.backlog.find((b) => b.id === id)
      if (!current) return
      const item = { ...current, done: !current.done }
      putBacklog(
        dataRef.current.backlog.map((b) => (b.id === id ? item : b)),
        item,
      )
    },
    [putBacklog],
  )

  // ---- Import ------------------------------------------------------------

  /** Replace all data (after the caller has validated and confirmed an import). */
  const replaceAll = useCallback(
    async (next: AppData) => {
      const repo = repoRef.current
      if (!repo) throw new Error("Storage is not ready")
      await repo.replaceAll(next)
      commit(next)
    },
    [commit],
  )

  // ---- Derived -----------------------------------------------------------

  const tasks = useMemo(() => [...data.tasks].sort((a, b) => a.sortOrder - b.sortOrder), [data.tasks])
  const entryIndex = useMemo(() => indexEntries(data.entries), [data.entries])
  const dayPlans = useMemo(() => new Map(data.dayPlans.map((p) => [p.date, p])), [data.dayPlans])

  return {
    status,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    data,
    tasks,
    entryIndex,
    dayPlans,
    settings: data.settings,
    backlog: data.backlog,
    addTask,
    updateTask,
    setTaskStatus,
    deleteTask,
    applyEntries,
    updateDayPlan,
    addTimeLog,
    deleteTimeLog,
    updateTimeLog,
    addWorkNote,
    setNotepad,
    addTodo,
    updateTodo,
    deleteTodo,
    clearDoneTodos,
    updateWorkNote,
    deleteWorkNote,
    setColumnWidths,
    resetColumnWidth,
    setRangeDays,
    setRowOrder,
    setDaySettings,
    addBacklog,
    updateBacklog,
    toggleBacklog,
    deleteBacklog,
    replaceAll,
  }
}
