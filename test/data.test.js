import { describe, it, expect } from 'vitest'
import { MATCHES, STAGE_ORDER } from '../src/data/matches.js'
import { VENUES } from '../src/data/venues.js'
import { TEAMS, ALL_TEAMS } from '../src/data/teams.js'
import { BRACKET } from '../src/utils/bracket.js'
import { slotLabels } from '../src/utils/slots.js'
import {
  OFFICIAL_ET,
  OFFICIAL_STADIUM,
  OFFICIAL_GROUPS,
  OFFICIAL_ROUND,
  SCHEDULED_NOT_ACTUAL,
} from './fixtures/official-kickoffs.js'
import { TEAM_TIMEZONES } from '../src/data/teamTimezones.js'

// Render a kickoff instant as US Eastern 'YYYY-MM-DD HH:mm' (24h) so it can be
// compared to the authoritative fixture regardless of how `ko` is stored.
function etKey(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t) => parts.find((p) => p.type === t).value
  const hour = g('hour') === '24' ? '00' : g('hour') // midnight quirk
  return `${g('year')}-${g('month')}-${g('day')} ${hour}:${g('minute')}`
}

// The fixture's join key: kickoff date + sorted team pair.
const officialKey = (m) => `${m.ko.slice(0, 10)}|${[m.t1, m.t2].sort().join('|')}`

describe('schedule data integrity', () => {
  it('has all 32 matches', () => {
    expect(MATCHES).toHaveLength(32)
  })

  it('has the correct stage distribution', () => {
    const counts = MATCHES.reduce((a, m) => ((a[m.stage] = (a[m.stage] || 0) + 1), a), {})
    expect(counts).toEqual({ Group: 24, QF: 4, SF: 2, '3rd': 1, Final: 1 })
  })

  it('has a third-place play-off (CONMEBOL still plays one)', () => {
    // The sibling Euro viewer asserts the opposite — UEFA dropped it after 1980.
    expect(MATCHES.filter((m) => m.stage === '3rd')).toHaveLength(1)
    expect(BRACKET.third).toBeTruthy()
  })

  it('has unique match numbers 1–32', () => {
    const nums = MATCHES.map((m) => m.num).sort((a, b) => a - b)
    expect(new Set(nums).size).toBe(32)
    expect(nums[0]).toBe(1)
    expect(nums[31]).toBe(32)
  })

  it('numbers the knockout rounds as CONMEBOL does (QF 25–28, SF 29–30, 3rd 31, Final 32)', () => {
    const nums = (stage) =>
      MATCHES.filter((m) => m.stage === stage).map((m) => m.num).sort((a, b) => a - b)
    expect(nums('QF')).toEqual([25, 26, 27, 28])
    expect(nums('SF')).toEqual([29, 30])
    expect(nums('3rd')).toEqual([31])
    expect(nums('Final')).toEqual([32])
  })

  it('references only known venues', () => {
    expect(MATCHES.every((m) => VENUES[m.venue])).toBe(true)
  })

  it('has a parseable kickoff instant for every match', () => {
    expect(MATCHES.every((m) => !Number.isNaN(new Date(m.ko).getTime()))).toBe(true)
  })

  it('stores every kickoff with an explicit -04:00 (US Eastern) offset', () => {
    const wrong = MATCHES.filter((m) => !m.ko.endsWith('-04:00')).map((m) => `M${m.num}: ${m.ko}`)
    expect(wrong).toEqual([])
  })

  it('carries a unique ESPN event id for every match', () => {
    const missing = MATCHES.filter((m) => !/^\d+$/.test(m.espnId || '')).map((m) => m.num)
    expect(missing).toEqual([])
    expect(new Set(MATCHES.map((m) => m.espnId)).size).toBe(32)
  })

  it('is sorted chronologically', () => {
    for (let i = 1; i < MATCHES.length; i++) {
      expect(new Date(MATCHES[i].ko).getTime()).toBeGreaterThanOrEqual(
        new Date(MATCHES[i - 1].ko).getTime(),
      )
    }
  })

  it('every group match references a real team in its group', () => {
    for (const m of MATCHES.filter((m) => m.stage === 'Group')) {
      const names = TEAMS[m.group].map((t) => t.name)
      expect(names).toContain(m.t1)
      expect(names).toContain(m.t2)
    }
  })

  it('has 16 teams across 4 groups', () => {
    expect(Object.keys(TEAMS)).toHaveLength(4)
    expect(ALL_TEAMS).toHaveLength(16)
  })

  it('matches the official group draw', () => {
    for (const g of Object.keys(OFFICIAL_GROUPS)) {
      const ours = TEAMS[g].map((t) => t.name).sort()
      expect(ours, `group ${g}`).toEqual([...OFFICIAL_GROUPS[g]].sort())
    }
  })

  it('has 14 venues', () => {
    expect(Object.keys(VENUES)).toHaveLength(14)
  })

  it('bracket covers every knockout match exactly once', () => {
    const bracketNums = [
      ...BRACKET.left.QF, ...BRACKET.left.SF,
      ...BRACKET.final, ...BRACKET.third,
      ...BRACKET.right.SF, ...BRACKET.right.QF,
    ].sort((a, b) => a - b)
    const knockoutNums = MATCHES.filter((m) => m.stage !== 'Group')
      .map((m) => m.num)
      .sort((a, b) => a - b)
    expect(bracketNums).toEqual(knockoutNums)
  })

  it('exposes stages in tournament order', () => {
    expect(STAGE_ORDER).toEqual(['Group', 'QF', 'SF', '3rd', 'Final'])
  })
})

