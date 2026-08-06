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
      include: ['src/**'],
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
