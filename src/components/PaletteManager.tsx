import { useRef, useState, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../store/useStore';
import type { Bead, Palette } from '../types';

export function PaletteManager() {
  const palettes = useStore((s) => s.palettes);
  const activeId = useStore((s) => s.activePaletteId);
  const setActive = useStore((s) => s.setActivePalette);
  const createPalette = useStore((s) => s.createPalette);
  const duplicatePalette = useStore((s) => s.duplicatePalette);
  const removePalette = useStore((s) => s.removePalette);
  const renamePalette = useStore((s) => s.renamePalette);
  const addBead = useStore((s) => s.addBead);
  const updateBead = useStore((s) => s.updateBead);
  const removeBead = useStore((s) => s.removeBead);
  const importPalette = useStore((s) => s.importPalette);

  const selectedIds = useStore((s) => s.options.selectedBeadIds ?? []);
  const toggleSelected = useStore((s) => s.toggleBeadSelected);
  const selectAll = useStore((s) => s.selectAllBeads);

  const fileRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const active = palettes.find((p) => p.id === activeId) ?? null;

  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Exit edit mode when switching to a built-in palette.
  useEffect(() => {
    if (active?.builtin) {
      setEditMode(false);
      setEditingId(null);
    }
  }, [active?.id, active?.builtin]);

  const beads = active?.beads ?? [];
  const shown = filter
    ? beads.filter(
        (b) =>
          b.code.toLowerCase().includes(filter.toLowerCase()) ||
          (b.name ?? '').toLowerCase().includes(filter.toLowerCase()),
      )
    : beads;

  const editingBead = editingId ? beads.find((b) => b.id === editingId) : null;

  // ── Palette import/export ──────────────────────────
  const exportPalette = (p: Palette) => {
    const blob = new Blob([JSON.stringify(p, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.name}.palette.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const p = JSON.parse(text) as Palette;
      if (!Array.isArray(p.beads)) throw new Error('格式不对');
      await importPalette(p);
    } catch (e) {
      alert('导入失败：' + (e as Error).message);
    }
  };

  // ── Click handlers ─────────────────────────────────
  const onBeadClick = (id: string) => {
    if (editMode) {
      setEditingId(editingId === id ? null : id);
    } else {
      toggleSelected(id);
    }
  };

  // ── GSAP: bead cells stagger entrance ──────────────
  useGSAP(
    () => {
      const cells = gridRef.current?.querySelectorAll('.bead-cell');
      if (!cells || cells.length === 0) return;
      gsap.fromTo(
        cells,
        { scale: 0, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration: 0.35, stagger: { each: 0.01, from: 'start' }, ease: 'back.out(2.2)' },
      );
    },
    { dependencies: [activeId, shown.length], scope: gridRef },
  );

  // ── GSAP: edit panel entrance ──────────────────────
  useGSAP(
    () => {
      const panel = root.current?.querySelector('.edit-panel');
      if (!panel) return;
      gsap.fromTo(
        panel,
        { y: 16, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.3, ease: 'power2.out' },
      );
    },
    { dependencies: [editingId], scope: root },
  );

  return (
    <div className="palette-manager" ref={root}>
      {/* ── Palette tabs ──────────────────────────── */}
      <div className="palette-tabs">
        {palettes.map((p) => (
          <button
            key={p.id}
            className={`pal-tab${p.id === activeId ? ' on' : ''}`}
            onClick={() => setActive(p.id)}
          >
            {p.name} ({p.beads.length})
          </button>
        ))}
        <button
          className="pal-tab add"
          onClick={() => {
            const name = prompt('新色卡名称', '我的色卡');
            if (name) createPalette(name);
          }}
        >
          ✚ 新建
        </button>
      </div>

      {/* ── Palette actions bar ───────────────────── */}
      {active && (
        <div className="pal-actions">
          <input
            className="pal-name-input"
            value={active.name}
            disabled={active.builtin}
            onChange={(e) => renamePalette(active.id, e.target.value)}
          />
          {active.builtin && (
            <span className="tag">内置 · 复制后可改</span>
          )}
          <div className="pal-actions-btns">
            <button
              className="btn-soft"
              onClick={() => {
                const name = prompt('复制为', active.name + ' 副本');
                if (name) duplicatePalette(active.id, name);
              }}
            >
              ⧉ 复制
            </button>
            <button
              className="btn-soft"
              onClick={() => exportPalette(active)}
            >
              ⬇ 导出
            </button>
            <button
              className="btn-soft"
              onClick={() => fileRef.current?.click()}
            >
              ⬆ 导入
            </button>
            <button
              className="btn-soft danger"
              disabled={active.builtin}
              onClick={() => {
                if (confirm(`删除色卡「${active.name}」？`))
                  removePalette(active.id);
              }}
            >
              🗑 删除
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────── */}
      <div className="lib-toolbar">
        <input
          className="lib-search"
          placeholder="🔍 搜索色号 / 名称"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn-soft" onClick={() => selectAll(true)}>
          全选
        </button>
        <button className="btn-soft" onClick={() => selectAll(false)}>
          清空
        </button>
        <span className="tag pink">已挑 {selectedIds.length}</span>
        <button
          className={`btn-soft edit-toggle${editMode ? ' active' : ''}`}
          disabled={active?.builtin}
          onClick={() => {
            setEditMode(!editMode);
            setEditingId(null);
          }}
        >
          ✏️ 编辑
        </button>
      </div>

      {/* ── Bead grid ─────────────────────────────── */}
      <div className="bead-grid" ref={gridRef}>
        {shown.map((b) => (
          <BeadCell
            key={b.id}
            bead={b}
            selected={selectedIds.includes(b.id)}
            editing={editingId === b.id}
            editMode={editMode}
            onClick={() => onBeadClick(b.id)}
            onChange={(nb) => active && updateBead(active.id, nb)}
            onRemove={() => {
              if (active) removeBead(active.id, b.id);
              setEditingId(null);
            }}
          />
        ))}
        {active && !active.builtin && (
          <button
            className="add-cell"
            onClick={() =>
              addBead(active.id, { code: 'NEW', name: '', hex: '#ffd3e0' })
            }
          >
            <span className="add-dot">✚</span>
            <span className="add-label">加一颗</span>
          </button>
        )}
      </div>

      {/* ── Edit panel ────────────────────────────── */}
      {editMode && editingBead && (
        <EditPanel
          bead={editingBead}
          onChange={(nb) => active && updateBead(active.id, nb)}
          onRemove={() => {
            if (active) removeBead(active.id, editingBead.id);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

/* ================================================================
   BeadCell — single bead in the grid
   ================================================================ */
function BeadCell({
  bead,
  selected,
  editing,
  onClick,
}: {
  bead: Bead;
  selected: boolean;
  editing: boolean;
  editMode: boolean;
  onClick: () => void;
  onChange: (b: Bead) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`bead-cell${selected ? ' sel' : ''}${editing ? ' editing' : ''}`}
      onClick={onClick}
      title={bead.name || bead.code}
    >
      <div className="bead-dot" style={{ background: bead.hex }}>
        {selected && <span className="check">✓</span>}
      </div>
      <span className="bead-code">{bead.code}</span>
      {bead.name && <span className="bead-name">{bead.name}</span>}
    </div>
  );
}

/* ================================================================
   EditPanel — inline editor for a single bead
   ================================================================ */
function EditPanel({
  bead,
  onChange,
  onRemove,
}: {
  bead: Bead;
  onChange: (b: Bead) => void;
  onRemove: () => void;
}) {
  return (
    <div className="edit-panel">
      <label className="edit-swatch" style={{ background: bead.hex }}>
        <input
          type="color"
          value={bead.hex}
          onChange={(e) => onChange({ ...bead, hex: e.target.value })}
        />
      </label>
      <div className="edit-fields">
        <div className="edit-field">
          <label>色号</label>
          <input
            className="edit-code"
            value={bead.code}
            onChange={(e) => onChange({ ...bead, code: e.target.value })}
          />
        </div>
        <div className="edit-field">
          <label>名称</label>
          <input
            className="edit-name"
            value={bead.name ?? ''}
            placeholder="名称"
            onChange={(e) => onChange({ ...bead, name: e.target.value })}
          />
        </div>
      </div>
      <button className="edit-del" onClick={onRemove}>
        🗑 删除
      </button>
    </div>
  );
}
