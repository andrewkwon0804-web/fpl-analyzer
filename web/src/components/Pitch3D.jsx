// The best XI on a pitch seen from a TV camera angle. Each player is a lit pin standing on
// the grass, and the pin's height is his predicted points, so the pitch is also a 3D bar
// chart. The pitch tilts towards the cursor; pins rise one by one when it comes into view.
import { useEffect, useRef, useState } from "react";
import { animated, to, useSpring, useTrail } from "@react-spring/web";
import { usePop } from "./Popover.jsx";
import { useInView, reduced } from "../lib/motion.js";

const ROW_Y = { FWD: 0.17, MID: 0.43, DEF: 0.67, GK: 0.91 };  // camera behind our goal
const ORDER = ["GK", "DEF", "MID", "FWD"];

function Lines() {
  const s = { fill: "none", stroke: "rgb(var(--mint) / .6)", strokeWidth: 1.4, vectorEffect: "non-scaling-stroke" };
  return (
    <svg viewBox="0 0 68 105" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden
      style={{ filter: "drop-shadow(0 0 1.2px rgb(var(--mint) / .9))" }}>
      <rect x="1" y="1" width="66" height="103" {...s} />
      <line x1="1" y1="52.5" x2="67" y2="52.5" {...s} />
      <circle cx="34" cy="52.5" r="9.15" {...s} /><circle cx="34" cy="52.5" r="0.5" fill="rgb(var(--mint))" />
      <rect x="13.85" y="1" width="40.3" height="16.5" {...s} /><rect x="13.85" y="87.5" width="40.3" height="16.5" {...s} />
      <rect x="24.85" y="1" width="18.3" height="5.5" {...s} /><rect x="24.85" y="98.5" width="18.3" height="5.5" {...s} />
      <path d="M26.7 17.5 A9.15 9.15 0 0 0 41.3 17.5" {...s} /><path d="M26.7 87.5 A9.15 9.15 0 0 1 41.3 87.5" {...s} />
    </svg>
  );
}

export default function Pitch3D({ data }) {
  const { open } = usePop();
  const [ref, seen] = useInView(1);
  const box = useRef(null);
  const [unit, setUnit] = useState(18);
  useEffect(() => {
    const on = () => setUnit(Math.max(7, Math.min(20, (box.current?.offsetWidth || 1000) * 0.02)));
    on(); addEventListener("resize", on); return () => removeEventListener("resize", on);
  }, []);
  const xi = data.players.filter((p) => p.xi);
  const placed = ORDER.flatMap((pos) => {
    const row = xi.filter((p) => p.pos === pos).sort((a, b) => b.pred - a.pred);
    // spread across the pitch's width; best player in the middle of his line
    const order = row.map((_, i) => (i % 2 ? (row.length - 1) / 2 + Math.ceil(i / 2) : (row.length - 1) / 2 - i / 2));
    return row.map((p, i) => ({ p, x: (order[i] + 1) / (row.length + 1), y: ROW_Y[pos] }));
  });
  const [tilt, api] = useSpring(() => ({ rx: 64, rz: 0, config: { tension: 120, friction: 20 } }));
  useEffect(() => {
    if (reduced) return;
    const el = box.current;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      if (Math.abs(nx) > 0.8 || Math.abs(ny) > 0.9) return api.start({ rx: 64, rz: 0 });
      api.start({ rx: 64 - ny * 8, rz: nx * 9 });
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, [api]);
  const trail = useTrail(placed.length, { k: seen ? 1 : 0, from: { k: 0 }, delay: 300, config: { tension: 140, friction: 16 }, immediate: reduced });
  const cap = data.captain;
  return (
    <div ref={ref} className="relative -mb-[24%] w-full">
      <div ref={box} className="relative mx-auto w-full pt-[4%]" style={{ perspective: "1600px", perspectiveOrigin: "50% -10%" }}>
        <animated.div className="relative mx-auto aspect-[68/105] w-[74%] sm:w-[56%] lg:w-[62%] [transform-style:preserve-3d]"
          style={{ transform: to([tilt.rx, tilt.rz], (rx, rz) => `translateY(-18%) rotateX(${rx}deg) rotateZ(${rz}deg)`) }}>
          {/* grass: mowed stripes, a vignette and the lines */}
          <div className="absolute inset-0 overflow-hidden rounded-[6px] border border-mint/30"
            style={{ background: "repeating-linear-gradient(180deg, rgb(var(--mint) / .07) 0 8.33%, rgb(var(--mint) / .025) 8.33% 16.66%), radial-gradient(70% 90% at 50% 50%, rgb(var(--surface)), rgb(var(--bg)))",
              boxShadow: "0 0 120px rgb(var(--mint) / .18), inset 0 0 80px rgb(var(--bg))" }}>
            <Lines />
          </div>
          {placed.map(({ p, x, y }, i) => {
            const H = Math.max(10, p.pred * unit), k = trail[i].k, isCap = p.id === cap;
            return (
              <div key={p.id} className="absolute [transform-style:preserve-3d]" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
                {/* glow where the pin meets the grass */}
                <animated.div className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ opacity: k, background: `radial-gradient(circle, rgb(var(--${isCap ? "mint" : "mint"}) / ${isCap ? 0.55 : 0.35}), transparent 70%)` }} />
                {/* the pin: a thin bar standing up out of the pitch */}
                <animated.div className="absolute left-0 top-0 w-[8px] origin-bottom rounded-full"
                  style={{ height: H, marginTop: -H, marginLeft: -4,
                    background: `linear-gradient(to top, rgb(var(--mint) / .15), rgb(var(--mint) / ${isCap ? 1 : 0.85}))`,
                    boxShadow: `0 0 ${isCap ? 22 : 12}px rgb(var(--mint) / .6)`,
                    transform: k.to((v) => `rotateX(-90deg) scaleY(${v})`) }} />
                {/* the label at the top of the pin, turned back to face the camera */}
                <animated.div className="absolute left-0 top-0 [transform-style:preserve-3d]" style={{ transform: k.to((v) => `translateZ(${H * v}px)`) }}>
                  <animated.button data-pid={p.id} onClick={(e) => open(p, e.currentTarget, `Ranked #${data.rank[p.id]} of ${data.players.length} by predicted points.`)}
                    className="group absolute left-0 top-0 flex -translate-x-1/2 flex-col items-center whitespace-nowrap"
                    style={{ opacity: k, transform: tilt.rx.to((rx) => `translate(-50%, -100%) rotateX(${-rx}deg) translateY(-6px)`), transformOrigin: "50% 100%" }}>
                    <span className={`rounded-md border px-2 py-0.5 font-mono text-[12px] backdrop-blur max-sm:text-[10px] ${isCap ? "border-mint bg-mint text-bg" : "border-mint/40 bg-bg/70 text-mint group-hover:border-mint"}`}>
                      {p.pred.toFixed(1)}{isCap && " ×2"}
                    </span>
                    <span className="mt-1 text-[12px] font-medium text-text [text-shadow:0_1px_8px_rgb(var(--bg))] max-sm:text-[10px]">{p.name}</span>
                    {p.chance !== null && p.chance < 100 && <span className="font-mono text-[10px] text-amber">{p.chance}%</span>}
                  </animated.button>
                </animated.div>
              </div>
            );
          })}
        </animated.div>
      </div>
    </div>
  );
}
