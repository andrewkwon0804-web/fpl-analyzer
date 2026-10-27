// The best XI on a lit pitch, drawn with three.js like the stack on the home page.
// Pins rise to each player's predicted points. Drag to turn the pitch, hover a pin to light it,
// click a name or pin for that player's next five gameweeks.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { usePop } from "./Popover.jsx";
import { useInView, reduced } from "../lib/motion.js";

export function pitchTexture() {
  const c = document.createElement("canvas"), S = 1024; c.width = S; c.height = S * 1.4;
  const x = c.getContext("2d"), H = c.height;
  for (let i = 0; i < 14; i++) { x.fillStyle = i % 2 ? "#0b1f15" : "#0e2619"; x.fillRect(0, (i * H) / 14, S, H / 14); }
  x.strokeStyle = "rgba(190,255,220,.75)"; x.lineWidth = 5; const m = 50;
  x.strokeRect(m, m, S - 2 * m, H - 2 * m); x.beginPath(); x.moveTo(m, H / 2); x.lineTo(S - m, H / 2); x.stroke();
  x.beginPath(); x.arc(S / 2, H / 2, 120, 0, 7); x.stroke();
  x.strokeRect(S / 2 - 240, m, 480, 200); x.strokeRect(S / 2 - 110, m, 220, 70);
  x.strokeRect(S / 2 - 240, H - m - 200, 480, 200); x.strokeRect(S / 2 - 110, H - m - 70, 220, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export default function PitchGL({ data }) {
  const mount = useRef(null), labels = useRef([]), anchor = useRef(null);
  const [inViewRef, seen] = useInView(1);
  const seenRef = useRef(false); seenRef.current = seen;
  const [hover, setHover] = useState(-1);
  const { open } = usePop();
  const xi = data.players.filter((p) => p.xi);
  const rowZ = { FWD: -1.85, MID: -0.55, DEF: 0.75, GK: 1.95 };
  const placed = Object.keys(rowZ).flatMap((pos) => {
    const row = xi.filter((p) => p.pos === pos).sort((a, b) => b.pred - a.pred);
    const order = row.map((_, i) => (i % 2 ? (row.length - 1) / 2 + Math.ceil(i / 2) : (row.length - 1) / 2 - i / 2));
    return row.map((p, i) => ({ p, x: ((order[i] + 1) / (row.length + 1)) * 3.4 - 1.7, z: rowZ[pos] }));
  });
  const note = (p) => `Ranked #${data.rank[p.id]} of ${data.players.length} by predicted points.${p.id === data.captain ? " Captain: his points are doubled." : ""}`;

  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(5, 9, 4); scene.add(key);
    const board = new THREE.Group(); scene.add(board);
    board.add(new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.22, 5.8, 6, 0.14),
      new THREE.MeshPhysicalMaterial({ color: 0x7d8288, metalness: 0.85, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 })));
    const tex = pitchTexture();
    const top = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 5.4), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.7 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.111; board.add(top);
    const fat = [];
    const pins = placed.map(({ p, x, z }, i) => {
      const cap = p.id === data.captain;
      const mat = new THREE.MeshStandardMaterial({ color: cap ? 0xffffff : 0x38e1a8, emissive: cap ? 0xffffff : 0x38e1a8, emissiveIntensity: cap ? 1.3 : 0.85 });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 18), mat);
      m.position.set(x, 0, z); m.userData.i = i; board.add(m);
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      f.userData.i = i; m.add(f); fat.push(f);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), new THREE.MeshBasicMaterial({ color: 0x38e1a8, transparent: true, opacity: 0.18 }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.115, z); board.add(glow);
      return { m, mat, h: p.pred * 0.32, base: mat.emissiveIntensity };
    });
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.8); composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    size(); addEventListener("resize", size);

    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), v = new THREE.Vector3();
    let mouse = null, drag = null, rot = 0, vel = 0, hovered = -1, rise = 0, raf = 0, last = -2;
    const local = (e) => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const down = (e) => { drag = { x: e.clientX, moved: 0 }; };
    const move = (e) => { mouse = local(e); if (drag) { const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx); vel = dx * 0.008; rot += vel; } };
    // a click is a press and release without dragging; look up the pin under it fresh
    const up = (e) => {
      if (drag && drag.moved < 5) {
        const [x, y] = local(e);
        ptr.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
        const hit = ray.intersectObjects(fat, false)[0];
        if (hit) { const a = anchor.current, pl = placed[hit.object.userData.i].p; a.style.left = `${x}px`; a.style.top = `${y}px`; open(pl, a, note(pl)); }
      }
      drag = null;
    };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); addEventListener("pointerup", up); el.addEventListener("pointerleave", () => { mouse = null; });
    const t0 = performance.now();
    const frame = (now) => {
      const t = (now - t0) / 1000;
      if (!drag) { rot += vel; vel *= 0.94; }
      board.rotation.y = rot + (reduced ? 0 : Math.sin(t * 0.25) * 0.12);
      const narrow = el.clientWidth < 600 ? 1.35 : 1;
      camera.position.set(0, 7.2 * narrow, 7.4 * narrow); camera.lookAt(0, 0.4, 0.2);
      rise += ((seenRef.current ? 1 : 0) - rise) * 0.06;
      hovered = -1;
      if (mouse && !drag) {
        ptr.set((mouse[0] / el.clientWidth) * 2 - 1, -(mouse[1] / el.clientHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
        const hit = ray.intersectObjects(fat, false)[0]; if (hit) hovered = hit.object.userData.i;
      }
      if (hovered === -1 && labels.current.hoverIdx >= 0) hovered = labels.current.hoverIdx;
      el.style.cursor = hovered >= 0 ? "pointer" : drag ? "grabbing" : "grab";
      if (hovered !== last) { last = hovered; setHover(hovered); }
      pins.forEach(({ m, mat, h, base }, i) => {
        const hh = Math.max(0.001, h * Math.min(1, Math.max(0, rise * 1.6 - i * 0.05)));
        m.scale.y = hh; m.position.y = 0.11 + hh / 2;
        mat.emissiveIntensity += ((hovered === i ? 2.2 : hovered === -1 ? base : base * 0.5) - mat.emissiveIntensity) * 0.15;
        // name label at the top of the pin
        const lab = labels.current[i];
        if (lab) {
          v.set(m.position.x, 0.11 + hh + 0.08, m.position.z).applyMatrix4(board.matrixWorld).project(camera);
          lab.style.transform = `translate(${(v.x * 0.5 + 0.5) * el.clientWidth}px, ${(-v.y * 0.5 + 0.5) * el.clientHeight}px) translate(-50%, -100%)`;
          lab.style.opacity = String(Math.min(1, rise * 1.4));
        }
      });
      board.updateMatrixWorld(true);
      // only draw while on screen and the tab is visible
      const vb = el.getBoundingClientRect();
      if (!document.hidden && vb.bottom > 0 && vb.top < innerHeight) composer.render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointerup", up);
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); renderer.dispose(); el.innerHTML = "";
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={inViewRef} className="relative aspect-[4/3.4] w-full select-none overflow-hidden rounded-[6px] border border-line bg-bg/60 max-sm:aspect-[3/4]">
      <div ref={mount} className="absolute inset-0 touch-pan-y" role="img" aria-label={`The best XI on a 3D pitch: ${xi.map((p) => `${p.name} ${p.pred.toFixed(1)}`).join(", ")}`} />
      <span ref={anchor} data-pop className="pointer-events-none absolute h-0 w-0" />
      {placed.map(({ p }, i) => (
        <button key={p.id} ref={(e) => (labels.current[i] = e)} data-pid={p.id}
          onMouseEnter={() => (labels.current.hoverIdx = i)} onMouseLeave={() => (labels.current.hoverIdx = -1)}
          onClick={(e) => open(p, e.currentTarget, note(p))}
          className="absolute left-0 top-0 flex flex-col items-center whitespace-nowrap opacity-0" style={{ willChange: "transform" }}>
          <span className={`border px-1.5 py-px font-mono text-[11px] backdrop-blur transition-colors ${p.id === data.captain ? "border-text bg-text text-bg" : hover === i ? "border-mint bg-mint text-bg" : "border-mint/40 bg-bg/70 text-mint"}`}>
            {p.pred.toFixed(1)}{p.id === data.captain && " ×2"}
          </span>
          <span className="mt-0.5 text-[12px] text-text [text-shadow:0_1px_6px_rgb(var(--bg))] max-sm:text-[10px]">{p.name}</span>
        </button>
      ))}
      <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-text3">Drag to turn · click a player</div>
    </div>
  );
}
