import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { VENUES } from '../src/data/venues.js'
import { weekStartOf, addDays } from '../src/utils/week.js'
import {
  dayKey,
  formatTime,
  matchStatus,
  liveState,
  teamLocalKickoffs,
  teamKickoffTooltip,
} from '../src/utils/time.js'
import { TEAM_TIMEZONES } from '../src/data/teamTimezones.js'
import { ALL_TEAMS } from '../src/data/teams.js'
import { buildICS, webcalUrl, googleCalendarUrl } from '../src/utils/ics.js'
import { computeGroup } from '../src/utils/standings.js'

describe('week utils', () => {
  it('weekStartOf returns the preceding Sunday', () => {
    expect(weekStartOf('2024-06-20')).toBe('2024-06-16') // Thu -> Sun
    expect(weekStartOf('2024-06-16')).toBe('2024-06-16') // Sun -> itself
  })

  it('addDays does calendar math across month boundaries', () => {
    expect(addDays('2024-06-28', 6)).toBe('2024-07-04')
  })

  it('every match falls inside exactly one listed week', () => {
    const tz = 'America/New_York'
    const weeks = [...new Set(MATCHES.map((m) => weekStartOf(dayKey(m.ko, tz))))]
    for (const m of MATCHES) {
      const k = dayKey(m.ko, tz)
      const hits = weeks.filter((w) =>
        Array.from({ length: 7 }, (_, i) => addDays(w, i)).includes(k),
      )
      expect(hits).toHaveLength(1)
    }
  })
})

describe('time utils', () => {
  it('converts the opening match (8pm ET) to other zones', () => {
    const open = MATCHES.find((m) => m.num === 1).ko
    expect(formatTime(open, 'America/New_York')).toBe('8:00 PM')
    expect(formatTime(open, 'America/Los_Angeles')).toBe('5:00 PM')
    // A US-evening kickoff lands after midnight in Europe — the next day.
    expect(formatTime(open, 'Europe/London')).toBe('1:00 AM')
  })

  it('classifies match status by time', () => {
    expect(matchStatus('2024-06-21T00:00:00Z', Date.parse('2024-06-20T00:00:00Z'))).toBe('upcoming')
    expect(matchStatus('2024-06-21T00:00:00Z', Date.parse('2024-06-21T00:30:00Z'))).toBe('live')
    expect(matchStatus('2024-06-21T00:00:00Z', Date.parse('2024-06-21T03:00:00Z'))).toBe('finished')
  })

  it('liveState prefers feed data over the clock', () => {
    const ko = '2024-06-21T00:00:00Z'
    const duringWindow = Date.parse('2024-06-21T00:30:00Z') // time-based "live"
    // A finished match (has a score) reads finished even inside the live window.
    expect(liveState({ ko, score: [2, 0] }, duringWindow)).toBe('finished')
    // ESPN's live flag wins regardless of clock.
    expect(liveState({ ko, score: [1, 0], live: { clock: "HT" } }, duringWindow)).toBe('live')
    // No feed data yet -> fall back to the time-based guess.
    expect(liveState({ ko }, duringWindow)).toBe('live')
    expect(liveState({ ko }, Date.parse('2024-06-20T00:00:00Z'))).toBe('upcoming')
  })
})

