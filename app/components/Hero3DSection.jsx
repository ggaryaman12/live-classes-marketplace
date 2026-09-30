'use client';
// Hero3D — a hero with a real 3D backdrop, registered so it's drag-drop
// editable in the Studio and shows up in the layer tree like any other section.
//
// Contract from the workspace rules for rich visuals:
//   • The heading/subtitle/search render IMMEDIATELY as plain DOM — the 3D
//     scene is dynamically imported and only mounts after paint, so it never
//     blocks first render and a slow GPU never delays the words.
//   • prefers-reduced-motion (and the `motion` prop) turns the animation off;
//     the scene still renders as a calm static still.
//   • Only the knobs a non-dev would touch are exposed: heading, subtitle,
//     eyebrow, accent, motion on/off, density. No camera matrix as a form field.
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const HeroScene = dynamic(() => import('./HeroScene'), { ssr: false, loading: () => null });

export default function Hero3DSection({
  eyebrow = '',
  title = 'Everything you need,\nnearby.',
  subtitle = 'Groceries, meals and more — delivered from stores around you.',
  searchPlaceholder = 'Search stores and dishes…',
  accent = '#14532D',
  motion = true,
  density = 11,
}) {
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Mount the scene only after first paint so the copy never waits on WebGL.
    const id = requestAnimationFrame(() => setMounted(true));
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync(); mq.addEventListener?.('change', sync);
    return () => { cancelAnimationFrame(id); mq.removeEventListener?.('change', sync); };
  }, []);

  const animate = motion && !reduced;

  return (
    <section className="hero3">
      <div className="hero3-scene" aria-hidden="true">
        {mounted && <HeroScene accent={accent} motion={animate} density={density} />}
      </div>
      <div className="hero3-veil" aria-hidden="true" />
      <div className="hero3-inner">
        {eyebrow && <div className="hero3-eyebrow">{eyebrow}</div>}
        <h1 className="hero3-title" dangerouslySetInnerHTML={{ __html: (title || '').replace(/\n/g, '<br/>') }} />
        {subtitle && <p className="hero3-sub">{subtitle}</p>}
        <div className="hero3-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input placeholder={searchPlaceholder} aria-label="Search" />
        </div>
      </div>
    </section>
  );
}
