import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, goldColor, layoutRings, overdueColor, ringColor } from './geometry'

const opts = DEFAULT_LAYOUT
const budget = opts.outerRadius - opts.innerRadius

// The slot is the band's share of the radius; the painted stroke is one
// separator narrower, which is what leaves the hairline between bands.
const slotInner = (r: { radius: number; slot: number }) => r.radius - r.slot / 2
const slotOuter = (r: { radius: number; slot: number }) => r.radius + r.slot / 2

describe('layoutRings', () => {
  it('tiles the whole radial budget with no space left over', () => {
    const out = layoutRings([
      { key: 'a', count: 3 },
      { key: 'b', count: 0 },
      { key: 'c', count: 9 },
    ])
    expect(slotInner(out[0])).toBeCloseTo(opts.innerRadius, 6)
    expect(slotOuter(out[out.length - 1])).toBeCloseTo(opts.outerRadius, 6)
    const total = out.reduce((a, r) => a + r.slot, 0)
    expect(total).toBeCloseTo(budget, 6)
  })

  it('butts every band against its neighbour', () => {
    const out = layoutRings(Array.from({ length: 9 }, (_, i) => ({ key: `r${i}`, count: i })))
    for (let i = 1; i < out.length; i++) {
      expect(slotInner(out[i])).toBeCloseTo(slotOuter(out[i - 1]), 6)
    }
  })

  it('paints each band one separator short of its slot', () => {
    for (const r of layoutRings([{ key: 'a', count: 4 }, { key: 'b', count: 4 }])) {
      expect(r.thickness).toBeCloseTo(r.slot - opts.separator, 6)
    }
  })

  it('gives a busier ring a bigger share', () => {
    const out = layoutRings([
      { key: 'few', count: 1 },
      { key: 'many', count: 16 },
    ])
    expect(out[1].slot).toBeGreaterThan(out[0].slot)
  })

  it('grows the share by the square root, not linearly', () => {
    const out = layoutRings([
      { key: 'a', count: 1 },
      { key: 'b', count: 4 },
      { key: 'c', count: 16 },
    ])
    // 16 tasks is 4x the count of 4, but nothing like 4x the width.
    expect(out[2].slot / out[1].slot).toBeLessThan(2.2)
  })

  it('gives an empty ring the smallest share, but still a visible one', () => {
    const out = layoutRings([
      { key: 'empty', count: 0 },
      { key: 'busy', count: 10 },
    ])
    expect(out[0].slot).toBeLessThan(out[1].slot)
    expect(out[0].thickness).toBeGreaterThan(0)
  })

  it('never paints a band below the floor', () => {
    const out = layoutRings([
      { key: 'a', count: 0 },
      { key: 'b', count: 0 },
      { key: 'c', count: 400 },
    ])
    for (const r of out) expect(r.slot).toBeGreaterThanOrEqual(opts.minBand - 1e-9)
  })

  it('stays inside the budget even with far too many rings', () => {
    const out = layoutRings(Array.from({ length: 60 }, (_, i) => ({ key: `r${i}`, count: 20 })))
    expect(slotOuter(out[out.length - 1])).toBeLessThanOrEqual(opts.outerRadius + 1e-9)
    expect(out.every((r) => r.thickness > 0)).toBe(true)
  })

  it('reports depth from 0 at the core to 1 at the rim', () => {
    const out = layoutRings([
      { key: 'a', count: 1 },
      { key: 'b', count: 1 },
      { key: 'c', count: 1 },
    ])
    expect(out.map((r) => r.depth)).toEqual([0, 0.5, 1])
  })

  it('handles the degenerate cases', () => {
    expect(layoutRings([])).toEqual([])
    const one = layoutRings([{ key: 'only', count: 5 }])
    expect(one).toHaveLength(1)
    expect(slotInner(one[0])).toBeCloseTo(opts.innerRadius, 6)
    expect(slotOuter(one[0])).toBeCloseTo(opts.outerRadius, 6)
  })
})

describe('colours', () => {
  it('dim to a low alpha when filtered out', () => {
    expect(ringColor(0.5)).toContain('/ 1)')
    expect(ringColor(0.5, true)).toContain('/ 0.22)')
    expect(goldColor(true)).toContain('/ 0.22)')
    expect(overdueColor(true)).toContain('/ 0.22)')
  })

  it('walk one hue ramp from near to far', () => {
    expect(ringColor(0)).not.toBe(ringColor(1))
  })

  it('keep gold and overdue flat, since they encode kind not distance', () => {
    expect(goldColor()).toBe(goldColor())
    expect(overdueColor()).not.toBe(goldColor())
  })
})
