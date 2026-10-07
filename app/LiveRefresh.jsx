'use client';
// Preview bridge between the storefront and the Studio.
//
// 1. Live refresh — the storefront renders on the server from the component
//    tree, so a tree edit doesn't reach an already-rendered page on its own.
//    The Studio posts `yelo:refresh` and we call router.refresh(): Next
//    re-fetches the server components and reconciles them into the existing DOM
//    (no flash, no scroll jump, no lost client state).
//
// 2. Click-to-select — the Studio can turn on "select mode"; then hovering a
//    section highlights it and clicking posts its node id back. The highlight is
//    a FLOATING OVERLAY, not an outline on the node: the node wrapper uses
//    display:contents (so it doesn't affect layout) and therefore has no box of
//    its own — an outline on it is invisible and getBoundingClientRect is zero.
//    We compute the real bounds from the wrapper's child elements and position a
//    fixed overlay there, which works for every component.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { unionBounds } from './lib/selectBounds';
import contract from './lib/tokenContract.json';

// The closed contract, as a lookup. A message naming anything outside it is
// ignored rather than applied: the Studio and the storefront must agree on the
// same fourteen names, and silently honouring a fifteenth would let a token that
// themes nothing on disk appear to work in the preview.
const TOKEN_NAMES = new Set(contract.TOKEN_CONTRACT);

