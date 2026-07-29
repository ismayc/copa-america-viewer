import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { dayKey } from '../src/utils/time.js'

// Guard for the whole suite's determinism.
//
// Kickoffs are US evenings stored in ET (-04:00), so most of them fall on the
// NEXT calendar day in UTC. Any test that asserts a day heading, or what counts
// as "today", therefore depends on the runner's timezone unless it is fixed —
// which is exactly how three tests passed locally and failed on a UTC CI runner.
// vite.config.js pins TZ for the suite; this asserts the pin is in effect, so a
// removal fails here loudly instead of showing up as three unrelated red tests.
describe('the suite runs in a pinned timezone', () => {
  it('is fixed to the tournament timezone, whatever the runner is set to', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York')
  })

  it('proves the pin matters: evening kickoffs shift a day in UTC', () => {
    // The opener kicks off 20:00 on 20 June ET, which is 21 June in UTC.
    const opener = MATCHES.find((m) => m.num === 1)
    expect(dayKey(opener.ko, 'America/New_York')).toBe('2024-06-20')
    expect(dayKey(opener.ko, 'UTC')).toBe('2024-06-21')
  })
})
