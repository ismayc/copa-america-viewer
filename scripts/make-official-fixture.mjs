// Regenerates test/fixtures/official-kickoffs.js — the authoritative fixture the
// committed schedule is tested against.
//
// The point of the fixture is that it comes from a DIFFERENT source than the one
// that built src/data/matches.js. The builder (scripts/fetch-tournament.mjs)
// takes its structure and kickoff instants from ESPN; this takes them from
// OpenFootball's public-domain copa.txt, which publishes each kickoff in the
// venue's own local time (with its UTC offset stated on the line) plus the
// stadium. test/data.test.js then asserts the two independently-sourced views of
// the same tournament agree — so a silent shift in either feed fails the build
// instead of quietly rewriting history.
//
// Times are restated in US EASTERN, the timezone CONMEBOL published the fixture
// list in and the one the committed schedule stores. Venues are keyed by STADIUM
// rather than city because two host cities are both called Kansas City (Children's
// Mercy Park in Kansas, Arrowhead in Missouri) — city alone cannot tell them apart.
//
// KNOWN UPSTREAM DEFECT, corrected here. copa.txt has the kickoff time and venue
// of the two 6 July quarter-finals transposed: it files Colombia–Panama at
// Allegiant Stadium (Las Vegas) and Uruguay–Brazil at State Farm Stadium
// (Glendale), which is the wrong way round — ESPN and CONMEBOL both have it the
// other way. Those two records are swapped back below, and the swap is called out
// in the generated file. Everything else is taken from copa.txt untouched, so the
// cross-check remains genuine for the other thirty matches.
//
// Node built-ins only.
//
//   node scripts/make-official-fixture.mjs

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OPENFOOTBALL =
  'https://raw.githubusercontent.com/openfootball/copa-america/master/2024--usa/copa.txt'

const YEAR = 2024
const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

const FIXTURE = new RegExp(
  '^\\w{3}\\s+(\\w{3})\\s+(\\d{1,2})\\s+(\\d{1,2}):(\\d{2})\\s+UTC([-+]\\d+)\\s+' +
    '(.+?)\\s+' + // team 1
    '(\\d+)-(\\d+)' + // headline score
    '(?:\\s+(?:pen\\.|a\\.e\\.t\\.)\\s*\\(\\d+-\\d+\\))?' + // optional marker + standing score
    '\\s+([^@]+?)\\s*(?:@\\s*(.*))?$', // team 2, then the optional venue
)

const HEADING = /^▪\s*(.+?)\s*$/

// copa.txt uses each stadium's unsponsored name; ESPN (and so the committed
// schedule) uses the sponsored one. Same ground either way — a naming
// convention, not a disagreement about where the match was played.
const STADIUM_ALIASES = { 'Arrowhead Stadium': 'GEHA Field at Arrowhead Stadium' }

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const pad = (n) => String(n).padStart(2, '0')

// An instant rendered as US Eastern 'YYYY-MM-DD HH:mm' (24h).
function easternKey(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t) => parts.find((p) => p.type === t).value
  const hour = g('hour') === '24' ? '00' : g('hour') // midnight quirk
  return `${g('year')}-${g('month')}-${g('day')} ${hour}:${g('minute')}`
}

const res = await fetch(OPENFOOTBALL)
if (!res.ok) throw new Error(`OpenFootball fetch failed: HTTP ${res.status}`)
const text = await res.text()

const rows = []
const groups = {}
let heading = null
for (const raw of text.split('\n')) {
  const line = raw.split('#')[0].trim()
  if (!line) continue

  const h = HEADING.exec(line)
  if (h && !/^Matchday/.test(h[1])) {
    heading = h[1].split('|')[0].trim()
    continue
  }
  // "Group A  |  Argentina  Peru  Chile  Canada" — the group's squad list.
  const gl = /^Group ([A-Z])\s*\|\s*(.+)$/.exec(line)
  if (gl) {
    heading = `Group ${gl[1]}`
    groups[gl[1]] = gl[2].trim().split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
    continue
  }

  const fx = FIXTURE.exec(line)
  if (!fx) continue
  const [, mon, day, hh, mm, off, team1, , , team2, venue] = fx
  if (!MONTHS[mon]) continue
  const instant = new Date(
    Date.UTC(YEAR, Number(MONTHS[mon]) - 1, Number(day), Number(hh) - Number(off), Number(mm)),
  )
  const date = `${YEAR}-${MONTHS[mon]}-${pad(day)}`
  const t1 = team1.trim()
  const t2 = team2.trim()
  rows.push({
    key: `${date}|${[t1, t2].sort().join('|')}`,
    instant,
    stadium: (() => { const v = (venue || '').split(',')[0].trim(); return STADIUM_ALIASES[v] || v })(),
    group: heading && heading.startsWith('Group ') ? heading.slice(6) : null,
    round: heading,
  })
}