// The committed schedule is built from ESPN; the fixture is built from
// OpenFootball. These assertions are the cross-check between the two.
describe('schedule agrees with the independently-sourced official fixture', () => {
  it('covers exactly the same 32 matches', () => {
    expect(MATCHES.map(officialKey).sort()).toEqual(Object.keys(OFFICIAL_ET).sort())
  })

  it('kicks off every match at the officially published US Eastern time', () => {
    const wrong = MATCHES.filter((m) => {
      const k = officialKey(m)
      // One match legitimately differs: see SCHEDULED_NOT_ACTUAL below.
      const expected = SCHEDULED_NOT_ACTUAL[k]?.actual ?? OFFICIAL_ET[k]
      return etKey(m.ko) !== expected
    }).map((m) => `M${m.num} ${m.t1} v ${m.t2}: ${etKey(m.ko)} ≠ ${OFFICIAL_ET[officialKey(m)]}`)
    expect(wrong).toEqual([])
  })

  it('records the Final at the time it was actually played, not the scheduled one', () => {
    // The two sources genuinely disagree here and the disagreement is the point:
    // copa.txt has the scheduled 20:00, ESPN the actual kickoff after the ~75
    // minute delay at the Hard Rock Stadium gates. An archive should say when the
    // match was played, so ESPN wins — deliberately, not by accident.
    expect(Object.keys(SCHEDULED_NOT_ACTUAL)).toHaveLength(1)
    const [key, rec] = Object.entries(SCHEDULED_NOT_ACTUAL)[0]
    const final = MATCHES.find((m) => m.stage === 'Final')
    expect(officialKey(final)).toBe(key)
    expect(OFFICIAL_ET[key]).toBe(rec.scheduled)
    expect(etKey(final.ko)).toBe(rec.actual)
    expect(rec.actual).not.toBe(rec.scheduled)
  })

  it('plays every match in the officially published stadium', () => {
    // Keyed by stadium rather than city: two host cities are both Kansas City.
    const wrong = MATCHES.filter((m) => VENUES[m.venue].name !== OFFICIAL_STADIUM[officialKey(m)]).map(
      (m) => `M${m.num}: ${VENUES[m.venue].name} ≠ ${OFFICIAL_STADIUM[officialKey(m)]}`,
    )
    expect(wrong).toEqual([])
  })

  it('assigns every match to the officially published round', () => {
    const OF_ROUND = {
      'Group A': 'Group', 'Group B': 'Group', 'Group C': 'Group', 'Group D': 'Group',
      'Quarter-finals': 'QF', 'Semi-finals': 'SF', 'Third place play-off': '3rd', Final: 'Final',
    }
    const wrong = MATCHES.filter((m) => OF_ROUND[OFFICIAL_ROUND[officialKey(m)]] !== m.stage).map(
      (m) => `M${m.num}: ${m.stage} ≠ ${OFFICIAL_ROUND[officialKey(m)]}`,
    )
    expect(wrong).toEqual([])
  })
})

