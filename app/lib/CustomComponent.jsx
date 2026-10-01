'use client';
// The escape hatch that stops the component-JSON tree from being a CEILING.
//
// The tree is an ADDRESSING layer (stable ids, drag-drop, fork/rebase) — it was
// never meant to limit what a site can BE. A `Custom` node names a REAL component
// file the AI (or the tenant, in the Terminal) wrote into their own workspace:
// `components/<Name>.jsx`. Anything valid in React is allowed there — three.js,
// @react-three/fiber, canvas, shaders, scroll-driven effects — and it still
// renders inside the tree, so it stays selectable, re-orderable, versioned and
// fork/rebase-able like every other node.
//
// LOOKUP IS A STATIC REGISTRY, NOT A DYNAMIC IMPORT.
// The obvious `import('../custom/' + name)` makes the bundler build a context over
// the custom directory. Under Turbopack dev that produced a client chunk which
// failed to load, and React then could not hydrate the preview at all — silently
// killing every client effect in the storefront (inline text editing,
// click-to-select, and this loader, which sat in its loading state forever).
// app/custom/index.js is generated with plain static imports instead, so there is
// no context and nothing to fail at runtime.
import { Component } from 'react';
import { CUSTOM } from '../custom';

// ONE BROKEN SECTION MUST NOT CRASH THE WHOLE PAGE.
//
// A Custom component is arbitrary AI/tenant-written code — it can throw at
// render (a bad prop access, a null deref, a runtime error). Without a boundary
// that error bubbles to Next's page-level boundary and the ENTIRE page shows
// "This page couldn't load" — which is what took down /p/my-subscriptions over
// one faulty section. This boundary catches a throwing section and renders a
// small, honest placeholder in its place; the rest of the page stays alive. It
// serves every tenant (existing + future) and every page, automatically.
class SectionBoundary extends Component {
  constructor(props) { super(props); this.state = { caught: false, msg: '' }; }
  static getDerivedStateFromError(err) { return { caught: true, msg: String(err && err.message || err || '').slice(0, 200) }; }
  componentDidCatch() { /* the placeholder + captured message are the signal */ }
  render() {
    if (this.state.caught) {
      const name = String(this.props.name || 'this section');
      // "Fix this" hands the failure to the build AI. The broken section is
      // inside the preview iframe; the chat/agent lives in the Studio PARENT.
      // So we postMessage the parent, which routes it into the normal edit flow
      // (same handoff the canvas Ask AI uses). Guarded so a real published
      // storefront — where there is no parent Studio — simply shows no button.
      const fix = () => {
        try {
          const msg = this.state.msg ? ` The error was: ${this.state.msg}.` : '';
          window.parent?.postMessage({
            type: 'yelo:fix-section',
            component: name,
            instruction: `The "${name}" section is throwing a runtime error and was skipped on the page.${msg} Find the bug in components/${name}.jsx and fix it so the section renders.`,
          }, '*');
        } catch {}
      };
      const inStudio = typeof window !== 'undefined' && window.parent && window.parent !== window;
      return (
        <section style={{ padding: '20px', textAlign: 'center', color: '#8a94a6', fontSize: 13, lineHeight: 1.5 }}>
          <div>This section hit an error and was skipped.</div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
            The rest of the page is fine{inStudio ? '' : ` — the “${name}” section needs a fix`}.
          </div>
          {inStudio && (
            <button
              onClick={fix}
              style={{ marginTop: 12, padding: '7px 16px', borderRadius: 8, border: '1px solid #2b6546',
                background: 'rgba(120,219,165,.14)', color: '#8fe3b0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >✦ Fix this with AI</button>
          )}
        </section>
      );
    }
    return this.props.children;
  }
}

export default function CustomComponent({ component, ...props }) {
  const Comp = component ? CUSTOM[component] : null;

  if (!Comp) {
    // Never blank the page over one missing section.
    //
    // ONE-RENDER LAG, BY DESIGN: app/custom/index.js is generated while a request
    // is being served, so the very first render after a component file appears
    // still sees the previously-compiled (empty) module. Verified locally: render 1
    // lands here, renders 2+ show the real component. So the honest message is
    // "refresh", not "broken" — anything else makes a working feature look failed.
    const known = Object.keys(CUSTOM);
    return (
      <section style={{ padding: '28px 20px', textAlign: 'center', color: '#8a94a6', fontSize: 13, lineHeight: 1.55 }}>
        <div>Preparing “{String(component || '')}” — refresh the preview to see it.</div>
        {known.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>Ready now: {known.join(', ')}.</div>
        )}
        {known.length === 0 && (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            If this persists, add <code>components/{String(component || 'MySection')}.jsx</code> in the Terminal.
          </div>
        )}
      </section>
    );
  }
  return (
    <SectionBoundary name={component}>
      <Comp {...props} />
    </SectionBoundary>
  );
}
