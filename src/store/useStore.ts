import { create } from 'zustand';
import type {
  Palette,
  Bead,
  PipelineOptions,
  PatternResult,
  CropRect,
  CropRatio,
  EditTool,
  EditingState,
} from '../types';
import {
  loadPalettes,
  savePalette,
  deletePalette as dbDeletePalette,
  newPalette,
  clonePalette,
  uid,
} from '../db/db';
import { recomputeUsage } from '../pipeline/edit';

export const DEFAULT_OPTIONS: PipelineOptions = {
  gridWidth: 48,
  gridHeight: 48,
  mode: 'full',
  selectedBeadIds: [],
  quantize: 'direct',
  colorCount: 16,
  dither: 'none',
  cellSampling: 'extract',
  mergeThreshold: 12,
  removeIsolated: false,
  mergeSmallRegions: false,
  removeBackground: false,
};

interface AppState {
  palettes: Palette[];
  activePaletteId: string | null;
  options: PipelineOptions;

  // Image / selection state
  imageDataUrl: string | null;
  imageAspect: number | null; // naturalWidth / naturalHeight
  crop: CropRect | null;
  cropRatio: CropRatio;

  // Results
  fullResult: PatternResult | null;
  selectedResult: PatternResult | null;
  busy: boolean;

  // ── Editing ──
  editingTarget: 'full' | 'selected' | null;
  editing: EditingState | null;
  activeTool: EditTool;
  activeColorIndex: number;

  // actions
  init: () => Promise<void>;
  setBusy: (b: boolean) => void;
  setOptions: (patch: Partial<PipelineOptions>) => void;
  setImage: (dataUrl: string | null) => void;
  setCrop: (crop: CropRect | null) => void;
  setCropRatio: (r: CropRatio) => void;
  setResults: (full: PatternResult | null, sel: PatternResult | null) => void;

  setActivePalette: (id: string) => void;
  createPalette: (name: string) => Promise<void>;
  duplicatePalette: (id: string, name: string) => Promise<void>;
  removePalette: (id: string) => Promise<void>;
  renamePalette: (id: string, name: string) => Promise<void>;
  addBead: (paletteId: string, bead: Omit<Bead, 'id'>) => Promise<void>;
  updateBead: (paletteId: string, bead: Bead) => Promise<void>;
  removeBead: (paletteId: string, beadId: string) => Promise<void>;
  importPalette: (p: Palette) => Promise<void>;
  toggleBeadSelected: (beadId: string) => void;
  selectAllBeads: (on: boolean) => void;

  // ── Editing actions ──
  enterEditMode: (target: 'full' | 'selected') => void;
  exitEditMode: () => void;
  setTool: (tool: EditTool) => void;
  setActiveColor: (beadIndex: number) => void;
  selectPaletteBead: (bead: Bead) => void;
  applyEdit: (before: Map<number, number>, after: Map<number, number>) => void;
  undo: () => void;
  redo: () => void;
  getEditedResult: () => PatternResult | null;
}

