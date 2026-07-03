import { useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { PaletteManager } from '../components/PaletteManager';

export function LibraryPage() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(
        '.lib-head',
        { y: 20, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.5, ease: 'back.out(1.6)' },
      );
      gsap.fromTo(
        '.palette-manager',
        { y: 24, autoAlpha: 0, scale: 0.96 },
        { y: 0, autoAlpha: 1, scale: 1, duration: 0.55, delay: 0.1, ease: 'back.out(1.6)' },
      );
    },
    { scope: root, dependencies: [] },
  );

  return (
    <div className="library" ref={root}>
      <div className="lib-head">
        <div>
          <h1>🧺 我的豆库</h1>
          <p>管理色卡，挑好的豆会用在「仅选中豆」图纸里。</p>
        </div>
        <Link to="/" className="btn-back">
          ← 回工作台
        </Link>
      </div>
      <PaletteManager />
    </div>
  );
}
