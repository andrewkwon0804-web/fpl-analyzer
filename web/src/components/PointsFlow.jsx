// Where last gameweek's points came from: every point the model's XI scored flows from the
// player who scored it into the team total (the captain's count twice). Predicted points sit
// beside each name, so the misses are easy to see.
import { useEffect, useRef, useState } from "react";
import { reduced, useInView } from "../lib/motion.js";

const POS_HEX = { GK: "#F5C451", DEF: "#6F95FF", MID: "#38E1A8", FWD: "#FF7A8A" };

export default function PointsFlow({ L }) {
  const wrap = useRef(null), canvas = useRef(null), rows = useRef([]), sink = useRef(null), total = useRef(null);
  const [ref, seen] = useInView(0.8);
  const [run, setRun] = useState(0);
  const team = [...L.team].sort((a, b) => b.points * (b.cap ? 2 : 1) - a.points * (a.cap ? 2 : 1));
  const predicted = team.reduce((s, p) => s + p.pred * (p.cap ? 2 : 1), 0);

  useEffect(() => {
    if (!seen) return;
    const c = canvas.current, ctx = c.getContext("2d"), box = wrap.current;
    let W = 0, H = 0, dpr = 1;
    const size = () => { dpr = Math.min(devicePixelRatio, 2); W = box.clientWidth; H = box.clientHeight; c.width = W * dpr; c.height = H * dpr; };
    size(); addEventListener("resize", size);
    // one particle per point, released in turn from each player
    const queue = [];
    team.forEach((p, i) => { const n = Math.max(0, p.points * (p.cap ? 2 : 1)); for (let k = 0; k < n; k++) queue.push({ i, delay: i * 0.18 + k * 0.07 + Math.random() * 0.05 }); });
    const flying = [];
    let t = 0, got = 0, raf = 0, last = 0;
    const at = (el) => { const b = el.getBoundingClientRect(), o = box.getBoundingClientRect(); return [b.left - o.left, b.top - o.top, b.width, b.height]; };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
      while (queue.length && queue[0].delay <= t) {
        const q = queue.shift(), row = rows.current[q.i]; if (!row) continue;
        const [x, y, w, h] = at(row);
        flying.push({ i: q.i, x0: x + w, y0: y + h / 2 + (Math.random() - 0.5) * h * 0.5, f: 0, speed: 0.9 + Math.random() * 0.5, wob: Math.random() * 40 - 20 });
      }
      const [sx, sy, sw, sh] = at(sink.current), tx = sx + sw / 2, ty = sy + sh / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      for (let k = flying.length - 1; k >= 0; k--) {
        const p = flying[k]; p.f += dt * p.speed * (reduced ? 50 : 1);
        if (p.f >= 1) { flying.splice(k, 1); got++; if (total.current) total.current.textContent = String(got); continue; }
        const e = p.f * p.f * (3 - 2 * p.f), mx = (p.x0 + tx) / 2, my = (p.y0 + ty) / 2 + p.wob;
        const x = (1 - e) * (1 - e) * p.x0 + 2 * (1 - e) * e * mx + e * e * tx, y = (1 - e) * (1 - e) * p.y0 + 2 * (1 - e) * e * my + e * e * ty;
        const col = POS_HEX[team[p.i].pos];
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (queue.length || flying.length) raf = requestAnimationFrame(frame);
      else if (total.current) total.current.textContent = String(L.model);
    };
    if (total.current) total.current.textContent = "0";
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); };
  }, [seen, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const max = Math.max(...team.map((p) => p.points * (p.cap ? 2 : 1)), 1);
  return (
    <div ref={(e) => { wrap.current = e; ref.current = e; }} className="relative grid items-center gap-8 rounded-[6px] border border-line bg-bg/60 p-5 backdrop-blur md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:p-7">
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <ol className="relative grid gap-1.5" aria-label="Points by player">
        {team.map((p, i) => {
          const pts = p.points * (p.cap ? 2 : 1);
          return (
            <li key={p.name + i} ref={(e) => (rows.current[i] = e)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[13.5px]">
              <span className="flex min-w-0 items-center gap-2">
                <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: POS_HEX[p.pos] }} />
                <span className="truncate text-text">{p.name}{p.cap && <span className="ml-1.5 rounded-[3px] bg-text px-1 text-[10px] font-medium text-bg">C</span>}</span>
                <span className="hidden font-mono text-[11px] text-text3 sm:inline">{p.team}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-text3">pred {(p.pred * (p.cap ? 2 : 1)).toFixed(1)}</span>
                <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-line"><i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(pts / max) * 100}%`, background: POS_HEX[p.pos] }} /></span>
                <span className="num w-6 text-right font-mono text-[13px] text-text">{pts}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="relative flex flex-col items-center justify-center gap-2 py-6">
        <div ref={sink} className="grid h-[200px] w-[200px] place-items-center rounded-full border border-line2 bg-[radial-gradient(circle,rgb(var(--mint)/.18),transparent_65%)] md:h-[240px] md:w-[240px]">
          <div className="text-center">
            <div ref={total} className="num font-display text-[72px] font-medium leading-none tracking-[-0.04em] text-mint">0</div>
            <div className="mt-1 text-[12px] text-text3">points scored</div>
          </div>
        </div>
        <div className="text-[13px] text-text2">Predicted {predicted.toFixed(0)}, scored {L.model}</div>
        <button onClick={() => setRun((r) => r + 1)} className="text-[12px] text-text3 underline decoration-line2 underline-offset-4 hover:text-text">Play it again</button>
      </div>
    </div>
  );
}
