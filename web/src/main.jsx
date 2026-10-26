import React from "react";
import { createRoot } from "react-dom/client";
import Lenis from "lenis";
import App from "./App.jsx";
import { reduced } from "./lib/motion.js";
import "./styles.css";

if (!reduced) {
  const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  window.__lenis = lenis;
}

createRoot(document.getElementById("root")).render(<App />);
