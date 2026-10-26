import { useRef, useState } from "react";
import { animated, useSpring } from "@react-spring/web";
import Pitch, { ROW_Y } from "../components/Pitch.jsx";
import Finder from "../components/Finder.jsx";
import { usePop } from "../components/Popover.jsx";
import { Button, Badge, Parallax } from "../components/ui.jsx";
import { reduced } from "../lib/motion.js";
import { fmtDate } from "../lib/data.js";
import { goTo } from "../components/Nav.jsx";

function rankNote(data, p) {
  const rank = data.players.indexOf(p) + 1;
  if (p.xi) return `Ranked #${rank} of ${data.players.length} by predicted points, and in this week's best XI.`;
  const xiPos = data.players.filter((x) => x.xi && x.pos === p.pos);
  const last = xiPos[xiPos.length - 1];
  return `Ranked #${rank} of ${data.players.length}. Not in the best XI: the lowest ${p.pos} in it, ${last.name}, is predicted ${last.pred.toFixed(1)}.`;
}

export default function Hero({ data }) {
  const { open } = usePop();
  const pitchBox = useRef(null);
  const [ghost, setGhost] = useState(null);
  const m = data.meta;
  const intro = useSpring({ from: { o: 0, y: 24, b: 8 }, to: { o: 1, y: 0, b: 0 }, delay: 120, config: { tension: 140, friction: 22 }, immediate: reduced });
  const fx = (k) => ({ opacity: intro.o, transform: intro.y.to((v) => `translateY(${v * k}px)`), filter: intro.b.to((b) => `blur(${b * k}px)`) });

  const onPick = (p, inputEl) => {
    if (p.xi) {
      const chip = pitchBox.current.querySelector(`[data-pid="${p.id}"]`);
      chip?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (chip) open(p, chip, rankNote(data, p));
      return;
    }
    const pr = pitchBox.current.getBoundingClientRect(), ir = inputEl.getBoundingClientRect();
    const tx = pr.left + pr.width / 2, ty = pr.top + pr.height * (ROW_Y[p.pos] + 0.115);
    setGhost({
      p, fromX: ir.left + 60 - tx, fromY: ir.top + ir.height / 2 - ty,
      onLand: () => { const el = pitchBox.current.querySelector(`[data-pid="${p.id}"]`); if (el) open(p, el, rankNote(data, p)); },
    });
  };

  return (
    <section id="top" data-scene="dust" data-tint="94 240 176" data-tx="75%"
      className="page relative grid min-h-[100svh] items-center gap-12 pb-20 pt-32 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
      <div>
        <animated.div style={fx(0.4)}>
          <Badge tone={data.stale ? "amber" : "mint"}>
            <span className={`h-1.5 w-1.5 rounded-full ${data.stale ? "bg-amber" : "bg-mint animate-pulse"}`} />
            {data.stale ? `Gameweek ${m.gw} picks, using games through GW${m.played}` : `Gameweek ${m.gw} picks are live`}
          </Badge>
        </animated.div>
        <animated.h1 style={fx(1)} className="mt-6 font-display text-[clamp(44px,6.6vw,104px)] font-medium leading-[0.95] tracking-[-0.04em]">
          Who to pick for <span className="text-mint">gameweek {m.gw}</span>.
        </animated.h1>
        <animated.p style={fx(1.3)} className="mt-6 max-w-[540px] text-[clamp(16px,1.3vw,19px)] leading-relaxed text-text2">
          A model trained on four seasons of Premier League stats predicts how many FPL points every player will score next week.
          It retrains after each gameweek.
        </animated.p>
        <animated.div style={fx(1.5)} className="mt-8"><Finder data={data} onPick={onPick} /></animated.div>
        <animated.div style={fx(1.7)} className="mt-6 flex flex-wrap gap-3">
          <Button href="../dashboard.html">Open the dashboard</Button>
          <Button variant="ghost" href="#how" onClick={(e) => { e.preventDefault(); goTo("#how"); }}>How it works</Button>
        </animated.div>
        {data.stale && (
          <p className="mt-6 max-w-[540px] rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-text2">
            Gameweek {m.gw} started on {fmtDate(data.kickoff)}, and these picks only use games through gameweek {m.played}. They update on the next data refresh.
          </p>
        )}
      </div>
      <Parallax speed={-0.06}><div ref={pitchBox}>
        <Pitch data={data} ghost={ghost} />
        <p className="mt-3 text-center text-xs text-text3">The model's best XI for gameweek {m.gw}. Click a player for his next five gameweeks.</p>
      </div></Parallax>
    </section>
  );
}
