import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Upload } from '../components/Upload';
import { ImageEditor } from '../components/ImageEditor';
import { Controls } from '../components/Controls';
import { PatternView } from '../components/PatternView';
import { EditToolbar } from '../components/EditToolbar';
import { PaintPalette } from '../components/PaintPalette';
import { useStore } from '../store/useStore';

export function StudioPage() {
  const root = useRef<HTMLDivElement>(null);
  const fullResult = useStore((s) => s.fullResult);
  const selectedResult = useStore((s) => s.selectedResult);
  const palettes = useStore((s) => s.palettes);
  const activeId = useStore((s) => s.activePaletteId);
  const setActive = useStore((s) => s.setActivePalette);
  const editingTarget = useStore((s) => s.editingTarget);
  const enterEditMode = useStore((s) => s.enterEditMode);
  const exitEditMode = useStore((s) => s.exitEditMode);
  const active = palettes.find((p) => p.id === activeId);

  // Exit edit mode when results change (e.g. new generation)
  useEffect(() => {
    exitEditMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullResult, selectedResult]);

  useGSAP(
    () => {
      gsap.fromTo(
        '.lib-head',
        { y: 20, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.5, ease: 'back.out(1.6)' },
      );
      gsap.fromTo(
        '.pop-card',
        { y: 26, autoAlpha: 0, scale: 0.95 },
        { y: 0, autoAlpha: 1, scale: 1, duration: 0.55, stagger: 0.1, ease: 'back.out(1.6)' },
      );
    },
    { scope: root, dependencies: [] },
  );

  return (
    <div className="library" ref={root}>
      <div className="lib-head">
        <div>
          <h1>🎨 工作台</h1>
          <p>把喜欢的图片变成拼豆图纸 ✿</p>
        </div>
        <Link to="/library" className="btn-back">
          去豆库 →
        </Link>
      </div>

      <div className="studio">
      <div className="studio-left">
        <section className="card pop-card">
          <div className="card-title">
            <span className="dot pink" />
            <h2>选张图片</h2>
          </div>
          <Upload />
          <ImageEditor />
        </section>
      </div>

      <div className="studio-right">
        <section className="card pop-card">
          <div className="card-title">
            <span className="dot mint" />
            <h2>用哪套豆</h2>
          </div>
          <div className="palette-picker">
            <div className="palette-pills">
              {palettes.map((p) => (
                <button
                  key={p.id}
                  className={`pal-pill${p.id === activeId ? ' on' : ''}`}
                  onClick={() => setActive(p.id)}
                  title={p.name}
                >
                  {p.name}
                  <span className="pill-n">{p.beads.length}</span>
                </button>
              ))}
            </div>
            <Link to="/library" className="mini-link">
              去豆库管理 →
            </Link>
          </div>
          <Controls activePalette={active} />
        </section>

        <section className="card pop-card">
          <div className="card-title">
            <span className="dot lav" />
            <h2>图纸</h2>
          </div>

          {/* Full result */}
          {editingTarget === 'full' && <EditToolbar />}
          {editingTarget === 'full' && <PaintPalette />}
          <div className="pv-edit-row">
            <PatternView
              title="全量建议图"
              subtitle="用整套色卡，效果最好"
              result={fullResult}
              mode={editingTarget === 'full' ? 'edit' : 'view'}
            />
            {fullResult &&
              fullResult.totalBeads > 0 &&
              editingTarget !== 'full' && (
                <button
                  className="btn-soft"
                  onClick={() => enterEditMode('full')}
                  style={{ marginTop: 10 }}
                >
                  ✏️ 局部修改
                </button>
              )}
          </div>

          {/* Selected result */}
          {editingTarget === 'selected' && <EditToolbar />}
          {editingTarget === 'selected' && <PaintPalette />}
          <div className="pv-edit-row">
            <PatternView
              title="仅选中豆图纸"
              subtitle="只用你挑的豆子"
              result={selectedResult}
              mode={editingTarget === 'selected' ? 'edit' : 'view'}
            />
            {selectedResult &&
              selectedResult.totalBeads > 0 &&
              editingTarget !== 'selected' && (
                <button
                  className="btn-soft"
                  onClick={() => enterEditMode('selected')}
                  style={{ marginTop: 10 }}
                >
                  ✏️ 局部修改
                </button>
              )}
          </div>
        </section>
      </div>
    </div>
    </div>
  );
}
