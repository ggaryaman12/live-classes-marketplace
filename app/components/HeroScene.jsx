'use client';
// The 3D backdrop for Hero3D — dynamically imported by Hero3D so three.js is
// never in the initial bundle and never blocks first paint.
//
// Restraint on purpose: a slow-drifting cluster of rounded parcels in the
// brand's own greens and paper tones, softly lit like a studio still — premium
// and quiet, not a gaudy particle storm. It reads as "market" without a
// gradient hero. One authored moment: the cluster breathes and answers the
// pointer with a gentle parallax; everything eases, nothing snaps.
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useRef, useMemo } from 'react';

// Deterministic pseudo-random so the layout is stable across renders.
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function Parcels({ count, accent, motion }) {
  const group = useRef();
  const pointer = useRef({ x: 0, y: 0 });

  const items = useMemo(() => {
    const r = rng(7);
    const palette = [accent, '#1C6B3C', '#EEF5F0', '#F2B84B', '#FCFCFA'];
    return Array.from({ length: count }, (_, i) => ({
      pos: [(r() - 0.5) * 7, (r() - 0.5) * 4.2, (r() - 0.5) * 3.5],
      size: 0.5 + r() * 0.9,
      color: palette[i % palette.length],
      spin: 0.1 + r() * 0.25,
      phase: r() * Math.PI * 2,
      rot: [r() * Math.PI, r() * Math.PI, r() * Math.PI],
    }));
  }, [count, accent]);

  useFrame((state, dt) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    // pointer parallax, eased toward the target so it never snaps
    const px = (state.pointer.x || 0) * 0.35;
    const py = (state.pointer.y || 0) * 0.25;
    pointer.current.x += (px - pointer.current.x) * Math.min(1, dt * 3);
    pointer.current.y += (py - pointer.current.y) * Math.min(1, dt * 3);
    group.current.rotation.y = pointer.current.x + (motion ? t * 0.04 : 0);
    group.current.rotation.x = -pointer.current.y;
    if (motion) {
      group.current.children.forEach((m, i) => {
        const it = items[i];
        m.position.y = it.pos[1] + Math.sin(t * it.spin + it.phase) * 0.25;   // gentle breathe
        m.rotation.x = it.rot[0] + t * it.spin * 0.3;
        m.rotation.z = it.rot[2] + t * it.spin * 0.2;
      });
    }
  });

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <RoundedBox key={i} args={[it.size, it.size, it.size]} radius={it.size * 0.16} smoothness={3} position={it.pos} rotation={it.rot}>
          <meshStandardMaterial color={it.color} roughness={0.55} metalness={0.05} />
        </RoundedBox>
      ))}
    </group>
  );
}

export default function HeroScene({ accent = '#14532D', motion = true, density = 11 }) {
  const count = Math.max(4, Math.min(Number(density) || 11, 24));
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 8], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      style={{ pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 6, 5]} intensity={1.1} />
      <directionalLight position={[-6, -2, 2]} intensity={0.35} color="#EEF5F0" />
      <Parcels count={count} accent={accent} motion={motion} />
    </Canvas>
  );
}
