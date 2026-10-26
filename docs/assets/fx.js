// Loud mode: every effect turned on. The clean site is the default; the switch in the
// top bar (or ?fx=loud in the URL) turns this on and remembers the choice.
FPL.loud = document.documentElement.classList.contains("fx-loud");

FPL.fxToggle = () => {
  const right = document.querySelector(".nav-right");
  if (!right) return;
  const b = document.createElement("button");
  b.className = "fx-toggle";
  b.setAttribute("aria-pressed", FPL.loud);
  b.innerHTML = `<span class="knob"></span><span>${FPL.loud ? "Loud" : "Clean"}</span>`;
  b.title = FPL.loud ? "Switch to the clean version" : "Switch to loud mode, with every effect on";
  b.addEventListener("click", () => {
    try { localStorage.setItem("fx", FPL.loud ? "clean" : "loud"); } catch (e) { /* storage blocked */ }
    const u = new URL(location.href); u.searchParams.delete("fx"); location.href = u.toString();
  });
  right.prepend(b);
};

FPL.fxInit = () => {
  FPL.fxToggle();
  if (!FPL.loud) return;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches && !FPL.reduced;

  // ---- intro: a scoreboard counter, once per visit
  if (!sessionStorage.getItem("fx-intro") && !FPL.reduced) {
    try { sessionStorage.setItem("fx-intro", "1"); } catch (e) { /* ignore */ }
    const intro = document.createElement("div");
    intro.className = "fx-intro";
    intro.innerHTML = `<div class="fx-intro-in"><span class="brand-mark"></span><b>FPL POINTS LAB</b><span class="fx-count">00</span>
      <i class="fx-bar"><i></i></i><small>loading ${document.title.includes("Dashboard") ? "dashboard" : "predictions"}</small></div>`;
    document.body.appendChild(intro);
    const n = intro.querySelector(".fx-count"), bar = intro.querySelector(".fx-bar i"), t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 1300), e = 1 - Math.pow(1 - k, 3);
      n.textContent = String(Math.round(e * 100)).padStart(2, "0"); bar.style.transform = `scaleX(${e})`;
      if (k < 1) requestAnimationFrame(tick);
      else { intro.classList.add("out"); setTimeout(() => intro.remove(), 1100); }
    };
    requestAnimationFrame(tick);
  }

  // ---- film grain
  const grain = document.createElement("div"); grain.className = "fx-grain"; document.body.appendChild(grain);

  // ---- magnetic buttons
  if (fine) document.querySelectorAll(".btn, .chip, .tabs button").forEach((b) => {
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
    });
    b.addEventListener("pointerleave", () => { b.style.transform = ""; });
  });

  // ---- content skews a little with scroll speed
  let lastY = scrollY, skew = 0;
  const skewEls = () => document.querySelectorAll("section.block, .hero, .dash > *");
  const sk = () => {
    const v = scrollY - lastY; lastY = scrollY;
    skew += (Math.max(-6, Math.min(6, v * 0.08)) - skew) * 0.12;
    if (Math.abs(skew) > 0.01) skewEls().forEach((el) => { el.style.transform = `skewY(${(-skew * 0.4).toFixed(3)}deg)`; });
    requestAnimationFrame(sk);
  };
  if (!FPL.reduced) sk();

  // ---- ticker across the top of the page
  FPL.afterLoad.push((data) => {
    const t = document.createElement("div"); t.className = "fx-ticker";
    const items = data.players.slice(0, 20).map((p, i) => `<span><b>${String(i + 1).padStart(2, "0")}</b> ${FPL.esc(p.name.toUpperCase())} <em>${p.pred.toFixed(1)}</em></span>`).join("");
    t.innerHTML = `<div class="fx-ticker-track">${items}${items}</div>`;
    document.body.appendChild(t);
  });
};

// ---- after the data loads: scramble text, tilt cards, a ball passing on the pitch
FPL.fxAfter = (data) => {
  if (!FPL.loud) return;
  const glyphs = "!<>-_\\/[]{}=+*^?#0123456789";
  const scramble = (el) => {
    const final = el.textContent; let frame = 0;
    const len = final.length, total = 26;
    const step = () => {
      el.textContent = final.split("").map((ch, i) => (ch === " " || frame / total > i / len) ? ch : glyphs[(Math.random() * glyphs.length) | 0]).join("");
      if (++frame <= total) requestAnimationFrame(step); else el.textContent = final;
    };
    step();
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { scramble(e.target); io.unobserve(e.target); } }));
  document.querySelectorAll(".kicker, .tabs button, .result .lbl, .pill span:last-child").forEach((el) => io.observe(el));
  document.querySelectorAll(".find, .fact, .score .card, .layer, .pcard, .option").forEach((el) => el.classList.add("tilt"));
  FPL.tilt(".tilt");

  // the pitch leans toward the cursor and a ball moves between the XI
  const pitch = document.getElementById("pitch");
  if (!pitch) return;
  pitch.classList.add("fx-3d");
  addEventListener("pointermove", (e) => {
    const r = pitch.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    if (Math.abs(x) < 1.2 && Math.abs(y) < 1.2) pitch.style.transform = `perspective(1100px) rotateX(${(-y * 10).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg)`;
  }, { passive: true });
  pitch.addEventListener("pointerleave", () => { pitch.style.transform = ""; });
  const ball = document.createElement("div"); ball.className = "fx-ball"; pitch.appendChild(ball);
  const shirts = () => [...pitch.querySelectorAll(".shirt")];
  let from = null;
  const pass = () => {
    const s = shirts(); if (!s.length) return;
    const pr = pitch.getBoundingClientRect();
    const to = s[(Math.random() * s.length) | 0];
    if (to === from) return setTimeout(pass, 50);
    const r = to.getBoundingClientRect();
    ball.style.transform = `translate(${r.left - pr.left + r.width / 2 - 6}px, ${r.top - pr.top + r.height / 2 - 6}px)`;
    to.classList.add("fx-touch"); setTimeout(() => to.classList.remove("fx-touch"), 650);
    from = to;
    setTimeout(pass, 900 + Math.random() * 700);
  };
  setTimeout(pass, 1600);
};
