import { test, expect, describe } from "bun:test"
import { Effect, Layer } from "effect"
import { Catalog, CatalogLive, resolveFinish } from "../src/catalog.ts"
import { OdooClient } from "../src/odoo.ts"
import type { AppFinish, Manufacturer } from "../src/types.ts"

// --- Mock Odoo products ---

const MOCK_21STCN_PRODUCTS = [
  { name: "Base 24", default_code: "21STCN-AL-B24", list_price: 285, standard_price: 142, qty_available: 10, virtual_available: 15 },
  { name: "Base 30", default_code: "21STCN-AL-B30", list_price: 361, standard_price: 180, qty_available: 5, virtual_available: 8 },
  { name: "Wall 3030", default_code: "21STCN-AL-W3030", list_price: 250, standard_price: 125, qty_available: 7, virtual_available: 10 },
  { name: "Sink Base 33", default_code: "21STCN-AL-SB33", list_price: 320, standard_price: 160, qty_available: 3, virtual_available: 5 },
  { name: "Blind Corner 36", default_code: "21STCN-AL-BBC36", list_price: 400, standard_price: 200, qty_available: 2, virtual_available: 4 },
  { name: "Crown Molding", default_code: "21STCN-AL-ACM8-2", list_price: 92, standard_price: 46, qty_available: 20, virtual_available: 25 },
]

const MOCK_JERSEYPRO_PRODUCTS = [
  { name: "Base 24 White", default_code: "JerseyPro- B24 - White Shaker", list_price: 349, standard_price: 174, qty_available: 8, virtual_available: 12 },
  { name: "Base 30 White", default_code: "JerseyPro- B30 - White Shaker", list_price: 410, standard_price: 205, qty_available: 4, virtual_available: 6 },
  { name: "Wall 3030 White", default_code: "JerseyPro- W3030 - White Shaker", list_price: 300, standard_price: 150, qty_available: 5, virtual_available: 8 },
  { name: "Sink Base 33 White", default_code: "JerseyPro- SB33 - White Shaker", list_price: 380, standard_price: 190, qty_available: 2, virtual_available: 4 },
]

// --- Mock OdooClient layer ---

const MockOdooClient = Layer.succeed(OdooClient, {
  uid: 1,
  call: (model, method, args, kwargs) =>
    Effect.gen(function* () {
      const domain = args[0] as unknown[][]
      const skuFilter = domain.find((d) => d[0] === "default_code")?.[2] as string

      if (skuFilter?.startsWith("21STCN")) {
        return MOCK_21STCN_PRODUCTS
      }
      if (skuFilter?.startsWith("JerseyPro")) {
        return MOCK_JERSEYPRO_PRODUCTS
      }
      return []
    }),
})

const TestCatalog = CatalogLive.pipe(Layer.provide(MockOdooClient))

const runCatalog = <A>(
  effect: Effect.Effect<A, any, Catalog>,
): A =>
  Effect.runSync(effect.pipe(Effect.provide(TestCatalog)))

// --- Tests ---

describe("resolveFinish", () => {
  test("21STCN always returns empty string (single finish)", () => {
    expect(resolveFinish("21STCN", "white")).toBe("")
    expect(resolveFinish("21STCN", "espresso")).toBe("")
    expect(resolveFinish("21STCN", "black")).toBe("")
  })

  test("JerseyPro maps to correct finish names", () => {
    expect(resolveFinish("JerseyPro", "white")).toBe("White Shaker")
    expect(resolveFinish("JerseyPro", "black")).toBe("Black Shaker")
    expect(resolveFinish("JerseyPro", "espresso")).toBe("Espresso Shaker")
    expect(resolveFinish("JerseyPro", "gray")).toBe("Light Grey")
    expect(resolveFinish("JerseyPro", "navy")).toBe("Ocean Blue")
    expect(resolveFinish("JerseyPro", "natural")).toBe("Natural Box")
    expect(resolveFinish("JerseyPro", "walnut")).toBe("Maple Walnut")
    expect(resolveFinish("JerseyPro", "sage")).toBe("Roma Clay")
  })
})

describe("Catalog.getProducts", () => {
  test("returns 21STCN products", () => {
    const products = runCatalog(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.getProducts("21STCN", "white")
      }),
    )
    // Crown molding (ACM8-2) doesn't parse as a cabinet type, so 5 not 6
    expect(products.length).toBe(5)
    expect(products[0]!.manufacturer).toBe("21STCN")
  })

  test("returns JerseyPro products", () => {
    const products = runCatalog(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.getProducts("JerseyPro", "white")
      }),
    )
    expect(products.length).toBe(MOCK_JERSEYPRO_PRODUCTS.length)
    expect(products[0]!.manufacturer).toBe("JerseyPro")
  })

  test("caches results on second call", () => {
    let callCount = 0
    const CountingOdoo = Layer.succeed(OdooClient, {
      uid: 1,
      call: () =>
        Effect.sync(() => {
          callCount++
          return MOCK_21STCN_PRODUCTS
        }),
    })
    const CountingCatalog = CatalogLive.pipe(Layer.provide(CountingOdoo))

    Effect.runSync(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        yield* catalog.getProducts("21STCN", "white")
        yield* catalog.getProducts("21STCN", "white")
      }).pipe(Effect.provide(CountingCatalog)),
    )

    expect(callCount).toBe(1)
  })
})

describe("Catalog.search", () => {
  test("filters by cabinet type", () => {
    const results = runCatalog(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.search({
          manufacturer: "21STCN",
          finish: "white",
          cabinetType: "B",
        })
      }),
    )
    expect(results.every((r) => r.cabinetType === "B")).toBe(true)
  })

  test("filters by width", () => {
    const results = runCatalog(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.search({
          manufacturer: "21STCN",
          finish: "white",
          widthInches: 24,
        })
      }),
    )
    expect(results.every((r) => r.widthInches === 24)).toBe(true)
  })

  test("filters by type and width", () => {
    const results = runCatalog(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.search({
          manufacturer: "21STCN",
          finish: "white",
          cabinetType: "B",
          widthInches: 24,
        })
      }),
    )
    expect(results).toHaveLength(1)
    expect(results[0]!.sku).toBe("21STCN-AL-B24")
  })
})

describe("SKU parsing", () => {
  test("parses 21STCN SKU correctly", () => {
    const products = runCatalog(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.getProducts("21STCN", "white")
      }),
    )
    const b24 = products.find((p) => p.sku === "21STCN-AL-B24")!
    expect(b24.cabinetType).toBe("B")
    expect(b24.widthInches).toBe(24)
    expect(b24.listPrice).toBe(285)
    expect(b24.finish).toBe("Painted White")
  })

  test("parses JerseyPro SKU correctly", () => {
    const products = runCatalog(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.getProducts("JerseyPro", "white")
      }),
    )
    const b24 = products.find((p) => p.sku === "JerseyPro- B24 - White Shaker")!
    expect(b24.cabinetType).toBe("B")
    expect(b24.widthInches).toBe(24)
    expect(b24.listPrice).toBe(349)
    expect(b24.finish).toBe("White Shaker")
  })

  test("parses blind corner type", () => {
    const products = runCatalog(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.getProducts("21STCN", "white")
      }),
    )
    const bbc = products.find((p) => p.cabinetType === "BBC")!
    expect(bbc.sku).toBe("21STCN-AL-BBC36")
    expect(bbc.widthInches).toBe(36)
  })
})
