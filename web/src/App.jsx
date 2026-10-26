import { useCallback, useState } from "react";
import { useSiteData } from "./lib/data.js";
import GlyphField from "./components/GlyphField.jsx";
import PipelineStack from "./components/PipelineStack.jsx";
import Nav from "./components/Nav.jsx";
import Command from "./components/Command.jsx";
import { PopProvider, usePop } from "./components/Popover.jsx";
import Hero from "./sections/Hero.jsx";
import { LastGameweek, TrackRecord, Findings, TopPicks, FAQ, Closing, Footer } from "./sections/Rest.jsx";

// Shown while site.json loads: the same layout in grey blocks, so nothing jumps when data arrives.
function Skeleton() {
  return (
    <div className="page grid min-h-[100svh] items-center gap-12 pt-32 lg:grid-cols-[1fr_1.05fr]" aria-busy="true" aria-label="Loading">
      <div className="space-y-5">
        <div className="skel h-7 w-56 rounded-full" />
        <div className="skel h-[clamp(44px,6.6vw,104px)] w-11/12" /><div className="skel h-[clamp(44px,6.6vw,104px)] w-2/3" />
        <div className="skel h-5 w-4/5" /><div className="skel h-5 w-3/5" />
        <div className="skel h-[52px] w-full max-w-[460px] rounded-2xl" />
      </div>
      <div className="skel aspect-[0.92] w-full rounded-[22px]" />
    </div>
  );
}

function Page({ data }) {
  const [cmd, setCmd] = useState(false);
  const { open } = usePop();
  // From the command menu: open the player's chip if he's on screen, otherwise near the top of the page.
  const onPlayer = useCallback((p) => {
    const el = [...document.querySelectorAll(`[data-pid="${p.id}"]`)].find((e) => !e.closest("[aria-hidden]") && e.getBoundingClientRect().width);
    open(p, el || document.querySelector("header"), `Ranked #${data.players.indexOf(p) + 1} of ${data.players.length} by predicted points.`);
  }, [data, open]);
  return (
    <>
      <Nav onCommand={() => setCmd(true)} />
      <Command data={data} open={cmd} setOpen={setCmd} onPlayer={onPlayer} />
      <main className="relative z-10">
        <Hero data={data} />
        <PipelineStack data={data} />
        {data.last_gw && <LastGameweek data={data} />}
        <TrackRecord data={data} />
        <Findings data={data} />
        <TopPicks data={data} />
        <FAQ />
        <Closing data={data} />
        <Footer data={data} />
      </main>
    </>
  );
}

export default function App() {
  const { data, error } = useSiteData();
  return (
    <>
      <GlyphField />
      {error ? (
        <p className="page relative z-10 pt-40 text-text2">Couldn't load the predictions ({error}). Refresh the page to try again.</p>
      ) : !data ? (
        <div className="relative z-10"><Skeleton /></div>
      ) : (
        <PopProvider data={data}><Page data={data} /></PopProvider>
      )}
    </>
  );
}
