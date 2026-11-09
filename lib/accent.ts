import { profileKey } from "./profiles"

/** Colour themes: an accent palette on top of light/dark. "classic" is the original black/white. */
export const ACCENTS = [
  { id: "classic", label: "Classic", swatch: "#171717" },
  { id: "ocean", label: "Ocean", swatch: "#2563eb" },
  { id: "forest", label: "Forest", swatch: "#15803d" },
  { id: "sunset", label: "Sunset", swatch: "#ea580c" },
  { id: "grape", label: "Grape", swatch: "#7c3aed" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
] as const
export type AccentId = (typeof ACCENTS)[number]["id"]

const BASE = "amtasker:accent"

export function readAccent(): AccentId {
  try {
    const v = localStorage.getItem(profileKey(BASE))
    return ACCENTS.some((a) => a.id === v) ? (v as AccentId) : "classic"
  } catch {
    return "classic"
  }
}

export function applyAccent(id: AccentId): void {
  const root = document.documentElement
  if (id === "classic") delete root.dataset.accent
  else root.dataset.accent = id
  try {
    localStorage.setItem(profileKey(BASE), id)
  } catch {
    // ignore
  }
}
