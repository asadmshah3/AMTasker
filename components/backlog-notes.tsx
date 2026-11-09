"use client"

import { useState } from "react"
import { Check, NotebookPen, Plus, Trash2 } from "lucide-react"
import type { BacklogItem } from "@/lib/model/types"

interface BacklogNotesProps {
  items: BacklogItem[]
  onAdd: (text: string) => void
  onToggle: (id: string) => void
  onUpdate: (id: string, text: string) => void
  onDelete: (id: string) => void
}

type Filter = "all" | "active" | "done"

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "done", label: "Done" },
]

export function BacklogNotes({ items, onAdd, onToggle, onUpdate, onDelete }: BacklogNotesProps) {
  const [draft, setDraft] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  const doneCount = items.filter((i) => i.done).length
  const visible = items.filter((i) => (filter === "all" ? true : filter === "done" ? i.done : !i.done))

  function submit() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setDraft("")
  }

  function startEdit(item: BacklogItem) {
    setEditingId(item.id)
    setEditValue(item.text)
  }

  function commitEdit() {
    if (editingId) onUpdate(editingId, editValue)
    setEditingId(null)
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-mono text-sm font-semibold text-foreground">Backlog &amp; Notes</h2>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {doneCount}/{items.length} done
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder="Add a backlog item or note… (Enter to add, Shift+Enter for a new line)"
            className="min-h-9 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </button>
        </div>

        <ul className="mt-4 space-y-1">
          {visible.length === 0 ? (
            <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "Nothing here yet. Capture tasks, ideas, or notes above."
                : "No items match this filter."}
            </li>
          ) : (
            visible.map((item) => (
              <li
                key={item.id}
                className="group flex items-start gap-2 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-accent/50"
              >
                <button
                  type="button"
                  onClick={() => onToggle(item.id)}
                  aria-label={item.done ? "Mark as not done" : "Mark as done"}
                  aria-pressed={item.done}
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-input hover:border-ring"
                  }`}
                >
                  {item.done && <Check className="h-3 w-3" aria-hidden="true" />}
                </button>

                {editingId === item.id ? (
                  <textarea
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        commitEdit()
                      }
                      if (e.key === "Escape") setEditingId(null)
                    }}
                    onBlur={commitEdit}
                    rows={1}
                    className="min-h-7 flex-1 resize-y rounded border border-ring bg-background px-2 py-1 text-sm text-foreground outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className={`flex-1 whitespace-pre-wrap break-words text-left text-sm ${
                      item.done ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                    title="Click to edit"
                  >
                    {item.text}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label="Delete item"
                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  )
}
