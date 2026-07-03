// Pattern generation pipeline.
//
// Two modes:
//   full     - map to the whole palette, ignore stock. Best-looking output.
//   selected - only the chosen beads, and honor stock counts via a greedy
//              cell-level allocation that overflows to the next-nearest bead
//              when a color runs out, then reports shortages.
//
// Color mapping strategies (quantize):
//   direct   - each cell → nearest bead directly (PixelBeads-style).
//              No intermediate clustering; every cell gets its individually
//              best-matched bead. Simple, fast, and maximally faithful to
//              the original image. colorCount is ignored.
//   kmeans   - K-Means quantize to colorCount clusters first, then map each
//              cluster center to nearest bead. Limits the output to at most
//              colorCount distinct colors for a cleaner look.
//
// Dither (mutually exclusive with kmeans quantize):
//   floyd-steinberg / atkinson — error-diffusion dithering that maps each
//   cell to nearest bead while distributing quantization error to neighbors.
//
// Flow: downsampled grid -> (direct | kmeans | error-diffusion dither)
//       -> palette mapping -> spatial cleanup -> usage stats.

import type { Bead, PipelineOptions, PatternResult, BeadUsage } from '../types';
import { rgbToOklab, hexToRgb, labDistSq, type Lab } from '../color/oklab';
import { kmeans, type WeightedSample } from '../color/kmeans';
import type { Grid } from '../image/raster';
import { removeIsolated, mergeSmallRegions } from '../image/cleanup';

const COVERAGE_THRESHOLD = 0.35; // below this, a cell is background/empty

interface PreppedBead {
  bead: Bead;
  lab: Lab;
}

function prepBeads(beads: Bead[]): PreppedBead[] {
  return beads.map((bead) => ({ bead, lab: rgbToOklab(hexToRgb(bead.hex)) }));
}

