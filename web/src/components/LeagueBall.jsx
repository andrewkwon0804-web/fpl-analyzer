// The league as a match ball, and then as a ranking.
//
// A classic ball has 20 hexagons and 12 pentagons; the Premier League has 20 clubs. Each
// hexagon is a club, raised by how many points its best eleven players are predicted to score
// this gameweek, with a ring in the colour of its next fixture (green easy, red hard). The
// pentagons are plain black leather.
//
// Scrolling through the hero breaks the ball apart: the pentagons fall away and the 20 club
// panels fly into a row, ranked, each on top of a bar as tall as its predicted points. The
// ball and the chart are the same 20 objects.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { reduced } from "../lib/motion.js";
import { usePop } from "./Popover.jsx";

const FDR_HEX = { 1: "#2fd18a", 2: "#25a872", 3: "#8b939e", 4: "#c4505e", 5: "#e8566a" };
const FDR_WORD = { 1: "very easy", 2: "easy", 3: "medium", 4: "hard", 5: "very hard" };
const PHI = (1 + Math.sqrt(5)) / 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const span = (p, a, b) => smooth((p - a) / (b - a));

// truncated icosahedron: pentagons around the 12 icosahedron vertices, hexagons on its 20 faces
function ballFaces() {
  const v = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]]
    .map((p) => new THREE.Vector3(...p));
  const near = (a, b) => Math.abs(a.distanceTo(b) - 2) < 1e-6;
  const cut = (a, b, t) => a.clone().lerp(b, t).normalize();
  const faces = [];
  v.forEach((a) => faces.push({ kind: "pent", center: a.clone().normalize(), ring: v.filter((b) => b !== a && near(a, b)).map((b) => cut(a, b, 1 / 3)) }));
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
    const [a, b, c] = [v[i], v[j], v[k]];
    if (near(a, b) && near(b, c) && near(a, c))
      faces.push({ kind: "hex", center: a.clone().add(b).add(c).normalize(), ring: [cut(a, b, 1 / 3), cut(a, b, 2 / 3), cut(b, c, 1 / 3), cut(b, c, 2 / 3), cut(c, a, 1 / 3), cut(c, a, 2 / 3)] });
  }
  faces.forEach((f) => {
    const n = f.center, t = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const u = new THREE.Vector3().crossVectors(n, t);
    f.basis = [t, u];
    f.ring.sort((p, q) => Math.atan2(p.dot(u), p.dot(t)) - Math.atan2(q.dot(u), q.dot(t)));
    // the rotation that turns this panel to face the camera with its label upright
    f.face = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t.clone().negate(), u.clone().negate(), n)).invert();
    f.R = f.ring[0].clone().sub(f.center).length();
  });
  return faces;
}

