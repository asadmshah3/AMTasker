import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROFILE_ID,
  checkPin,
  dbNameFor,
  defaultRegistry,
  isValidPin,
  keyFor,
  makePin,
  nameProblem,
  parseRegistry,
  type Profile,
} from "./profiles"

describe("profile storage names", () => {
  it("keeps the original database and keys for the original profile (no migration)", () => {
    expect(dbNameFor(DEFAULT_PROFILE_ID)).toBe("amtasker")
    expect(keyFor("amtasker:focus", DEFAULT_PROFILE_ID)).toBe("amtasker:focus")
  })

  it("gives every other profile its own database and keys", () => {
    expect(dbNameFor("ab12cd34")).toBe("amtasker-ab12cd34")
    expect(keyFor("amtasker:focus", "ab12cd34")).toBe("amtasker:focus@ab12cd34")
    expect(dbNameFor("a")).not.toBe(dbNameFor("b"))
  })
})

describe("registry", () => {
  it("starts with 'Me' as the only, active profile", () => {
    const reg = parseRegistry(null)
    expect(reg.profiles.map((p) => p.name)).toEqual(["Me"])
    expect(reg.activeId).toBe(DEFAULT_PROFILE_ID)
  })

  it("falls back safely from damaged data and a missing active profile", () => {
    expect(parseRegistry("{not json").profiles).toHaveLength(1)
    const reg = defaultRegistry()
    const sara: Profile = { id: "s1", name: "Sara", color: "#000", createdAt: "" }
    const parsed = parseRegistry(JSON.stringify({ profiles: [...reg.profiles, sara], activeId: "gone" }))
    expect(parsed.activeId).toBe(DEFAULT_PROFILE_ID)
    expect(parsed.profiles).toHaveLength(2)
  })

  it("rejects empty and duplicate names (case-insensitive), but allows keeping your own", () => {
    const reg = defaultRegistry()
    expect(nameProblem(reg, "  ")).toBe("Enter a name.")
    expect(nameProblem(reg, "me")).toBe("That name is already used.")
    expect(nameProblem(reg, "Me", DEFAULT_PROFILE_ID)).toBeNull()
    expect(nameProblem(reg, "Sara")).toBeNull()
  })
})

describe("PIN", () => {
  it("accepts 4–6 digits only", () => {
    expect(isValidPin("1234")).toBe(true)
    expect(isValidPin("123456")).toBe(true)
    expect(isValidPin("123")).toBe(false)
    expect(isValidPin("12a4")).toBe(false)
    expect(isValidPin("1234567")).toBe(false)
  })

  it("stores only a salted hash and checks it", async () => {
    const pin = await makePin("2468")
    expect(pin.pinHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(pin)).not.toContain("2468")
    const profile: Profile = { id: "s1", name: "Sara", color: "#000", createdAt: "", ...pin }
    expect(await checkPin(profile, "2468")).toBe(true)
    expect(await checkPin(profile, "1357")).toBe(false)
    // Same PIN, different salt → different hash.
    expect((await makePin("2468")).pinHash).not.toBe(pin.pinHash)
  })

  it("lets a profile without a PIN through", async () => {
    expect(await checkPin({ id: "a", name: "A", color: "#000", createdAt: "" }, "")).toBe(true)
  })
})
