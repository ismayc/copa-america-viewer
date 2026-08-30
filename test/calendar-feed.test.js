import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFixtures, handler } from '../netlify/functions/calendar.js'
import { MATCHES } from '../src/data/matches.js'
import { VENUES } from '../src/data/venues.js'

// A committed snapshot of the real OpenFootball copa.txt, so the parser is
// exercised against the actual file rather than a hand-made imitation of it.
// Refresh with:
//   curl -s https://raw.githubusercontent.com/openfootball/copa-america/master/2024--usa/copa.txt \
//     -o test/fixtures/copa-txt-snapshot.txt
const here = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = readFileSync(resolve(here, 'fixtures/copa-txt-snapshot.txt'), 'utf8')

const fetchSnapshot = () =>
  vi.fn(async () => ({ ok: true, text: async () => SNAPSHOT }))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseFixtures — reading OpenFootball copa.txt', () => {
  const fixtures = parseFixtures(SNAPSHOT)

  it('reads every match in the file', () => {
    expect(fixtures).toHaveLength(32)
  })

  it('labels each match with the round it sits under', () => {
    expect([...new Set(fixtures.map((f) => f.round))]).toEqual([
      'Group A', 'Group B', 'Group C', 'Group D',
      'Quarter-finals', 'Semi-finals', 'Third place play-off', 'Final',
    ])
    // "Matchday 1 | Thu Jun 20 - Mon Jun 24" is a date range, not a round, and
    // must not be mistaken for one.
    expect(fixtures.some((f) => /Matchday/.test(f.round))).toBe(false)
  })

  it('reads each line’s own UTC offset rather than assuming one', () => {
    // The tournament spanned four US timezones, so a fixed offset would put any
    // non-Eastern match at the wrong instant.
    const arg = fixtures.find((f) => f.home === 'Argentina' && f.away === 'Canada')
    expect(arg.start.toISOString()).toBe('2024-06-21T00:00:00.000Z') // 20:00 UTC-4
    const peru = fixtures.find((f) => f.home === 'Peru' && f.away === 'Chile')
    expect(peru.start.toISOString()).toBe('2024-06-22T00:00:00.000Z') // 19:00 UTC-5
  })

  it('states a plain result, a shootout and an extra-time win differently', () => {
    const find = (h, a) => fixtures.find((f) => f.home === h && f.away === a).result
    // The headline score means different things either side of the marker.
    expect(find('Colombia', 'Panama')).toBe(' (5–0)')
    expect(find('Uruguay', 'Brazil')).toBe(' (0–0 p4–2)') // 90-min score, then the shootout
    expect(find('Argentina', 'Colombia')).toBe(' (1–0 AET)') // decisive score after extra time
  })
})

describe('handler — the .ics the feed serves', () => {
  it('emits a VCALENDAR with one event per match', async () => {
    vi.stubGlobal('fetch', fetchSnapshot())
    const res = await handler({ queryStringParameters: null })
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toMatch(/text\/calendar/)
    expect(res.body).toContain('PRODID:-//Copa América 2024 Viewer//EN')
    expect(res.body).toContain('X-WR-CALNAME:Copa América 2024')
    expect((res.body.match(/BEGIN:VEVENT/g) || [])).toHaveLength(32)
    expect(res.body).toContain('SUMMARY:Copa América 2024: Argentina vs Colombia (1–0 AET)')
  })

  it('corrects the two quarter-finals copa.txt files under the wrong venue and time', async () => {
    // The file transposes Colombia–Panama and Uruguay–Brazil; ESPN and CONMEBOL
    // agree against it. Without the fix a subscriber gets the wrong stadium AND
    // the wrong hour for both, so this asserts against the app's own schedule.
    vi.stubGlobal('fetch', fetchSnapshot())
    const res = await handler({ queryStringParameters: null })
    const events = res.body.split('BEGIN:VEVENT').slice(1)
    const eventFor = (home, away) =>
      events.find((e) => e.includes(`SUMMARY:Copa América 2024: ${home} vs ${away}`))
    const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

    for (const [home, away, num] of [['Colombia', 'Panama', 28], ['Uruguay', 'Brazil', 27]]) {
      const ev = eventFor(home, away)
      const match = MATCHES.find((m) => m.num === num)
      expect(ev, `${home} v ${away}`).toBeTruthy()
      expect(ev).toContain(`DTSTART:${icsStamp(match.ko)}`)
      expect(ev).toContain(VENUES[match.venue].name)
    }
  })

  it('filters to the requested teams', async () => {
    vi.stubGlobal('fetch', fetchSnapshot())
    const res = await handler({ queryStringParameters: { teams: 'jamaica' } })
    expect(res.body).toContain('X-WR-CALNAME:Copa América 2024 — My Teams')
    // Jamaica played their three group games and nothing else.
    expect((res.body.match(/BEGIN:VEVENT/g) || [])).toHaveLength(3)
    expect(res.body).not.toContain('Argentina vs Colombia')
  })

  it('reports an upstream failure rather than serving an empty calendar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    expect(await handler({ queryStringParameters: null })).toMatchObject({ statusCode: 502 })
  })

  it('reports a thrown fetch as a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const res = await handler({ queryStringParameters: null })
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatch(/offline/)
  })

  it('leaves the feed alone if the transposed pair ever stops matching', async () => {
    // If OpenFootball fixes the file (or renames a team), the corrector must not
    // guess — it returns the parsed list untouched.
    const withoutPanama = SNAPSHOT.split('\n').filter((l) => !/Colombia\s+5-0\s+Panama/.test(l)).join('\n')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => withoutPanama })))
    const res = await handler({ queryStringParameters: null })
    expect(res.statusCode).toBe(200)
    expect((res.body.match(/BEGIN:VEVENT/g) || [])).toHaveLength(31)
    // Uruguay–Brazil keeps copa.txt's own (wrong) venue, rather than a half-applied swap.
    const ev = res.body.split('BEGIN:VEVENT').find((e) => e.includes('Uruguay vs Brazil'))
    expect(ev).toContain('State Farm Stadium')
  })
})

// Lines copa.txt can legitimately contain that are not fixtures, and one it
// should never contain. Uncovered until netlify/functions joined the coverage
// gate: OpenFootball is a hand-edited text file, so tolerating an unparseable
// line is the whole point, and the tolerance was untested.
describe('lines that are not fixtures', () => {
  it('skips a line that does not parse as a fixture at all', () => {
    // Prose and stray notes appear in these files between the fixture blocks.
    expect(parseFixtures('some free text that is not a fixture line\n')).toEqual([])
  })

  it('skips a fixture line whose month abbreviation is not a month', () => {
    // The fixture pattern matches any three word characters where the month
    // goes, so a typo upstream parses structurally and would otherwise become
    // an event on a NaN date in a subscriber's calendar.
    const good = 'Fri Jun 21 21:00 UTC-5  Argentina 2-0 Canada @ Mercedes-Benz Stadium'
    const bad = good.replace('Jun', 'Jly')
    expect(parseFixtures(good)).toHaveLength(1)
    expect(parseFixtures(bad)).toEqual([])
  })

  it('leaves the location blank when a fixture names no venue', () => {
    // The venue is optional in the pattern, and copa.txt omits it for some
    // fixtures. A missing one must render as no LOCATION, not as "undefined".
    const [f] = parseFixtures('Fri Jun 21 21:00 UTC-5  Argentina 2-0 Canada')
    expect(f.venue).toBe('')
  })
})