/** Nearest bead index in `pool` to a target lab color. */
function nearest(target: Lab, pool: PreppedBead[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pool.length; i++) {
    const d = labDistSq(target, pool[i].lab);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function generatePattern(
  grid: Grid,
  allBeads: Bead[],
  options: PipelineOptions,
): PatternResult {
  const { width, height } = grid;
  const n = width * height;

  // Decide the working bead pool.
  const pool: PreppedBead[] =
    options.mode === 'selected' && options.selectedBeadIds?.length
      ? prepBeads(
          allBeads.filter((b) => options.selectedBeadIds!.includes(b.id)),
        )
      : prepBeads(allBeads);

  const cells = new Int32Array(n).fill(-1);

  // Guard: no beads to work with.
  if (pool.length === 0) {
    return emptyResult(width, height, options.mode);
  }

  if (options.dither !== 'none') {
    ditherMap(grid, pool, options, cells);
  } else if (options.quantize === 'kmeans') {
    quantizeMap(grid, pool, options, cells);
  } else {
    directMap(grid, pool, options, cells);
  }

  // Spatial cleanup FIRST — remove speckle and tiny islands before the
  // global merge. This prevents single-pixel outliers from pulling rare
  // beads into the frequency ranking, which would distort the merge.
  if (options.removeIsolated) removeIsolated(cells, { width, height });
  if (options.mergeSmallRegions)
    mergeSmallRegions(cells, { width, height }, 3);

  // Global color merge LAST — the final word on colour reduction.
  // Uses Euclidean RGB distance so the threshold value has the same
  // meaning as the JS reference (PixelBeads).
  if (options.mergeThreshold > 0) {
    mergeSimilarBeads(cells, pool, options.mergeThreshold, { width, height });
  }

  return buildResult(cells, pool, width, height, options.mode);
}

/** KMeans-quantize the grid, then map each cluster center to nearest bead. */
function quantizeMap(
  grid: Grid,
  pool: PreppedBead[],
  options: PipelineOptions,
  cells: Int32Array,
): void {
  const samples: WeightedSample[] = [];
  const cellIndex: number[] = []; // sample i -> grid cell
  for (let i = 0; i < grid.pixels.length; i++) {
    const p = grid.pixels[i];
    if (isBackground(p, options)) continue;
    const lab = rgbToOklab(p);
    samples.push({ ...lab, weight: 1 });
    cellIndex.push(i);
  }
  if (samples.length === 0) return;

  const { clusters, assignments } = kmeans(samples, options.colorCount);
  // Map each cluster to nearest bead once.
  const clusterBead = clusters.map((c) => nearest(c.center, pool));
  for (let s = 0; s < samples.length; s++) {
    cells[cellIndex[s]] = clusterBead[assignments[s]];
  }
}

/**
 * Direct nearest-bead mapping (PixelBeads-style).
 *
 * Each grid cell's averaged color is mapped straight to its closest bead in
 * the palette — no intermediate KMeans clustering. Every cell gets its own
 * individually best-matched bead, producing the most faithful reproduction
 * of the original image given the palette.
 *
 * This is simpler than the KMeans path and often looks better when the
 * palette is large enough (> ~24 colors), because no information is lost
 * to cluster-averaging. The tradeoff is that more distinct bead colors may
 * appear in the output.
 */
function directMap(
  grid: Grid,
  pool: PreppedBead[],
  options: PipelineOptions,
  cells: Int32Array,
): void {
  for (let i = 0; i < grid.pixels.length; i++) {
    const p = grid.pixels[i];
    if (isBackground(p, options)) continue;
    cells[i] = nearest(rgbToOklab(p), pool);
  }
}

/** Floyd-Steinberg / Atkinson error diffusion straight onto the bead pool. */
function ditherMap(
  grid: Grid,
  pool: PreppedBead[],
  options: PipelineOptions,
  cells: Int32Array,
): void {
  const { width: w, height: h } = grid;
  // Work in OKLab; carry error per channel.
  const buf: Array<Lab | null> = grid.pixels.map((p) =>
    isBackground(p, options) ? null : rgbToOklab(p),
  );

  const atkinson = options.dither === 'atkinson';
  const push = (x: number, y: number, e: Lab, f: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const t = buf[y * w + x];
    if (!t) return;
    t.L += e.L * f;
    t.a += e.a * f;
    t.b += e.b * f;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const cur = buf[idx];
      if (!cur) continue;
      const bi = nearest(cur, pool);
      cells[idx] = bi;
      const chosen = pool[bi].lab;
      const err: Lab = {
        L: cur.L - chosen.L,
        a: cur.a - chosen.a,
        b: cur.b - chosen.b,
      };
      if (atkinson) {
        const f = 1 / 8;
        push(x + 1, y, err, f);
        push(x + 2, y, err, f);
        push(x - 1, y + 1, err, f);
        push(x, y + 1, err, f);
        push(x + 1, y + 1, err, f);
        push(x, y + 2, err, f);
      } else {
        push(x + 1, y, err, 7 / 16);
        push(x - 1, y + 1, err, 3 / 16);
        push(x, y + 1, err, 5 / 16);
        push(x + 1, y + 1, err, 1 / 16);
      }
    }
  }
}

/**
 * Global color merge (参考 PixelBeads JS 颜色合并逻辑).
 *
 * After all cells are mapped to beads, some beads may be very close in colour.
 * This step merges less-frequent beads into a more-frequent one when their
 * Euclidean RGB distance is below the threshold, reducing colour count.
 *
 * Distance metric and threshold semantics match the JS reference exactly:
 * a value of 30 means "merge if RGB distance < 30" (same scale as JS).
 *
 * Strategy: sort used beads by frequency descending, then for each bead absorb
 * all less-frequent beads whose RGB distance < threshold. Same greedy algorithm
 * as the reference — popular colours win, rare colours get replaced.
 */
function mergeSimilarBeads(
  cells: Int32Array,
  pool: PreppedBead[],
  mergeThreshold: number, // 0–100, Euclidean RGB distance (matching JS)
  dims: { width: number; height: number },
): void {
  const n = dims.width * dims.height;

  // Count how many cells each bead occupies.
  const freq = new Map<number, number>(); // poolIndex -> count
  for (let i = 0; i < n; i++) {
    const bi = cells[i];
    if (bi < 0) continue;
    freq.set(bi, (freq.get(bi) ?? 0) + 1);
  }
  if (freq.size < 2) return;

  // Pre-compute RGB for each used bead so we don't parse hex repeatedly.
  const beadRgb = new Map<number, { r: number; g: number; b: number }>();
  for (const bi of freq.keys()) {
    beadRgb.set(bi, hexToRgb(pool[bi].bead.hex));
  }

  // Sort by frequency: most-used bead first.
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);

  const threshSq = mergeThreshold * mergeThreshold; // compare squared distance
  const merged = new Set<number>(); // poolIndex that got absorbed
  const replace = new Map<number, number>(); // merged → target

  for (let i = 0; i < ranked.length; i++) {
    const [biA] = ranked[i];
    if (merged.has(biA)) continue;
    const rgbA = beadRgb.get(biA)!;
    for (let j = i + 1; j < ranked.length; j++) {
      const [biB] = ranked[j];
      if (merged.has(biB)) continue;
      const rgbB = beadRgb.get(biB)!;
      const dr = rgbA.r - rgbB.r;
      const dg = rgbA.g - rgbB.g;
      const db = rgbA.b - rgbB.b;
      const d2 = dr * dr + dg * dg + db * db;
      if (d2 < threshSq) {
        merged.add(biB);
        replace.set(biB, biA);
      }
    }
  }

  if (merged.size === 0) return;

  // Apply replacements.
  for (let i = 0; i < n; i++) {
    const bi = cells[i];
    if (bi >= 0 && replace.has(bi)) {
      cells[i] = replace.get(bi)!;
    }
  }
}

function isBackground(
  p: { coverage: number; r: number; g: number; b: number },
  options: PipelineOptions,
): boolean {
  if (p.coverage < COVERAGE_THRESHOLD) return true;
  if (options.removeBackground) {
    // Near-white flat background heuristic.
    if (p.r > 244 && p.g > 244 && p.b > 244) return true;
  }
  return false;
}

function buildResult(
  cells: Int32Array,
  pool: PreppedBead[],
  width: number,
  height: number,
  mode: PatternResult['mode'],
): PatternResult {
  // Remap to only the beads actually used, for compact legends.
  const used = new Map<number, number>(); // poolIndex -> newIndex
  const beads: Bead[] = [];
  const counts: number[] = [];
  const out = new Int32Array(cells.length).fill(-1);

  for (let i = 0; i < cells.length; i++) {
    const bi = cells[i];
    if (bi < 0) continue;
    let ni = used.get(bi);
    if (ni === undefined) {
      ni = beads.length;
      used.set(bi, ni);
      beads.push(pool[bi].bead);
      counts.push(0);
    }
    out[i] = ni;
    counts[ni]++;
  }

  const usage: BeadUsage[] = beads.map((b, i) => ({
    beadId: b.id,
    code: b.code,
    name: b.name,
    hex: b.hex,
    needed: counts[i],
  }));
  usage.sort((a, b) => b.needed - a.needed);

  const totalBeads = counts.reduce((s, c) => s + c, 0);

  return { width, height, cells: out, beads, usage, totalBeads, mode };
}

function emptyResult(
  width: number,
  height: number,
  mode: PatternResult['mode'],
): PatternResult {
  return {
    width,
    height,
    cells: new Int32Array(width * height).fill(-1),
    beads: [],
    usage: [],
    totalBeads: 0,
    mode,
  };
}
