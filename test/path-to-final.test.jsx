import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { knockoutTeams, pathToFinal, matchesByNum } from '../src/utils/bracket.js'
import { PathProvider as PP, usePath } from '../src/context/path.jsx'
import Bracket from '../src/components/Bracket.jsx'
import RadialBracket from '../src/components/RadialBracket.jsx'
import PathPicker from '../src/components/PathPicker.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { DetailContext } from '../src/context/detail.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

Element.prototype.scrollIntoView = vi.fn()

// A blank board with a filled quarter-final (Match 25: Argentina v Ecuador),
// optionally carrying results down Argentina's winner chain 25→29→32. Copa's
// knockout starts at the quarter-finals, so that is the whole route: three
// matches, not the Euro's four.
function withPath(overrides = {}) {
  return MATCHES.map((m) => (overrides[m.num] ? { ...m, ...overrides[m.num] } : m))
}
const QF_TEAMS = { 25: { t1: 'Argentina', t2: 'Ecuador' }, 26: { t1: 'Venezuela', t2: 'Canada' } }

const renderWith = (ui, { pathTeam } = {}) => {
  if (pathTeam) localStorage.setItem('copa:pathTeam', pathTeam)
  return render(
    <FollowProvider>
      <PathProvider>
        <DetailContext.Provider value={vi.fn()}>{ui}</DetailContext.Provider>
      </PathProvider>
    </FollowProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('pathToFinal + knockoutTeams (util)', () => {
  it('lists the real teams in the quarter-finals, sorted', () => {
    const byNum = matchesByNum(withPath(QF_TEAMS))
    expect(knockoutTeams(byNum)).toEqual(['Argentina', 'Canada', 'Ecuador', 'Venezuela'])
  })

  it('returns null for a team not (yet) in the quarter-finals', () => {
    const byNum = matchesByNum(withPath(QF_TEAMS))
    expect(pathToFinal('Brazil', byNum)).toBeNull()
    expect(pathToFinal(null, byNum)).toBeNull()
  })

  it('traces the full winner route from the quarter-final to the Final', () => {
    const byNum = matchesByNum(withPath(QF_TEAMS))
    const p = pathToFinal('Argentina', byNum)
    expect(p.nums).toEqual([25, 29, 32])
    expect(p.active).toEqual([25, 29, 32]) // alive → whole route lit
    expect(p.here).toEqual([25]) // only the quarter-final has Argentina so far
    expect(p.exitNum).toBeNull()
    // The third-place play-off is NOT on anyone's route to the Final — it hangs
    // off the bracket, so a loser's trace must not pick it up.
    expect(p.nums).not.toContain(31)
  })

  it('stops the active stretch at the match where the team was eliminated', () => {
    // Ecuador beat Argentina in the quarter-final.
    const byNum = matchesByNum(withPath({ 25: { t1: 'Argentina', t2: 'Ecuador', score: [0, 1] } }))
    const p = pathToFinal('Argentina', byNum)
    expect(p.exitNum).toBe(25)
    expect(p.active).toEqual([25]) // nothing downstream is lit once out
  })

  it('breaks a quarter-final draw on penalties to decide the exit', () => {
    // The real thing: three of the four quarter-finals went straight to a
    // shootout at 90 minutes, with no extra time at all.
    const byNum = matchesByNum(
      withPath({ 25: { t1: 'Argentina', t2: 'Ecuador', score: [1, 1], pens: [3, 4] } }),
    )
    expect(pathToFinal('Argentina', byNum).exitNum).toBe(25) // lost the shootout
    expect(pathToFinal('Ecuador', byNum).exitNum).toBeNull() // advanced
  })

  it('keeps the team alive through a win and follows it into the next round', () => {
    const byNum = matchesByNum(
      withPath({ 25: { t1: 'Argentina', t2: 'Ecuador', score: [2, 0] }, 29: { t1: 'Argentina' } }),
    )
    const p = pathToFinal('Argentina', byNum)
    expect(p.here).toEqual([25, 29])
    expect(p.exitNum).toBeNull()
    expect(p.active).toEqual([25, 29, 32])
  })

  it('treats a drawn tie with no shootout as unsettled — neither out nor through', () => {
    const byNum = matchesByNum(withPath({ 25: { t1: 'Argentina', t2: 'Ecuador', score: [1, 1] } }))
    // No winner decided yet → the team is neither eliminated nor advanced.
    expect(pathToFinal('Argentina', byNum).exitNum).toBeNull()
    expect(pathToFinal('Ecuador', byNum).exitNum).toBeNull()
  })
})

describe('PathProvider context', () => {
  const wrapper = ({ children }) => <PP>{children}</PP>

  it('persists the selection and clears it from localStorage', () => {
    const { result } = renderHook(() => usePath(), { wrapper })
    act(() => result.current.setPathTeam('Argentina'))
    expect(localStorage.getItem('copa:pathTeam')).toBe('Argentina')
    act(() => result.current.setPathTeam(null))
    expect(localStorage.getItem('copa:pathTeam')).toBeNull()
  })

  it('falls back to null when reading localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => usePath(), { wrapper })
    expect(result.current.pathTeam).toBeNull()
    spy.mockRestore()
  })

  it('swallows localStorage write errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { result } = renderHook(() => usePath(), { wrapper })
    expect(() => act(() => result.current.setPathTeam('Uruguay'))).not.toThrow()
    spy.mockRestore()
  })

  it('returns inert defaults without a provider', () => {
    const { result } = renderHook(() => usePath())
    expect(result.current.pathTeam).toBeNull()
    expect(() => result.current.setPathTeam('x')).not.toThrow()
  })
})

