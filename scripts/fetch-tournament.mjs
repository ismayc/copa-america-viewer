// Builds the committed tournament snapshot in src/data/ for CONMEBOL Copa
// América 2024 (held in the USA).
//
// Two independent public sources, both keyless and free:
//
//   • ESPN (site API, soccer/conmebol.america) — STRUCTURE. Exact kickoff
//     instants, venues, group labels, per-match event ids (which is what lets
//     the match detail modal pull a two-year-old box score at runtime), final
//     scores and shootout scores.
//   • OpenFootball (copa-america, public domain) — GOAL DETAIL. Scorer names and
//     minutes with penalty / own-goal flags, which ESPN's key events carry only
//     inside prose ("Goal! Argentina 1, Canada 0. Julián Álvarez (Argentina) …")
//     with an empty athletesInvolved array on matches this old.
//
// The Copa edition of the OpenFootball data is a PLAIN-TEXT cup.txt file rather
// than the euro.json the sibling Euro viewer reads — there is no copa-america
// .json repo. It is parsed here (see parseCupTxt), and the parse is self-checking
// in two independent ways, so a silent mis-parse fails the build rather than
// shipping half a Golden Boot:
//
//   1. every match's final score, as written on the copa.txt fixture line, must
//      equal ESPN's final score — the same two-source cross-check the Euro
//      builder does;
//   2. the number of goals parsed for each side must equal that side's score.
//
// KNOWN SOURCE DEFECT (do not "fix" it by editing data): copa.txt has the
// kickoff time, venue and bracket-lineage comment of the two 6 July quarter-
// finals transposed — it files Colombia 5–0 Panama at Allegiant Stadium and
// Uruguay–Brazil at State Farm Stadium, which is the wrong way round. ESPN and
// CONMEBOL both have Colombia–Panama at State Farm Stadium (Glendale) and
// Uruguay–Brazil at Allegiant (Las Vegas). Structure therefore comes from ESPN,
// and copa.txt is used ONLY for goal detail plus the score cross-check — neither
// of which the transposition touches, because the join is by kickoff DATE + team
// pair and both matches were played on 6 July.
//
// Node built-ins only (no imports at all) so the data workflow runs on a bare
// checkout — enforced by test/scripts-runtime.test.js.
//
//   node scripts/fetch-tournament.mjs        # rewrite src/data/*.js
//   node scripts/fetch-tournament.mjs --dry  # report only, write nothing

import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/conmebol.america'
const OPENFOOTBALL =
  'https://raw.githubusercontent.com/openfootball/copa-america/master/2024--usa/copa.txt'

// ---------------------------------------------------------------------------
// The edition. Everything below this line is Copa-2024-specific and is what a
// future edition rewrites; the machinery underneath it is format-general.
// ---------------------------------------------------------------------------

const EDITION = {
  year: 2024,
  host: 'United States',
  hostFlag: '🇺🇸',
  window: '20240620-20240715',
  matches: 32,
  teams: 16,
  groups: ['A', 'B', 'C', 'D'],
  venues: 14,
  // CONMEBOL published the fixture list in US Eastern time, and the venues span
  // four US zones, so a single "local clock" for the tournament does not exist.
  // Storing the offset explicitly means `new Date(ko)` is an absolute instant
  // that renders into any timezone, while the committed string still reads like
  // the published list. -04:00 = EDT, in force across the whole window.
  tzOffset: '-04:00',
}

