// Floating pill at the bottom of the page: current section, scroll progress, and a section
// index that opens on click. Adapted from Watermelon UI's scroll-island (MIT).
import { useEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";

export default function ScrollIsland({ topics, onGo }) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(topics[0]);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      setProgress(max > 0 ? Math.min(100, (scrollY / max) * 100) : 0);
      setShow(scrollY > innerHeight * 0.6);
      let cur = topics[0];
      for (const t of topics) { const el = document.getElementById(t.id); if (el && el.getBoundingClientRect().top < innerHeight * 0.45) cur = t; }
      setCurrent(cur);
    };
    on(); addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, [topics]);
  useEffect(() => { const k = (e) => e.key === "Escape" && setOpen(false); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  return (
    <MotionConfig transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}>
      <AnimatePresence>
        {open && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}
          className="fixed inset-0 z-[90] bg-bg/50 backdrop-blur-sm" />}
      </AnimatePresence>
      <motion.div initial={false} animate={{ y: show || open ? 0 : 120, opacity: show || open ? 1 : 0 }}
        className="pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-[95] flex justify-center px-4">
        <motion.div layout style={{ borderRadius: open ? 22 : 30 }}
          className="pointer-events-auto w-[min(420px,100%)] overflow-hidden border border-line2 bg-surface/95 shadow-2xl backdrop-blur"
          animate={{ width: open ? 420 : 300 }}>
          <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Sections"
            className="flex h-[52px] w-full items-center justify-between gap-4 px-3.5">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="relative h-7 w-7 shrink-0 rounded-full" style={{ background: `conic-gradient(rgb(var(--mint)) ${progress}%, rgb(var(--line2)) 0)` }}>
                <span className="absolute inset-[2.5px] rounded-full bg-surface" />
              </span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={current.id} initial={{ y: 14, opacity: 0, filter: "blur(3px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: -14, opacity: 0, filter: "blur(3px)" }} transition={{ type: "tween", duration: 0.25 }} className="truncate text-[15px] font-medium">{current.title}</motion.span>
              </AnimatePresence>
              <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-text3">⌄</motion.span>
            </span>
            <span className="num rounded-full bg-raised px-2.5 py-0.5 font-mono text-sm text-text2">{Math.round(progress)}%</span>
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-2 pb-2">
                <div className="mx-2 mb-1 h-px bg-line" />
                {topics.map((t, i) => (
                  <button key={t.id} onClick={() => { setOpen(false); onGo("#" + t.id); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-raised ${t.id === current.id ? "text-text" : "text-text3"}`}>
                    <span className="font-mono text-[11px] text-text3">{String(i + 1).padStart(2, "0")}</span>{t.title}
                  </button>
                ))}
              </motion.nav>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
