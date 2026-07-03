// Edit utilities for the bead-pattern generator.
// Pure functions: flood-fill, usage recalculation, result conversion.

import type { Bead, BeadUsage, PatternResult } from '../types';

/**
 * Flood-fill starting at (startX, startY) in the cells grid.
 * Replaces all 4-connected cells of `targetIndex` with `replacementIndex`.
 * Returns the changed cells as Map<index, oldValue>.
 *
 * Uses an iterative stack to avoid call-stack overflow on large grids.
 */
export function floodFill(
  cells: Int32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  replacementIndex: number,
): Map<number, number> {
  const targetIndex = cells[startY * width + startX];
  if (targetIndex === replacementIndex) return new Map();

  const changed = new Map<number, number>();
  const stack: number[] = [startY * width + startX];

  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (cells[idx] !== targetIndex) continue;
    changed.set(idx, cells[idx]);
    cells[idx] = replacementIndex;

    const x = idx % width;
    const y = (idx / width) | 0;
    // 4-directional neighbors
    if (x > 0 && cells[idx - 1] === targetIndex) stack.push(idx - 1);
    if (x < width - 1 && cells[idx + 1] === targetIndex) stack.push(idx + 1);
    if (y > 0 && cells[idx - width] === targetIndex) stack.push(idx - width);
    if (y < height - 1 && cells[idx + width] === targetIndex) stack.push(idx + width);
  }

  return changed;
}

/**
 * Recalculate usage statistics from cells + beads.
 * Returns sorted BeadUsage[] (descending by needed count) and totalBeads.
 * O(cells.length) — single pass.
 */
export function recomputeUsage(
  cells: Int32Array,
  beads: Bead[],
): { usage: BeadUsage[]; totalBeads: number } {
  const counts: number[] = new Array(beads.length).fill(0);
  for (let i = 0; i < cells.length; i++) {
    const bi = cells[i];
    if (bi >= 0 && bi < beads.length) {
      counts[bi]++;
    }
  }

  const usage: BeadUsage[] = beads
    .map((b, i) => ({
      beadId: b.id,
      code: b.code,
      name: b.name,
      hex: b.hex,
      needed: counts[i],
    }))
    .filter((u) => u.needed > 0)
    .sort((a, b) => b.needed - a.needed);

  const totalBeads = counts.reduce((s, c) => s + c, 0);
  return { usage, totalBeads };
}

/**
 * Convert editing state back to a PatternResult for export.
 */
export function editingToResult(
  cells: Int32Array,
  beads: Bead[],
  usage: BeadUsage[],
  totalBeads: number,
  width: number,
  height: number,
  mode: 'full' | 'selected',
): PatternResult {
  return { width, height, cells, beads, usage, totalBeads, mode };
}
