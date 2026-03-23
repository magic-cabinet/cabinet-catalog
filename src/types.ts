import { Data } from "effect"

// --- Enums & Literals ---

export const MANUFACTURERS = ["21STCN", "JerseyPro"] as const
export type Manufacturer = (typeof MANUFACTURERS)[number]

export const CABINET_TYPES = [
  "B",    // Base
  "W",    // Wall
  "SB",   // Sink Base
  "DB",   // Drawer Base
  "BBC",  // Blind Base Corner
  "BLS",  // Lazy Susan
  "BMC",  // Microwave Base
  "BSR",  // Spice Rack
  "TP",   // Tall Pantry
] as const
export type CabinetType = (typeof CABINET_TYPES)[number]

export const STANDARD_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48] as const
export type StandardWidth = (typeof STANDARD_WIDTHS)[number]

/** App-facing finish names */
export const APP_FINISHES = [
  "white", "gray", "navy", "natural", "walnut",
  "sage", "espresso", "black",
] as const
export type AppFinish = (typeof APP_FINISHES)[number]

export const LAYOUT_SHAPES = ["L", "U", "Galley", "Island"] as const
export type LayoutShape = (typeof LAYOUT_SHAPES)[number]

// --- Domain Types ---

/** A resolved product from Odoo */
export interface CabinetSKU {
  readonly sku: string
  readonly name: string
  readonly manufacturer: Manufacturer
  readonly cabinetType: CabinetType
  readonly widthInches: number
  readonly finish: string
  readonly listPrice: number
  readonly cost: number
  readonly qtyAvailable: number
  readonly virtualAvailable: number
  readonly productUrl?: string
}

/** Single line in a Bill of Materials */
export interface BOMItem {
  readonly type: CabinetType | "accessory"
  readonly code: string
  readonly description: string
  readonly widthInches: number
  readonly quantity: number
}

/** Layout configuration input */
export interface LayoutConfig {
  readonly shape: LayoutShape
  /** Wall run lengths in inches, ordered. For L: [long, short]. For U: [left, back, right]. For Galley: [a, b]. */
  readonly runs: readonly number[]
  /** Optional island length in inches */
  readonly islandLength?: number
  /** Preferred sink base width (default 33) */
  readonly sinkBaseWidth?: 30 | 33
}

/** A priced BOM line with real SKU data */
export interface PricedBOMItem {
  readonly bomItem: BOMItem
  readonly sku: CabinetSKU | null
  readonly unitPrice: number
  readonly lineTotal: number
  readonly found: boolean
}

/** Quote from a single manufacturer */
export interface ManufacturerQuote {
  readonly manufacturer: Manufacturer
  readonly finish: string
  readonly items: readonly PricedBOMItem[]
  readonly foundCount: number
  readonly missingCount: number
  readonly subtotal: number
}

// --- Errors ---

export class CatalogError extends Data.TaggedError("CatalogError")<{
  message: string
}> {}

export class BOMError extends Data.TaggedError("BOMError")<{
  message: string
}> {}

export class QuoteError extends Data.TaggedError("QuoteError")<{
  message: string
}> {}
