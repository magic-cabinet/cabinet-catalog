import { Effect } from "effect"
import type { BOMItem, LayoutConfig, LayoutShape } from "./types.ts"
import { BOMError, STANDARD_WIDTHS } from "./types.ts"

// --- Constants ---

const SORTED_WIDTHS = [...STANDARD_WIDTHS].sort((a, b) => b - a)
const BLIND_CORNER_WIDTH = 36
const DEFAULT_SINK_BASE = 33

// --- Fill algorithm ---

/**
 * Fill a wall run with standard-width cabinets, largest-first greedy.
 * Returns an array of widths that sum to exactly `totalInches`.
 */
export const fillRun = (totalInches: number): number[] => {
  const result: number[] = []
  let remaining = totalInches

  while (remaining > 0) {
    const w = SORTED_WIDTHS.find((w) => w <= remaining)
    if (!w) break
    result.push(w)
    remaining -= w
  }

  return result
}

/**
 * Fill a run leaving room for a sink base centered on the run.
 * Returns { left: number[], sink: number, right: number[] }
 */
const fillRunWithSink = (
  totalInches: number,
  sinkWidth: number,
): { left: number[]; sink: number; right: number[] } => {
  const remaining = totalInches - sinkWidth
  const halfLeft = Math.floor(remaining / 2)
  const halfRight = remaining - halfLeft

  return {
    left: fillRun(halfLeft),
    sink: sinkWidth,
    right: fillRun(halfRight),
  }
}

// --- BOM Item builders ---

const baseCabinet = (width: number): BOMItem => ({
  type: "B",
  code: `B${width}`,
  description: `${width}" Base Cabinet`,
  widthInches: width,
  quantity: 1,
})

const wallCabinet = (width: number): BOMItem => ({
  type: "W",
  code: `W${width}30`,
  description: `${width}"×30" Wall Cabinet`,
  widthInches: width,
  quantity: 1,
})

const sinkBase = (width: number): BOMItem => ({
  type: "SB",
  code: `SB${width}`,
  description: `${width}" Sink Base`,
  widthInches: width,
  quantity: 1,
})

const blindCorner = (): BOMItem => ({
  type: "BBC",
  code: `BBC${BLIND_CORNER_WIDTH}`,
  description: `${BLIND_CORNER_WIDTH}" Blind Base Corner`,
  widthInches: BLIND_CORNER_WIDTH,
  quantity: 1,
})

// --- Layout generators ---

const generateLShape = (config: LayoutConfig): BOMItem[] => {
  const [longRun = 120, shortRun = 84] = config.runs
  const sw = config.sinkBaseWidth ?? DEFAULT_SINK_BASE
  const items: BOMItem[] = []

  // Corner gets a blind corner cabinet
  items.push(blindCorner())
  const cornerUsed = BLIND_CORNER_WIDTH

  // Long run: subtract corner, add sink
  const longRemaining = longRun - cornerUsed
  const sinkFill = fillRunWithSink(longRemaining, sw)
  sinkFill.left.forEach((w) => items.push(baseCabinet(w)))
  items.push(sinkBase(sw))
  sinkFill.right.forEach((w) => items.push(baseCabinet(w)))

  // Short run: subtract corner, fill with bases
  const shortRemaining = shortRun - cornerUsed
  fillRun(shortRemaining).forEach((w) => items.push(baseCabinet(w)))

  // Wall cabinets mirror base runs (excluding sink base position)
  const longWallRemaining = longRun - cornerUsed
  fillRun(longWallRemaining).forEach((w) => items.push(wallCabinet(w)))
  const shortWallRemaining = shortRun - cornerUsed
  fillRun(shortWallRemaining).forEach((w) => items.push(wallCabinet(w)))

  return items
}

const generateUShape = (config: LayoutConfig): BOMItem[] => {
  const [leftRun = 84, backRun = 120, rightRun = 84] = config.runs
  const sw = config.sinkBaseWidth ?? DEFAULT_SINK_BASE
  const items: BOMItem[] = []

  // Two corners
  items.push(blindCorner())
  items.push(blindCorner())
  const cornerUsed = BLIND_CORNER_WIDTH

  // Back run (between corners): sink centered
  const backRemaining = backRun - cornerUsed * 2
  if (backRemaining > 0) {
    const sinkFill = fillRunWithSink(backRemaining, sw)
    sinkFill.left.forEach((w) => items.push(baseCabinet(w)))
    items.push(sinkBase(sw))
    sinkFill.right.forEach((w) => items.push(baseCabinet(w)))
  }

  // Left run
  const leftRemaining = leftRun - cornerUsed
  fillRun(leftRemaining).forEach((w) => items.push(baseCabinet(w)))

  // Right run
  const rightRemaining = rightRun - cornerUsed
  fillRun(rightRemaining).forEach((w) => items.push(baseCabinet(w)))

  // Wall cabinets for back run
  if (backRemaining > 0) {
    fillRun(backRemaining).forEach((w) => items.push(wallCabinet(w)))
  }
  // Wall cabinets for side runs
  fillRun(leftRemaining).forEach((w) => items.push(wallCabinet(w)))
  fillRun(rightRemaining).forEach((w) => items.push(wallCabinet(w)))

  return items
}

