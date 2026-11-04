// One of the model's trees, drawn in 3D, with real 2025-26 player-weeks falling through it.
// Each player follows the same "feature <= threshold" tests the model uses (tree.json comes
// straight from the fitted scikit-learn model), and lands in the leaf that sets this tree's
// nudge to his prediction.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { reduced } from "../../lib/motion.js";
import { FEATURE_NAMES } from "./figures.jsx";

const POS_HEX = { GK: "#F5C451", DEF: "#6F95FF", MID: "#38E1A8", FWD: "#FF7A8A" };
const SHORT = { minutes_l3: "Minutes, last 3", minutes_l5: "Minutes, last 5", points_std: "Points a game", ict_l5: "ICT, last 5", n_fixtures: "Games this week", fixture_difficulty: "Difficulty", price: "Price", points_l3: "Points, last 3", points_l5: "Points, last 5" };
const short = (f) => SHORT[f] || FEATURE_NAMES[f] || f;
const fmtT = (f, t) => (f === "price" ? `£${t.toFixed(1)}m` : f.startsWith("minutes") ? `${t.toFixed(0)} min` : t.toFixed(2));

// the leaf a player reaches, and the nodes on the way
function route(nodes, x) {
  const path = [0];
  let n = nodes[0];
  while (!n.leaf) {
    const v = x[n.feature];
    const left = v === null || v === undefined ? n.missing_left : v <= n.threshold;
    n = nodes[left ? n.left : n.right]; path.push(n.id);
  }
  return path;
}

