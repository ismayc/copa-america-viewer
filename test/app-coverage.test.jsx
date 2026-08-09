import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { LIVE_SOURCE } from '../src/services/espn.js'
import { RESULTS_SOURCE } from '../src/services/results.js'

// This edition is finished, so the committed schedule ships every result — and
// the live overlay always defers to a recorded score, which would make the whole
// live subsystem (poll interval, live counter, goal notifications) unreachable
// from <App/>. Run these against a PRE-TOURNAMENT board instead: the state a
// future edition's data arrives in, and the only one where "live" means anything.
vi.mock('../src/data/matches.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    MATCHES: actual.MATCHES.map((m) => {
      const { score, pens, aet, goals, live, statusLabel, cards, ...rest } = m
      return m.label1 ? { ...rest, t1: m.label1, t2: m.label2 } : rest
    }),
  }
})

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) }))
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// --- ESPN scoreboard payload builders -------------------------------------
function espnEvent({ home, away, date, state, hs, as, goals = [] }) {
  const homeId = '1'
  const awayId = '2'
  const details = goals.map((g) => ({
    scoringPlay: true,
    team: { id: g.side === 'home' ? homeId : awayId },
    clock: { displayValue: `${g.minute}'` },
    athletesInvolved: [{ shortName: g.name }],
  }))
  return {
    id: `${home}-${away}`,
    date,
    competitions: [
      {
        status: { type: { state } },
        competitors: [
          { homeAway: 'home', team: { id: homeId, displayName: home }, score: hs },
          { homeAway: 'away', team: { id: awayId, displayName: away }, score: as },
        ],
        details,
      },
    ],
    status: {
      type: {
        state,
        shortDetail: state === 'in' ? "67'" : state === 'post' ? 'FT' : '',
        description: state === 'in' ? 'In Progress' : state === 'post' ? 'Full Time' : '',
      },
    },
  }
}

// The results feed is OpenFootball's PLAIN-TEXT copa.txt, not JSON — and the
// parser rejects a feed it can't read a single fixture out of, so a stub has to
// be a real (if partial) file. Group A's second fixture is scored here; Match 1
// is deliberately left open so the ESPN live overlay has somewhere to land (a
// match that already holds a score is never overwritten).
const COPA_TXT = [
  '= Copa América 2024      # in USA',
  '',
  '▪ Group A',
  '',
  'Fri Jun 21 19:00 UTC-5   Peru           0-0   Chile   @ AT&T Stadium, Arlington, Texas',
  '',
].join('\n')

// …and the same file with Match 1 scored too, for tests that need a group with
// enough results behind it to project a knockout slot.
const COPA_TXT_MD1 = [
  '= Copa América 2024      # in USA',
  '',
  '▪ Group A',
  '',
  'Thu Jun 20 20:00 UTC-4   Argentina      2-0   Canada  @ Mercedes-Benz Stadium, Atlanta, Georgia',
  'Fri Jun 21 19:00 UTC-5   Peru           0-0   Chile   @ AT&T Stadium, Arlington, Texas',
  '',
].join('\n')

function fetchWith(espnEvents, resultsText = COPA_TXT) {
  return vi.fn(async (url) => {
    if (typeof url === 'string' && url.startsWith(LIVE_SOURCE.url)) {
      return { ok: true, json: async () => ({ events: espnEvents }) }
    }
    return { ok: true, text: async () => resultsText, json: async () => ({ matches: [] }) }
  })
}