describe('PathPicker', () => {
  const fullRun = {
    25: { t1: 'Argentina', t2: 'Ecuador', score: [2, 0] },
    29: { t1: 'Argentina', score: [1, 0] },
    32: { t1: 'Argentina', score: [1, 0] },
  }

  it('renders nothing until the quarter-finals have real teams', () => {
    const { container } = renderWith(<PathPicker byNum={matchesByNum(MATCHES)} />)
    expect(container.querySelector('.path-picker')).toBeNull()
  })

  it('selecting a team from the dropdown sets the path and shows a status', () => {
    renderWith(<PathPicker byNum={matchesByNum(withPath(QF_TEAMS))} />)
    fireEvent.change(screen.getByLabelText(/Path to the Final/), { target: { value: 'Argentina' } })
    expect(screen.getByText(/Up next/)).toBeInTheDocument()
    // Clearing removes the status.
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }))
    expect(screen.queryByText(/Up next/)).not.toBeInTheDocument()
  })

  it('clears the path by picking the empty option back out of the dropdown', () => {
    // The "Pick a team…" entry carries an empty value; choosing it has to clear
    // the highlight rather than trace a team with no name.
    renderWith(<PathPicker byNum={matchesByNum(withPath(QF_TEAMS))} />)
    const select = screen.getByLabelText(/Path to the Final/)
    fireEvent.change(select, { target: { value: 'Argentina' } })
    expect(screen.getByText(/Up next/)).toBeInTheDocument()
    fireEvent.change(select, { target: { value: '' } })
    expect(screen.queryByText(/Up next/)).not.toBeInTheDocument()
    expect(select.value).toBe('')
  })

  it('summarizes a team that has reached the Final but not yet played it', () => {
    // Everything up to the Final is decided and Argentina are in it — one step
    // short of the champions line, which only lands once the Final is final.
    const inTheFinal = {
      25: { t1: 'Argentina', t2: 'Ecuador', score: [2, 0] },
      29: { t1: 'Argentina', score: [1, 0] },
      32: { t1: 'Argentina', t2: 'Colombia' },
    }
    renderWith(<PathPicker byNum={matchesByNum(withPath(inTheFinal))} />, { pathTeam: 'Argentina' })
    expect(screen.getByText(/In the Final/)).toBeInTheDocument()
    expect(screen.queryByText(/Champions/)).toBeNull()
  })

  it('summarizes "through to the next round" after winning its deepest match', () => {
    // Won the quarter-final (25); the semi-final (29) doesn't list Argentina
    // yet → "through to the Semi-final".
    renderWith(
      <PathPicker byNum={matchesByNum(withPath({ 25: { t1: 'Argentina', t2: 'Ecuador', score: [2, 0] } }))} />,
      { pathTeam: 'Argentina' },
    )
    expect(screen.getByText(/Through to the Semi-final/)).toBeInTheDocument()
  })

  it('summarizes elimination', () => {
    renderWith(
      <PathPicker byNum={matchesByNum(withPath({ 25: { t1: 'Argentina', t2: 'Ecuador', score: [0, 2] } }))} />,
      { pathTeam: 'Argentina' },
    )
    expect(screen.getByText(/Out — lost in the Quarter-final/i)).toBeInTheDocument()
  })

  it('summarizes a live match and the champion', () => {
    // Live in the quarter-final.
    const { unmount } = renderWith(
      <PathPicker byNum={matchesByNum(withPath({ 25: { t1: 'Argentina', t2: 'Ecuador', live: true } }))} />,
      { pathTeam: 'Argentina' },
    )
    expect(screen.getByText(/Playing now/)).toBeInTheDocument()
    unmount()
    // Won the Final → champions.
    renderWith(<PathPicker byNum={matchesByNum(withPath(fullRun))} />, { pathTeam: 'Argentina' })
    expect(screen.getByText(/Champions/)).toBeInTheDocument()
  })

  it('offers a quick chip for a followed knockout team', () => {
    localStorage.setItem('copa:followed', JSON.stringify(['Argentina']))
    renderWith(<PathPicker byNum={matchesByNum(withPath(QF_TEAMS))} />)
    const chip = screen.getByRole('button', { name: /Argentina/ })
    fireEvent.click(chip)
    expect(chip.className).toMatch(/active/)
    fireEvent.click(chip) // toggles back off
    expect(chip.className).not.toMatch(/active/)
  })
})

