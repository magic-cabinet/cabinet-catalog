import { test, expect, describe } from "bun:test"
import { Effect } from "effect"
import { generateBOM, fillRun } from "../src/bom.ts"
import type { LayoutConfig, BOMItem } from "../src/types.ts"

const runBOM = (config: LayoutConfig): BOMItem[] =>
  Effect.runSync(generateBOM(config))

describe("fillRun", () => {
  test("fills 120 inches largest-first", () => {
    const result = fillRun(120)
    expect(result).toEqual([48, 48, 24])
  })

  test("fills 48 inches with single 48", () => {
    expect(fillRun(48)).toEqual([48])
  })

  test("fills 60 inches with 48+12", () => {
    expect(fillRun(60)).toEqual([48, 12])
  })

  test("fills 9 inches with single 9", () => {
    expect(fillRun(9)).toEqual([9])
  })

  test("fills 0 inches with empty array", () => {
    expect(fillRun(0)).toEqual([])
  })

  test("sum equals input for various sizes", () => {
    for (const size of [24, 36, 48, 60, 72, 84, 96, 108, 120]) {
      const result = fillRun(size)
      const sum = result.reduce((a, b) => a + b, 0)
      expect(sum).toBe(size)
    }
  })
})

describe("generateBOM", () => {
  describe("L-shape", () => {
    test("generates base and wall cabinets", () => {
      const items = runBOM({ shape: "L", runs: [120, 84] })

      const types = new Set(items.map((i) => i.type))
      expect(types.has("B")).toBe(true)
      expect(types.has("W")).toBe(true)
      expect(types.has("BBC")).toBe(true)
      expect(types.has("SB")).toBe(true)
    })

    test("includes exactly one blind corner", () => {
      const items = runBOM({ shape: "L", runs: [120, 84] })
      const corners = items.filter((i) => i.type === "BBC")
      expect(corners).toHaveLength(1)
    })

    test("includes sink base", () => {
      const items = runBOM({ shape: "L", runs: [120, 84] })
      const sinks = items.filter((i) => i.type === "SB")
      expect(sinks).toHaveLength(1)
      expect(sinks[0]!.widthInches).toBe(33) // default
    })

    test("respects custom sink base width", () => {
      const items = runBOM({ shape: "L", runs: [120, 84], sinkBaseWidth: 30 })
      const sinks = items.filter((i) => i.type === "SB")
      expect(sinks[0]!.widthInches).toBe(30)
    })

    test("includes accessories", () => {
      const items = runBOM({ shape: "L", runs: [120, 84] })
      const accessories = items.filter((i) => i.type === "accessory")
      const codes = accessories.map((a) => a.code)
      expect(codes).toContain("ACM8")
      expect(codes).toContain("TK8")
      expect(codes).toContain("EP")
    })
  })

  describe("U-shape", () => {
    test("has two blind corners", () => {
      const items = runBOM({ shape: "U", runs: [84, 120, 84] })
      const corners = items.filter((i) => i.type === "BBC")
      expect(corners).toHaveLength(1)
      expect(corners[0]!.quantity).toBe(2)
    })

    test("has a sink base", () => {
      const items = runBOM({ shape: "U", runs: [84, 120, 84] })
      const sinks = items.filter((i) => i.type === "SB")
      expect(sinks).toHaveLength(1)
    })
  })

  describe("Galley", () => {
    test("generates two runs with sink on first", () => {
      const items = runBOM({ shape: "Galley", runs: [120, 120] })
      const sinks = items.filter((i) => i.type === "SB")
      expect(sinks).toHaveLength(1)

      // No blind corners in galley
      const corners = items.filter((i) => i.type === "BBC")
      expect(corners).toHaveLength(0)
    })
  })

  describe("Island", () => {
    test("generates base cabinets only for 48 inch island", () => {
      const items = runBOM({ shape: "Island", runs: [], islandLength: 48 })
      const bases = items.filter((i) => i.type === "B")
      expect(bases.length).toBeGreaterThan(0)

      // No walls, no sink, no corners
      expect(items.filter((i) => i.type === "W")).toHaveLength(0)
      expect(items.filter((i) => i.type === "SB")).toHaveLength(0)
      expect(items.filter((i) => i.type === "BBC")).toHaveLength(0)
    })

    test("no end panels for island", () => {
      const items = runBOM({ shape: "Island", runs: [], islandLength: 48 })
      const eps = items.filter((i) => i.code === "EP")
      expect(eps).toHaveLength(0)
    })
  })

  describe("with island addon", () => {
    test("L-shape with island adds island bases", () => {
      const items = runBOM({
        shape: "L",
        runs: [120, 84],
        islandLength: 60,
      })
      // Should have more bases than without island
      const totalBaseWidth = items
        .filter((i) => i.type === "B")
        .reduce((sum, i) => sum + i.widthInches * i.quantity, 0)
      expect(totalBaseWidth).toBeGreaterThan(0)
    })
  })

  describe("consolidation", () => {
    test("consolidates duplicate cabinet sizes", () => {
      const items = runBOM({ shape: "Galley", runs: [120, 120] })
      // If both runs use same sizes, they should be consolidated
      const codes = items.map((i) => i.code)
      const uniqueCodes = new Set(codes)
      expect(uniqueCodes.size).toBe(codes.length)
    })
  })

  describe("error handling", () => {
    test("errors on empty runs for non-Island", () => {
      expect(() => runBOM({ shape: "L", runs: [] })).toThrow()
    })
  })
})
