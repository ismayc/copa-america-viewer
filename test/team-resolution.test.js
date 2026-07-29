import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FLAG_BY_TEAM } from '../src/data/teams.js'
import { normEspn, ESPN_ALIASES } from '../src/services/espn.js'
import { normalizeTeam, parseCupTxt } from '../src/services/results.js'

// An external feed spelling that no normalizer maps to our canonical name fails
// SILENTLY: the lookup returns a non-team and the match is quietly dropped from
// the live overlay. These tests pin every REAL captured feed spelling to a real
// team, so a drift in either feed is a red test rather than a missing score.
//
// This is not hypothetical. The table inherited from the sibling Euro/World Cup
// viewers mapped ESPN's "United States" to "USA" — correct there, and wrong here,
// where "United States" IS the canonical name. It rewrote every USA match to a
// non-team. The dead-entry test at the bottom is what makes that class of bug
// loud instead of silent.
//
// Fixtures are captures of the whole 2024 tournament:
//   espn: site.api.espn.com/apis/site/v2/sports/soccer/conmebol.america/scoreboard
//         ?dates=20240620-20240715&limit=100 → competitors[].team.displayName
//   copa.txt: the committed snapshot in fixtures/, read through the production parser

const here = dirname(fileURLToPath(import.meta.url))
const espnNames = JSON.parse(readFileSync(resolve(here, 'fixtures/espn-team-names.json'), 'utf8'))
const snapshot = readFileSync(resolve(here, 'fixtures/copa-txt-snapshot.txt'), 'utf8')

// Every team name copa.txt actually uses, taken from the parsed fixtures rather
// than a second hand-maintained list that could drift from the file.
const cupTxtNames = [
  ...new Set([...parseCupTxt(snapshot).values()].flatMap((r) => [r.home, r.away])),
].sort()

// Canonical team names = the 16 sides that played.
const canonical = new Set(Object.keys(FLAG_BY_TEAM))

describe('team name resolution from real feed spellings', () => {
  it('every ESPN spelling resolves to a real team', () => {
    const bad = espnNames.filter((n) => !canonical.has(normEspn(n))).map((n) => `${n} → ${normEspn(n)}`)
    expect(bad, `ESPN spellings not resolving to a known team: ${bad.join(', ')}`).toEqual([])
  })

  it('every copa.txt spelling resolves to a real team', () => {
    const bad = cupTxtNames.filter((n) => !canonical.has(normalizeTeam(n)))
    expect(bad, `copa.txt spellings not resolving to a known team: ${bad.join(', ')}`).toEqual([])
  })

  it('both feeds cover all 16 teams (none left without a known spelling)', () => {
    // A team missing here is a spelling we have never seen — the exact gap that
    // silently drops its live score.
    for (const [label, names, norm] of [
      ['ESPN', espnNames, normEspn],
      ['copa.txt', cupTxtNames, normalizeTeam],
    ]) {
      const covered = new Set(names.map(norm))
      const missing = [...canonical].filter((t) => !covered.has(t))
      expect(missing, `teams with no captured ${label} spelling: ${missing.join(', ')}`).toEqual([])
      expect(names).toHaveLength(16)
    }
  })

  it('regression: "United States" survives both feeds unchanged', () => {
    // The bug this file exists for. Both feeds write it exactly as we do, so any
    // rewriting of it is wrong by definition.
    expect(normEspn('United States')).toBe('United States')
    expect(normalizeTeam('United States')).toBe('United States')
    expect(canonical.has('United States')).toBe(true)
    expect(espnNames).toContain('United States')
    expect(cupTxtNames).toContain('United States')
  })

  it('neither feed needs renaming — both already use the canonical forms', () => {
    expect(espnNames.every((n) => canonical.has(n))).toBe(true)
    expect(cupTxtNames.every((n) => canonical.has(n))).toBe(true)
  })
})

describe('the alias table carries no dead entries', () => {
  // The risk is not a gap but the opposite: an inherited entry for a team that is
  // not in this tournament, or for a name this feed never sends, which reads as
  // coverage while mapping nothing — or, worse, mangles a name that was already
  // right. Any entry must earn its place by appearing in the capture.
  it('every ESPN alias key appears in the captured feed spellings', () => {
    const unused = Object.keys(ESPN_ALIASES).filter((k) => !espnNames.includes(k))
    expect(unused, `alias keys never seen in the feed: ${unused.join(', ')}`).toEqual([])
  })

  it('every ESPN alias target is a canonical team name', () => {
    for (const target of Object.values(ESPN_ALIASES)) {
      expect(canonical.has(normalizeTeam(target)), `alias target "${target}" is not a team`).toBe(true)
    }
  })
})
