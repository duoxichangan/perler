import { useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';

export function PaintPalette() {
  const editing = useStore((s) => s.editing);
  const activeColorIndex = useStore((s) => s.activeColorIndex);
  const setActiveColor = useStore((s) => s.setActiveColor);
  const selectPaletteBead = useStore((s) => s.selectPaletteBead);
  const palettes = useStore((s) => s.palettes);
  const activePaletteId = useStore((s) => s.activePaletteId);
  const activePalette = palettes.find((p) => p.id === activePaletteId);

  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to the active swatch when it changes (e.g. after pick tool).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const active = el.querySelector('.paint-swatch.active') as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeColorIndex]);

  if (!editing || !activePalette) return null;

  return (
    <div className="paint-palette" ref={containerRef}>
      {/* Eraser "color" */}
      <button
        className={`paint-swatch erase${activeColorIndex === -1 ? ' active' : ''}`}
        onClick={() => setActiveColor(-1)}
        title="透明 / 橡皮"
      >
        <span className="erase-icon" />
      </button>

      {/* All beads from the active palette */}
      {activePalette.beads.map((bead) => {
        const editingIdx = editing.beads.findIndex((b) => b.id === bead.id);
        const inUse = editingIdx !== -1;
        const isActive = editingIdx !== -1 && editingIdx === activeColorIndex;
        return (
          <button
            key={bead.id}
            className={`paint-swatch${isActive ? ' active' : ''}${!inUse ? ' unused' : ''}`}
            style={{ background: bead.hex }}
            onClick={() => selectPaletteBead(bead)}
            title={`${bead.code}${bead.name ? ' ' + bead.name : ''}${inUse ? ' (已使用)' : ''}`}
          />
        );
      })}
    </div>
  );
}
