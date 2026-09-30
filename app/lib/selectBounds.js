// Pure geometry for the click-to-select overlay. Extracted from LiveRefresh so
// the exact rule the BROWSER depends on is unit-testable without a DOM.
//
// The browser bug this pins: every node is wrapped in a div with
// display:contents (so it never affects layout). Such a wrapper has NO box of
// its own — getBoundingClientRect returns width/height 0 — so an outline on it
// is invisible and a naive highlight sits at 0,0 with no size. Nothing looked
// selectable even though clicks registered.
//
// The fix, as pure math: if the wrapper's own rect has real size, use it.
// Otherwise the wrapper's true visual box is the UNION of its element children's
// rects. unionBounds() is that decision, isolated from the DOM.
//
// A rect here is { top, left, right, bottom } (viewport coords, as
// getBoundingClientRect gives). The result is { top, left, width, height },
// ready to drop onto a position:fixed overlay.
// ESM exports on purpose. This file is imported by LiveRefresh, a 'use client'
// component mounted in the ROOT LAYOUT. When it used `module.exports` (CommonJS),
// the named ESM import in that client bundle failed interop — the module broke,
// and a broken client module in the root layout killed hydration for the ENTIRE
// preview. Symptoms were baffling and wide: inline text editing dead,
// click-to-select dead ("Select on page selects nothing"), custom sections stuck,
// even the unrelated Sign-in button inert — while SSR HTML looked perfect.
export function rectSize(r) {
  const w = (r.width != null) ? r.width : (r.right - r.left);
  const h = (r.height != null) ? r.height : (r.bottom - r.top);
  return { w, h };
}

export function unionBounds(selfRect, childRects) {
  // Wrapper has a real box → trust it.
  const s = rectSize(selfRect || { top: 0, left: 0, right: 0, bottom: 0 });
  if (s.w > 0 && s.h > 0) {
    return { top: selfRect.top, left: selfRect.left, width: s.w, height: s.h };
  }
  // Zero-box wrapper (display:contents) → union of visible children.
  let box = null;
  for (const cr of (childRects || [])) {
    const cs = rectSize(cr);
    if (cs.w > 0 && cs.h > 0) {
      box = box
        ? { top: Math.min(box.top, cr.top), left: Math.min(box.left, cr.left),
            right: Math.max(box.right, cr.right), bottom: Math.max(box.bottom, cr.bottom) }
        : { top: cr.top, left: cr.left, right: cr.right, bottom: cr.bottom };
    }
  }
  if (box) return { top: box.top, left: box.left, width: box.right - box.left, height: box.bottom - box.top };
  // Nothing measurable — fall back to the (empty) self rect so callers can hide.
  return { top: (selfRect && selfRect.top) || 0, left: (selfRect && selfRect.left) || 0, width: 0, height: 0 };
}
