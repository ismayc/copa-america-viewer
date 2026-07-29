// Auto-updating iCalendar feed for calendar subscriptions (webcal://).
// Fetches OpenFootball's copa.txt on each request and emits an .ics, so a
// subscribed calendar shows resolved knockout teams and final scores. Optional
// ?teams=Argentina,Canada filters to specific teams (case-insensitive).
//
// This is an ES MODULE on purpose. The package sets "type": "module", so a
// CommonJS function (`exports.handler`) is rejected by Netlify's runtime with
// "module is not defined in ES module scope" whenever the site is built from Git
// rather than deployed through netlify-cli, which bundles it away. The sibling
// world-cup-viewer still carries the CommonJS form and only gets away with it
// because it deploys via the CLI.
//
// The source is the plain-text fixture file, not a JSON feed: OpenFootball has
// no .json repo for this competition. The parsing here is a deliberately small,
// self-contained restatement of src/services/results.js — a Netlify function
// can't import from the Vite app's source tree.

const FEED = 'https://raw.githubusercontent.com/openfootball/copa-america/master/2024--usa/copa.txt'
const MATCH_MS = 135 * 60 * 1000
const YEAR = 2024

const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

// A fixture line carries its own UTC offset, which varies across the four US
// timezones the tournament used — so unlike the single-host Euro feed, the
// instant is read straight off the line rather than assumed.
//   Thu Jun 20 20:00 UTC-4   Argentina  2-0  Canada  @ Mercedes-Benz Stadium, …
//   Sat Jul 6 15:00 UTC-7    Uruguay  4-2 pen. (0-0)  Brazil  @ …
//   Sun Jul 14 20:00 UTC-4   Argentina 1-0 a.e.t. (0-0) Colombia  @ …
const FIXTURE = new RegExp(
  '^\\w{3}\\s+(\\w{3})\\s+(\\d{1,2})\\s+(\\d{1,2}):(\\d{2})\\s+UTC([-+]\\d+)\\s+' +
    '(.+?)\\s+' + // team 1
    '(\\d+)-(\\d+)' + // headline score
    '(?:\\s+(pen\\.|a\\.e\\.t\\.)\\s*\\((\\d+)-(\\d+)\\))?' + // optional marker + standing score
    '\\s+([^@]+?)\\s*(?:@\\s*(.*))?$', // team 2, then the optional venue
)

// Round headings in the file ("▪ Round of 16", "▪ Final"), used to describe each
// event. A group match falls back to its "Group X" heading.
const HEADING = /^▪\s*(.+?)\s*$/

function pad(n) {
  return String(n).padStart(2, '0')
}

function toICSDate(d) {
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'
  )
}

function esc(t) {
  return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// The headline score means different things either side of the marker: with
// `pen.` it is the shootout tally and the bracketed pair is the level 90-minute
// score; with `a.e.t.` it is the decisive score after extra time.
function resultText(ha, hb, marker, pa, pb) {
  if (marker === 'pen.') return ` (${pa}–${pb} p${ha}–${hb})`
  if (marker === 'a.e.t.') return ` (${ha}–${hb} AET)`
  return ` (${ha}–${hb})`
}

export function parseFixtures(text) {
  const out = []
  let heading = 'Group stage'
  for (const raw of String(text).split('\n')) {
    const line = raw.split('#')[0].trim()
    if (!line) continue

    const h = HEADING.exec(line)
    if (h) {
      // "Matchday 1  |  Thu Jun 20 - Mon Jun 24" is a date range, not a round.
      if (!/^Matchday/.test(h[1])) heading = h[1].split('|')[0].trim()
      continue
    }
    if (/^Group [A-Z]\s*\|/.test(line)) {
      heading = line.split('|')[0].trim()
      continue
    }

    const fx = FIXTURE.exec(line)
    if (!fx) continue
    const [, mon, day, hh, mm, off, team1, ha, hb, marker, pa, pb, team2, venue] = fx
    if (!MONTHS[mon]) continue
    const start = new Date(
      Date.UTC(YEAR, Number(MONTHS[mon]) - 1, Number(day), Number(hh) - Number(off), Number(mm)),
    )
    out.push({
      start,
      home: team1.trim(),
      away: team2.trim(),
      result: resultText(ha, hb, marker, pa, pb),
      venue: (venue || '').trim(),
      round: heading,
      date: `${YEAR}-${MONTHS[mon]}-${pad(day)}`,
    })
  }
  return out
}

// KNOWN UPSTREAM DEFECT. copa.txt has the kickoff time and venue of the two
// 6 July quarter-finals transposed: it files Colombia–Panama at Allegiant
// Stadium (Las Vegas) at 21:00 and Uruguay–Brazil at State Farm Stadium
// (Glendale) at 18:00, which is the wrong way round. ESPN and CONMEBOL both have
// Colombia–Panama at State Farm and Uruguay–Brazil at Allegiant. The app's own
// schedule takes structure from ESPN and so is unaffected, but this feed reads
// copa.txt directly — without this swap a subscriber gets the wrong stadium and
// the wrong hour for both matches. Keyed by team pair, which the defect leaves
// intact. Remove if OpenFootball fixes the file.
const TRANSPOSED = [
  ['Colombia', 'Panama'],
  ['Uruguay', 'Brazil'],
]
const pairId = (a, b) => [a, b].sort().join('|')
const TRANSPOSED_IDS = TRANSPOSED.map(([a, b]) => pairId(a, b))

function fixTransposedQuarterFinals(matches) {
  const hits = TRANSPOSED_IDS.map((id) => matches.find((m) => pairId(m.home, m.away) === id))
  if (hits.some((m) => !m)) return matches // file changed shape — leave it alone
  const [a, b] = hits
  const swap = [
    [a.start, a.venue],
    [b.start, b.venue],
  ]
  ;[a.start, a.venue] = swap[1]
  ;[b.start, b.venue] = swap[0]
  return matches
}

function vevent(m) {
  const end = new Date(m.start.getTime() + MATCH_MS)
  const uid = `copa2024-${m.date}-${m.home}-${m.away}@copaamericaviewer`.replace(/\s+/g, '_')
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(m.start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${esc(`Copa América 2024: ${m.home} vs ${m.away}${m.result}`)}`,
    `LOCATION:${esc(m.venue)}`,
    `DESCRIPTION:${esc(m.round)}`,
    'END:VEVENT',
  ].join('\r\n')
}

export const handler = async (event) => {
  try {
    const res = await fetch(FEED)
    if (!res.ok) return { statusCode: 502, body: `Upstream ${res.status}` }
    let matches = fixTransposedQuarterFinals(parseFixtures(await res.text()))

    const teamsParam = (event.queryStringParameters && event.queryStringParameters.teams) || ''
    let calName = 'Copa América 2024'
    if (teamsParam) {
      const want = new Set(teamsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
      matches = matches.filter((m) => want.has(m.home.toLowerCase()) || want.has(m.away.toLowerCase()))
      calName = 'Copa América 2024 — My Teams'
    }

    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Copa América 2024 Viewer//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(calName)}`,
      'X-PUBLISHED-TTL:PT2H',
      'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
      ...matches.map(vevent),
      'END:VCALENDAR',
    ].join('\r\n')

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="copa-america-2024.ics"',
        'Cache-Control': 'public, max-age=900',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    }
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` }
  }
}
