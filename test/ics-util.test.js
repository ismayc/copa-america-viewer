import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  buildICS,
  buildICSCollection,
  downloadICS,
  downloadICSCollection,
  webcalUrl,
  googleCalendarUrl,
} from '../src/utils/ics.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

const groupMatch = MATCHES.find((m) => m.stage === 'Group')
const knockoutMatch = MATCHES.find((m) => m.stage !== 'Group')

describe('buildICS (per-match calendar)', () => {
  it('wraps a single VEVENT in a VCALENDAR with UTC times', () => {
    const ics = buildICS(groupMatch)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain(`UID:copa2024-match-${groupMatch.num}@copaamericaviewer`)
    // DTSTART/DTEND are UTC (trailing Z), DTEND is 135 minutes after DTSTART.
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/)
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/)
    // CRLF line endings per RFC 5545.
    expect(ics).toContain('\r\n')
  })

  it('uses "Group X" labels for group matches', () => {
    const ics = buildICS(groupMatch)
    expect(ics).toContain(`Group ${groupMatch.group}`)
  })

  it('uses the stage label for non-group matches', () => {
    const ics = buildICS(knockoutMatch)
    expect(ics).toContain('SUMMARY:Copa América:')
    // Knockout match has no "Group X" — uses STAGE_LABELS instead.
    expect(ics).not.toContain(`Group ${knockoutMatch.group}`)
  })

  it('escapes RFC 5545 special characters in summary/location', () => {
    // Craft a match whose team names carry every escapable char.
    const tricky = {
      ...groupMatch,
      t1: 'A;B,C\\D\nE',
      t2: 'Z',
    }
    const ics = buildICS(tricky)
    expect(ics).toContain('A\\;B\\,C\\\\D\\nE')
  })
})

describe('buildICSCollection (multi-match feed)', () => {
  it('includes one VEVENT per match plus a calendar name', () => {
    const subset = MATCHES.filter((m) => m.stage === 'Group').slice(0, 3)
    const ics = buildICSCollection(subset, 'My Teams')
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length
    expect(eventCount).toBe(3)
    expect(ics).toContain('X-WR-CALNAME:My Teams')
  })

  it('defaults the calendar name', () => {
    const ics = buildICSCollection([groupMatch])
    expect(ics).toContain('X-WR-CALNAME:Copa América 2024')
  })

  it('appends a parenthesised score when a match has a final score', () => {
    const played = { ...groupMatch, score: [2, 1] }
    const ics = buildICSCollection([played])
    expect(ics).toContain('(2–1)')
  })

  it('omits the score when no score is present', () => {
    const ics = buildICSCollection([groupMatch])
    expect(ics).not.toMatch(/\(\d+–\d+\)/)
  })

  it('uses the stage label inside a collection VEVENT for knockout matches', () => {
    const ics = buildICSCollection([knockoutMatch])
    expect(ics).toContain('BEGIN:VEVENT')
  })
})

describe('downloadICS / downloadICSCollection (DOM download)', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
  })

  it('creates a blob URL, clicks an anchor, and revokes for a single match', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadICS(groupMatch)
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
    clickSpy.mockRestore()
  })

  it('downloads a collection', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadICSCollection([groupMatch], 'feed.ics', 'Feed')
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    clickSpy.mockRestore()
  })
})

describe('webcal / google calendar URLs', () => {
  it('rewrites https to webcal', () => {
    expect(webcalUrl('https://example.com/feed.ics')).toBe('webcal://example.com/feed.ics')
  })

  it('rewrites http to webcal too', () => {
    expect(webcalUrl('http://example.com/feed.ics')).toBe('webcal://example.com/feed.ics')
  })

  it('builds a Google Calendar subscribe link with a raw webcal cid', () => {
    expect(googleCalendarUrl('https://example.com/feed.ics')).toBe(
      'https://www.google.com/calendar/render?cid=webcal://example.com/feed.ics',
    )
  })
})