// The knockout fixture list. Slot labels come from OpenFootball's copa.txt
// lineage comments (`# Winner Group A - Runner-up Group B`); the official match
// numbers 25–32 come from CONMEBOL's own published match schedule
// (copaamerica.com/en/match-schedule), which the SF / 3rd / Final lineage
// comments corroborate ("Winner Match 29 - Winner Match 30").
//
// Note 27/28: CONMEBOL numbers the quarter-finals by BRACKET position, not by
// kickoff — Uruguay v Brazil is match 27 even though Colombia v Panama (28)
// kicked off three hours earlier the same day. That is why slots are matched to
// ESPN events by kickoff instant and never by sort position.
//
// Unlike the Euro, only the top TWO of each group advance: there is no
// best-third qualification, so every knockout slot is a group winner, a group
// runner-up, or a feed from an earlier tie. And unlike the Euro, the third-place
// play-off (match 31) still exists.
//
// `t1`/`t2` are the placeholder labels the app resolves at runtime through
// utils/bracketResolve.js. They are replaced with the real teams below for any
// match that has been played, which for a finished edition is all of them; an
// unplayed edition simply keeps the labels.
const KNOCKOUT = [
  { num: 25, stage: 'QF', ko: '2024-07-04T21:00', t1: 'Winner Group A', t2: 'Runner-up Group B' },
  { num: 26, stage: 'QF', ko: '2024-07-05T21:00', t1: 'Winner Group B', t2: 'Runner-up Group A' },
  { num: 28, stage: 'QF', ko: '2024-07-06T18:00', t1: 'Winner Group D', t2: 'Runner-up Group C' },
  { num: 27, stage: 'QF', ko: '2024-07-06T21:00', t1: 'Winner Group C', t2: 'Runner-up Group D' },
  { num: 29, stage: 'SF', ko: '2024-07-09T20:00', t1: 'Winner Match 25', t2: 'Winner Match 26' },
  { num: 30, stage: 'SF', ko: '2024-07-10T20:00', t1: 'Winner Match 27', t2: 'Winner Match 28' },
  { num: 31, stage: '3rd', ko: '2024-07-13T20:00', t1: 'Loser Match 29', t2: 'Loser Match 30' },
  { num: 32, stage: 'Final', ko: '2024-07-14T21:15', t1: 'Winner Match 29', t2: 'Winner Match 30' },
]

// Flag emoji per team.
const FLAGS = {
  Argentina: '🇦🇷',
  Bolivia: '🇧🇴',
  Brazil: '🇧🇷',
  Canada: '🇨🇦',
  Chile: '🇨🇱',
  Colombia: '🇨🇴',
  'Costa Rica': '🇨🇷',
  Ecuador: '🇪🇨',
  Jamaica: '🇯🇲',
  Mexico: '🇲🇽',
  Panama: '🇵🇦',
  Paraguay: '🇵🇾',
  Peru: '🇵🇪',
  'United States': '🇺🇸',
  Uruguay: '🇺🇾',
  Venezuela: '🇻🇪',
}

