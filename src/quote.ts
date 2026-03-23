import { Effect } from "effect"
import { Catalog } from "./catalog.ts"
import { generateBOM } from "./bom.ts"
import type {
  AppFinish,
  BOMItem,
  CabinetSKU,
  LayoutConfig,
  Manufacturer,
  ManufacturerQuote,
  PricedBOMItem,
} from "./types.ts"
import { MANUFACTURERS, QuoteError } from "./types.ts"
import type { OdooError } from "./odoo.ts"
import type { BOMError, CatalogError } from "./types.ts"

// --- SKU Matching ---

/**
 * Map a BOM item code to an Odoo search.
 * 21STCN uses flat codes: B24, W2430, SB33
 * JerseyPro uses same codes with finish suffix
 */
const findMatchingSKU = (
  products: readonly CabinetSKU[],
  item: BOMItem,
): CabinetSKU | null => {
  if (item.type === "accessory") {
    // Accessories: match by code prefix
    return (
      products.find((p) => p.sku.includes(item.code)) ?? null
    )
  }

  // Match by cabinet type + width
  return (
    products.find(
      (p) =>
        p.cabinetType === item.type && p.widthInches === item.widthInches,
    ) ?? null
  )
}

// --- Price a BOM against a product catalog ---

const priceBOM = (
  items: readonly BOMItem[],
  products: readonly CabinetSKU[],
): PricedBOMItem[] =>
  items.map((bomItem) => {
    const sku = findMatchingSKU(products, bomItem)
    const unitPrice = sku?.listPrice ?? 0
    return {
      bomItem,
      sku,
      unitPrice,
      lineTotal: unitPrice * bomItem.quantity,
      found: sku !== null,
    }
  })

// --- Public API ---

/**
 * Generate quotes from all manufacturers for a given layout and finish.
 * Returns one ManufacturerQuote per manufacturer.
 */
export const generateQuotes = (
  config: LayoutConfig,
  finish: AppFinish,
): Effect.Effect<
  ManufacturerQuote[],
  QuoteError | BOMError | CatalogError | OdooError,
  Catalog
> =>
  Effect.gen(function* () {
    const catalog = yield* Catalog
    const bom = yield* generateBOM(config)

    const quotes: ManufacturerQuote[] = []

    for (const manufacturer of MANUFACTURERS) {
      const products = yield* catalog.getProducts(manufacturer, finish)

      const pricedItems = priceBOM(bom, products)
      const foundCount = pricedItems.filter((i) => i.found).length
      const missingCount = pricedItems.filter((i) => !i.found).length
      const subtotal = pricedItems.reduce((sum, i) => sum + i.lineTotal, 0)

      // Resolve the display finish name
      const finishDisplay =
        manufacturer === "21STCN"
          ? "Painted White"
          : products[0]?.finish ?? finish

      quotes.push({
        manufacturer,
        finish: finishDisplay,
        items: pricedItems,
        foundCount,
        missingCount,
        subtotal,
      })
    }

    return quotes
  })

/**
 * Generate a quote for a single manufacturer.
 */
export const generateQuote = (
  config: LayoutConfig,
  finish: AppFinish,
  manufacturer: Manufacturer,
): Effect.Effect<
  ManufacturerQuote,
  QuoteError | BOMError | CatalogError | OdooError,
  Catalog
> =>
  Effect.gen(function* () {
    const catalog = yield* Catalog
    const bom = yield* generateBOM(config)
    const products = yield* catalog.getProducts(manufacturer, finish)

    const pricedItems = priceBOM(bom, products)
    const foundCount = pricedItems.filter((i) => i.found).length
    const missingCount = pricedItems.filter((i) => !i.found).length
    const subtotal = pricedItems.reduce((sum, i) => sum + i.lineTotal, 0)

    const finishDisplay =
      manufacturer === "21STCN"
        ? "Painted White"
        : products[0]?.finish ?? finish

    return {
      manufacturer,
      finish: finishDisplay,
      items: pricedItems,
      foundCount,
      missingCount,
      subtotal,
    }
  })
