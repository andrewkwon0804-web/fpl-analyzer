// The next few gameweeks' fixtures as a skyline: one row of towers per team, one tower per
// game, taller and brighter for easier games (FPL's difficulty rating, 1 easiest to 5 hardest).
// Teams are sorted so the easiest run is at the front.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { reduced, useInView } from "../lib/motion.js";

const FDR_HEX = { 1: "#2fd18a", 2: "#1f9a66", 3: "#4a515b", 4: "#b04a57", 5: "#e0566a" };
const HEIGHT = { 1: 2.4, 2: 1.8, 3: 1.05, 4: 0.55, 5: 0.3 };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export default function FixtureSkyline({ data }) {
  const mount = useRef(null), labels = useRef({});
  const [tip, setTip] = useState(null);
  const [vref, seen] = useInView(0.9);
  const gws = data.planGws;
  const teams = useMemo(() => {
    const rows = Object.keys(data.fixtures).map((t) => {
      const games = gws.flatMap((g) => (data.fixtures[t][g] || []).map((f) => ({ ...f, gw: g })));
      const avg = games.length ? games.reduce((s, f) => s + f.fdr, 0) / games.length : 5;
      return { team: t, games, avg, score: games.reduce((s, f) => s + (6 - f.fdr), 0) };
    });
    return rows.sort((a, b) => b.score - a.score);
  }, [data, gws]);
  const seenRef = useRef(false); seenRef.current = seen;

  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-6, 10, 8); scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const city = new THREE.Group(); scene.add(city);

    const COLS = gws.length, ROWS = teams.length, cw = 1.25, rd = 0.62;
    const x0 = -((COLS - 1) * cw) / 2, z0 = -((ROWS - 1) * rd) / 2;
    // ground plate
    const plate = new THREE.Mesh(new RoundedBoxGeometry(COLS * cw + 0.6, 0.08, ROWS * rd + 0.6, 4, 0.04),
      new THREE.MeshPhysicalMaterial({ color: 0x0d1013, metalness: 0.6, roughness: 0.5 }));
    plate.position.y = -0.04; city.add(plate);
    const geo = new RoundedBoxGeometry(0.9, 1, 0.42, 3, 0.05);
    const towers = [];
    teams.forEach((t, r) => {
      gws.forEach((g, c) => {
        const games = t.games.filter((f) => f.gw === g);
        games.forEach((f, k) => {
          const col = new THREE.Color(FDR_HEX[f.fdr]);
          const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: f.fdr <= 2 ? 0.35 : 0.12, metalness: 0.2, roughness: 0.35, clearcoat: 0.6 }));
          // a double gameweek: two thinner towers side by side
          const w = games.length > 1 ? 0.5 : 1;
          m.scale.x = w; m.position.set(x0 + c * cw + (games.length > 1 ? (k - 0.5) * 0.47 : 0), 0, z0 + (ROWS - 1 - r) * rd);
          m.userData = { t: t.team, f, h: HEIGHT[f.fdr], delay: r * 0.025 + c * 0.05 };
          city.add(m); towers.push(m);
        });
      });
    });

    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let mouse = null, hovered = null, drag = null, yaw = 0, vel = 0;
    const local = (e) => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const move = (e) => { mouse = local(e); if (drag) { const dx = e.clientX - drag; drag = e.clientX; vel = dx * 0.005; yaw += vel; } };
    const down = (e) => { drag = e.clientX; };
    const up = () => { drag = null; };
    const leave = () => { mouse = null; };
    el.addEventListener("pointermove", move); el.addEventListener("pointerdown", down); addEventListener("pointerup", up); el.addEventListener("pointerleave", leave);
    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size(); addEventListener("resize", size);

    const proj = new THREE.Vector3();
    const place = (k, v, show) => {
      const n = labels.current[k]; if (!n) return;
      proj.copy(v).applyMatrix4(city.matrixWorld).project(camera);
      n.style.transform = `translate(${(proj.x * 0.5 + 0.5) * el.clientWidth}px, ${(-proj.y * 0.5 + 0.5) * el.clientHeight}px)`;
      n.style.opacity = String(show);
    };
    let raf = 0, t = 0, grow = reduced ? 1 : 0, last = 0;
    const frame = (now) => {
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; t += dt;
      if (seenRef.current) grow = Math.min(1, grow + dt * 0.55);
      if (!drag) { yaw += vel; vel *= 0.94; }
      city.rotation.y = (reduced ? 0 : Math.sin(t * 0.15) * 0.08) + yaw;
      const narrow = el.clientWidth < 700, d = narrow ? 40 : 21;
      camera.position.set(-d * 0.5, d * 0.58, d * 0.72); camera.lookAt(0.4, 0.2, -0.4);
      towers.forEach((m) => {
        const k = 1 - Math.pow(1 - clamp((grow - m.userData.delay) * 1.6), 3);
        const h = Math.max(0.02, m.userData.h * k) * (hovered === m ? 1.08 : 1);
        m.scale.y = h; m.position.y = h / 2;
        m.material.emissiveIntensity = THREE.MathUtils.lerp(m.material.emissiveIntensity, hovered === m ? 0.9 : m.userData.f.fdr <= 2 ? 0.35 : 0.12, 0.15);
      });
      city.updateMatrixWorld(true);
      teams.forEach((tm, r) => place(`t${tm.team}`, new THREE.Vector3(x0 - cw * 0.75, 0, z0 + (ROWS - 1 - r) * rd), clamp(grow * 2 - r * 0.04)));
      gws.forEach((g, c) => place(`g${g}`, new THREE.Vector3(x0 + c * cw, 0, z0 + ROWS * rd + 0.1), grow));
      if (mouse && !drag) {
        ptr.set((mouse[0] / el.clientWidth) * 2 - 1, -(mouse[1] / el.clientHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
        hovered = ray.intersectObjects(towers, false)[0]?.object || null;
      } else hovered = null;
      el.style.cursor = drag ? "grabbing" : hovered ? "default" : "grab";
      setTip((v) => (hovered ? (v && v.m === hovered ? v : { m: hovered, x: mouse[0], y: mouse[1] }) : v ? null : v));
      const vb = el.getBoundingClientRect();
      if (!document.hidden && vb.bottom > 0 && vb.top < innerHeight) renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointerup", up);
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerdown", down); el.removeEventListener("pointerleave", leave);
      renderer.dispose(); el.innerHTML = "";
    };
  }, [teams, gws]);

  const best = teams.slice(0, 3).map((t) => t.team), worst = teams.slice(-2).map((t) => t.team);
  return (
    <section id="fixtures" ref={vref} className="page relative grid items-center gap-6 py-28 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:py-36" data-tint="56 225 168" data-tint2="70 120 255" data-tx="70%">
      <div>
        <h2 className="font-display text-[clamp(36px,5vw,76px)] font-medium leading-[1.02] tracking-[-0.04em]">The next {gws.length} gameweeks, as a skyline.</h2>
        <p className="mt-6 max-w-[46ch] text-[16px] leading-relaxed text-text2">
          Each tower is a game. Taller and greener means easier, by FPL's difficulty rating. Teams are sorted so the easiest run is at the front: {best.join(", ")}. {worst.join(" and ")} have the hardest. Drag to turn it.
        </p>
      </div>
      <div className="relative h-[min(78vh,680px)] min-h-[420px] overflow-hidden">
        <div ref={mount} className="absolute inset-0 touch-pan-y" role="img" aria-label={`Fixture difficulty for every team over gameweeks ${gws[0]} to ${gws.at(-1)}. Easiest runs: ${best.join(", ")}.`} />
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {teams.map((t) => <span key={t.team} ref={(e) => (labels.current[`t${t.team}`] = e)} className="absolute left-0 top-0 -translate-x-full -translate-y-1/2 pr-1 font-mono text-[10.5px] text-text3" style={{ opacity: 0 }}>{t.team}</span>)}
          {gws.map((g) => <span key={g} ref={(e) => (labels.current[`g${g}`] = e)} className="absolute left-0 top-0 -translate-x-1/2 pt-2 font-mono text-[11px] text-text2" style={{ opacity: 0 }}>GW{g}</span>)}
        </div>
        {tip && (
          <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-[3px] border border-line2 bg-bg/90 px-3 py-1.5 text-[12.5px] backdrop-blur" style={{ left: tip.x, top: tip.y }}>
            GW{tip.m.userData.f.gw}: {tip.m.userData.t} v {tip.m.userData.f.opp} ({tip.m.userData.f.home ? "home" : "away"}), difficulty {tip.m.userData.f.fdr}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text3">
          {[1, 2, 3, 4, 5].map((f) => <span key={f} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: FDR_HEX[f] }} />{f === 1 ? "1, easiest" : f === 5 ? "5, hardest" : f}</span>)}
        </div>
      </div>
    </section>
  );
}
