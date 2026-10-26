// HUD framing in the Watermelon UI style: thin rails down the page, + marks where section
// lines cross them, and small monospace labels.
export function Rails() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[1] mx-auto max-w-page">
      <div className="absolute inset-y-0 left-4 border-l border-line/70 sm:left-8 lg:left-14" />
      <div className="absolute inset-y-0 right-4 border-r border-line/70 sm:right-8 lg:right-14" />
    </div>
  );
}

const Plus = ({ className }) => (
  <span aria-hidden className={`absolute -top-[6px] h-[11px] w-[11px] ${className}`}>
    <i className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-text3/70" /><i className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-text3/70" />
  </span>
);

// A full-width rule with + marks on the rails. Put it at the top of a section.
export function Rule() {
  return (
    <div aria-hidden className="relative h-px w-full bg-line/70">
      <div className="relative mx-auto h-px max-w-page">
        <Plus className="left-[10px] sm:left-[26px] lg:left-[50px]" />
        <Plus className="right-[10px] sm:right-[26px] lg:right-[50px]" />
      </div>
    </div>
  );
}

export function Label({ n, children, className = "" }) {
  return (
    <div className={`mono-label flex items-center gap-2 text-mint ${className}`}>
      <span className="text-text3">//</span>{n && <span className="text-text3">{n}</span>}{children}
    </div>
  );
}

// A row of small status readouts: [["MODEL", "Gradient boosting"], ...]
export function Readout({ items, className = "" }) {
  return (
    <dl className={`grid grid-cols-2 gap-px overflow-hidden border border-line/70 bg-line/70 sm:grid-cols-4 ${className}`}>
      {items.map(([k, v, live]) => (
        <div key={k} className="bg-bg/80 px-4 py-3">
          <dt className="mono-label flex items-center gap-1.5 text-[10px] text-text3">{live && <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />}{k}</dt>
          <dd className="num mt-1 truncate font-mono text-[13px] text-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
