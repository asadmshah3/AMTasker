import type { DateKey } from "./model/types"

export function toDateKey(d: Date): DateKey {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Today's date key, or the date key of `at`. */
export function todayKey(at: Date = new Date()): DateKey {
  return toDateKey(at)
}

/** Local midnight Date for a date key. */
export function parseKey(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** Returns an array of date keys, newest first, spanning `count` days ending at `end` (default today). */
export function recentDateKeys(count: number, end: DateKey = todayKey()): DateKey[] {
  const keys: DateKey[] = []
  for (let i = 0; i < count; i++) keys.push(addDays(end, -i))
  return keys
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: DateKey, to: DateKey): number {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * Date keys for one page of a rolling window, oldest day first.
 * page 0 ends today; page 1 is the `rangeDays` days before that, and so on.
 */
export function rangePageDateKeys(rangeDays: number, page: number, today: DateKey): DateKey[] {
  const end = addDays(today, -page * rangeDays)
  const keys: DateKey[] = []
  for (let i = rangeDays - 1; i >= 0; i--) keys.push(addDays(end, -i))
  return keys
}

/** Index of the last page that still contains `earliest` (>= 0). */
export function lastRangePage(rangeDays: number, earliest: DateKey, today: DateKey): number {
  return Math.max(0, Math.floor(daysBetween(earliest, today) / rangeDays))
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** Spreadsheet-style date, "16 Jun 2026". */
export function formatSheetDate(key: DateKey): string {
  const [y, m, d] = key.split("-").map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "September 2026". */
export function formatMonthYear(key: DateKey): string {
  const [y, m] = key.split("-").map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** "3 Sep – 2 Oct 2026", or "3 Dec 2025 – 1 Jan 2026" across years. */
export function formatRangeLabel(first: DateKey, last: DateKey): string {
  if (first === last) return formatSheetDate(first)
  const [fy, fm, fd] = first.split("-").map(Number)
  const head = fy === Number(last.slice(0, 4)) ? `${fd} ${MONTHS[fm - 1]}` : formatSheetDate(first)
  return `${head} – ${formatSheetDate(last)}`
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function formatRowLabel(key: DateKey): { weekday: string; date: string } {
  const [, m, d] = key.split("-").map(Number)
  return {
    weekday: WEEKDAYS[dayOfWeek(key)],
    date: `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`,
  }
}

/** "Mon, Sep 21" style label for lists. */
export function formatLongLabel(key: DateKey): string {
  const [, m, d] = key.split("-").map(Number)
  return `${WEEKDAYS[dayOfWeek(key)]}, ${MONTHS[m - 1]} ${d}`
}

export function isWeekend(key: DateKey): boolean {
  const day = dayOfWeek(key)
  return day === 0 || day === 6
}

/** Day of week for a date key (0 = Sun … 6 = Sat). */
export function dayOfWeek(key: DateKey): number {
  return parseKey(key).getDay()
}

export const DAY_ABBR = WEEKDAYS
export const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"]
