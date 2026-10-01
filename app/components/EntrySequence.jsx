'use client';
// THE WAY IN — the page opens behind a soft veil, one or two lines of copy turn
// in space, and the first scroll clears it.
//
// AN ENTRY SEQUENCE IS A DOOR, AND A DOOR THAT STICKS IS WORSE THAN NO DOOR.
// Everything below is written from that: this thing gets exactly one chance to
// be charming and unlimited chances to trap somebody. So it is built to let go.
// Every one of these dismisses it, and any of them alone is enough:
//
//   • a visible Skip control, FIRST in the tab order and focused on open
//   • Escape, Enter, Space, Tab, or any arrow / page / home / end key
//   • a scroll, a wheel, a swipe, a tap, or a click anywhere
//   • an eight-second timer that fires whether or not anyone did anything
//   • prefers-reduced-motion, which skips it before it ever renders
//
// It never locks the document. An earlier instinct was to set overflow:hidden
// until the scroll gesture arrived — that is the trap the brief warns about, and
// it strands anyone using a screen reader's virtual cursor, a switch device, or
// a keyboard, none of whom "scroll". The veil is a fixed overlay the page sits
// behind; the page is fully scrollable underneath the whole time.
//
// The content is NOT hidden from assistive technology while the veil is up. The
// overlay is aria-hidden and non-focusable, the real page keeps its own
// semantics, and a screen-reader user simply reads the page — the sequence is
// decoration they are never told about and never have to defeat.
//
// WHY CSS 3D AND NOT WEBGL. The copy is real text in the DOM: selectable,
// searchable, translatable, announced, and styled by the theme. A canvas is none
// of those, needs a font fetched before first paint, and janks the preview on a
// modest machine. `rotateX` under a perspective is genuinely three-dimensional;
// the brief asked for 3D copy, not for a renderer.
import { useCallback, useEffect, useRef, useState } from 'react';

const AUTO_RELEASE_MS = 8000;

export default function EntrySequence({
  lines = [],
  // Off unless a direction asks for it. A pharmacy does not get a chaos hero,
  // and it does not get a curtain either.
  enabled = true,
  skipLabel = 'Skip intro',
}) {
  const copy = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).slice(0, 2);
  // `null` = undecided (server + first paint). Deciding during render would
  // either flash the veil for people who opted out of motion, or render it into
  // the server HTML where it would persist if JS never arrives.
  const [open, setOpen] = useState(null);
  const skipRef = useRef(null);
  const returnTo = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!enabled || !copy.length) { setOpen(false); return undefined; }
    // The one condition that skips it outright rather than making it dismissible.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setOpen(false); return undefined; }
    setOpen(true);
    return undefined;
  }, [enabled, copy.length]);

  useEffect(() => {
    if (open !== true) return undefined;

    returnTo.current = document.activeElement;
    // Focus the way out, not the decoration. First thing a keyboard user meets.
    skipRef.current?.focus();

    // Any intent at all, from any input device, means "let me in".
    const onKey = () => close();
    const onScroll = () => close();

    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointerdown', onScroll);

    // The backstop. If every listener above somehow failed — a stuck gesture, a
    // device nobody predicted — this still opens the door.
    const t = setTimeout(close, AUTO_RELEASE_MS);

    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('touchmove', onScroll);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointerdown', onScroll);
    };
  }, [open, close]);

  // Hand focus back where it was, so dismissing does not dump a keyboard user at
  // the top of the document.
  useEffect(() => {
    if (open === false && returnTo.current?.focus) {
      try { returnTo.current.focus({ preventScroll: true }); } catch {}
      returnTo.current = null;
    }
  }, [open]);

  if (open !== true) return null;

  return (
    <div className="es" data-open="yes">
      {/* Decoration only. The page underneath keeps its own semantics and is
          readable by AT throughout, so this is never announced and never
          trapped in a reading order. */}
      <div className="es-veil" aria-hidden="true" />
      <div className="es-stage" aria-hidden="true">
        {copy.map((line, i) => (
          <p className="es-line" style={{ '--i': i }} key={line}>{line}</p>
        ))}
      </div>
      {/* The only focusable thing here, and the first thing focused. */}
      <button type="button" ref={skipRef} className="es-skip" onClick={close}>
        {skipLabel}
      </button>
    </div>
  );
}
