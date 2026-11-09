/**
 * Profiles: several people on one computer, each with completely separate data.
 *
 * - Each profile has its own IndexedDB database. The first profile ("Me", id DEFAULT_PROFILE_ID)
 *   uses the plain database name and localStorage keys; other profiles add their id to them.
 * - The list of profiles and the active one live in localStorage (REGISTRY_KEY).
 * - A PIN is optional and only a casual lock: only a salted SHA-256 hash is stored, and the data
 *   itself is not encrypted.
 */

export const DEFAULT_PROFILE_ID = "default"
const DEFAULT_PROFILE_NAME = "Me"
const REGISTRY_KEY = "amtasker:profiles"
const UNLOCKED_KEY = "amtasker:unlocked" // sessionStorage: profile unlocked in this browser tab session
const EVENT = "amtasker:profiles-change"
const DB_BASE = "amtasker"

export const PROFILE_COLORS = ["#2563eb", "#7c3aed", "#0d9488", "#d97706", "#db2777", "#16a34a", "#475569"]

export interface Profile {
  id: string
  name: string
  color: string
  /** Salted SHA-256 of the PIN, hex. Absent when the profile has no PIN. */
  pinHash?: string
  pinSalt?: string
  createdAt: string
}

export interface Registry {
  profiles: Profile[]
  activeId: string
}

// ---- Pure helpers ------------------------------------------------------------

export function defaultRegistry(now = new Date()): Registry {
  return {
    profiles: [
      { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME, color: PROFILE_COLORS[0], createdAt: now.toISOString() },
    ],
    activeId: DEFAULT_PROFILE_ID,
  }
}

/** Database name of a profile. The original profile keeps the original name. */
export function dbNameFor(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? DB_BASE : `${DB_BASE}-${profileId}`
}

/** localStorage key for a per-profile setting. The original profile keeps the original keys. */
export function keyFor(base: string, profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? base : `${base}@${profileId}`
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 30)
}

/** Problems with a proposed profile name (empty, or used by another profile), or null. */
export function nameProblem(registry: Registry, name: string, exceptId?: string): string | null {
  const n = normalizeName(name)
  if (!n) return "Enter a name."
  if (registry.profiles.some((p) => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase()))
    return "That name is already used."
  return null
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}

/** Parse a stored registry, falling back to the default when missing or damaged. */
export function parseRegistry(raw: string | null): Registry {
  if (!raw) return defaultRegistry()
  try {
    const r = JSON.parse(raw) as Registry
    if (!Array.isArray(r.profiles) || r.profiles.length === 0) return defaultRegistry()
    const profiles = r.profiles.filter((p) => typeof p.id === "string" && typeof p.name === "string")
    if (profiles.length === 0) return defaultRegistry()
    const activeId = profiles.some((p) => p.id === r.activeId) ? r.activeId : profiles[0].id
    return { profiles, activeId }
  } catch {
    return defaultRegistry()
  }
}

// ---- PIN hashing (Web Crypto) -----------------------------------------------

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function hashPin(pin: string, saltHex: string): Promise<string> {
  const data = new TextEncoder().encode(`${saltHex}:${pin}`)
  return toHex(await crypto.subtle.digest("SHA-256", data))
}

export async function makePin(pin: string): Promise<Pick<Profile, "pinHash" | "pinSalt">> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  return { pinSalt: salt, pinHash: await hashPin(pin, salt) }
}

export async function checkPin(profile: Profile, pin: string): Promise<boolean> {
  if (!profile.pinHash || !profile.pinSalt) return true
  return (await hashPin(pin, profile.pinSalt)) === profile.pinHash
}

// ---- Browser storage ----------------------------------------------------------

let cached: { raw: string | null; registry: Registry } | null = null

/** The registry (stable object between changes, for useSyncExternalStore). */
export function readRegistry(): Registry {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(REGISTRY_KEY)
  } catch {
    // storage unavailable: behave as the single default profile
  }
  if (cached && cached.raw === raw) return cached.registry
  cached = { raw, registry: parseRegistry(raw) }
  return cached.registry
}

export function writeRegistry(registry: Registry): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry))
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT))
}

export function subscribeRegistry(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

/**
 * The profile this page was loaded with. Fixed for the life of the page, so another browser tab
 * switching profiles can't make this tab read or write the other person's data and settings.
 */
let pageProfileId: string | null = null
export function activeProfileId(): string {
  pageProfileId ??= readRegistry().activeId
  return pageProfileId
}

/** Per-profile localStorage key for the active profile. */
export function profileKey(base: string): string {
  return keyFor(base, activeProfileId())
}

/** The profile unlocked in this tab session ("" when none). */
export function readUnlockedId(): string {
  try {
    return sessionStorage.getItem(UNLOCKED_KEY) ?? ""
  } catch {
    return ""
  }
}

export function isUnlocked(profile: Profile, unlockedId: string = readUnlockedId()): boolean {
  return !profile.pinHash || unlockedId === profile.id
}

export function markUnlocked(profileId: string | null): void {
  try {
    if (profileId) sessionStorage.setItem(UNLOCKED_KEY, profileId)
    else sessionStorage.removeItem(UNLOCKED_KEY)
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Make a profile active and reload into it (the safest way to drop every bit of the old profile's state). */
let switching = false
/** True while this tab is reloading into another profile (so it doesn't flash a "switched" notice). */
export function isSwitching(): boolean {
  return switching
}

export function switchTo(profileId: string, unlocked: boolean): void {
  switching = true
  const reg = readRegistry()
  writeRegistry({ ...reg, activeId: profileId })
  markUnlocked(unlocked ? profileId : null)
  window.location.reload()
}

/** Delete a profile's database and its per-profile settings, then remove it from the list. */
export async function deleteProfileData(profileId: string): Promise<void> {
  if (profileId === activeProfileId()) throw new Error("Can't delete the profile in use.")
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbNameFor(profileId))
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve() // another tab holds it open; it is removed once that tab closes
  })
  try {
    const suffix = `@${profileId}`
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.endsWith(suffix)) localStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
  const reg = readRegistry()
  writeRegistry({ ...reg, profiles: reg.profiles.filter((p) => p.id !== profileId) })
}

export function newProfileId(): string {
  return crypto.randomUUID().slice(0, 8)
}