export default function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let selectMode = false;
    let overlay = null;
    let revealTimer = null;   // clears the transient "here it is" flash after a reveal

    function ensureOverlay() {
      if (overlay) return overlay;
      overlay = document.createElement('div');
      // Calmer, Figma-like: a thin outline that eases between sections rather
      // than a thick filled box snapping around on every hover.
      overlay.style.cssText =
        'position:fixed;z-index:2147483000;pointer-events:none;border:1.5px solid #4FA8FF;' +
        'border-radius:6px;background:rgba(79,168,255,0.06);box-shadow:0 0 0 1px rgba(79,168,255,.15);' +
        'transition:top .12s ease,left .12s ease,width .12s ease,height .12s ease,opacity .12s ease;display:none';
      document.body.appendChild(overlay);
      return overlay;
    }

    // THE SECTION UNDER THE CURSOR — a top-level child of the page, not the
    // deepest node AND not the whole page.
    //
    // The tree renders as: <main> → [root node] → [section] → … → [leaf]. Two
    // wrong answers to avoid:
    //   • `.closest('[data-node-id]')` returns the DEEPEST node, so hovering a
    //     button highlighted the button — a box flickering on everything.
    //   • climbing to the OUTERMOST node returns the ROOT — the whole page — so
    //     everything got selected at once (the bug just reported).
    // The right answer is the node ONE LEVEL INSIDE the root: the section. So we
    // collect the [data-node-id] ancestors from the cursor up to (not including)
    // the root, and take the highest of those. If the cursor is on the root
    // itself with no section between, there is nothing to select.
    function nodeChain(el) {
      const chain = [];
      let n = el && el.closest ? el.closest('[data-node-id]') : null;
      while (n) {
        chain.push(n);                              // [deepest … outermost]
        const parent = n.parentElement;
        n = parent && parent.closest ? parent.closest('[data-node-id]') : null;
      }
      return chain;
    }
    function wrapperAt(el) {
      const chain = nodeChain(el);
      if (chain.length === 0) return null;
      if (chain.length === 1) return chain[0];       // only the root exists here
      // chain[last] is the root (whole page); the section is the one just inside
      // it — chain[last - 1].
      return chain[chain.length - 2];
    }

    // Real bounds of a display:contents wrapper = union of its element children.
    // The geometry lives in ./lib/selectBounds (pure + unit-tested); here we only
    // collect the DOM rects and hand them over.
    function boundsOf(el) {
      const self = el.getBoundingClientRect();
      const children = [];
      for (const c of el.querySelectorAll('*')) children.push(c.getBoundingClientRect());
      return unionBounds(self, children);
    }

    // The FIRST descendant with a real box. The node wrapper is display:contents
    // (no box), so scrollIntoView on it does nothing — scroll this instead. Falls
    // back to the wrapper itself if somehow nothing has a box.
    function firstBoxChild(el) {
      for (const c of el.querySelectorAll('*')) {
        const r = c.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return c;
      }
      return el;
    }

    function highlight(el) {
      const o = ensureOverlay();
      if (!el) { o.style.display = 'none'; return; }
      const b = boundsOf(el);
      o.style.display = 'block';
      o.style.top = `${b.top}px`;
      o.style.left = `${b.left}px`;
      o.style.width = `${b.width}px`;
      o.style.height = `${b.height}px`;
    }

    // Only repaint when the hovered SECTION changes, not on every pixel of
    // movement within the same section — that constant re-drawing is half of
    // what made it feel jittery.
    let hovered = null;
    function onMove(e) {
      if (!selectMode) return;
      const el = wrapperAt(e.target);
      if (el === hovered) return;
      hovered = el;
      highlight(el);
    }
    function onClick(e) {
      if (!selectMode) return;
      // A click meant to EDIT text (double-click, or a click while already
      // editing) must not be hijacked into a section selection.
      if (editing) return;
      const el = wrapperAt(e.target);
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      // Send the node id AND its on-screen bounds + type, so the Studio can draw
      // a floating "Ask AI" toolbar over the exact element (Instant-style).
      const b = boundsOf(el);
      try {
        window.parent?.postMessage({
          type: 'yelo:selected',
          id: el.getAttribute('data-node-id'),
          nodeType: el.getAttribute('data-node-type') || null,
          bounds: { top: b.top, left: b.left, width: b.width, height: b.height },
        }, '*');
      } catch {}
    }

    function onMessage(e) {
      const d = e?.data;
      if (d === 'yelo:refresh' || d?.type === 'yelo:refresh') { router.refresh(); return; }
      if (d?.type === 'yelo:select-mode') {
        selectMode = !!d.on;
        document.body.style.cursor = selectMode ? 'crosshair' : '';
        if (!selectMode) { hovered = null; highlight(null); }
        return;
      }
      if (d?.type === 'yelo:highlight') {
        const el = d.id ? document.querySelector(`[data-node-id="${CSS.escape(d.id)}"]`) : null;
        highlight(el);
        return;
      }
      // REVEAL — "take me to what you just built". Scroll the node into view, then
      // flash the highlight box for a moment so the eye lands on it, then clear it
      // (unlike select-mode highlight, this is transient). This is what the Studio
      // fires after a build so the preview jumps to the new section.
      if (d?.type === 'yelo:reveal') {
        const el = d.id ? document.querySelector(`[data-node-id="${CSS.escape(d.id)}"]`) : null;
        if (el) {
          // SCROLL A REAL BOX, NOT THE WRAPPER. The node wrapper is
          // display:contents (see the select-overlay note above) — it has NO box
          // of its own, so scrollIntoView on IT does nothing and the page never
          // moves. Scroll the first child element that actually has a box; that is
          // the top of the section. (This was the bug: it navigated to the page
          // but never scrolled, and the highlight ended up below the fold.)
          const scrollTarget = firstBoxChild(el);
          try { scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          catch { try { scrollTarget.scrollIntoView(); } catch {} }
          highlight(el);
          clearTimeout(revealTimer);
          revealTimer = setTimeout(() => { if (!selectMode) highlight(null); }, 2600);
          // ACK so the Studio stops re-trying. This matters for a CROSS-PAGE
          // reveal: the preview may still be navigating to the built page when the
          // Studio first fires, so it keeps trying on each load — the ack is the
          // signal that the node was actually found here and scrolled to.
          try { window.parent?.postMessage({ type: 'yelo:revealed', id: d.id }, '*'); } catch {}
        }
        return;
      }
      // LIVE THEME. Set the custom property straight onto :root so dragging a
      // colour repaints instantly. Nothing is written to disk here and no
      // rebuild happens — the Studio saves tokens.css only when the control is
      // released. Writing per keystroke would trip the file watcher and queue a
      // full preview rebuild for every pixel of a colour picker.
      //
      // Because globals.css derives all of its chrome from these names, setting
      // one property here repaints the header, nav, cart and checkout together —
      // which is the entire point of the contract.
      if (d?.type === 'yelo:token') {
        if (!TOKEN_NAMES.has(d.name)) return;      // closed set; ignore anything else
        const root = document.documentElement;
        if (d.value === null || d.value === undefined || d.value === '') root.style.removeProperty(`--${d.name}`);
        else root.style.setProperty(`--${d.name}`, String(d.value));
        return;
      }
      // Drop the inline overrides and fall back to the stylesheet — used after a
      // save, so what is on screen is what is actually on disk rather than a
      // preview-only tweak that would silently outlive it.
      if (d?.type === 'yelo:token-reset') {
        const root = document.documentElement;
        for (const n of TOKEN_NAMES) root.style.removeProperty(`--${n}`);
      }
    }

    // ---- INLINE TEXT EDITING -------------------------------------------------
    // Click any hard-coded heading/label and edit it right there: no dialog, no
    // side-panel input. We make just that element contenteditable, remember the
    // text we started from, and on blur (or Enter) hand { nodeId, oldText,
    // newText } to the Studio, which resolves WHICH PROP held that text and
    // commits it. Escape restores the original.
    let editing = null;   // { el, before, nodeId }

    // Only leaf-ish text elements — never a whole section, or the user would be
    // editing markup instead of a sentence.
    // CONTENT text only — never interactive controls.
    //
    // This list used to include BUTTON, A and LI. That silently broke the
    // storefront: every "ADD" button and category chip is a <button> whose label is
    // leaf text, so the capture-phase handler below claimed it as "editable",
    // called preventDefault + stopPropagation, and React's own onClick never
    // fired. Add-to-cart and category switching looked completely dead while being
    // perfectly hydrated. Editing a label is worth far less than the button working.
    const TEXT_TAGS = /^(H1|H2|H3|H4|H5|H6|P|SPAN|STRONG|EM|SMALL|DIV|TD|TH)$/;
    // Anything inside these is off limits, whatever its tag.
    const INTERACTIVE = 'a,button,[role="button"],[role="link"],input,textarea,select,label,summary,[contenteditable="true"],[onclick]';
    function editableTextAt(el) {
      if (!el || !el.closest) return null;
      const wrap = el.closest('[data-node-id]');
      if (!wrap) return null;
      let node = el;
      while (node && node !== wrap) {
        const onlyText = node.children.length === 0 && node.textContent.trim().length > 0;
        if (onlyText && TEXT_TAGS.test(node.tagName) && !node.closest(INTERACTIVE)) {
          return { el: node, nodeId: wrap.getAttribute('data-node-id') };
        }
        node = node.parentElement;
      }
      return null;
    }

    function commitEdit(save = true) {
      if (!editing) return;
      const { el, before, nodeId } = editing;
      editing = null;
      el.contentEditable = 'false';
      el.classList.remove('yelo-editing');
      const after = el.textContent.replace(/\s+/g, ' ').trim();
      if (!save || after === before || !after) { el.textContent = before; return; }
      try {
        window.parent?.postMessage({ type: 'yelo:text-edit', id: nodeId, oldText: before, newText: after }, '*');
      } catch {}
    }

    function startEdit(target) {
      const hit = editableTextAt(target);
      if (!hit) return false;
      if (editing && editing.el === hit.el) return true;
      commitEdit(true);                       // finish any previous edit first
      const before = hit.el.textContent.replace(/\s+/g, ' ').trim();
      editing = { el: hit.el, before, nodeId: hit.nodeId };
      hit.el.contentEditable = 'true';
      hit.el.classList.add('yelo-editing');
      hit.el.focus();
      // put the caret where they clicked rather than selecting everything
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount === 0) {
          const r = document.createRange(); r.selectNodeContents(hit.el); r.collapse(false); sel.addRange(r);
        }
      } catch {}
      return true;
    }

    function onEditClick(e) {
      // SELECT MODE IS ALWAYS ON NOW (Figma/Canva style), so text editing can no
      // longer wait for select mode to be OFF. The rule instead:
      //   • single click  -> select the section (handled by onClick below)
      //   • double click   -> edit the text under the cursor
      // So in select mode we ONLY act on a double-click (e.type === 'dblclick').
      // Outside select mode, a single click still edits, as before.
      if (selectMode && e.type !== 'dblclick') return;
      // NEVER intercept a real control. If the click landed on (or inside) a
      // button/link/input, the storefront's own handler must win — that is the
      // product working, which outranks editing its label.
      if (e.target.closest && e.target.closest(INTERACTIVE)) return;
      const hit = editableTextAt(e.target);
      if (!hit) return;
      e.preventDefault(); e.stopPropagation();
      startEdit(e.target);
    }
    function onEditKey(e) {
      if (!editing) return;
      if (e.key === 'Escape') { e.preventDefault(); commitEdit(false); }
      // Enter commits for single-line text; Shift+Enter still inserts a break.
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(true); }
    }
    function onEditBlur(e) { if (editing && e.target === editing.el) commitEdit(true); }

    // Minimal affordance so editable text feels editable.
    const style = document.createElement('style');
    style.textContent =
      '[data-node-id] h1,[data-node-id] h2,[data-node-id] h3,[data-node-id] p{cursor:text}' +
      '[data-node-id] a,[data-node-id] button{cursor:pointer}' +
      '.yelo-editing{outline:2px solid #4FA8FF;outline-offset:3px;border-radius:3px;background:rgba(79,168,255,.06)}';
    document.head.appendChild(style);

    window.addEventListener('dblclick', onEditClick, true);
    window.addEventListener('click', onEditClick, true);
    window.addEventListener('keydown', onEditKey, true);
    window.addEventListener('blur', onEditBlur, true);

    window.addEventListener('message', onMessage);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('scroll', () => { if (selectMode) highlight(null); }, true);
    try { window.parent?.postMessage('yelo:preview-ready', '*'); } catch {}
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('dblclick', onEditClick, true);
      window.removeEventListener('click', onEditClick, true);
      window.removeEventListener('keydown', onEditKey, true);
      window.removeEventListener('blur', onEditBlur, true);
      try { style.remove(); } catch {}
      if (overlay) overlay.remove();
    };
  }, [router]);

  return null;
}