// The tournament is finished, so these are facts, not projections. If a feed
// rewrites history, one of these fails.
describe('the recorded 2024 result', () => {
  const byNum = Object.fromEntries(MATCHES.map((m) => [m.num, m]))

  it('was won by Argentina, 1–0 over Colombia after extra time in Miami Gardens', () => {
    const final = byNum[32]
    expect([final.t1, final.t2]).toEqual(['Argentina', 'Colombia'])
    expect(final.score).toEqual([1, 0])
    expect(final.aet).toBe(true)
    expect(VENUES[final.venue].city).toBe('Miami Gardens, FL')
  })

  it('has a final score for all 32 matches', () => {
    expect(MATCHES.every((m) => Array.isArray(m.score))).toBe(true)
  })

  it('records the four shootouts, and only those', () => {
    const pens = MATCHES.filter((m) => m.pens).map((m) => `${m.t1} ${m.pens.join('-')} ${m.t2}`)
    expect(pens.sort()).toEqual(
      [
        'Argentina 4-2 Ecuador',
        'Venezuela 3-4 Canada',
        'Uruguay 4-2 Brazil',
        'Canada 3-4 Uruguay',
      ].sort(),
    )
  })

  it('plays extra time in the Final only — every other tie went straight to penalties', () => {
    // The CONMEBOL rule that differs from UEFA's: at Copa América 2024 only the
    // Final had extra time; a level quarter-final or third-place play-off went to
    // a shootout at 90 minutes. So `pens` WITHOUT `aet` is correct here, and a
    // regression that "helpfully" set aet on every shootout would fail this.
    const aet = MATCHES.filter((m) => m.aet).map((m) => m.num)
    expect(aet).toEqual([32])
    expect(MATCHES.find((m) => m.num === 32).pens).toBeUndefined()
    expect(MATCHES.filter((m) => m.pens).every((m) => !m.aet)).toBe(true)
  })
})

describe('knockout slot labels', () => {
  it('keeps the drawn placeholder for every knockout match, alongside the real teams', () => {
    for (const m of MATCHES.filter((m) => m.stage !== 'Group')) {
      expect(m.label1, `M${m.num}`).toBeTruthy()
      expect(m.label2, `M${m.num}`).toBeTruthy()
      expect(slotLabels(m)).toEqual([m.label1, m.label2])
    }
  })

  it('leaves group matches without placeholders (both teams known at the draw)', () => {
    for (const m of MATCHES.filter((m) => m.stage === 'Group')) {
      expect(m.label1).toBeUndefined()
      expect(slotLabels(m)).toEqual([m.t1, m.t2])
    }
  })

  it('every "Winner Match N" reference points to an existing earlier match', () => {
    const nums = new Set(MATCHES.map((m) => m.num))
    const bad = []
    for (const m of MATCHES)
      for (const slot of slotLabels(m)) {
        const r = slot.match(/^(?:Winner|Loser) Match (\d+)$/)
        if (r) {
          const ref = Number(r[1])
          if (!nums.has(ref) || ref >= m.num) bad.push(`M${m.num} → "${slot}"`)
        }
      }
    expect(bad).toEqual([])
  })

  it('routes each group winner and runner-up into exactly one quarter-final slot', () => {
    const seen = { winner: new Set(), runner: new Set() }
    for (const m of MATCHES.filter((m) => m.stage === 'QF'))
      for (const s of slotLabels(m)) {
        let hit = /^Winner Group ([A-D])$/.exec(s)
        if (hit) {
          expect(seen.winner.has(hit[1])).toBe(false)
          seen.winner.add(hit[1])
        }
        hit = /^Runner-up Group ([A-D])$/.exec(s)
        if (hit) {
          expect(seen.runner.has(hit[1])).toBe(false)
          seen.runner.add(hit[1])
        }
      }
    expect([...seen.winner].sort()).toEqual(['A', 'B', 'C', 'D'])
    expect([...seen.runner].sort()).toEqual(['A', 'B', 'C', 'D'])
  })

  it('has no "3rd Group …" slots — third place is elimination, not a route through', () => {
    // The sibling Euro viewer asserts there are exactly four of these. Copa
    // América has none: top two of each group and nothing else advances, which is
    // why this app carries no third-place combination table at all.
    const thirds = MATCHES.flatMap(slotLabels).filter((s) => s.startsWith('3rd Group '))
    expect(thirds).toEqual([])
  })
})

