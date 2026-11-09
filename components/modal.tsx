"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Extra content in the header, right of the title. */
  actions?: React.ReactNode
  width?: string
  children: React.ReactNode
}

/** Minimal dialog shell: overlay, Escape to close, focus moved in and restored on close. */
export function Modal({ open, onClose, title, actions, width = "max-w-lg", children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const t = setTimeout(() => {
      const panel = panelRef.current
      const target = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel
      target?.focus()
    }, 0)
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener("keydown", onKey)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-4 sm:pt-[8vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${width} rounded-lg border border-border bg-card shadow-xl outline-none`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="font-mono text-sm font-semibold text-foreground">{title}</h2>
          <div className="flex items-center gap-1">
            {actions}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
