// Small messages at the bottom of the screen, with an optional Undo button.
// const toast = useToast(); toast("Squad cleared", { undo: () => restore() })
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { animated, useTransition } from "@react-spring/web";

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const drop = useCallback((k) => setItems((xs) => xs.filter((x) => x.k !== k)), []);
  const show = useCallback((text, { undo, ms = 6000 } = {}) => {
    const k = ++id.current;
    setItems((xs) => [...xs.slice(-2), { k, text, undo }]);
    setTimeout(() => drop(k), ms);
  }, [drop]);
  const tr = useTransition(items, { keys: (x) => x.k, from: { o: 0, y: 20 }, enter: { o: 1, y: 0 }, leave: { o: 0, y: 10 }, config: { tension: 380, friction: 28 } });
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-[160] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {tr((st, x) => (
          <animated.div style={{ opacity: st.o, transform: st.y.to((y) => `translateY(${y}px)`) }}
            className="pointer-events-auto flex items-center gap-4 rounded-[4px] border border-line2 bg-surface py-2.5 pl-4 pr-2 text-sm shadow-2xl">
            {x.text}
            {x.undo && <button onClick={() => { x.undo(); drop(x.k); }} className="hit rounded-lg px-3 py-1.5 font-medium text-mint hover:bg-raised">Undo</button>}
            <kbd className="hidden">z</kbd>
          </animated.div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
