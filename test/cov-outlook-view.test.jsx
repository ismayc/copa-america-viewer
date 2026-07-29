import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { ENTRY_SLOT_LABELS } from '../src/utils/outlookEnum.js'
import OutlookView from '../src/components/OutlookView.jsx'

// All group games scored → 0 remaining (≤ MAX_REMAINING), so the component enters
// the 'enumerating' phase and constructs a Worker — which we stub so the test can
// drive its messages (the real worker can't run in jsdom).
const COMPLETE = MATCHES.map((m) => (m.stage === 'Group' ? { ...m, score: [1, 0] } : m))
const NUMS = Object.keys(ENTRY_SLOT_LABELS)
  .map(Number)
  .sort((a, b) => a - b)

let workerInstance
class FakeWorker {
  constructor() {
    workerInstance = this
    this.onmessage = null
    this.postMessage = vi.fn()
    this.terminate = vi.fn()
  }
}

beforeEach(() => {
  workerInstance = null
  globalThis.Worker = FakeWorker
})
afterEach(() => {
  delete globalThis.Worker
})

const send = (msg) => act(() => workerInstance.onmessage({ data: msg }))

function allLocked() {
  const perMatch = {}
  for (const n of NUMS) perMatch[n] = [
    { locked: 'Argentina', candidates: [] },
    { locked: 'Ecuador', candidates: [] },
  ]
  return { total: 1, remaining: 0, cap: 8, perMatch }
}

describe('OutlookView (enumeration result rendering)', () => {
  it('shows the enumerating progress bar, then renders the grid with locked / candidate / TBD sides', () => {
    render(<OutlookView matches={COMPLETE} />)
    // Worker was constructed and we're enumerating.
    expect(workerInstance).toBeTruthy()
    expect(screen.getByText(/Enumerating goal-difference outcomes/)).toBeInTheDocument()

    // A progress tick updates the percentage.
    send({ type: 'progress', done: 1, total: 2 })
    expect(screen.getByText(/Enumerating goal-difference outcomes… 50%/)).toBeInTheDocument()

    // One match has a non-locked side (candidates with >99 / mid / <1 formatting)
    // and an empty (TBD) opposite side; the rest are locked.
    const perMatch = {}
    for (const n of NUMS) perMatch[n] = [
      { locked: 'Argentina', candidates: [] },
      { locked: 'Ecuador', candidates: [] },
    ]
    perMatch[NUMS[0]] = [
      {
        locked: null,
        candidates: [
          { team: 'Uruguay', pct: 0.999 },
          { team: 'Colombia', pct: 0.5 },
          { team: 'Panama', pct: 0.001 },
        ],
      },
      { locked: null, candidates: [] },
    ]
    send({
      type: 'done',
      result: { total: 100, remaining: 1, cap: 6, perMatch },
      survivors: ['Chile', 'Peru'],
    })

    // Header summary with the enumerated total + cap.
    expect(screen.getByText(/100/)).toBeInTheDocument()
    // "margins to ±6" appears in both the header summary and the exact-runs line.
    expect(screen.getAllByText(/margins to ±6/).length).toBeGreaterThan(0)
    // Candidate share formatting: >99, mid, <1.
    expect(screen.getByText('>99%')).toBeInTheDocument()
    expect(screen.getByText('<1%')).toBeInTheDocument()
    // Locked sides show the confirmed ✅; a TBD side shows the placeholder.
    expect(document.querySelector('.bo-confirmed')).toBeTruthy()
    expect(screen.getByText('To be determined')).toBeInTheDocument()

    // Hidden-alive net: teams the exact check keeps alive beyond the enumerated
    // margins are simply named. There is no per-team requirements checklist to
    // render — that is the Euro sibling's best-thirds bookkeeping, which this
    // format has no equivalent of.
    expect(screen.getByText(/Still mathematically alive/)).toBeInTheDocument()
    expect(screen.getByText('Chile')).toBeInTheDocument()
    expect(screen.getByText('Peru')).toBeInTheDocument()
  })

  it('announces a fully-set bracket when every slot is locked and nobody is alive beyond the margins', () => {
    render(<OutlookView matches={COMPLETE} />)
    send({ type: 'done', result: allLocked(), survivors: [] })
    expect(screen.getByText(/Every quarter-final matchup is now mathematically set/)).toBeInTheDocument()
  })

  it('surfaces an enumeration error', () => {
    render(<OutlookView matches={COMPLETE} />)
    send({ type: 'error', message: 'boom' })
    expect(screen.getByText(/Enumeration failed: boom/)).toBeInTheDocument()
  })
})
