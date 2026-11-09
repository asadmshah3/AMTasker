"use client"

import { useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"
import { profileKey } from "@/lib/profiles"

type Theme = "light" | "dark"

// The <html> class is set before paint by the inline script in app/layout.tsx; read it from there.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function apply(next: Theme) {
  const root = document.documentElement
  root.classList.toggle("dark", next === "dark")
  root.classList.toggle("light", next === "light")
  try {
    localStorage.setItem(profileKey("amtasker:theme"), next)
  } catch {
    // ignore
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, getTheme, () => null)
  const next: Theme = theme === "dark" ? "light" : "dark"

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  )
}
