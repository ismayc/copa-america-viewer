import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import CalendarModal from '../src/components/CalendarModal.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

// Spy on the ICS helpers so download buttons don't touch the DOM/URL APIs.
import * as ics from '../src/utils/ics.js'

function renderModal({ followedTeams = [], onClose = vi.fn() } = {}) {
  localStorage.setItem('copa:followed', JSON.stringify(followedTeams))
  const filtered = MATCHES.slice(0, 5)
  render(
    <FollowProvider>
      <CalendarModal matches={MATCHES} filtered={filtered} onClose={onClose} />
    </FollowProvider>,
  )
  return { onClose, filtered }
}

describe('CalendarModal', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('renders the all-matches subscribe row and download buttons (no followed teams)', () => {
    renderModal()
    expect(screen.getByText('📅 Calendar')).toBeInTheDocument()
    expect(screen.getByText('All 32 matches')).toBeInTheDocument()
    // "My teams" rows/buttons absent when count === 0.
    expect(screen.queryByText(/My teams/)).not.toBeInTheDocument()
    expect(screen.getByText(`All matches (${MATCHES.length})`)).toBeInTheDocument()
  })

  it('shows the My teams subscribe row and download when teams are followed', () => {
    renderModal({ followedTeams: ['Germany', 'Denmark'] })
    expect(screen.getByText('My teams (2)')).toBeInTheDocument()
    const myMatches = MATCHES.filter((m) => m.t1 === 'Germany' || m.t2 === 'Germany' || m.t1 === 'Denmark' || m.t2 === 'Denmark')
    expect(screen.getByText(`My teams (${myMatches.length})`)).toBeInTheDocument()
  })

  it('closes via the overlay, close button, and stops propagation inside the card', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    // Clicking inside the card must NOT close (stopPropagation).
    fireEvent.click(screen.getByText('📅 Calendar'))
    expect(onClose).not.toHaveBeenCalled()
    // Close button.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    // Overlay click.
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('downloads all matches and current filter via the ICS helper', () => {
    const spy = vi.spyOn(ics, 'downloadICSCollection').mockImplementation(() => {})
    const { filtered } = renderModal()
    fireEvent.click(screen.getByText(`All matches (${MATCHES.length})`))
    fireEvent.click(screen.getByText(`Current filter (${filtered.length})`))
    expect(spy).toHaveBeenCalledWith(MATCHES, 'copa-america-2024-all.ics')
    expect(spy).toHaveBeenCalledWith(filtered, 'copa-america-2024-filtered.ics')
  })

  it('downloads my-teams matches when followed', () => {
    const spy = vi.spyOn(ics, 'downloadICSCollection').mockImplementation(() => {})
    renderModal({ followedTeams: ['Germany'] })
    const myMatches = MATCHES.filter((m) => m.t1 === 'Germany' || m.t2 === 'Germany')
    fireEvent.click(screen.getByText(`My teams (${myMatches.length})`))
    expect(spy).toHaveBeenCalledWith(myMatches, 'copa-america-2024-my-teams.ics', 'Copa América 2024 — My Teams')
  })

  it('copies the feed URL to the clipboard and shows "Copied!" then reverts', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText } })
    renderModal()
    const row = screen.getByText('All 32 matches').closest('.cal-row')
    fireEvent.click(within(row).getByText('Copy URL'))
    expect(writeText).toHaveBeenCalled()
    // Async state update flips the label to "Copied!".
    expect(await within(row).findByText('Copied!')).toBeInTheDocument()
    // After 1.5s the setTimeout reverts it.
    await waitFor(() => expect(within(row).getByText('Copy URL')).toBeInTheDocument(), { timeout: 2500 })
  })

  it('swallows clipboard failures without showing "Copied!"', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')))
    Object.assign(navigator, { clipboard: { writeText } })
    renderModal()
    const row = screen.getByText('All 32 matches').closest('.cal-row')
    fireEvent.click(within(row).getByText('Copy URL'))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(within(row).queryByText('Copied!')).not.toBeInTheDocument()
  })
})