describe('team home timezones', () => {
  it('maps every qualified team (and nothing else) to ≥1 home zone', () => {
    expect(Object.keys(TEAM_TIMEZONES).sort()).toEqual([...ALL_TEAMS].sort())
    expect(Object.values(TEAM_TIMEZONES).every((z) => z.length > 0)).toBe(true)
  })

  it('uses only valid IANA timezones', () => {
    const bad = []
    for (const [team, zones] of Object.entries(TEAM_TIMEZONES))
      for (const z of zones) {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: z })
        } catch {
          bad.push(`${team}: ${z}`)
        }
      }
    expect(bad).toEqual([])
  })
})

describe('schedule internal consistency', () => {
  const groupMatches = MATCHES.filter((m) => m.stage === 'Group')
  const ms = (iso) => new Date(iso).getTime()
  const teamSet = new Set(ALL_TEAMS)

  it('each group is a complete round-robin (6 games, every pair once, 3 per team)', () => {
    for (const g of Object.keys(TEAMS)) {
      const gm = groupMatches.filter((m) => m.group === g)
      expect(gm, `group ${g} game count`).toHaveLength(6)
      const teams = TEAMS[g].map((t) => t.name).sort()
      const pairs = new Set(gm.map((m) => [m.t1, m.t2].sort().join(' v ')))
      const expected = []
      for (let i = 0; i < teams.length; i++)
        for (let j = i + 1; j < teams.length; j++)
          expected.push([teams[i], teams[j]].sort().join(' v '))
      expect([...pairs].sort(), `group ${g} pairings`).toEqual(expected.sort())
      const counts = {}
      for (const m of gm) for (const t of [m.t1, m.t2]) counts[t] = (counts[t] || 0) + 1
      expect(Object.values(counts), `group ${g} games per team`).toEqual([3, 3, 3, 3])
    }
  })

  it("each group's final two matches kick off simultaneously", () => {
    for (const g of Object.keys(TEAMS)) {
      const gm = groupMatches.filter((m) => m.group === g).sort((a, b) => ms(a.ko) - ms(b.ko))
      const [a, b] = gm.slice(-2)
      expect(a.ko, `group ${g} matchday-3 simultaneity`).toBe(b.ko)
    }
  })

  it('no team plays two matches less than 48h apart', () => {
    const byTeam = {}
    for (const m of MATCHES)
      for (const t of [m.t1, m.t2])
        if (teamSet.has(t)) (byTeam[t] ||= []).push(m)
    const tooClose = []
    for (const [t, arr] of Object.entries(byTeam)) {
      arr.sort((a, b) => ms(a.ko) - ms(b.ko))
      for (let i = 1; i < arr.length; i++) {
        const gapH = (ms(arr[i].ko) - ms(arr[i - 1].ko)) / 3.6e6
        if (gapH < 48) tooClose.push(`${t}: M${arr[i - 1].num}→M${arr[i].num} ${gapH.toFixed(1)}h`)
      }
    }
    expect(tooClose).toEqual([])
  })

  it('no venue hosts two matches with overlapping (3h) windows', () => {
    const byVenue = {}
    for (const m of MATCHES) (byVenue[m.venue] ||= []).push(m)
    const clashes = []
    for (const [v, arr] of Object.entries(byVenue)) {
      arr.sort((a, b) => ms(a.ko) - ms(b.ko))
      for (let i = 1; i < arr.length; i++) {
        const gapH = (ms(arr[i].ko) - ms(arr[i - 1].ko)) / 3.6e6
        if (gapH < 3) clashes.push(`${v}: M${arr[i - 1].num}/M${arr[i].num} ${gapH.toFixed(1)}h`)
      }
    }
    expect(clashes).toEqual([])
  })
})
