import { Effect, Context, Layer, HashMap, Ref } from "effect"
import { OdooClient, type OdooError } from "./odoo.ts"
import type {
  Manufacturer,
  CabinetType,
  AppFinish,
  CabinetSKU,
  CatalogError,
} from "./types.ts"
import { CatalogError as CatalogErr } from "./types.ts"

// --- Finish Mapping ---

/** Maps app finish names to Odoo search terms per manufacturer */
const FINISH_MAP: Record<Manufacturer, Partial<Record<AppFinish, string>>> = {
  "21STCN": {
    // 21st Century only has painted white — all finishes map to the single line
    white: "",
    gray: "",
    navy: "",
    natural: "",
    walnut: "",
    sage: "",
    espresso: "",
    black: "",
  },
  JerseyPro: {
    white: "White Shaker",
    gray: "Light Grey",
    navy: "Ocean Blue",
    natural: "Natural Box",
    walnut: "Maple Walnut",
    sage: "Roma Clay",
    espresso: "Espresso Shaker",
    black: "Black Shaker",
  },
}

/** Resolve the Odoo finish search term for a manufacturer + app finish */
export const resolveFinish = (
  manufacturer: Manufacturer,
  finish: AppFinish,
): string | null => {
  const map = FINISH_MAP[manufacturer]
  if (!(finish in map)) return null
  return map[finish] ?? ""
}

// --- SKU Prefix ---

const SKU_PREFIX: Record<Manufacturer, string> = {
  "21STCN": "21STCN-AL-",
  JerseyPro: "JerseyPro- ",
}

// --- Parse cabinet type from SKU ---

const TYPE_PREFIXES: readonly (readonly [CabinetType, string])[] = [
  ["BBC", "BBC"],
  ["BLS", "BLS"],
  ["BMC", "BMC"],
  ["BSR", "BSR"],
  ["SB", "SB"],
  ["DB", "DB"],
  ["TP", "TP"],
  ["B", "B"],
  ["W", "W"],
]

const parseCabinetType = (typeCode: string): CabinetType | null => {
  for (const [type, prefix] of TYPE_PREFIXES) {
    if (typeCode.startsWith(prefix)) return type
  }
  return null
}

