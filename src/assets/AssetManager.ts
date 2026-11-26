// ============================================================================
// Krunked Tower — AssetManager
// Instant boot with Built-In Hand-Inked KrunkedAtlas + optional zero-reload
// switching to Local Custom Pack with per-sprite transparent fallback.
// ============================================================================

import type { AssetSourceMode, AtlasSpriteRect, CustomPackStatus } from '../contracts/index';
import { buildKrunkedAtlas, type BuiltAtlas } from './KrunkedAtlas';
import {
  loadPackFromFiles,
  loadPackFromIndexedDb,
  loadPackFromViteMiddleware,
  type LoadedCustomPack,
} from './CustomPackLoader';

export interface ResolvedSprite {
  useCustom: boolean;
  rect: AtlasSpriteRect;
}

export type PackChangeListener = (status: CustomPackStatus, audioMap: Map<string, string>) => void;

export class AssetManager {
  readonly builtinAtlas: BuiltAtlas;
  private customPack: LoadedCustomPack | null = null;
  private mode: AssetSourceMode = 'builtin';
  private customAtlasVersion = 0;
  private lastError: string | undefined;
  private listeners = new Set<PackChangeListener>();

  // Pre-allocated zero-GC resolved sprite caches
  private readonly fallbackResolved: ResolvedSprite;
  private readonly builtinResolved: Record<string, ResolvedSprite> = {};
  private customResolved: Record<string, ResolvedSprite> = {};
  private readonly emptyAudioMap = new Map<string, string>();

  constructor() {
    this.builtinAtlas = buildKrunkedAtlas();
    const fallbackRect =
      this.builtinAtlas.rects.fx_white_px ??
      this.builtinAtlas.rects.peppo_idle ?? {
        key: 'fallback',
        x: 0,
        y: 0,
        w: 4,
        h: 4,
        pivotX: 0,
        pivotY: 0,
      };
    this.fallbackResolved = { useCustom: false, rect: fallbackRect };
    for (const key of this.builtinAtlas.keys) {
      this.builtinResolved[key] = { useCustom: false, rect: this.builtinAtlas.rects[key] };
    }
  }

  getAssetMode(): AssetSourceMode {
    return this.mode;
  }

  setAssetMode(mode: AssetSourceMode): void {
    this.mode = mode;
    this.emitChange();
  }

  getCustomAtlasVersion(): number {
    return this.customAtlasVersion;
  }

  getCustomPack(): LoadedCustomPack | null {
    return this.customPack;
  }

  getCustomAudioMap(): Map<string, string> {
    if (this.mode === 'custom' && this.customPack) {
      return this.customPack.audioMap;
    }
    return this.emptyAudioMap;
  }

  getCustomPackStatus(): CustomPackStatus {
    const pack = this.customPack;
    const spriteCount = pack ? Object.keys(pack.rects).length : 0;
    const audioCount = pack ? pack.audioMap.size : 0;
    const available = pack !== null && (spriteCount > 0 || audioCount > 0);
    return {
      available,
      active: available && this.mode === 'custom',
      source: available && pack ? pack.source : 'none',
      spriteCount,
      audioCount,
      error: this.lastError,
    };
  }

  onPackChange(listener: PackChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Non-blocking probe for optional local Custom Pack:
   * Checks Vite dev middleware (/custom-pack/manifest.json) first, then IndexedDB cache.
   * Never throws or delays Built-In art rendering.
   */
  async probeCustomPack(): Promise<CustomPackStatus> {
    this.lastError = undefined;
    try {
      const fromVite = await loadPackFromViteMiddleware();
      if (fromVite) {
        this.applyCustomPack(fromVite);
        return this.getCustomPackStatus();
      }
      const fromIdb = await loadPackFromIndexedDb();
      if (fromIdb) {
        this.applyCustomPack(fromIdb);
        return this.getCustomPackStatus();
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Custom pack probe failed';
    }
    return this.getCustomPackStatus();
  }

  /**
   * Loads a user-selected folder via folder picker, packs sprites, caches to IndexedDB,
   * and activates Custom Pack mode immediately with zero reload!
   */
  async loadCustomPackFiles(files: FileList | File[]): Promise<CustomPackStatus> {
    this.lastError = undefined;
    try {
      const loaded = await loadPackFromFiles(files);
      const spriteCount = Object.keys(loaded.rects).length;
      const audioCount = loaded.audioMap.size;
      if (spriteCount === 0 && audioCount === 0) {
        this.lastError = 'No matching sprite PNGs, manifest.json, or audio files found in folder.';
        this.emitChange();
        return this.getCustomPackStatus();
      }
      this.applyCustomPack(loaded);
      this.mode = 'custom';
      this.emitChange();
      return this.getCustomPackStatus();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Failed to load Custom Pack files';
      this.emitChange();
      return this.getCustomPackStatus();
    }
  }

  /**
   * Resolves a sprite key using active mode, transparently falling back
   * per-sprite to Built-In KrunkedAtlas if missing from Custom Pack.
   * Returns a cached ResolvedSprite object (ZERO per-call heap allocations).
   */
  resolveSprite(key: string): ResolvedSprite {
    if (this.mode === 'custom' && this.customPack) {
      const customEntry = this.customResolved[key];
      if (customEntry) return customEntry;
    }
    return this.builtinResolved[key] ?? this.fallbackResolved;
  }

  hasBuiltinSprite(key: string): boolean {
    return key in this.builtinAtlas.rects;
  }

  dispose(): void {
    this.revokeCurrentUrls();
    this.listeners.clear();
  }

  private applyCustomPack(next: LoadedCustomPack): void {
    this.revokeCurrentUrls();
    this.customPack = next;
    const nextResolved: Record<string, ResolvedSprite> = {};
    for (const [k, rect] of Object.entries(next.rects)) {
      nextResolved[k] = { useCustom: true, rect };
    }
    this.customResolved = nextResolved;
    this.customAtlasVersion++;
    this.emitChange();
  }

  private revokeCurrentUrls(): void {
    if (!this.customPack) return;
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const u of this.customPack.objectUrls) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // ignore
        }
      }
    }
    this.customPack.objectUrls.length = 0;
  }

  private emitChange(): void {
    const status = this.getCustomPackStatus();
    const audio = this.getCustomAudioMap();
    for (const fn of this.listeners) {
      try {
        fn(status, audio);
      } catch {
        // isolate listener exceptions
      }
    }
  }
}
