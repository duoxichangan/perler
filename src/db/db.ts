// IndexedDB persistence for palettes and archived projects.
// On first run we seed the built-in palette so the app is usable immediately.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Palette, Bead, Project } from '../types';
import { BUILTIN_BRANDS } from '../data/builtinPalette';

//更新DouDB接口名称，将'DouDB'改为'PerlerDB'以匹配新项目名称
interface PerlerDB extends DBSchema {
  palettes: { key: string; value: Palette };
  projects: { key: string; value: Project };
}

const DB_NAME = 'perler-bead-studio';
const DB_VERSION = 2;
export const BUILTIN_PALETTE_ID = 'builtin-mard'; // legacy id kept for compat

const BUILTIN_IDS = BUILTIN_BRANDS.map((b) => b.id);

let dbPromise: Promise<IDBPDatabase<PerlerDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PerlerDB>(DB_NAME, DB_VERSION, {   
      upgrade(db) {
        if (!db.objectStoreNames.contains('palettes')) {
          db.createObjectStore('palettes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export function uid(prefix = ''): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

function buildPaletteFromBrand(brand: (typeof BUILTIN_BRANDS)[number]): Palette {
  const now = Date.now();
  const beads: Bead[] = brand.beads.map((b) => ({
    id: uid('b_'),
    code: b.code,
    name: b.name,
    hex: b.hex,
  }));
  return {
    id: brand.id,
    name: brand.name,
    beads,
    builtin: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** Ensure all built-in palettes exist, then return all palettes. */
export async function loadPalettes(): Promise<Palette[]> {
  const db = await getDB();
  let all = await db.getAll('palettes');

  // Seed any missing built-in brand palettes.
  let changed = false;
  for (const brand of BUILTIN_BRANDS) {
    if (!all.some((p) => p.id === brand.id)) {
      const p = buildPaletteFromBrand(brand);
      await db.put('palettes', p);
      all.push(p);
      changed = true;
    }
  }
  // Migrate legacy builtin-default -> builtin-mard.
  if (all.some((p) => p.id === 'builtin-default')) {
    changed = true;
  }

  if (changed) {
    all = await db.getAll('palettes');
  }
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function savePalette(p: Palette): Promise<void> {
  const db = await getDB();
  await db.put('palettes', { ...p, updatedAt: Date.now() });
}

export async function deletePalette(id: string): Promise<void> {
  if (BUILTIN_IDS.includes(id)) {
    throw new Error('内置色卡不能删除，可先复制再修改');
  }
  const db = await getDB();
  await db.delete('palettes', id);
}

export function newPalette(name: string): Palette {
  const now = Date.now();
  return {
    id: uid('p_'),
    name,
    beads: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Deep-copy a palette under a new id (fresh bead ids too). */
export function clonePalette(src: Palette, name: string): Palette {
  const now = Date.now();
  return {
    id: uid('p_'),
    name,
    beads: src.beads.map((b) => ({ ...b, id: uid('b_') })),
    createdAt: now,
    updatedAt: now,
  };
}

// --- Projects / archive ---

export async function loadProjects(): Promise<Project[]> {
  const db = await getDB();
  const all = await db.getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProject(p: Project): Promise<void> {
  const db = await getDB();
  await db.put('projects', { ...p, updatedAt: Date.now() });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('projects', id);
}
