import { SCHEMA_VERSION, defaultSettings, type AppData, type DateKey } from "../model/types"
import { createTask } from "../domain/tasks"

/**
 * Example tasks for a first launch (the same ones the user guide uses). They start today, so they
 * create no unresolved history. Rename or delete them in Manage → Tasks.
 */
export function seedData(today: DateKey, now = new Date()): AppData {
  const base = { startDate: today, showOnDashboard: true }
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [
      createTask({ ...base, name: "German B2", schedule: { type: "daily" }, target: 45, unit: "minutes" }, 0, now),
      createTask(
        { ...base, name: "Morning exercise", schedule: { type: "daily" }, target: 30, unit: "minutes" },
        1,
        now,
      ),
      createTask({ ...base, name: "Reading", schedule: { type: "daily" }, target: 30, unit: "minutes" }, 2, now),
      createTask(
        { ...base, name: "Office: development", schedule: { type: "weekdays" }, target: 360, unit: "minutes" },
        3,
        now,
      ),
    ],
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
