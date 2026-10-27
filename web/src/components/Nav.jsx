import { useEffect, useState } from "react";
import { animated, useSpring } from "@react-spring/web";

const REPO = "https://github.com/andrewkwon0804-web/fpl-analyzer";
export const HOME_LINKS = [["#how", "How it works"], ["#record", "Track record"], ["#findings", "Findings"], ["./research.html", "Model report"], ["#faq", "FAQ"]];

export function goTo(hash) {
  const el = document.querySelector(hash);
  if (!el) return;
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -90 });
  else el.scrollIntoView({ behavior: "smooth" });
}

export default function Nav({ onCommand, links = HOME_LINKS, cta = ["./dashboard.html", "Dashboard"] }) {
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
    <header className="fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-50">
      <div className="page">
        <div className={`flex h-[52px] items-center justify-between gap-3 rounded-[6px] border pl-4 pr-1.5 backdrop-blur-md transition-colors ${scrolled ? "border-line2 bg-bg/80" : "border-line bg-bg/40"}`}>
          <a href="./" className="flex items-center gap-2.5 whitespace-nowrap text-[15px] font-medium tracking-[-0.01em]">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden><rect x="2" y="9" width="5" height="13" fill="currentColor" /><rect x="9.5" y="5" width="5" height="17" fill="currentColor" /><rect x="17" y="2" width="5" height="20" fill="rgb(var(--mint))" /></svg>
            FPL Points Lab
          </a>
          <nav className="hidden gap-7 font-mono text-[12px] uppercase tracking-[0.1em] text-text2 lg:flex">
            {links.map(([h, t]) => <a key={h} href={h} onClick={(e) => { if (h.startsWith("#")) { e.preventDefault(); goTo(h); } }} className="transition-colors hover:text-text">{t}</a>)}
          </nav>
          <div className="flex items-center gap-1.5">
            <button onClick={onCommand} className="hidden h-9 items-center gap-2 rounded-[4px] border border-line2 px-3 font-mono text-[12px] uppercase tracking-[0.1em] text-text2 hover:text-text md:flex">
              Search <kbd className="text-text3">{mac ? "⌘" : "Ctrl"}K</kbd>
            </button>
            <a href={cta[0]} className="hidden h-9 items-center rounded-[4px] bg-text px-3.5 font-mono text-[12px] uppercase tracking-[0.1em] text-bg hover:bg-mint sm:flex">{cta[1]} ›</a>
            <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu" className="hit grid h-9 w-9 place-items-center rounded-[4px] border border-line2 lg:hidden">
              <span className="relative block h-3 w-4">
                <span className={`absolute left-0 h-px w-4 bg-text transition-transform ${open ? "top-1.5 rotate-45" : "top-0.5"}`} />
                <span className={`absolute left-0 h-px w-4 bg-text transition-transform ${open ? "top-1.5 -rotate-45" : "top-2.5"}`} />
              </span>
            </button>
          </div>
        </div>
        <animated.nav style={{ maxHeight: menu.h, opacity: menu.o }} className="mt-2 overflow-hidden rounded-[6px] border border-line2 bg-bg/90 px-4 backdrop-blur-md lg:hidden" aria-label="Menu">
          {[...links, cta, [REPO, "GitHub"]].map(([h, t]) => (
            <a key={h} href={h} onClick={(e) => { if (h.startsWith("#")) { e.preventDefault(); goTo(h); } setOpen(false); }}
              className="block border-b border-line py-3.5 font-mono text-[13px] uppercase tracking-[0.1em] last:border-0">{t}</a>
          ))}
        </animated.nav>
      </div>
    </header>
  );
}
