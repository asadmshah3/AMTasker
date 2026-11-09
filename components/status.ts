import type { EntryStatus } from "@/lib/model/types"

interface StatusMeta {
  label: string
  /** Shown in the cell so status never relies on color alone. */
  symbol: string
  /** Keyboard shortcut in the table and the cell editor. */
  key: string
  cell: string
  swatch: string
  button: string
}

export const STATUS_ORDER: EntryStatus[] = ["completed", "partial", "not_completed", "skipped"]

export const STATUS_META: Record<EntryStatus, StatusMeta> = {
  completed: {
    label: "Completed",
    symbol: "✓",
    key: "1",
    // Bright spreadsheet green.
    cell: "bg-lime-400 text-lime-950 hover:bg-lime-300 dark:bg-lime-500/75 dark:hover:bg-lime-500/90",
    swatch: "bg-lime-400 dark:bg-lime-500/75",
    button:
      "hover:border-emerald-500 hover:bg-emerald-500/15 aria-pressed:border-emerald-500 aria-pressed:bg-emerald-500/20",
  },
  partial: {
    label: "Partial",
    symbol: "½",
    key: "2",
    cell: "bg-amber-400/80 text-amber-950 hover:bg-amber-400",
    swatch: "bg-amber-400/80",
    button: "hover:border-amber-400 hover:bg-amber-400/15 aria-pressed:border-amber-400 aria-pressed:bg-amber-400/20",
  },
  not_completed: {
    label: "Not done",
    symbol: "✗",
    key: "3",
    cell: "bg-red-500/80 text-white hover:bg-red-500",
    swatch: "bg-red-500/80",
    button: "hover:border-red-500 hover:bg-red-500/15 aria-pressed:border-red-500 aria-pressed:bg-red-500/20",
  },
  skipped: {
    label: "Skipped",
    symbol: "–",
    key: "4",
    cell: "bg-slate-400/35 text-muted-foreground hover:bg-slate-400/50",
    swatch: "bg-slate-400/35",
    button: "hover:border-slate-400 hover:bg-slate-400/15 aria-pressed:border-slate-400 aria-pressed:bg-slate-400/20",
  },
}

/** Map a pressed key ("1"–"4") to a status, "0"/Backspace/Delete to clear. undefined = not a status key. */
export function statusForKey(key: string): EntryStatus | null | undefined {
  if (key === "0" || key === "Backspace" || key === "Delete") return null
  return STATUS_ORDER.find((s) => STATUS_META[s].key === key)
}

/** Left-click cycle: no entry → Completed → Partial → Not done → Skipped → no entry. */
export function nextStatus(current: EntryStatus | undefined): EntryStatus | null {
  if (current === undefined) return STATUS_ORDER[0]
  const i = STATUS_ORDER.indexOf(current)
  return i === STATUS_ORDER.length - 1 ? null : STATUS_ORDER[i + 1]
}
