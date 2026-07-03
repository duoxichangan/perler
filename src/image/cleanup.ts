// Spatial cleanup on the final index grid. Operates on Int32Array of bead
// indexes (-1 = empty). These passes are what make patterns look "clean":
// they remove single-cell speckle and dissolve tiny color islands that carry
// little visual meaning but cost extra bead colors.

export interface GridDims {
  width: number;
  height: number;
}

/**
 * Replace any non-empty cell whose 8-neighbors are dominated (>=5) by a single
 * different index with that majority index. Runs a couple passes so 2-cell
 * specks also dissolve.
 */
export function removeIsolated(cells: Int32Array, dims: GridDims): void {
  const { width: w, height: h } = dims;
  for (let pass = 0; pass < 2; pass++) {
    const out = cells.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const cur = cells[idx];
        if (cur < 0) continue;
        const counts = new Map<number, number>();
        let same = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const nv = cells[ny * w + nx];
            if (nv < 0) continue;
            if (nv === cur) same++;
            counts.set(nv, (counts.get(nv) ?? 0) + 1);
          }
        }
        if (same >= 2) continue; // has support, keep
        let bestV = cur;
        let bestC = 0;
        counts.forEach((c, v) => {
          if (v !== cur && c > bestC) {
            bestC = c;
            bestV = v;
          }
        });
        if (bestC >= 5) out[idx] = bestV;
      }
    }
    out.forEach((v, i) => (cells[i] = v));
  }
}

/**
 * Flood-fill connected same-index regions; any region smaller than `minSize`
 * is recolored to the most common bordering index. Dissolves tiny islands.
 */
export function mergeSmallRegions(
  cells: Int32Array,
  dims: GridDims,
  minSize = 3,
): void {
  const { width: w, height: h } = dims;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];

  for (let start = 0; start < cells.length; start++) {
    if (seen[start] || cells[start] < 0) continue;
    const target = cells[start];
    const region: number[] = [];
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const p = stack.pop()!;
      region.push(p);
      const x = p % w;
      const y = (p / w) | 0;
      const neigh = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
      for (const np of neigh) {
        if (np >= 0 && !seen[np] && cells[np] === target) {
          seen[np] = 1;
          stack.push(np);
        }
      }
    }

    if (region.length < minSize) {
      // Find dominant bordering index.
      const border = new Map<number, number>();
      for (const p of region) {
        const x = p % w;
        const y = (p / w) | 0;
        const neigh = [
          x > 0 ? p - 1 : -1,
          x < w - 1 ? p + 1 : -1,
          y > 0 ? p - w : -1,
          y < h - 1 ? p + w : -1,
        ];
        for (const np of neigh) {
          if (np >= 0 && cells[np] !== target && cells[np] >= 0) {
            border.set(cells[np], (border.get(cells[np]) ?? 0) + 1);
          }
        }
      }
      let bestV = target;
      let bestC = 0;
      border.forEach((c, v) => {
        if (c > bestC) {
          bestC = c;
          bestV = v;
        }
      });
      if (bestC > 0) for (const p of region) cells[p] = bestV;
    }
  }
}
