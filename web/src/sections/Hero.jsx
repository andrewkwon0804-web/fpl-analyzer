import { animated, useSpring } from "@react-spring/web";
import Ball from "../components/Ball.jsx";
import Finder from "../components/Finder.jsx";
import FlipClock from "../components/wm/FlipClock.jsx";
import { Label, Readout } from "../components/hud.jsx";
import { usePop } from "../components/Popover.jsx";
import { Button } from "../components/ui.jsx";
import { reduced } from "../lib/motion.js";
import { goTo } from "../components/Nav.jsx";

// The next FPL deadline still ahead: 90 minutes before that gameweek's first kickoff.
function nextDeadline(meta) {
  const now = Date.now();
  for (const [gw, t] of Object.entries(meta.kickoffs || {}).sort((a, b) => +a[0] - +b[0])) {
    const d = new Date(t).getTime() - 90 * 60e3;
    if (d > now) return { gw: +gw, at: d };
  }
  return null;
}

export default function Hero({ data }) {
  const { open } = usePop();
  const m = data.meta, dl = nextDeadline(m);
  const intro = useSpring({ from: { k: 0 }, to: { k: 1 }, delay: 100, config: { tension: 120, friction: 22 }, immediate: reduced });
  const fx = (d) => ({ opacity: intro.k.to((k) => Math.min(1, Math.max(0, k * 1.6 - d))), transform: intro.k.to((k) => `translateY(${(1 - Math.min(1, Math.max(0, k * 1.6 - d))) * 30}px)`) });
  const updated = new Date(m.refreshed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const onPick = (p, input) => open(p, input, `Ranked #${data.rank[p.id]} of ${data.players.length} by predicted points.${p.xi ? " In this week's best XI." : ""}`);
  return (
    <section id="top" data-scene="dust" data-tint="94 240 176" data-tx="72%" className="page relative pb-14 pt-28 lg:pt-32">
      <animated.div style={fx(0)} className="flex flex-wrap items-center justify-between gap-3">
        <Label>FPL Points Lab · {m.season}</Label>
        <span className={`mono-label flex items-center gap-2 ${data.stale ? "text-amber" : "text-mint"}`}>
          <i className={`h-1.5 w-1.5 rounded-full ${data.stale ? "bg-amber" : "animate-pulse bg-mint"}`} />
          {data.stale ? `GW${m.gw} picks · data through GW${m.played}` : `GW${m.gw} picks live`}
        </span>
      </animated.div>

      <div className="relative mt-8 grid items-center gap-6 lg:mt-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="relative z-10">
          <animated.h1 style={fx(0.15)} className="font-display text-[clamp(60px,8.4vw,150px)] font-medium leading-[0.86] tracking-[-0.055em]">
            Every FPL<br />player,<br /><span className="text-mint">predicted.</span>
          </animated.h1>
          <animated.p style={fx(0.3)} className="mt-8 max-w-[520px] text-[clamp(16px,1.25vw,18px)] leading-relaxed text-text2">
            Points for all {data.players.length} players in gameweek {m.gw}, from a model trained on {data.analysis.rows.toLocaleString("en-US")} player
            matches since 2022. It retrains after every gameweek.
          </animated.p>
          <animated.div style={fx(0.42)} className="mt-8"><Finder data={data} onPick={onPick} /></animated.div>
          <animated.div style={fx(0.52)} className="mt-5 flex flex-wrap gap-3">
            <Button href="./dashboard.html">Open the dashboard</Button>
            <Button variant="ghost" href="#xi" onClick={(e) => { e.preventDefault(); goTo("#xi"); }}>This week's XI</Button>
          </animated.div>
        </div>
        <animated.div style={fx(0.2)} className="relative mx-auto w-full max-w-[640px] lg:-ml-10 lg:max-w-none">
          <Ball data={data} />
          <p className="mono-label -mt-4 text-center text-[10px] text-text3">{data.players.length} dots, one per player · size = predicted points · drag to spin</p>
        </animated.div>
      </div>

      <animated.div style={fx(0.6)} className="mt-12 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-end">
        {dl && (
          <div>
            <Label className="mb-3">GW{dl.gw} deadline</Label>
            <FlipClock target={dl.at} className="text-[clamp(30px,3.4vw,46px)]" />
          </div>
        )}
        <Readout items={[
          ["Model", "Gradient boosting", true],
          ["Training data", "4 seasons"],
          ["2025-26 test", `+${data.last_season_edge} pts`],
          ["Updated", updated],
        ]} />
      </animated.div>
    </section>
  );
}
