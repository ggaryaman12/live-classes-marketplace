'use client';
// LIGHT · DARK · SYSTEM.
//
// The storefront carries two token sets — light on :root, dark under
// [data-theme="dark"] — and this is the control that picks between them.
//
// THREE STATES, NOT TWO. "System" is the default and it is not the same as
// light: it means "follow the device", which is what most people actually
// want and what a two-way toggle silently takes away. Someone whose phone
// flips to dark at sunset should not have to come back and flip this too.
//
// SET BEFORE FIRST PAINT, or the page flashes. The stored choice is applied by
// a tiny inline script in the document head (see layout.jsx) that runs before
// React hydrates — without it a dark-mode visitor gets a white flash on every
// navigation, which is the single most common way this feature is done badly.
//
// The choice is per-visitor and lives in localStorage. It is not a token: the
// storefront owner picks the palettes, the visitor picks which one they see.
import { useEffect, useState } from 'react';

const KEY = 'yelo-theme';
const MODES = [
  { id: 'light', label: 'Light', glyph: '☀' },
  { id: 'dark', label: 'Dark', glyph: '☾' },
  { id: 'system', label: 'System', glyph: '◐' },
];

export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

export default function ThemeSwitch({ hasDark = true }) {
  const [mode, setMode] = useState(null);   // null until we know, to avoid a flash

  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    setMode(MODES.some((m) => m.id === saved) ? saved : 'system');
  }, []);

  useEffect(() => {
    if (!mode) return;
    applyTheme(mode);
    try { localStorage.setItem(KEY, mode); } catch {}
  }, [mode]);

  // A storefront whose direction is light-only has nothing to switch to, and a
  // control that changes nothing is worse than no control.
  if (!hasDark || !mode) return null;

  return (
    <div className="ts" role="group" aria-label="Colour theme">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`ts-b ${mode === m.id ? 'on' : ''}`}
          onClick={() => setMode(m.id)}
          aria-pressed={mode === m.id}
          title={`${m.label} theme`}
        >
          <span aria-hidden="true">{m.glyph}</span>
          <span className="ts-l">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
