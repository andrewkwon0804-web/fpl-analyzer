// Player pop-up: next five gameweeks, price, news and a link to the full record.
// Any component can open it with usePop().open(player, anchorElement, note).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animated, to, useTransition } from "@react-spring/web";

const PopContext = createContext(null);
export const usePop = () => useContext(PopContext);

export function PopProvider({ data, children }) {
  const [pop, setPop] = useState(null);
  const close = useCallback(() => setPop(null), []);
  const open = useCallback((player, anchor, note = "") => {
    setPop((cur) => (cur && cur.anchor === anchor && !note ? null : { player, anchor, note }));
  }, []);
  useEffect(() => {
    const key = (e) => e.key === "Escape" && close();
    const click = (e) => { if (!e.target.closest("[data-pop], [data-pid], .finder")) close(); };
    addEventListener("keydown", key); document.addEventListener("pointerdown", click);
    return () => { removeEventListener("keydown", key); document.removeEventListener("pointerdown", click); };
  }, [close]);
  return (
    <PopContext.Provider value={{ open, close, current: pop }}>
      {children}
      {createPortal(<Card pop={pop} data={data} close={close} />, document.body)}
    </PopContext.Provider>
  );
}

function Card({ pop, data, close }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const place = useCallback(() => {
    if (!pop || !ref.current || innerWidth < 640) return;
    const r = pop.anchor.getBoundingClientRect(), w = ref.current.offsetWidth, h = ref.current.offsetHeight;
    let y = r.bottom + 10;
    if (y + h > innerHeight - 12) y = r.top - h - 10;
    setPos({ x: Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)), y: Math.max(12, y) });
  }, [pop]);
  useLayoutEffect(place, [place]);
  useEffect(() => { addEventListener("scroll", place, { passive: true }); return () => removeEventListener("scroll", place); }, [place]);
  const t = useTransition(pop, { from: { o: 0, s: 0.94, y: 10 }, enter: { o: 1, s: 1, y: 0 }, leave: { o: 0, s: 0.96, y: 6 }, config: { tension: 320, friction: 26 } });
  return t((st, p) => p && (
    <animated.div ref={ref} data-pop role="dialog" aria-label={`${p.player.name} details`}
      className="glass fixed z-[120] w-auto rounded-2xl border border-line2 p-5 shadow-2xl max-sm:inset-x-2.5 max-sm:bottom-2.5 sm:w-[340px]"
      style={{ left: innerWidth >= 640 ? pos.x : undefined, top: innerWidth >= 640 ? pos.y : undefined, opacity: st.o,
        transform: to([st.y, st.s], (y, sc) => `translateY(${y}px) scale(${sc})`) }}>
      <Body p={p.player} note={p.note} data={data} close={close} />
    </animated.div>
  ));
}

function Body({ p, note, data, close }) {
  const pts = Object.fromEntries(p.h.map(([g, v]) => [g, v]));
  const top = Math.max(1, ...data.planGws.map((g) => pts[g] || 0));
  const total = data.planGws.reduce((s, g) => s + (pts[g] || 0), 0);
  return (
    <>
      <button onClick={close} aria-label="Close" className="absolute right-2.5 top-2 h-8 w-8 rounded-full text-xl text-text3 hover:bg-raised hover:text-text">×</button>
      <div className="flex items-end justify-between gap-3 pr-6">
        <div>
          <h4 className="font-display text-[22px] font-medium leading-tight">{p.name}</h4>
          <span className="text-[13px] text-text3">{p.team}, {p.pos}, £{p.price.toFixed(1)}m</span>
        </div>
        <div className="text-right">
          <b className="num block font-display text-[30px] font-medium leading-none text-mint">{p.pred.toFixed(1)}</b>
          <span className="text-[11px] text-text3">GW{data.meta.gw}</span>
        </div>
      </div>
      {p.chance !== null && p.chance < 100 && (
        <p className="mt-3 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-[13px] text-text2"><b className="text-amber">{p.chance}% to play.</b> {p.news}</p>
      )}
      {note && <p className="mt-3 text-[13px] leading-relaxed text-text2">{note}</p>}
      <div className="mb-2 mt-4 flex justify-between text-[13px] text-text2">Next five gameweeks <span className="num text-text">{total.toFixed(1)} pts</span></div>
      <div className="grid grid-cols-5 items-end gap-1.5">
        {data.planGws.map((g) => {
          const f = (data.fixtures[p.short] || {})[g] || [];
          const fdr = f.length ? Math.round(f.reduce((s, r) => s + r.fdr, 0) / f.length) : 0;
          const v = pts[g] || 0;
          return (
            <div key={g} className="flex flex-col items-center gap-1">
              <span className="num text-xs text-text2">{v.toFixed(1)}</span>
              <i className="block w-3/5 rounded-t bg-gradient-to-b from-mint to-mint/30" style={{ height: Math.max(3, (v / top) * 44) }} />
              <span className={`w-full rounded py-0.5 text-center text-[11px] ${fdr ? `fdr-${fdr}` : "fdr-3"}`}>
                {f.length ? f.map((r) => (r.home ? r.opp : r.opp.toLowerCase())).join("+") : "blank"}
              </span>
              <small className="text-[10px] text-text3">GW{g}</small>
            </div>
          );
        })}
      </div>
      <a href={`../dashboard.html?player=${p.id}#lookup`} className="mt-4 block border-t border-line pt-3 text-sm text-mint">Full record and chart ›</a>
    </>
  );
}
