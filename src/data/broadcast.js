// US broadcast & streaming for CONMEBOL Copa América 2024.
//
// FOX Sports held the English-language US rights and split the 32 matches across
// FOX, FS1 and FS2 — confirmed against ESPN's own broadcast fields for the
// tournament window, which show FS1 on 22 matches, FOX on 6 and FS2 on 4.
// (The sibling Euro viewer lists only FOX and FS1; FS2 is genuinely used here.)
// TelevisaUnivision held the Spanish-language rights, on Univision and TUDN with
// ViX streaming.
//
// Coverage is stated tournament-wide rather than per match, matching the sibling
// viewers: ESPN's per-match channel field intermittently drops and restores on
// matches this old, so committing it would flap against itself on regeneration
// for no real gain.
export const US_BROADCAST = {
  english: {
    language: 'English',
    tv: ['FOX', 'FS1', 'FS2'],
    freeOverTheAir: 'FOX',
    streaming: ['Fubo', 'YouTube TV', 'Hulu + Live TV', 'Sling TV'],
  },
  spanish: {
    language: 'Spanish',
    tv: ['Univision', 'TUDN'],
    freeOverTheAir: 'Univision',
    streaming: ['ViX', 'Fubo'],
  },
}