const generateGalley = (config: LayoutConfig): BOMItem[] => {
  const [runA = 120, runB = 120] = config.runs
  const sw = config.sinkBaseWidth ?? DEFAULT_SINK_BASE
  const items: BOMItem[] = []

  // Run A: with sink
  const sinkFill = fillRunWithSink(runA, sw)
  sinkFill.left.forEach((w) => items.push(baseCabinet(w)))
  items.push(sinkBase(sw))
  sinkFill.right.forEach((w) => items.push(baseCabinet(w)))

  // Run B: all bases
  fillRun(runB).forEach((w) => items.push(baseCabinet(w)))

  // Walls on both runs
  fillRun(runA).forEach((w) => items.push(wallCabinet(w)))
  fillRun(runB).forEach((w) => items.push(wallCabinet(w)))

  return items
}

const generateIsland = (config: LayoutConfig): BOMItem[] => {
  const islandLength = config.islandLength ?? 48
  const items: BOMItem[] = []

  fillRun(islandLength).forEach((w) => items.push(baseCabinet(w)))

  return items
}

const GENERATORS: Record<LayoutShape, (config: LayoutConfig) => BOMItem[]> = {
  L: generateLShape,
  U: generateUShape,
  Galley: generateGalley,
  Island: generateIsland,
}

// --- Accessories ---

const addAccessories = (
  items: BOMItem[],
  config: LayoutConfig,
): BOMItem[] => {
  const totalBaseWidth = items
    .filter((i) => i.type !== "W" && i.type !== "accessory")
    .reduce((sum, i) => sum + i.widthInches * i.quantity, 0)

  // Crown molding: per linear foot of wall cabinets
  const totalWallWidth = items
    .filter((i) => i.type === "W")
    .reduce((sum, i) => sum + i.widthInches * i.quantity, 0)

  if (totalWallWidth > 0) {
    const linearFeet = Math.ceil(totalWallWidth / 12)
    // Crown molding comes in 8ft pieces
    const pieces = Math.ceil(linearFeet / 8)
    items.push({
      type: "accessory",
      code: "ACM8",
      description: '8\' Crown Molding',
      widthInches: 96,
      quantity: pieces,
    })
  }

  // Toe kick: 8ft pieces for base run
  if (totalBaseWidth > 0) {
    const linearFeet = Math.ceil(totalBaseWidth / 12)
    const pieces = Math.ceil(linearFeet / 8)
    items.push({
      type: "accessory",
      code: "TK8",
      description: '8\' Toe Kick',
      widthInches: 96,
      quantity: pieces,
    })
  }

  // End panels: 2 per layout (left and right exposed ends)
  if (config.shape !== "Island") {
    items.push({
      type: "accessory",
      code: "EP",
      description: "Base End Panel",
      widthInches: 24,
      quantity: 2,
    })
  }

  return items
}

// --- Consolidate duplicate items ---

const consolidate = (items: BOMItem[]): BOMItem[] => {
  const map = new Map<string, BOMItem>()

  for (const item of items) {
    const existing = map.get(item.code)
    if (existing) {
      map.set(item.code, { ...existing, quantity: existing.quantity + item.quantity })
    } else {
      map.set(item.code, item)
    }
  }

  return [...map.values()]
}

// --- Public API ---

/**
 * Generate a Bill of Materials from a kitchen layout configuration.
 * Returns consolidated BOM items with quantities.
 */
export const generateBOM = (
  config: LayoutConfig,
): Effect.Effect<BOMItem[], BOMError> =>
  Effect.gen(function* () {
    if (config.runs.length === 0 && config.shape !== "Island") {
      return yield* new BOMError({ message: "Layout must have at least one run" })
    }

    const generator = GENERATORS[config.shape]
    let items = generator(config)

    // Add island if present and not already an island layout
    if (config.islandLength && config.shape !== "Island") {
      items.push(...generateIsland(config))
    }

    items = addAccessories(items, config)
    return consolidate(items)
  })
