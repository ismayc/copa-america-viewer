import { describe, it, expect } from 'vitest'
import { GROUP_COLORS, KNOCKOUT_COLOR, colorForMatch } from '../src/data/groupColors.js'
import { TEAMS } from '../src/data/teams.js'

// This file exists because a hand-written color map was copied to three viewers
// with different group counts. The coverage gate stayed green throughout: the
// legend renders whatever the map holds, so a missing group produced `undefined`
// rather than a failure. These assertions compare the map to the tournament.
describe('group colors', () => {
  const groups = Object.keys(TEAMS)

  it('gives every group in this tournament a color', () => {
    expect(groups.length).toBeGreaterThan(0)
    for (const g of groups) {
      expect(GROUP_COLORS[g], `group ${g} has no color`).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('invents no color for a group this tournament does not have', () => {
    // The legend is driven by Object.entries(GROUP_COLORS), so a stray entry draws
    // a swatch for a group that never appears in a match.
    expect(Object.keys(GROUP_COLORS)).toEqual(groups)
  })

  it('keeps every group visually distinct', () => {
    const used = Object.values(GROUP_COLORS)
    expect(new Set(used).size).toBe(used.length)
    expect(used).not.toContain(KNOCKOUT_COLOR)
  })

  it('colors a group match by its group and everything else as knockout', () => {
    const first = groups[0]
    expect(colorForMatch({ stage: 'Group', group: first })).toBe(GROUP_COLORS[first])
    expect(colorForMatch({ stage: 'Final' })).toBe(KNOCKOUT_COLOR)
  })
})
