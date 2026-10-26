import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSiteData } from "./lib/data.js";
import Aurora from "./components/Aurora.jsx";
import Nav from "./components/Nav.jsx";
import Command from "./components/Command.jsx";
import { PopProvider } from "./components/Popover.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import FluidTabs from "./components/wm/FluidTabs.jsx";
import { Label, Rails, Readout } from "./components/hud.jsx";
import { Footer } from "./sections/More.jsx";
import { XITab, PlayersTab, LookupTab, RecordTab } from "./tabs/Overview.jsx";
import TeamTab from "./tabs/Team.jsx";
import PlannerTab from "./tabs/Planner.jsx";
import { Value, Xg, Fdr, Crowd } from "./tabs/Analysis.jsx";

const TABS = [["xi", "Best XI"], ["players", "All players"], ["lookup", "Player lookup"], ["record", "Track record"], ["team", "Model team"], ["planner", "Transfer planner"], ["analysis", "Analysis"]]
  .map(([id, label]) => ({ id, label }));
const SUBS = [["value", "Value for money"], ["xg", "Goals vs xG"], ["fdr", "Fixture difficulty"], ["crowd", "Transfers and ownership"]].map(([id, label]) => ({ id, label }));
const LINKS = [["./", "Home"], ["./#record", "Track record"], ["./#findings", "Findings"], ["./#faq", "FAQ"]];

function readHash() {
  const h = location.hash.slice(1);
  if (h.startsWith("analysis")) { const s = h.split("-")[1]; return ["analysis", SUBS.some((x) => x.id === s) ? s : "value"]; }
  return [TABS.some((t) => t.id === h) ? h : "xi", "value"];
}

function Board({ data }) {
  const [[tab, sub], setView] = useState(readHash);
  const [pid, setPid] = useState(() => +new URLSearchParams(location.search).get("player") || data.players[0].id);
  const [cmd, setCmd] = useState(false);
  const go = useCallback((t, s = sub) => {
    setView([t, s]);
    history.replaceState(null, "", `${location.pathname}${t === "lookup" ? `?player=${pid}` : ""}#${t === "analysis" ? `analysis-${s}` : t}`);
  }, [sub, pid]);
  const showPlayer = useCallback((id) => {
    setPid(id); setView(["lookup", sub]);
    history.replaceState(null, "", `${location.pathname}?player=${id}#lookup`);
    (window.__lenis ? window.__lenis.scrollTo(0) : scrollTo({ top: 0, behavior: "smooth" }));
  }, [sub]);
  useEffect(() => { window.__showPlayer = showPlayer; return () => { delete window.__showPlayer; }; }, [showPlayer]);
  useEffect(() => { const on = () => setView(readHash()); addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  const m = data.meta, A = data.analysis;
  const updated = new Date(m.refreshed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const places = [...TABS.map((t) => [t.label, "Tab", () => go(t.id)]), ...SUBS.map((s) => [s.label, "Analysis", () => go("analysis", s.id)]), ["Home page", "Page", () => { location.href = "./"; }]];
  const panel = {
    xi: <XITab data={data} />, players: <PlayersTab data={data} showPlayer={showPlayer} />,
    lookup: <LookupTab data={data} playerId={pid} setPlayerId={(id) => { setPid(id); history.replaceState(null, "", `${location.pathname}?player=${id}#lookup`); }} />,
    record: <RecordTab data={data} />, team: <TeamTab data={data} />, planner: <PlannerTab data={data} />,
    analysis: (
      <div>
        <div className="mb-5"><FluidTabs id="sub" tabs={SUBS} active={sub} onChange={(s) => go("analysis", s)} /></div>
        {{ value: <Value A={A} />, xg: <Xg A={A} />, fdr: <Fdr A={A} data={data} />, crowd: <Crowd A={A} /> }[sub]}
      </div>
    ),
  }[tab];
  return (
    <>
      <Nav onCommand={() => setCmd(true)} links={LINKS} cta={["./", "Home"]} />
      <Command data={data} open={cmd} setOpen={setCmd} onPlayer={(p) => showPlayer(p.id)} places={places} />
      <Rails />
      <main className="relative z-10">
        <header className="page pt-28 lg:pt-32" data-tint="94 240 176" data-tint2="106 168 255" data-tx="85%">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label>Dashboard · {m.season}</Label>
            <span className={`mono-label flex items-center gap-2 ${data.stale ? "text-amber" : "text-mint"}`}>
              <i className={`h-1.5 w-1.5 rounded-full ${data.stale ? "bg-amber" : "animate-pulse bg-mint"}`} />
              {data.stale ? `Data through GW${m.played}` : `GW${m.gw} picks live`}
            </span>
          </div>
          <div className="mt-6 grid items-end gap-6 lg:grid-cols-[auto_1fr]">
            <h1 className="font-display text-[clamp(56px,8vw,128px)] font-medium leading-[0.85] tracking-[-0.05em]">Gameweek <span className="text-mint">{m.gw}</span></h1>
            <Readout items={[["Players", data.players.length, true], ["Games through", `GW${m.played}`], ["Best XI cost", `£${m.xi_cost}m`], ["Updated", updated]]} />
          </div>
          {data.stale && <p className="mt-6 max-w-[760px] text-sm text-amber">Gameweek {m.gw} has started. These picks only use games through gameweek {m.played} and update on the next data refresh.</p>}
        </header>
        <div className="sticky top-[84px] z-30 mt-10">
          <div className="page"><FluidTabs tabs={TABS} active={tab} onChange={(t) => go(t)} /></div>
        </div>
        <section className="page mt-8 min-h-[60vh] pb-24">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} initial={{ opacity: 0, y: 14, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }} transition={{ duration: 0.25, ease: [0.2, 0.7, 0.1, 1] }}>
              {panel}
            </motion.div>
          </AnimatePresence>
        </section>
        <Footer data={data} />
      </main>
    </>
  );
}

function Skeleton() {
  return (
    <div className="page space-y-6 pt-32" aria-busy="true" aria-label="Loading">
      <div className="skel h-5 w-56" /><div className="skel h-24 w-[60%]" /><div className="skel h-12 w-full max-w-[760px] rounded-full" />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]"><div className="skel h-[420px]" /><div className="skel h-[420px]" /></div>
    </div>
  );
}

export default function Dashboard() {
  const { data, error } = useSiteData();
  return (
    <ToastProvider>
      <Aurora />
      {error ? <p className="page relative z-10 pt-40 text-text2">Couldn't load the predictions ({error}). Refresh the page to try again.</p>
        : !data ? <div className="relative z-10"><Skeleton /></div>
        : <PopProvider data={data}><Board data={data} /></PopProvider>}
    </ToastProvider>
  );
}
