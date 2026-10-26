// Tabs with a pill that slides between them. Adapted from Watermelon UI's fluid-tabs (MIT).
import { useEffect, useRef } from "react";
import { motion } from "motion/react";

export default function FluidTabs({ tabs, active, onChange, id = "tabs" }) {
  const bar = useRef(null);
  // keep the selected tab visible when the bar scrolls sideways on phones
  useEffect(() => { bar.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }, [active]);
  return (
    <div ref={bar} role="tablist" className="no-scrollbar relative flex max-w-full items-center gap-1 overflow-x-auto rounded-[6px] border border-line2 bg-surface/80 p-1 backdrop-blur">
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button key={t.id} role="tab" aria-selected={on} onClick={() => onChange(t.id)}
            className="group relative shrink-0 rounded-[6px] px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-mint">
            {on && <motion.div layoutId={`${id}-pill`} transition={{ type: "spring", stiffness: 280, damping: 25, mass: 0.8 }}
              className="absolute inset-0 rounded-[6px] border border-line2 bg-gradient-to-b from-raised to-surface shadow-[0_0_24px_rgb(var(--mint)/.12)]" />}
            <motion.span animate={{ filter: on ? ["blur(0px)", "blur(3px)", "blur(0px)"] : "blur(0px)" }} transition={{ duration: 0.3 }}
              className={`relative z-10 flex items-center gap-2 whitespace-nowrap ${on ? "font-medium text-text" : "text-text3 group-hover:text-text2"}`}>
              {t.icon && <span className={on ? "text-mint" : ""}>{t.icon}</span>}{t.label}
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
