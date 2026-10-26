// Home page: fills the hero, track record and this week's picks from site.json.
FPL.boot((data) => {
  const m = data.meta, gw = m.gw;
  const pill = document.getElementById("pill");
  document.getElementById("hero-gw").textContent = `gameweek ${gw}`;
  document.getElementById("pill-text").textContent = data.stale
    ? `Gameweek ${gw} picks, using games through GW${m.played}` : `Gameweek ${gw} picks are live`;
  if (data.stale) pill.classList.add("warn");
  document.getElementById("notice").innerHTML = FPL.notice(data);
  FPL.pitch(document.getElementById("pitch"), data);

  // track record
  const total = (k) => (data.weekly[k] || []).reduce((s, [, v]) => s + v, 0);
  document.getElementById("record-sub").insertAdjacentHTML("beforeend",
    ` Through gameweek ${m.played}, here's how they've done.`);
  FPL.hooks.count = (el) => FPL.countUp(el.querySelector(".val"), total(el.dataset.key));
  FPL.hooks.record = () => FPL.lineChart(document.getElementById("record-chart"), FPL.recordSeries(data),
    { height: 330, yTitle: "Points" });
  const xi = data.edges["Best XI: avg points per GW"], mae = data.edges["MAE (regular starters)"];
  const fmt = (v) => (v > 0 ? "+" : "") + Math.round(v);
  document.getElementById("facts").innerHTML = `
    <div class="fact reveal"><div class="t">Last season<span>never seen in training</span></div>
      <div class="v good num">+${data.last_season_edge}</div><p>points over all of 2025-26 for the model's team compared with the simple rule.</p></div>
    <div class="fact reveal" style="--d:.08s"><div class="t">This season<span>${xi.sure ? "clear" : "too early to say"}</span></div>
      <div class="v num">${fmt(xi.edge)}</div><p>points a week so far. With ${m.played} weeks of data the real gap could be anywhere from ${fmt(xi.lo)} to ${fmt(xi.hi)}.</p></div>
    <div class="fact reveal" style="--d:.16s"><div class="t">Per player<span>${mae.sure ? "clear" : "not yet"}</span></div>
      <div class="v num">${mae.edge.toFixed(2)}</div><p>points closer, on average, to what each regular starter actually scores.</p></div>`;

  // this week marquee (list twice so the loop is seamless)
  document.getElementById("picks-title").textContent = `The top picks for gameweek ${gw}.`;
  const top = data.players.slice(0, 14);
  const cards = top.map((p, i) => `<div class="pcard"><div class="rk"><span>#${i + 1}</span><span>${p.pos}</span></div>
    <div class="nm">${FPL.esc(p.name)}</div><div class="tm">${FPL.esc(p.team)}</div>
    <div class="row"><span class="pp num">${p.pred.toFixed(1)}</span><span class="pr num">£${p.price.toFixed(1)}m</span></div></div>`).join("");
  document.getElementById("marquee-track").innerHTML = cards + cards.replaceAll('class="pcard"', 'class="pcard" aria-hidden="true"');

  document.getElementById("closing-title").textContent = `Gameweek ${gw} picks are up.`;
  const when = m.refreshed_at ? new Date(m.refreshed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  document.getElementById("foot-data").textContent = `Data from the ${m.source || "open FPL archive"}${when ? `, updated ${when}` : ""}`;

  // faq accordion
  document.querySelectorAll(".qa button").forEach((b) => b.addEventListener("click", () => {
    const qa = b.parentElement, open = !qa.classList.contains("open");
    qa.classList.toggle("open", open);
    b.setAttribute("aria-expanded", open);
  }));
});
