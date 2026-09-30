'use client';
// THE POINTER, THEMED — a pencil for a stationer, a key for a letting agent.
//
// Driven by the `--cursor` token, so it is a property of the STOREFRONT rather
// than of any page: set once, true everywhere, including the pages the build AI
// does not own. Default is `none`, which leaves the ordinary system cursor
// alone — the right answer for a pharmacy, a clinic, or anything trust-first,
// and the reason this is opt-in rather than opt-out.
//
// WHAT IT REFUSES TO DO, and why each one matters more than the effect:
//
//   • Touch and pen — there is no cursor to theme, and a glyph chasing a tap is
//     noise. Gated on (hover: hover) and (pointer: fine), not on screen width;
//     a laptop with a touchscreen has both.
//   • prefers-reduced-motion — a lagging follower is exactly the kind of
//     continuous, unrequested movement that setting exists to stop. It does not
//     degrade to a snappier follower; it does not render at all.
//   • Hiding the real cursor before the replacement is on screen. `cursor:none`
//     is applied only after the first pointer move has positioned the glyph, and
//     is removed on unmount, on the token going away, and if the pointer leaves
//     the window. A hidden cursor with nothing in its place is a broken page.
//   • Swallowing input. The element is `pointer-events:none` and lives at the
//     top layer; it can never intercept a click meant for a control.
//   • Blocking paint. It renders nothing until the first pointermove, so it
//     costs one listener and no layout on load.
//
// Motion is transform-only and driven by rAF, so it stays on the compositor. The
// easing follows --motion, so a direction that sets --motion:0s gets a pointer
// that tracks exactly, with no trail — which is a legitimate direction, not a
// bug.
import { useEffect, useRef, useState } from 'react';

// Fine-pointer, hover-capable, and not motion-averse. All three, or nothing.
function wanted() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function ThemedCursor() {
  const dot = useRef(null);
  const raf = useRef(0);
  // Rendered only once we know we want it AND the token asks for one, so the
  // common case costs a single media-query read.
  const [glyph, setGlyph] = useState(null);

  useEffect(() => {
    if (!wanted()) return undefined;

    const read = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--cursor').trim()
        // The token is a bare glyph, but a direction may quote it.
        .replace(/^["']|["']$/g, '');
      return (!v || v === 'none' || v === 'auto' || v === 'default') ? null : v.slice(0, 8);
    };

    setGlyph(read());

    // The Studio pushes live token edits onto :root, so the pointer changes as
    // someone types the glyph rather than only after a save and a rebuild.
    const obs = new MutationObserver(() => setGlyph(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

    // Someone can turn reduced-motion on while the page is open.
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => { if (mq.matches) setGlyph(null); };
    mq.addEventListener?.('change', onMq);

    return () => { obs.disconnect(); mq.removeEventListener?.('change', onMq); };
  }, []);

  useEffect(() => {
    if (!glyph) return undefined;

    const el = dot.current;
    if (!el) return undefined;

    let x = 0; let y = 0; let tx = 0; let ty = 0;
    let shown = false;

    const css = getComputedStyle(document.documentElement);
    const motion = parseFloat(css.getPropertyValue('--motion')) || 140;
    // A duration expressed as a per-frame follow factor. 0s means "track
    // exactly", which is what a direction asking for no motion should get.
    const follow = motion <= 0 ? 1 : Math.min(1, 90 / (motion + 90));

    const tick = () => {
      tx += (x - tx) * follow;
      ty += (y - ty) * follow;
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      raf.current = requestAnimationFrame(tick);
    };

    const show = () => {
      if (shown) return;
      shown = true;
      el.style.opacity = '1';
      // ONLY NOW is the real cursor hidden — the replacement is on screen and
      // positioned. Hiding it any earlier leaves a pointerless page.
      document.documentElement.classList.add('has-themed-cursor');
    };
    const hide = () => {
      shown = false;
      el.style.opacity = '0';
      document.documentElement.classList.remove('has-themed-cursor');
    };

    const onMove = (e) => {
      x = e.clientX; y = e.clientY;
      if (!shown) { tx = x; ty = y; show(); }
      // Over a real control, step out of the way: the system cursor says
      // "clickable" better than any glyph, and that signal is worth more than
      // the effect.
      const overControl = !!(e.target.closest && e.target.closest(
        'a,button,input,textarea,select,label,summary,[role="button"],[role="link"],[contenteditable="true"]'));
      el.dataset.control = overControl ? 'yes' : 'no';
      document.documentElement.classList.toggle('has-themed-cursor', !overControl);
    };

    // A pointer that has left the window must not leave the page cursorless.
    const onLeave = () => hide();
    const onDown = () => { el.dataset.down = 'yes'; };
    const onUp = () => { el.dataset.down = 'no'; };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    raf.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      // Whatever happens, give the cursor back.
      document.documentElement.classList.remove('has-themed-cursor');
    };
  }, [glyph]);

  if (!glyph) return null;

  return (
    <div
      ref={dot}
      className="tc"
      // Decoration. It duplicates no information and must never be announced.
      aria-hidden="true"
      style={{ opacity: 0 }}
    >
      <span className="tc-glyph">{glyph}</span>
    </div>
  );
}