describe('Bracket path highlight', () => {
  it('marks the route boxes on-path and dims the rest', () => {
    const { container } = renderWith(
      <Bracket matches={withPath(QF_TEAMS)} tz="America/New_York" hideScores={false} />,
      { pathTeam: 'Argentina' },
    )
    expect(container.querySelector('.bracket-wrap.has-path')).toBeTruthy()
    for (const n of [25, 29, 32]) {
      expect(document.getElementById(`bx-m${n}`).classList.contains('on-path')).toBe(true)
    }
    expect(document.getElementById('bx-m27').classList.contains('on-path')).toBe(false)
    // The third-place play-off is off the route to the Final, so it stays dim.
    expect(document.getElementById('bx-m31').classList.contains('on-path')).toBe(false)
    // The traced team's name is emphasized inside its box.
    expect(document.querySelector('#bx-m25 .bx-side.on-path-team')).toBeTruthy()
  })

  it('flags the elimination box with the exit style and lights nothing beyond it', () => {
    renderWith(
      <Bracket matches={withPath({ 25: { t1: 'Argentina', t2: 'Ecuador', score: [0, 1] } })} tz="America/New_York" hideScores={false} />,
      { pathTeam: 'Argentina' },
    )
    const exit = document.getElementById('bx-m25')
    expect(exit.classList.contains('on-path')).toBe(true)
    expect(exit.classList.contains('path-exit')).toBe(true)
    expect(document.getElementById('bx-m29').classList.contains('on-path')).toBe(false)
  })

  it('shows no highlight when no team is selected', () => {
    const { container } = renderWith(
      <Bracket matches={withPath(QF_TEAMS)} tz="America/New_York" hideScores={false} />,
    )
    expect(container.querySelector('.bracket-wrap.has-path')).toBeNull()
    expect(document.querySelector('.bx-match.on-path')).toBeNull()
  })
})

describe('RadialBracket path highlight', () => {
  it('lights the route connectors and the team flags, dims the rest', () => {
    const { container } = renderWith(
      <RadialBracket matches={withPath(QF_TEAMS)} tz="America/New_York" hideScores={false} />,
      { pathTeam: 'Argentina' },
    )
    expect(container.querySelector('.radial-wrap.has-path')).toBeTruthy()
    // At least the QF matchup and Argentina's outer flag are on the route.
    expect(container.querySelectorAll('.rb-matchup.on-path').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.rb-node.on-path').length).toBeGreaterThan(0)
  })
})
