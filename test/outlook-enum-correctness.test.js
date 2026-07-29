import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import { enumerateOutlook, ENTRY_SLOT_LABELS } from '../src/utils/outlookEnum.js'
import { computeQualification } from '../src/utils/qualification.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'

const GROUPS = Object.keys(TEAMS)

// Each group's final-round fixtures, read off the real schedule rather than
// hard-coded, so the nightly data refresh can't quietly desync them.
const REM = Object.fromEntries(
  GROUPS.map((g) => [
    g,
    MATCHES.filter((m) => m.stage === 'Group' && m.group === g).slice(-2).map((m) => m.num),
  ]),
)

// Complete every group, then re-open just `keepOpen`'s final round, so the
// enumeration stays small enough to brute-force a second, independent way.
function fixtureKeepingOpen(keepOpen) {
  const open = new Set(keepOpen)
  const scored = { ...GROUP_STAGE_MD3 }
  for (const g of GROUPS) {
    for (const num of REM[g]) {
      if (open.has(g)) delete scored[num]
      else scored[num] = scored[num] || [1, 0] // arbitrary completed result
    }
  }
  return MATCHES.map((m) => (m.stage === 'Group' && scored[m.num] ? { ...m, score: scored[m.num] } : m))
}

// ---- Independent reference enumerator (deliberately different code path) ----
// Recurses over the remaining games, enumerating each one's MARGIN over the same
// ±CAP range, builds the full synthetic match list (goals = margin), runs the
// production computeQualification, and resolves each quarter-final slot from
// scratch — every margin combination weighted equally. The production
// enumerator's weighted per-group dedup must reproduce these counts exactly.
const CAP = 2
const MARGINS = Array.from({ length: 2 * CAP + 1 }, (_, i) => i - CAP)
const scoreForMargin = (d) => (d > 0 ? [d, 0] : d < 0 ? [0, -d] : [0, 0])
const ENTRY_STATIC = MATCHES.filter((m) => m.stage === 'QF')

function parse(label) {
  let m = /^Winner Group ([A-D])$/.exec(label)
  if (m) return { t: 'w', g: m[1] }
  m = /^Runner-up Group ([A-D])$/.exec(label)
  if (m) return { t: 'r', g: m[1] }
  return { t: 'o' }
}

function referenceEnumerate(matches) {
  const remaining = matches.filter(
    (m) => m.stage === 'Group' && !m.voided && !(Array.isArray(m.score) && !m.live),
  )
  const remNums = remaining.map((m) => m.num)
  const counts = {}
  for (const m of ENTRY_STATIC) counts[m.num] = [{}, {}]
  const choice = new Array(remaining.length)
  let total = 0

  const tally = () => {
    total++
    const override = {}
    remNums.forEach((num, i) => (override[num] = scoreForMargin(choice[i])))
    const syn = matches.map((m) => (override[m.num] ? { ...m, score: override[m.num] } : m))
    const q = computeQualification(syn)
    const W = {}
    const R = {}
    for (const g of GROUPS) {
      W[g] = q.groups[g][0].name
      R[g] = q.groups[g][1].name
    }
    for (const m of ENTRY_STATIC) {
      const sides = [parse(m.t1), parse(m.t2)]
      sides.forEach((sl, s) => {
        const team = sl.t === 'w' ? W[sl.g] : sl.t === 'r' ? R[sl.g] : null
        if (team) counts[m.num][s][team] = (counts[m.num][s][team] || 0) + 1
      })
    }
  }

  const rec = (i) => {
    if (i === remaining.length) return tally()
    for (const d of MARGINS) {
      choice[i] = d
      rec(i + 1)
    }
  }
  rec(0)
  return { total, counts }
}

// Convert enumerateOutlook output to the reference's shape.
function toCounts(result) {
  const out = {}
  for (const num of Object.keys(result.perMatch)) {
    out[num] = result.perMatch[num].map((side) =>
      Object.fromEntries(side.candidates.map((c) => [c.team, c.count])),
    )
  }
  return out
}

describe('outlook enumeration — exact correctness vs an independent reference', () => {
  for (const keepOpen of [['A'], ['A', 'B'], ['C', 'D']]) {
    it(`matches the brute-force reference with groups ${keepOpen.join(',')} open`, () => {
      const fx = fixtureKeepingOpen(keepOpen)
      const mine = enumerateOutlook(fx, null, CAP)
      const ref = referenceEnumerate(fx)
      expect(mine.total).toBe(ref.total)
      expect(toCounts(mine)).toEqual(ref.counts)
    })
  }

  it('only ever places a team in a slot its own group can fill', () => {
    const fx = fixtureKeepingOpen(['A', 'B'])
    const { perMatch } = enumerateOutlook(fx, null, CAP)
    const groupOf = (team) => GROUPS.find((g) => TEAMS[g].some((t) => t.name === team))
    for (const m of ENTRY_STATIC) {
      ;[m.t1, m.t2].forEach((label, side) => {
        const s = parse(label)
        expect(s.t, `unparsed entry slot "${label}"`).not.toBe('o')
        for (const c of perMatch[m.num][side].candidates) {
          expect(groupOf(c.team), `${c.team} in ${label}`).toBe(s.g)
        }
      })
    }
  })

  it('produces exact rational shares (every count is an integer out of the total)', () => {
    const fx = fixtureKeepingOpen(['A', 'B'])
    const { total, perMatch } = enumerateOutlook(fx, null, CAP)
    for (const num of Object.keys(perMatch)) {
      for (const side of perMatch[num]) {
        for (const c of side.candidates) {
          expect(Number.isInteger(c.count)).toBe(true)
          expect(c.pct).toBeCloseTo(c.count / total, 12)
        }
      }
    }
  })

  it('covers exactly the four quarter-finals', () => {
    expect(Object.keys(ENTRY_SLOT_LABELS).map(Number).sort((a, b) => a - b)).toEqual([25, 26, 27, 28])
  })
})
