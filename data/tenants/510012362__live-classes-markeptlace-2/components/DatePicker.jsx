'use client';
/**
 * DatePicker — a real calendar dropdown, replacing the browser's native
 * `<input type="date">` wherever this storefront asks a parent to pick one
 * (SubscribeScheduler's Start date and "Ends · On date" fields). The native
 * control renders completely differently per browser/OS, can't be styled to
 * match the theme, and buries "which weekdays are even selectable" behind a
 * platform picker the storefront has no say over.
 *
 * Self-contained — no imports beyond react, per this workspace's
 * no-cross-file-import rule for components/*.jsx.
 *
 * Controlled: `value`/`onChange` carry plain "YYYY-MM-DD" strings, same as
 * the native input's value, so it's a drop-in swap wherever that was used.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmt(d) {
  if (!d) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DatePicker({ label, value, onChange, min, id, disabled = false }) {
  const selected = useMemo(() => parseISO(value), [value]);
  const minDate = useMemo(() => parseISO(min) || new Date(1970, 0, 1), [min]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = selected || (minDate > new Date() ? minDate : new Date());
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const rootRef = useRef(null);
  const uid = useMemo(() => id || `dp-${Math.random().toString(36).slice(2, 8)}`, [id]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && selected) setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);

  const weeks = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startOffset = first.getDay();
    const gridStart = new Date(first);
    gridStart.setDate(1 - startOffset);
    const out = [];
    const cursor = new Date(gridStart);
    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let d = 0; d < 7; d++) {
        row.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      out.push(row);
    }
    return out;
  }, [viewMonth]);

  const pick = (d) => {
    if (d < minDate) return;
    onChange(toISO(d));
    setOpen(false);
  };

  return (
    <div className="dp-root" ref={rootRef}>
      {label && <span className="dp-label">{label}</span>}
      <button
        type="button"
        id={uid}
        className="dp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
        <span>{selected ? fmt(selected) : 'Choose a date'}</span>
      </button>

      {open && (
        <div className="dp-pop" role="dialog" aria-label="Choose a date">
          <div className="dp-nav">
            <button type="button" aria-label="Previous month" onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <span className="dp-month">{MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}</span>
            <button type="button" aria-label="Next month" onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
          <div className="dp-grid dp-dow" aria-hidden="true">
            {DAY_LETTERS.map((l, i) => <span key={i}>{l}</span>)}
          </div>
          {weeks.map((row, wi) => (
            <div className="dp-grid" key={wi}>
              {row.map((d, di) => {
                const inMonth = d.getMonth() === viewMonth.getMonth();
                const disabled = d < minDate;
                const isToday = sameDay(d, today);
                const isSel = sameDay(d, selected);
                return (
                  <button
                    type="button"
                    key={di}
                    className="dp-day"
                    data-muted={!inMonth || undefined}
                    data-today={isToday || undefined}
                    data-selected={isSel || undefined}
                    disabled={disabled}
                    onClick={() => pick(d)}
                    aria-current={isToday ? 'date' : undefined}
                    aria-selected={isSel}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <style>{css}</style>
    </div>
  );
}

const css = `
.dp-root{ position:relative; display:flex; flex-direction:column; gap:6px; font-family:var(--brand-font-body); }
.dp-label{ font-size:.78rem; font-weight:700; letter-spacing:.02em; color:var(--brand-ink-soft); text-transform:uppercase; }
.dp-trigger{
  display:flex; align-items:center; gap:8px; width:100%; text-align:left;
  padding:11px 13px; border:1px solid var(--brand-line); border-radius:var(--radius);
  background:var(--brand-surface); color:var(--brand-ink); font:inherit; font-size:.92rem; cursor:pointer;
  transition:border-color var(--motion) var(--motion-ease), background var(--motion) var(--motion-ease);
}
.dp-trigger:hover{ border-color:var(--brand-accent); }
.dp-trigger:focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
.dp-trigger svg{ flex:none; color:var(--brand-ink-soft); }
.dp-trigger:disabled{ opacity:.5; cursor:not-allowed; }

.dp-pop{
  position:absolute; z-index:40; top:calc(100% + 8px); left:0; width:288px; max-width:88vw;
  background:var(--brand-surface); border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  box-shadow:0 12px 32px color-mix(in srgb, var(--brand-ink) 18%, transparent);
  padding:12px; animation:dp-in .14s var(--motion-ease);
}
@keyframes dp-in{ from{ opacity:0; transform:translateY(-4px); } to{ opacity:1; transform:none; } }

.dp-nav{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.dp-nav button{ display:grid; place-items:center; width:28px; height:28px; border:none; border-radius:980px; background:transparent; color:var(--brand-ink); cursor:pointer; }
.dp-nav button:hover{ background:var(--brand-accent-soft); }
.dp-month{ font-weight:700; font-size:.86rem; }

.dp-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
.dp-dow{ margin-bottom:2px; }
.dp-dow span{ text-align:center; font-size:.68rem; font-weight:700; color:var(--brand-ink-soft); padding:4px 0; }

.dp-day{
  aspect-ratio:1; display:grid; place-items:center; border:none; border-radius:980px;
  background:transparent; color:var(--brand-ink); font:inherit; font-size:.82rem; cursor:pointer;
  transition:background var(--motion) var(--motion-ease), color var(--motion) var(--motion-ease);
}
.dp-day[data-muted]{ color:var(--brand-ink-soft); opacity:.4; }
.dp-day[data-today]{ box-shadow:inset 0 0 0 1.5px var(--brand-accent); }
.dp-day:hover:not(:disabled){ background:var(--brand-accent-soft); }
.dp-day[data-selected]{ background:var(--brand-accent); color:var(--brand-accent-ink); }
.dp-day:disabled{ opacity:.25; cursor:not-allowed; }
.dp-day:focus-visible{ outline:2px solid var(--brand-accent); outline-offset:1px; }

@media (prefers-reduced-motion: reduce){ .dp-pop{ animation:none; } }
`;
