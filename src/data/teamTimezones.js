// Home timezone(s) for each team's country, keyed by the exact team name used in
// teams.js. Countries that span more than one zone list each one (ordered
// west→east) so a hover can show every local kickoff time a fan back home might
// read off their own clock. Same-offset zones are collapsed at render time (see
// teamLocalKickoffs in utils/time.js), so listing a representative set per
// offset is enough — we don't enumerate every micro-zone.
//
// Unlike the mostly single-zone European field of the sibling Euro viewer, much
// of this field spans more than one clock: Brazil runs four zones, the United
// States six, Canada six, and Chile, Ecuador and Mexico each have an offshore or
// far-western zone (Easter Island, the Galápagos, Baja California) set apart
// from the mainland. That is the case this hover exists for, so they are listed
// in full.
export const TEAM_TIMEZONES = {
  // Group A
  Argentina: ['America/Argentina/Buenos_Aires'],
  Canada: [
    'America/Vancouver',
    'America/Edmonton',
    'America/Winnipeg',
    'America/Toronto',
    'America/Halifax',
    'America/St_Johns',
  ],
  Chile: ['Pacific/Easter', 'America/Santiago'],
  Peru: ['America/Lima'],

  // Group B
  Ecuador: ['Pacific/Galapagos', 'America/Guayaquil'],
  Jamaica: ['America/Jamaica'],
  Mexico: ['America/Tijuana', 'America/Hermosillo', 'America/Mexico_City', 'America/Cancun'],
  Venezuela: ['America/Caracas'],

  // Group C
  Bolivia: ['America/La_Paz'],
  Panama: ['America/Panama'],
  'United States': [
    'Pacific/Honolulu',
    'America/Anchorage',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
  ],
  Uruguay: ['America/Montevideo'],

  // Group D
  Brazil: ['America/Rio_Branco', 'America/Manaus', 'America/Sao_Paulo', 'America/Noronha'],
  Colombia: ['America/Bogota'],
  'Costa Rica': ['America/Costa_Rica'],
  Paraguay: ['America/Asuncion'],
}
