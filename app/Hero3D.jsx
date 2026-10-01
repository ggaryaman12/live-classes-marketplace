'use client';

// 3D hero art — a floating shopping bag that reacts to scroll.
// Kept self-contained: bag is built from primitives (no .glb file), so an
// agent can restyle it by tweaking the tokens right below.
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox, Environment } from '@react-three/drei';
import { useRef, useEffect } from 'react';

// --- restyle tokens (change these to recolor / resize the bag) ---
const BRAND = '#FF5A3C';
const BRAND_2 = '#FF8A5B';
const TWO_PI = Math.PI * 2;

// Shared scroll progress (0 at top of page → 1 after one hero-height of
// scroll). Held in a ref read inside useFrame, so scrolling never triggers a
// React re-render — the animation runs entirely on the GL loop.
function useScrollProgress() {
  const ref = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const h = window.innerHeight || 1;
      ref.current = Math.min(1, Math.max(0, window.scrollY / h));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return ref;
}

function ShoppingBag({ progress }) {
  const group = useRef(null);

  useFrame((state, delta) => {
    if (!group.current) return;
    const p = progress.current;
    // Idle slow auto-rotate (elapsed time) plus a full spin driven by scroll.
    group.current.rotation.y = state.clock.elapsedTime * 0.4 + p * TWO_PI;
    // Subtle tilt on scroll.
    group.current.rotation.x = -0.08 + p * 0.5;
    // Gentle vertical float.
    group.current.position.y = Math.sin(state.clock.elapsedTime * 1.2) * 0.08;

    // Camera pulls back as you scroll down the hero.
    state.camera.position.z += ((5 + p * 2) - state.camera.position.z) * 0.08;
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={group} scale={1.15}>
      {/* Bag body */}
      <RoundedBox args={[1.6, 1.9, 1.0]} radius={0.12} smoothness={4} castShadow>
        <meshStandardMaterial color={BRAND} roughness={0.28} metalness={0.15} />
      </RoundedBox>

      {/* Front panel accent (the "market·" face) */}
      <mesh position={[0, 0.05, 0.51]}>
        <planeGeometry args={[1.15, 1.3]} />
        <meshStandardMaterial
          color={BRAND_2}
          roughness={0.35}
          emissive={BRAND_2}
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Two handles */}
      <mesh position={[-0.4, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.06, 16, 48, Math.PI]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
      <mesh position={[0.4, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.06, 16, 48, Math.PI]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
    </group>
  );
}

export default function Hero3D() {
  const progress = useScrollProgress();

  return (
    <div className="hero-art" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 5]} intensity={1.4} castShadow />
        <pointLight position={[-4, -2, 3]} intensity={0.6} color={BRAND_2} />
        <ShoppingBag progress={progress} />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
