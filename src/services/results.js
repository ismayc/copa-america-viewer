// Results from OpenFootball — free, public domain, served from GitHub raw with
// `access-control-allow-origin: *`, so it works straight from the browser with
// no API key. Updated by commits during a tournament (typically same-day /
// post-match) rather than minute-by-minute, which suits a frontend-only app.
//
// FORMAT DIFFERENCE FROM THE SIBLING VIEWERS. The World Cup and Euro apps read a
// ready-made JSON feed (`worldcup.json`, `euro.json`). There is no equivalent
// `.json` repo for the Copa América — OpenFootball publishes this competition
// only as the plain-text `copa.txt` fixture file — so this module parses that
// text itself. The parser is the same one `scripts/fetch-tournament.mjs` uses at
// build time, kept in sync deliberately: the build-time copy cross-checks every
// score against ESPN and fails the build on a mis-parse, which is what gives us
// confidence in the shape this runtime copy relies on.
//
// It is also why this app reconciles across TWO sources rather than three.
// TheSportsDB, the third source in the sibling apps, carries no Copa América
// data on its free tier — verified by querying the Final's date and getting
// nothing back, against a working Euro control.
//
// Matching strategy (feed match -> our static schedule): the KICKOFF DATE plus
// the (order-independent) team pair. copa.txt carries no match numbers, so there
// is nothing else stable to key on — and the pair is only ambiguous if the same
// two teams meet twice in a day, which no tournament format allows.
//
// A knockout tie can therefore only be matched once BOTH sides are real teams:
// while our schedule still says "Winner Group A" there is no pair to match, so
// the feed contributes nothing until the tie is filled in — by which point the
// result it carries is the one we want anyway. Group matches match from the
// start, since both teams are known at the draw.

import { FLAG_BY_TEAM } from '../data/teams.js'

export const RESULTS_SOURCE = {
  name: 'OpenFootball',
  url: 'https://raw.githubusercontent.com/openfootball/copa-america/master/2024--usa/copa.txt',
  homepage: 'https://github.com/openfootball/copa-america',
}

// copa.txt spellings that differ from ours. Empty for 2024: the file names all
// sixteen sides exactly as we do, "United States" included. The seam stays
// because an unmapped spelling fails silently — the lookup returns a non-team
// and the match is quietly dropped.
const ALIASES = {}

export function normalizeTeam(name) {
  if (!name) return name
  return ALIASES[name] || name
}

// A "real" team is one of the 16 qualified sides (not a placeholder like "2A").
export function isRealTeam(name) {
  return Boolean(FLAG_BY_TEAM[normalizeTeam(name)])
}

export function pairKey(a, b) {
  return 'pair:' + [a, b].sort().join('|')
}

// Date + pair. Our kickoffs are stored with an explicit US Eastern offset and
// the feed states each fixture's own local date, so both sides slice to the same
// calendar day.
const dayPairKey = (date, a, b) => `${date}|${pairKey(normalizeTeam(a), normalizeTeam(b))}`

// Matching key for one of our schedule matches. Null while a knockout slot is
// still a placeholder — there is no pair to match on yet.
export function matchKey(match) {
  if (!isRealTeam(match.t1) || !isRealTeam(match.t2)) return null
  return dayPairKey(String(match.ko).slice(0, 10), match.t1, match.t2)
}

// Final score for one of our matches, oriented by team name, for the score
// reconciler. OpenFootball only ever holds recorded (final) scores, so a present
// score is authoritative. Mirrors the getter in espn.js.
export function openFootballFinalScore(match, ofMap) {
  if (!ofMap) return null
  const rec = ofMap.get(matchKey(match))
  if (!rec?.score?.ft) return null
  // The decisive score (extra time when a knockout went to ET), matching what
  // the live source reports — so cross-source comparison doesn't false-flag.
  return { home: rec.home, away: rec.away, ft: rec.score.et || rec.score.ft }
}

// ---------------------------------------------------------------------------
// copa.txt parsing
// ---------------------------------------------------------------------------

const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

// A fixture line, e.g.
//   Thu Jun 20 20:00 UTC-4   Argentina  2-0  Canada  @ Mercedes-Benz Stadium, …
//   Sat Jul 6 15:00 UTC-7    Uruguay  4-2 pen. (0-0)  Brazil  @ …
//   Sun Jul 14 20:00 UTC-4   Argentina 1-0 a.e.t. (0-0) Colombia  @ …
//
// The headline score means different things either side of the marker: with
// `pen.` it is the SHOOTOUT tally and the bracketed pair is the level 90-minute
// score; with `a.e.t.` it is the decisive score AFTER extra time and the
// bracketed pair is the score at 90. Reading it the same way in both cases is
// the classic mis-parse, so the two are pulled apart explicitly below.
const FIXTURE = new RegExp(
  '^\\w{3}\\s+(\\w{3})\\s+(\\d{1,2})\\s+\\d{1,2}:\\d{2}\\s+UTC[-+]\\d+\\s+' + // date + time
    '(.+?)\\s+' + // team 1
    '(\\d+)-(\\d+)' + // headline score
    '(?:\\s+(pen\\.|a\\.e\\.t\\.)\\s*\\((\\d+)-(\\d+)\\))?' + // optional marker + standing score
    '\\s+([^@]+?)\\s*(?:@.*)?$', // team 2, then the optional venue
)

