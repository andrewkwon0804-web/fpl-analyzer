// The league as a match ball. A classic ball has 20 hexagons and 12 pentagons, and the
// Premier League has 20 clubs: each hexagon is a club, raised by how many points its best
// eleven players are predicted to score this gameweek and coloured by how hard its next
// game is. The pentagons stay black. It flies together on load; drag to spin it, hover a
// panel for the club, click for its top player.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { reduced } from "../lib/motion.js";
import { usePop } from "./Popover.jsx";

const FDR_HEX = { 1: "#2fd18a", 2: "#1f9a66", 3: "#59616c", 4: "#b04a57", 5: "#e0566a" };
const PHI = (1 + Math.sqrt(5)) / 2;

// truncated icosahedron: pentagons around the 12 icosahedron vertices, hexagons on its 20 faces
function ballFaces() {
  const v = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]]
    .map((p) => new THREE.Vector3(...p));
  const near = (a, b) => Math.abs(a.distanceTo(b) - 2) < 1e-6;
  const cut = (a, b, t) => a.clone().lerp(b, t).normalize();
  const faces = [];
  v.forEach((a) => {
    const ring = v.filter((b) => b !== a && near(a, b)).map((b) => cut(a, b, 1 / 3));
    faces.push({ kind: "pent", center: a.clone().normalize(), ring });
  });
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
    const [a, b, c] = [v[i], v[j], v[k]];
    if (!(near(a, b) && near(b, c) && near(a, c))) continue;
    const ring = [cut(a, b, 1 / 3), cut(a, b, 2 / 3), cut(b, c, 1 / 3), cut(b, c, 2 / 3), cut(c, a, 1 / 3), cut(c, a, 2 / 3)];
    faces.push({ kind: "hex", center: a.clone().add(b).add(c).normalize(), ring });
  }
  // order each ring around its centre
  faces.forEach((f) => {
    const n = f.center, t = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize(), u = new THREE.Vector3().crossVectors(n, t);
    f.basis = [t, u];
    f.ring.sort((p, q) => Math.atan2(p.dot(u), p.dot(t)) - Math.atan2(q.dot(u), q.dot(t)));
  });
  return faces;
}

// one panel: a cap at radius 1 + h with the corners pulled in a little for the seams, and walls down to the ball
function panelGeometry(f, h) {
  const inset = 0.9, pos = [], uv = [];
  const corners = f.ring.map((p) => f.center.clone().lerp(p, inset).normalize());
  const top = corners.map((p) => p.clone().multiplyScalar(1 + h)), base = corners.map((p) => p.clone().multiplyScalar(0.98));
  const c = f.center.clone().multiplyScalar(1 + h + 0.004);
  const [t, u] = f.basis, R = f.ring[0].clone().sub(f.center).length();
  const uvOf = (p) => { const d = p.clone().normalize().sub(f.center); return [0.5 - d.dot(t) / (2 * R), 0.5 - d.dot(u) / (2 * R)]; };
  for (let i = 0; i < top.length; i++) {
    const a = top[i], b = top[(i + 1) % top.length];
    pos.push(...c.toArray(), ...a.toArray(), ...b.toArray()); uv.push(...uvOf(c), ...uvOf(a), ...uvOf(b));
    const a0 = base[i], b0 = base[(i + 1) % top.length];
    pos.push(...a0.toArray(), ...b0.toArray(), ...b.toArray(), ...a0.toArray(), ...b.toArray(), ...a.toArray());
    uv.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function labelTexture(text, color) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = color; x.fillRect(0, 0, 256, 256);
  x.fillStyle = "rgba(255,255,255,.92)"; x.font = '600 64px "Geist Sans", sans-serif'; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, 128, 132);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
}

