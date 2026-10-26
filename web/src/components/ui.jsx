// Small building blocks shared by every page. Each one is self-contained so the set can be
import { useEffect, useRef } from "react";
// lifted into another project with only the tokens in styles.css changed.
import { animated, to, useSpring, useTrail } from "@react-spring/web";
import { useInView, reduced } from "../lib/motion.js";

const spring = { tension: 170, friction: 24 };

export function Button({ href, children, variant = "primary", className = "", ...rest }) {
  const base = "group relative inline-flex h-11 items-center gap-2.5 overflow-hidden rounded-xl px-5 text-[15px] font-medium transition-[transform,background,border-color,box-shadow] duration-300 hover:-translate-y-0.5";
  const styles = {
    primary: "bg-text text-bg hover:bg-mint hover:shadow-[0_0_32px_rgb(var(--mint)/.35)]",
    ghost: "border border-line2 bg-raised/60 text-text hover:border-text3",
  };
  const Tag = href ? "a" : "button";
  return (
    <Tag href={href} className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {/* a light sweep across primary buttons on hover */}
      {variant === "primary" && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/50 opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />
      )}
      <span className="relative">{children}</span>
      {variant === "primary" && <span aria-hidden className="relative transition-transform duration-300 group-hover:translate-x-1">›</span>}
    </Tag>
  );
}

export function Badge({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "border-line2 text-text2",
    mint: "border-mint/40 bg-mint/10 text-mint",
    amber: "border-amber/40 bg-amber/10 text-amber",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${tones[tone]} ${className}`}>{children}</span>;
}

// Small monospace section label, "// 02 LAST GAMEWEEK", with a line that springs out.
export function Kicker({ children, n }) {
  const [ref, seen] = useInView();
  const s = useSpring({ width: seen ? 28 : 0, opacity: seen ? 1 : 0, config: spring });
  return (
    <div ref={ref} className="mono-label mb-5 flex items-center gap-3 text-mint">
      <animated.span style={{ opacity: s.opacity }} className="text-text3">//{n ? ` ${n}` : ""}</animated.span>
      <animated.span style={{ opacity: s.opacity }}>{children}</animated.span>
      <animated.span style={{ width: s.width }} className="h-px bg-mint/60" />
    </div>
  );
}

// A heading whose words spring up one after another when it scrolls into view.
export function SplitTitle({ text, as: Tag = "h2", className = "" }) {
  const [ref, seen] = useInView();
  const words = text.split(" ");
  const trail = useTrail(words.length, {
    from: { y: 110, r: 4 }, to: { y: seen ? 0 : 110, r: seen ? 0 : 4 }, config: { tension: 210, friction: 26 },
    immediate: reduced,
  });
  return (
    <Tag ref={ref} className={className} aria-label={text}>
      {trail.map((s, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-top">
          <animated.span className="inline-block" style={{ transform: to([s.y, s.r], (y, r) => `translateY(${y}%) rotate(${r}deg)`) }}>
            {words[i]}
          </animated.span>
          {i < words.length - 1 && " "}
        </span>
      ))}
    </Tag>
  );
}

// Fades and lifts its children into place once.
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }) {
  const [ref, seen] = useInView();
  const s = useSpring({ opacity: seen ? 1 : 0, y: seen ? 0 : 28, delay: seen ? delay : 0, config: spring, immediate: reduced });
  const A = animated[Tag];
  return <A ref={ref} className={className} style={{ opacity: s.opacity, transform: s.y.to((y) => `translateY(${y}px)`) }}>{children}</A>;
}

export function CountUp({ to, decimals = 0, prefix = "", className = "" }) {
  const [ref, seen] = useInView();
  const s = useSpring({ v: seen ? to : 0, config: { tension: 60, friction: 22 }, immediate: reduced });
  return <animated.span ref={ref} className={`num ${className}`}>{s.v.to((v) => prefix + v.toFixed(decimals))}</animated.span>;
}

// One huge word that runs off the edge of the page and drifts sideways as you scroll.
export function BigWord({ children, offset = 0 }) {
  const [ref, seen] = useInView(1.2);
  const inner = useRef(null);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current, w = inner.current;
        if (!el || !w) return;
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) return;
        w.style.setProperty("--drift", `${(r.top - innerHeight / 2) * 0.25}px`);
      });
    };
    on(); addEventListener("scroll", on, { passive: true });
    return () => { cancelAnimationFrame(raf); removeEventListener("scroll", on); };
  }, [ref]);
  return (
    <div ref={ref} aria-hidden className="pointer-events-none relative -mx-4 overflow-hidden sm:-mx-8 lg:-mx-14">
      <div ref={inner}
        className="bigword whitespace-nowrap font-display font-bold leading-[0.8] tracking-[-0.06em] text-transparent"
        style={{
          fontSize: "clamp(110px, 22vw, 380px)",
          WebkitTextStroke: "1px rgb(var(--line2))",
          transform: `translateX(calc(${offset}% + var(--drift, 0px)))`,
          opacity: seen ? 1 : 0, transition: "opacity 1.2s var(--ease)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Moves its children at a different speed from the page, without re-rendering React on scroll.
export function Parallax({ speed = -0.06, children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (ref.current) ref.current.style.transform = `translate3d(0,${scrollY * speed}px,0)`; }); };
    on(); addEventListener("scroll", on, { passive: true });
    return () => { cancelAnimationFrame(raf); removeEventListener("scroll", on); };
  }, [speed]);
  return <div ref={ref} className={className}>{children}</div>;
}
