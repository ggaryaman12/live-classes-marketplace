// Component registry — the heart of the bridge. Each storefront component is
// registered with: its render fn, a typed prop-spec (which auto-builds the
// drag-drop property panel later), and whether it binds to a data source.
//
// The renderer looks a node's `type` up here and renders it. This is what makes
// one component-JSON tree drive the REAL storefront — so AI edits, drag-drop,
// and fork/rebase all operate on the same thing.
// Mount-point chrome resolves through the resolver: the project's own copy when
// it has one, else the shipped default. So a storefront that edited its
// checkout/catalogue/store-header renders THAT, not the stock version.
import { Chrome } from './chromeReg';
import CustomComponent from './CustomComponent';
import { titleHtml } from './safeText';

// Chrome components resolve to the project's OWN copy when it has one, else the shipped
// default (see lib/chromeReg.js). Destructured here so the render fns below are unchanged.
const { StoreCard, CheckoutPanel, BillLines, Hero3DSection, EntrySequence, StoreHeader, Catalogue } = Chrome;

export const REGISTRY = {
  Page: {
    props: {},
    render: (_props, children) => <>{children}</>,
  },

  Hero: {
    props: {
      eyebrow: { control: 'text', label: 'Eyebrow' },
      title: { control: 'text', label: 'Title' },
      subtitle: { control: 'text', label: 'Subtitle' },
      searchPlaceholder: { control: 'text', label: 'Search placeholder' },
    },
    render: (p) => (
      <section className="hero2">
        <div className="hero2-inner">
          {p.eyebrow && <div className="hero2-eyebrow">{p.eyebrow}</div>}
          <h1 className="hero2-title" dangerouslySetInnerHTML={{ __html: titleHtml(p.title) }} />
          {p.subtitle && <p className="hero2-sub">{p.subtitle}</p>}
          <div className="hero2-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder={p.searchPlaceholder || 'Search…'} />
          </div>
        </div>
        <div className="hero2-glow" aria-hidden="true" />
      </section>
    ),
  },

  StoreGrid: {
    bindable: true,
    props: {
      heading: { control: 'text', label: 'Heading' },
      columns: { control: 'number', label: 'Columns per row', min: 1, max: 6 },
    },
    // `data` is the resolved binding (storefronts). This is where a bound node
    // gets its live API data injected by the renderer.
    render: (p, _children, data) => {
      const stores = Array.isArray(data) ? data : [];
      // `columns` (fixed count) wins; fall back to auto-fill for legacy trees.
      const gridStyle = p.columns
        ? { gridTemplateColumns: `repeat(${Math.min(Math.max(Number(p.columns), 1), 6)}, minmax(0, 1fr))` }
        : p.columnsHint ? { gridTemplateColumns: `repeat(auto-fill,minmax(${p.columnsHint}px,1fr))` } : undefined;
      return (
        <section className="stores2">
          <div className="stores2-head">
            <h2>{p.heading || 'Stores near you'}</h2>
            <span className="stores2-count">{stores.length} open · live</span>
          </div>
          {stores.length === 0 ? (
            <p className="stores2-empty">No stores open right now.</p>
          ) : (
            <div className="stores2-grid" style={gridStyle}>
              {stores.map((s, i) => <StoreCard key={s.id} store={s} index={i} />)}
            </div>
          )}
        </section>
      );
    },
  },

  // Merchant listing grid — same live store data as StoreGrid, but laid out as
  // an explicit N-column grid with a tunable corner radius, which is what the
  // /stores page wants. Kept as its own type (rather than a StoreGrid prop) so
  // the two pages can diverge visually without one breaking the other.
  MerchantGrid: {
    bindable: true,
    props: {
      heading: { control: 'text', label: 'Heading' },
      columns: { control: 'number', label: 'Columns', min: 1, max: 6 },
      radius: { control: 'number', label: 'Corner radius', min: 0, max: 28, suffix: 'px' },
    },
    render: (p, _children, data) => {
      const stores = Array.isArray(data) ? data : [];
      const cols = Math.min(Math.max(Number(p.columns) || 3, 1), 6);
      return (
        <section className="stores2">
          <div className="stores2-head">
            <h2>{p.heading || 'All stores'}</h2>
            <span className="stores2-count">{stores.length} listed</span>
          </div>
          {stores.length === 0 ? (
            <p className="stores2-empty">No stores available right now.</p>
          ) : (
            <div
              className="stores2-grid"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                '--card-radius': `${Number(p.radius) || 12}px`,
              }}
            >
              {stores.map((s, i) => <StoreCard key={s.id} store={s} index={i} />)}
            </div>
          )}
        </section>
      );
    },
  },

  // Store detail header — bound to the store object.
  StoreHeader: {
    bindable: true,
    props: {
      showRating: { control: 'boolean', label: 'Show rating' },
      showDelivery: { control: 'boolean', label: 'Show delivery time' },
      backLabel: { control: 'text', label: 'Back link text' },
    },
    render: (p, _children, data) => <StoreHeader store={data} {...p} />,
  },

  // Menu / catalogue — bound to { store, sections }. Layout is a prop
  // (sidebar | center), so the same data can be re-laid-out without a fork.
  // The marketplace rules (closed store, unavailable products, single-merchant
  // cart) live inside the component and hold regardless of layout.
  Catalogue: {
    bindable: true,
    props: {
      layout: { control: 'select', label: 'Category layout', options: [{ value: 'sidebar', label: 'Sidebar' }, { value: 'center', label: 'Centered pills' }] },
      showImages: { control: 'boolean', label: 'Show item images' },
    },
    render: (p, _children, data) => (
      <Catalogue store={data?.store} sections={data?.sections || []} layout={p.layout || 'sidebar'} showImages={p.showImages !== false} />
    ),
  },

  // Hero with a real 3D backdrop. Registered (so it's a draggable layer) but
  // the scene itself is lazy-loaded and its internals aren't exposed — only the
  // knobs a non-dev would turn. A calm, on-brand alternative to the flat Hero.
  // The way in. Registered so the copy is editable without a rebuild — and so a
  // tenant can delete the node outright, which is the most important control of
  // all for an intro nobody asked for.
  EntrySequence: {
    props: {
      lines: { control: 'textarea', label: 'Lines' },
      enabled: { control: 'boolean', label: 'Show on load' },
      skipLabel: { control: 'text', label: 'Skip button' },
    },
    // Authored as one textarea, one line per line of copy — a non-technical
    // person should never be asked to type a JSON array.
    render: (p) => <EntrySequence {...p} lines={typeof p.lines === 'string' ? p.lines.split('\n') : p.lines} />,
  },

  Hero3D: {
    props: {
      eyebrow: { control: 'text', label: 'Eyebrow' },
      title: { control: 'textarea', label: 'Title' },
      subtitle: { control: 'textarea', label: 'Subtitle' },
      searchPlaceholder: { control: 'text', label: 'Search placeholder' },
      accent: { control: 'color', label: 'Accent colour' },
      motion: { control: 'boolean', label: 'Animate' },
      density: { control: 'number', label: 'Object count', min: 4, max: 24 },
    },
    render: (p) => <Hero3DSection {...p} />,
  },

  // One-page checkout + payment (SaaS marketplace clubs these into two screens;
  // we fold them into one). The interactive wiring is in the component; only
  // presentational props are editable. Bound to get_bill_breakdown so the node
  // documents its data source, though the live bill is fetched client-side from
  // the cart.
  CheckoutPanel: {
    bindable: true,
    props: {
      title: { control: 'text', label: 'Page title' },
      addressLabel: { control: 'text', label: 'Address section title' },
      paymentLabel: { control: 'text', label: 'Payment section title' },
      summaryLabel: { control: 'text', label: 'Summary title' },
      ctaLabel: { control: 'text', label: 'Place-order button' },
      allowCash: { control: 'boolean', label: 'Allow cash on delivery' },
      allowWallet: { control: 'boolean', label: 'Allow wallet' },
    },
    render: (p) => <CheckoutPanel {...p} />,
  },

  // Standalone itemized bill — the same presentational bill the checkout uses,
  // placeable on its own (e.g. an order-summary block). Binds to a bill object.
  BillBreakdown: {
    bindable: true,
    props: {
      totalLabel: { control: 'text', label: 'Total row label' },
      showTotal: { control: 'boolean', label: 'Show total row' },
    },
    render: (p, _children, data) => (
      <BillLines bill={data && data.lines ? data : null} totalLabel={p.totalLabel || 'To pay'} showTotal={p.showTotal !== false} />
    ),
  },

  // THE ESCAPE HATCH THAT KEEPS THE TREE FROM BEING A CEILING.
  //
  // `component` names a real .jsx file in the tenant's own workspace
  // (components/<Name>.jsx), written by AI in the Terminal or by hand. Any React
  // is allowed there — scroll-driven animation, three.js/@react-three/fiber,
  // lighting, canvas, shaders — so a tenant is never limited to the palette
  // above. Every other prop on the node is passed straight through, so a custom
  // component can expose whatever knobs suit it and STILL be tweaked from the
  // Design panel. It renders inside the tree, so it stays selectable,
  // re-orderable, versioned and fork/rebase-able like any other node.
  Custom: {
    props: {
      component: { control: 'text', label: 'Component file' },
    },
    render: ({ component, ...rest }) => <CustomComponent component={component} {...rest} />,
  },

  // Older HTML-only hatch, kept so existing trees keep rendering.
  __code: {
    props: {},
    render: (p) => <div dangerouslySetInnerHTML={{ __html: p.__html || '' }} />,
  },
};
