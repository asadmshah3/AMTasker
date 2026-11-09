import { describe, expect, it } from "vitest"
import { pageWidthStyle } from "./page-width"

describe("page width", () => {
  it("is the full window at 0 and the original 1280px layout at 100", () => {
    expect(pageWidthStyle(0)).toEqual({ maxWidth: "calc(1280px + (100vw - 1280px) * 1.000)", "--side": "16px" })
    expect(pageWidthStyle(100)).toEqual({ maxWidth: "calc(1280px + (100vw - 1280px) * 0.000)", "--side": "24px" })
  })

  it("moves both sides together in between, and clamps out-of-range values", () => {
    expect(pageWidthStyle(50)).toEqual({ maxWidth: "calc(1280px + (100vw - 1280px) * 0.500)", "--side": "20px" })
    expect(pageWidthStyle(150)).toEqual(pageWidthStyle(100))
    expect(pageWidthStyle(-5)).toEqual(pageWidthStyle(0))
  })
})
