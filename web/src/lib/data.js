import { useEffect, useState } from "react";

// The pipeline writes one JSON file; the site reads nothing else.
const URL = import.meta.env.DEV ? "/data/site.json" : "../data/site.json";

export function useSiteData() {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    fetch(URL, { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(`site.json: ${r.status}`); return r.json(); })
      .then((d) => {
        d.byId = Object.fromEntries(d.players.map((p) => [p.id, p]));
        d.kickoff = d.meta.next_gw_first_kickoff ? new Date(d.meta.next_gw_first_kickoff) : null;
        d.stale = d.kickoff !== null && d.kickoff < new Date();
        d.planGws = d.meta.horizon_gws.filter((g) => g >= d.analysis.fdr.grid_start).slice(0, 5);
        d.fixtures = {};
        d.analysis.fdr.grid.forEach((r) => { ((d.fixtures[r.team] ??= {})[r.gw] ??= []).push(r); });
        setState({ data: d, error: null });
      })
      .catch((e) => setState({ data: null, error: e.message }));
  }, []);
  return state;
}

export const fmtDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
export const signed = (v, d = 0) => (v > 0 ? "+" : "") + v.toFixed(d);