// a panel built around its own centre: a slightly domed cap, rounded-off seams, walls down into the ball
function panelGeometry(f, h) {
  const inset = 0.92, pos = [], uv = [];
  const corners = f.ring.map((p) => f.center.clone().lerp(p, inset).normalize());
  const [t, u] = f.basis;
  const uvOf = (p) => { const d = p.clone().normalize().sub(f.center); return [0.5 - d.dot(t) / (2.1 * f.R), 0.5 - d.dot(u) / (2.1 * f.R)]; };
  const ring = (k, r) => corners.map((p) => f.center.clone().lerp(p, k).normalize().multiplyScalar(r).sub(f.center));
  const RINGS = [[0, 1 + h + 0.012], [0.5, 1 + h + 0.009], [0.86, 1 + h], [0.97, 1 + h - 0.012], [1, 1 + h - 0.03], [1, 0.97]];
  const rings = RINGS.map(([k, r]) => ring(k, r));
  const tip = f.center.clone().multiplyScalar(1 + h + 0.012).sub(f.center);
  const P = (v) => v.clone().add(f.center);
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    pos.push(...tip.toArray(), ...rings[1][i].toArray(), ...rings[1][j].toArray());
    uv.push(...uvOf(P(tip)), ...uvOf(P(rings[1][i])), ...uvOf(P(rings[1][j])));
    for (let r = 1; r < rings.length - 1; r++) {
      const a = rings[r][i], b = rings[r][j], c = rings[r + 1][i], d = rings[r + 1][j];
      pos.push(...a.toArray(), ...c.toArray(), ...d.toArray(), ...a.toArray(), ...d.toArray(), ...b.toArray());
      uv.push(...uvOf(P(a)), ...uvOf(P(c)), ...uvOf(P(d)), ...uvOf(P(a)), ...uvOf(P(d)), ...uvOf(P(b)));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// fine leather grain as a normal map, made once
function grainNormal() {
  const S = 256, c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d"), img = x.createImageData(S, S), hgt = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) hgt[i] = Math.random();
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < S * S; i++) { const a = i % S, b = (i / S) | 0; hgt[i] = (hgt[i] + hgt[((b + 1) % S) * S + a] + hgt[b * S + (a + 1) % S]) / 3; }
  for (let i = 0; i < S * S; i++) {
    const a = i % S, b = (i / S) | 0, dx = hgt[b * S + (a + 1) % S] - hgt[i], dy = hgt[((b + 1) % S) * S + a] - hgt[i];
    img.data[i * 4] = 128 + dx * 255; img.data[i * 4 + 1] = 128 + dy * 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3); return tex;
}

// the club panel's face: ivory leather, a fixture-coloured ring, the club code pressed in
function faceTextures(f, club) {
  const S = 512, ring = f.ring.map((p) => { const d = p.clone().sub(f.center), [t, u] = f.basis; return [(0.5 - d.dot(t) / (2.1 * f.R)) * S, (1 - (0.5 - d.dot(u) / (2.1 * f.R))) * S]; });
  const draw = (bump) => {
    const c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d");
    x.fillStyle = bump ? "#fff" : "#efede7"; x.fillRect(0, 0, S, S);
    if (!bump) { const g = x.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.55); g.addColorStop(0, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(150,145,135,.25)"); x.fillStyle = g; x.fillRect(0, 0, S, S); }
    const inner = ring.map(([a, b]) => [S / 2 + (a - S / 2) * 0.8, S / 2 + (b - S / 2) * 0.8]);
    x.beginPath(); inner.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
    x.lineWidth = 14; x.lineJoin = "round"; x.strokeStyle = bump ? "#444" : FDR_HEX[club.fdr]; x.stroke();
    x.font = '600 120px "Geist Sans", sans-serif'; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = bump ? "#000" : "#1b1d21"; x.fillText(club.short, S / 2, S / 2 + 8);
    const tex = new THREE.CanvasTexture(c); if (!bump) tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
  };
  return [draw(false), draw(true)];
}

function shadowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(0,0,0,.65)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

export default function LeagueBall({ data, track, heroText }) {
  const mount = useRef(null), anchor = useRef(null), chartText = useRef(null), labels = useRef({});
  const [tip, setTip] = useState(null);
  const { open } = usePop();
  const clubs = useMemo(() => {
    const gw = data.meta.gw, by = {};
    data.players.forEach((p) => { (by[p.short] ||= []).push(p); });
    const rows = Object.entries(by).map(([short, ps]) => {
      const best = [...ps].sort((a, b) => b.pred - a.pred), fx = (data.fixtures[short] || {})[gw] || [];
      return { short, team: ps[0].team, xi: best.slice(0, 11).reduce((s, p) => s + p.pred, 0), top: best[0], fx,
        fdr: fx.length ? Math.round(fx.reduce((s, f) => s + f.fdr, 0) / fx.length) : 3 };
    }).sort((a, b) => b.xi - a.xi).slice(0, 20);
    const lo = Math.min(...rows.map((r) => r.xi)), hi = Math.max(...rows.map((r) => r.xi));
    rows.forEach((r, i) => { r.k = (r.xi - lo) / Math.max(1e-6, hi - lo); r.rank = i; });
    return { rows, hi };
  }, [data]);

  useEffect(() => {
    const el = mount.current, section = track.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture; scene.environmentIntensity = 0.85;
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-4, 6, 6); scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb7ff, 0.6); fill.position.set(5, -2, 3); scene.add(fill);
    const rim = new THREE.PointLight(0x38e1a8, 30, 14); rim.position.set(4, 1, -4); scene.add(rim);

    const grain = grainNormal();
    const ball = new THREE.Group(); scene.add(ball);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.975, 64, 64), new THREE.MeshPhysicalMaterial({ color: 0x08090b, roughness: 0.7 }));
    ball.add(core);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

    const faces = ballFaces();
    const hexes = faces.filter((f) => f.kind === "hex").sort((a, b) => b.center.z - a.center.z);
    const pents = faces.filter((f) => f.kind === "pent");
    const pentMat = new THREE.MeshPhysicalMaterial({ color: 0x101114, roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.35, normalMap: grain, normalScale: new THREE.Vector2(0.35, 0.35) });
    const pentMeshes = pents.map((f, i) => {
      const m = new THREE.Mesh(panelGeometry(f, 0.035), pentMat); m.userData = { f, i, fall: new THREE.Vector3((Math.random() - 0.5) * 3, -4 - Math.random() * 2, (Math.random() - 0.5) * 3) };
      scene.add(m); return m;
    });
    const items = clubs.rows.map((club, i) => {
      const f = hexes[i], [map, bump] = faceTextures(f, club);
      const m = new THREE.Mesh(panelGeometry(f, 0.035 + club.k * 0.16), new THREE.MeshPhysicalMaterial({
        map, bumpMap: bump, bumpScale: 2.2, normalMap: grain, normalScale: new THREE.Vector2(0.25, 0.25),
        roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.3, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff),
      }));
      m.userData = { f, club }; scene.add(m);
      // the bar it stands on in the ranking
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1), new THREE.MeshPhysicalMaterial({
        color: FDR_HEX[club.fdr], roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15, transparent: true, opacity: 0.92,
        emissive: new THREE.Color(FDR_HEX[club.fdr]), emissiveIntensity: 0.15,
      }));
      bar.userData = { club }; scene.add(bar);
      return { m, bar, club, f };
    });
    const hitList = items.flatMap((it) => [it.m, it.bar]);

    // floor line under the ranking
    const floorMat = new THREE.LineBasicMaterial({ color: 0x3a414a, transparent: true, opacity: 0 });
    const floor = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-7, 0, 0), new THREE.Vector3(7, 0, 0)]), floorMat); scene.add(floor);

    let W = 1, H = 1;
    const size = () => { W = el.clientWidth; H = el.clientHeight; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); };
    size(); addEventListener("resize", size);

    // pointer: drag to throw the ball, hover a club, click for its top player
    const spin = new THREE.Vector2(0.2, 0.06), ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let drag = null, mouse = null, hovered = null, moved = 0;
    const local = (e) => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const down = (e) => { drag = [e.clientX, e.clientY]; moved = 0; };
    const move = (e) => {
      mouse = local(e);
      if (drag) { const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy); spin.set(dx * 0.5, dy * 0.5); }
    };
    const pick = () => {
      if (!mouse) return null;
      ptr.set((mouse[0] / W) * 2 - 1, -(mouse[1] / H) * 2 + 1); ray.setFromCamera(ptr, camera);
      return ray.intersectObjects(hitList, false)[0]?.object.userData.club || null;
    };
    const up = () => {
      if (drag && moved < 5) {
        const c = pick();
        if (c) { const a = anchor.current; a.style.left = `${mouse[0]}px`; a.style.top = `${mouse[1]}px`; open(c.top, a, `${c.team}'s top pick this gameweek.`); }
      }
      drag = null;
    };
    const leave = () => { mouse = null; };
    el.addEventListener("pointerdown", down); addEventListener("pointermove", move, { passive: true }); addEventListener("pointerup", up); el.addEventListener("pointerleave", leave);

    const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), proj = new THREE.Vector3(), target = new THREE.Vector3(), upright = new THREE.Quaternion();
    let raf = 0, last = 0, born = 0, p = 0;
    const frame = (now) => {
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; born += dt;
      const r = section.getBoundingClientRect();
      const pt = clamp(-r.top / Math.max(1, r.height - innerHeight));
      p += (pt - p) * (reduced ? 1 : 1 - Math.exp(-dt * 6));
      const narrow = W < 900;
      // phases: hero ball, ball moves to centre, ball breaks, ranking
      const center = span(p, 0.06, 0.3), burst = span(p, 0.28, 0.62), bars = span(p, 0.5, 0.78);

      camera.position.set(0, 0, narrow ? 15 : 12); camera.lookAt(0, 0, 0);
      const halfH = Math.tan(THREE.MathUtils.degToRad(16)) * camera.position.z, halfW = halfH * camera.aspect;
      const home = narrow ? new THREE.Vector3(0, -halfH * 0.42, 0) : new THREE.Vector3(halfW * 0.55, -0.15, 0);
      const ballScale = (narrow ? Math.min(halfW * 0.62, halfH * 0.34) : Math.min(halfH * 0.58, halfW * 0.33)) * (1 - 0.15 * center);
      ball.position.copy(home).lerp(new THREE.Vector3(0, 0, 0), center);
      ball.scale.setScalar(ballScale);
      if (!drag) spin.lerp(new THREE.Vector2(reduced ? 0 : 0.2 * (1 - burst), 0.05 * (1 - burst)), 1 - Math.exp(-dt * 1.5));
      qy.setFromAxisAngle(Y, spin.x * dt); qx.setFromAxisAngle(X, spin.y * dt);
      ball.quaternion.premultiply(qy).premultiply(qx);
      ball.updateMatrixWorld(true);
      core.material.opacity = 1; core.visible = burst < 0.98; core.scale.setScalar(1 - 0.6 * burst);

      // where the ranking sits: one row on wide screens, two rows of ten on phones
      const cols = narrow ? 10 : 20, gap = (halfW * 1.8) / cols, floorY = -halfH * (narrow ? 0.62 : 0.74);
      const maxBar = halfH * (narrow ? 0.34 : 0.66), tile = gap * 0.42 / 0.4;
      const assemble = reduced ? 1 : clamp((born - 0.1) / 1.4);

      items.forEach(({ m, bar, club, f }, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const bh = 0.15 + club.k * maxBar;
        const rowFloor = narrow ? (row === 0 ? -halfH * 0.02 : -halfH * 0.64) : floorY;
        target.set((col - (cols - 1) / 2) * gap, rowFloor + bh * bars + tile * 0.45, 0);
        // on the ball: the panel's centre point, turned with the ball
        v.copy(f.center).multiplyScalar(1 + 2.2 * (1 - smooth(clamp(assemble * 1.6 - (i % 7) * 0.08)))).applyMatrix4(ball.matrixWorld);
        const stagger = clamp(burst * 1.35 - club.rank * 0.017);
        const e = smooth(stagger);
        m.position.copy(v).lerp(target, e);
        // arc out of the ball on the way
        m.position.z += Math.sin(e * Math.PI) * 2.5;
        upright.copy(f.face);
        q.copy(ball.quaternion).slerp(upright, e);
        m.quaternion.copy(q);
        const lift = hovered === club ? 1.12 : 1;
        m.scale.setScalar(THREE.MathUtils.lerp(ballScale, tile, e) * lift);
        // bar grows under the panel
        bar.visible = bars > 0.001;
        bar.scale.set(gap * 0.36, Math.max(0.001, bh * bars), gap * 0.36);
        bar.position.set(target.x, rowFloor + (bh * bars) / 2, target.z - 0.05);
        bar.material.opacity = 0.92 * bars;
        bar.material.emissiveIntensity = hovered === club ? 0.6 : 0.15;
        const lab = labels.current[club.short];
        if (lab) {
          proj.set(target.x, rowFloor - 0.05, target.z).project(camera);
          lab.style.transform = `translate(${(proj.x * 0.5 + 0.5) * W}px, ${(-proj.y * 0.5 + 0.5) * H}px)`;
          lab.style.opacity = String(bars);
          const val = labels.current[`v${club.short}`];
          proj.set(target.x, target.y + tile * 0.55, target.z).project(camera);
          val.style.transform = `translate(${(proj.x * 0.5 + 0.5) * W}px, ${(-proj.y * 0.5 + 0.5) * H}px)`;
          val.style.opacity = String(bars);
        }
      });
      pentMeshes.forEach((m) => {
        const { f, i, fall } = m.userData;
        v.copy(f.center).multiplyScalar(1 + 2.2 * (1 - smooth(clamp(assemble * 1.6 - (i % 7) * 0.08)))).applyMatrix4(ball.matrixWorld);
        const e = smooth(clamp(burst * 1.5 - i * 0.02));
        m.position.copy(v).addScaledVector(fall, e * e);
        m.quaternion.copy(ball.quaternion);
        m.scale.setScalar(ballScale * (1 - 0.7 * e));
        m.visible = e < 0.99;
      });
      shadow.position.set(ball.position.x, ball.position.y - ballScale * 1.18, ball.position.z);
      shadow.scale.setScalar(ballScale * 2.4); shadow.material.opacity = (1 - burst) * assemble;
      floor.position.set(0, floorY, 0); floor.scale.x = halfW / 7; floorMat.opacity = narrow ? 0 : bars * 0.9;

      if (heroText.current) {
        const k = center;
        heroText.current.style.opacity = String(1 - k * 1.3);
        heroText.current.style.transform = `translate3d(0, ${-k * 60}px, 0) scale(${1 - k * 0.06})`;
        heroText.current.style.filter = `blur(${k * 8}px)`;
        heroText.current.style.pointerEvents = k > 0.5 ? "none" : "";
      }
      if (chartText.current) { chartText.current.style.opacity = String(bars); chartText.current.style.transform = `translate3d(0, ${(1 - bars) * 30}px, 0)`; }

      hovered = drag ? null : pick();
      el.style.cursor = drag ? "grabbing" : hovered ? "pointer" : burst < 0.2 ? "grab" : "default";
      setTip((t) => (hovered ? (t && t.c === hovered ? t : { c: hovered, x: mouse[0], y: mouse[1] }) : t ? null : t));
      const vb = section.getBoundingClientRect();
      if (!document.hidden && vb.bottom > 0 && vb.top < innerHeight) renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    // the club codes are drawn in Geist, so wait for the font before painting the panels
    document.fonts.ready.then(() => {
      items.forEach(({ m, club, f }) => { const [map, bump] = faceTextures(f, club); m.material.map = map; m.material.bumpMap = bump; m.material.needsUpdate = true; });
      raf = requestAnimationFrame(frame);
    });
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointerleave", leave);
      renderer.dispose(); el.innerHTML = "";
    };
  }, [clubs]); // eslint-disable-line react-hooks/exhaustive-deps

  const { rows } = clubs, leader = rows[0], last = rows.at(-1);
  return (
    <>
      <div ref={mount} className="absolute inset-0 touch-pan-y" role="img"
        aria-label={`A football made of the 20 clubs that breaks apart into a ranking. ${leader.team} rank first with ${leader.xi.toFixed(1)} predicted points from their best eleven; ${last.team} rank last with ${last.xi.toFixed(1)}.`} />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {rows.map((c) => (
          <span key={c.short}>
            <span ref={(e) => (labels.current[c.short] = e)} className="absolute left-0 top-0 -translate-x-1/2 pt-2 font-mono text-[10.5px] text-text2" style={{ opacity: 0 }}>{c.short}</span>
            <span ref={(e) => (labels.current[`v${c.short}`] = e)} className="num absolute left-0 top-0 -translate-x-1/2 -translate-y-full pb-1 text-[12px] text-text max-md:text-[10px]" style={{ opacity: 0 }}>{c.xi.toFixed(0)}</span>
          </span>
        ))}
      </div>
      <div ref={chartText} className="page pointer-events-none absolute inset-x-0 top-24 lg:top-28" style={{ opacity: 0 }}>
        <h2 className="max-w-[18ch] font-display text-[clamp(30px,3.6vw,56px)] font-medium leading-[1.02] tracking-[-0.035em]">How the 20 clubs stack up for gameweek {data.meta.gw}.</h2>
        <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-text2 max-md:hidden">
          The same 20 panels, now ranked. Each bar adds up a club's eleven best predicted players. Its colour is how hard the next game is, green easy to red hard. {leader.team} lead on {leader.xi.toFixed(1)}; {last.team} are last on {last.xi.toFixed(1)}.
        </p>
      </div>
      <span ref={anchor} data-pop className="pointer-events-none absolute h-0 w-0" />
      {tip && (
        <div className="pointer-events-none absolute z-20 w-max max-w-[270px] -translate-x-1/2 -translate-y-[calc(100%+16px)] rounded-[4px] border border-line2 bg-bg/90 px-3 py-2 text-[12.5px] leading-snug backdrop-blur" style={{ left: tip.x, top: tip.y }}>
          <div className="text-text">{tip.c.team} <span className="text-text3">#{tip.c.rank + 1}</span></div>
          <div className="text-text2">{tip.c.xi.toFixed(1)} predicted points from its best eleven</div>
          <div className="text-text3">{tip.c.fx.length ? `Next: ${tip.c.fx.map((f) => `${f.opp} (${f.home ? "home" : "away"})`).join(", ")}, ${FDR_WORD[tip.c.fdr]}` : "No game this gameweek"}</div>
          <div className="mt-1 text-text3">Top pick: <span className="text-mint">{tip.c.top.name} {tip.c.top.pred.toFixed(1)}</span>. Click for more.</div>
        </div>
      )}
    </>
  );
}
