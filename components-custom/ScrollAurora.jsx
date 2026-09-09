'use client';
// Scroll-driven aurora — REAL code written into the tenant's own workspace, proof
// the component-JSON tree is an addressing layer and not a ceiling. Nothing here
// fits the built-in palette; it doesn't have to.
import { useEffect, useRef } from 'react';

export default function ScrollAurora({ heading = 'Fresh, every single day', hue = 'teal', height = 460 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, 1 - r.top / window.innerHeight));
        el.style.setProperty('--p', String(p));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);

  const c = hue === 'violet' ? ['#7c3aed', '#f472b6'] : ['#0f766e', '#22d3ee'];
  return (
    <section ref={ref} data-aurora style={{ position: 'relative', minHeight: height, display: 'grid', placeItems: 'center', padding: '96px 24px', overflow: 'hidden', background: '#05070c' }}>
      <div aria-hidden style={{
        position: 'absolute', inset: '-30%', filter: 'blur(60px)', willChange: 'transform',
        background: `radial-gradient(45% 45% at calc(18% + var(--p,0) * 58%) calc(28% + var(--p,0) * 44%), ${c[1]}70, transparent 70%), radial-gradient(50% 50% at calc(82% - var(--p,0) * 48%) calc(72% - var(--p,0) * 48%), ${c[0]}60, transparent 70%)`,
      }} />
      <h2 style={{ position: 'relative', margin: 0, textAlign: 'center', color: '#f8fafc', fontSize: 'clamp(30px, 5vw, 58px)', lineHeight: 1.05, letterSpacing: '-0.03em', transform: 'translateY(calc(var(--p,0) * -16px))' }}>
        {heading}
      </h2>
    </section>
  );
}
