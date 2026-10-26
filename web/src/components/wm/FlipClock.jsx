// Flip-card countdown. Adapted from Watermelon UI's flip-clock (MIT).
import { memo, useEffect, useState } from "react";

const FlipUnit = memo(function FlipUnit({ digit }) {
  const [prev, setPrev] = useState(digit);
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    if (digit === prev) return;
    setFlipping(true);
    const t = setTimeout(() => { setFlipping(false); setPrev(digit); }, 550);
    return () => clearTimeout(t);
  }, [digit, prev]);
  const half = "absolute inset-x-0 h-1/2 overflow-hidden bg-inherit";
  const Span = ({ pos, children }) => (
    <span className="absolute inset-x-0 flex h-[200%] items-center justify-center" style={{ top: pos === "top" ? "0%" : "-100%" }}>{children}</span>
  );
  return (
    <div className="relative h-[1.45em] w-[0.86em] overflow-hidden rounded-[0.12em] border border-line2 bg-raised text-text [perspective:1000px]">
      <div className={`${half} top-0`}><Span pos="top">{digit}</Span></div>
      <div className={`${half} top-1/2`}><Span pos="bottom">{prev}</Span></div>
      <div className={`${half} top-0 z-20 origin-bottom [backface-visibility:hidden] ${flipping ? "flip-top" : ""}`}><Span pos="top">{prev}</Span></div>
      <div className={`${half} top-1/2 z-10 origin-top [backface-visibility:hidden] ${flipping ? "flip-bottom" : ""}`} style={{ transform: "rotateX(90deg)" }}>
        <Span pos="bottom">{digit}</Span>
      </div>
      <div className="absolute inset-x-0 top-1/2 z-30 h-px -translate-y-1/2 bg-bg/70" />
    </div>
  );
});

function left(target) {
  const d = Math.max(0, target - Date.now());
  return { days: Math.floor(d / 864e5), hours: Math.floor((d / 36e5) % 24), minutes: Math.floor((d / 6e4) % 60), seconds: Math.floor((d / 1e3) % 60) };
}

export default function FlipClock({ target, className = "" }) {
  const [t, setT] = useState(() => left(target));
  useEffect(() => {
    const id = setInterval(() => setT((p) => { const n = left(target); return n.seconds === p.seconds && n.minutes === p.minutes ? p : n; }), 250);
    return () => clearInterval(id);
  }, [target]);
  const groups = [[t.days, "Days"], [t.hours, "Hrs"], [t.minutes, "Min"], [t.seconds, "Sec"]];
  return (
    <div className={`flex items-start gap-[0.3em] font-mono font-medium ${className}`} role="timer"
      aria-label={`${t.days} days ${t.hours} hours ${t.minutes} minutes`}>
      {groups.map(([v, lbl], i) => (
        <div key={lbl} className="flex items-start gap-[0.3em]">
          {i > 0 && <span className="-mx-[0.08em] pt-[0.18em] text-text3">:</span>}
          <div>
            <div className="flex gap-[0.08em]">{String(v).padStart(2, "0").split("").map((d, k) => <FlipUnit key={k} digit={d} />)}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-text3">{lbl}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
