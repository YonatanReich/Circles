export interface RingLayoutInput {
  key: string
  count: number
}

export interface RingLayout {
  key: string
  /** Centre-line radius — the SVG circle's `r`. */
  radius: number
  /** Painted width — the SVG circle's `stroke-width`, one hairline short of the slot. */
  thickness: number
  /** Full width of the band's slot, separator included. */
  slot: number
  /** 0 at the innermost ring, 1 at the outermost. Drives the colour ramp. */
  depth: number
}

export interface LayoutOptions {
  innerRadius: number
  outerRadius: number
  /** Hairline of background left between adjacent bands. */
  separator: number
  /** No band may be painted thinner than this. */
  minBand: number
  /** Share given to a ring holding nothing, relative to sqrt(count). */
  emptyWeight: number
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  innerRadius: 74,
  outerRadius: 300,
  separator: 2,
  minBand: 9,
  emptyWeight: 0.4,
}

/**
 * Splits `budget` in proportion to `weights`, never dropping below `min`.
 *
 * Clamping one band to the floor steals from the rest, which can push another
 * below the floor in turn, so it iterates until the set of floored bands stops
 * changing.
 */
function distribute(weights: number[], budget: number, min: number): number[] {
  const n = weights.length
  if (n === 0) return []
  // More bands than the budget can seat: share it out flat and let them be thin.
  if (min * n >= budget) return weights.map(() => budget / n)

  const out = new Array<number>(n).fill(0)
  const floored = new Array<boolean>(n).fill(false)

  for (let pass = 0; pass < n + 1; pass++) {
    let usedByFloored = 0
    let freeWeight = 0
    for (let i = 0; i < n; i++) {
      if (floored[i]) usedByFloored += min
      else freeWeight += weights[i]
    }
    const freeBudget = budget - usedByFloored

    let changed = false
    for (let i = 0; i < n; i++) {
      if (floored[i]) {
        out[i] = min
        continue
      }
      const share = freeWeight > 0 ? (weights[i] / freeWeight) * freeBudget : freeBudget
      if (share < min) {
        floored[i] = true
        changed = true
      }
      out[i] = Math.max(share, min)
    }
    if (!changed) break
  }
  return out
}

/**
 * Solid bands filling the whole disc, sized by task count.
 *
 * Count maps through a square root so a 16-task ring is four times a 1-task
 * ring rather than sixteen times it. Because the bands tile the radius with no
 * space left over, a band's width reads as its share of the workload; each is
 * painted one hairline short of its slot so neighbours stay countable.
 */
export function layoutRings(rings: RingLayoutInput[], opts: LayoutOptions = DEFAULT_LAYOUT): RingLayout[] {
  const n = rings.length
  if (n === 0) return []

  const budget = Math.max(0, opts.outerRadius - opts.innerRadius)
  const weights = rings.map((r) => (r.count === 0 ? opts.emptyWeight : Math.sqrt(r.count)))
  const slots = distribute(weights, budget, opts.minBand)

  const out: RingLayout[] = []
  let edge = opts.innerRadius
  for (let i = 0; i < n; i++) {
    const slot = slots[i]
    out.push({
      key: rings[i].key,
      radius: edge + slot / 2,
      thickness: Math.max(1, slot - opts.separator),
      slot,
      depth: n === 1 ? 0 : i / (n - 1),
    })
    edge += slot
  }
  return out
}

/** Filtered-out rings fade to this rather than disappearing, so the shape holds still. */
const DIM_ALPHA = 0.22

/**
 * The ring colour ramp: near rings are bright and slightly warm, far rings dim
 * and cool. One hue sweep rather than a colour per ring, so distance is the
 * only thing colour encodes.
 */
export function ringColor(depth: number, dimmed = false): string {
  // A wide swing, because these are now solid areas rather than thin rims: a
  // far band covers far more pixels than a near one, so it has to go
  // considerably darker and greyer to stop the horizon dominating today.
  const l = 0.8 - 0.42 * depth
  const c = 0.125 - 0.08 * depth
  const h = 228 + 44 * depth
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / ${dimmed ? DIM_ALPHA : 1})`
}

/** The recurring half. Flat gold at every depth — it encodes kind, not distance. */
export function goldColor(dimmed = false): string {
  return `oklch(0.8 0.13 88 / ${dimmed ? DIM_ALPHA : 1})`
}

/** Late work. Red at any depth, because it is always the innermost band. */
export function overdueColor(dimmed = false): string {
  return `oklch(0.66 0.19 25 / ${dimmed ? DIM_ALPHA : 1})`
}
