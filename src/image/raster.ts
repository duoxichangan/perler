// Image rasterization helpers: load, apply crop + lasso mask, and
// area-average downsample to a bead grid.

import type { CropRect, LassoPolygon } from '../types';

export interface GridPixel {
  r: number;
  g: number;
  b: number;
  /** 0..1 coverage: fraction of contributing source pixels that were opaque
   * and inside the selection. Cells below a threshold become background. */
  coverage: number;
}

export interface Grid {
  width: number;
  height: number;
  pixels: GridPixel[];
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Point-in-polygon (ray casting) in source pixel coordinates. */
function inPolygon(x: number, y: number, poly: LassoPolygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Draw the (optionally cropped) image to a canvas and read pixels. A lasso
 * polygon, if given, is applied as a mask by zeroing alpha outside it.
 */
export function rasterize(
  img: HTMLImageElement,
  crop?: CropRect | undefined,
  lasso?: LassoPolygon | undefined,
): ImageData {
  const sx = crop?.x ?? 0;
  const sy = crop?.y ?? 0;
  const sw = crop?.width ?? img.naturalWidth;
  const sh = crop?.height ?? img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh);

  if (lasso && lasso.length >= 3) {
    // Lasso points are in source coords; shift into cropped space.
    const shifted = lasso.map((p) => ({ x: p.x - sx, y: p.y - sy }));
    const { data: px } = data;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (!inPolygon(x + 0.5, y + 0.5, shifted)) {
          px[(y * sw + x) * 4 + 3] = 0;
        }
      }
    }
  }
  return data;
}

/**
 * Downsample ImageData into a gridW × gridH grid.
 *
 * Cell boundaries use the same formulation as the PixelBeads reference:
 *   start = floor(idx × imgSize / gridSize)
 *   end   = ceil((idx + 1) × imgSize / gridSize)   clamped to image bounds
 * This ensures every source pixel is assigned to exactly one cell with no gaps.
 *
 * @param sampling  'blend' — simple average (matching JS "average" mode).
 *                  'extract' — most-frequent exact RGB (matching JS "dominant" mode).
 */
export function downsample(
  src: ImageData,
  gridW: number,
  gridH: number,
  sampling: 'blend' | 'extract' = 'blend',
): Grid {
  const { width: sw, height: sh, data } = src;
  const pixels: GridPixel[] = new Array(gridW * gridH);

  const pxPerCol = sw / gridW;
  const pxPerRow = sh / gridH;

  for (let gy = 0; gy < gridH; gy++) {
    const y0 = Math.floor(gy * pxPerRow);
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.ceil((gy + 1) * pxPerRow)));
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor(gx * pxPerCol);
      const x1 = Math.max(x0 + 1, Math.min(sw, Math.ceil((gx + 1) * pxPerCol)));

      const idx = gy * gridW + gx;
      if (sampling === 'extract') {
        pixels[idx] = extractCellColor(data, sw, x0, x1, y0, y1, sh);
      } else {
        pixels[idx] = blendCellColor(data, sw, x0, x1, y0, y1, sh);
      }
    }
  }
  return { width: gridW, height: gridH, pixels };
}

/**
 * Simple unweighted average of all opaque pixels in the cell.
 *
 * Matching the JS reference exactly:
 *  - alpha < 128 → skip (treat as transparent)
 *  - every surviving pixel contributes EQUAL weight — no alpha premultiplication
 *
 * Rationale: alpha-weighted blending would let semi-transparent edge pixels
 * dilute the cell colour, producing washed-out borders. The JS approach treats
 * each opaque pixel as a "vote" for the cell colour, which is more appropriate
 * for pixel-art / bead-art output.
 */
function blendCellColor(
  data: Uint8ClampedArray,
  sw: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  sh: number,
): GridPixel {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let opaque = 0;
  let total = 0;

  for (let y = y0; y < y1 && y < sh; y++) {
    for (let x = x0; x < x1 && x < sw; x++) {
      const i = (y * sw + x) * 4;
      total++;
      if (data[i + 3] < 128) continue; // transparent — skip entirely
      opaque++;
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
    }
  }

  if (opaque > 0) {
    return {
      r: Math.round(rSum / opaque),
      g: Math.round(gSum / opaque),
      b: Math.round(bSum / opaque),
      coverage: total > 0 ? opaque / total : 0,
    };
  }
  return { r: 0, g: 0, b: 0, coverage: 0 };
}

/**
 * Most-frequent exact RGB in the cell (dominant-color extraction).
 *
 * Instead of blending all pixels together (which creates intermediate tones that
 * may not exist in the original image), this counts occurrences of each exact
 * RGB value and picks the winner. The result is a flatter, more cartoon-like
 * look — especially noticeable in areas with subtle gradients or JPEG noise.
 */
function extractCellColor(
  data: Uint8ClampedArray,
  sw: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  sh: number,
): GridPixel {
  const freq = new Map<number, number>(); // packed RGB key -> count
  let maxCount = 0;
  let bestR = 0;
  let bestG = 0;
  let bestB = 0;
  let opaqueCount = 0;
  let totalCount = 0;

  for (let y = y0; y < y1 && y < sh; y++) {
    for (let x = x0; x < x1 && x < sw; x++) {
      const i = (y * sw + x) * 4;
      const a = data[i + 3];
      totalCount++;
      if (a < 128) continue;
      opaqueCount++;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Pack 3 bytes into one 24-bit integer key for fast hashing.
      const key = (r << 16) | (g << 8) | b;
      const c = (freq.get(key) ?? 0) + 1;
      freq.set(key, c);
      if (c > maxCount) {
        maxCount = c;
        bestR = r;
        bestG = g;
        bestB = b;
      }
    }
  }

  if (opaqueCount > 0) {
    return {
      r: bestR,
      g: bestG,
      b: bestB,
      coverage: totalCount > 0 ? opaqueCount / totalCount : 0,
    };
  }
  return { r: 0, g: 0, b: 0, coverage: 0 };
}
