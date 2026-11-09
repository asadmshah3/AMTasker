"use client"

import { useRef, useState } from "react"
import { Download, FileSpreadsheet, Upload } from "lucide-react"
import type { AppData, DateKey } from "@/lib/model/types"
import { downloadFile, exportCsv, exportJson, parseImport, type ImportSummary } from "@/lib/data/backup"
import { readRegistry } from "@/lib/profiles"

/** The active profile's name, for file names ("amtasker-Me-backup-…"). */
function profileName(): string {
  const reg = readRegistry()
  return (reg.profiles.find((p) => p.id === reg.activeId)?.name ?? "profile").replace(/[^\w-]+/g, "_")
}

interface DataPanelProps {
  data: AppData
  today: DateKey
  onReplaceAll: (data: AppData) => Promise<void>
}

type ImportState =
  | { step: "idle" }
  | { step: "error"; message: string }
  | { step: "confirm"; fileName: string; data: AppData; summary: ImportSummary }
  | { step: "done"; message: string }

const buttonClass =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"

export function DataPanel({ data, today, onReplaceAll }: DataPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ImportState>({ step: "idle" })
  const [busy, setBusy] = useState(false)

  function downloadJson() {
    downloadFile(`amtasker-${profileName()}-backup-${today}.json`, exportJson(data), "application/json")
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const result = parseImport(await file.text())
    setState(
      result.ok
        ? { step: "confirm", fileName: file.name, data: result.data, summary: result.summary }
        : { step: "error", message: result.error },
    )
  }

  async function confirmImport() {
    if (state.step !== "confirm") return
    setBusy(true)
    try {
      await onReplaceAll(state.data)
      setState({ step: "done", message: `Restored ${state.summary.tasks} tasks and ${state.summary.entries} entries.` })
    } catch (err) {
      setState({
        step: "error",
        message: `Import failed, your data was not changed: ${err instanceof Error ? err.message : err}`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Export</h3>
        <p className="text-xs text-muted-foreground">
          Your data lives only in this browser. Download a backup regularly, and before clearing site data.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadJson} className={buttonClass} data-autofocus>
            <Download className="h-4 w-4" aria-hidden="true" />
            Backup (JSON)
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile(
                `amtasker-${profileName()}-history-${today}.csv`,
                exportCsv(data, today),
                "text/csv;charset=utf-8",
              )
            }
            className={buttonClass}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            History (CSV)
          </button>
        </div>
      </section>

      <section className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">Restore from backup</h3>
        <p className="text-xs text-muted-foreground">
          The file is checked before anything changes. Restoring replaces all current data.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Choose backup file…
        </button>

        {state.step === "error" && (
          <p
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
            role="alert"
          >
            {state.message}
          </p>
        )}
        {state.step === "done" && (
          <p
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-foreground"
            role="status"
          >
            {state.message}
          </p>
        )}
        {state.step === "confirm" && (
          <div
            className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
            role="alert"
          >
            <p>
              <span className="font-mono">{state.fileName}</span> contains {state.summary.tasks} tasks,{" "}
              {state.summary.entries} entries
              {state.summary.firstDate ? ` (${state.summary.firstDate} → ${state.summary.lastDate})` : ""} and{" "}
              {state.summary.backlog} backlog items.
            </p>
            <p className="font-medium">
              This replaces your current {data.tasks.length} tasks and {data.entries.length} entries.
            </p>
            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                onClick={() => setState({ step: "idle" })}
                className="rounded-md border border-border px-2 py-1 hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={downloadJson}
                className="rounded-md border border-border bg-card px-2 py-1 hover:bg-accent"
              >
                Download current data first
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={busy}
                className="rounded-md bg-destructive px-2 py-1 font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Restoring…" : "Replace my data"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
