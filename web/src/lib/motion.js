import { useEffect, useRef, useState } from "react";

export const reduced = typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Fires once when the element first comes into view. A position check, not an
// IntersectionObserver, so elements that start clipped or scaled still trigger.
export function useInView(margin = 0.88) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(reduced);
  useEffect(() => {
    if (seen) return;
    const check = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * margin && r.bottom > 0) setSeen(true);
    };
    check();
    addEventListener("scroll", check, { passive: true });
    addEventListener("resize", check);
    return () => { removeEventListener("scroll", check); removeEventListener("resize", check); };
  }, [seen, margin]);
  return [ref, seen];
}

// Page scroll position, for parallax.
export function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setY(scrollY)); };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return y;
}

// 0 → 1 as a tall section scrolls through a pinned (sticky) viewport. Updates every frame
// without re-rendering React: pass onProgress to drive styles directly.
export function usePinProgress(onProgress) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0, cur = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const r = el.getBoundingClientRect(), goal = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
        cur += (goal - cur) * (reduced ? 1 : 0.12);
        if (r.bottom > -200 && r.top < innerHeight + 200) onProgress(cur);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onProgress]);
  return ref;
}
