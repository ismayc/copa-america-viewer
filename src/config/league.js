// The single source of this edition's identity, vocabulary, and display rules.
//
// Everything a component or util would otherwise hardcode inline lives here: the ESPN
// paths, the storage prefix, the match length, the .ics identity, the deploy host, the
// locale. The pattern comes from the-nfl-schedule; this is one of the tournament viewers in the family;
// womens-world-cup-viewer got this shape first and the three share it.
//
// Two rules this file is written to:
//
//   1. Every field below has a real consumer in src/. A field only a config reader
//      touches is a shallow module pretending to be a seam, and the NFL original grew
//      seven of them. The exceptions are marked: `title` and `themeColor` are consumed
//      by test/chrome-identity.test.js, because index.html and the manifest are static
//      files no module can import, and a test is the only thing that can hold them to
//      this file.
//
//   2. Structure stays out, and here that matters more than anywhere else in the
//      family. ADVANCING_PER_GROUP, ENTRY_ROUND, GROUP_MATCH_COUNT, the tie-break chain
//      and the slot grammar stay in utils/qualification.js, utils/slots.js and
//      utils/clinch.js. Those are RULES: this edition ranks on overall goal difference
//      BEFORE head-to-head, the inverse of the men's tournament, and that is a
//      different algorithm rather than a different constant. A config that tried to
//      hold it would be describing behavior, which is what stalled
//      sports-viewer-meta/adapters/.
//
// The file is named `league.js` across the whole family, including here where "league"
// is not the right noun. The convention is worth more than the precision: a maintainer
// moving between repos finds the same file at the same path. This is an EDITION, and it
// has finished; `season` and the year inside the .ics identity say which one.

export const LEAGUE = {
  id: 'copa',
  // The competition as the .ics summary prints it. Used in .ics event summaries.
  name: 'Copa América',
  // The full product title: index.html's <title> and the manifest's name.
  title: 'Copa América 2024 — Schedule Viewer',
  // The edition, used as a calendar name.
  edition: 'Copa América 2024',
  season: 2024,
  // site.web.api /apis/site/v2/sports/<espnPath>/…
  espnPath: 'soccer/conmebol.america',
  // sports.core.api spells it differently AND pins the season, because a finished
  // edition's stats live under that season and nowhere else.
  coreSeasonPath: 'soccer/leagues/conmebol.america/seasons/2024',
  storageKey: 'copa', // 'copa:theme', 'copa:followed', 'copa:matchLines:<id>', …
  // UI chrome only. Matches --bg in index.css, <meta name="theme-color">, and the
  // manifest's theme_color and background_color.
  themeColor: '#15171b',

  // ── Vocabulary ──────────────────────────────────────────────────────────────
  homeAwaySep: 'vs',

  // ── Time ────────────────────────────────────────────────────────────────────
  locale: 'en-US',
  // 90 minutes plus half time, added time, and the walk-up: the block a calendar should
  // reserve and the window in which a kicked-off match with no feed still reads as live.
  // Knockout ties can run to extra time and penalties and will overrun it; that is the
  // right trade for a calendar entry.
  matchLengthMinutes: 135,

  // ── Calendar export ─────────────────────────────────────────────────────────
  // The UID prefix carries the year deliberately. This edition is finished and the
  // committed schedule will not change, so a subscriber who also holds the 2027 feed
  // must not have one overwrite the other.
  ics: {
    prodId: '-//Copa América 2024 Viewer//EN',
    domain: 'copaamericaviewer',
    uidPrefix: 'copa2024-match-',
    filenameBase: 'copa-america-2024',
  },

  // Netlify serves /calendar.ics; GitHub Pages cannot run the function.
  feedHost: 'https://copa-america-viewer.netlify.app',
}