export default function ModelTree() {
  const [T, setT] = useState(null);
  const mount = useRef(null), labels = useRef({});
  const [tip, setTip] = useState(null);
  const [feed, setFeed] = useState([]);
  useEffect(() => {
    fetch(import.meta.env.DEV ? "/data/tree.json" : "./data/tree.json").then((r) => r.json()).then(setT).catch(() => {});
  }, []);

  // layout: leaves spread left to right in order, parents centred over their children
  const layout = useMemo(() => {
    if (!T) return null;
    const N = T.nodes, pos = {}, leaves = [];
    const walk = (id) => { const n = N[id]; if (n.leaf) { leaves.push(id); return; } walk(n.left); walk(n.right); };
    walk(0);
    const maxD = Math.max(...N.map((n) => n.depth));
    leaves.forEach((id, i) => { pos[id] = [(i / (leaves.length - 1) - 0.5) * 10.5, 0]; });
    const place = (id) => { const n = N[id]; if (n.leaf) return pos[id][0]; const x = (place(n.left) + place(n.right)) / 2; pos[id] = [x, 0]; return x; };
    place(0);
    Object.keys(pos).forEach((id) => { const n = N[id]; pos[id] = [pos[id][0], (maxD / 2 - (n.leaf ? maxD : n.depth)) * 1.0, n.leaf ? 0 : Math.sin(n.depth * 1.3) * 0.4]; });
    const vals = leaves.map((id) => N[id].value), vmax = Math.max(...vals.map(Math.abs));
    const paths = T.sample.map((s) => route(N, s.x));
    return { pos, leaves, vmax, paths };
  }, [T]);

  useEffect(() => {
    if (!T || !layout) return;
    const el = mount.current, N = T.nodes, { pos, leaves, vmax, paths } = layout;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100), world = new THREE.Group(); scene.add(world);
    const V = (id) => new THREE.Vector3(...pos[id]);

    // branches: soft curves from each node to its children
    const curves = {};
    const branchMat = new THREE.LineBasicMaterial({ color: 0x3a434d, transparent: true, opacity: 0.9 });
    N.filter((n) => !n.leaf).forEach((n) => [n.left, n.right].forEach((c) => {
      const a = V(n.id), b = V(c), mid = new THREE.Vector3(b.x, (a.y + b.y) / 2 + 0.25, (a.z + b.z) / 2);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b); curves[`${n.id}-${c}`] = curve;
      world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), branchMat));
    }));
    // nodes: splits are small white beads, leaves glow mint (adds points) or rose (takes away)
    const nodeMeshes = {};
    N.forEach((n) => {
      const r = n.leaf ? 0.09 + 0.16 * Math.sqrt(n.count / N[0].count) : 0.05 + 0.08 * Math.sqrt(n.count / N[0].count);
      const col = n.leaf ? new THREE.Color(n.value >= 0 ? "#38E1A8" : "#FF7A8A").multiplyScalar(0.4 + 1.2 * Math.abs(n.value) / vmax) : new THREE.Color(0x8d96a1);
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
      m.position.copy(V(n.id)); m.userData = { node: n, base: col.clone() }; world.add(m); nodeMeshes[n.id] = m;
    });
    const hits = Object.values(nodeMeshes);

    // players in flight
    const MAX = 70, geo = new THREE.SphereGeometry(0.045, 10, 10);
    const dots = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), MAX); world.add(dots);
    const flying = [], landed = Object.fromEntries(leaves.map((l) => [l, 0]));
    let next = 0, spawnT = 0;
    const col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), hidden = new THREE.Vector3(0, -99, 0);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.4, 0.25); composer.addPass(bloom); composer.addPass(new OutputPass());
    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size(); addEventListener("resize", size);

    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let mouse = null, hovered = null, drag = null, yaw = 0, vel = 0;
    const local = (e) => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const move = (e) => { mouse = local(e); if (drag !== null) { const dx = e.clientX - drag; drag = e.clientX; vel = dx * 0.004; yaw += vel; } };
    const down = (e) => { drag = e.clientX; }, up = () => { drag = null; }, leave = () => { mouse = null; };
    el.addEventListener("pointermove", move); el.addEventListener("pointerdown", down); addEventListener("pointerup", up); el.addEventListener("pointerleave", leave);

    const proj = new THREE.Vector3();
    let raf = 0, last = 0, t = 0;
    const frame = (now) => {
      const dt = Math.min(0.25, (now - (last || now)) / 1000); last = now; t += dt;
      const vb = el.getBoundingClientRect(), onScreen = vb.bottom > 0 && vb.top < innerHeight && !document.hidden;
      const narrow = el.clientWidth < 700;
      if (drag === null) { yaw += vel; vel *= 0.94; }
      world.rotation.y = (reduced ? 0 : Math.sin(t * 0.2) * 0.12) + yaw;
      camera.position.set(0, 0.4, narrow ? 27 : 19); camera.lookAt(0, -0.3, 0);

      // a new player every 0.35 s; each takes 0.45 s per branch
      if (onScreen) {
        spawnT += dt;
        if (spawnT > 0.35 && flying.length < MAX) {
          spawnT = 0; const k = next++ % T.sample.length;
          flying.push({ k, path: paths[k], step: 0, f: 0 });
        }
      }
      let arrivals = [];
      for (let i = flying.length - 1; i >= 0; i--) {
        const p = flying[i]; p.f += dt / 0.45;
        if (p.f >= 1) { p.f = 0; p.step++; if (p.step >= p.path.length - 1) { flying.splice(i, 1); landed[p.path.at(-1)]++; arrivals.push(p); } }
      }
      for (let i = 0; i < MAX; i++) {
        const p = flying[i];
        if (!p) { m4.compose(hidden, q, sc); dots.setMatrixAt(i, m4); continue; }
        const a = p.path[p.step], b = p.path[p.step + 1];
        const pt = curves[`${a}-${b}`].getPoint(p.f);
        m4.compose(pt, q, sc); dots.setMatrixAt(i, m4);
        col.set(POS_HEX[T.sample[p.k].pos]).multiplyScalar(1.6); dots.setColorAt(i, col);
      }
      dots.instanceMatrix.needsUpdate = true; if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
      if (arrivals.length) {
        arrivals.forEach((p) => { nodeMeshes[p.path.at(-1)].userData.pulse = 1; });
        setFeed((f) => [...arrivals.map((p) => ({ ...T.sample[p.k], leaf: p.path.at(-1), key: `${p.k}-${t}` })), ...f].slice(0, 5));
      }
      Object.values(nodeMeshes).forEach((m) => {
        const pu = m.userData.pulse || 0; m.userData.pulse = pu * 0.9;
        m.scale.setScalar(1 + pu * 0.6 + (hovered === m ? 0.4 : 0));
      });
      world.updateMatrixWorld(true);

      // split labels under each split node, value labels under each leaf
      N.forEach((n) => {
        const lab = labels.current[n.id]; if (!lab) return;
        proj.copy(V(n.id)).applyMatrix4(world.matrixWorld).project(camera);
        lab.style.transform = `translate(${(proj.x * 0.5 + 0.5) * el.clientWidth}px, ${(-proj.y * 0.5 + 0.5) * el.clientHeight}px)`;
        if (n.leaf) lab.firstChild.textContent = String(landed[n.id]);
      });
      if (mouse && drag === null) {
        ptr.set((mouse[0] / el.clientWidth) * 2 - 1, -(mouse[1] / el.clientHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
        hovered = ray.intersectObjects(hits, false)[0]?.object || null;
      } else hovered = null;
      el.style.cursor = drag !== null ? "grabbing" : hovered ? "default" : "grab";
      setTip((v) => (hovered ? (v && v.n === hovered.userData.node ? v : { n: hovered.userData.node, x: mouse[0], y: mouse[1] }) : v ? null : v));
      if (onScreen) composer.render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointerup", up);
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerdown", down); el.removeEventListener("pointerleave", leave);
      renderer.dispose(); el.innerHTML = "";
    };
  }, [T, layout]);

  if (!T) return <div className="skel h-[620px] rounded-[6px]" />;
  const N = T.nodes, top = N[0];
  // split labels sit to the outside of their branch so neighbours don't collide
  const side = {}; N.forEach((n) => { if (!n.leaf) { side[n.left] = "l"; side[n.right] = "r"; } });
  const tipText = (n) => n.leaf
    ? `This leaf ${n.value >= 0 ? "adds" : "takes away"} ${Math.abs(n.value).toFixed(3)} points. ${n.count.toLocaleString()} training rows ended here.`
    : `${short(n.feature)} at most ${fmtT(n.feature, n.threshold)}? Yes goes left, no goes right. ${n.count.toLocaleString()} training rows reached this split.`;
  return (
    <div className="corners overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative h-[620px] overflow-hidden max-sm:h-[520px]">
          <div ref={mount} className="absolute inset-0 touch-pan-y" role="img" aria-label={`Decision tree ${T.index + 1} of ${T.trees}: the first split is ${short(top.feature)} at ${fmtT(top.feature, top.threshold)}.`} />
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {N.map((n) => (
              <span key={n.id} ref={(e) => (labels.current[n.id] = e)} className={`absolute left-0 top-0 whitespace-nowrap font-mono ${n.leaf ? "-translate-x-1/2 pt-4 text-[10px] text-text3 max-md:hidden" : `${side[n.id] === "l" ? "-translate-x-full -translate-y-1/2 pr-3" : side[n.id] === "r" ? "-translate-y-1/2 pl-3" : "-translate-x-1/2 -translate-y-[calc(100%+10px)]"} text-[10px] text-text2 max-md:hidden`}`}>
                {n.leaf ? <><b className="block text-center font-normal text-text">0</b><span className={n.value >= 0 ? "text-mint" : "text-rose"}>{n.value >= 0 ? "+" : ""}{n.value.toFixed(2)}</span></> : <span>{short(n.feature)} ≤ {fmtT(n.feature, n.threshold)}</span>}
              </span>
            ))}
          </div>
          {tip && (
            <div className="pointer-events-none absolute z-20 max-w-[280px] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-[3px] border border-line2 bg-bg/90 px-3 py-2 text-[12.5px] leading-snug backdrop-blur" style={{ left: tip.x, top: tip.y }}>{tipText(tip.n)}</div>
          )}
          <div className="absolute bottom-3 left-4 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text3">
            {Object.entries(POS_HEX).map(([p, c]) => <span key={p} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{p}</span>)}
            <span>Leaf numbers count the players that landed there.</span>
          </div>
        </div>
        <aside className="border-t border-line p-4 lg:border-l lg:border-t-0">
          <div className="text-[12px] text-text3">Just landed</div>
          <ol className="mt-3 grid gap-2.5">
            {feed.map((f) => {
              const leaf = N[f.leaf];
              return (
                <li key={f.key} className="animate-[rise_.6s_cubic-bezier(.2,.7,.1,1)] rounded-[4px] border border-line bg-surface/60 p-3 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-text"><i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: POS_HEX[f.pos] }} />{f.name}</span><span className="font-mono text-[11px] text-text3">GW{f.gw}</span></div>
                  <div className="mt-1.5 text-text2">This tree: <span className={leaf.value >= 0 ? "text-mint" : "text-rose"}>{leaf.value >= 0 ? "+" : ""}{leaf.value.toFixed(3)}</span></div>
                  <div className="text-text3">All {T.trees} trees: {f.pred.toFixed(1)}, scored {f.actual}</div>
                </li>
              );
            })}
            {!feed.length && <li className="text-[12.5px] text-text3">Players appear here as they reach a leaf.</li>}
          </ol>
        </aside>
      </div>
    </div>
  );
}
