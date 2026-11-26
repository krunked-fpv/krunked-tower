// ============================================================================
// Krunked Tower — Local Custom Pack Loader
// Supports 3 zero-config local asset override channels with full fallback:
//   1. Vite dev middleware: /custom-pack/manifest.json (.krunked-tower-assets/)
//   2. IndexedDB persistent cache: krunked_tower_custom_pack_v1
//   3. User folder picker: loadCustomPackFiles(FileList | File[])
// Missing or partial sprites automatically fall back to Built-In KrunkedAtlas.
// ============================================================================

import type { AssetManifest, AtlasSpriteRect, CustomPackStatus } from '../contracts/index';
import { CUSTOM_SPRITE_MAP } from './customPackMap';

export const CUSTOM_PACK_DB_NAME = 'krunked_tower_custom_pack_v1';
const CUSTOM_PACK_STORE = 'packs';
const CUSTOM_PACK_KEY = 'active';
const PACK_ATLAS_SIZE = 2048;

export interface LoadedCustomPack {
  source: CustomPackStatus['source'];
  width: number;
  height: number;
  pixels: Uint8Array;
  rects: Record<string, AtlasSpriteRect>;
  audioMap: Map<string, string>;
  objectUrls: string[];
}

interface StoredPackRecord {
  version: 1;
  savedAt: number;
  width: number;
  height: number;
  pixelsBuffer: ArrayBuffer;
  rects: Record<string, AtlasSpriteRect>;
  audioEntries: Array<[string, Blob]>;
}

// Build reverse lookup: retailSprite basename -> canonical Krunked sprite key(s)
const RETAIL_TO_CANONICAL = new Map<string, string[]>();
for (const [canonicalKey, binding] of Object.entries(CUSTOM_SPRITE_MAP)) {
  const lower = binding.retailSprite.toLowerCase();
  const list = RETAIL_TO_CANONICAL.get(lower);
  if (list) list.push(canonicalKey);
  else RETAIL_TO_CANONICAL.set(lower, [canonicalKey]);
}

