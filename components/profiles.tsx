"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Check, ChevronDown, KeyRound, Lock, Plus, Settings2, Trash2 } from "lucide-react"
import { Modal } from "./modal"
import {
  PROFILE_COLORS,
  checkPin,
  deleteProfileData,
  isUnlocked,
  isValidPin,
  makePin,
  markUnlocked,
  nameProblem,
  newProfileId,
  normalizeName,
  activeProfileId,
  isSwitching,
  readRegistry,
  readUnlockedId,
  subscribeRegistry,
  switchTo,
  writeRegistry,
  dbNameFor,
  type Profile,
  type Registry,
} from "@/lib/profiles"
import { IdbRepository } from "@/lib/data/idb-repository"
import { downloadFile, exportJson } from "@/lib/data/backup"
import { todayKey } from "@/lib/date-utils"

const input =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
const button =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-40"
const primary =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"

/** The profile list, re-rendered when it changes. null during server rendering. */
function useRegistry(): Registry | null {
  return useSyncExternalStore(subscribeRegistry, readRegistry, () => null)
}

function ProfileAvatar({
  profile,
  size = "md",
}: {
  profile: Pick<Profile, "name" | "color">
  size?: "sm" | "md" | "lg"
}) {
  const cls = size === "lg" ? "h-14 w-14 text-xl" : size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs"
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${cls}`}
      style={{ background: profile.color }}
      aria-hidden="true"
    >
      {profile.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

// ---- Gate -----------------------------------------------------------------------

/**
 * Shows the app for the active profile, or the "who's using" lock screen when that profile has a
 * PIN and hasn't been unlocked in this browser session. The app's data isn't loaded until then.
 */
export function ProfileGate({ children }: { children: React.ReactNode }) {
  const registry = useRegistry()
  const unlockedId = useSyncExternalStore(subscribeRegistry, readUnlockedId, () => "")
  // This tab stays on the profile it was loaded with (see activeProfileId).
  const pageId = registry ? activeProfileId() : null
  const active = registry?.profiles.find((p) => p.id === pageId)

  // Show whose data this is in the tab title (set again after load, as Next.js applies its own title then).
  useEffect(() => {
    if (!active) return
    const set = () => {
      if (!document.title.includes(" · ")) document.title = `AMTasker — ${active.name}`
    }
    set()
    const t = setTimeout(set, 800)
    return () => clearTimeout(t)
  }, [active])

  if (!registry || isSwitching()) return <div className="min-h-screen bg-background" />
  if (!active || registry.activeId !== pageId) {
    const now = registry.profiles.find((p) => p.id === registry.activeId)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-sm text-foreground">
          {now ? `Switched to ${now.name} in another tab.` : "This profile was removed in another tab."}
        </p>
        <button type="button" onClick={() => window.location.reload()} className={primary}>
          Reload
        </button>
      </div>
    )
  }
  if (!isUnlocked(active, unlockedId)) return <LockScreen registry={registry} />
  return <>{children}</>
}

function LockScreen({ registry }: { registry: Registry }) {
  const [asking, setAsking] = useState<Profile | null>(null)

  function choose(p: Profile) {
    if (p.pinHash) return setAsking(p)
    if (p.id === registry.activeId) markUnlocked(p.id)
    else switchTo(p.id, false)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <h1 className="font-mono text-lg font-semibold text-foreground">Who&apos;s using AMTasker?</h1>
      <ul className="flex flex-wrap justify-center gap-3">
        {registry.profiles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => choose(p)}
              className="flex w-32 flex-col items-center gap-2 rounded-lg border border-border bg-card px-3 py-4 transition-colors hover:bg-accent"
            >
              <ProfileAvatar profile={p} size="lg" />
              <span className="max-w-full truncate text-sm font-medium text-foreground">{p.name}</span>
              {p.pinHash && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden="true" /> PIN
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <PinDialog
        profile={asking}
        onClose={() => setAsking(null)}
        onSuccess={(p) => (p.id === registry.activeId ? markUnlocked(p.id) : switchTo(p.id, true))}
      />
    </div>
  )
}

// ---- PIN dialog -------------------------------------------------------------------

function PinDialog({
  profile,
  onClose,
  onSuccess,
}: {
  profile: Profile | null
  onClose: () => void
  onSuccess: (profile: Profile) => void
}) {
  return (
    <Modal
      open={profile !== null}
      onClose={onClose}
      title={profile ? `PIN for ${profile.name}` : "PIN"}
      width="max-w-xs"
    >
      {profile && <PinForm key={profile.id} profile={profile} onSuccess={onSuccess} />}
    </Modal>
  )
}

function PinForm({ profile, onSuccess }: { profile: Profile; onSuccess: (profile: Profile) => void }) {
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  return (
    <form
      className="space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await checkPin(profile, pin)) onSuccess(profile)
        else {
          setError("Wrong PIN.")
          setPin("")
        }
      }}
    >
      <input
        data-autofocus
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        placeholder="4–6 digits"
        aria-label="PIN"
        className={`${input} text-center font-mono tracking-[0.4em]`}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={pin.length < 4} className={`${primary} w-full`}>
        Unlock
      </button>
    </form>
  )
}

// ---- Header menu ------------------------------------------------------------------

/** The header button: who's active, switch, add, manage, lock. */
export function ProfileMenu({ onManage }: { onManage: () => void }) {
  const registry = useRegistry()
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!registry) return null
  const active = registry.profiles.find((p) => p.id === registry.activeId)!

  function choose(p: Profile) {
    setOpen(false)
    if (p.id === active.id) return
    if (p.pinHash) setAsking(p)
    else switchTo(p.id, false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card pl-1 pr-2 text-sm text-foreground transition-colors hover:bg-accent"
        title="Switch profile"
      >
        <ProfileAvatar profile={active} />
        <span className="hidden max-w-28 truncate sm:inline">{active.name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-50 w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Profiles</p>
          {registry.profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              onClick={() => choose(p)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <ProfileAvatar profile={p} size="sm" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.pinHash && <Lock className="h-3 w-3 text-muted-foreground" aria-label="has a PIN" />}
              {p.id === active.id && <Check className="h-3.5 w-3.5" aria-label="active" />}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setAdding(true)
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add profile…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Manage profiles
          </button>
          {active.pinHash && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                markUnlocked(null)
                window.location.reload()
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Lock {active.name}
            </button>
          )}
        </div>
      )}
      <PinDialog profile={asking} onClose={() => setAsking(null)} onSuccess={(p) => switchTo(p.id, true)} />
      <AddProfileDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

// ---- Add profile --------------------------------------------------------------------

function AddProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add profile" width="max-w-sm">
      {open && <AddProfileForm onClose={onClose} />}
    </Modal>
  )
}

function AddProfileForm({ onClose }: { onClose: () => void }) {
  const registry = readRegistry()
  const [name, setName] = useState("")
  const [color, setColor] = useState(PROFILE_COLORS[registry.profiles.length % PROFILE_COLORS.length])
  const [pin, setPin] = useState("")
  const [pin2, setPin2] = useState("")
  const [busy, setBusy] = useState(false)

  const problem = name.trim() ? nameProblem(registry, name) : null
  const pinProblem =
    pin && !isValidPin(pin) ? "PIN must be 4–6 digits." : pin && pin !== pin2 ? "PINs don't match." : null
  const valid = !!name.trim() && !problem && !pinProblem

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    const profile: Profile = {
      id: newProfileId(),
      name: normalizeName(name),
      color,
      createdAt: new Date().toISOString(),
      ...(pin ? await makePin(pin) : {}),
    }
    const reg = readRegistry()
    writeRegistry({ ...reg, profiles: [...reg.profiles, profile] })
    switchTo(profile.id, true)
    onClose()
  }

  return (
    <form onSubmit={create} className="space-y-3 p-4">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Name</span>
        <input
          data-autofocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          className={input}
          placeholder="e.g. Sara"
        />
      </label>
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      <ColorPicker value={color} onChange={setColor} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">PIN (optional)</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className={input}
            placeholder="4–6 digits"
            autoComplete="new-password"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Repeat PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
            className={input}
            disabled={!pin}
            autoComplete="new-password"
          />
        </label>
      </div>
      {pinProblem && <p className="text-xs text-destructive">{pinProblem}</p>}
      <p className="text-[11px] text-muted-foreground">
        The new profile starts empty and has its own tasks, history, time sheet and settings. A PIN only stops casual
        switching; the data on this computer isn&apos;t encrypted.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={button}>
          Cancel
        </button>
        <button type="submit" disabled={!valid || busy} className={primary}>
          Create and switch
        </button>
      </div>
    </form>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Colour">
      {PROFILE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Colour ${c}`}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full border-2 ${value === c ? "border-foreground" : "border-transparent"}`}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

// ---- Manage → Profiles ---------------------------------------------------------------

/** Rename, recolour, PIN and delete profiles. */
export function ProfilesPanel() {
  const registry = useRegistry()
  const [adding, setAdding] = useState(false)
  if (!registry) return null
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Each profile has completely separate data on this computer. Switch from the button at the top right.
      </p>
      <ul className="space-y-2">
        {registry.profiles.map((p) => (
          <ProfileRow
            key={`${p.id}-${p.name}-${p.color}-${p.pinHash ?? ""}`}
            profile={p}
            active={p.id === registry.activeId}
          />
        ))}
      </ul>
      <button type="button" onClick={() => setAdding(true)} className={button}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add profile
      </button>
      <AddProfileDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

type RowMode = "view" | "rename" | "pin" | "removePin" | "forgotPin" | "delete"

function update(id: string, patch: Partial<Profile>) {
  const reg = readRegistry()
  writeRegistry({ ...reg, profiles: reg.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
}

function ProfileRow({ profile, active }: { profile: Profile; active: boolean }) {
  const [mode, setMode] = useState<RowMode>("view")
  const [text, setText] = useState("")
  const [pin, setPin] = useState("")
  const [pin2, setPin2] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  function reset(next: RowMode = "view") {
    setMode(next)
    setText(next === "rename" ? profile.name : "")
    setPin("")
    setPin2("")
    setError("")
  }

  async function backup() {
    const { data } = await new IdbRepository(dbNameFor(profile.id)).load()
    if (data) downloadFile(`amtasker-${profile.name}-backup-${todayKey()}.json`, exportJson(data), "application/json")
    else setError("This profile has no data yet.")
  }

  const digits = (v: string) => v.replace(/\D/g, "")
  const small = "h-7 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent disabled:opacity-40"

  return (
    <li className="rounded-md border border-border bg-background/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ProfileAvatar profile={profile} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {profile.name}
          {active && (
            <span className="ml-2 rounded bg-primary/10 px-1 text-[10px] font-normal text-foreground">in use</span>
          )}
          {profile.pinHash && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-normal text-muted-foreground">
              <KeyRound className="h-3 w-3" aria-hidden="true" /> PIN
            </span>
          )}
        </span>
        <button type="button" onClick={() => reset("rename")} className={small}>
          Rename
        </button>
        {active ? (
          <>
            <button type="button" onClick={() => reset("pin")} className={small}>
              {profile.pinHash ? "Change PIN" : "Set PIN"}
            </button>
            {profile.pinHash && (
              <button type="button" onClick={() => reset("removePin")} className={small}>
                Remove PIN
              </button>
            )}
          </>
        ) : (
          <>
            {profile.pinHash && (
              <button type="button" onClick={() => reset("forgotPin")} className={small} title="Remove a forgotten PIN">
                Forgot PIN
              </button>
            )}
            <button
              type="button"
              onClick={() => reset("delete")}
              className={`${small} text-destructive hover:bg-destructive/10`}
              aria-label={`Delete ${profile.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {mode === "view" && (
        <div className="mt-2">
          <ColorPicker value={profile.color} onChange={(color) => update(profile.id, { color })} />
        </div>
      )}

      {mode === "rename" && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const problem = nameProblem(readRegistry(), text, profile.id)
            if (problem) return setError(problem)
            update(profile.id, { name: normalizeName(text) })
          }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={30}
            className={`${input} h-7 max-w-56`}
            aria-label="New name"
          />
          <button type="submit" className={small}>
            Save
          </button>
          <button type="button" onClick={() => reset()} className={small}>
            Cancel
          </button>
        </form>
      )}

      {mode === "pin" && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (profile.pinHash && !(await checkPin(profile, text))) return setError("Current PIN is wrong.")
            if (!isValidPin(pin)) return setError("PIN must be 4–6 digits.")
            if (pin !== pin2) return setError("PINs don't match.")
            setBusy(true)
            update(profile.id, await makePin(pin))
            markUnlocked(profile.id)
          }}
        >
          {profile.pinHash && (
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={text}
              onChange={(e) => setText(digits(e.target.value))}
              placeholder="current PIN"
              aria-label="Current PIN"
              className={`${input} h-7 w-28`}
              autoComplete="off"
            />
          )}
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            placeholder="new PIN"
            aria-label="New PIN"
            className={`${input} h-7 w-28`}
            autoComplete="new-password"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin2}
            onChange={(e) => setPin2(digits(e.target.value))}
            placeholder="repeat"
            aria-label="Repeat new PIN"
            className={`${input} h-7 w-28`}
            autoComplete="new-password"
          />
          <button type="submit" disabled={busy} className={small}>
            Save PIN
          </button>
          <button type="button" onClick={() => reset()} className={small}>
            Cancel
          </button>
        </form>
      )}

      {mode === "removePin" && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!(await checkPin(profile, text))) return setError("Wrong PIN.")
            update(profile.id, { pinHash: undefined, pinSalt: undefined })
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={text}
            onChange={(e) => setText(digits(e.target.value))}
            placeholder="current PIN"
            aria-label="Current PIN"
            className={`${input} h-7 w-28`}
            autoComplete="off"
          />
          <button type="submit" className={small}>
            Remove PIN
          </button>
          <button type="button" onClick={() => reset()} className={small}>
            Cancel
          </button>
        </form>
      )}

      {(mode === "forgotPin" || mode === "delete") && (
        <form
          className="mt-2 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (text.trim() !== profile.name) return setError(`Type ${profile.name} exactly to confirm.`)
            if (mode === "forgotPin") return update(profile.id, { pinHash: undefined, pinSalt: undefined })
            setBusy(true)
            try {
              await deleteProfileData(profile.id)
            } catch (err) {
              setBusy(false)
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
        >
          <p className="text-xs text-foreground">
            {mode === "delete" ? (
              <>
                This permanently deletes <b>all of {profile.name}&apos;s data</b> on this computer. Download a backup
                first if it might be needed.
              </>
            ) : (
              <>Removes {profile.name}&apos;s PIN so the profile opens without one. Their data is not changed.</>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "delete" && (
              <button type="button" onClick={backup} className={small}>
                Download backup
              </button>
            )}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`type ${profile.name}`}
              aria-label="Type the profile name to confirm"
              className={`${input} h-7 max-w-44`}
            />
            <button
              type="submit"
              disabled={busy}
              className={`${small} ${mode === "delete" ? "border-destructive text-destructive hover:bg-destructive/10" : ""}`}
            >
              {mode === "delete" ? "Delete profile" : "Remove PIN"}
            </button>
            <button type="button" onClick={() => reset()} className={small}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
