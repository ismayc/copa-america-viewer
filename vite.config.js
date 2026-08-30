import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the same build works both at the domain root (Netlify) and
  // under a sub-path (GitHub Pages: /copa-america-viewer/).
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Test files run one at a time. Vitest's v8 provider merges each worker's
    // coverage after the run, and with files in parallel that merge races. It has
    // surfaced three different ways in this family, all of them the same fault:
    // an ENOENT when a worker's temp JSON is read after the worker is gone
    // (premier-league), an unstable percentage between identical runs (the hub),
    // and a function reported uncovered while its own test demonstrably exercises
    // it (fiba, the-nba-schedule's App.jsx inline handlers). Every file passes in
    // isolation; only the parallel merge is unsafe.
    //
    // The cost is real but small where it matters. On a 2-core CI runner the
    // parallel run is already CPU-bound, so serialising changes the job length
    // little; on a many-core laptop it is roughly 4x (measured 2026-08-30 on
    // world-cup-viewer, the largest suite: 35s parallel, 132s serial). A
    // deterministic gate is worth that.
    //
    // All twelve app repos serialise as of 2026-08-30, and
    // sports-viewer-meta/scripts/audit-family.mjs asserts it so this stays true.
    fileParallelism: false,
    setupFiles: ['./test/setup.js'],
    // Full-app tests under v8 instrumentation brush the default 5s ceiling on a
    // loaded CI runner (mount, several polls, a fake-timer refresh cycle). Give
    // them headroom so a busy runner doesn't flake a passing test.
    testTimeout: 15000,
    // Pin the suite to the tournament's own timezone. Kickoffs are US evenings in
    // ET, so they land on the NEXT calendar day in UTC — which means any test
    // asserting a day heading ("June 20, 2024"), or what counts as "today", is
    // runner-dependent unless the zone is fixed. Locally that reads one way and
    // on a UTC CI runner another. The sibling viewers never hit this: European
    // evening kickoffs stay on the same UTC day. Do not remove without making
    // every date-derived assertion pass an explicit tz.
    env: { TZ: 'America/New_York' },
    coverage: {
      provider: 'v8',
      all: true, // count untested files too, so the badge isn't flattered
      // netlify/functions is inside the gate as well as src. The subscription
      // endpoint is real shipped code that a subscriber's calendar hits directly,
      // and it sat outside coverage.include while the badge read 100%.
      include: ['src/**', 'netlify/functions/**'],
      exclude: ['src/main.jsx', 'src/**/*.test.{js,jsx}'],
      reporter: ['text-summary', 'json-summary', 'json'],
      // Enforced gate: the suite (and CI's coverage:badge step) fails if any
      // metric slips below 100%. Genuinely unreachable defensive arms carry an
      // inline `/* v8 ignore next -- why */` with a justification rather than
      // lowering these.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
