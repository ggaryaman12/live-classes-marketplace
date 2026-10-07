// The store page's waiting state, in the shape of the page it becomes: a store
// header, then a category rail beside menu rows that each carry a name, a
// price and a description line.
//
// Every colour comes from the theme (see .skel-* in globals.css). These used to
// be hardcoded light grey, which meant a dark storefront loaded six glaring
// white slabs — the skeleton was brighter than the page behind it.
export default function Loading() {
  const rows = [
    { name: '46%', desc: '62%' },
    { name: '33%', desc: '48%' },
    { name: '52%', desc: '40%' },
    { name: '38%', desc: '58%' },
    { name: '44%', desc: '35%' },
  ];
  return (
    <div className="skel-wrap" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the menu</span>
      <div className="skel-storehero" />
      <div className="skel-menu" aria-hidden="true">
        <div className="skel-rail">
          {[68, 52, 60, 44].map((w, i) => (
            <span className="skel-b t" key={i} style={{ width: `${w}%`, '--d': `${i * 70}ms` }} />
          ))}
        </div>
        <div className="skel-rows">
          {rows.map((r, i) => (
            <div className="skel-row" key={i}>
              <span className="skel-b t" style={{ width: r.name, '--d': `${i * 80}ms` }} />
              <span className="skel-b t" style={{ '--d': `${i * 80}ms` }} />
              <span className="skel-b d" style={{ width: r.desc, '--d': `${i * 80 + 40}ms` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
