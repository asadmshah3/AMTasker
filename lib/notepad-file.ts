/**
 * Optional link between the Logger notepad and a .txt file on disk (File System Access API,
 * Edge/Chrome). The notepad is always saved in the app's own storage; when a file is linked, every
 * change is also written to it. The browser only allows this after you pick the file yourself, and
 * may ask again (one click) after a restart. The file handle is kept per profile in IndexedDB.
 */

interface WritableFile {
  write(data: string): Promise<void>
  close(): Promise<void>
}
export interface TextFileHandle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<WritableFile>
  queryPermission?(o: { mode: "readwrite" }): Promise<PermissionState>
  requestPermission?(o: { mode: "readwrite" }): Promise<PermissionState>
}
type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<TextFileHandle>
  showOpenFilePicker?: (o: unknown) => Promise<TextFileHandle[]>
}

const TYPES = [{ description: "Text file", accept: { "text/plain": [".txt"] } }]
const DB = "amtasker-files"
const STORE = "handles"

export function fileLinkSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window && "showOpenFilePicker" in window
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const req = op(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  }).finally(() => db.close())
}

export const loadHandle = (profileId: string) => idb<TextFileHandle | undefined>("readonly", (s) => s.get(profileId))
const saveHandle = (profileId: string, h: TextFileHandle) => idb<unknown>("readwrite", (s) => s.put(h, profileId))
export const forgetHandle = (profileId: string) => idb<unknown>("readwrite", (s) => s.delete(profileId))

/** "granted", or "prompt" when a click is needed to allow writing again. */
export async function permissionOf(h: TextFileHandle): Promise<PermissionState> {
  return (await h.queryPermission?.({ mode: "readwrite" })) ?? "granted"
}

export async function requestPermission(h: TextFileHandle): Promise<boolean> {
  return ((await h.requestPermission?.({ mode: "readwrite" })) ?? "granted") === "granted"
}

/** Pick (or create) a file to save the notepad into. */
export async function pickSaveFile(profileId: string, suggestedName: string): Promise<TextFileHandle> {
  const h = await (window as PickerWindow).showSaveFilePicker!({ suggestedName, types: TYPES })
  await saveHandle(profileId, h)
  return h
}

/** Open an existing .txt file: returns its text and keeps it linked for saving. */
export async function pickOpenFile(profileId: string): Promise<{ handle: TextFileHandle; text: string }> {
  const [h] = await (window as PickerWindow).showOpenFilePicker!({ types: TYPES, multiple: false })
  await saveHandle(profileId, h)
  return { handle: h, text: await (await h.getFile()).text() }
}

export async function writeText(h: TextFileHandle, text: string): Promise<void> {
  const w = await h.createWritable()
  await w.write(text)
  await w.close()
}