describe('team local kickoff tooltip', () => {
  const open = MATCHES.find((m) => m.num === 1).ko // opener, 8pm EDT

  it('gives a single home-time line for a single-zone country', () => {
    // Abbrev rendering of a South American zone varies by ICU build (PET vs
    // GMT-5), so assert the wall-clock and that exactly one line comes back.
    const lines = teamLocalKickoffs(open, 'Peru')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^Jun 20, 7:00 PM /)
  })

  it('lists one line per distinct wall-clock for a multi-zone country', () => {
    // The hosts span Hawaii→Eastern; the opener (8pm EDT) reads differently in
    // each. US abbreviations are stable across ICU builds, so assert them.
    const lines = teamLocalKickoffs(open, 'United States')
    expect(lines).toEqual([
      'Jun 20, 2:00 PM HST',
      'Jun 20, 4:00 PM AKDT',
      'Jun 20, 5:00 PM PDT',
      'Jun 20, 6:00 PM MDT',
      'Jun 20, 7:00 PM CDT',
      'Jun 20, 8:00 PM EDT',
    ])
  })

  it('collapses zones that read the same clock at the instant', () => {
    // Mexico lists 4 zones, but two of them read the same wall-clock in June.
    expect(TEAM_TIMEZONES.Mexico).toHaveLength(4)
    expect(teamLocalKickoffs(open, 'Mexico')).toHaveLength(3)
  })

  it('returns empty for unknown teams (e.g. knockout placeholders)', () => {
    expect(teamLocalKickoffs(open, 'Winner Group A')).toEqual([])
    expect(teamKickoffTooltip(open, 'Winner Group A')).toBe('')
  })

  it('builds a labelled multi-line tooltip', () => {
    expect(teamKickoffTooltip(open, 'Peru')).toMatch(/^Kickoff in Peru:\nJun 20, 7:00 PM /)
    expect(teamKickoffTooltip(open, 'United States')).toMatch(
      /^Kickoff in United States \(local times\):\n/,
    )
  })

  it('has a timezone entry for every qualified team', () => {
    for (const name of ALL_TEAMS) {
      expect(TEAM_TIMEZONES[name], `${name} missing a home timezone`).toBeTruthy()
      expect(TEAM_TIMEZONES[name].length).toBeGreaterThan(0)
    }
  })
})

describe('ICS export', () => {
  it('emits a valid VEVENT with correct UTC start/end', () => {
    const final = MATCHES.find((m) => m.stage === 'Final')
    const ics = buildICS(final)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20240715T011500Z') // 9:15pm EDT -> 01:15 UTC next day
    expect(ics).toContain('DTEND:20240715T033000Z') // +2h15m
    expect(ics).toContain('LOCATION:Hard Rock Stadium')
    expect(ics).toContain('END:VCALENDAR')
  })
})

describe('calendar subscription links', () => {
  const FEED = 'https://copa-america-viewer.netlify.app/calendar.ics'

  it('webcalUrl swaps the scheme to webcal', () => {
    expect(webcalUrl(FEED)).toBe('webcal://copa-america-viewer.netlify.app/calendar.ics')
    expect(webcalUrl('http://x/y.ics')).toBe('webcal://x/y.ics')
  })

  it('googleCalendarUrl uses a raw webcal:// cid (not https, not percent-encoded)', () => {
    const link = googleCalendarUrl(FEED)
    expect(link).toBe(
      'https://www.google.com/calendar/render?cid=webcal://copa-america-viewer.netlify.app/calendar.ics',
    )
    // The old bug: an https/encoded cid that Google rejects with "check the URL".
    expect(link).not.toContain('cid=https')
    expect(link).not.toContain('%3A')
  })

  it('preserves the ?teams= query string for the my-teams feed', () => {
    const myFeed = `${FEED}?teams=Argentina,Colombia`
    const link = googleCalendarUrl(myFeed)
    expect(link).toContain('cid=webcal://copa-america-viewer.netlify.app/calendar.ics?teams=Argentina,Colombia')
    expect(link).not.toContain('%3F') // the "?" stays raw so Google keeps the query
  })
})

describe('standings', () => {
  it('tallies points, GD and ordering from scored matches', () => {
    const scored = MATCHES.map((m) =>
      m.num === 1 ? { ...m, score: [2, 1] } : m, // Argentina 2-1 Canada
    )
    const table = computeGroup('A', scored)
    const arg = table.find((r) => r.name === 'Argentina')
    const can = table.find((r) => r.name === 'Canada')
    expect(arg.Pts).toBe(3)
    expect(arg.GD).toBe(1)
    expect(can.Pts).toBe(0)
    expect(can.GD).toBe(-1)
    expect(table[0].name).toBe('Argentina') // sorted to top
  })
})

describe('venue timezones', () => {
  it('every venue has a valid IANA timezone', () => {
    for (const v of Object.values(VENUES)) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: v.tz })).not.toThrow()
    }
  })
})