export const useStore = create<AppState>((set, get) => ({
  palettes: [],
  activePaletteId: null,
  options: DEFAULT_OPTIONS,
  imageDataUrl: null,
  imageAspect: null,
  crop: null,
  cropRatio: 'free',
  fullResult: null,
  selectedResult: null,
  busy: false,

  editingTarget: null,
  editing: null,
  activeTool: 'paint',
  activeColorIndex: 0,

  setBusy: (busy) => set({ busy }),

  init: async () => {
    const palettes = await loadPalettes();
    set({
      palettes,
      activePaletteId: palettes[0]?.id ?? null,
    });
  },

  setOptions: (patch) => set({ options: { ...get().options, ...patch } }),
  setImage: (dataUrl) => {
    set({
      imageDataUrl: dataUrl,
      imageAspect: null,
      crop: null,
      fullResult: null,
      selectedResult: null,
    });
    if (dataUrl) {
      const img = new Image();
      img.onload = () => {
        const aspect = img.naturalWidth / img.naturalHeight;
        set((s) => {
          // Only apply if the image hasn't changed since.
          if (s.imageDataUrl !== dataUrl) return {};
          // Lock grid to aspect on first load.
          const h = Math.max(5, Math.min(800, Math.round(s.options.gridWidth / aspect)));
          return {
            imageAspect: aspect,
            options: { ...s.options, gridWidth: s.options.gridWidth, gridHeight: h },
          };
        });
      };
      img.src = dataUrl;
    }
  },
  setCrop: (crop) => set({ crop }),
  setCropRatio: (cropRatio) => set({ cropRatio }),
  setResults: (fullResult, selectedResult) =>
    set({ fullResult, selectedResult }),

  setActivePalette: (id) =>
    set({ activePaletteId: id, options: { ...get().options, selectedBeadIds: [] } }),

  createPalette: async (name) => {
    const p = newPalette(name);
    await savePalette(p);
    set({ palettes: [...get().palettes, p], activePaletteId: p.id });
  },

  duplicatePalette: async (id, name) => {
    const src = get().palettes.find((p) => p.id === id);
    if (!src) return;
    const copy = clonePalette(src, name);
    await savePalette(copy);
    set({ palettes: [...get().palettes, copy], activePaletteId: copy.id });
  },

  removePalette: async (id) => {
    await dbDeletePalette(id);
    const palettes = get().palettes.filter((p) => p.id !== id);
    set({
      palettes,
      activePaletteId:
        get().activePaletteId === id ? palettes[0]?.id ?? null : get().activePaletteId,
    });
  },

  renamePalette: async (id, name) => {
    const palettes = get().palettes.map((p) =>
      p.id === id ? { ...p, name } : p,
    );
    const target = palettes.find((p) => p.id === id);
    if (target) await savePalette(target);
    set({ palettes });
  },

  addBead: async (paletteId, bead) => {
    const palettes = get().palettes.map((p) =>
      p.id === paletteId
        ? { ...p, beads: [...p.beads, { ...bead, id: uid('b_') }] }
        : p,
    );
    const target = palettes.find((p) => p.id === paletteId);
    if (target) await savePalette(target);
    set({ palettes });
  },

  updateBead: async (paletteId, bead) => {
    const palettes = get().palettes.map((p) =>
      p.id === paletteId
        ? { ...p, beads: p.beads.map((b) => (b.id === bead.id ? bead : b)) }
        : p,
    );
    const target = palettes.find((p) => p.id === paletteId);
    if (target) await savePalette(target);
    set({ palettes });
  },

  removeBead: async (paletteId, beadId) => {
    const palettes = get().palettes.map((p) =>
      p.id === paletteId
        ? { ...p, beads: p.beads.filter((b) => b.id !== beadId) }
        : p,
    );
    const target = palettes.find((p) => p.id === paletteId);
    if (target) await savePalette(target);
    set({ palettes });
  },

  importPalette: async (p) => {
    // Assign fresh ids to avoid collisions.
    const fresh: Palette = {
      ...p,
      id: uid('p_'),
      builtin: false,
      beads: p.beads.map((b) => ({ ...b, id: uid('b_') })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await savePalette(fresh);
    set({ palettes: [...get().palettes, fresh], activePaletteId: fresh.id });
  },

  toggleBeadSelected: (beadId) => {
    const cur = get().options.selectedBeadIds ?? [];
    const next = cur.includes(beadId)
      ? cur.filter((id) => id !== beadId)
      : [...cur, beadId];
    set({ options: { ...get().options, selectedBeadIds: next } });
  },

  selectAllBeads: (on) => {
    const pal = get().palettes.find((p) => p.id === get().activePaletteId);
    set({
      options: {
        ...get().options,
        selectedBeadIds: on && pal ? pal.beads.map((b) => b.id) : [],
      },
    });
  },

  // ── Editing actions ──

  enterEditMode: (target) => {
    const result =
      target === 'full' ? get().fullResult : get().selectedResult;
    if (!result || result.totalBeads === 0) return;
    const cells = new Int32Array(result.cells);
    const { usage, totalBeads } = recomputeUsage(cells, result.beads);
    set({
      editingTarget: target,
      editing: {
        cells,
        beads: result.beads,
        usage,
        totalBeads,
        history: [],
        historyIndex: -1,
      },
      activeTool: 'paint',
      activeColorIndex: 0,
    });
  },

  exitEditMode: () => {
    const state = get();
    if (!state.editing || !state.editingTarget) {
      set({ editingTarget: null, editing: null });
      return;
    }
    const ed = state.editing;
    // Apply edits back to the result.
    const editedResult: PatternResult = {
      width: 0,
      height: 0,
      cells: ed.cells,
      beads: ed.beads,
      usage: ed.usage,
      totalBeads: ed.totalBeads,
      mode: state.editingTarget,
    };
    if (state.editingTarget === 'full' && state.fullResult) {
      editedResult.width = state.fullResult.width;
      editedResult.height = state.fullResult.height;
      set({
        editingTarget: null,
        editing: null,
        fullResult: editedResult,
      });
    } else if (state.editingTarget === 'selected' && state.selectedResult) {
      editedResult.width = state.selectedResult.width;
      editedResult.height = state.selectedResult.height;
      set({
        editingTarget: null,
        editing: null,
        selectedResult: editedResult,
      });
    } else {
      set({ editingTarget: null, editing: null });
    }
  },

  setTool: (tool) => set({ activeTool: tool }),

  setActiveColor: (beadIndex) => set({ activeColorIndex: beadIndex }),

  /** Find or add a palette bead into editing.beads, then select it.
   *  Returns the index in editing.beads. */
  selectPaletteBead: (bead: Bead) => {
    const state = get();
    if (!state.editing) return;
    const ed = state.editing;
    // Look up existing index in editing.beads by id.
    let idx = ed.beads.findIndex((b) => b.id === bead.id);
    if (idx === -1) {
      // Not yet in the result — add it.
      idx = ed.beads.length;
      const newBeads = [...ed.beads, bead];
      const { usage, totalBeads } = recomputeUsage(ed.cells, newBeads);
      set({
        editing: { ...ed, beads: newBeads, usage, totalBeads },
        activeColorIndex: idx,
      });
    } else {
      set({ activeColorIndex: idx });
    }
  },

  applyEdit: (before, after) => {
    const state = get();
    if (!state.editing) return;
    const ed = state.editing;
    // Truncate any redo history.
    const history = ed.history.slice(0, ed.historyIndex + 1);
    history.push({ before, after });
    const { usage, totalBeads } = recomputeUsage(ed.cells, ed.beads);
    set({
      editing: {
        ...ed,
        history,
        historyIndex: history.length - 1,
        usage,
        totalBeads,
      },
    });
  },

  undo: () => {
    const state = get();
    if (!state.editing || state.editing.historyIndex < 0) return;
    const ed = state.editing;
    const record = ed.history[ed.historyIndex];
    for (const [idx, val] of record.before) {
      ed.cells[idx] = val;
    }
    const newIndex = ed.historyIndex - 1;
    const { usage, totalBeads } = recomputeUsage(ed.cells, ed.beads);
    set({
      editing: { ...ed, historyIndex: newIndex, usage, totalBeads },
    });
  },

  redo: () => {
    const state = get();
    if (
      !state.editing ||
      state.editing.historyIndex >= state.editing.history.length - 1
    )
      return;
    const ed = state.editing;
    const newIndex = ed.historyIndex + 1;
    const record = ed.history[newIndex];
    for (const [idx, val] of record.after) {
      ed.cells[idx] = val;
    }
    const { usage, totalBeads } = recomputeUsage(ed.cells, ed.beads);
    set({
      editing: { ...ed, historyIndex: newIndex, usage, totalBeads },
    });
  },

  getEditedResult: () => {
    const state = get();
    if (!state.editing || !state.editingTarget) return null;
    const ed = state.editing;
    const result =
      state.editingTarget === 'full'
        ? state.fullResult
        : state.selectedResult;
    if (!result) return null;
    return {
      width: result.width,
      height: result.height,
      cells: ed.cells,
      beads: ed.beads,
      usage: ed.usage,
      totalBeads: ed.totalBeads,
      mode: result.mode,
    };
  },
}));