if (rows.length !== 32) throw new Error(`Expected 32 matches, got ${rows.length}`)
if (Object.keys(groups).length !== 4) {
  throw new Error(`Expected 4 groups, got ${Object.keys(groups).length}`)
}

// Undo the upstream transposition (see the header) — keyed by team pair, which
// the defect leaves intact.
const TRANSPOSED = [['Colombia', 'Panama'], ['Brazil', 'Uruguay']]
const hits = TRANSPOSED.map(([a, b]) => rows.find((r) => r.key.endsWith(`${a}|${b}`)))
if (hits.some((r) => !r)) {
  throw new Error('Could not find both transposed quarter-finals — has copa.txt changed?')
}
const [a, b] = hits
;[a.instant, b.instant] = [b.instant, a.instant]
;[a.stadium, b.stadium] = [b.stadium, a.stadium]

const lines = [
  `// GENERATED by scripts/make-official-fixture.mjs — do not edit by hand.`,
  `//`,
  `// Authoritative kickoff time, stadium and group for every match of CONMEBOL`,
  `// Copa América 2024, keyed by kickoff date + team pair and stated in US Eastern`,
  `// ('YYYY-MM-DD HH:mm', 24h) — the timezone CONMEBOL published the fixture list`,
  `// in. Venues are keyed by stadium, not city: two host cities are both named`,
  `// Kansas City (Children's Mercy Park in Kansas, Arrowhead in Missouri).`,
  `//`,
  `// Source: OpenFootball's public-domain copa.txt (2024--usa). This is`,
  `// deliberately a DIFFERENT source from the one that builds src/data/matches.js`,
  `// (ESPN), so test/data.test.js comparing them is a real cross-check rather than`,
  `// a restatement. If the two ever disagree, one of the feeds has moved and the`,
  `// disagreement is the finding — do not "fix" it by editing this file alone.`,
  `//`,
  `// ONE CORRECTION IS APPLIED at generation time: copa.txt transposes the kickoff`,
  `// time and venue of the two 6 July quarter-finals (Colombia–Panama and`,
  `// Uruguay–Brazil). ESPN and CONMEBOL agree with each other and against the file,`,
  `// so the generator swaps them back. The other thirty matches are untouched.`,
  `//`,
  `// Regenerate with: npm run fixture:official`,
  ``,
  `// The one match where the two sources genuinely differ, and why. copa.txt`,
  `// records the SCHEDULED kickoff; ESPN records the ACTUAL one. The Final kicked`,
  `// off about 75 minutes late after the crowd disturbances at the Hard Rock`,
  `// Stadium gates, and the committed schedule keeps ESPN's actual time — an`,
  `// archive of a finished tournament should say when the match was played.`,
  `// data.test.js asserts this exact divergence rather than skipping the match, so`,
  `// if either feed ever changes its mind the test says so.`,
  `export const SCHEDULED_NOT_ACTUAL = {`,
  `  '2024-07-14|Argentina|Colombia': { scheduled: '2024-07-14 20:00', actual: '2024-07-14 21:15' },`,
  `}`,
  ``,
  `export const OFFICIAL_ET = {`,
  ...rows.map((r) => `  ${q(r.key)}: ${q(easternKey(r.instant))},`),
  `}`,
  ``,
  `export const OFFICIAL_STADIUM = {`,
  ...rows.map((r) => `  ${q(r.key)}: ${q(r.stadium)},`),
  `}`,
  ``,
  `export const OFFICIAL_GROUPS = {`,
  ...Object.keys(groups)
    .sort()
    .map((g) => `  ${g}: [${[...groups[g]].sort().map(q).join(', ')}],`),
  `}`,
  ``,
  `// Round label per match, as OpenFootball states it.`,
  `export const OFFICIAL_ROUND = {`,
  ...rows.map((r) => `  ${q(r.key)}: ${q(r.round)},`),
  `}`,
  ``,
]

const path = join(ROOT, 'test/fixtures/official-kickoffs.js')
writeFileSync(path, lines.join('\n'))
console.log(`✓ ${rows.length} matches, ${Object.keys(groups).length} groups → ${path}`)
