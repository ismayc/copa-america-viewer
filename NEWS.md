# NEWS

A dated changelog for the Copa América 2024 Schedule Viewer. Each heading is a
calendar day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-07-28

First release. Built from the sibling
[`world-cup-viewer`](https://github.com/ismayc/world-cup-viewer), alongside
[`football-euros-viewer`](https://github.com/ismayc/football-euros-viewer), and
re-pointed at a completed edition so the next Copa América can slot straight in.

### Data

- **Copa América 2024 schedule and results.** `scripts/fetch-tournament.mjs`
  generates `src/data/{matches,teams,venues}.js` from ESPN's CONMEBOL Copa
  América scoreboard (structure, event ids, kickoffs, scores) merged with
  OpenFootball's `copa.txt` (goal scorers) — and fails the build if the two
  disagree on any score. All 32 matches, 16 teams, 14 US venues.
- **Kickoffs stored in US Eastern Time (`-04:00`)**, the offset CONMEBOL
  published them in. The venues span four US time zones.
- **OpenFootball publishes this competition as plain text, not JSON.** There is
  no `.json` repo for it, so `src/services/results.js` carries a runtime parser
  for the `copa.txt` format.
- **`test/fixtures/official-kickoffs.js` is generated from OpenFootball only**,
  deliberately a different source from the schedule generator's, so the
  comparison between them is a real cross-check rather than a tautology.
- **Verified the committed data independently**: 32 matches (24 group / 4 QF /
  2 SF / 1 third-place / 1 Final), 16 teams, 14 venues, 70 goals, and every
  scored match's goal count equal to its scoreline. The five goalless matches
  are real 0–0s.

### Two upstream data quirks, corrected

- **`copa.txt` transposes the two 6 July quarter-finals** — it swaps both the
  kickoff time *and* the venue of Colombia–Panama and Uruguay–Brazil. ESPN and
  CONMEBOL agree against the file. Corrected in three places (the data
  generator, the Netlify calendar function, and the official-kickoff fixture
  generator); never by editing the data.
- **The Final's kickoff genuinely differs between sources.** `copa.txt` has the
  scheduled 20:00 ET, ESPN the actual 21:15 after the ~75-minute delay at the
  Hard Rock Stadium gates. The app keeps ESPN's actual time; the fixture exports
  it as `SCHEDULED_NOT_ACTUAL` so `data.test.js` asserts the divergence and its
  reason rather than skipping the match.

### Format changes from the siblings

- **Four groups of four, top two advance, and no best-third race at all.** That
  removes a whole layer: clinch, elimination and opponent-lock detection are
  purely per-group here, with no cross-group bounding, no combinations table and
  no `third` clinch status. `ADVANCING_PER_GROUP` in `utils/qualification.js` is
  the single source of truth the engines read.
- **CONMEBOL tie-breakers** replace UEFA's: points → **overall goal difference →
  goals scored → head-to-head** → fewest red cards → fewest yellow cards →
  drawing of lots. The goal-difference-before-head-to-head inversion is the one
  worth guarding — it is what separated Ecuador and Mexico, level on 4 points in
  Group B.
- **The last criterion is a drawing of lots, not a ranking.** There is no
  ranking table in `src/data`; `byLots` stands in with a stable alphabetical
  order so the tables stay deterministic, and `TIEBREAK_LABEL` names it plainly.
- **The knockout starts at the quarter-finals** (`ENTRY_ROUND = 'QF'`), so the
  bracket has three rounds, the "Outlook" tab is the QF Outlook, and a group
  slot feeds a quarter-final rather than a Round of 16 or 32.
- **The third-place play-off is back.** The European Championship dropped its
  after 1980; Copa still plays it, as match 31. It hangs off the bracket beside
  the Final and is the only place the "Loser Match N" feed form is exercised —
  which the round-agnostic `feederTeams` helper handles with no special case.
- **Extra time in the Final only.** Every other level knockout tie went straight
  to penalties at 90 minutes, so `pens` without `aet` is correct here and a
  "helpful" fix that sets `aet` on every shootout is a bug.

### Sources

- **Two results sources, not three.** TheSportsDB carries no Copa América data
  on its free tier — verified by querying the Final's date and getting nothing
  back, against a working Euro control. `src/services/thesportsdb.js` is
  deleted; `reconcile.js` is source-agnostic and took the drop with no code
  change.
- **Both alias maps are empty, and the test refuses a dead key.** The inherited
  `ESPN_ALIASES` carried `'United States' → 'USA'`; here "United States" *is* the
  canonical name, so the alias rewrote it to a non-team and silently dropped
  every USA match. `test/team-resolution.test.js` now rejects any alias key that
  never appears in the captured feed.

### Fixes found while porting

- **The calendar modal advertised "All 104 matches"** and pointed its
  subscription feed at the Euro's Netlify host. Both were sibling remnants.
- **The Host country and Region filters could never match anything** — they were
  hard-coded to the World Cup's `['USA', 'Canada', 'Mexico']` and
  `['Western', 'Central', 'Eastern']`, neither of which appears in this venue
  table. Both are now derived from `VENUES`, so they cannot drift again. The
  `city: Dallas` search example was likewise unmatchable (this edition played in
  Arlington) and is now `city: Arlington`.
- **`matchCountry` only recognised the spelling `usa`,** so `country: america`
  matched nothing. It now accepts the synonym set on either spelling.
- **Pruned the orphaned best-thirds CSS** (~10 rule blocks) left behind when the
  third-place table was removed.

### Testing

- **805 tests across 84 files, 100% on the coverage badge.** The suite was
  migrated fixture by fixture rather than ported wholesale: an inherited fixture
  can be both inert *and* wrong (`group-stage-md3.js` was applying the Euro's
  *scores* to Copa match numbers), and a test built on another tournament's team
  names ranks an empty table and asserts nothing.
- **Removed a `v8 ignore` that was masking a live branch** in `Standings.jsx` —
  a through-on-top-two team sitting at rank 2 is perfectly reachable, and is now
  covered.
- **Added one where it is genuinely earned**: with four groups of four, the
  outlook enumeration tops out at 12⁴ = 20,736 combinations, three orders of
  magnitude below the iteration cap, so `chooseCaps`' walk-down fallback cannot
  run here. `test/cov-outlook-enum.test.js` asserts the ceiling that makes it
  unreachable, so the ignore fails loudly if that stops being true.

### Timezone determinism

- **The suite is pinned to `America/New_York` in `vite.config.js`.** Kickoffs are
  US evenings stored in ET, so most of them fall on the *next* calendar day in
  UTC — which made three day-heading / "what counts as today" tests pass locally
  and fail on a UTC CI runner. The sibling viewers never hit this: European
  evening kickoffs stay on the same UTC day. `test/timezone-pinned.test.js`
  asserts the pin is in effect, so removing it fails there loudly rather than as
  three unrelated red tests.

### Deployment

- Public GitHub repo `ismayc/copa-america-viewer`; GitHub Pages and Netlify both
  deploy from `main` on a green CI run.
- `netlify/functions/calendar.js` is **ESM on purpose** — the package is
  `"type": "module"`, and a CommonJS function 502s on the Netlify Git-build path.
