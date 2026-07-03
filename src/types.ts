// Core domain types for the bead-pattern generator.

/** A single bead color in a palette. */
export interface Bead {
  id: string;
  /** Human-facing color code, e.g. "H01", "A12". */
  code: string;
  /** Optional descriptive name. */
  name?: string;
  /** sRGB hex, e.g. "#ffccaa". */
  hex: string;
}

/** A named set of beads (a "色卡"). Users can keep several. */
export interface Palette {
  id: string;
  name: string;
  beads: Bead[];
  /** True for the shipped preset; presets can be copied but not hard-deleted. */
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Fixed crop aspect ratios offered in the UI. */
export type CropRatio =
  | 'free'
  | '1:1'
  | '3:4'
  | '4:3'
  | '2:3'
  | '3:2'
  | '16:9'
  | '9:16';

/** Rectangular crop in source-image pixel coordinates. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Freeform lasso selection: polygon points in source-image pixel coords. */
export type LassoPolygon = Array<{ x: number; y: number }>;

/** Which mapping strategy the pipeline runs. */
export type GenerationMode =
  /** Use the whole palette, ignore stock — best-looking suggestion. */
  | 'full'
  /** Only selected beads, respect stock counts. */
  | 'selected';

/** Color reduction strategy before palette mapping. */
export type QuantizeMode = 'direct' | 'kmeans';

/**
 * How each grid cell picks its representative color from the source pixels.
 *  - 'blend': area-weighted average of all opaque pixels in the cell (平滑融合).
 *    Smooth, faithful to gradients — the default.
 *  - 'extract': most-frequent exact RGB in the cell (主色提取). Produces flatter,
 *    more cartoon-like output because it discards subtle tonal variation.
 */
export type CellSampling = 'blend' | 'extract';

export interface PipelineOptions {
  /** Output grid width in beads. Height derived from aspect. */
  gridWidth: number;
  gridHeight: number;
  mode: GenerationMode;
  /** Beads allowed when mode === 'selected'. */
  selectedBeadIds?: string[];
  /**
   * Color reduction strategy:
   *  - 'direct': each cell maps straight to its nearest bead (PixelBeads-style,
   *    每格直接匹配最近豆色). colorCount is ignored.
   *  - 'kmeans': K-Means quantize to colorCount clusters first, then map each
   *    cluster center to the nearest bead.
   */
  quantize: QuantizeMode;
  /** Number of KMeans clusters (color budget) — only used when quantize === 'kmeans'. */
  colorCount: number;
  dither: 'none' | 'floyd-steinberg' | 'atkinson';
  /** How each grid cell samples its color from the source image. */
  cellSampling: CellSampling;
  /**
   * Color merge threshold (0–100). After all cells are mapped to beads, beads
   * whose OKLab distance is below this threshold are merged — the less-frequent
   * bead is replaced by the more-frequent one. 0 = disabled. Higher = fewer
   * distinct colors in the output. Particularly useful with 主色提取 mode to
   * reduce noise from near-identical dominant colors mapping to different beads.
   */
  mergeThreshold: number;
  /** Spatial cleanup toggles. */
  removeIsolated: boolean;
  mergeSmallRegions: boolean;
  /** Treat near-white / near-transparent as background (skip). */
  removeBackground: boolean;
}

/** Per-color usage line for statistics. */
export interface BeadUsage {
  beadId: string;
  code: string;
  name?: string;
  hex: string;
  needed: number;
}

/** One cell of the finished pattern. -1 bead index = empty/background. */
export interface PatternCell {
  beadIndex: number;
}

/** Result of a generation run. */
export interface PatternResult {
  width: number;
  height: number;
  /** Row-major grid of bead indexes into `beads`. -1 = empty. */
  cells: Int32Array;
  /** Palette entries actually referenced, index-aligned with cell values. */
  beads: Bead[];
  usage: BeadUsage[];
  totalBeads: number;
  mode: GenerationMode;
}

// ── Editing types ──

/** Editing tool identifier. */
export type EditTool = 'paint' | 'erase' | 'fill' | 'pick';

/** A single undoable edit record. */
export interface EditRecord {
  /** Cell index → beadIndex BEFORE this edit. */
  before: Map<number, number>;
  /** Cell index → beadIndex AFTER this edit. */
  after: Map<number, number>;
}

/** The full editing state for one pattern result. */
export interface EditingState {
  /** Working copy of cells (mutated by edits). */
  cells: Int32Array;
  /** Bead palette for the result being edited. */
  beads: Bead[];
  /** Live usage stats, recalculated after each edit. */
  usage: BeadUsage[];
  totalBeads: number;
  /** Undo stack. */
  history: EditRecord[];
  /** Current position in history (-1 = original, history.length-1 = latest). */
  historyIndex: number;
}

/** A saved project (archive entry). */
export interface Project {
  id: string;
  name: string;
  /** Original image as a data URL (kept so archives are self-contained). */
  imageDataUrl?: string;
  crop?: CropRect;
  cropRatio?: CropRatio;
  lasso?: LassoPolygon;
  options: PipelineOptions;
  paletteId?: string;
  thumbnailDataUrl?: string;
  createdAt: number;
  updatedAt: number;
}
