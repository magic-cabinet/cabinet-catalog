import { test, expect, describe } from "bun:test"
import { Effect, Layer } from "effect"
import { OdooLive } from "../src/odoo.ts"
import { Catalog, CatalogLive } from "../src/catalog.ts"
import { generateQuotes } from "../src/quote.ts"
import type { LayoutConfig } from "../src/types.ts"

const ENABLED = Bun.env.ODOO_INTEGRATION === "1"

const LiveCatalog = CatalogLive.pipe(Layer.provide(OdooLive))

const run = <A>(effect: Effect.Effect<A, any, Catalog>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(LiveCatalog)))

describe.skipIf(!ENABLED)("Integration: Odoo", () => {
  test("fetches 21STCN products", async () => {
    const products = await run(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.getProducts("21STCN", "white")
      }),
    )
    expect(products.length).toBeGreaterThan(0)
    expect(products[0]!.manufacturer).toBe("21STCN")
    console.log(`Found ${products.length} 21STCN products`)
  })

  test("fetches JerseyPro White Shaker products", async () => {
    const products = await run(
      Effect.gen(function* () {
        const catalog = yield* Catalog
        return yield* catalog.getProducts("JerseyPro", "white")
      }),
    )
    expect(products.length).toBeGreaterThan(0)
    expect(products[0]!.manufacturer).toBe("JerseyPro")
    console.log(`Found ${products.length} JerseyPro products`)
  })

  test("searches for specific cabinet", async () => {
    const results = await run(
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
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0]!.sku).toContain("B24")
    console.log(`B24 price: $${results[0]!.listPrice}`)
  })

  test("generates full quotes for L-shape kitchen", async () => {
    const config: LayoutConfig = {
      shape: "L",
      runs: [120, 84],
    }
    const quotes = await run(generateQuotes(config, "white"))

    expect(quotes).toHaveLength(2)
    for (const q of quotes) {
      console.log(
        `\n${q.manufacturer} (${q.finish}): $${q.subtotal.toFixed(2)} — ${q.foundCount} found, ${q.missingCount} missing`,
      )
      for (const item of q.items) {
        const status = item.found ? item.sku!.sku : "NOT FOUND"
        console.log(
          `  ${item.bomItem.code} x${item.bomItem.quantity} → ${status} @ $${item.unitPrice}`,
        )
      }
    }
  })
})
