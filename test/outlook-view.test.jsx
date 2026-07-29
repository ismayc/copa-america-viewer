import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import OutlookView from '../src/components/OutlookView.jsx'

describe('OutlookView', () => {
  it('waits (no enumeration) when too many group games remain', () => {
    // Pre-tournament: all 24 group games unplayed → 3^24 outcomes, past the
    // exact-enumeration threshold, so it shows the "too many" notice rather than
    // spawning the worker.
    const { container } = render(<OutlookView matches={MATCHES} />)
    expect(screen.getByText(/Too many games remain/i)).toBeInTheDocument()
    expect(container.querySelector('.bo-count')).toHaveTextContent('24 group games left')
  })
})
