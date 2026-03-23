import { test, expect, describe } from "bun:test"
import { Effect, Layer } from "effect"
import { Catalog } from "../src/catalog.ts"
import { generateQuotes, generateQuote } from "../src/quote.ts"
import type { CabinetSKU, LayoutConfig, ManufacturerQuote } from "../src/types.ts"

// --- Mock catalog with known products ---

const MOCK_PRODUCTS: Record<string, CabinetSKU[]> = {
  "21STCN": [
    { sku: "21STCN-AL-B24", name: "Base 24", manufacturer: "21STCN", cabinetType: "B", widthInches: 24, finish: "Painted White", listPrice: 285, cost: 142, qtyAvailable: 10, virtualAvailable: 15 },
    { sku: "21STCN-AL-B36", name: "Base 36", manufacturer: "21STCN", cabinetType: "B", widthInches: 36, finish: "Painted White", listPrice: 407, cost: 203, qtyAvailable: 5, virtualAvailable: 8 },
    { sku: "21STCN-AL-SB33", name: "Sink Base 33", manufacturer: "21STCN", cabinetType: "SB", widthInches: 33, finish: "Painted White", listPrice: 320, cost: 160, qtyAvailable: 3, virtualAvailable: 5 },
    { sku: "21STCN-AL-BBC36", name: "Blind Corner 36", manufacturer: "21STCN", cabinetType: "BBC", widthInches: 36, finish: "Painted White", listPrice: 400, cost: 200, qtyAvailable: 2, virtualAvailable: 4 },
    { sku: "21STCN-AL-W3630", name: "Wall 36x30", manufacturer: "21STCN", cabinetType: "W", widthInches: 36, finish: "Painted White", listPrice: 280, cost: 140, qtyAvailable: 7, virtualAvailable: 10 },
    { sku: "21STCN-AL-W2430", name: "Wall 24x30", manufacturer: "21STCN", cabinetType: "W", widthInches: 24, finish: "Painted White", listPrice: 220, cost: 110, qtyAvailable: 6, virtualAvailable: 9 },
  ],
  JerseyPro: [
    { sku: "JerseyPro- B24 - White Shaker", name: "Base 24 White", manufacturer: "JerseyPro", cabinetType: "B", widthInches: 24, finish: "White Shaker", listPrice: 349, cost: 174, qtyAvailable: 8, virtualAvailable: 12 },
    { sku: "JerseyPro- B36 - White Shaker", name: "Base 36 White", manufacturer: "JerseyPro", cabinetType: "B", widthInches: 36, finish: "White Shaker", listPrice: 480, cost: 240, qtyAvailable: 4, virtualAvailable: 6 },
    { sku: "JerseyPro- SB33 - White Shaker", name: "Sink Base 33 White", manufacturer: "JerseyPro", cabinetType: "SB", widthInches: 33, finish: "White Shaker", listPrice: 380, cost: 190, qtyAvailable: 2, virtualAvailable: 4 },
    { sku: "JerseyPro- BBC36 - White Shaker", name: "Blind Corner White", manufacturer: "JerseyPro", cabinetType: "BBC", widthInches: 36, finish: "White Shaker", listPrice: 450, cost: 225, qtyAvailable: 1, virtualAvailable: 3 },
    { sku: "JerseyPro- W3630 - White Shaker", name: "Wall 36 White", manufacturer: "JerseyPro", cabinetType: "W", widthInches: 36, finish: "White Shaker", listPrice: 340, cost: 170, qtyAvailable: 5, virtualAvailable: 8 },
    { sku: "JerseyPro- W2430 - White Shaker", name: "Wall 24 White", manufacturer: "JerseyPro", cabinetType: "W", widthInches: 24, finish: "White Shaker", listPrice: 270, cost: 135, qtyAvailable: 6, virtualAvailable: 9 },
  ],
}

const MockCatalog = Layer.succeed(Catalog, {
  getProducts: (manufacturer, _finish) =>
    Effect.succeed(MOCK_PRODUCTS[manufacturer] ?? []),
  search: (params) =>
    Effect.succeed(
      (MOCK_PRODUCTS[params.manufacturer] ?? []).filter((p) => {
        if (params.cabinetType && p.cabinetType !== params.cabinetType) return false
        if (params.widthInches && p.widthInches !== params.widthInches) return false
        return true
      }),
    ),
  findBySku: (sku) =>
    Effect.succeed(
      Object.values(MOCK_PRODUCTS)
        .flat()
        .find((p) => p.sku === sku) ?? null,
    ),
})

const runQuote = <A>(effect: Effect.Effect<A, any, Catalog>): A =>
  Effect.runSync(effect.pipe(Effect.provide(MockCatalog)))

// --- Tests ---

describe("generateQuotes", () => {
  const config: LayoutConfig = {
    shape: "Galley",
    runs: [120, 120],
  }

  test("returns quotes for both manufacturers", () => {
    const quotes = runQuote(generateQuotes(config, "white"))
    expect(quotes).toHaveLength(2)
    expect(quotes[0]!.manufacturer).toBe("21STCN")
    expect(quotes[1]!.manufacturer).toBe("JerseyPro")
  })

  test("each quote has priced items", () => {
    const quotes = runQuote(generateQuotes(config, "white"))
    for (const q of quotes) {
      expect(q.items.length).toBeGreaterThan(0)
    }
  })

  test("subtotal is sum of line totals", () => {
    const quotes = runQuote(generateQuotes(config, "white"))
    for (const q of quotes) {
      const computed = q.items.reduce((sum, i) => sum + i.lineTotal, 0)
      expect(q.subtotal).toBe(computed)
    }
  })

  test("found + missing equals total items", () => {
    const quotes = runQuote(generateQuotes(config, "white"))
    for (const q of quotes) {
      expect(q.foundCount + q.missingCount).toBe(q.items.length)
    }
  })

  test("found items have SKU and price", () => {
    const quotes = runQuote(generateQuotes(config, "white"))
    for (const q of quotes) {
      for (const item of q.items) {
        if (item.found) {
          expect(item.sku).not.toBeNull()
          expect(item.unitPrice).toBeGreaterThan(0)
        }
      }
    }
  })

  test("missing items have zero price", () => {
    const quotes = runQuote(generateQuotes(config, "white"))
    for (const q of quotes) {
      for (const item of q.items) {
        if (!item.found) {
          expect(item.unitPrice).toBe(0)
          expect(item.lineTotal).toBe(0)
        }
      }
    }
  })
})

describe("generateQuote (single manufacturer)", () => {
  const config: LayoutConfig = {
    shape: "L",
    runs: [120, 84],
  }

  test("returns quote for specified manufacturer", () => {
    const quote = runQuote(generateQuote(config, "white", "JerseyPro"))
    expect(quote.manufacturer).toBe("JerseyPro")
    expect(quote.finish).toBe("White Shaker")
  })

  test("21STCN quote shows Painted White finish", () => {
    const quote = runQuote(generateQuote(config, "white", "21STCN"))
    expect(quote.finish).toBe("Painted White")
  })
})

describe("quote with island layout", () => {
  test("island only has base cabinets", () => {
    const config: LayoutConfig = {
      shape: "Island",
      runs: [],
      islandLength: 48,
    }
    const quotes = runQuote(generateQuotes(config, "white"))
    for (const q of quotes) {
      // All BOM items should be bases or accessories
      for (const item of q.items) {
        expect(["B", "accessory"]).toContain(item.bomItem.type)
      }
    }
  })
})
