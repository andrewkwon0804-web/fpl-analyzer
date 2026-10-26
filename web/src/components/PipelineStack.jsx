// "How it works" as an exploded stack, drawn with three.js and scrubbed by scroll.
// It starts as one closed block seen from above, turns to an isometric view, then opens
// into its layers: raw match data, features, the model, and the best XI on a pitch.
// Every texture is drawn from site.json, so the stack shows this week's real data.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { reduced } from "../lib/motion.js";
import { usePop } from "./Popover.jsx";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const span = (p, a, b) => ease((p - a) / (b - a));

function canvasTex(draw, size = 1024) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// layer 1: last gameweek's rows as they come out of the database
function dataTex(data) {
  return canvasTex((x, S) => {
    x.fillStyle = "#07090b"; x.fillRect(0, 0, S, S);
    x.font = '500 30px "Geist Mono", monospace'; x.textBaseline = "top";
    x.fillStyle = "#6b7280"; x.fillText(`> SELECT * FROM player_matches WHERE gw = ${data.last_gw.gw}`, 56, 60);
    x.fillStyle = "#9aa3ad"; x.fillText("player        team pos  pred  pts", 56, 130);
    data.last_gw.team.forEach((p, i) => {
      const y = 180 + i * 56, hot = p.points > p.pred;
      x.fillStyle = hot ? "#ffb35c" : "#e8eaed";
      x.fillText(`${p.name.padEnd(13).slice(0, 13)} ${p.team.padEnd(4)} ${p.pos.padEnd(4)} ${p.pred.toFixed(1).padStart(4)}  ${String(p.points).padStart(3)}`, 56, y);
    });
    x.fillStyle = "#4b5563"; x.fillText(`${data.analysis.rows.toLocaleString("en-US")} rows since 2022-23`, 56, S - 90);
  });
}

// layer 2: fixture difficulty for the next five gameweeks, one of the model's inputs
function featureTex(data) {
  const cols = ["#1f8a5b", "#2f6f52", "#30363d", "#7a3b45", "#a3333f"];
  return canvasTex((x, S) => {
    x.fillStyle = "#07090b"; x.fillRect(0, 0, S, S);
    const teams = Object.keys(data.fixtures).sort(), gws = data.planGws, cw = (S - 200) / gws.length, rh = (S - 150) / teams.length;
    x.font = '500 22px "Geist Mono", monospace'; x.textBaseline = "middle";
    teams.forEach((t, r) => {
      x.fillStyle = "#8b949e"; x.fillText(t, 50, 110 + r * rh + rh / 2);
      gws.forEach((g, c) => {
        const f = data.fixtures[t][g] || [], d = f.length ? Math.round(f.reduce((s, q) => s + q.fdr, 0) / f.length) : 3;
        x.fillStyle = cols[d - 1]; x.fillRect(150 + c * cw + 4, 110 + r * rh + 3, cw - 8, rh - 6);
      });
    });
    x.fillStyle = "#8b949e"; gws.forEach((g, c) => x.fillText(`GW${g}`, 150 + c * cw + cw / 2 - 30, 70));
  });
}

// layer 4: the pitch the picks stand on
function pitchTex() {
  return canvasTex((x, S) => {
    for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? "#0b1f15" : "#0e2619"; x.fillRect(0, (i * S) / 12, S, S / 12); }
    x.strokeStyle = "rgba(190,255,220,.75)"; x.lineWidth = 5; const m = 60, W = S - 2 * m;
    x.strokeRect(m, m, W, W); x.beginPath(); x.moveTo(m, S / 2); x.lineTo(S - m, S / 2); x.stroke();
    x.beginPath(); x.arc(S / 2, S / 2, 110, 0, 7); x.stroke();
    x.strokeRect(S / 2 - 220, m, 440, 170); x.strokeRect(S / 2 - 220, S - m - 170, 440, 170);
  });
}