// A goals line: an indented, fully parenthesised list — team-1 scorers, then
// `;`, then team-2 scorers.
//
// TRAP: when only ONE side scored, the file writes a single list with no `;`,
// and that list belongs to the side that scored — so splitting on `;` and
// treating [0] as team 1 silently attributes every goal to the wrong team. The
// score is used to decide which side it belongs to.
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
      // A stoppage-time goal ("90+1'") is recorded at the regulation minute it is
      // shown against, which is how the sibling feeds state them too.
      goals.push({
        name,
        minute: Number(m[1]),
        penalty: m[3] === 'pen',
        og: m[3] === 'o.g',
      })
    }
  }
  return goals
}

// Pull the score shape out of a fixture line's captures. Returns
// { ft, et?, aet?, pens? } where `ft` is the 90-minute score and `et` (when a tie
// was decided in extra time) is the decisive one — the same shape the sibling
// viewers get from their JSON feeds, so everything downstream is unchanged.
function scoreFrom(ha, hb, marker, pa, pb) {
  const headline = [Number(ha), Number(hb)]
  if (marker === 'pen.') {
    return { ft: [Number(pa), Number(pb)], pens: headline }
  }
  if (marker === 'a.e.t.') {
    return { ft: [Number(pa), Number(pb)], et: headline, aet: true }
  }
  return { ft: headline }
}

// Parse copa.txt into the same { key -> record } map the JSON-fed siblings build.
// Exported so the parse can be exercised directly rather than only through fetch.
export function parseCupTxt(text, year = 2024) {
  const map = new Map()
  let last = null
  for (const raw of String(text).split('\n')) {
    if (!raw.trim()) continue

    // Strip the trailing lineage comment ("# Winner Group A - Runner-up Group B")
    // before matching: the venue is optional in the pattern and the comment is
    // not part of it.
    const fx = FIXTURE.exec(raw.split('#')[0].trim())
    if (fx) {
      const [, mon, day, team1, ha, hb, marker, pa, pb, team2] = fx
      if (!MONTHS[mon]) continue // not a fixture line after all
      const date = `${year}-${MONTHS[mon]}-${String(day).padStart(2, '0')}`
      const home = normalizeTeam(team1.trim())
      const away = normalizeTeam(team2.trim())
      last = { home, away, score: scoreFrom(ha, hb, marker, pa, pb), g1: [], g2: [] }
      map.set(dayPairKey(date, home, away), last)
      continue
    }

    const gl = GOALS_LINE.exec(raw)
    if (gl && last) {
      const parts = gl[1].split(';')
      if (parts.length > 1) {
        last.g1 = parseSide(parts[0])
        last.g2 = parseSide(parts[1])
      } else if ((last.score.et || last.score.ft)[0] === 0) {
        // Only one side scored, and it wasn't team 1 (see the TRAP note above).
        // Test against the DECISIVE score, not the 90-minute one: the Final
        // finished 0–0 at 90 and 1–0 after extra time, so reading `ft` here would
        // conclude team 1 hadn't scored and hand their goal to the opposition.
        last.g2 = parseSide(parts[0])
      } else {
        last.g1 = parseSide(parts[0])
      }
      last = null
    }
  }
  return map
}

export async function fetchResults(signal) {
  const res = await fetch(RESULTS_SOURCE.url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`Results request failed (HTTP ${res.status})`)
  const text = await res.text()
  // Guard against a 200 that isn't the feed we expect (a GitHub error page, an
  // empty file after a bad push) — better to surface an error than silently show
  // no results at all.
  const map = parseCupTxt(text)
  if (map.size === 0) throw new Error('Results feed contained no readable fixtures')
  return map
}

// Return a new matches array with feed scores merged in and knockout placeholders
// resolved to real teams where known. The static schedule is never mutated.
export function applyResults(matches, map) {
  if (!map || map.size === 0) return matches
  return matches.map((m) => {
    const rec = map.get(matchKey(m))
    if (!rec) return m

    if (m.stage === 'Group') {
      if (!rec.score) return m
      // Orient the score (and goals) to our (t1, t2) ordering. Guard: if the
      // record's home matches NEITHER of our teams (a normalization gap), don't
      // assume it's the away team and write a REVERSED score — skip it.
      const nt1 = normalizeTeam(m.t1)
      const nt2 = normalizeTeam(m.t2)
      if (rec.home !== nt1 && rec.home !== nt2) return m
      const aligned = rec.home === nt1
      const ft = aligned ? rec.score.ft : [rec.score.ft[1], rec.score.ft[0]]
      return { ...m, score: ft, goals: aligned ? { t1: rec.g1, t2: rec.g2 } : { t1: rec.g2, t2: rec.g1 } }
    }

    // Knockout: adopt real team names in the feed's (home, away) order so the
    // bracket fills in; the score, pens, and goals follow the same orientation.
    const out = { ...m }
    if (isRealTeam(rec.home)) out.t1 = rec.home
    if (isRealTeam(rec.away)) out.t2 = rec.away
    if (rec.score) {
      // Prefer the extra-time score when present — for a knockout decided in ET
      // (no shootout) the 90-minute `ft` is level and would leave the tie (and the
      // whole downstream bracket) unresolved.
      out.score = rec.score.et || rec.score.ft
      if (rec.score.pens) out.pens = rec.score.pens
      if (rec.score.aet) out.aet = true
      out.goals = { t1: rec.g1, t2: rec.g2 }
    }
    return out
  })
}
