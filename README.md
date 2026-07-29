# Copa América 2024 Schedule Viewer

[![CI](https://github.com/ismayc/copa-america-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/ismayc/copa-america-viewer/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://copa-america-viewer.netlify.app/coverage.json)](https://github.com/ismayc/copa-america-viewer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A React + Vite web app showing all 32 matches of CONMEBOL Copa América 2024
(United States) in **your** timezone, with where to watch, host city/stadium, a
bracket, group standings, and the full tie-breaker and qualification maths.

🔗 **Live:** https://copa-america-viewer.netlify.app · https://ismayc.github.io/copa-america-viewer/

**This is a completed edition.** Copa América 2024 finished on 14 July 2024
(Argentina 1–0 Colombia after extra time), and the schedule ships with every
result in it. It is kept here as a working archive — and as the shape the next
Copa América can slot straight into.

## Features

- **Your timezone** — kickoff times auto-convert to your detected timezone
  (switchable to 20+), with stadium-local time shown when it differs. They were
  published in US Eastern Time, and the 14 venues span four US zones.
- **Hover for home-country time** — hover a team in any view to see when the
  match kicked off back home; countries spanning multiple time zones (the United
  States, Brazil, Canada, Mexico, …) list each distinct local time.
- **Follow teams** — star any team to highlight it everywhere and filter to a
  one-click "⭐ My Teams" view (saved in your browser).
- **Next-match bar** — a countdown to the next kickoff (prioritising your
  followed teams, or "Live now"), with a jump-to-match button.
- **Goal alerts** — opt-in 🔔 browser notifications when a goal is scored (scorer,
  minute, and the running score), scoped to your followed teams or all matches.
- **Six views** — chronological schedule, a Sunday–Saturday week calendar, group
  standings, the knockout bracket, a radial bracket, and tournament stats.
- **Phone-friendly schedule** — past days collapse to tappable headers by default
  (or hide entirely), so the schedule opens on the day's games rather than a long
  scroll.
- **Match detail** — click any match for full venue/time/broadcast info, the
  status/clock, and a minute-by-minute event timeline (goals ⚽, cards 🟨🟥).
- **How to watch (US)** — English (FOX/FS1) & Spanish (Telemundo/Universo) TV and
  streaming per match; free over-the-air channels flagged.
- **Venues** — all 14 host stadiums with city and region. Two of them are in
  Kansas City — one in Kansas, one in Missouri — so venues are keyed by stadium
  rather than by city.
- **Filtering** — search, stage, group, team, host country, region, city/stadium,
  timeframe, and broadcast language. The scoped-search syntax (`team: Mexico`,
  `city: Arlington`, `stage: Final`, `group: C`) works across every view.
- **Group standings & qualification** — all four tables with CONMEBOL's official
  tie-breakers (points → **overall goal difference → goals scored → head-to-head**
  → fewest red cards → fewest yellow cards → drawing of lots), and who advances.
  Note the order: CONMEBOL puts overall goal difference *before* head-to-head, the
  reverse of UEFA — and that inversion is what separated Ecuador and Mexico, level
  on 4 points in Group B. A ⚖️ marker (and a plain-language note) explains any
  placing that came down to cards or to the drawing of lots.
- **Clinch & elimination detection** — teams are marked 🥇 Won group / 🥈 Group
  runner-up / ✅ Through / ❌ Out the moment the outcome is mathematically
  guaranteed, from an exact scoreline-enumeration engine. Only the top two of each
  group advance and there is no best-third race, so a team's fate depends on its
  own group alone — no cross-group bounding needed. Shown in the group tables and
  schedule cards, and resolved into the bracket (a clinched "Winner Group X" slot
  fills in everywhere).
- **"As it stands" quarter-finals** — under each group, where its current 1st /
  2nd would land in the knockout, with concrete opponents. Each projected match
  number links straight to that tie on the bracket, and the whole block can be
  toggled off.
- **QF Outlook** — while the group stage is in play, the share of remaining
  outcomes that put each team in each open quarter-final slot, computed by
  enumerating every still-possible group result over real **goal differences**
  (not just win/draw/loss) — which matters here, because goal difference is the
  first tie-breaker.
- **Scenarios** — pick results for the remaining group games and watch the tables,
  qualification and projected bracket move with you. A projected matchup gets a ✔️
  once it is mathematically locked, which can happen while its own group is still
  playing: a Winner-C v Runner-up-D tie is fixed the moment those two groups are
  settled, whatever the others do.
- **Bracket** — two-sided knockout bracket that fills in as teams resolve. Slots
  awaiting a result preview the **potential matchup**: a "Winner Match N" box shows
  the two candidate teams of the tie feeding it, cascading round by round. Unlike
  the European Championship, Copa América still plays a **third-place play-off**,
  which hangs off the bracket beside the Final and is fed by "Loser Match N".
- **Radial bracket** — a circular view: the eight quarter-finalists ring the
  outside and each winner advances one ring inward toward the trophy at the
  centre, with the third-place play-off below it. The champion's route lights up
  gold once it's decided.
- **Stats** — the Golden Boot race (ties never split, penalties noted, own goals
  excluded) plus tournament totals: matches, goals, goals per match, extra-time
  games and shootouts. Knockout match details add a **tale of the tape** — the two
  teams' tournament records side by side.
- **Add to calendar** — per-match `.ics` download, plus a `webcal://` subscription
  feed (all matches or just your teams).
- **Spoiler-free mode** — hide scores globally, per day, or per match.
- **Light/dark theme** — follows your system preference, with no flash on load.
- **Shareable URLs** — view, timezone, spoiler mode, and filters persist to the
  query string; links unfurl with a title/description preview in chat apps.
- **Accessible** — keyboard-navigable, focus-trapped modals that restore focus on
  close, and screen-reader labels on live/score badges.

### The live layer

The app keeps its full live-results layer even though this edition is finished,
so a future tournament's data drops in without re-plumbing: final scores from
[OpenFootball](https://github.com/openfootball/copa-america) (public domain, no
API key) and a live in-match score + clock overlaid from
[ESPN](https://www.espn.com/soccer/) while games are underway, with each match
showing how many independent sources confirm the result.

Two sources, not three. The sibling viewers cross-check against a third,
[TheSportsDB](https://www.thesportsdb.com/), which carries no Copa América data
on its free tier — verified by querying the Final's date and getting nothing back,
against a working Euro control. The reconciler is source-agnostic, so dropping it
took no code change.

## Develop

```bash
npm install
npm run dev             # http://localhost:5173
npm run build           # production build to dist/
npm run preview         # preview the production build
npm test                # run the Vitest suite
npm run coverage:badge  # tests + coverage, and refresh the badge endpoint
npm run check:bracket   # verify the knockout slot references are consistent
```

Every push runs the tests + build in GitHub Actions; pushes to `main` deploy to
Netlify and GitHub Pages only if they pass.

New to the code? [`ARCHITECTURE.md`](./ARCHITECTURE.md) maps the modules and how
data flows from the static schedule + live feeds through the standings, clinch,
projection and bracket-resolution layers to the views.

## Regenerating the data

```bash
npm run fetch:tournament   # rebuild src/data/{matches,teams,venues}.js
npm run fixture:official   # rebuild test/fixtures/official-kickoffs.js
```

`scripts/fetch-tournament.mjs` builds the committed schedule from **ESPN**
(structure, event ids, kickoffs, scores) and **OpenFootball** (goal scorers), and
**fails the build if the two disagree on any score** — so a silent data drift
can't land. `scripts/make-official-fixture.mjs` builds the kickoff fixture from
OpenFootball *only*, deliberately a different source, so the `data.test.js` check
comparing the two is a real cross-check rather than a tautology.

OpenFootball publishes this competition as plain text (`copa.txt`), not JSON —
there is no `.json` repo for it — so `src/services/results.js` carries a runtime
parser for that format.

### Two known upstream data quirks

- **`copa.txt` transposes the two 6 July quarter-finals.** It swaps the kickoff
  time *and* the venue of Colombia–Panama and Uruguay–Brazil. ESPN and CONMEBOL
  agree against the file, so the generator, the Netlify calendar function and the
  official-kickoff fixture all correct it. Do not "fix" it by editing the data.
- **The Final's kickoff genuinely differs between sources.** `copa.txt` has the
  scheduled 20:00 ET; ESPN has the actual 21:15, after the ~75-minute delay at the
  Hard Rock Stadium gates. The app keeps ESPN's actual time, and the fixture
  exports it as `SCHEDULED_NOT_ACTUAL` so the test asserts the divergence and its
  reason rather than skipping the match.

## Data sources

- **Schedule, groups, venues** — ESPN's CONMEBOL Copa América scoreboard,
  cross-checked against OpenFootball and frozen into
  [`test/fixtures/official-kickoffs.js`](./test/fixtures/official-kickoffs.js).
  The suite asserts every match's kickoff (to the minute, in ET), venue,
  knockout-bracket slot, and group assignment, plus structural invariants
  (complete round-robins, simultaneous final-matchday kickoffs, no team
  double-booked, valid bracket references, and every match's goal count equal to
  its scoreline).
- **Broadcast** — FOX Sports / NBCUniversal (Telemundo) US rights.
- **Results (source of record)** — OpenFootball `copa.txt` (public domain), final
  scores and goal timelines.
- **Live in-match scores** — ESPN's public scoreboard API (free, no API key,
  CORS-open). Used only while a match is underway, or just finished and
  OpenFootball hasn't posted yet; OpenFootball always wins once it has the score.

### A note on extra time

This edition played extra time in the **Final only**. Every other level knockout
tie went straight to penalties at 90 minutes — three of the four quarter-finals
and the third-place play-off. So a match carrying `pens` but no `aet` is correct
here, and a "helpful" fix that sets `aet` on every shootout is a bug.

See [`NEWS.md`](./NEWS.md) for the changelog.

## Credits

Created by [Chester Ismay](https://chester.rbind.io). Source on
[GitHub](https://github.com/ismayc/copa-america-viewer).

The soccer ball in the app icons and share image is from
[Google Noto Emoji](https://github.com/googlefonts/noto-emoji)
(Apache License 2.0).

## Disclaimer

An unofficial, non-commercial fan project. **Not affiliated with, endorsed by, or
sponsored by CONMEBOL.** “Copa América”, and team, broadcaster, and tournament
names are trademarks of their respective owners. Schedule and results data come
from the public-domain [OpenFootball](https://github.com/openfootball/copa-america)
project; live in-match scores come from [ESPN](https://www.espn.com/soccer/).