const parseWidth = (typeCode: string): number => {
  const match = typeCode.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

// --- Catalog Service ---

export class Catalog extends Context.Tag("Catalog")<
  Catalog,
  {
    /** Search for cabinet SKUs by manufacturer, finish, and optional type/size filters */
    readonly search: (params: {
      manufacturer: Manufacturer
      finish: AppFinish
      cabinetType?: CabinetType
      widthInches?: number
    }) => Effect.Effect<CabinetSKU[], CatalogErr | OdooError>

    /** Look up a specific SKU by code */
    readonly findBySku: (
      sku: string,
    ) => Effect.Effect<CabinetSKU | null, CatalogErr | OdooError>

    /** Get all products for a manufacturer + finish (cached) */
    readonly getProducts: (
      manufacturer: Manufacturer,
      finish: AppFinish,
    ) => Effect.Effect<CabinetSKU[], CatalogErr | OdooError>
  }
>() {}

/** Build an Odoo domain filter for searching products */
const buildDomain = (
  manufacturer: Manufacturer,
  finish: AppFinish,
): Effect.Effect<unknown[], CatalogErr> =>
  Effect.gen(function* () {
    const finishTerm = resolveFinish(manufacturer, finish)
    if (finishTerm === null) {
      return yield* new CatalogErr({
        message: `No finish mapping for ${manufacturer} / ${finish}`,
      })
    }

    const domain: unknown[] = []

    if (manufacturer === "21STCN") {
      domain.push(["default_code", "=like", "21STCN-AL-%"])
    } else {
      // JerseyPro SKUs: "JerseyPro- {TYPE} - {FINISH}"
      domain.push(["default_code", "=like", `JerseyPro- %`])
      if (finishTerm) {
        domain.push(["default_code", "=like", `% - ${finishTerm}`])
      }
    }

    return domain
  })

const PRODUCT_FIELDS = [
  "name",
  "default_code",
  "list_price",
  "standard_price",
  "categ_id",
  "qty_available",
  "virtual_available",
  "x_PRODUCTURL",
  "weight",
] as const

/** Parse a raw Odoo product record into a CabinetSKU */
const parseProduct = (
  manufacturer: Manufacturer,
  raw: Record<string, any>,
): CabinetSKU | null => {
  const sku = raw.default_code as string
  if (!sku) return null

  const prefix = SKU_PREFIX[manufacturer]
  if (!sku.startsWith(prefix)) return null

  let typeCode: string
  let finish: string

  if (manufacturer === "21STCN") {
    typeCode = sku.slice(prefix.length)
    finish = "Painted White"
  } else {
    // JerseyPro: "JerseyPro- W1230 - White Shaker"
    const parts = sku.slice("JerseyPro- ".length).split(" - ")
    typeCode = parts[0] ?? ""
    finish = parts[1] ?? ""
  }

  const cabinetType = parseCabinetType(typeCode)
  if (!cabinetType) return null

  const widthInches = parseWidth(typeCode)

  return {
    sku,
    name: raw.name ?? sku,
    manufacturer,
    cabinetType,
    widthInches,
    finish,
    listPrice: raw.list_price ?? 0,
    cost: raw.standard_price ?? 0,
    qtyAvailable: raw.qty_available ?? 0,
    virtualAvailable: raw.virtual_available ?? 0,
    productUrl: raw.x_PRODUCTURL || undefined,
  }
}

type CacheKey = `${Manufacturer}:${AppFinish}`

export const CatalogLive = Layer.effect(
  Catalog,
  Effect.gen(function* () {
    const odoo = yield* OdooClient
    const cache = yield* Ref.make(HashMap.empty<CacheKey, CabinetSKU[]>())

    const fetchProducts = (
      manufacturer: Manufacturer,
      finish: AppFinish,
    ): Effect.Effect<CabinetSKU[], CatalogErr | OdooError> =>
      Effect.gen(function* () {
        const key: CacheKey = `${manufacturer}:${finish}`
        const cached = HashMap.get(yield* Ref.get(cache), key)
        if (cached._tag === "Some") return cached.value

        const domain = yield* buildDomain(manufacturer, finish)
        const results: Record<string, any>[] = yield* odoo.call(
          "product.product",
          "search_read",
          [domain],
          { fields: [...PRODUCT_FIELDS], limit: 500 },
        )

        const products = results
          .map((r) => parseProduct(manufacturer, r))
          .filter((p): p is CabinetSKU => p !== null)

        yield* Ref.update(cache, HashMap.set(key, products))
        yield* Effect.log(
          `Cached ${products.length} products for ${manufacturer}/${finish}`,
        )

        return products
      })

    return {
      getProducts: fetchProducts,

      search: (params) =>
        Effect.gen(function* () {
          const products = yield* fetchProducts(
            params.manufacturer,
            params.finish,
          )
          return products.filter((p) => {
            if (params.cabinetType && p.cabinetType !== params.cabinetType)
              return false
            if (params.widthInches && p.widthInches !== params.widthInches)
              return false
            return true
          })
        }),

      findBySku: (sku) =>
        Effect.gen(function* () {
          const results: Record<string, any>[] = yield* odoo.call(
            "product.product",
            "search_read",
            [[["default_code", "=", sku]]],
            { fields: [...PRODUCT_FIELDS], limit: 1 },
          )
          if (results.length === 0) return null
          const manufacturer: Manufacturer = sku.startsWith("21STCN")
            ? "21STCN"
            : "JerseyPro"
          return parseProduct(manufacturer, results[0]!) ?? null
        }),
    }
  }),
)
