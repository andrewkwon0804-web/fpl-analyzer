import Pitch from "../components/Pitch.jsx";
import { Head } from "./Story.jsx";
import { Reveal, CountUp } from "../components/ui.jsx";
import { usePop } from "../components/Popover.jsx";

export default function BestXI({ data }) {
  const { open } = usePop();
  const m = data.meta, cap = data.byId[data.captain];
  const flagged = data.players.filter((p) => p.chance !== null && p.chance < 75 && p.raw >= 2).sort((a, b) => b.raw - a.raw).slice(0, 6);
  const total = data.players.filter((p) => p.xi).reduce((s, p) => s + p.pred, 0) + cap.pred;
  return (
    <section id="xi" data-scene="floor" data-tint="94 240 176" data-tx="30%" className="page relative py-24 lg:py-32">
      <Head n="01" kicker="Best XI" title={`Gameweek ${m.gw} best XI`}>
        No budget limit: this XI costs £{m.xi_cost}m. Click a player for his next five gameweeks.
      </Head>
      <div className="mt-12 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Reveal><Pitch data={data} /></Reveal>
        <div className="grid content-start gap-4">
          <Reveal delay={60} className="corners p-6">
            <div className="mono-label text-text3">Captain</div>
            <button data-pid={cap.id} onClick={(e) => open(cap, e.currentTarget, "Highest predicted points this week, so his points are doubled.")}
              className="mt-3 flex w-full items-end justify-between text-left">
              <span><span className="block font-display text-[32px] font-medium leading-none">{cap.name}</span><span className="text-sm text-text3">{cap.team}, £{cap.price.toFixed(1)}m</span></span>
              <span className="num font-display text-[48px] font-medium leading-none text-mint">{cap.pred.toFixed(1)}</span>
            </button>
          </Reveal>
          <Reveal delay={100} className="corners p-6">
            <div className="flex justify-between"><span className="mono-label text-text3">XI total, captain doubled</span><span className="mono-label text-text3">pts</span></div>
            <CountUp to={total} decimals={1} className="mt-2 block font-display text-[48px] font-medium leading-none" />
          </Reveal>
          <Reveal delay={140} className="corners p-6">
            <div className="mono-label text-text3">Flagged by FPL</div>
            <p className="mt-1 text-sm text-text3">Prediction before the cut, and the chance FPL gives them of playing.</p>
            <ul className="mt-4 space-y-3">
              {flagged.length ? flagged.map((p) => (
                <li key={p.id}>
                  <button data-pid={p.id} onClick={(e) => open(p, e.currentTarget)} className="w-full text-left">
                    <div className="flex justify-between text-sm"><span>{p.name} <span className="text-text3">{p.short}</span></span><span className="num font-mono text-text2">{p.raw.toFixed(1)}</span></div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded bg-raised"><i className="block h-full bg-amber" style={{ width: `${p.chance}%` }} /></div>
                      <span className="num w-9 text-right font-mono text-xs text-amber">{p.chance}%</span>
                    </div>
                  </button>
                </li>
              )) : <li className="text-sm text-text3">No high scorers flagged this week.</li>}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
