import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { loadImage, rasterize, downsample } from '../image/raster';
import { analyze } from '../image/analyze';
import { generatePattern } from '../pipeline/generate';
import type { PipelineOptions, Palette } from '../types';

const GRID_MIN = 5;
const GRID_MAX = 800;

export function Controls({ activePalette }: { activePalette?: Palette }) {
  const options = useStore((s) => s.options);
  const setOptions = useStore((s) => s.setOptions);
  const imageDataUrl = useStore((s) => s.imageDataUrl);
  const imageAspect = useStore((s) => s.imageAspect);
  const crop = useStore((s) => s.crop);
  const setResults = useStore((s) => s.setResults);
  const setBusy = useStore((s) => s.setBusy);
  const busy = useStore((s) => s.busy);

  const selectedCount = options.selectedBeadIds?.length ?? 0;
  const aspect = crop ? crop.width / crop.height : (imageAspect ?? 1);

  // Local text state so keystrokes aren't clamped mid-typing.
  const [gwText, setGwText] = useState(String(options.gridWidth));
  const [ghText, setGhText] = useState(String(options.gridHeight));

  // Sync local state when store changes externally (e.g. suggest button).
  useEffect(() => setGwText(String(options.gridWidth)), [options.gridWidth]);
  useEffect(() => setGhText(String(options.gridHeight)), [options.gridHeight]);

  const suggest = async () => {
    if (!imageDataUrl) return;
    const img = await loadImage(imageDataUrl);
    const data = rasterize(img, crop ?? undefined);
    const s = analyze(data);
    // Keep the current width (user may have set it), compute height from aspect.
    const w = clampInt(String(s.gridWidth), GRID_MIN, GRID_MAX);
    const h = Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(w / aspect)));
    setOptions({ gridWidth: w, gridHeight: h });
  };

  // Commit width — derive height from aspect ratio.
  const commitWidth = useCallback(() => {
    const w = clampInt(gwText, GRID_MIN, GRID_MAX);
    const h = Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(w / aspect)));
    setGwText(String(w));
    setGhText(String(h));
    setOptions({ gridWidth: w, gridHeight: h });
  }, [gwText, aspect, setOptions]);

  // Commit height — derive width from aspect ratio.
  const commitHeight = useCallback(() => {
    const h = clampInt(ghText, GRID_MIN, GRID_MAX);
    const w = Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(h * aspect)));
    setGwText(String(w));
    setGhText(String(h));
    setOptions({ gridWidth: w, gridHeight: h });
  }, [ghText, aspect, setOptions]);

  const generate = async () => {
    if (!imageDataUrl || !activePalette) {
      alert('请先选择图片和色卡～');
      return;
    }
    // Flush any uncommitted text inputs before reading options.
    const w = clampInt(gwText, GRID_MIN, GRID_MAX);
    const h = Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(w / aspect)));
    setGwText(String(w));
    setGhText(String(h));
    setOptions({ gridWidth: w, gridHeight: h });
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const img = await loadImage(imageDataUrl);
      const data = rasterize(img, crop ?? undefined);
      const grid = downsample(data, w, h, options.cellSampling);

      const full = generatePattern(grid, activePalette.beads, {
        ...options,
        gridWidth: w,
        gridHeight: h,
        mode: 'full',
      });

      let selected = null;
      if (selectedCount > 0) {
        selected = generatePattern(grid, activePalette.beads, {
          ...options,
          gridWidth: w,
          gridHeight: h,
          mode: 'selected',
        });
      }
      setResults(full, selected);
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<PipelineOptions>) => setOptions(patch);

  return (
    <div className="controls">
      <div className="ctl-row">
        <label>宽</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={gwText}
          onChange={(e) => setGwText(e.target.value)}
          onBlur={commitWidth}
          onKeyDown={(e) => { if (e.key === 'Enter') commitWidth(); }}
        />
        <span className="times">×</span>
        <label>高</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={ghText}
          onChange={(e) => setGhText(e.target.value)}
          onBlur={commitHeight}
          onKeyDown={(e) => { if (e.key === 'Enter') commitHeight(); }}
        />
        <span className="unit">颗豆</span>
        <button className="btn-soft" onClick={suggest} disabled={!imageDataUrl}>
          ✨ 智能建议
        </button>
      </div>

      <div className="ctl-row checks">
        <label className="chip-check" title="每格取所有像素的加权平均色——平滑、贴近原图">
          <input
            type="radio"
            name="cellSampling"
            checked={options.cellSampling === 'blend'}
            onChange={() => set({ cellSampling: 'blend' })}
          />
          融混取色
        </label>
        <label className="chip-check" title="每格取出现次数最多的那个颜色——颜色更扁平、更干净，适合卡通风格">
          <input
            type="radio"
            name="cellSampling"
            checked={options.cellSampling === 'extract'}
            onChange={() => set({ cellSampling: 'extract' })}
          />
          主色提取
        </label>
      </div>

      <div style={{ marginBottom: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            颜色归并
          </span>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            相近颜色归并到一起，减少零散杂色
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8', minWidth: 48, textAlign: 'right' }}>保留细节</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={options.mergeThreshold}
            onChange={(e) => set({ mergeThreshold: Number(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: '0.7rem', color: '#94a3b8', minWidth: 48 }}>强力归并</span>
        </div>
      </div>

      <div className="ctl-row checks">
        <label className="chip-check">
          <input
            type="checkbox"
            checked={options.removeIsolated}
            onChange={(e) => set({ removeIsolated: e.target.checked })}
          />
          去孤立点
        </label>
        <label className="chip-check">
          <input
            type="checkbox"
            checked={options.mergeSmallRegions}
            onChange={(e) => set({ mergeSmallRegions: e.target.checked })}
          />
          合并小块
        </label>
        <label className="chip-check">
          <input
            type="checkbox"
            checked={options.removeBackground}
            onChange={(e) => set({ removeBackground: e.target.checked })}
          />
          去白底
        </label>
      </div>

      <p className="modehint">
        {selectedCount > 0
          ? `已在豆库挑了 ${selectedCount} 颗，会额外出一张「仅选中豆」图纸。`
          : '想出「仅选中豆」图纸？去豆库挑几颗喜欢的豆吧～'}
      </p>

      <button
        className="generate"
        onClick={generate}
        disabled={!imageDataUrl || busy}
      >
        {busy ? '生成中…' : '🎀 生成图纸'}
      </button>
    </div>
  );
}

function clampInt(v: string, min: number, max: number): number {
  const n = Math.round(Number(v) || min);
  return Math.max(min, Math.min(max, n));
}
