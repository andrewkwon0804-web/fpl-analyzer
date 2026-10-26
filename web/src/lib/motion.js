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