const LINKS = [["./dashboard.html#players", "Every player's prediction"], ["./dashboard.html#analysis-fdr", "Fixture difficulty"], ["#record", "Track record"], ["./dashboard.html#xi", "Best XI on the dashboard"]];

const LAYERS = (data) => [
  { n: 1, title: "Data", head: "Every Premier League match since 2022-23.", body: `${data.analysis.rows.toLocaleString("en-US")} player rows from the official FPL API and Vaastav Anand's archive, loaded into SQLite.`, side: "left" },
  { n: 2, title: "Features", head: "Form, minutes, xG and fixture difficulty.", body: "Built in SQL. Every rolling window ends the week before, so a row never sees its own match.", side: "right" },
  { n: 3, title: "Model", head: "Gradient boosting, tested on a season it never saw.", body: `Over 2025-26 its best XI beat a season-average pick by ${data.last_season_edge} points.`, side: "left" },
  { n: 4, title: "Picks", head: `Best XI for gameweek ${data.meta.gw}.`, body: "Each prediction is multiplied by FPL's chance of playing. Pin height is predicted points.", side: "right" },
];

export default function PipelineStack({ data }) {
  const wrap = useRef(null), mount = useRef(null), head = useRef(null), boxes = useRef([]), lines = useRef([]);
  const [shown, setShown] = useState(0);
  const [hover, setHover] = useState(-1);
  const [tip, setTip] = useState(null);
  const uiHover = useRef(-1), pinAnchor = useRef(null), selRef = useRef(-1);
  const [sel, setSel] = useState(-1);
  const { open: openPop } = usePop();
  const layers = LAYERS(data);
  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(5, 9, 4); scene.add(key);
    const rim = new THREE.PointLight(0x38e1a8, 30, 20); rim.position.set(-4, 2, -3); scene.add(rim);

    const slabGeo = new RoundedBoxGeometry(4, 0.2, 4, 6, 0.14);
    const metal = new THREE.MeshPhysicalMaterial({ color: 0x7d8288, metalness: 0.85, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 });
    const stack = new THREE.Group(); scene.add(stack);
    const mkSlab = (tex) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(slabGeo, metal));
      const top = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.7 }));
      top.rotation.x = -Math.PI / 2; top.position.y = 0.101; g.add(top);
      g.userData.top = top; stack.add(g); return g;
    };
    const slabs = [mkSlab(dataTex(data)), mkSlab(featureTex(data)), null, mkSlab(pitchTex())];

    // layer 3: the model, a graph of glowing nodes floating between the features and the picks
    const graph = new THREE.Group(); stack.add(graph);
    const pts = Array.from({ length: 38 }, () => new THREE.Vector3((Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 3.4));
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x9ff5d2, transparent: true });
    pts.forEach((p) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.045 + Math.random() * 0.03, 12, 12), nodeMat); s.position.copy(p); graph.add(s); });
    const seg = [];
    pts.forEach((a, i) => pts.map((b, j) => [j, a.distanceTo(b)]).filter(([j]) => j > i).sort((u, v) => u[1] - v[1]).slice(0, 2).forEach(([j]) => seg.push(a, pts[j])));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x38e1a8, transparent: true, opacity: 0.7 });
    graph.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), lineMat));

    // picks: one pin per player in the best XI, rising out of the pitch
    const xi = data.players.filter((p) => p.xi), rowZ = { GK: 1.45, DEF: 0.75, MID: -0.2, FWD: -1.15 };
    const pins = [], fatPins = [];
    for (const pos of Object.keys(rowZ)) {
      const row = xi.filter((p) => p.pos === pos);
      row.forEach((p, i) => {
        const isCap = p.id === data.captain, h = p.pred * 0.16;
        const mat = new THREE.MeshStandardMaterial({ color: isCap ? 0xffffff : 0x38e1a8, emissive: isCap ? 0xffffff : 0x38e1a8, emissiveIntensity: isCap ? 1.4 : 0.9 });
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 16), mat);
        m.position.set((i + 1) / (row.length + 1) * 3.2 - 1.6, 0, rowZ[pos]); slabs[3].add(m); pins.push([m, h, p]); m.userData.player = p;
        // a wider invisible cylinder around each pin so it's easy to hover and click
        const fat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        fat.userData.player = p; m.add(fat); fatPins.push(fat);
      });
    }

    // invisible plate so the model layer can be hovered like the others
    const graphHit = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    graphHit.rotation.x = -Math.PI / 2; graph.add(graphHit);
    slabs.forEach((g, i) => g && g.traverse((o) => (o.userData.layer = i)));
    graphHit.userData.layer = 2;
    const hitList = [...slabs.filter(Boolean).flatMap((g) => g.children), graphHit];

    // interaction: drag sideways to turn the stack, hover a layer to lift it, hover a pin for the player
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let mouse = null, drag = null, userRot = 0, vel = 0, hovered = -1, pinHit = null, opened = 0;
    const local = (e) => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const down = (e) => { drag = { x: e.clientX, moved: 0 }; };
    const move = (e) => {
      mouse = local(e);
      if (drag) { const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx); vel = dx * 0.008; userRot += vel; }
    };
    // what is under a screen point: a player's pin first, then a layer
    const pickAt = (x, y) => {
      ptr.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
      const ph = ray.intersectObjects(fatPins, false)[0];
      if (ph) return { player: ph.object.userData.player, layer: 3 };
      const h = ray.intersectObjects(hitList, false)[0];
      return { player: null, layer: h ? h.object.userData.layer : -1 };
    };
    const up = (e) => {
      if (!drag || drag.moved >= 5) { drag = null; return; }
      if (opened < 0.6) { // not open yet: a click scrolls to the point where the stack is fully open
        drag = null;
        const r = wrap.current, y = r.offsetTop + (r.offsetHeight - innerHeight) * 0.78;
        if (window.__lenis) window.__lenis.scrollTo(y, { duration: 1.6 }); else scrollTo({ top: y, behavior: "smooth" });
        return;
      }
      const [x, y] = local(e), hit = pickAt(x, y);
      pinHit = hit.player;
      // clicking a layer selects it (its callout shows a link); clicking empty space clears it
      if (!hit.player) { selRef.current = selRef.current === hit.layer ? -1 : hit.layer; setSel(selRef.current); }
      if (hit.player) {
        const a = pinAnchor.current; a.style.left = `${x}px`; a.style.top = `${y}px`;
        openPop(pinHit, a, `Ranked #${data.rank[pinHit.id]} of ${data.players.length} by predicted points.`);
      }
      drag = null;
    };
    const leave = () => { mouse = null; drag = null; };
    el.addEventListener("pointerdown", down); addEventListener("pointermove", move, { passive: true }); addEventListener("pointerup", up); el.addEventListener("pointerleave", leave);
    const lift = [0, 0, 0, 0];

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.5, 0.82); composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    size(); addEventListener("resize", size);
    const anchor = new THREE.Vector3();
    let raf = 0, p = 0, pt = 0, t0 = performance.now();
    const frame = (now) => {
      const r = wrap.current.getBoundingClientRect();
      const dt = Math.min(0.1, (now - (frame.last || now)) / 1000); frame.last = now;
      // ease towards the scroll position at the same speed whatever the frame rate
      pt = clamp(-r.top / (r.height - innerHeight)); p += (pt - p) * (1 - Math.exp(-dt * 5));
      const t = (now - t0) / 1000;
      // camera: from straight above to a three-quarter view, pulling back as the stack opens
      const k = span(p, 0.0, 0.3), open = span(p, 0.25, 0.7), gap = 0.24 + open * 1.25;
      const back = (1 + open * 0.9) * (el.clientWidth < 700 ? 1.5 : 1);
      camera.position.set(THREE.MathUtils.lerp(0.01, 7.5, k) * back, THREE.MathUtils.lerp(17, 6.0, k) * back + gap * 1.5, THREE.MathUtils.lerp(0.01, 7.5, k) * back);
      camera.lookAt(0, gap * 1.5 - 0.15, 0);
      slabs[0].position.y = 0; slabs[1].position.y = gap; graph.position.y = gap * 2; slabs[3].position.y = gap * 3;
      graph.scale.setScalar(0.4 + open * 0.6); nodeMat.opacity = open; lineMat.opacity = open * 0.7;
      if (head.current) head.current.style.opacity = String(1 - span(p, 0.22, 0.34));
      opened = open;
      if (!drag) { userRot += vel; vel *= 0.94; }
      stack.rotation.y = (reduced ? 0 : t * 0.04 + p * 0.6) + userRot;
      // what is under the pointer
      hovered = uiHover.current; pinHit = null;
      if (mouse && open > 0.6 && !drag) {
        const hit = pickAt(mouse[0], mouse[1]);
        pinHit = hit.player; if (hit.layer >= 0) hovered = hit.layer;
      }
      if (hovered === -1) hovered = selRef.current;
      el.style.cursor = pinHit ? "pointer" : drag ? "grabbing" : open > 0.6 ? "grab" : "pointer";
      setHover((v) => (v === hovered ? v : hovered));
      setTip((v) => (pinHit ? (v && v.p === pinHit && Math.abs(v.x - mouse[0]) < 2 ? v : { p: pinHit, x: mouse[0], y: mouse[1] }) : v ? null : v));
      [0, 1, 2, 3].forEach((i) => {
        lift[i] += ((hovered === i ? 0.32 : 0) - lift[i]) * 0.12;
        const g = slabs[i];
        if (g) g.userData.top.material.emissiveIntensity = THREE.MathUtils.lerp(g.userData.top.material.emissiveIntensity, hovered === -1 ? 0.55 : hovered === i ? 1.0 : 0.3, 0.12);
      });
      slabs[0].position.y += lift[0]; slabs[1].position.y += lift[1]; graph.position.y += lift[2]; slabs[3].position.y += lift[3];
      lineMat.opacity *= hovered === -1 || hovered === 2 ? 1 : 0.4;
      graph.rotation.y = t * 0.15;
      const rise = span(p, 0.6, 0.85);
      pins.forEach(([m, h], i) => { const hh = Math.max(0.001, h * clamp(rise * 1.4 - i * 0.03)); m.scale.y = hh; m.position.y = 0.1 + hh / 2; });
      stack.updateMatrixWorld(true);
      const visible = [0.38, 0.48, 0.58, 0.68].filter((v) => p > v).length;
      setShown((s) => (s === visible ? s : visible));
      // connector lines from each callout to its layer's front corner
      const targets = [slabs[0], slabs[1], graph, slabs[3]];
      targets.forEach((g, i) => {
        const box = boxes.current[i], line = lines.current[i];
        if (!box || !line) return;
        anchor.set(layers[i].side === "left" ? -2 : 2, 0.1, 2).applyMatrix4(g.matrixWorld).project(camera);
        const ax = (anchor.x * 0.5 + 0.5) * el.clientWidth, ay = (-anchor.y * 0.5 + 0.5) * el.clientHeight;
        const b = box.getBoundingClientRect(), m = el.getBoundingClientRect();
        const bx = layers[i].side === "left" ? b.right - m.left : b.left - m.left, by = b.top - m.top + b.height / 2;
        line.setAttribute("x1", bx); line.setAttribute("y1", by); line.setAttribute("x2", ax); line.setAttribute("y2", ay);
      });
      composer.render();
      raf = requestAnimationFrame(frame);
    };
    document.fonts.ready.then(() => { // redraw text textures once Geist Mono is ready
      slabs[0].children[1].material.map = slabs[0].children[1].material.emissiveMap = dataTex(data);
      slabs[1].children[1].material.map = slabs[1].children[1].material.emissiveMap = featureTex(data);
      raf = requestAnimationFrame(frame);
    });
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointerleave", leave); renderer.dispose(); el.innerHTML = "";
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section ref={wrap} id="how" className="relative h-[420vh]" data-tint="56 225 168" data-tint2="70 120 255" data-tx="50%" data-glow="0.45">
      <div className="sticky top-0 h-screen overflow-hidden">
        <div ref={head} className="page pointer-events-none absolute inset-x-0 top-28 z-10">
          <div className="mono-label text-text3">How it works</div>
          <h2 className="mt-3 font-display text-[clamp(36px,4.6vw,72px)] font-medium leading-none tracking-[-0.035em]">Four layers, rebuilt every week.</h2>
        </div>
        <div ref={mount} className="absolute inset-0 touch-pan-y [mask-image:linear-gradient(transparent,#000_14%,#000_86%,transparent)]" aria-label="A 3D stack showing the pipeline: data, features, model and picks" role="img" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full max-md:hidden" aria-hidden>
          {layers.map((l, i) => <line key={l.n} ref={(e) => (lines.current[i] = e)} stroke="rgb(var(--text3))" strokeWidth="1" strokeDasharray="2 4"
            style={{ opacity: i < shown ? 0.8 : 0, transition: "opacity .5s" }} />)}
        </svg>
        {layers.map((l, i) => (
          <div key={l.n} ref={(e) => (boxes.current[i] = e)} onMouseEnter={() => (uiHover.current = i)} onMouseLeave={() => (uiHover.current = -1)}
            className={`absolute w-[min(360px,40vw)] border ${hover === i ? "border-mint/70 bg-surface/90" : "border-line2 bg-bg/80"} p-5 backdrop-blur transition-all duration-700 max-md:inset-x-4 max-md:bottom-6 max-md:w-auto
              ${l.side === "left" ? "md:left-[5vw]" : "md:right-[5vw]"} ${i < shown ? "opacity-100" : "pointer-events-none translate-y-4 opacity-0"}
              ${i < shown - 1 ? "max-md:opacity-0" : ""}`}
            style={{ top: `${[66, 52, 36, 22][i]}%` }}>
            <div className="flex items-center justify-between gap-4">
              <span className={`${hover === i ? "bg-mint" : "bg-text"} px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-bg transition-colors`}>Layer {l.n}</span>
              <span className="font-mono text-[15px]">{l.title}</span>
            </div>
            <p className="mt-4 text-[15px] text-text">{l.head}</p>
            <p className="mt-2 font-mono text-[12px] leading-relaxed text-text3">{l.body}</p>
            <a href={LINKS[i][0]} onClick={(e) => { if (LINKS[i][0].startsWith("#")) { e.preventDefault(); document.querySelector(LINKS[i][0])?.scrollIntoView({ behavior: "smooth" }); } }}
              className={`grid font-mono text-[12px] uppercase tracking-[0.1em] text-mint transition-[grid-template-rows,opacity,margin] duration-500 ${sel === i || hover === i ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <span className="overflow-hidden">{LINKS[i][1]} ›</span>
            </a>
          </div>
        ))}
        <span ref={pinAnchor} data-pop className="pointer-events-none absolute h-0 w-0" />
        {tip && (
          <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap border border-line2 bg-bg/90 px-3 py-1.5 font-mono text-[12px] backdrop-blur"
            style={{ left: tip.x, top: tip.y }}>{tip.p.name} <span className="text-text3">{tip.p.short}</span> <span className="text-mint">{tip.p.pred.toFixed(1)}</span></div>
        )}
        <div className="mono-label absolute inset-x-0 bottom-8 text-center text-[10px] text-text3">
          {shown ? "Drag to turn · click a layer · click a pin for the player" : "Scroll or click to open the stack"}
        </div>
      </div>
    </section>
  );
}
