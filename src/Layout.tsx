import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from './store/useStore';
import './App.css';

const DECOR = ['#ffb3c6', '#a0e7c8', '#c9b8ff', '#ffe08a', '#8fd3ff', '#ffa8d2'];

export function Layout() {
  const init = useStore((s) => s.init);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    init();
  }, [init]);

  useGSAP(
    () => {
      // Floating background beads drift gently, forever.
      gsap.utils.toArray<HTMLElement>('.decor-bead').forEach((el, i) => {
        gsap.to(el, {
          y: `+=${18 + (i % 3) * 8}`,
          x: `+=${(i % 2 ? -1 : 1) * 10}`,
          rotation: (i % 2 ? -1 : 1) * 18,
          duration: 3 + (i % 4) * 0.6,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      });
    },
    { scope: root, dependencies: [] },
  );

  return (
    <div className="layout-root" ref={root}>
      <div className="decor-layer" aria-hidden>
        {DECOR.map((c, i) => (
          <span
            key={i}
            className="decor-bead"
            style={{
              background: c,
              left: `${(i * 17 + 6) % 92}%`,
              top: `${(i * 29 + 10) % 80}%`,
              width: 26 + (i % 3) * 14,
              height: 26 + (i % 3) * 14,
            }}
          />
        ))}
      </div>

      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
