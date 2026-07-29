// Web Worker: runs the full quarter-final outcome enumeration off the main thread
// so the page stays responsive while millions of combinations are walked. Posts
// progress updates and a final result.

import { enumerateOutlook } from '../utils/outlookEnum.js'
import { survivingTeams } from '../utils/eliminationCheck.js'

self.onmessage = (e) => {
  const matches = e.data
  try {
    const result = enumerateOutlook(matches, (done, total) => {
      self.postMessage({ type: 'progress', done, total })
    })
    // Exact "still alive" set — separate from the capped margin enumeration, so a
    // team whose survival needs a goal-difference swing bigger than the cap (and
    // which therefore shows 0% above) is still reported rather than silently
    // vanishing.
    const survivors = survivingTeams(matches)
    self.postMessage({ type: 'done', result, survivors })
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) })
  }
}
