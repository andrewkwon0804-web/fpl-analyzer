// Runs the transfer planner's search off the main thread.
import { engine } from "./planEngine.js";

self.onmessage = (e) => {
  const { id, players, gws, squad, bank, ft, hits, have } = e.data;
  try {
    const t0 = performance.now();
    const E = engine({ players, gws });
    const res = E.plan({ squad, bank, ft, hits });
    const chips = E.chips(res, { squad, bank, have });
    self.postMessage({ id, ok: true, res, chips, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
