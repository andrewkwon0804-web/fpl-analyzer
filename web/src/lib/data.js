import { useEffect, useState } from "react";

// The pipeline writes one JSON file; the site reads nothing else.
const URL = import.meta.env.DEV ? "/data/site.json" : "./data/site.json";

const CACHE = "fpl-site-json";

// Adds lookups the pages use. Run on every copy of the data, cached or fresh.
function prep(d) {
  d.byId = Object.fromEntries(d.players.map((p) => [p.id, p]));
  d.kickoff = d.meta.next_gw_first_kickoff ? new Date(d.meta.next_gw_first_kickoff) : null;
  d.stale = d.kickoff !== null && d.kickoff < new Date();
  d.planGws = d.meta.horizon_gws.filter((g) => g >= d.analysis.fdr.grid_start).slice(0, 5);
  d.fixtures = {};
  d.analysis.fdr.grid.forEach((r) => { ((d.fixtures[r.team] ??= {})[r.gw] ??= []).push(r); });
  d.rank = Object.fromEntries(d.players.map((p, i) => [p.id, i + 1]));
  return d;
}

// Stale-while-revalidate: show the copy saved on the last visit straight away, fetch the
// current file in the background, and swap it in only if the pipeline has refreshed since.
export function useSiteData() {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(CACHE);
      if (raw) return { data: prep(JSON.parse(raw)), error: null, cached: true };
    } catch (e) { /* storage blocked or bad copy */ }
    return { data: null, error: null, cached: false };
  });
  useEffect(() => {
    fetch(URL, { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(`site.json: ${r.status}`); return r.text(); })
      .then((text) => {
        const d = JSON.parse(text);
        try { localStorage.setItem(CACHE, text); } catch (e) { /* too big or blocked: fine */ }
        setState((cur) => (cur.data && cur.data.meta.refreshed_at === d.meta.refreshed_at
          ? { ...cur, cached: false } : { data: prep(d), error: null, cached: false }));
      })
      .catch((e) => setState((cur) => (cur.data ? cur : { data: null, error: e.message, cached: false })));
  }, []);
  return state;
}

export const fmtDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
export const signed = (v, d = 0) => (v > 0 ? "+" : "") + v.toFixed(d);
