// Lightweight content analysis to suggest a bead grid size and color budget.
// Heuristics only — no ML. Cheap enough to run on every image.

export interface Suggestion {
  gridWidth: number;
  gridHeight: number;
  colorCount: number;
  /** Rough edge density 0..1, higher = more detail. */
  edgeDensity: number;
  /** Number of distinct-ish colors sampled. */
  colorComplexity: number;
}

/**
 * Analyze cropped ImageData and suggest sizes. We estimate edge density with a
 * downscaled Sobel-ish gradient and color complexity by quantized-color count,
 * then map complexity onto a grid dimension while preserving aspect ratio.
 */
export function analyze(src: ImageData): Suggestion {
  const { width, height, data } = src;
  const aspect = width / height;

  // --- edge density on a downscaled luma buffer ---
  const sample = 96;
  const sw = aspect >= 1 ? sample : Math.max(16, Math.round(sample * aspect));
  const sh = aspect >= 1 ? Math.max(16, Math.round(sample / aspect)) : sample;
  const luma = new Float64Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const srcX = Math.min(width - 1, Math.floor((x * width) / sw));
      const srcY = Math.min(height - 1, Math.floor((y * height) / sh));
      const i = (srcY * width + srcX) * 4;
      luma[y * sw + x] =
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const gx = luma[y * sw + x + 1] - luma[y * sw + x - 1];
      const gy = luma[(y + 1) * sw + x] - luma[(y - 1) * sw + x];
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 40) edgeSum++;
      edgeCount++;
    }
  }
  const edgeDensity = edgeCount > 0 ? edgeSum / edgeCount : 0;

  // --- color complexity: count occupied bins in a coarse RGB histogram ---
  const bins = new Set<number>();
  const step = 4; // subsample
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] < 8) continue;
    const key =
      ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    bins.add(key);
  }
  const colorComplexity = bins.size;

  // Map onto a "long side" bead count. More edges/colors -> larger grid.
  let longSide: number;
  if (edgeDensity < 0.06 && colorComplexity < 40) longSide = 32;
  else if (edgeDensity < 0.12 && colorComplexity < 90) longSide = 48;
  else if (edgeDensity < 0.2) longSide = 64;
  else longSide = 80;

  let gridWidth: number;
  let gridHeight: number;
  if (aspect >= 1) {
    gridWidth = longSide;
    gridHeight = Math.max(5, Math.round(longSide / aspect));
  } else {
    gridHeight = longSide;
    gridWidth = Math.max(5, Math.round(longSide * aspect));
  }

  // Color budget for KMeans, bounded to a sane range.
  const colorCount = Math.max(
    8,
    Math.min(24, Math.round(8 + colorComplexity / 8)),
  );

  return { gridWidth, gridHeight, colorCount, edgeDensity, colorComplexity };
}
