// Render a PatternResult to a canvas (with optional grid + code labels) and
// export helpers for PNG, CSV, and Excel.

import type { Bead, PatternResult } from '../types';
import ExcelJS from 'exceljs';

export interface RenderOptions {
  cellSize: number;
  showGrid: boolean;
  showCodes: boolean;
  /** Draw a heavier line every N cells to aid counting. */
  majorEvery: number;
}

export function renderPattern(
  result: PatternResult,
  opts: RenderOptions,
): HTMLCanvasElement {
  const { width, height, cells, beads } = result;
  const cs = opts.cellSize;
  const canvas = document.createElement('canvas');
  canvas.width = width * cs;
  canvas.height = height * cs;
  const ctx = canvas.getContext('2d')!;

  // Transparent background — empty cells stay see-through.
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Per-cell subtle border — matches the JS reference style where each
  // bead cell has a visible outline, giving a distinct "bead" look.
  const borderWidth = cs >= 8 ? 0.5 : 0;
  const halfBorder = borderWidth / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bi = cells[y * width + x];
      if (bi < 0) continue; // truly transparent
      const px = x * cs;
      const py = y * cs;
      ctx.fillStyle = beads[bi].hex;
      ctx.fillRect(px, py, cs, cs);

      // Per-cell border (like the JS reference).
      if (borderWidth > 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(px + halfBorder, py + halfBorder, cs - borderWidth, cs - borderWidth);
      }

      if (opts.showCodes && cs >= 14) {
        ctx.fillStyle = contrastColor(beads[bi].hex);
        ctx.font = `${Math.max(7, Math.floor(cs * 0.34))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(beads[bi].code, px + cs / 2, py + cs / 2);
      }
    }
  }

  if (opts.showGrid) {
    // Major gridlines every majorEvery cells.
    if (opts.majorEvery > 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x += opts.majorEvery) {
        ctx.moveTo(x * cs + 0.5, 0);
        ctx.lineTo(x * cs + 0.5, height * cs);
      }
      for (let y = 0; y <= height; y += opts.majorEvery) {
        ctx.moveTo(0, y * cs + 0.5);
        ctx.lineTo(width * cs, y * cs + 0.5);
      }
      ctx.stroke();
    }
  }

  return canvas;
}

/**
 * Re-render only a subset of cells on an existing canvas context.
 * Used during active painting for performance — avoids full O(n) redraw.
 */
export function renderCells(
  ctx: CanvasRenderingContext2D,
  cells: Int32Array,
  beads: Bead[],
  cellSize: number,
  indices: Iterable<number>,
  width: number,
): void {
  for (const idx of indices) {
    const bi = cells[idx];
    const x = (idx % width) * cellSize;
    const y = Math.floor(idx / width) * cellSize;
    if (bi < 0) {
      ctx.clearRect(x, y, cellSize, cellSize);
    } else {
      ctx.fillStyle = beads[bi].hex;
      ctx.fillRect(x, y, cellSize, cellSize);
    }
  }
}

/** Pick black or white text for readability against a bg hex. */
function contrastColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '#000000' : '#ffffff';
}

export function canvasToPngUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * Suggested cell size for PNG export — large enough to be crisp when printed
 * or zoomed, but capped for very large grids to keep file size reasonable.
 */
export function exportCellSize(width: number, height: number): number {
  const maxDim = Math.max(width, height);
  if (maxDim <= 80) return 40;
  if (maxDim <= 160) return 24;
  return 16;
}

export function usageToCsv(result: PatternResult): string {
  const rows = [['code', 'name', 'hex', 'needed']];
  for (const u of result.usage) {
    rows.push([u.code, u.name ?? '', u.hex, String(u.needed)]);
  }
  return rows
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export a pattern result as an Excel (.xlsx) workbook with two sheets:
 *   1. "用量" — colour usage table (色号, 名称, 颜色, 用量)
 *   2. "图纸" — grid where each cell shows the bead code,
 *      with background fill set to the bead colour.
 */
export async function exportExcel(
  result: PatternResult,
  filename: string,
): Promise<void> {
  const { width, height, cells, beads, usage } = result;

  const wb = new ExcelJS.Workbook();

  // ── Sheet 1: 用量 ──
  const wsUsage = wb.addWorksheet('用量');
  wsUsage.columns = [
    { header: '色号', key: 'code', width: 10 },
    { header: '名称', key: 'name', width: 18 },
    { header: '颜色', key: 'hex', width: 12 },
    { header: '用量(颗)', key: 'needed', width: 10 },
  ];
  // Header style
  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, size: 12 },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E0F0' } as ExcelJS.Color,
    } as ExcelJS.Fill,
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  wsUsage.getRow(1).eachCell((c) => {
    c.style = headerStyle as ExcelJS.Style;
  });

  for (const u of usage) {
    const row = wsUsage.addRow([u.code, u.name ?? '', u.hex, u.needed]);
    // Colour the hex cell with the actual bead colour
    const hexCell = row.getCell(3);
    const hex = u.hex.replace('#', '');
    (hexCell.style as ExcelJS.Style).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${hex}` },
    } as ExcelJS.Fill;
    // White text on dark backgrounds, black on light
    (hexCell.style as ExcelJS.Style).font = {
      color: { argb: contrastArgb(u.hex) },
    };
    (hexCell.style as ExcelJS.Style).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
  }

  // ── Sheet 2: 图纸 ──
  const wsGrid = wb.addWorksheet('图纸');

  // Set equal column widths
  for (let x = 0; x < width; x++) {
    const col = wsGrid.getColumn(x + 1);
    col.width = 5.5;
    col.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Build grid row by row
  for (let y = 0; y < height; y++) {
    const row = wsGrid.getRow(y + 1);
    for (let x = 0; x < width; x++) {
      const bi = cells[y * width + x];
      const cell = row.getCell(x + 1);
      if (bi >= 0) {
        const bead = beads[bi];
        cell.value = bead.code;
        const hex = bead.hex.replace('#', '');
        cell.style.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${hex}` },
        } as ExcelJS.Fill;
        cell.style.font = {
          size: 8,
          color: { argb: contrastArgb(bead.hex) },
        };
        cell.style.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.value = '';
      }
    }
    // Set row height
    row.height = 18;
  }

  // Trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, `${filename}.xlsx`);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Return ARGB colour string (FF000000 = black, FFFFFFFF = white) for
 *  readable text on a given hex background. */
function contrastArgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? 'FF000000' : 'FFFFFFFF';
}
