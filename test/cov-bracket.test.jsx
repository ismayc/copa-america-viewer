import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Bracket from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { STAGE_LABELS } from '../src/data/matches.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

Element.prototype.scrollIntoView = vi.fn()

const renderBracket = (matches, props = {}) => {
  const openDetail = vi.fn()
  render(
    <FollowProvider>
      <DetailContext.Provider value={openDetail}>
        <Bracket matches={matches} tz="America/New_York" hideScores={false} {...props} />
      </DetailContext.Provider>
    </FollowProvider>,
  )
  return { openDetail }
}

describe('Bracket — currentRound Final fallback', () => {
  let originalMM
  beforeEach(() => {
    vi.clearAllMocks()
    originalMM = window.matchMedia
    // Force the mobile branch so the round tabs (which use currentRound) render.
    window.matchMedia = (q) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  })
  afterEach(() => {
    window.matchMedia = originalMM
  })

  it('opens on the Final round when every knockout match is already decided', () => {
    // Give EVERY knockout match a final score and no live flag, so currentRound
    // finds no still-to-be-decided round and falls through to `return 'Final'`.
    const matches = MATCHES.map((m) =>
      m.stage === 'Group' ? m : { ...m, score: [2, 1], live: false },
    )
    renderBracket(matches)
    expect(
      screen.getByRole('tab', { name: STAGE_LABELS.Final }).getAttribute('aria-selected'),
    ).toBe('true')
    // The Final (M32) is shown — and so is the third-place play-off (M31), which
    // shares the Final round on mobile rather than getting a column of its own.
    expect(document.getElementById('bx-m32')).toBeInTheDocument()
    expect(document.getElementById('bx-m31')).toBeInTheDocument()
    // An earlier round is not rendered.
    expect(document.getElementById('bx-m25')).toBeNull()
  })
})
