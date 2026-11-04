// The captain choice as three foil trading cards. The front card tilts toward the pointer and
// its foil catches the light; click a card behind to bring it forward. Every number on a card
// is from this week's predictions.
import { useRef, useState } from "react";
import { reduced } from "../lib/motion.js";

const POS_HEX = { GK: "#F5C451", DEF: "#6F95FF", MID: "#38E1A8", FWD: "#FF7A8A" };
const POS_NAME = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" };

function Card({ p, data, front, onTilt }) {
  const gw = data.meta.gw, fx = (data.fixtures[p.short] || {})[gw] || [];
  const max = Math.max(1, ...p.h.map(([, v]) => v));
  return (
    <div className="holo relative aspect-[63/88] w-full overflow-hidden rounded-[18px] border border-white/10 bg-[#0a0d10]"
      style={{ "--pc": POS_HEX[p.pos] }} onPointerMove={front ? onTilt : undefined} onPointerLeave={front ? onTilt : undefined}>
      {/* art: the player's predicted points for the next six gameweeks, as tall bars */}
      <div className="absolute inset-x-0 top-0 h-[58%] overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 50% 0%, ${POS_HEX[p.pos]}33, transparent 60%)` }} />
        <div className="absolute inset-x-6 bottom-3 top-14 flex gap-2">
          {p.h.map(([g, v]) => (
            <div key={g} className="flex h-full flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="font-mono text-[10px] text-white/60">{v.toFixed(1)}</span>
                <i className="block w-full rounded-t-[4px]" style={{ height: `${(v / max) * 82}%`, minHeight: 4, background: `linear-gradient(${POS_HEX[p.pos]}, ${POS_HEX[p.pos]}22)` }} />
              </div>
              <span className="font-mono text-[9.5px] text-white/45">GW{g}</span>
            </div>
          ))}
        </div>
        <div className="absolute left-5 right-5 top-5 flex items-start justify-between">
          <span className="text-[12px] text-white/70">{POS_NAME[p.pos]}</span>
          <span className="rounded-full px-2 py-0.5 text-[11px] text-black" style={{ background: POS_HEX[p.pos] }}>{p.short}</span>
        </div>
      </div>
      {/* name plate */}
      <div className="absolute inset-x-0 bottom-0 h-[42%] border-t border-white/10 bg-gradient-to-b from-white/[.04] to-transparent px-5 pt-4">
        <div className="truncate text-[clamp(22px,2.2vw,30px)] font-medium leading-none tracking-[-0.02em] text-white">{p.name}</div>
        <div className="mt-1.5 text-[12.5px] text-white/55">
          {fx.length ? `v ${fx.map((f) => `${f.opp} (${f.home ? "home" : "away"})`).join(" and ")}` : `Gameweek ${gw}`}{p.chance !== null && p.chance < 100 ? `, ${p.chance}% to play` : ""}
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-[11px] text-white/50">As captain</div>
            <div className="num text-[clamp(34px,3.4vw,48px)] font-medium leading-none tracking-[-0.03em] text-white">{(p.pred * 2).toFixed(1)}</div>
          </div>
          <div className="text-right text-[11px] leading-snug text-white/50">£{p.price.toFixed(1)}m<br />{p.pred.toFixed(2)} predicted</div>
        </div>
      </div>
      <div className="holo-foil pointer-events-none absolute inset-0" />
      <div className="holo-glare pointer-events-none absolute inset-0" />
    </div>
  );
}

export default function CaptainCards({ data }) {
  const options = data.players.slice(0, 3);
  const [order, setOrder] = useState(() => {
    const cap = options.findIndex((p) => p.id === data.captain);
    return [cap < 0 ? 0 : cap, ...[0, 1, 2].filter((i) => i !== (cap < 0 ? 0 : cap))];
  });
  const tilt = useRef(null);
  const onTilt = (e) => {
    const card = e.currentTarget, holder = tilt.current;
    if (!holder || reduced) return;
    if (e.type === "pointerleave") { holder.style.setProperty("--rx", "0deg"); holder.style.setProperty("--ry", "0deg"); card.style.setProperty("--o", "0"); return; }
    const b = card.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
    holder.style.setProperty("--rx", `${(0.5 - y) * 16}deg`); holder.style.setProperty("--ry", `${(x - 0.5) * 20}deg`);
    card.style.setProperty("--mx", `${x * 100}%`); card.style.setProperty("--my", `${y * 100}%`); card.style.setProperty("--o", "1");
    card.style.setProperty("--hue", `${(x + y) * 180}deg`);
  };
  const lead = options[order[0]], second = options[order[1]];
  const gap = lead.pred - second.pred;
  return (
    <section id="captain" className="page relative grid items-center gap-14 py-32 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-44" data-tint="245 196 81" data-tint2="56 225 168" data-tx="75%">
      <div>
        <h2 className="font-display text-[clamp(36px,5vw,76px)] font-medium leading-[1.02] tracking-[-0.04em]">Who gets the armband in gameweek {data.meta.gw}.</h2>
        <p className="mt-6 max-w-[48ch] text-[16px] leading-relaxed text-text2">
          The captain scores double, so the pick is worth twice any other. These are the three highest predictions this week. {lead.name} is ahead of {second.name} by {Math.abs(gap).toFixed(2)} points{Math.abs(gap) < 0.3 ? ", close enough that fixtures or a hunch can decide it" : ""}.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {order.map((i, k) => (
            <button key={options[i].id} onClick={() => setOrder([i, ...order.filter((j) => j !== i)])}
              className={`h-9 rounded-full border px-4 text-[13px] transition-colors ${k === 0 ? "border-text bg-text text-bg" : "border-line2 text-text2 hover:text-text"}`}>
              {options[i].name} <span className={k === 0 ? "text-bg/60" : "text-text3"}>{(options[i].pred * 2).toFixed(1)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="relative mx-auto h-[min(620px,128vw)] w-full max-w-[520px] [perspective:1400px]">
        {order.map((i, k) => {
          const p = options[i];
          const pose = [
            "translate3d(0,0,0) rotateZ(0deg)",
            "translate3d(18%,-5%,-120px) rotateZ(7deg)",
            "translate3d(-18%,-3%,-200px) rotateZ(-8deg)",
          ][k];
          return (
            <div key={p.id} onClick={() => k && setOrder([i, ...order.filter((j) => j !== i)])}
              className={`absolute left-1/2 top-1/2 w-[min(380px,72vw)] -translate-x-1/2 -translate-y-1/2 transition-[transform,filter] duration-700 ease-[cubic-bezier(.2,.7,.1,1)] ${k ? "cursor-pointer brightness-[.55] hover:brightness-75" : ""}`}
              style={{ zIndex: 3 - k, transform: `translate(-50%,-50%) ${pose}` }}>
              <div ref={k === 0 ? tilt : undefined} className="transition-transform duration-200 ease-out [transform-style:preserve-3d]"
                style={{ transform: k === 0 ? "rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))" : "none" }}>
                <Card p={p} data={data} front={k === 0} onTilt={onTilt} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