export default function LeagueBall({ data }) {
  const mount = useRef(null), anchor = useRef(null);
  const [tip, setTip] = useState(null);
  const { open } = usePop();
  const clubs = useMemo(() => {
    const gw = data.meta.gw;
    const by = {};
    data.players.forEach((p) => { (by[p.short] ||= []).push(p); });
    const rows = Object.entries(by).map(([short, ps]) => {
      const best = [...ps].sort((a, b) => b.pred - a.pred);
      const fx = (data.fixtures[short] || {})[gw] || [];
      return { short, team: ps[0].team, xi: best.slice(0, 11).reduce((s, p) => s + p.pred, 0), top: best[0], fx,
        fdr: fx.length ? Math.round(fx.reduce((s, f) => s + f.fdr, 0) / fx.length) : 3 };
    }).sort((a, b) => b.xi - a.xi).slice(0, 20);
    const lo = Math.min(...rows.map((r) => r.xi)), hi = Math.max(...rows.map((r) => r.xi));
    rows.forEach((r) => { r.k = (r.xi - lo) / Math.max(1e-6, hi - lo); });
    return rows;
  }, [data]);

  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.7;
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 4, 5); scene.add(key);
    const rim = new THREE.PointLight(0x38e1a8, 18, 12); rim.position.set(3, -1, -3); scene.add(rim);
    const rim2 = new THREE.PointLight(0x4678ff, 14, 12); rim2.position.set(-3, -2, -2); scene.add(rim2);
    const ball = new THREE.Group(); scene.add(ball);
    // the core shows through the seams
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.985, 64, 64), new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.6, metalness: 0.2 })));

    const faces = ballFaces();
    const hexes = faces.filter((f) => f.kind === "hex"), pents = faces.filter((f) => f.kind === "pent");
    // put the biggest clubs on the side that faces the camera first
    hexes.sort((a, b) => b.center.z - a.center.z);
    const panels = [];
    pents.forEach((f) => {
      const m = new THREE.Mesh(panelGeometry(f, 0.03), new THREE.MeshPhysicalMaterial({ color: 0x0c0e11, roughness: 0.35, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.2 }));
      m.userData = { f, h: 0.03 }; ball.add(m); panels.push(m);
    });
    const hexMeshes = [];
    hexes.forEach((f, i) => {
      const club = clubs[i]; if (!club) return;
      const h = 0.04 + club.k * 0.2;
      const tex = labelTexture(club.short, FDR_HEX[club.fdr]);
      const m = new THREE.Mesh(panelGeometry(f, h), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.15, emissive: new THREE.Color(FDR_HEX[club.fdr]), emissiveIntensity: 0.06 }));
      m.userData = { f, h, club }; ball.add(m); panels.push(m); hexMeshes.push(m);
    });

    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size(); addEventListener("resize", size);
    camera.position.set(0, 0, 8.6); camera.lookAt(0, 0, 0);

    // spin: drag to throw it, it keeps turning and slows to an idle drift
    const spin = new THREE.Vector2(0.18, 0.05), ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let drag = null, mouse = null, hovered = null, moved = 0;
    const local = (e) => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const down = (e) => { drag = [e.clientX, e.clientY]; moved = 0; el.setPointerCapture?.(e.pointerId); };
    const move = (e) => {
      mouse = local(e);
      if (drag) { const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy); spin.set(dx * 0.6, dy * 0.6); }
    };
    const pick = () => {
      if (!mouse) return null;
      ptr.set((mouse[0] / el.clientWidth) * 2 - 1, -(mouse[1] / el.clientHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
      const h = ray.intersectObjects(panels, false)[0];
      return h && h.object.userData.club ? h.object : null;
    };
    const up = () => {
      if (drag && moved < 5) {
        const m = pick();
        if (m) { const a = anchor.current; a.style.left = `${mouse[0]}px`; a.style.top = `${mouse[1]}px`; open(m.userData.club.top, a, `${m.userData.club.team}'s top pick this gameweek.`); }
      }
      drag = null;
    };
    const leave = () => { mouse = null; };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointerleave", leave);

    const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
    let raf = 0, last = 0, born = 0;
    const frame = (now) => {
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; born += dt;
      // assembly: panels start far out and settle onto the ball, a few at a time
      panels.forEach((m, i) => {
        const k = reduced ? 1 : Math.min(1, Math.max(0, (born - 0.15 - (i % 16) * 0.05) / 1.1));
        const e = 1 - Math.pow(1 - k, 4);
        const lift = hovered === m ? 0.14 : 0;
        m.userData.lift = THREE.MathUtils.lerp(m.userData.lift || 0, lift, 0.15);
        m.position.copy(m.userData.f.center).multiplyScalar((1 - e) * 3.2 + m.userData.lift);
        m.scale.setScalar(0.4 + 0.6 * e);
      });
      if (!drag) spin.lerp(new THREE.Vector2(reduced ? 0 : 0.16, 0.03), 1 - Math.exp(-dt * 1.2));
      qy.setFromAxisAngle(Y, spin.x * dt); qx.setFromAxisAngle(X, spin.y * dt);
      ball.quaternion.premultiply(qy).premultiply(qx);
      hovered = drag ? null : pick();
      el.style.cursor = drag ? "grabbing" : hovered ? "pointer" : "grab";
      setTip((v) => (hovered ? (v && v.c === hovered.userData.club ? v : { c: hovered.userData.club, x: mouse[0], y: mouse[1] }) : v ? null : v));
      const vb = el.getBoundingClientRect();
      if (!document.hidden && vb.bottom > 0 && vb.top < innerHeight) renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    document.fonts.ready.then(() => {
      hexMeshes.forEach((m) => { const c = m.userData.club; m.material.map = labelTexture(c.short, FDR_HEX[c.fdr]); m.material.needsUpdate = true; });
      raf = requestAnimationFrame(frame);
    });
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", size);
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointerleave", leave);
      renderer.dispose(); el.innerHTML = "";
    };
  }, [clubs]); // eslint-disable-line react-hooks/exhaustive-deps

  const leader = clubs[0];
  return (
    <div className="relative h-full w-full">
      <div ref={mount} className="absolute inset-0 touch-none" role="img"
        aria-label={`A football made of the 20 clubs. ${leader.team} sit highest, with ${leader.xi.toFixed(1)} predicted points from their best eleven.`} />
      <span ref={anchor} data-pop className="pointer-events-none absolute h-0 w-0" />
      {tip && (
        <div className="pointer-events-none absolute z-20 w-max max-w-[260px] -translate-x-1/2 -translate-y-[calc(100%+16px)] rounded-[4px] border border-line2 bg-bg/90 px-3 py-2 text-[12.5px] leading-snug backdrop-blur" style={{ left: tip.x, top: tip.y }}>
          <div className="text-text">{tip.c.team}</div>
          <div className="text-text2">{tip.c.xi.toFixed(1)} predicted points from its best eleven</div>
          <div className="text-text3">{tip.c.fx.length ? `Next: ${tip.c.fx.map((f) => `${f.opp} (${f.home ? "home" : "away"})`).join(", ")}, difficulty ${tip.c.fdr}` : "No game this gameweek"}</div>
          <div className="mt-1 text-text3">Top pick: <span className="text-mint">{tip.c.top.name} {tip.c.top.pred.toFixed(1)}</span>. Click for more.</div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11.5px] text-text3">
        <span>Taller panel, more predicted points</span>
        {[1, 3, 5].map((f) => <span key={f} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: FDR_HEX[f] }} />{f === 1 ? "easy game" : f === 3 ? "medium" : "hard"}</span>)}
      </div>
    </div>
  );
}
