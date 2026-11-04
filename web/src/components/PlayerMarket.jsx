// "The market": every player as a point, price along the bottom and predicted points up the
// side. Scrolling turns the flat chart into 3D, pulls the four positions apart into their own
// lanes, then draws each position's value line: the most points any price can buy. Players
// who sit on that line are the cheapest way to reach their level.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { reduced } from "../lib/motion.js";
import { usePop } from "./Popover.jsx";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const span = (p, a, b) => ease((p - a) / (b - a));
const POS = ["GK", "DEF", "MID", "FWD"];
const NAME = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
const HEX = { GK: "#F5C451", DEF: "#6F95FF", MID: "#38E1A8", FWD: "#FF7A8A" };
const LANE = { GK: -2.7, DEF: -0.9, MID: 0.9, FWD: 2.7 };

// The most points each price can buy: walk up the price list and keep every player who
// beats everyone cheaper. Those players are the line.
function frontier(players) {
  const sorted = [...players].sort((a, b) => a.price - b.price || b.pred - a.pred);
  let best = -1; const out = [];
  for (const p of sorted) if (p.pred > best + 0.05) { out.push(p); best = p.pred; }
  return out;
}

export default function PlayerMarket({ data }) {
  const wrap = useRef(null), mount = useRef(null), anchor = useRef(null), labels = useRef({});
  const [step, setStep] = useState(0);
  const [tip, setTip] = useState(null);
  const { open: openPop } = usePop();

  const model = useMemo(() => {
    const ps = data.players.filter((p) => p.pred > 0.2);
    const lines = Object.fromEntries(POS.map((pos) => [pos, frontier(ps.filter((p) => p.pos === pos))]));
    // one value pick per position: on the line, at least 3.5 points, best points per £m
    const picks = POS.map((pos) => lines[pos].filter((p) => p.pred >= 3.5).sort((a, b) => b.pred / b.price - a.pred / a.price)[0]).filter(Boolean);
    return { ps, lines, picks, maxPrice: Math.ceil(Math.max(...ps.map((p) => p.price))), maxPred: Math.ceil(Math.max(...ps.map((p) => p.pred))) };
  }, [data]);

  useEffect(() => {
    const el = mount.current, { ps, lines, picks, maxPrice, maxPred } = model;
    const X = (price) => ((price - 4) / (maxPrice - 4)) * 10 - 5, Y = (pred) => (pred / maxPred) * 4.2;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
    const world = new THREE.Group(); scene.add(world);

    // grid: price lines every £1m and points lines every point, on a back wall and a floor
    const gridMat = new THREE.LineBasicMaterial({ color: 0x2a2f36, transparent: true, opacity: 0.9 });
    const g = [];
    for (let m = 4; m <= maxPrice; m++) g.push(new THREE.Vector3(X(m), 0, -3.6), new THREE.Vector3(X(m), 4.4, -3.6), new THREE.Vector3(X(m), 0, -3.6), new THREE.Vector3(X(m), 0, 3.6));
    for (let v = 0; v <= maxPred; v++) g.push(new THREE.Vector3(-5.2, Y(v), -3.6), new THREE.Vector3(5.2, Y(v), -3.6));
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(g), gridMat); world.add(grid);

    // players: one instanced sphere each, coloured by position
    const geo = new THREE.IcosahedronGeometry(0.055, 2);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const dots = new THREE.InstancedMesh(geo, mat, ps.length);
    const hit = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshBasicMaterial({ visible: false }), ps.length);
    const col = new THREE.Color(), pickSet = new Set(picks.map((p) => p.id));
    ps.forEach((p, i) => {
      col.set(HEX[p.pos]).multiplyScalar(pickSet.has(p.id) ? 1.6 : 0.9);
      dots.setColorAt(i, col);
    });
    world.add(dots, hit);

    // the value lines, one per position, drawn as steps along their lane
    const lineMats = {}, lineObjs = {};
    POS.forEach((pos) => {
      const pts = [];
      lines[pos].forEach((p, i, a) => {
        pts.push(new THREE.Vector3(X(p.price), Y(p.pred), 0));
        if (a[i + 1]) pts.push(new THREE.Vector3(X(a[i + 1].price), Y(p.pred), 0));
      });
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      lineMats[pos] = new THREE.LineBasicMaterial({ color: new THREE.Color(HEX[pos]).multiplyScalar(1.4), transparent: true, opacity: 0, toneMapped: false });
      lineObjs[pos] = new THREE.Line(geom, lineMats[pos]); world.add(lineObjs[pos]);
    });

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.2); composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    size(); addEventListener("resize", size);

    // pointer: hover a dot for its player, click to open the player card, drag to turn
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let mouse = null, drag = null, yaw = 0, vel = 0, hovered = null;
    const local = (e) => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const pickAt = (x, y) => {
      ptr.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
      const h = ray.intersectObject(hit, false)[0];
      return h ? ps[h.instanceId] : null;
    };
    const down = (e) => { drag = { x: e.clientX, moved: 0 }; };
    const move = (e) => { mouse = local(e); if (drag) { const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx); vel = dx * 0.006; yaw += vel; } };
    const up = (e) => {
      if (drag && drag.moved < 5) {
        const [x, y] = local(e), p = pickAt(x, y);
        if (p) { const a = anchor.current; a.style.left = `${x}px`; a.style.top = `${y}px`; openPop(p, a, `£${p.price.toFixed(1)}m, ${(p.pred / p.price).toFixed(2)} predicted points per £m.`); }
      }
      drag = null;
    };
    const leave = () => { mouse = null; };
    el.addEventListener("pointerdown", down); addEventListener("pointermove", move, { passive: true }); addEventListener("pointerup", up); el.addEventListener("pointerleave", leave);

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), proj = new THREE.Vector3();
    const order = ps.map((_, i) => i).sort((a, b) => ps[b].pred - ps[a].pred), rankOf = new Array(ps.length);
    order.forEach((idx, r) => { rankOf[idx] = r / ps.length; });
    let raf = 0, p = 0, last = 0;
    const place = (sel, x, y, z, show) => {
      const node = labels.current[sel]; if (!node) return;
      proj.set(x, y, z).applyMatrix4(world.matrixWorld).project(camera);
      node.style.transform = `translate(${(proj.x * 0.5 + 0.5) * el.clientWidth}px, ${(-proj.y * 0.5 + 0.5) * el.clientHeight}px)`;
      node.style.opacity = String(show);
    };
    const frame = (now) => {
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
      const r = wrap.current.getBoundingClientRect();
      const pt = clamp(-r.top / Math.max(1, r.height - innerHeight));
      p += (pt - p) * (reduced ? 1 : 1 - Math.exp(-dt * 5));
      const rise = span(p, 0, 0.12), turn = span(p, 0.38, 0.62), sep = span(p, 0.45, 0.7), draw = span(p, 0.7, 0.9);
      const narrow = el.clientWidth < 700;
      // camera: straight-on chart, then round to a three-quarter view of the lanes
      const az = THREE.MathUtils.lerp(0, -0.62, turn), el2 = THREE.MathUtils.lerp(0.04, 0.42, turn);
      const dist = (narrow ? 34 : 25) + turn * 3;
      camera.position.set(Math.sin(az) * Math.cos(el2) * dist, 2.1 + Math.sin(el2) * dist, Math.cos(az) * Math.cos(el2) * dist);
      camera.lookAt(narrow ? 0 : THREE.MathUtils.lerp(-2.6, -0.6, turn), narrow ? 1.2 : 2.1, 0);
      if (!drag) { yaw += vel; vel *= 0.93; yaw *= turn > 0.5 ? 1 : 0.9; }
      world.rotation.y = yaw * turn;

      ps.forEach((pl, i) => {
        const k = clamp(rise * 1.6 - rankOf[i] * 0.6);
        const big = pickSet.has(pl.id) ? 1 + draw * 1.4 : 1;
        v.set(X(pl.price), Y(pl.pred) * k, LANE[pl.pos] * sep);
        s.setScalar((0.35 + 0.65 * k) * big * (hovered === pl ? 2.2 : 1));
        m4.compose(v, q, s); dots.setMatrixAt(i, m4);
        s.setScalar(1); m4.compose(v, q, s); hit.setMatrixAt(i, m4);
      });
      dots.instanceMatrix.needsUpdate = true; hit.instanceMatrix.needsUpdate = true;
      POS.forEach((pos) => { lineObjs[pos].position.z = LANE[pos] * sep; lineMats[pos].opacity = draw; lineObjs[pos].geometry.setDrawRange(0, Math.ceil(draw * lineObjs[pos].geometry.attributes.position.count)); });
      gridMat.opacity = 0.35 + 0.55 * rise;
      world.updateMatrixWorld(true);

      // labels that sit in the scene: axis ticks, position names, value picks
      [6, 8, 10, 12, 14].forEach((m) => m <= maxPrice && place(`x${m}`, X(m), -0.35, 3.6 * turn, rise));
      [2, 4, 6].forEach((n) => n <= maxPred && place(`y${n}`, -5.5, Y(n), -3.6, rise));
      POS.forEach((pos) => place(`l${pos}`, 5.5, 0.15, LANE[pos] * sep, sep));
      picks.forEach((pl) => place(`p${pl.id}`, X(pl.price), Y(pl.pred) + 0.32, LANE[pl.pos] * sep, draw));

      hovered = mouse && !drag && rise > 0.9 ? pickAt(mouse[0], mouse[1]) : null;
      el.style.cursor = hovered ? "pointer" : drag ? "grabbing" : turn > 0.5 ? "grab" : "default";
      setTip((t) => (hovered ? (t && t.p === hovered ? t : { p: hovered, x: mouse[0], y: mouse[1] }) : t ? null : t));
      const st = p < 0.32 ? 0 : p < 0.68 ? 1 : 2;
      setStep((x) => (x === st ? x : st));

      const vb = el.getBoundingClientRect();
      if (!document.hidden && vb.bottom > 0 && vb.top < innerHeight) composer.render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointerleave", leave); renderer.dispose(); el.innerHTML = "";
    };
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps

  const { picks, ps, maxPrice, maxPred } = model;
  const steps = [
    ["Every player, priced and predicted.", `${ps.length} players with a prediction for gameweek ${data.meta.gw}. Price runs along the bottom, predicted points up the side.`],
    ["Split by position.", "Keepers, defenders, midfielders and forwards each get their own lane, because a squad needs a fixed number of each and they're only ever traded like for like."],
    ["The value line.", `Each line is the most points that money can buy in that position. Players on it are the cheapest way to that level: ${picks.map((p) => `${p.name} (£${p.price.toFixed(1)}m, ${p.pred.toFixed(1)})`).join(", ")}.`],
  ];
  const reg = (k) => (e) => (labels.current[k] = e);
  return (
    <section ref={wrap} id="market" className="relative h-[330vh]" data-tint="70 120 255" data-tint2="56 225 168" data-tx="70%" data-glow="0.25">
      <div className="sticky top-0 h-screen overflow-hidden">
        <div ref={mount} className="absolute inset-0 touch-pan-y" role="img"
          aria-label={`Every player's predicted points against price, split by position, with each position's value line. Value picks: ${picks.map((p) => p.name).join(", ")}.`} />
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {[6, 8, 10, 12, 14].filter((m) => m <= maxPrice).map((m) => <span key={m} ref={reg(`x${m}`)} className="absolute left-0 top-0 -translate-x-1/2 font-mono text-[11px] text-text3" style={{ opacity: 0 }}>£{m}m</span>)}
          {[2, 4, 6].filter((n) => n <= maxPred).map((n) => <span key={n} ref={reg(`y${n}`)} className="absolute left-0 top-0 -translate-x-full -translate-y-1/2 pr-1 font-mono text-[11px] text-text3" style={{ opacity: 0 }}>{n} pts</span>)}
          {POS.map((pos) => <span key={pos} ref={reg(`l${pos}`)} className="absolute left-0 top-0 -translate-y-1/2 pl-2 text-[13px]" style={{ opacity: 0, color: HEX[pos] }}>{NAME[pos]}</span>)}
          {picks.map((pl) => (
            <span key={pl.id} ref={reg(`p${pl.id}`)} className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[3px] border border-line2 bg-bg/85 px-2 py-0.5 text-[12px] backdrop-blur" style={{ opacity: 0 }}>
              {pl.name} <span className="text-text3">£{pl.price.toFixed(1)}m</span>
            </span>
          ))}
        </div>
        <div className="page pointer-events-none relative z-10 pt-28">
          <div className="max-w-[440px]">
            <div className="flex gap-1.5" aria-hidden>{steps.map((_, i) => <i key={i} className={`h-[3px] w-8 rounded-full transition-colors duration-500 ${i <= step ? "bg-text" : "bg-line2"}`} />)}</div>
            <h2 key={step} className="mt-5 animate-[rise_.7s_cubic-bezier(.2,.7,.1,1)] font-display text-[clamp(32px,3.8vw,58px)] font-medium leading-[1.02] tracking-[-0.035em]">{steps[step][0]}</h2>
            <p key={`b${step}`} className="mt-4 animate-[rise_.9s_cubic-bezier(.2,.7,.1,1)] text-[15px] leading-relaxed text-text2">{steps[step][1]}</p>
          </div>
        </div>
        <span ref={anchor} data-pop className="pointer-events-none absolute h-0 w-0" />
        {tip && (
          <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-[3px] border border-line2 bg-bg/90 px-3 py-1.5 text-[12.5px] backdrop-blur"
            style={{ left: tip.x, top: tip.y }}>
            {tip.p.name} <span className="text-text3">{tip.p.short}, £{tip.p.price.toFixed(1)}m</span> <span style={{ color: HEX[tip.p.pos] }}>{tip.p.pred.toFixed(1)} pts</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-7 px-4 text-center text-[12px] text-text3">{step ? "Drag to turn. Hover a dot for the player, click for details." : "Keep scrolling"}</div>
      </div>
    </section>
  );
}
