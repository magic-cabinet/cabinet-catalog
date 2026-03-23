// Odoo client
export { OdooClient, OdooConfig, OdooConfigFromEnv, OdooClientLive, OdooLive, OdooError } from "./odoo.ts"

// Types
export type {
  Manufacturer,
  CabinetType,
  AppFinish,
  LayoutShape,
  StandardWidth,
  CabinetSKU,
  BOMItem,
  LayoutConfig,
  PricedBOMItem,
  ManufacturerQuote,
} from "./types.ts"
export {
  MANUFACTURERS,
  CABINET_TYPES,
  APP_FINISHES,
  STANDARD_WIDTHS,
  LAYOUT_SHAPES,
  CatalogError,
  BOMError,
  QuoteError,
} from "./types.ts"

// Catalog
export { Catalog, CatalogLive, resolveFinish } from "./catalog.ts"

// BOM
export { generateBOM, fillRun } from "./bom.ts"

// Quote
export { generateQuotes, generateQuote } from "./quote.ts"