// Venue metadata keyed by ESPN's venue id. ESPN's city strings are correct for
// this edition (unlike the Euro feed's), but they are restated here so the app
// owns its display form — "City, ST" rather than "City, State", which matters
// because two host stadiums sit in a "Kansas City": one in Kansas, one in
// Missouri.
//
// `tz` is the stadium's own IANA zone, and it genuinely varies: the 14 venues
// span US Eastern, Central, Arizona (which does not observe DST, so State Farm
// Stadium ran on UTC-7 through July — the same clock as California) and Pacific.
const VENUE_META = {
  4727: { key: 'metlife', name: 'MetLife Stadium', city: 'East Rutherford, NJ', tz: 'America/New_York', region: 'Northeast' },
  4418: { key: 'bankofamerica', name: 'Bank of America Stadium', city: 'Charlotte, NC', tz: 'America/New_York', region: 'Southeast' },
  4643: { key: 'hardrock', name: 'Hard Rock Stadium', city: 'Miami Gardens, FL', tz: 'America/New_York', region: 'Southeast' },
  6971: { key: 'interandco', name: 'Inter&Co Stadium', city: 'Orlando, FL', tz: 'America/New_York', region: 'Southeast' },
  7485: { key: 'mercedesbenz', name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA', tz: 'America/New_York', region: 'Southeast' },
  3871: { key: 'attstadium', name: 'AT&T Stadium', city: 'Arlington, TX', tz: 'America/Chicago', region: 'South' },
  6262: { key: 'nrg', name: 'NRG Stadium', city: 'Houston, TX', tz: 'America/Chicago', region: 'South' },
  8673: { key: 'q2', name: 'Q2 Stadium', city: 'Austin, TX', tz: 'America/Chicago', region: 'South' },
  6587: { key: 'childrensmercy', name: "Children's Mercy Park", city: 'Kansas City, KS', tz: 'America/Chicago', region: 'Midwest' },
  10897: { key: 'arrowhead', name: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City, MO', tz: 'America/Chicago', region: 'Midwest' },
  2710: { key: 'statefarm', name: 'State Farm Stadium', city: 'Glendale, AZ', tz: 'America/Phoenix', region: 'West' },
  8716: { key: 'allegiant', name: 'Allegiant Stadium', city: 'Las Vegas, NV', tz: 'America/Los_Angeles', region: 'West' },
  5960: { key: 'levis', name: "Levi's Stadium", city: 'Santa Clara, CA', tz: 'America/Los_Angeles', region: 'West' },
  9115: { key: 'sofi', name: 'SoFi Stadium', city: 'Inglewood, CA', tz: 'America/Los_Angeles', region: 'West' },
}

// OpenFootball spellings that differ from the app's canonical names (which
// follow ESPN and CONMEBOL). copa.txt writes "United States" exactly as ESPN
// does, so this is empty for 2024 — kept because the join needs it the moment a
// future edition brings in a team the two feeds spell differently. Mirrors
// src/services/results.js.
const ALIASES = {}
const canon = (name) => ALIASES[name] || name

// ---------------------------------------------------------------------------
// Fetch plumbing
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1s, 2s, 4s, 8s, plus up to 500ms of jitter so parallel callers don't all retry
// in lockstep and re-create the burst that caused the failure.
const backoffMs = (attempt) => 2 ** attempt * 1000 + Math.random() * 500

// ESPN 500s at random under load; retry only what's worth retrying (5xx, 429, or
// a network-level error). A 404 is a real answer and fails immediately rather
// than sleeping 15 seconds first.
async function getText(url, tries = 5) {
  let lastErr
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await sleep(backoffMs(attempt - 1))

    let res
    try {
      res = await fetch(url)
    } catch (err) {
      lastErr = err
      continue
    }

    if (res.ok) return await res.text()
    if (res.status < 500 && res.status !== 429) throw new Error(`${url}\n  HTTP ${res.status}`)
    lastErr = new Error(`HTTP ${res.status}`)
  }
  throw new Error(`${url}\n  ${lastErr.message} — still failing after ${tries} attempts`)
}

const getJson = async (url) => JSON.parse(await getText(url))

// ---------------------------------------------------------------------------
// ESPN → normalized events
// ---------------------------------------------------------------------------

// "Copa América, Group A" → "A"; "Copa América, Quarterfinals" → null.
function groupOf(competition) {
  const note = competition.altGameNote || ''
  const m = note.match(/Group ([A-L])\s*$/)
  return m ? m[1] : null
}

const STAGE_BY_SLUG = {
  'group-stage': 'Group',
  quarterfinals: 'QF',
  semifinals: 'SF',
  '3rd-place-match': '3rd',
  final: 'Final',
}

// ESPN's `date` is a UTC instant; re-express it in the tournament's own
// publication timezone so the committed string reads like the official fixture
// list (and so a human diff of this file is meaningful).
function toEditionOffset(iso) {
  const offsetMin =
    (EDITION.tzOffset.startsWith('-') ? -1 : 1) *
    (Number(EDITION.tzOffset.slice(1, 3)) * 60 + Number(EDITION.tzOffset.slice(4, 6)))
  const local = new Date(new Date(iso).getTime() + offsetMin * 60_000)
  return local.toISOString().slice(0, 19) + EDITION.tzOffset
}

// Kickoff key used to line an ESPN event up with a KNOCKOUT slot: the Eastern
// wall-clock date and time, which is how the official fixture list states it.
const koKey = (iso) => toEditionOffset(iso).slice(0, 16)

function normalizeEvent(event) {
  const c = event.competitions[0]
  const stage = STAGE_BY_SLUG[event.season?.slug]
  if (!stage) throw new Error(`Unknown stage slug "${event.season?.slug}" on event ${event.id}`)

  const home = c.competitors.find((t) => t.homeAway === 'home')
  const away = c.competitors.find((t) => t.homeAway === 'away')
  const venueId = Number(c.venue?.id)
  if (!VENUE_META[venueId]) {
    throw new Error(`Unknown venue ${venueId} (${c.venue?.fullName}) on event ${event.id}`)
  }

  const scored = home.score !== '' && home.score != null && c.status?.type?.completed
  const pens =
    home.shootoutScore != null && away.shootoutScore != null
      ? [Number(home.shootoutScore), Number(away.shootoutScore)]
      : null

  return {
    espnId: event.id,
    stage,
    group: groupOf(c),
    ko: toEditionOffset(c.date),
    koKey: koKey(c.date),
    venue: VENUE_META[venueId].key,
    t1: home.team.displayName,
    t2: away.team.displayName,
    score: scored ? [Number(home.score), Number(away.score)] : null,
    pens,
    // CONMEBOL played extra time ONLY in the final; every other level tie went
    // straight from 90 minutes to penalties. So `aet` keys off "AET" in ESPN's
    // status detail alone — unlike the Euro builder, which also reads the
    // "FT-Pens" detail as extra time, because at the Euro it always was.
    aet: /AET/i.test(c.status?.type?.detail || ''),
  }
}

// ---------------------------------------------------------------------------
// OpenFootball copa.txt → goal detail, keyed by kickoff date + team pair
// ---------------------------------------------------------------------------

const pairKey = (a, b) => [canon(a), canon(b)].sort().join('|')
const ofKey = (date, a, b) => `${date}|${pairKey(a, b)}`

const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

// A fixture line, e.g.
//   Thu Jun 20 20:00 UTC-4   Argentina  2-0  Canada  @ Mercedes-Benz Stadium, …
//   Sat Jul 6 15:00 UTC-7    Uruguay  4-2 pen. (0-0)  Brazil  @ …
//   Sat Jul 14 20:00 UTC-4   Argentina 1-0 a.e.t. (0-0) Colombia  @ …
// The DECISIVE score — the one that stands after 90 or 120 minutes, and the one
// the app stores in `score` — is the LEADING pair except after a shootout: cup.txt
// writes "4-2 pen. (1-1)" as shootout-then-standing, but "1-0 a.e.t. (0-0)" as
// after-extra-time-then-after-90. So `pen.` takes the bracketed pair and `a.e.t.`
// takes the leading one.
const FIXTURE = new RegExp(
  '^\\w{3}\\s+(\\w{3})\\s+(\\d{1,2})\\s+\\d{1,2}:\\d{2}\\s+UTC[-+]\\d+\\s+' + // date + time
    '(.+?)\\s+' + // team 1
    '(\\d+)-(\\d+)' + // headline score
    '(?:\\s+(pen\\.|a\\.e\\.t\\.)\\s*\\((\\d+)-(\\d+)\\))?' + // optional pen./a.e.t. + standing score
    '\\s+([^@]+?)\\s*(?:@.*)?$', // team 2, then the optional venue
)

// A goals line: an indented, fully parenthesised list — team-1 scorers, then
// `;`, then team-2 scorers. Nested "(pen.)" / "(o.g.)" markers mean a balanced
// group can't be grabbed with a regex, so take the outer parentheses by position.
//
// TRAP: the `;` appears only when BOTH sides scored. In a 0–1 the whole list
// belongs to the side that scored, so splitting on `;` and taking [0] as team 1
// silently attributes every goal to the wrong team — which the parsed-vs-score
// count check below catches, and which is why that check exists.
const GOALS_LINE = /^\s+\((.*)\)\s*$/

// One scorer entry inside a side's list: a name, then one or more minutes.
// Minutes look like 49', 45+4', 90+1', each optionally followed by (pen.) or
// (o.g.); repeats for the same scorer are comma-separated ("La. Martínez 47', 86'").
const SCORER =
  /([^\d;]+?)\s+((?:\d+(?:\+\d+)?'(?:\s*\((?:pen|o\.g)\.\))?)(?:\s*,\s*\d+(?:\+\d+)?'(?:\s*\((?:pen|o\.g)\.\))?)*)/g
const MINUTE = /(\d+)(?:\+(\d+))?'(?:\s*\((pen|o\.g)\.\))?/g

function parseSide(text) {
  const goals = []
  if (!text || !text.trim()) return goals
  SCORER.lastIndex = 0
  let hit
  while ((hit = SCORER.exec(text))) {
    const name = hit[1].replace(/^[\s,]+|[\s,]+$/g, '')
    MINUTE.lastIndex = 0
    let m
    while ((m = MINUTE.exec(hit[2]))) {
      // A stoppage-time goal ("90+1'") is recorded at the regulation minute it
      // is shown against, which is how the Euro feed states them too.
      const g = { name, minute: Number(m[1]) }
      if (m[3] === 'pen') g.penalty = true
      if (m[3] === 'o.g') g.og = true
      goals.push(g)
    }
  }
  return goals
}

// Parse copa.txt into { key -> { team1, team2, ft, g1, g2 } }. Exported so the
// parse can be exercised directly rather than only through a network fetch.
export function parseCupTxt(text) {
  const map = new Map()
  let last = null
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue

    // Strip the trailing lineage comment ("# Winner Group A - Runner-up Group B")
    // before matching: the venue is optional in the pattern, the comment is not
    // part of it, and (see the header) the comment is unreliable anyway.
    const fx = FIXTURE.exec(raw.split('#')[0].trim())
    if (fx) {
      const [, mon, day, team1, ha, hb, marker, pa, pb, team2] = fx
      if (!MONTHS[mon]) throw new Error(`Unknown month "${mon}" in copa.txt line: ${raw}`)
      const date = `${EDITION.year}-${MONTHS[mon]}-${String(day).padStart(2, '0')}`
      const ft =
        marker === 'pen.' ? [Number(pa), Number(pb)] : [Number(ha), Number(hb)]
      last = { team1: canon(team1.trim()), team2: canon(team2.trim()), ft, g1: [], g2: [] }
      map.set(ofKey(date, last.team1, last.team2), last)
      continue
    }

    const gl = GOALS_LINE.exec(raw)
    if (gl && last) {
      const parts = gl[1].split(';')
      if (parts.length > 1) {
        last.g1 = parseSide(parts[0])
        last.g2 = parseSide(parts[1])
      } else if (last.ft[0] === 0) {
        // Only one side scored, and it wasn't team 1 (see the TRAP note above).
        last.g2 = parseSide(parts[0])
      } else {
        last.g1 = parseSide(parts[0])
      }
      last = null
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

// 'YYYY-MM-DD' ± n days, without pulling in a date library.
const shiftDate = (date, days) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)

function buildMatches(events, ofIndex) {
  assert(
    events.length === EDITION.matches,
    `Expected ${EDITION.matches} matches from ESPN, got ${events.length}. ` +
      `A short read is indistinguishable from a quiet tournament — refusing to write.`,
  )

  const groupEvents = events.filter((e) => e.stage === 'Group')
  const knockoutEvents = events.filter((e) => e.stage !== 'Group')

  assert(
    knockoutEvents.length === KNOCKOUT.length,
    `Expected ${KNOCKOUT.length} knockout matches, got ${knockoutEvents.length}`,
  )

  // Group matches take CONMEBOL's official numbering 1–24, which is NOT
  // chronological: the fixture list runs matchday-major then group-major, so
  // match 3 (Mexico v Jamaica, Group B) kicked off three hours AFTER match 4
  // (Ecuador v Venezuela, same group). ESPN minted its group-stage event ids in
  // that same fixture-list order — checked row by row against CONMEBOL's
  // published match schedule — so ascending event id reproduces it, and it also
  // disambiguates the eight simultaneous final-matchday kickoffs that a kickoff
  // sort cannot separate.
  const numbered = groupEvents
    .slice()
    .sort((a, b) => Number(a.espnId) - Number(b.espnId))
    .map((e, i) => ({ ...e, num: i + 1 }))

  // Knockout slots are matched by kickoff instant, never by sort position — see
  // the note on KNOCKOUT: ESPN's knockout ids ARE chronological and CONMEBOL's
  // numbering is not, so the two disagree on 27/28.
  const byKo = new Map(knockoutEvents.map((e) => [e.koKey, e]))
  for (const slot of KNOCKOUT) {
    const event = byKo.get(slot.ko)
    assert(event, `No ${slot.stage} event kicking off at ${slot.ko} for match ${slot.num}`)
    assert(
      event.stage === slot.stage,
      `Match ${slot.num} expected stage ${slot.stage}, ESPN says ${event.stage}`,
    )
    numbered.push({
      ...event,
      num: slot.num,
      // Placeholder labels survive only while a match is unplayed; once it has a
      // result the real teams are what ESPN reports.
      label1: slot.t1,
      label2: slot.t2,
    })
  }
  assert(
    new Set(numbered.map((m) => m.num)).size === EDITION.matches,
    'Duplicate match numbers after numbering',
  )

  // Attach goal detail and cross-check the score against OpenFootball.
  const disagreements = []
  let joined = 0
  const enriched = numbered.map((m) => {
    const date = m.ko.slice(0, 10)
    // copa.txt states each kickoff in the VENUE's local zone, so a late Pacific
    // game could in principle carry a different Eastern date. No 2024 fixture
    // actually crosses midnight either way, but the ±1-day fallback keeps the
    // join honest without loosening it to the team pair alone — Argentina v
    // Canada is played twice (match 1 and the semi-final), so the pair is not a
    // unique key.
    const rec =
      ofIndex.get(ofKey(date, m.t1, m.t2)) ||
      ofIndex.get(ofKey(shiftDate(date, -1), m.t1, m.t2)) ||
      ofIndex.get(ofKey(shiftDate(date, 1), m.t1, m.t2))
    const out = { ...m }
    if (!rec) return out
    joined++

    // Orient OpenFootball's (team1, team2) onto our (t1, t2).
    const aligned = rec.team1 === m.t1
    if (m.score) {
      const theirs = aligned ? rec.ft : [rec.ft[1], rec.ft[0]]
      if (theirs[0] !== m.score[0] || theirs[1] !== m.score[1]) {
        disagreements.push(
          `match ${m.num} ${m.t1} v ${m.t2}: ESPN ${m.score.join('-')} vs ` +
            `OpenFootball ${theirs.join('-')}`,
        )
      }
    }
    const g1 = aligned ? rec.g1 : rec.g2
    const g2 = aligned ? rec.g2 : rec.g1
    // Second, independent check on the text parse: a scorer list that doesn't add
    // up to the scoreline means the parse dropped or invented a goal.
    if (m.score && (g1.length !== m.score[0] || g2.length !== m.score[1])) {
      disagreements.push(
        `match ${m.num} ${m.t1} v ${m.t2}: score ${m.score.join('-')} but parsed ` +
          `${g1.length}-${g2.length} scorers from copa.txt`,
      )
    }
    if (g1.length || g2.length) out.goals = { t1: g1, t2: g2 }
    return out
  })

  assert(
    joined === EDITION.matches,
    `Only ${joined}/${EDITION.matches} matches joined to copa.txt — the goal-detail ` +
      `source has moved; refusing to write a half-populated Golden Boot.`,
  )
  assert(
    disagreements.length === 0,
    `ESPN and OpenFootball disagree on ${disagreements.length} match(es):\n  ` +
      disagreements.join('\n  '),
  )

  return enriched.sort((a, b) => new Date(a.ko) - new Date(b.ko) || a.num - b.num)
}

function buildTeams(matches) {
  const groups = {}
  for (const m of matches) {
    if (m.stage !== 'Group') continue
    for (const name of [m.t1, m.t2]) {
      assert(FLAGS[name], `No flag for team "${name}" — add it to FLAGS`)
      groups[m.group] ??= []
      if (!groups[m.group].some((t) => t.name === name)) {
        groups[m.group].push({ name, flag: FLAGS[name] })
      }
    }
  }
  const letters = Object.keys(groups).sort()
  assert(
    letters.join('') === EDITION.groups.join(''),
    `Expected groups ${EDITION.groups.join('')}, got ${letters.join('')}`,
  )
  for (const g of letters) {
    assert(groups[g].length === 4, `Group ${g} has ${groups[g].length} teams, expected 4`)
    groups[g].sort((a, b) => a.name.localeCompare(b.name))
  }
  const total = letters.reduce((n, g) => n + groups[g].length, 0)
  assert(total === EDITION.teams, `Expected ${EDITION.teams} teams, got ${total}`)
  // Emit in group order, not in the order the fixture list happened to introduce
  // them — Object.keys(TEAMS) is the group order the whole app iterates in.
  return Object.fromEntries(letters.map((g) => [g, groups[g]]))
}

function buildVenues(matches) {
  const used = new Set(matches.map((m) => m.venue))
  assert(used.size === EDITION.venues, `Expected ${EDITION.venues} venues, got ${used.size}`)
  const out = {}
  for (const meta of Object.values(VENUE_META)) {
    if (!used.has(meta.key)) continue
    out[meta.key] = {
      name: meta.name,
      city: meta.city,
      country: EDITION.host,
      countryFlag: EDITION.hostFlag,
      tz: meta.tz,
      region: meta.region,
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const BANNER = (what) =>
  `// GENERATED by scripts/fetch-tournament.mjs — do not edit by hand.\n` +
  `// ${what}\n` +
  `// Sources: ESPN (structure, ids, scores) + OpenFootball (goal detail).\n` +
  `// Regenerate with: npm run fetch:tournament\n`

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function goalLiteral(g) {
  const bits = [`name: ${q(g.name)}`, `minute: ${g.minute}`]
  if (g.penalty) bits.push('penalty: true')
  if (g.og) bits.push('og: true')
  return `{ ${bits.join(', ')} }`
}

function matchLiteral(m) {
  const bits = [`num: ${m.num}`, `stage: ${q(m.stage)}`]
  if (m.group) bits.push(`group: ${q(m.group)}`)
  bits.push(`t1: ${q(m.t1)}`, `t2: ${q(m.t2)}`)
  if (m.label1) bits.push(`label1: ${q(m.label1)}`, `label2: ${q(m.label2)}`)
  bits.push(`venue: ${q(m.venue)}`, `ko: ${q(m.ko)}`, `espnId: ${q(m.espnId)}`)
  if (m.score) bits.push(`score: [${m.score.join(', ')}]`)
  if (m.aet) bits.push('aet: true')
  if (m.pens) bits.push(`pens: [${m.pens.join(', ')}]`)
  let line = `  { ${bits.join(', ')} }`
  if (m.goals) {
    const t1 = m.goals.t1.map(goalLiteral).join(', ')
    const t2 = m.goals.t2.map(goalLiteral).join(', ')
    line = `  {\n    ${bits.join(', ')},\n` + `    goals: { t1: [${t1}], t2: [${t2}] },\n  }`
  }
  return line
}

function renderMatches(matches) {
  const champion = championOf(matches)
  return (
    BANNER(`All ${matches.length} matches of CONMEBOL Copa América ${EDITION.year} in the USA.`) +
    `//\n` +
    `// \`ko\` is the kickoff instant as an ISO 8601 string with an explicit\n` +
    `// ${EDITION.tzOffset} offset (US Eastern, the timezone CONMEBOL published every\n` +
    `// kickoff in). The 14 host stadiums span four US timezones, so no single\n` +
    `// "local time" exists for the tournament; because the offset is explicit,\n` +
    `// \`new Date(ko)\` resolves to the correct absolute instant and can be\n` +
    `// formatted into ANY timezone — that is what powers both the "in your\n` +
    `// timezone" display and the per-venue local kickoff.\n` +
    `//\n` +
    `// \`label1\`/\`label2\` on a knockout match are the bracket placeholders the\n` +
    `// fixture list was drawn with ("Winner Group A"). They are kept alongside the\n` +
    `// resolved teams so the bracket can show a slot's provenance, and so an\n` +
    `// unplayed edition renders from the same records.\n` +
    `//\n` +
    `// \`aet\` marks extra time. CONMEBOL played extra time ONLY in the final; the\n` +
    `// three level quarter-finals and the third-place match went straight to\n` +
    `// penalties after 90 minutes, so they carry \`pens\` without \`aet\`.\n` +
    `//\n` +
    `// \`espnId\` is the ESPN event id, which the match detail modal uses to fetch\n` +
    `// that match's lineups and box score on demand rather than committing them.\n` +
    `//\n` +
    `// Champion: ${champion}.\n` +
    `\n` +
    `export const STAGE_LABELS = {\n` +
    `  Group: 'Group Stage',\n` +
    `  QF: 'Quarter-final',\n` +
    `  SF: 'Semi-final',\n` +
    `  '3rd': 'Third-place play-off',\n` +
    `  Final: 'Final',\n` +
    `}\n\n` +
    `export const STAGE_ORDER = ['Group', 'QF', 'SF', '3rd', 'Final']\n\n` +
    `export const MATCHES = [\n` +
    matches.map(matchLiteral).join(',\n') +
    `,\n].sort((a, b) => new Date(a.ko) - new Date(b.ko) || a.num - b.num)\n`
  )
}

function championOf(matches) {
  const final = matches.find((m) => m.stage === 'Final')
  if (!final?.score) return 'not yet decided'
  const [a, b] = final.pens || final.score
  return a === b ? 'not yet decided' : a > b ? final.t1 : final.t2
}

function renderTeams(groups) {
  const body = Object.entries(groups)
    .map(
      ([g, teams]) =>
        `  ${g}: [\n` +
        teams.map((t) => `    { name: ${q(t.name)}, flag: ${q(t.flag)} },`).join('\n') +
        `\n  ],`,
    )
    .join('\n')
  return (
    BANNER(
      `The ${EDITION.teams} teams of Copa América ${EDITION.year}, in their group-stage groups.`,
    ) +
    `\nexport const TEAMS = {\n${body}\n}\n\n` +
    `// Flat lookup: team name -> flag emoji.\n` +
    `export const FLAG_BY_TEAM = Object.values(TEAMS)\n` +
    `  .flat()\n` +
    `  .reduce((acc, t) => {\n` +
    `    acc[t.name] = t.flag\n` +
    `    return acc\n` +
    `  }, {})\n\n` +
    `// Sorted list of all team names (for the team filter).\n` +
    `export const ALL_TEAMS = Object.values(TEAMS)\n` +
    `  .flat()\n` +
    `  .map((t) => t.name)\n` +
    `  .sort((a, b) => a.localeCompare(b))\n`
  )
}

function renderVenues(venues) {
  const body = Object.entries(venues)
    .map(
      ([key, v]) =>
        `  ${key}: {\n` +
        `    name: ${q(v.name)},\n` +
        `    city: ${q(v.city)},\n` +
        `    country: ${q(v.country)},\n` +
        `    countryFlag: ${q(v.countryFlag)},\n` +
        `    tz: ${q(v.tz)},\n` +
        `    region: ${q(v.region)},\n` +
        `  },`,
    )
    .join('\n')
  return (
    BANNER(`The ${EDITION.venues} host venues of Copa América ${EDITION.year}.`) +
    `// \`tz\` is the IANA timezone of the stadium, used to show local kickoff time.\n` +
    `// Unlike a single-country tournament these genuinely differ: the hosts span US\n` +
    `// Eastern, Central, Arizona (which does not observe DST) and Pacific.\n` +
    `// \`region\` groups the host cities geographically for the venue filter.\n` +
    `\nexport const VENUES = {\n${body}\n}\n`
  )
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Copa América ${EDITION.year} — fetching ESPN + OpenFootball…`)

  const [espnDoc, ofText] = await Promise.all([
    getJson(`${ESPN}/scoreboard?dates=${EDITION.window}&limit=200`),
    getText(OPENFOOTBALL),
  ])

  const events = (espnDoc.events || []).map(normalizeEvent)
  const ofIndex = parseCupTxt(ofText)
  console.log(`  ESPN: ${events.length} events · OpenFootball: ${ofIndex.size} matches`)

  const matches = buildMatches(events, ofIndex)
  const teams = buildTeams(matches)
  const venues = buildVenues(matches)

  const withGoals = matches.filter((m) => m.goals).length
  const scorers = matches.reduce(
    (n, m) => n + (m.goals ? m.goals.t1.length + m.goals.t2.length : 0),
    0,
  )
  console.log(
    `  ${matches.length} matches · ${Object.keys(teams).length} groups · ` +
      `${Object.keys(venues).length} venues · ${withGoals} with goal detail (${scorers} goals)`,
  )
  console.log(`  Champion: ${championOf(matches)}`)

  const files = [
    ['src/data/matches.js', renderMatches(matches)],
    ['src/data/teams.js', renderTeams(teams)],
    ['src/data/venues.js', renderVenues(venues)],
  ]

  for (const [rel, text] of files) {
    const path = join(ROOT, rel)
    let before = ''
    try {
      before = readFileSync(path, 'utf8')
    } catch {
      // new file
    }
    if (before === text) {
      console.log(`  = ${rel} unchanged`)
      continue
    }
    if (DRY) {
      console.log(`  ~ ${rel} would change (${before.length} → ${text.length} bytes)`)
      continue
    }
    writeFileSync(path, text)
    console.log(`  ✓ ${rel} written (${text.length} bytes)`)
  }
}

main().catch((err) => {
  console.error(`\nfetch-tournament failed:\n  ${err.message}\n`)
  process.exit(1)
})
