import { useEffect, useState } from "react";
import { animated, useSpring } from "@react-spring/web";

const REPO = "https://github.com/andrewkwon0804-web/fpl-analyzer";
const LINKS = [["#last", "Last gameweek"], ["#how", "How it works"], ["#record", "Track record"], ["#findings", "Findings"], ["#faq", "FAQ"]];

export function goTo(hash) {
  const el = document.querySelector(hash);
  if (!el) return;
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -90 });
  else el.scrollIntoView({ behavior: "smooth" });
}

function ThemeToggle() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || "dark");
  const s = useSpring({ x: theme === "light" ? 16 : 0, config: { tension: 400, friction: 26 } });
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    const apply = () => { document.documentElement.dataset.theme = next; setTheme(next); };
    try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked */ }
    if (document.startViewTransition) document.startViewTransition(apply); else apply();
  };
  return (
    <button onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="relative h-10 w-[58px] rounded-full border border-line2 bg-raised/70 p-1">
      <animated.span style={{ transform: s.x.to((x) => `translateX(${x}px)`) }}
        className="grid h-8 w-8 place-items-center rounded-full bg-surface text-sm shadow">{theme === "dark" ? "☾" : "☀"}</animated.span>
    </button>
  );
}

export default function Nav({ onCommand }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 30);
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  const menu = useSpring({ h: open ? 380 : 0, o: open ? 1 : 0, config: { tension: 280, friction: 30 } });
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="fixed inset-x-0 top-[max(14px,env(safe-area-inset-top))] z-50">
      <div className={`page`}>
        <div className={`glass flex items-center justify-between gap-3 rounded-2xl border py-2 pl-4 pr-2 transition-colors ${scrolled ? "border-line2" : "border-line"}`}>
          <a href="./" className="flex items-center gap-2.5 whitespace-nowrap font-display text-[15px] font-semibold">
            <span className="relative h-5 w-5 rounded-[5px] border-[1.5px] border-mint shadow-[0_0_12px_rgb(var(--mint)/.45)]">
              <span className="absolute inset-y-[3px] left-1/2 border-l-[1.5px] border-mint" />
            </span>
            FPL Points Lab
          </a>
          <nav className="hidden gap-6 text-sm text-text2 lg:flex">
            {LINKS.map(([h, t]) => <a key={h} href={h} onClick={(e) => { e.preventDefault(); goTo(h); }} className="transition-colors hover:text-text">{t}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={onCommand} className="hidden h-10 items-center gap-2 rounded-xl border border-line2 bg-raised/60 px-3 text-sm text-text3 hover:text-text md:flex">
              Search <kbd className="rounded border border-line2 px-1.5 font-mono text-[11px]">{mac ? "⌘" : "Ctrl"} K</kbd>
            </button>
            <ThemeToggle />
            <a href="../dashboard.html" className="hidden h-10 items-center rounded-xl bg-text px-4 text-sm font-medium text-bg hover:bg-mint sm:flex">Dashboard ›</a>
            <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu"
              className="grid h-10 w-10 place-items-center rounded-xl border border-line2 bg-raised/60 lg:hidden">
              <span className="relative block h-3 w-4">
                <span className={`absolute left-0 h-[1.5px] w-4 bg-text transition-transform ${open ? "top-1.5 rotate-45" : "top-0"}`} />
                <span className={`absolute left-0 top-1.5 h-[1.5px] w-4 bg-text transition-opacity ${open ? "opacity-0" : ""}`} />
                <span className={`absolute left-0 h-[1.5px] w-4 bg-text transition-transform ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
              </span>
            </button>
          </div>
        </div>
        <animated.nav style={{ maxHeight: menu.h, opacity: menu.o }} className="glass mt-2 overflow-hidden rounded-2xl border border-line2 px-4 lg:hidden" aria-label="Menu">
          {[...LINKS, ["../dashboard.html", "Dashboard"], [REPO, "GitHub"]].map(([h, t]) => (
            <a key={h} href={h} onClick={(e) => { if (h.startsWith("#")) { e.preventDefault(); goTo(h); } setOpen(false); }}
              className="block border-b border-line py-3.5 text-[17px] last:border-0">{t}</a>
          ))}
        </animated.nav>
      </div>
    </header>
  );
}
