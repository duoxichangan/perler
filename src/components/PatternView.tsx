import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import type { PatternResult } from '../types';
import {
  renderPattern,
  renderCells,
  canvasToPngUrl,
  downloadDataUrl,
  exportCellSize,
  exportExcel,
} from '../pipeline/render';
import { floodFill } from '../pipeline/edit';
import { useStore } from '../store/useStore';

export function PatternView({
  title,
  subtitle,
  result,
  mode = 'view',
}: {
  title: string;
  subtitle?: string;
  result: PatternResult | null;
  mode?: 'view' | 'edit';
}) {
  const holder = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const strokeMapRef = useRef<Map<number, number>>(new Map());
  const lastIdxRef = useRef(-1);

  const [showGrid, setShowGrid] = useState(true);
  const [showCodes, setShowCodes] = useState(false);
  const [cellSize, setCellSize] = useState(12);

  // Edit store access
  const editing = useStore((s) => s.editing);
  const activeTool = useStore((s) => s.activeTool);
  const activeColorIndex = useStore((s) => s.activeColorIndex);
  const setActiveColor = useStore((s) => s.setActiveColor);
  const setTool = useStore((s) => s.setTool);
  const applyEdit = useStore((s) => s.applyEdit);

  const isEditing = mode === 'edit' && !!editing;

  // Determine the data to render
  const effectiveCells = isEditing ? editing.cells : result?.cells ?? null;
  const effectiveBeads = isEditing ? editing.beads : result?.beads ?? [];
  const effectiveUsage = isEditing ? editing.usage : result?.usage ?? [];
  const effectiveTotal =
    isEditing ? editing.totalBeads : (result?.totalBeads ?? 0);
  const w = result?.width ?? 0;
  const h = result?.height ?? 0;
  const hasData = effectiveCells != null && effectiveTotal > 0 && effectiveBeads.length > 0;

  // Build a PatternResult for export / CSV usage.
  function makeEffectiveResult(): PatternResult | null {
    if (!result || effectiveCells == null) return null;
    return {
      width: w,
      height: h,
      cells: effectiveCells,
      beads: effectiveBeads,
      usage: effectiveUsage,
      totalBeads: effectiveTotal,
      mode: result.mode,
    };
  }

  // Render the full canvas. We depend on the result/editing *object
  // references* (plus display options) rather than a derived string fingerprint.
  // A fresh PatternResult is produced on every regeneration (new object, new
  // cells array), so depending on `result` guarantees the canvas repaints even
  // when grid size and totalBeads happen to match the previous generation —
  // which a `totalBeads`-based key would wrongly treat as "no change".
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    el.innerHTML = '';
    if (
      !result ||
      !effectiveCells ||
      effectiveTotal === 0 ||
      effectiveBeads.length === 0
    )
      return;

    const tmp: PatternResult = {
      width: w,
      height: h,
      cells: effectiveCells,
      beads: effectiveBeads,
      usage: effectiveUsage,
      totalBeads: effectiveTotal,
      mode: result.mode,
    };

    const canvas = renderPattern(tmp, {
      cellSize,
      showGrid,
      showCodes,
      majorEvery: 10,
    });
    canvas.style.imageRendering = 'pixelated';
    canvas.style.borderRadius = '10px';
    if (isEditing) {
      canvas.style.touchAction = 'none';
      canvas.style.cursor =
        activeTool === 'erase'
          ? 'cell'
          : activeTool === 'pick'
            ? 'crosshair'
            : 'crosshair';
      canvas.classList.add('editing');
    }
    el.appendChild(canvas);
    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext('2d', { willReadFrequently: true });
  }, [
    result,
    editing,
    effectiveCells,
    effectiveBeads,
    effectiveUsage,
    effectiveTotal,
    w,
    h,
    cellSize,
    showGrid,
    showCodes,
    isEditing,
    activeTool,
  ]);

  // Reset drawing state when tool changes
  useEffect(() => {
    drawingRef.current = false;
    strokeMapRef.current.clear();
    lastIdxRef.current = -1;
  }, [activeTool]);

  // ── Pointer event handlers (edit mode only) ──

  const cellFromPoint = useCallback(
    (clientX: number, clientY: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return -1;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = Math.floor(((clientX - rect.left) * scaleX) / cellSize);
      const cy = Math.floor(((clientY - rect.top) * scaleY) / cellSize);
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) return -1;
      return cy * w + cx;
    },
    [cellSize, w, h],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isEditing || !editing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);

      const idx = cellFromPoint(e.clientX, e.clientY);
      if (idx < 0) return;

      if (activeTool === 'fill') {
        const cx = idx % w;
        const cy = (idx / w) | 0;
        const newVal =
          activeColorIndex < 0
            ? -1
            : activeColorIndex < editing.beads.length
              ? activeColorIndex
              : -1;
        const changed = floodFill(editing.cells, w, h, cx, cy, newVal);
        if (changed.size > 0) {
          const after = new Map<number, number>();
          for (const cix of changed.keys()) {
            after.set(cix, editing.cells[cix]);
          }
          applyEdit(changed, after);
          // Full re-render is triggered by the store update (editing ref changes)
        }
        return;
      }

      if (activeTool === 'pick') {
        const bi = editing.cells[idx];
        if (bi >= 0) {
          setActiveColor(bi);
          setTool('paint');
        }
        return;
      }

      // Paint or erase
      if (activeTool === 'paint' || activeTool === 'erase') {
        const newVal =
          activeTool === 'erase'
            ? -1
            : activeColorIndex < editing.beads.length
              ? activeColorIndex
              : -1;
        const oldVal = editing.cells[idx];
        if (oldVal === newVal) return;
        editing.cells[idx] = newVal;
        strokeMapRef.current.set(idx, oldVal);
        lastIdxRef.current = idx;
        drawingRef.current = true;

        // Incremental render
        const ctx = ctxRef.current;
        if (ctx) {
          renderCells(ctx, editing.cells, editing.beads, cellSize, [idx], w);
        }
      }
    },
    [
      isEditing,
      editing,
      activeTool,
      activeColorIndex,
      cellSize,
      w,
      h,
      cellFromPoint,
      applyEdit,
      setActiveColor,
      setTool,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isEditing || !editing || !drawingRef.current) return;
      if (activeTool !== 'paint' && activeTool !== 'erase') return;

      const idx = cellFromPoint(e.clientX, e.clientY);
      if (idx < 0 || idx === lastIdxRef.current) return;
      if (strokeMapRef.current.has(idx)) return; // already modified in this stroke
      lastIdxRef.current = idx;

      const newVal =
        activeTool === 'erase'
          ? -1
          : activeColorIndex < editing.beads.length
            ? activeColorIndex
            : -1;
      const oldVal = editing.cells[idx];
      if (oldVal === newVal) return;
      editing.cells[idx] = newVal;
      strokeMapRef.current.set(idx, oldVal);

      const ctx = ctxRef.current;
      if (ctx) {
        renderCells(ctx, editing.cells, editing.beads, cellSize, [idx], w);
      }
    },
    [isEditing, editing, activeTool, activeColorIndex, cellSize, w, cellFromPoint],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isEditing || !editing) return;
      drawingRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) canvas.releasePointerCapture(e.pointerId);

      if (strokeMapRef.current.size > 0) {
        const before = new Map(strokeMapRef.current);
        const after = new Map<number, number>();
        for (const cix of before.keys()) {
          after.set(cix, editing.cells[cix]);
        }
        strokeMapRef.current.clear();
        lastIdxRef.current = -1;
        applyEdit(before, after);
        // Full re-render is triggered by the store update (editing ref changes)
      }
    },
    [isEditing, editing, applyEdit],
  );

  // ── GSAP reveal animation ──
  useGSAP(
    () => {
      if (!result || result.totalBeads === 0) return;
      gsap.fromTo(
        '.pv-canvas',
        { scale: 0.9, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(1.5)' },
      );
      gsap.fromTo(
        '.legend-item',
        { y: 10, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, stagger: 0.02, duration: 0.35, ease: 'power2.out' },
      );
    },
    { dependencies: [result], scope: box },
  );

  const exportPng = () => {
    const er = makeEffectiveResult();
    if (!er) return;
    const cs = exportCellSize(w, h);
    const canvas = renderPattern(er, {
      cellSize: cs,
      showGrid: true,
      showCodes: true,
      majorEvery: 10,
    });
    downloadDataUrl(canvasToPngUrl(canvas), `${title}.png`);
  };

  const exportXlsx = async () => {
    const er = makeEffectiveResult();
    if (!er) return;
    await exportExcel(er, title);
  };

  return (
    <div className="pattern-view" ref={box}>
      <div className="pv-head">
        <div className="pv-title">
          <h3>{title}</h3>
          {subtitle && <span className="pv-sub">{subtitle}</span>}
        </div>
        {hasData && (
          <div className="pv-controls">
            <label>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              网格
            </label>
            <label>
              <input
                type="checkbox"
                checked={showCodes}
                onChange={(e) => setShowCodes(e.target.checked)}
              />
              色号
            </label>
            <input
              type="range"
              min={1}
              max={80}
              value={cellSize}
              onChange={(e) => setCellSize(Number(e.target.value))}
            />
            <button className="btn-soft" onClick={exportPng}>
              ⬇ PNG
            </button>
            <button className="btn-soft" onClick={exportXlsx}>
              ⬇ Excel
            </button>
          </div>
        )}
      </div>

      {hasData ? (
        <>
          <div className="pv-meta">
            <span className="pill">
              {w}×{h}
            </span>
            <span className="pill">共 {effectiveTotal} 颗</span>
            <span className="pill">{effectiveBeads.length} 种颜色</span>
            {isEditing && (
              <span className="pill" style={{ background: 'var(--pink-soft)', color: '#d15b86' }}>
                ✏️ 编辑中
              </span>
            )}
          </div>
          <div
            className={`pv-canvas${isEditing ? ' editing' : ''}`}
            ref={holder}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <div className="pv-legend">
            {effectiveUsage.map((u) => (
              <div key={u.beadId} className="legend-item">
                <span className="sw" style={{ background: u.hex }} />
                <span className="lc">{u.code}</span>
                {u.name && <span className="ln">{u.name}</span>}
                <span className="lq">×{u.needed}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="pv-empty">
          <span>🫧</span>
          还没有图纸，点上面的「生成图纸」吧
        </div>
      )}
    </div>
  );
}
