import { createRoot } from "react-dom/client";
import Lenis from "lenis";
import { reduced } from "./motion.js";
import "../styles.css";

// Shared start-up for every page: smooth scrolling, then render.
export function boot(element) {
  if (!reduced) {
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    window.__lenis = lenis;
  }
  createRoot(document.getElementById("root")).render(element);
}
