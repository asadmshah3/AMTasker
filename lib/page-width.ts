import type { CSSProperties } from "react"

/** The widest the page gets at maximum side space (the original layout). */
const NARROW_MAX = 1280

/**
 * Page width for a side-space setting (0–100), applied the same on both sides:
 * 0 = full window width with 16px margins; 100 = at most 1280px, centred, with 24px padding.
 * Phones keep their own 12px margin (see the `sm:` class that reads --side).
 */
export function pageWidthStyle(sideSpace: number): CSSProperties {
  const t = Math.min(100, Math.max(0, sideSpace)) / 100
  return {
    maxWidth: `calc(${NARROW_MAX}px + (100vw - ${NARROW_MAX}px) * ${(1 - t).toFixed(3)})`,
    ["--side" as string]: `${Math.round(16 + 8 * t)}px`,
  }
}

/** Classes to use with pageWidthStyle: centred, 12px margins on phones, --side from the small breakpoint up. */
export const PAGE_WIDTH_CLASS = "mx-auto w-full px-3 sm:px-[var(--side)]"