describe('App coverage', () => {
  it('mounts and shows the header', () => {
    render(<App />)
    expect(screen.getAllByText(/Copa América 2024/).length).toBeGreaterThan(0)
  })

  it('toggles the global spoiler (hideScores) button and resets day overrides', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Scores shown/ }))
    expect(screen.getByRole('button', { name: /Scores hidden/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Scores hidden/ }))
    expect(screen.getByRole('button', { name: /Scores shown/ })).toBeInTheDocument()
  })

  it('toggles theme (covers toggleTheme writing localStorage + dataset)', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Toggle theme/ }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('copa:theme')).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: /Toggle theme/ }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('opens and closes the calendar modal', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/All 32 matches/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Close/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('per-day spoiler + collapse toggles work', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-28T16:00:00Z'))
    try {
      render(<App />)
      const dayBtn = screen.getByRole('button', { name: /July 14, 2024/ })
      const daySection = dayBtn.closest('section.day')
      const spoiler = within(daySection).getByRole('button', { name: /Hide scores|Show scores/ })
      fireEvent.click(spoiler) // toggleDay
      fireEvent.click(spoiler)
      fireEvent.click(dayBtn) // toggleCollapsed
      expect(dayBtn).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(dayBtn)
      expect(dayBtn).toHaveAttribute('aria-expanded', 'true')
    } finally {
      vi.useRealTimers()
    }
  })

  // Pinned mid-tournament: the toggle is only interactive while matches remain
  // (once concluded it renders unticked + disabled — covered below).
  it('toggles auto-refresh checkbox and the manual Refresh button', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-28T16:00:00Z'))
    try {
      render(<App />)
      const auto = screen.getByRole('checkbox', { name: /auto/i })
      expect(auto).toBeChecked()
      expect(auto).toBeEnabled()
      fireEvent.click(auto)
      expect(auto).not.toBeChecked()
      fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('disables the auto-refresh toggle once the tournament has concluded', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-08-01T00:00:00Z')) // after the Final
    try {
      render(<App />)
      const auto = screen.getByRole('checkbox', { name: /auto/i })
      expect(auto).toBeDisabled()
      expect(auto).not.toBeChecked()
    } finally {
      vi.useRealTimers()
    }
  })

  it('hydrates state from the URL (view, tz, hide, filters)', () => {
    window.history.replaceState(
      null,
      '',
      '/?view=bracket&tz=America/New_York&hide=1&q=team:%20Canada&group=A&mine=0',
    )
    render(<App />)
    expect(screen.getByRole('button', { name: /Bracket/ }).className).toMatch(/active/)
    expect(screen.getByText(/America\/New York/)).toBeInTheDocument()
  })

  it('switches to week, groups, bracket views', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Week/ }))
    expect(screen.getAllByText(/Copa América 2024/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Groups/ }))
    expect(screen.getByText('Group A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bracket/ }))
    expect(screen.getAllByText(/Copa América 2024/).length).toBeGreaterThan(0)
    // The Radial view renders the circular bracket (RadialBracket).
    fireEvent.click(screen.getByRole('button', { name: /Radial/ }))
    expect(document.querySelector('.bracket-view')).toBeTruthy()
    // …and the Stats view renders the tournament totals / Golden Boot table.
    fireEvent.click(screen.getByRole('button', { name: /Stats/ }))
    expect(document.querySelector('main.stats-view')).toBeTruthy()
  })

  it('"As it stands" link in Groups jumps to the Bracket and focuses a match', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-28T16:00:00Z'))
    try {
      // Finished Group A matches so "As it stands" projects matchNum links.
      global.fetch = fetchWith([], COPA_TXT_MD1)
      render(<App />)
      await vi.waitFor(() => expect(screen.getByText(/with scores/)).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: /Groups/ }))
      const link = document.querySelector('button.ais-match-link')
      expect(link).toBeTruthy()
      fireEvent.click(link)
      expect(screen.getByRole('button', { name: /Bracket/ }).className).toMatch(/active/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows empty state when filters match nothing', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Filters & Search/ }))
    fireEvent.click(screen.getByRole('button', { name: /🔍 Search/ }))
    fireEvent.change(screen.getByPlaceholderText(/team: Mexico/), {
      target: { value: 'team: Atlantis' },
    })
    expect(screen.getByText(/No matches match your filters/)).toBeInTheDocument()
  })

  it('clear-all resets filters', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Filters & Search/ }))
    fireEvent.click(screen.getByRole('button', { name: /🔍 Search/ }))
    fireEvent.change(screen.getByPlaceholderText(/team: Mexico/), {
      target: { value: 'team: Canada' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(screen.queryByRole('button', { name: /Clear all/ })).not.toBeInTheDocument()
  })

  it('My Teams button appears after following and toggles', () => {
    render(
      <FollowProvider>
        <App />
      </FollowProvider>,
    )
    // Past days collapse once the tournament is underway; expand one so a match
    // card (and its Follow buttons) is in the DOM regardless of the current date.
    if (screen.queryAllByRole('button', { name: /^Follow / }).length === 0) {
      const toggle = document.querySelector('.day-toggle')
      if (toggle) fireEvent.click(toggle)
    }
    fireEvent.click(screen.getAllByRole('button', { name: /^Follow / })[0])
    const myTeams = screen.getByRole('button', { name: /My Teams/ })
    fireEvent.click(myTeams)
    expect(myTeams.className).toMatch(/active/)
    fireEvent.click(myTeams)
    expect(myTeams.className).not.toMatch(/active/)
  })

  // --- live / results merge + results bar ---------------------------------
  it('renders live + finished scores, updated time, and live counter', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-21T00:30:00Z'))
    try {
      const live = espnEvent({
        home: 'Argentina',
        away: 'Canada',
        date: '2024-06-21T00:00:00Z',
        state: 'in',
        hs: '1',
        as: '0',
        goals: [{ side: 'home', name: 'Jimenez', minute: 23 }],
      })
      // The finished match comes from the results feed (Peru 0–0 Chile); the
      // live one is ESPN's overlay on top of a still-open fixture.
      global.fetch = fetchWith([live])
      render(<App />)
      await vi.waitFor(() => expect(screen.getByText(/live now/)).toBeInTheDocument())
      expect(screen.getByText(/with scores/)).toBeInTheDocument()
      expect(screen.getByText(/updated/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows error state when the OpenFootball feed fails', async () => {
    global.fetch = vi.fn(async (url) => {
      if (typeof url === 'string' && url.startsWith(RESULTS_SOURCE.url)) {
        return { ok: false, status: 500, json: async () => ({}) }
      }
      return { ok: true, json: async () => ({ events: [], matches: [] }) }
    })
    render(<App />)
    await screen.findByText(/Couldn’t reach results feed/)
  })

  it('advances the live poll timer (30s when something is live)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-21T00:30:00Z'))
    try {
      const live = espnEvent({
        home: 'Argentina',
        away: 'Canada',
        date: '2024-06-21T00:00:00Z',
        state: 'in',
        hs: '1',
        as: '0',
      })
      global.fetch = fetchWith([live])
      render(<App />)
      await vi.waitFor(() => expect(screen.getByText(/live now/)).toBeInTheDocument())
      const before = global.fetch.mock.calls.length
      await vi.advanceTimersByTimeAsync(31000)
      expect(global.fetch.mock.calls.length).toBeGreaterThan(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops polling once the tournament has concluded', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-08-01T00:00:00Z')) // after the Final — nothing left to play
    try {
      global.fetch = fetchWith([])
      render(<App />)
      // Let the one-shot mount fetches settle.
      await vi.advanceTimersByTimeAsync(1000)
      const before = global.fetch.mock.calls.length
      // Advance well past the slow (2 min) poll interval: no new fetches, because
      // the auto-refresh interval is never armed once the tournament is over.
      await vi.advanceTimersByTimeAsync(200000)
      expect(global.fetch.mock.calls.length).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  // --- goal alerts --------------------------------------------------------
  // Toasts don't need Notification permission, so enabling never blocks on it.
  it('toggleGoalAlerts: no Notification support -> still enables (toasts-only)', async () => {
    const origNotif = global.Notification
    const origWinNotif = window.Notification
    delete global.Notification
    delete window.Notification
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    try {
      render(<App />)
      const cb = screen.getByRole('checkbox', { name: /goals/ })
      fireEvent.click(cb)
      await waitFor(() => expect(cb).toBeChecked())
      expect(alertSpy).not.toHaveBeenCalled()
    } finally {
      global.Notification = origNotif
      window.Notification = origWinNotif
    }
  })

  it('toggleGoalAlerts: requestPermission rejects -> still enables, no alert', async () => {
    class FakeNotification {
      static permission = 'default'
      static requestPermission = vi.fn(async () => {
        throw new Error('user dismissed')
      })
    }
    global.Notification = FakeNotification
    window.Notification = FakeNotification
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    try {
      render(<App />)
      const cb = screen.getByRole('checkbox', { name: /goals/ })
      fireEvent.click(cb)
      await waitFor(() => expect(cb).toBeChecked())
      expect(FakeNotification.requestPermission).toHaveBeenCalled()
      expect(alertSpy).not.toHaveBeenCalled()
    } finally {
      delete global.Notification
      delete window.Notification
    }
  })

  it('raises an on-page toast with no notification permission, stacks the next goal, and suppresses a desynced flood', async () => {
    // No Notification at all: the on-page toast is the whole point of raising
    // both, because a focused tab is exactly when the OS tends to mute them.
    localStorage.setItem('copa:goalAlerts', JSON.stringify({ enabled: true, scope: 'all' }))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-21T00:00:00Z'))
    try {
      let goals = []
      global.fetch = vi.fn(async (url) => {
        if (typeof url === 'string' && url.startsWith(LIVE_SOURCE.url)) {
          return {
            ok: true,
            json: async () => ({
              events: [
                espnEvent({
                  home: 'Argentina',
                  away: 'Canada',
                  date: '2024-06-21T00:00:00Z',
                  state: 'in',
                  hs: String(goals.length),
                  as: '0',
                  goals,
                }),
              ],
            }),
          }
        }
        return { ok: true, json: async () => ({ events: [] }) }
      })
      render(<App />)
      await vi.waitFor(() => expect(screen.getByText(/live now/)).toBeInTheDocument())

      goals = [{ side: 'home', name: 'First', minute: 12 }]
      await vi.advanceTimersByTimeAsync(31000)
      const region = () => screen.getByRole('region', { name: /Goal alerts/ })
      await vi.waitFor(() => expect(region().textContent).toMatch(/First/))

      // A second goal arrives while the first toast is still up. Toasts retire
      // after 8s and the live poll is 30s apart, so the only way two share the
      // screen is a manual refresh — which is exactly when the new batch has to
      // be diffed against what is already showing rather than replacing it.
      goals = [...goals, { side: 'home', name: 'Second', minute: 20 }]
      fireEvent.click(document.querySelector('.results-refresh'))
      await vi.advanceTimersByTimeAsync(100)
      await vi.waitFor(() => expect(region().textContent).toMatch(/Second/))
      expect(region().textContent).toMatch(/First/)

      // A feed gap restoring a pile of goals at once is a desync, not six goals
      // in thirty seconds — it is dropped rather than spammed onto the page.
      const before = region().textContent
      goals = [...goals, ...Array.from({ length: 6 }, (_, i) => ({ side: 'home', name: `Flood${i}`, minute: 30 + i }))]
      fireEvent.click(document.querySelector('.results-refresh'))
      // Deterministic settle point: the refreshed live score (8–0) rendering
      // proves the flood batch has been fetched, merged AND run through the
      // goal-detect effect — a bare timer advance can leave that effect still
      // queued, silently asserting against the pre-flood board.
      await vi.waitFor(() => expect(document.body.textContent).toMatch(/8\s*–\s*0/))
      expect(region().textContent).toBe(before)
      expect(region().textContent).not.toMatch(/Flood/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('toggleGoalAlerts: granted -> enables, scope select, toggle scope, disable', async () => {
    class FakeNotification {
      static permission = 'granted'
      static requestPermission = vi.fn(async () => 'granted')
    }
    global.Notification = FakeNotification
    window.Notification = FakeNotification
    try {
      render(<App />)
      const cb = screen.getByRole('checkbox', { name: /goals/ })
      fireEvent.click(cb)
      await waitFor(() => expect(cb).toBeChecked())
      const scope = screen.getByRole('combobox', { name: /Goal-alert scope/ })
      fireEvent.change(scope, { target: { value: 'all' } })
      expect(scope.value).toBe('all')
      fireEvent.click(cb)
      await waitFor(() => expect(cb).not.toBeChecked())
    } finally {
      delete global.Notification
      delete window.Notification
    }
  })

  it('fires goal notifications when a new goal arrives in a live match (scope all)', async () => {
    const fired = []
    class FakeNotification {
      constructor(title, opts) {
        fired.push({ title, opts, note: this })
        this.close = vi.fn()
      }
      static permission = 'granted'
      static requestPermission = vi.fn(async () => 'granted')
    }
    global.Notification = FakeNotification
    window.Notification = FakeNotification
    localStorage.setItem('copa:goalAlerts', JSON.stringify({ enabled: true, scope: 'all' }))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-21T00:30:00Z'))
    try {
      let goals = []
      global.fetch = vi.fn(async (url) => {
        if (typeof url === 'string' && url.startsWith(LIVE_SOURCE.url)) {
          return {
            ok: true,
            json: async () => ({
              events: [
                espnEvent({
                  home: 'Argentina',
                  away: 'Canada',
                  date: '2024-06-21T00:00:00Z',
                  state: 'in',
                  hs: String(goals.length),
                  as: '0',
                  goals,
                }),
              ],
            }),
          }
        }
        return { ok: true, json: async () => ({ matches: [] }) }
      })
      render(<App />)
      await vi.waitFor(() => expect(screen.getByText(/live now/)).toBeInTheDocument())
      goals = [{ side: 'home', name: 'Jimenez', minute: 23 }]
      await vi.advanceTimersByTimeAsync(31000)
      await vi.waitFor(() => expect(fired.length).toBeGreaterThan(0))
      expect(fired[0].title).toMatch(/GOAL/)
      // …and the same goal raises an on-page toast; its ✕ dismisses it.
      // The notification fires from the same effect that queues the toast, so
      // on a loaded runner the OS notification can be observed a render before
      // the toast is on the page — wait for it rather than reading it straight
      // out.
      const toast = await vi.waitFor(() => screen.getByRole('region', { name: /Goal alerts/ }))
      expect(toast.textContent).toMatch(/Jimenez/)
      fireEvent.click(screen.getByLabelText('Dismiss'))
      expect(screen.queryByRole('region', { name: /Goal alerts/ })).toBeNull()

      // Clicking the OS notification focuses the window, opens that match's
      // detail, and closes the notification.
      const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {})
      const { note } = fired[0]
      act(() => note.onclick())
      expect(focusSpy).toHaveBeenCalled()
      expect(note.close).toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      focusSpy.mockRestore()

      // …and it still works when the browser refuses window.focus().
      const throwingFocus = vi.spyOn(window, 'focus').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(() => act(() => fired[0].note.onclick())).not.toThrow()
      throwingFocus.mockRestore()
    } finally {
      vi.useRealTimers()
      delete global.Notification
      delete window.Notification
    }
  })

  it('goal notification swallows a constructor that throws', async () => {
    class FakeNotification {
      constructor() {
        throw new Error('cannot construct outside SW')
      }
      static permission = 'granted'
      static requestPermission = vi.fn(async () => 'granted')
    }
    global.Notification = FakeNotification
    window.Notification = FakeNotification
    localStorage.setItem('copa:goalAlerts', JSON.stringify({ enabled: true, scope: 'all' }))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-21T00:30:00Z'))
    try {
      let goals = []
      global.fetch = vi.fn(async (url) => {
        if (typeof url === 'string' && url.startsWith(LIVE_SOURCE.url)) {
          return {
            ok: true,
            json: async () => ({
              events: [
                espnEvent({
                  home: 'Argentina',
                  away: 'Canada',
                  date: '2024-06-21T00:00:00Z',
                  state: 'in',
                  hs: String(goals.length),
                  as: '0',
                  goals,
                }),
              ],
            }),
          }
        }
        return { ok: true, json: async () => ({ matches: [] }) }
      })
      render(<App />)
      await vi.waitFor(() => expect(screen.getByText(/live now/)).toBeInTheDocument())
      goals = [{ side: 'home', name: 'Jimenez', minute: 23 }]
      // The throw inside the loop is caught; advancing the poll must not crash.
      await vi.advanceTimersByTimeAsync(31000)
      expect(screen.getByText(/live now/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      delete global.Notification
      delete window.Notification
    }
  })

  it('toggleTheme swallows a localStorage.setItem failure', () => {
    render(<App />)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    try {
      fireEvent.click(screen.getByRole('button', { name: /Toggle theme/ }))
      // Theme still flips even though persistence failed.
      expect(document.documentElement.dataset.theme).toBe('light')
    } finally {
      spy.mockRestore()
    }
  })

  it('readGoalAlerts swallows a corrupt localStorage value', () => {
    localStorage.setItem('copa:goalAlerts', '{not valid json')
    render(<App />)
    expect(screen.getByRole('checkbox', { name: /goals/ })).not.toBeChecked()
  })

  it('persist-goalAlerts effect swallows a localStorage.setItem failure', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === 'copa:goalAlerts') throw new Error('private mode')
    })
    try {
      // The persist effect runs on mount and its setItem throws — must be caught.
      render(<App />)
      expect(screen.getAllByText(/Copa América 2024/).length).toBeGreaterThan(0)
    } finally {
      spy.mockRestore()
    }
  })

  it('hides and shows past days from the schedule', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-28T16:00:00Z'))
    try {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: /Hide past days/ }))
      expect(screen.queryByRole('button', { name: /June 20, 2024/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Show past days/ }))
      expect(screen.getByRole('button', { name: /June 20, 2024/ })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens detail modal and closes it', () => {
    // Pin mid-tournament so match cards are on the schedule regardless of the
    // real date (post-tournament every day is collapsed/complete).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-28T16:00:00Z'))
    try {
      render(<App />)
      if (screen.queryAllByRole('button', { name: /Details/ }).length === 0) {
        const toggle = document.querySelector('.day-toggle')
        if (toggle) fireEvent.click(toggle)
      }
      fireEvent.click(screen.getAllByRole('button', { name: /Details/ })[0])
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      fireEvent.click(within(dialog).getByRole('button', { name: /Close/ }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