function isBrowserEnv(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function stripExt(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

function getExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function resolveCanonicalSpriteKeys(rawName: string): string[] {
  const stem = stripExt(rawName);
  if (CUSTOM_SPRITE_MAP[stem]) return [stem];
  // Match retailSprite or retailSprite_0
  const direct = RETAIL_TO_CANONICAL.get(stem);
  if (direct) return direct;
  const noFrame0 = stem.replace(/_0$/, '');
  const framed = RETAIL_TO_CANONICAL.get(noFrame0);
  if (framed) return framed;
  // Support custom peppo_taunt_0..10 and arbitrary atlas keys
  if (stem.startsWith('peppo_') || stem.startsWith('static_') || stem.startsWith('gusto_') ||
      stem.startsWith('tv_') || stem.startsWith('enemy_') || stem.startsWith('boss_') ||
      stem.startsWith('prop_') || stem.startsWith('pickup_') || stem.startsWith('toppin_') ||
      stem.startsWith('tile_') || stem.startsWith('rank_') || stem === 'mega_crust_chaser') {
    return [stem];
  }
  return [];
}

async function decodeImageToRgba(
  source: Blob | string
): Promise<{ width: number; height: number; pixels: Uint8Array } | null> {
  if (!isBrowserEnv()) return null;
  try {
    let blob: Blob;
    if (typeof source === 'string') {
      const resp = await fetch(source, { cache: 'no-cache' });
      if (!resp.ok) return null;
      blob = await resp.blob();
    } else {
      blob = source;
    }

    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        bmp.close();
        return null;
      }
      ctx.drawImage(bmp, 0, 0);
      const imgData = ctx.getImageData(0, 0, bmp.width, bmp.height);
      bmp.close();
      return {
        width: imgData.width,
        height: imgData.height,
        pixels: new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength),
      };
    }

    // Fallback HTMLImageElement decode
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image decode failed'));
        el.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: imgData.width,
        height: imgData.height,
        pixels: new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

class CustomShelfPacker {
  readonly width = PACK_ATLAS_SIZE;
  readonly height = PACK_ATLAS_SIZE;
  readonly pixels = new Uint8Array(PACK_ATLAS_SIZE * PACK_ATLAS_SIZE * 4);
  readonly rects: Record<string, AtlasSpriteRect> = {};
  private cx = 2;
  private cy = 2;
  private rowH = 0;

  packImage(
    keys: string[],
    srcW: number,
    srcH: number,
    srcPixels: Uint8Array,
    pivotX?: number,
    pivotY?: number
  ): boolean {
    if (srcW <= 0 || srcH <= 0 || srcW > this.width - 4 || srcH > this.height - 4) return false;
    const pad = 2;
    if (this.cx + srcW + pad > this.width) {
      this.cx = 2;
      this.cy += this.rowH + pad;
      this.rowH = 0;
    }
    if (this.cy + srcH + pad > this.height) return false;

    const dx = this.cx;
    const dy = this.cy;
    for (let y = 0; y < srcH; y++) {
      const srcRow = y * srcW * 4;
      const dstRow = ((dy + y) * this.width + dx) * 4;
      this.pixels.set(srcPixels.subarray(srcRow, srcRow + srcW * 4), dstRow);
    }

    const px = pivotX ?? Math.round(srcW * 0.5);
    const py = pivotY ?? Math.round(srcH * 0.9);
    for (const key of keys) {
      this.rects[key] = { key, x: dx, y: dy, w: srcW, h: srcH, pivotX: px, pivotY: py, frames: 1 };
    }

    this.cx += srcW + pad;
    if (srcH > this.rowH) this.rowH = srcH;
    return true;
  }
}

// ============================================================================
// IndexedDB Persistence Helpers (Safe & Non-Throwing)
// ============================================================================

function openCustomPackDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(CUSTOM_PACK_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CUSTOM_PACK_STORE)) {
          db.createObjectStore(CUSTOM_PACK_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function savePackToIndexedDb(
  pack: LoadedCustomPack,
  audioBlobs: Array<[string, Blob]>
): Promise<void> {
  const db = await openCustomPackDb();
  if (!db) return;
  try {
    const copy = new Uint8Array(pack.pixels.byteLength);
    copy.set(pack.pixels);
    const record: StoredPackRecord = {
      version: 1,
      savedAt: Date.now(),
      width: pack.width,
      height: pack.height,
      pixelsBuffer: copy.buffer,
      rects: pack.rects,
      audioEntries: audioBlobs,
    };
    await new Promise<void>((resolve) => {
      const tx = db.transaction(CUSTOM_PACK_STORE, 'readwrite');
      tx.objectStore(CUSTOM_PACK_STORE).put(record, CUSTOM_PACK_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Quota or private-browsing error — safely ignored
  } finally {
    db.close();
  }
}

export async function loadPackFromIndexedDb(): Promise<LoadedCustomPack | null> {
  const db = await openCustomPackDb();
  if (!db) return null;
  try {
    const record = await new Promise<StoredPackRecord | null>((resolve) => {
      const tx = db.transaction(CUSTOM_PACK_STORE, 'readonly');
      const req = tx.objectStore(CUSTOM_PACK_STORE).get(CUSTOM_PACK_KEY);
      req.onsuccess = () => resolve((req.result as StoredPackRecord | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
    if (!record || record.version !== 1 || !record.pixelsBuffer || !record.rects) return null;
    const pixels = new Uint8Array(record.pixelsBuffer);
    if (pixels.byteLength !== record.width * record.height * 4) return null;

    const audioMap = new Map<string, string>();
    const objectUrls: string[] = [];
    if (Array.isArray(record.audioEntries)) {
      for (const [key, blob] of record.audioEntries) {
        const url = URL.createObjectURL(blob);
        audioMap.set(key, url);
        objectUrls.push(url);
      }
    }

    return {
      source: 'indexeddb',
      width: record.width,
      height: record.height,
      pixels,
      rects: record.rects,
      audioMap,
      objectUrls,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

// ============================================================================
// Vite Dev Middleware Probe (/custom-pack/manifest.json)
// ============================================================================

export async function loadPackFromViteMiddleware(): Promise<LoadedCustomPack | null> {
  if (!isBrowserEnv() || typeof fetch !== 'function') return null;
  try {
    const resp = await fetch('/custom-pack/manifest.json', { cache: 'no-cache' });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') ?? '';
    if (!ct.includes('json') && !ct.includes('text')) return null;

    const manifest = (await resp.json()) as AssetManifest & {
      available?: boolean;
      atlasImage?: string;
      atlasPages?: string[];
    };
    if (!manifest || typeof manifest !== 'object' || manifest.available === false || !manifest.sprites) return null;
    if (Object.keys(manifest.sprites).length === 0 && (!manifest.audio || Object.keys(manifest.audio).length === 0)) {
      return null;
    }

    const audioMap = new Map<string, string>();
    if (manifest.audio && typeof manifest.audio === 'object') {
      for (const [k, relPath] of Object.entries(manifest.audio)) {
        if (typeof relPath === 'string' && relPath.length > 0) {
          const clean = relPath.replace(/^\/+/, '');
          audioMap.set(k, `/custom-pack/${clean}`);
        }
      }
    }

    // Attempt direct single-page atlas PNG first (fastest path)
    const atlasCandidates = [
      manifest.atlasImage,
      manifest.atlasPages?.[0],
      'atlas_0.png',
      'atlas.png',
      'sprites/atlas_0.png',
    ].filter((v): v is string => typeof v === 'string' && v.length > 0);

    for (const candidate of atlasCandidates) {
      const clean = candidate.replace(/^\/+/, '');
      const decoded = await decodeImageToRgba(`/custom-pack/${clean}`);
      if (decoded) {
        const rects: Record<string, AtlasSpriteRect> = {};
        for (const [key, entry] of Object.entries(manifest.sprites)) {
          if (!entry || entry.w <= 0 || entry.h <= 0) continue;
          if (entry.atlasPage && entry.atlasPage !== 0) continue;
          rects[key] = {
            key,
            x: entry.x,
            y: entry.y,
            w: entry.w,
            h: entry.h,
            pivotX: entry.pivotX,
            pivotY: entry.pivotY,
            frames: 1,
          };
        }
        if (Object.keys(rects).length > 0) {
          return {
            source: 'vite-dev',
            width: decoded.width,
            height: decoded.height,
            pixels: decoded.pixels,
            rects,
            audioMap,
            objectUrls: [],
          };
        }
      }
    }

    // Fallback: pack individual sprite PNG files listed in manifest.sprites[*].source
    const packer = new CustomShelfPacker();
    let packedCount = 0;
    for (const [key, entry] of Object.entries(manifest.sprites)) {
      if (!entry?.source) continue;
      const clean = entry.source.replace(/^\/+/, '');
      const decoded = await decodeImageToRgba(`/custom-pack/${clean}`);
      if (decoded && packer.packImage([key], decoded.width, decoded.height, decoded.pixels, entry.pivotX, entry.pivotY)) {
        packedCount++;
      }
    }

    if (packedCount === 0 && audioMap.size === 0) return null;

    return {
      source: 'vite-dev',
      width: packer.width,
      height: packer.height,
      pixels: packer.pixels,
      rects: packer.rects,
      audioMap,
      objectUrls: [],
    };
  } catch {
    return null;
  }
}

// ============================================================================
// User Folder Picker Loader (FileList | File[])
// ============================================================================

export async function loadPackFromFiles(files: FileList | File[]): Promise<LoadedCustomPack> {
  const list = Array.from(files);
  const byRelPath = new Map<string, File>();
  const byBaseName = new Map<string, File>();

  for (const f of list) {
    const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
      .replace(/\\/g, '/')
      .replace(/^[^/]+\//, '');
    byRelPath.set(rel.toLowerCase(), f);
    byBaseName.set(f.name.toLowerCase(), f);
  }

  const audioMap = new Map<string, string>();
  const audioBlobs: Array<[string, Blob]> = [];
  const objectUrls: string[] = [];

  // 1. Check if folder includes a manifest.json
  const manifestFile = byRelPath.get('manifest.json') ?? byBaseName.get('manifest.json');
  let manifest: (AssetManifest & { atlasImage?: string; atlasPages?: string[] }) | null = null;
  if (manifestFile) {
    try {
      manifest = JSON.parse(await manifestFile.text()) as AssetManifest & {
        atlasImage?: string;
        atlasPages?: string[];
      };
    } catch {
      manifest = null;
    }
  }

  // Register audio entries from manifest or raw audio files
  const audioExts = new Set(['.ogg', '.wav', '.mp3', '.webm']);
  if (manifest?.audio) {
    for (const [key, relPath] of Object.entries(manifest.audio)) {
      const f =
        byRelPath.get(relPath.replace(/^\/+/, '').toLowerCase()) ??
        byBaseName.get((relPath.split('/').pop() ?? '').toLowerCase());
      if (f) {
        const url = URL.createObjectURL(f);
        audioMap.set(key, url);
        audioBlobs.push([key, f]);
        objectUrls.push(url);
      }
    }
  }

  for (const f of list) {
    const ext = getExt(f.name);
    if (!audioExts.has(ext)) continue;
    const stem = stripExt(f.name);
    if (!audioMap.has(stem)) {
      const url = URL.createObjectURL(f);
      audioMap.set(stem, url);
      audioBlobs.push([stem, f]);
      objectUrls.push(url);
    }
  }

  // 2. If manifest + pre-baked atlas PNG exist, load it directly!
  if (manifest?.sprites) {
    const atlasCandidates = [
      manifest.atlasImage,
      manifest.atlasPages?.[0],
      'atlas_0.png',
      'atlas.png',
    ].filter((v): v is string => typeof v === 'string' && v.length > 0);

    for (const cand of atlasCandidates) {
      const f =
        byRelPath.get(cand.replace(/^\/+/, '').toLowerCase()) ??
        byBaseName.get((cand.split('/').pop() ?? '').toLowerCase());
      if (!f) continue;
      const decoded = await decodeImageToRgba(f);
      if (decoded) {
        const rects: Record<string, AtlasSpriteRect> = {};
        for (const [key, entry] of Object.entries(manifest.sprites)) {
          if (!entry || entry.w <= 0 || entry.h <= 0) continue;
          if (entry.atlasPage && entry.atlasPage !== 0) continue;
          rects[key] = {
            key,
            x: entry.x,
            y: entry.y,
            w: entry.w,
            h: entry.h,
            pivotX: entry.pivotX,
            pivotY: entry.pivotY,
            frames: 1,
          };
        }
        const pack: LoadedCustomPack = {
          source: 'folder-picker',
          width: decoded.width,
          height: decoded.height,
          pixels: decoded.pixels,
          rects,
          audioMap,
          objectUrls,
        };
        await savePackToIndexedDb(pack, audioBlobs);
        return pack;
      }
    }
  }

  // 3. Otherwise pack individual PNG/WebP sprite files into a 2048x2048 custom atlas!
  const packer = new CustomShelfPacker();
  const imgExts = new Set(['.png', '.webp']);
  for (const f of list) {
    const ext = getExt(f.name);
    if (!imgExts.has(ext)) continue;
    const keys = resolveCanonicalSpriteKeys(f.name);
    if (keys.length === 0) continue;
    const decoded = await decodeImageToRgba(f);
    if (!decoded) continue;
    const manifestEntry = manifest?.sprites?.[keys[0]];
    packer.packImage(
      keys,
      decoded.width,
      decoded.height,
      decoded.pixels,
      manifestEntry?.pivotX,
      manifestEntry?.pivotY
    );
  }

  const pack: LoadedCustomPack = {
    source: 'folder-picker',
    width: packer.width,
    height: packer.height,
    pixels: packer.pixels,
    rects: packer.rects,
    audioMap,
    objectUrls,
  };

  if (Object.keys(pack.rects).length > 0 || pack.audioMap.size > 0) {
    await savePackToIndexedDb(pack, audioBlobs);
  }
  return pack;
}
