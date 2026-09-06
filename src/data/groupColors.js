// Distinct colors for the group stage, used to color-code the weekly calendar
// (and its legend). Knockout matches share one accent color.
//
// The map is DERIVED from the tournament's own groups rather than written out by
// hand. A hand-written list is silently wrong the moment it is copied to a sibling
// with a different group count: this file shipped six fixed letters to three
// viewers at once, which left the women's World Cup groups G and H with no color
// at all, and drew two dead swatches in Copa América's legend.
import { TEAMS } from './teams.js'

// Eight, so the largest field in the family is covered. Ordered so that adjacent
// groups never share a hue.
const PALETTE = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#a955f7',
  '#42d4f4',
  '#f032e6',
  '#00b8a9',
]

export const GROUP_COLORS = Object.fromEntries(
  Object.keys(TEAMS).map((g, i) => [g, PALETTE[i % PALETTE.length]]),
)

export const KNOCKOUT_COLOR = '#f4c542'

export function colorForMatch(m) {
  return m.stage === 'Group' ? GROUP_COLORS[m.group] : KNOCKOUT_COLOR
}
