// ============================================================================
// Krunked Tower — Hand-Inked 90s Cartoon Procedural Sprite Atlas (100% DOM-Free)
// Generates a 2048x2048 RGBA pixel buffer + exact AtlasSpriteRect table in pure
// TypeScript so both browser WebGL2/Canvas2D and headless Node verification run
// instantaneously with zero external asset dependencies.
// ============================================================================

import type { AtlasSpriteRect } from '../contracts/index';

export interface BuiltAtlas {
  width: number;
  height: number;
  pixels: Uint8Array;
  rects: Record<string, AtlasSpriteRect>;
  keys: string[];
}

export const ATLAS_SIZE = 2048;

// 6-color base ramps baked into Peppo & Static sprites for shd_pal_swapper LUT.
// Outline ink (#120c14) and pure eye sclera (#ffffff) are deliberately excluded
// so dark cartoon outlines and eyes stay razor sharp under every costume!
export const PEPPO_BASE_RAMP: readonly [string, string, string, string, string, string] = [
  '#f8f6f0', // 0: Hat / Shirt light
  '#d6d0c4', // 1: Hat / Shirt shade
  '#2c2638', // 2: Tank / Apron / Shoes
  '#e83a3a', // 3: Trim / Collar / Accent
  '#ffd0a8', // 4: Skin light
  '#e09a72', // 5: Skin shade / Nose / Blush
];

export const STATIC_BASE_RAMP: readonly [string, string, string, string, string, string] = [
  '#ffe033', // 0: Jumpsuit / Hood light
  '#e0a818', // 1: Jumpsuit shade
  '#ff6b2b', // 2: Cape / Mask
  '#ff2e63', // 3: Visor / Gloves / Accent
  '#ffcca3', // 4: Skin light
  '#e09468', // 5: Skin shade
];

export const BUILTIN_PALETTE_RAMPS: Record<string, [string, string, string, string, string, string]> = {
  classic: ['#f8f6f0', '#d6d0c4', '#2c2638', '#e83a3a', '#ffd0a8', '#e09a72'],
  spicy: ['#ff4a3d', '#c92323', '#36191f', '#ffd23f', '#ffd0a8', '#e09a72'],
  sage: ['#b8e0a8', '#7fb072', '#263b2a', '#f7e58b', '#ffd0a8', '#e09a72'],
  midnight: ['#6b77c7', '#3f4587', '#1a1830', '#38f5ff', '#f0c4a8', '#c98a70'],
  golden_p: ['#fff07a', '#e8ad20', '#5a228a', '#ffffff', '#ffe0b8', '#e8a870'],
  cheetah: ['#ffc845', '#d98a1c', '#4a2b14', '#ff5722', '#ffd0a8', '#e09a72'],
  garish: ['#ff52e5', '#b825a8', '#33e659', '#fff033', '#ffd4b8', '#e39680'],
  cosmic: ['#c9b8ff', '#7d5fd4', '#1d1440', '#4df7ff', '#f5ccb8', '#cc9080'],
  mint_static: ['#8cf5cf', '#49c29c', '#1c545c', '#ff5ca8', '#ffd0a8', '#e09a72'],
  volt_gold: ['#fff04d', '#d9b516', '#21429e', '#38f5ff', '#ffd0a8', '#e09a72'],
  retro_gb: ['#e0f8d0', '#88c070', '#346856', '#b8e090', '#d0f0b8', '#78a860'],
  berry_blast: ['#9cb8ff', '#5d73cc', '#3b1c4a', '#ff3b7f', '#ffd0a8', '#e09a72'],
  royal_crust: ['#fff6d6', '#d9c58c', '#8a1c36', '#ffd23f', '#ffd0a8', '#e09a72'],
  lava_chef: ['#ff8c29', '#d63918', '#2e2226', '#fff257', '#ffbe94', '#d97f59'],
  ghost_mint: ['#d8fff8', '#8ce0d8', '#354f5c', '#9eff5c', '#e6faf5', '#a8d4cc'],
  neon_arcade: ['#ff47a3', '#a6217a', '#171738', '#38f5ff', '#ffd0b8', '#de9080'],
};

export const PALETTE_ORDER: readonly string[] = Object.keys(BUILTIN_PALETTE_RAMPS);

// ============================================================================
// Color & Pure-TS Pixel Drawing Buffer
// ============================================================================

type RGBA = readonly [number, number, number, number];

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const clean = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

const INK: RGBA = [18, 12, 20, 255];
const EYE_W: RGBA = [255, 255, 255, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

// Peppo canonical swappable slots
const P0 = hexToRgba(PEPPO_BASE_RAMP[0]);
const P1 = hexToRgba(PEPPO_BASE_RAMP[1]);
const P2 = hexToRgba(PEPPO_BASE_RAMP[2]);
const P3 = hexToRgba(PEPPO_BASE_RAMP[3]);
const P4 = hexToRgba(PEPPO_BASE_RAMP[4]);
const P5 = hexToRgba(PEPPO_BASE_RAMP[5]);

// Static canonical swappable slots
const S0 = hexToRgba(STATIC_BASE_RAMP[0]);
const S1 = hexToRgba(STATIC_BASE_RAMP[1]);
const S2 = hexToRgba(STATIC_BASE_RAMP[2]);
const S3 = hexToRgba(STATIC_BASE_RAMP[3]);
const S4 = hexToRgba(STATIC_BASE_RAMP[4]);
const S5 = hexToRgba(STATIC_BASE_RAMP[5]);

// Rich shared 90s cartoon palette accents
const C_RED = hexToRgba('#e63038');
const C_RED_D = hexToRgba('#9e1b26');
const C_RED_L = hexToRgba('#ff7078');
const C_ORG = hexToRgba('#ff8826');
const C_ORG_D = hexToRgba('#c75612');
const C_YEL = hexToRgba('#ffe03b');
const C_YEL_D = hexToRgba('#cca014');
const C_GOLD = hexToRgba('#ffd147');
const C_GOLD_D = hexToRgba('#b87c18');
const C_GRN = hexToRgba('#4cd158');
const C_GRN_D = hexToRgba('#288539');
const C_LIME = hexToRgba('#a8f542');
const C_CYAN = hexToRgba('#3cf0ff');
const C_CYAN_D = hexToRgba('#1b9eb5');
const C_BLUE = hexToRgba('#3d80f5');
const C_BLUE_D = hexToRgba('#224999');
const C_PURP = hexToRgba('#9847e8');
const C_PURP_D = hexToRgba('#57228c');
const C_MAG = hexToRgba('#ff47b8');
const C_PINK = hexToRgba('#ff99bd');
const C_PINK_D = hexToRgba('#d1668b');
const C_BRN = hexToRgba('#9e6034');
const C_BRN_D = hexToRgba('#63381c');
const C_BRN_L = hexToRgba('#cf8c55');
const C_STEEL = hexToRgba('#9eb2c4');
const C_STEEL_D = hexToRgba('#586a7a');
const C_STEEL_L = hexToRgba('#dce8f2');
const C_STONE = hexToRgba('#a69e94');
const C_STONE_D = hexToRgba('#6b635b');
const C_STONE_L = hexToRgba('#d4ccc0');
const C_CREAM = hexToRgba('#fff3d4');
const C_CHEESE = hexToRgba('#ffd447');
const C_CHEESE_D = hexToRgba('#d4981e');
const C_GHOST = hexToRgba('#c4fff8', 225);
const C_GHOST_D = hexToRgba('#6ad4cc', 210);
const C_RAT = hexToRgba('#9b95a3');
const C_RAT_D = hexToRgba('#696373');
const C_RAT_L = hexToRgba('#c7c0cf');

class SpriteCanvas {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  px(x: number, y: number, c: RGBA): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const o = (iy * this.w + ix) * 4;
    if (c[3] === 255 || this.data[o + 3] === 0) {
      this.data[o] = c[0];
      this.data[o + 1] = c[1];
      this.data[o + 2] = c[2];
      this.data[o + 3] = c[3];
    } else if (c[3] > 0) {
      const a = c[3] / 255;
      const ia = 1 - a;
      this.data[o] = Math.round(c[0] * a + this.data[o] * ia);
      this.data[o + 1] = Math.round(c[1] * a + this.data[o + 1] * ia);
      this.data[o + 2] = Math.round(c[2] * a + this.data[o + 2] * ia);
      this.data[o + 3] = Math.min(255, Math.round(c[3] + this.data[o + 3] * ia));
    }
  }

  clearPx(x: number, y: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const o = (iy * this.w + ix) * 4;
    this.data[o] = 0;
    this.data[o + 1] = 0;
    this.data[o + 2] = 0;
    this.data[o + 3] = 0;
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.px(px, py, c);
      }
    }
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, c: RGBA): void {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = Math.round(x + w) - 1;
    const y1 = Math.round(y + h) - 1;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px < x0 + rr ? x0 + rr - px : px > x1 - rr ? px - (x1 - rr) : 0;
        const dy = py < y0 + rr ? y0 + rr - py : py > y1 - rr ? py - (y1 - rr) : 0;
        if (dx * dx + dy * dy <= rr * rr + 0.35) {
          this.px(px, py, c);
        }
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
    if (rx <= 0 || ry <= 0) return;
    const x0 = Math.max(0, Math.floor(cx - rx - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry + 1));
    const invRx2 = 1 / (rx * rx);
    const invRy2 = 1 / (ry * ry);
    for (let py = y0; py <= y1; py++) {
      const dy = py - cy;
      const dy2 = dy * dy * invRy2;
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        if (dx * dx * invRx2 + dy2 <= 1.02) {
          this.px(px, py, c);
        }
      }
    }
  }

  circle(cx: number, cy: number, r: number, c: RGBA): void {
    this.ellipse(cx, cy, r, r, c);
  }

  ring(cx: number, cy: number, rx: number, ry: number, thickness: number, c: RGBA): void {
    const x0 = Math.max(0, Math.floor(cx - rx - thickness));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx + thickness));
    const y0 = Math.max(0, Math.floor(cy - ry - thickness));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry + thickness));
    const inRx = Math.max(0.5, rx - thickness);
    const inRy = Math.max(0.5, ry - thickness);
    for (let py = y0; py <= y1; py++) {
      const dy = py - cy;
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        const outD = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        const inD = (dx * dx) / (inRx * inRx) + (dy * dy) / (inRy * inRy);
        if (outD <= 1.04 && inD >= 0.96) {
          this.px(px, py, c);
        }
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGBA, thickness = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 1.5));
    const rad = (thickness - 1) * 0.5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      if (thickness <= 1.2) {
        this.px(px, py, c);
      } else {
        this.circle(px, py, rad + 0.35, c);
      }
    }
  }

  arc(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    startRad: number,
    endRad: number,
    c: RGBA,
    thickness = 1.5
  ): void {
    const steps = Math.max(12, Math.ceil(Math.abs(endRad - startRad) * Math.max(rx, ry) * 2));
    for (let i = 0; i <= steps; i++) {
      const a = startRad + ((endRad - startRad) * i) / steps;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      if (thickness <= 1.2) this.px(x, y, c);
      else this.circle(x, y, thickness * 0.5, c);
    }
  }

  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGBA): void {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1, y2)));
    const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (Math.abs(area) < 0.001) return;
    const s = area > 0 ? 1 : -1;
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const w0 = ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)) * s;
        const w1 = ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) * s;
        const w2 = ((x0 - x2) * (py - y2) - (y0 - y2) * (px - x2)) * s;
        if (w0 >= -0.25 && w1 >= -0.25 && w2 >= -0.25) {
          this.px(px, py, c);
        }
      }
    }
  }

  poly(pts: ReadonlyArray<readonly [number, number]>, c: RGBA): void {
    if (pts.length < 3) return;
    let minY = this.h;
    let maxY = 0;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.h - 1, Math.ceil(maxY));
    const nodes: number[] = [];
    for (let py = y0; py <= y1; py++) {
      nodes.length = 0;
      let j = pts.length - 1;
      for (let i = 0; i < pts.length; i++) {
        const yi = pts[i][1];
        const yj = pts[j][1];
        if ((yi < py && yj >= py) || (yj < py && yi >= py)) {
          const xi = pts[i][0];
          const xj = pts[j][0];
          nodes.push(xi + ((py - yi) / (yj - yi)) * (xj - xi));
        }
        j = i;
      }
      nodes.sort((a, b) => a - b);
      for (let i = 0; i < nodes.length - 1; i += 2) {
        const sx = Math.max(0, Math.floor(nodes[i]));
        const ex = Math.min(this.w - 1, Math.ceil(nodes[i + 1]));
        for (let px = sx; px <= ex; px++) {
          this.px(px, py, c);
        }
      }
    }
  }

  star(cx: number, cy: number, rOut: number, rIn: number, spikes: number, c: RGBA, rot = -Math.PI / 2): void {
    const pts: [number, number][] = [];
    const total = spikes * 2;
    for (let i = 0; i < total; i++) {
      const r = i % 2 === 0 ? rOut : rIn;
      const a = rot + (i * Math.PI) / spikes;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    this.poly(pts, c);
  }

  /**
   * Stamps a chunky hand-inked outline around all opaque pixels.
   * Preserves crisp 90s comic silhouette pop against busy parallax backgrounds.
   */
  inkOutline(ink: RGBA = INK, thick = 1): void {
    const w = this.w;
    const h = this.h;
    const src = this.data;
    const mask = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (src[(y * w + x) * 4 + 3] > 20) {
          mask[y * w + x] = 1;
        }
      }
    }

    for (let pass = 0; pass < thick; pass++) {
      const next = new Uint8Array(mask);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (mask[idx]) continue;
          let touch = false;
          if (x > 0 && mask[idx - 1]) touch = true;
          else if (x + 1 < w && mask[idx + 1]) touch = true;
          else if (y > 0 && mask[idx - w]) touch = true;
          else if (y + 1 < h && mask[idx + w]) touch = true;
          else if (
            pass === 0 &&
            ((x > 0 && y > 0 && mask[idx - w - 1]) ||
              (x + 1 < w && y > 0 && mask[idx - w + 1]) ||
              (x > 0 && y + 1 < h && mask[idx + w - 1]) ||
              (x + 1 < w && y + 1 < h && mask[idx + w + 1]))
          ) {
            // Selective corner rounding: fill diagonal only if 2 cardinals nearby would thicken smoothly
            touch = true;
          }
          if (touch) {
            next[idx] = 1;
            const o = idx * 4;
            src[o] = ink[0];
            src[o + 1] = ink[1];
            src[o + 2] = ink[2];
            src[o + 3] = ink[3];
          }
        }
      }
      mask.set(next);
    }
  }
}

// ============================================================================
// Row Shelf Packer into 2048x2048 RGBA Buffer
// ============================================================================

class AtlasPacker {
  readonly pixels = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  readonly rects: Record<string, AtlasSpriteRect> = {};
  readonly keys: string[] = [];
  private cursorX = 2;
  private cursorY = 2;
  private rowH = 0;

  add(key: string, w: number, h: number, pivotX: number, pivotY: number, draw: (c: SpriteCanvas) => void): void {
    const pad = 2;
    if (this.cursorX + w + pad > ATLAS_SIZE) {
      this.cursorX = 2;
      this.cursorY += this.rowH + pad;
      this.rowH = 0;
    }
    if (this.cursorY + h + pad > ATLAS_SIZE) {
      throw new Error(`KrunkedAtlas overflow while packing sprite "${key}"`);
    }
    const sc = new SpriteCanvas(w, h);
    draw(sc);
    const dstX = this.cursorX;
    const dstY = this.cursorY;
    for (let y = 0; y < h; y++) {
      const srcOff = y * w * 4;
      const dstOff = ((dstY + y) * ATLAS_SIZE + dstX) * 4;
      this.pixels.set(sc.data.subarray(srcOff, srcOff + w * 4), dstOff);
    }
    this.rects[key] = { key, x: dstX, y: dstY, w, h, pivotX, pivotY, frames: 1 };
    this.keys.push(key);
    this.cursorX += w + pad;
    if (h > this.rowH) this.rowH = h;
  }
}

// ============================================================================
// Reusable Hand-Inked Cartoon Character Sub-Parts
// ============================================================================

interface PeppoPoseOpts {
  lean?: number; // horizontal torso lean px
  squash?: number; // vertical squash offset
  hatTilt?: number;
  armL?: [number, number]; // hand L offset from shoulder
  armR?: [number, number]; // hand R offset from shoulder
  legL?: [number, number]; // foot L offset
  legR?: [number, number]; // foot R offset
  wheelLegs?: boolean;
  wheelFast?: boolean;
  mouth?: 'worry' | 'grin' | 'scream' | 'smug' | 'ouch' | 'o';
  eyes?: 'wide' | 'rage' | 'smug' | 'dizzy' | 'shades' | 'wink';
  sweat?: boolean;
  starburst?: boolean;
  starColor?: RGBA;
  speedLines?: boolean;
  aura?: RGBA;
  upsideDown?: boolean;
  holdingPizza?: boolean;
  capeFlame?: boolean;
}

function drawPeppoHead(
  c: SpriteCanvas,
  hx: number,
  hy: number,
  hatTilt: number,
  eyes: PeppoPoseOpts['eyes'] = 'wide',
  mouth: PeppoPoseOpts['mouth'] = 'worry',
  sweat = false
): void {
  // Tall puffy pleated Chef Toque Hat!
  const htX = hx + hatTilt;
  // Hat band
  c.roundRect(hx - 10, hy - 14, 20, 6, 2, P1);
  c.rect(hx - 9, hy - 14, 18, 3, P0);
  // Puffy toque lobes
  c.ellipse(htX - 7, hy - 22, 8, 7, P0);
  c.ellipse(htX + 7, hy - 22, 8, 7, P1);
  c.ellipse(htX, hy - 25, 10, 8, P0);
  c.ellipse(htX + 2, hy - 21, 9, 6, P1);
  c.ellipse(htX - 2, hy - 24, 7, 6, P0);
  // Hat pleats
  c.line(htX - 4, hy - 15, htX - 6, hy - 24, INK, 1);
  c.line(htX + 2, hy - 15, htX + 4, hy - 24, INK, 1);
  c.line(hx - 10, hy - 9, hx + 10, hy - 9, INK, 1.3);

  // Expressive chunky oval cartoon head
  c.ellipse(hx, hy, 11, 10, P4);
  c.ellipse(hx + 3, hy + 2, 8, 7, P5);
  c.ellipse(hx - 1, hy - 1, 9, 8, P4);
  // Sideburn hair tuft
  c.rect(hx - 11, hy - 5, 3, 6, INK);
  c.rect(hx - 10, hy - 8, 4, 3, INK);

  // Eyes!
  if (eyes === 'shades') {
    c.poly(
      [
        [hx - 6, hy - 5],
        [hx + 11, hy - 7],
        [hx + 9, hy],
        [hx - 4, hy],
      ],
      INK
    );
    c.line(hx - 3, hy - 4, hx + 1, hy - 1, EYE_W, 1.3);
    c.line(hx + 3, hy - 5, hx + 7, hy - 2, EYE_W, 1.3);
  } else if (eyes === 'dizzy') {
    c.circle(hx - 1, hy - 3, 4, EYE_W);
    c.circle(hx + 7, hy - 3, 4, EYE_W);
    c.line(hx - 3, hy - 5, hx + 1, hy - 1, INK, 1.4);
    c.line(hx + 1, hy - 5, hx - 3, hy - 1, INK, 1.4);
    c.line(hx + 5, hy - 5, hx + 9, hy - 1, INK, 1.4);
    c.line(hx + 9, hy - 5, hx + 5, hy - 1, INK, 1.4);
  } else if (eyes === 'rage') {
    c.ellipse(hx, hy - 3, 4.2, 4.5, EYE_W);
    c.ellipse(hx + 7, hy - 3, 4.2, 4.5, EYE_W);
    c.circle(hx + 1, hy - 3, 2, C_RED);
    c.circle(hx + 8, hy - 3, 2, C_RED);
    c.px(hx + 1, hy - 3, INK);
    c.px(hx + 8, hy - 3, INK);
    // Angry slanted brows
    c.line(hx - 4, hy - 8, hx + 4, hy - 5, INK, 2);
    c.line(hx + 11, hy - 8, hx + 4, hy - 5, INK, 2);
  } else if (eyes === 'wink') {
    c.ellipse(hx, hy - 3, 4, 4.5, EYE_W);
    c.circle(hx + 1, hy - 3, 1.8, INK);
    c.arc(hx + 7, hy - 3, 4, 2.5, Math.PI, Math.PI * 2, INK, 1.8);
  } else if (eyes === 'smug') {
    c.ellipse(hx, hy - 3, 4, 4, EYE_W);
    c.ellipse(hx + 7, hy - 3, 4, 4, EYE_W);
    c.rect(hx - 4, hy - 7, 15, 3, P4);
    c.line(hx - 4, hy - 4, hx + 11, hy - 4, INK, 1.5);
    c.circle(hx + 1, hy - 2, 1.6, INK);
    c.circle(hx + 8, hy - 2, 1.6, INK);
  } else {
    // Classic frantic wide Peppo eyes with dark stress bags!
    c.ellipse(hx, hy - 3, 4.3, 4.8, EYE_W);
    c.ellipse(hx + 7, hy - 3, 4.3, 4.8, EYE_W);
    c.circle(hx + 1, hy - 3, 1.8, INK);
    c.circle(hx + 8, hy - 3, 1.8, INK);
    c.px(hx, hy - 4, EYE_W);
    c.px(hx + 7, hy - 4, EYE_W);
    c.arc(hx, hy + 1, 3.2, 1.4, 0.2, Math.PI - 0.2, INK, 1);
    c.arc(hx + 7, hy + 1, 3.2, 1.4, 0.2, Math.PI - 0.2, INK, 1);
    c.line(hx - 4, hy - 8, hx + 2, hy - 9, INK, 1.4);
    c.line(hx + 5, hy - 9, hx + 11, hy - 8, INK, 1.4);
  }

  // Big bulbous cartoon nose!
  c.ellipse(hx + 5, hy + 1, 4.2, 3.2, P5);
  c.ellipse(hx + 4, hy + 0.3, 3, 2.2, P4);
  c.arc(hx + 5, hy + 1, 4.2, 3.2, -0.4, Math.PI * 0.9, INK, 1.1);

  // Thick iconic jagged black handlebar mustache!
  c.poly(
    [
      [hx - 6, hy + 5],
      [hx - 2, hy + 3],
      [hx + 4, hy + 3],
      [hx + 11, hy + 5],
      [hx + 13, hy + 2],
      [hx + 11, hy + 7],
      [hx + 7, hy + 6],
      [hx + 4, hy + 7],
      [hx, hy + 6],
      [hx - 4, hy + 7],
      [hx - 8, hy + 4],
    ],
    INK
  );

  // Expressive mouth
  if (mouth === 'scream') {
    c.ellipse(hx + 3, hy + 8, 5, 4.5, INK);
    c.ellipse(hx + 3, hy + 9, 3.2, 2.4, C_RED);
    c.rect(hx, hy + 5, 6, 2, EYE_W);
  } else if (mouth === 'grin' || mouth === 'smug') {
    c.ellipse(hx + 3, hy + 7, 5, 2.5, EYE_W);
    c.line(hx - 1, hy + 7, hx + 8, hy + 7, INK, 1);
    c.arc(hx + 3, hy + 7, 5, 2.5, 0, Math.PI, INK, 1.3);
  } else if (mouth === 'ouch' || mouth === 'o') {
    c.circle(hx + 3, hy + 8, 3, INK);
    c.circle(hx + 3, hy + 8.5, 1.6, C_RED);
  } else {
    c.line(hx, hy + 8, hx + 6, hy + 7.5, INK, 1.4);
  }

  if (sweat) {
    c.tri(hx - 12, hy - 9, hx - 15, hy - 3, hx - 10, hy - 3, C_CYAN);
    c.circle(hx - 12.5, hy - 3, 2.4, C_CYAN);
    c.px(hx - 13, hy - 4, EYE_W);
  }
}

function drawPeppoPose(c: SpriteCanvas, o: PeppoPoseOpts = {}): void {
  const lean = o.lean ?? 0;
  const sq = o.squash ?? 0;
  const cx = 32;
  const baseY = 58;

  // Optional comic starburst / aura behind character
  if (o.starburst) {
    c.star(cx, 33, 28, 15, 10, o.starColor ?? C_GOLD, 0.2);
    c.star(cx, 33, 21, 11, 10, EYE_W, 0.5);
  }
  if (o.aura) {
    c.star(cx, 34, 27, 17, 12, o.aura, 0.1);
  }
  if (o.speedLines) {
    c.line(2, 22, 18, 22, EYE_W, 2);
    c.line(4, 34, 20, 34, C_CYAN, 2);
    c.line(2, 46, 17, 46, C_GOLD, 2);
  }
  if (o.capeFlame) {
    c.poly(
      [
        [4, 36],
        [18, 26],
        [24, 42],
        [12, 48],
        [2, 44],
      ],
      C_ORG
    );
    c.poly(
      [
        [9, 37],
        [19, 31],
        [22, 41],
        [13, 44],
      ],
      C_YEL
    );
  }

  const hipX = cx + lean * 0.25;
  const hipY = baseY - 12 + sq;
  const shX = cx + lean;
  const shY = baseY - 26 + sq * 0.7;

  // Back arm
  const aL = o.armL ?? [-11, 6];
  c.line(shX - 5, shY + 2, shX + aL[0], shY + aL[1], P0, 5.5);
  c.circle(shX + aL[0], shY + aL[1], 4.2, P4);

  // Legs (or spinning cartoon Mach 3/4 wheel-legs!)
  if (o.wheelLegs) {
    const wy = baseY - 7;
    const wx = hipX - 2;
    const r = o.wheelFast ? 11 : 9;
    c.ellipse(wx, wy, r + 3, r - 1, o.wheelFast ? C_ORG : P0);
    c.ellipse(wx, wy, r, r - 3, o.wheelFast ? C_YEL : P2);
    c.arc(wx, wy, r - 1, r - 3, 0, Math.PI * 1.4, EYE_W, 2);
    c.arc(wx, wy, r - 4, r - 5, Math.PI, Math.PI * 2.2, C_RED, 2);
  } else {
    const lL = o.legL ?? [-6, 10];
    const lR = o.legR ?? [7, 10];
    c.line(hipX - 4, hipY, hipX + lL[0], hipY + lL[1], P2, 5.5);
    c.line(hipX + 4, hipY, hipX + lR[0], hipY + lR[1], P2, 5.5);
    // Chunky cartoon shoes
    c.ellipse(hipX + lL[0] + 2, hipY + lL[1] + 1, 5.5, 3.2, P2);
    c.ellipse(hipX + lR[0] + 2, hipY + lR[1] + 1, 5.5, 3.2, P2);
    c.px(hipX + lL[0] + 4, hipY + lL[1], P3);
    c.px(hipX + lR[0] + 4, hipY + lR[1], P3);
  }

  // Torso (white chef shirt + iconic black tank/apron + red trim!)
  c.poly(
    [
      [shX - 10, shY - 2],
      [shX + 10, shY - 2],
      [hipX + 11, hipY + 3],
      [hipX - 11, hipY + 3],
    ],
    P0
  );
  // Black tank / apron overlay
  c.poly(
    [
      [shX - 7, shY + 1],
      [shX + 7, shY + 1],
      [hipX + 9, hipY + 3],
      [hipX - 9, hipY + 3],
    ],
    P2
  );
  // Shoulder straps & spicy red accent belt
  c.line(shX - 6, shY - 1, shX - 5, shY + 4, P2, 2.5);
  c.line(shX + 5, shY - 1, shX + 5, shY + 4, P2, 2.5);
  c.line(hipX - 9, hipY + 1, hipX + 9, hipY + 1, P3, 2.2);

  // Head
  const headX = shX + lean * 0.22;
  const headY = shY - 11;
  drawPeppoHead(c, headX, headY, o.hatTilt ?? -lean * 0.45, o.eyes, o.mouth, o.sweat);

  // Front arm
  const aR = o.armR ?? [11, 5];
  c.line(shX + 5, shY + 2, shX + aR[0], shY + aR[1], P0, 5.5);
  c.circle(shX + aR[0], shY + aR[1], 4.4, P4);

  if (o.holdingPizza) {
    const px = shX + aR[0] + 4;
    const py = shY + aR[1] - 4;
    c.tri(px - 7, py + 4, px + 9, py + 2, px + 1, py - 10, C_CHEESE);
    c.line(px - 7, py + 4, px + 9, py + 2, C_BRN_L, 2.5);
    c.circle(px, py - 2, 2, C_RED);
    c.circle(px + 3, py, 1.8, C_RED);
  }

  c.inkOutline(INK, 1);
}

// ============================================================================
// The Static (Playable Gremlin Character) Builder
// ============================================================================

interface StaticPoseOpts {
  lean?: number;
  squash?: number;
  skateboard?: boolean;
  capeFlip?: number;
  armL?: [number, number];
  armR?: [number, number];
  legL?: [number, number];
  legR?: [number, number];
  mouth?: 'grin' | 'tongue' | 'scream' | 'ouch';
  bomb?: boolean;
  starburst?: boolean;
}

function drawStaticPose(c: SpriteCanvas, o: StaticPoseOpts = {}): void {
  const lean = o.lean ?? 0;
  const sq = o.squash ?? 0;
  const cx = 32;
  const baseY = o.skateboard ? 52 : 58;

  if (o.starburst) {
    c.star(cx, 34, 27, 14, 9, C_CYAN, 0.3);
    c.star(cx, 34, 19, 10, 9, C_YEL, 0.6);
  }

  const hipX = cx + lean * 0.2;
  const hipY = baseY - 10 + sq;
  const shX = cx + lean;
  const shY = baseY - 22 + sq * 0.7;

  // Fluttering orange cape behind Static
  const cf = o.capeFlip ?? 0;
  c.poly(
    [
      [shX - 5, shY - 2],
      [shX - 20 - lean * 0.4, shY + 6 + cf],
      [shX - 18 - lean * 0.4, hipY + 7 + cf],
      [hipX - 2, hipY + 2],
    ],
    S2
  );

  // Neon skateboard for Mach 2/3/4!
  if (o.skateboard) {
    c.roundRect(cx - 17, 50, 34, 5, 2, C_CYAN);
    c.rect(cx - 12, 51, 24, 2, S3);
    c.circle(cx - 10, 56, 3.2, S2);
    c.circle(cx + 10, 56, 3.2, S2);
    c.px(cx - 10, 56, EYE_W);
    c.px(cx + 10, 56, EYE_W);
  }

  // Legs
  const lL = o.legL ?? [-6, 9];
  const lR = o.legR ?? [6, 9];
  c.line(hipX - 3, hipY, hipX + lL[0], hipY + lL[1], S1, 5);
  c.line(hipX + 3, hipY, hipX + lR[0], hipY + lR[1], S0, 5);
  c.ellipse(hipX + lL[0] + 1, hipY + lL[1] + 1, 5, 3, S2);
  c.ellipse(hipX + lR[0] + 1, hipY + lR[1] + 1, 5, 3, S2);

  // Yellow jumpsuit torso
  c.ellipse(shX, (shY + hipY) * 0.5 + 1, 10, 9, S0);
  c.ellipse(shX + 2, (shY + hipY) * 0.5 + 3, 7, 6, S1);
  // Red/magenta buckle stripe
  c.line(shX - 8, hipY - 1, shX + 8, hipY - 1, S3, 2.2);

  // Arms
  const aL = o.armL ?? [-11, 3];
  const aR = o.armR ?? [12, 2];
  c.line(shX - 6, shY + 1, shX + aL[0], shY + aL[1], S0, 4.5);
  c.circle(shX + aL[0], shY + aL[1], 4, EYE_W); // Cartoon white gloves
  c.line(shX + 6, shY + 1, shX + aR[0], shY + aR[1], S0, 4.5);
  c.circle(shX + aR[0], shY + aR[1], 4, EYE_W);

  // Static's iconic hooded gremlin head with rabbit/jester ear flaps!
  const hx = shX + lean * 0.15;
  const hy = shY - 10;
  // Floppy hood ear-flaps
  c.poly(
    [
      [hx - 6, hy - 8],
      [hx - 14 - lean * 0.3, hy - 20],
      [hx - 4, hy - 14],
    ],
    S0
  );
  c.poly(
    [
      [hx + 2, hy - 9],
      [hx - 4 - lean * 0.3, hy - 22],
      [hx + 8, hy - 11],
    ],
    S1
  );
  // Yellow hood round head
  c.ellipse(hx, hy, 11, 10, S0);
  // Face opening
  c.ellipse(hx + 2, hy + 1, 8.5, 7, S4);
  // Orange domino bandit mask!
  c.roundRect(hx - 5, hy - 6, 16, 6, 2, S2);
  // Expressive manic eyes
  c.ellipse(hx, hy - 3, 3.2, 3.5, EYE_W);
  c.ellipse(hx + 7, hy - 3, 3.2, 3.5, EYE_W);
  c.circle(hx + 1, hy - 3, 1.5, INK);
  c.circle(hx + 8, hy - 3, 1.5, INK);
  // Long pointed goblin nose
  c.tri(hx + 4, hy - 1, hx + 13, hy + 1, hx + 4, hy + 3, S5);
  // Giant cheeky toothy grin / mustache curl
  if (o.mouth === 'ouch') {
    c.circle(hx + 3, hy + 6, 3.5, INK);
  } else if (o.mouth === 'scream') {
    c.ellipse(hx + 3, hy + 6, 6, 4.5, INK);
    c.rect(hx - 1, hy + 3, 8, 2, EYE_W);
    c.ellipse(hx + 3, hy + 8, 3, 2, S3);
  } else {
    c.ellipse(hx + 3, hy + 5.5, 6.5, 3, EYE_W);
    c.line(hx - 2, hy + 5.5, hx + 9, hy + 5.5, INK, 1);
    c.line(hx + 1, hy + 3.5, hx + 1, hy + 7.5, INK, 1);
    c.line(hx + 5, hy + 3.5, hx + 5, hy + 7.5, INK, 1);
    if (o.mouth === 'tongue') {
      c.ellipse(hx + 6, hy + 9, 3, 2.5, S3);
    }
  }

  if (o.bomb) {
    const bx = shX + aR[0] + 2;
    const by = shY + aR[1] - 7;
    c.circle(bx, by, 7, P2);
    c.circle(bx - 2, by - 2, 2, C_STEEL_L);
    c.line(bx, by - 7, bx + 4, by - 12, C_BRN_L, 1.6);
    c.star(bx + 5, by - 13, 4.5, 2, 5, C_YEL);
    c.circle(bx + 5, by - 13, 1.8, C_RED);
  }

  c.inkOutline(INK, 1);
}

// ============================================================================
// Gusto & Chonks (Buddy Rider) Builder
// ============================================================================

function drawGustoPose(
  c: SpriteCanvas,
  mode: 'idle' | 'walk' | 'mach' | 'jump' | 'fall' | 'climb' | 'kick' | 'taunt' | 'hurt'
): void {
  const cx = 32;
  const bounce = mode === 'jump' ? -4 : mode === 'mach' ? -2 : 0;

  if (mode === 'taunt') {
    c.star(cx, 33, 27, 15, 10, C_GOLD);
  }

  if (mode === 'kick') {
    // Solo Gusto delivering a mighty forward flying kick!
    c.ellipse(cx - 4, 38, 11, 10, C_CREAM);
    c.ellipse(cx - 4, 41, 9, 6, C_BLUE);
    c.line(cx + 2, 42, cx + 18, 36, C_BLUE_D, 6);
    c.ellipse(cx + 20, 35, 6, 4, C_BRN);
    // Red baker cap + mustache
    c.ellipse(cx - 4, 24, 9, 8, P4);
    c.ellipse(cx - 4, 18, 10, 5, C_RED);
    c.rect(cx - 4, 18, 12, 3, C_RED_D);
    c.circle(cx - 1, 24, 2, EYE_W);
    c.px(cx, 24, INK);
    c.ellipse(cx + 2, 28, 5, 2.5, C_BRN_D);
    c.star(cx + 22, 34, 7, 3, 6, C_YEL);
    c.inkOutline(INK, 1);
    return;
  }

  // GIANT cheerful rotund Chonks buddy mount!
  const ry = 42 + bounce;
  const rx = mode === 'mach' ? 20 : 18;
  // Fluffy pink tail
  c.arc(cx - 18, ry + 2, 7, 5, Math.PI * 0.5, Math.PI * 1.6, C_PINK, 3.2);
  // Big round body
  c.ellipse(cx, ry, rx, 14, C_RAT);
  c.ellipse(cx + 3, ry + 3, rx - 4, 10, C_RAT_D);
  c.ellipse(cx - 2, ry - 3, rx - 5, 9, C_RAT_L);
  // Big floppy ears
  c.circle(cx + 8, ry - 11, 6, C_RAT);
  c.circle(cx + 8, ry - 11, 3.5, C_PINK);
  // Big cheerful snout & pink nose
  c.ellipse(cx + 18, ry - 1, 6, 5, C_RAT_L);
  c.circle(cx + 22, ry - 2, 3, C_PINK);
  // Cute happy eyes
  c.circle(cx + 12, ry - 5, 3, EYE_W);
  c.circle(cx + 13, ry - 5, 1.5, INK);
  // Stubby paws
  const stride = mode === 'walk' ? 4 : mode === 'mach' ? 7 : 0;
  c.ellipse(cx - 9 - stride * 0.4, ry + 13, 5, 3.5, C_PINK_D);
  c.ellipse(cx + 9 + stride * 0.4, ry + 13, 5, 3.5, C_PINK_D);

  // Cozy red-cap baker Gusto riding happily on top!
  const gx = cx - 2;
  const gy = ry - 18;
  c.ellipse(gx, gy + 5, 9, 8, C_CREAM);
  c.rect(gx - 7, gy + 6, 14, 5, C_BLUE);
  c.ellipse(gx, gy - 3, 8, 7, P4);
  // Red baker cap
  c.ellipse(gx, gy - 9, 9, 4.5, C_RED);
  c.rect(gx + 1, gy - 9, 9, 3, C_RED_D);
  // Big friendly nose & brown mustache
  c.circle(gx + 3, gy - 4, 2.3, EYE_W);
  c.px(gx + 4, gy - 4, INK);
  c.circle(gx + 6, gy - 2, 2.5, P5);
  c.ellipse(gx + 3, gy + 1, 5.5, 2.2, C_BRN_D);

  if (mode === 'hurt') {
    c.star(cx, gy - 12, 6, 2.5, 5, C_YEL);
  }
  c.inkOutline(INK, 1);
}

// ============================================================================
// Corner CRT TV Expressions (Chunky 90s Retro Cartoon Face Screens)
// ============================================================================

function drawTvFrame(c: SpriteCanvas): void {
  // Bunny-ear antennas on top
  c.line(38, 14, 24, 3, C_STEEL_D, 2.5);
  c.line(54, 14, 70, 3, C_STEEL_D, 2.5);
  c.circle(24, 3, 3, C_RED);
  c.circle(70, 3, 3, C_RED);
  // Chunky retro CRT outer casing
  c.roundRect(4, 12, 88, 64, 9, hexToRgba('#7a6f82'));
  c.roundRect(6, 14, 84, 60, 7, hexToRgba('#a395ab'));
  // Highlight edge
  c.line(12, 16, 82, 16, hexToRgba('#d1c4d9'), 2);
  // Recessed dark screen bezel (left-center)
  c.roundRect(10, 19, 64, 50, 6, hexToRgba('#292233'));
  // Transparent inner window so expressions composite cleanly inside!
  for (let y = 22; y < 66; y++) {
    for (let x = 13; x < 71; x++) {
      c.clearPx(x, y);
    }
  }
  // Right-side tactile retro dials & speaker vents
  c.circle(82, 28, 5, C_STONE_D);
  c.line(82, 28, 85, 25, EYE_W, 1.5);
  c.circle(82, 42, 5, C_STONE_D);
  c.line(82, 42, 85, 45, EYE_W, 1.5);
  for (let sy = 52; sy <= 64; sy += 3) {
    c.line(77, sy, 87, sy, INK, 1.5);
  }
  // Rubber feet
  c.rect(14, 74, 12, 4, INK);
  c.rect(68, 74, 12, 4, INK);
  c.inkOutline(INK, 1);
}

function drawTvScreen(
  c: SpriteCanvas,
  expr:
    | 'idle'
    | 'mach2'
    | 'mach3'
    | 'mach4'
    | 'panic'
    | 'hurt'
    | 'taunt'
    | 'combo'
    | 'happy'
    | 'boss'
    | 'gusto'
    | 'static'
    | 'knight'
    | 'ghost'
    | 'shotgun'
    | 'fire'
): void {
  const w = c.w;
  const h = c.h;
  // Expressive thematic cartoon backdrop per state
  const bgMap: Record<typeof expr, [RGBA, RGBA]> = {
    idle: [hexToRgba('#3f517a'), hexToRgba('#2d3a5c')],
    mach2: [hexToRgba('#d97a26'), hexToRgba('#a84d18')],
    mach3: [hexToRgba('#e02835'), hexToRgba('#8f141e')],
    mach4: [hexToRgba('#9424d6'), hexToRgba('#ff2e85')],
    panic: [hexToRgba('#781c59'), hexToRgba('#3d0d2e')],
    hurt: [hexToRgba('#453d54'), hexToRgba('#262033')],
    taunt: [hexToRgba('#f2c037'), hexToRgba('#d9881c')],
    combo: [hexToRgba('#2ca85c'), hexToRgba('#186e3b')],
    happy: [hexToRgba('#3ca6db'), hexToRgba('#206b9e')],
    boss: [hexToRgba('#a81928'), hexToRgba('#3b0a14')],
    gusto: [hexToRgba('#57a65c'), hexToRgba('#35703a')],
    static: [hexToRgba('#ff5926'), hexToRgba('#a82669')],
    knight: [hexToRgba('#5b7594'), hexToRgba('#35475e')],
    ghost: [hexToRgba('#275966'), hexToRgba('#14313b')],
    shotgun: [hexToRgba('#8a3c24'), hexToRgba('#4a1c12')],
    fire: [hexToRgba('#ff5114'), hexToRgba('#b81d0e')],
  };
  const [bgA, bgB] = bgMap[expr];
  c.rect(0, 0, w, h, bgA);
  // Comic diagonal stripes / speed lines / scanlines
  for (let i = -h; i < w + h; i += 10) {
    c.line(i, 0, i - 16, h, bgB, 4);
  }
  if (expr === 'mach3' || expr === 'mach4' || expr === 'combo' || expr === 'taunt') {
    c.star(w * 0.5, h * 0.55, 36, 18, 10, expr === 'mach4' ? C_CYAN : C_GOLD);
  }

  const cx = w * 0.5;
  const cy = h * 0.62;

  if (expr === 'static') {
    // Mischievous yellow Static mugshot
    c.poly([[cx - 10, cy - 12], [cx - 22, cy - 28], [cx - 3, cy - 18]], S0);
    c.poly([[cx + 6, cy - 12], [cx + 18, cy - 28], [cx + 14, cy - 12]], S1);
    c.ellipse(cx, cy - 2, 18, 16, S0);
    c.ellipse(cx + 1, cy + 1, 14, 11, S4);
    c.roundRect(cx - 12, cy - 10, 24, 9, 3, S2);
    c.circle(cx - 5, cy - 5, 4, EYE_W);
    c.circle(cx + 6, cy - 5, 4, EYE_W);
    c.circle(cx - 4, cy - 5, 2, INK);
    c.circle(cx + 7, cy - 5, 2, INK);
    c.ellipse(cx + 1, cy + 7, 10, 5, EYE_W);
    c.line(cx - 8, cy + 7, cx + 10, cy + 7, INK, 1.4);
    c.line(cx - 3, cy + 3, cx - 3, cy + 11, INK, 1.2);
    c.line(cx + 4, cy + 3, cx + 4, cy + 11, INK, 1.2);
  } else if (expr === 'gusto') {
    // Cozy Gusto & Chonks smiling face
    c.ellipse(cx + 10, cy + 4, 15, 13, C_RAT);
    c.circle(cx + 18, cy + 3, 3.5, C_PINK);
    c.circle(cx + 11, cy - 1, 3, EYE_W);
    c.px(cx + 12, cy - 1, INK);
    c.ellipse(cx - 10, cy + 1, 13, 12, P4);
    c.ellipse(cx - 10, cy - 10, 14, 6, C_RED);
    c.circle(cx - 13, cy - 2, 3, EYE_W);
    c.circle(cx - 6, cy - 2, 3, EYE_W);
    c.circle(cx - 12, cy - 2, 1.5, INK);
    c.circle(cx - 5, cy - 2, 1.5, INK);
    c.ellipse(cx - 9, cy + 5, 8, 3.5, C_BRN_D);
  } else if (expr === 'knight') {
    // Steel knight helmet close-up
    c.poly([[cx, cy - 26], [cx + 16, cy - 22], [cx + 6, cy - 12]], C_RED);
    c.roundRect(cx - 16, cy - 16, 32, 30, 8, C_STEEL);
    c.rect(cx - 14, cy - 5, 28, 6, INK);
    c.circle(cx - 5, cy - 2, 2.2, C_GOLD);
    c.circle(cx + 5, cy - 2, 2.2, C_GOLD);
    c.line(cx - 10, cy - 12, cx - 4, cy - 8, EYE_W, 2);
  } else if (expr === 'ghost') {
    c.ellipse(cx, cy - 2, 18, 19, C_GHOST);
    c.ellipse(cx - 6, cy - 5, 5, 6, EYE_W);
    c.ellipse(cx + 6, cy - 5, 5, 6, EYE_W);
    c.circle(cx - 5, cy - 4, 2.5, INK);
    c.circle(cx + 7, cy - 4, 2.5, INK);
    c.ellipse(cx, cy + 7, 6, 7, INK);
  } else {
    // Expressive Chef Peppo close-up!
    const eyesMap: Record<string, PeppoPoseOpts['eyes']> = {
      idle: 'wide',
      mach2: 'rage',
      mach3: 'rage',
      mach4: 'rage',
      panic: 'wide',
      hurt: 'dizzy',
      taunt: 'shades',
      combo: 'wink',
      happy: 'wide',
      boss: 'wide',
      shotgun: 'shades',
      fire: 'rage',
    };
    const mouthMap: Record<string, PeppoPoseOpts['mouth']> = {
      idle: 'worry',
      mach2: 'grin',
      mach3: 'scream',
      mach4: 'scream',
      panic: 'scream',
      hurt: 'ouch',
      taunt: 'smug',
      combo: 'grin',
      happy: 'grin',
      boss: 'o',
      shotgun: 'smug',
      fire: 'scream',
    };
    // Big shoulders + oversized mugshot head
    c.ellipse(cx, cy + 20, 22, 12, P2);
    c.ellipse(cx, cy + 18, 14, 8, P0);
    // Larger scaled close-up toque
    c.ellipse(cx - 10, cy - 22, 11, 9, P0);
    c.ellipse(cx + 10, cy - 22, 11, 9, P1);
    c.ellipse(cx, cy - 25, 13, 10, P0);
    drawPeppoHead(
      c,
      cx - 2,
      cy - 1,
      expr === 'mach3' || expr === 'mach4' ? -5 : 0,
      eyesMap[expr] ?? 'wide',
      mouthMap[expr] ?? 'worry',
      expr === 'panic' || expr === 'idle' || expr === 'boss'
    );
    if (expr === 'fire') {
      c.poly([[cx + 6, cy + 8], [cx + 28, cy + 2], [cx + 26, cy + 18], [cx + 8, cy + 14]], C_ORG);
      c.poly([[cx + 10, cy + 9], [cx + 23, cy + 6], [cx + 21, cy + 14]], C_YEL);
    }
    if (expr === 'shotgun') {
      c.rect(cx + 8, cy + 8, 22, 6, C_STEEL_D);
      c.rect(cx + 8, cy + 8, 22, 2, C_STEEL_L);
    }
    if (expr === 'panic') {
      // Extra panic sweat drops
      c.circle(cx + 17, cy - 10, 3, C_CYAN);
      c.circle(cx - 20, cy - 6, 2.5, C_CYAN);
    }
  }

  // Subtle CRT glass reflection gloss in top-left corner + scanlines
  c.line(5, 5, 18, 5, [255, 255, 255, 140], 2);
  c.line(5, 5, 5, 14, [255, 255, 255, 140], 2);
  for (let sy = 1; sy < h; sy += 4) {
    c.line(0, sy, w - 1, sy, [0, 0, 0, 35], 1);
  }
}

// ============================================================================
// Enemies, Bosses, Props, Pickups, Toppins, Tiles, Rank Badges & Bitmap Font
// ============================================================================

function drawEnemy(c: SpriteCanvas, id: string): void {
  const cx = 32;
  const by = 54;
  switch (id) {
    case 'enemy_slime_glob':
      c.ellipse(cx, by - 12, 18, 14, C_CHEESE);
      c.ellipse(cx + 3, by - 9, 14, 10, C_CHEESE_D);
      c.ellipse(cx - 3, by - 15, 11, 7, C_YEL);
      c.circle(cx - 5, by - 15, 4.5, EYE_W);
      c.circle(cx + 6, by - 15, 4.5, EYE_W);
      c.circle(cx - 4, by - 15, 2, INK);
      c.circle(cx + 7, by - 15, 2, INK);
      c.arc(cx + 1, by - 8, 6, 3, 0, Math.PI, INK, 1.5);
      break;
    case 'enemy_fork_imp':
      c.ellipse(cx - 2, by - 15, 13, 14, C_CREAM);
      c.ellipse(cx - 2, by - 25, 14, 8, C_STEEL);
      c.rect(cx - 10, by - 24, 16, 4, INK);
      c.circle(cx - 5, by - 22, 1.6, C_YEL);
      c.circle(cx + 2, by - 22, 1.6, C_YEL);
      // Giant silver dining fork pointing forward!
      c.line(cx + 6, by - 15, cx + 24, by - 15, C_STEEL_L, 3);
      c.line(cx + 19, by - 21, cx + 26, by - 21, C_STEEL_L, 2);
      c.line(cx + 19, by - 15, cx + 26, by - 15, C_STEEL_L, 2);
      c.line(cx + 19, by - 9, cx + 26, by - 9, C_STEEL_L, 2);
      c.line(cx + 19, by - 21, cx + 19, by - 9, C_STEEL_D, 2.5);
      break;
    case 'enemy_swedish_ape':
      c.ellipse(cx, by - 16, 15, 15, C_BRN);
      c.ellipse(cx, by - 13, 10, 9, C_BRN_L);
      c.circle(cx - 13, by - 24, 5, C_BRN);
      c.circle(cx + 13, by - 24, 5, C_BRN);
      c.circle(cx - 4, by - 21, 3.8, EYE_W);
      c.circle(cx + 5, by - 21, 3.8, EYE_W);
      c.circle(cx - 3, by - 21, 1.8, INK);
      c.circle(cx + 6, by - 21, 1.8, INK);
      // Yellow banana held up
      c.arc(cx + 15, by - 25, 7, 7, -0.5, 1.8, C_YEL, 3.5);
      break;
    case 'enemy_pepper_goblin':
      c.ellipse(cx, by - 14, 12, 14, C_GRN);
      c.tri(cx - 12, by - 22, cx + 12, by - 22, cx, by - 36, C_RED);
      c.circle(cx - 4, by - 18, 3.5, C_YEL);
      c.circle(cx + 5, by - 18, 3.5, C_YEL);
      c.px(cx - 3, by - 18, INK);
      c.px(cx + 6, by - 18, INK);
      c.ellipse(cx + 1, by - 11, 6, 3, EYE_W);
      break;
    case 'enemy_knight_squire':
      c.roundRect(cx - 13, by - 32, 26, 28, 6, C_STEEL);
      c.poly([[cx, by - 38], [cx - 8, by - 30], [cx + 8, by - 30]], C_PURP);
      c.rect(cx - 10, by - 24, 20, 5, INK);
      c.circle(cx - 4, by - 22, 2, C_CYAN);
      c.circle(cx + 4, by - 22, 2, C_CYAN);
      c.line(cx + 14, by - 30, cx + 18, by - 8, C_STEEL_L, 3.5);
      break;
    case 'enemy_bomb_imp':
      c.ellipse(cx, by - 12, 12, 12, C_GRN_D);
      c.circle(cx - 4, by - 15, 3.5, EYE_W);
      c.circle(cx + 4, by - 15, 3.5, EYE_W);
      c.px(cx - 3, by - 15, INK);
      c.px(cx + 5, by - 15, INK);
      // Giant lit bomb overhead!
      c.circle(cx, by - 31, 10, P2);
      c.circle(cx - 3, by - 34, 2.5, C_STEEL_L);
      c.star(cx + 7, by - 43, 6, 2.5, 5, C_YEL);
      c.circle(cx + 7, by - 43, 2, C_RED);
      break;
    case 'enemy_tribal_cheese':
      c.ellipse(cx, by - 15, 14, 15, C_CHEESE);
      // Feathers
      c.tri(cx - 12, by - 28, cx - 4, by - 26, cx - 10, by - 40, C_RED);
      c.tri(cx - 4, by - 28, cx + 4, by - 28, cx, by - 42, C_CYAN);
      c.tri(cx + 4, by - 26, cx + 12, by - 28, cx + 10, by - 40, C_GOLD);
      c.circle(cx - 4, by - 18, 3.5, EYE_W);
      c.circle(cx + 5, by - 18, 3.5, EYE_W);
      c.px(cx - 3, by - 18, INK);
      c.px(cx + 6, by - 18, INK);
      c.line(cx + 12, by - 30, cx + 22, by - 10, C_BRN, 2.5);
      break;
    case 'enemy_cow_charger':
      c.ellipse(cx - 2, by - 16, 20, 14, C_CREAM);
      c.ellipse(cx - 10, by - 18, 6, 5, INK);
      c.ellipse(cx + 2, by - 12, 5, 4, INK);
      c.ellipse(cx + 15, by - 16, 8, 7, C_PINK);
      c.tri(cx + 10, by - 24, cx + 15, by - 21, cx + 20, by - 34, C_GOLD);
      c.circle(cx + 10, by - 20, 3, C_RED);
      c.rect(cx - 14, by - 4, 5, 7, INK);
      c.rect(cx + 6, by - 4, 5, 7, INK);
      break;
    case 'enemy_ghost_ghoul':
      c.ellipse(cx, by - 22, 15, 17, C_GHOST);
      c.tri(cx - 15, by - 16, cx - 8, by - 3, cx - 2, by - 14, C_GHOST);
      c.tri(cx - 4, by - 14, cx + 2, by - 2, cx + 8, by - 14, C_GHOST);
      c.tri(cx + 6, by - 14, cx + 14, by - 3, cx + 15, by - 16, C_GHOST);
      c.ellipse(cx - 5, by - 25, 4, 5, C_PURP_D);
      c.ellipse(cx + 5, by - 25, 4, 5, C_PURP_D);
      c.circle(cx - 5, by - 25, 1.8, C_LIME);
      c.circle(cx + 5, by - 25, 1.8, C_LIME);
      c.ellipse(cx, by - 14, 6, 5, C_PURP_D);
      break;
    case 'enemy_mushroom_spitter':
      c.roundRect(cx - 9, by - 18, 18, 16, 4, C_CREAM);
      c.ellipse(cx, by - 24, 18, 11, C_RED);
      c.circle(cx - 9, by - 26, 3.5, EYE_W);
      c.circle(cx + 6, by - 28, 4, EYE_W);
      c.circle(cx + 11, by - 21, 2.5, EYE_W);
      c.circle(cx - 3, by - 12, 3, EYE_W);
      c.circle(cx + 5, by - 12, 3, EYE_W);
      c.px(cx - 2, by - 12, INK);
      c.px(cx + 6, by - 12, INK);
      c.circle(cx + 4, by - 6, 3, C_LIME);
      break;
    case 'enemy_cannon_goblin':
      c.roundRect(cx - 14, by - 22, 28, 14, 5, P2);
      c.ellipse(cx + 14, by - 15, 4, 7, C_STEEL_D);
      c.circle(cx - 4, by - 7, 7, C_BRN);
      c.circle(cx - 4, by - 7, 2.5, C_GOLD);
      // Goblin peeking on top
      c.circle(cx - 5, by - 27, 7, C_GRN);
      c.circle(cx - 3, by - 28, 2.5, C_YEL);
      c.px(cx - 2, by - 28, INK);
      break;
    case 'enemy_giant_bee':
      c.ellipse(cx - 4, by - 28, 9, 6, C_CYAN);
      c.ellipse(cx + 6, by - 30, 8, 5, EYE_W);
      c.ellipse(cx, by - 18, 17, 12, C_YEL);
      c.rect(cx - 8, by - 29, 4, 22, INK);
      c.rect(cx + 1, by - 29, 4, 22, INK);
      c.tri(cx - 16, by - 18, cx - 26, by - 15, cx - 16, by - 13, INK);
      c.circle(cx + 11, by - 20, 4, EYE_W);
      c.circle(cx + 12, by - 20, 2, C_RED);
      break;
    case 'enemy_archer_goblin':
      c.ellipse(cx - 2, by - 14, 12, 14, C_GRN);
      c.tri(cx - 14, by - 24, cx + 10, by - 24, cx - 6, by - 36, C_GRN_D);
      c.tri(cx + 4, by - 26, cx + 12, by - 34, cx + 8, by - 24, C_RED);
      c.circle(cx + 2, by - 18, 3.5, EYE_W);
      c.px(cx + 3, by - 18, INK);
      c.arc(cx + 10, by - 15, 9, 13, -1.2, 1.2, C_BRN_L, 2.5);
      c.line(cx + 10, by - 15, cx + 24, by - 15, C_GOLD, 2);
      break;
    case 'enemy_ufo_olive':
      c.ellipse(cx, by - 23, 12, 11, C_CYAN);
      c.ellipse(cx, by - 22, 7, 8, C_GRN);
      c.circle(cx, by - 23, 3, C_RED); // Pimento!
      c.ellipse(cx, by - 14, 22, 8, C_STEEL);
      c.ellipse(cx, by - 16, 18, 4, C_STEEL_L);
      c.circle(cx - 12, by - 14, 2.5, C_YEL);
      c.circle(cx, by - 12, 2.5, C_MAG);
      c.circle(cx + 12, by - 14, 2.5, C_LIME);
      break;
    case 'enemy_burger_golfer':
      c.ellipse(cx, by - 8, 16, 6, C_BRN_L); // bottom bun
      c.rect(cx - 16, by - 15, 32, 6, C_BRN_D); // patty
      c.poly([[cx - 17, by - 16], [cx + 17, by - 16], [cx + 12, by - 11], [cx - 12, by - 13]], C_CHEESE);
      c.ellipse(cx, by - 22, 16, 8, C_BRN_L); // top bun
      c.rect(cx - 14, by - 28, 28, 4, C_GRN); // golf visor
      c.circle(cx - 4, by - 21, 3, EYE_W);
      c.circle(cx + 6, by - 21, 3, EYE_W);
      c.px(cx - 3, by - 21, INK);
      c.px(cx + 7, by - 21, INK);
      c.line(cx + 16, by - 30, cx + 22, by - 6, C_STEEL_L, 2.5);
      break;
    case 'enemy_ninja_slice':
      c.tri(cx - 15, by - 6, cx + 15, by - 6, cx, by - 36, C_CHEESE);
      c.rect(cx - 15, by - 8, 30, 5, C_BRN_L);
      c.circle(cx - 4, by - 14, 3, C_RED);
      c.circle(cx + 5, by - 12, 3, C_RED);
      // Ninja headband!
      c.rect(cx - 9, by - 25, 18, 5, C_PURP_D);
      c.circle(cx - 3, by - 23, 2, EYE_W);
      c.circle(cx + 4, by - 23, 2, EYE_W);
      c.line(cx + 8, by - 18, cx + 25, by - 30, C_STEEL_L, 2.8);
      break;
    case 'enemy_clone_bot':
      c.line(cx, by - 36, cx, by - 44, C_STEEL_D, 2.5);
      c.circle(cx, by - 45, 3, C_RED);
      c.roundRect(cx - 14, by - 36, 28, 28, 4, C_STEEL);
      c.rect(cx - 10, by - 29, 20, 7, INK);
      c.rect(cx - 8, by - 27, 16, 3, C_RED);
      c.rect(cx - 9, by - 18, 18, 6, C_STEEL_D);
      c.rect(cx - 10, by - 8, 6, 8, C_STEEL_D);
      c.rect(cx + 4, by - 8, 6, 8, C_STEEL_D);
      break;
    case 'enemy_fake_santa':
      c.ellipse(cx, by - 15, 16, 15, C_RED);
      c.rect(cx - 15, by - 14, 30, 4, INK);
      c.rect(cx - 3, by - 15, 6, 6, C_GOLD);
      c.ellipse(cx, by - 26, 11, 9, EYE_W); // fluffy beard
      c.tri(cx - 12, by - 30, cx + 10, by - 30, cx - 2, by - 44, C_RED);
      c.circle(cx - 2, by - 44, 3.5, EYE_W);
      c.circle(cx - 4, by - 28, 2.5, C_LIME);
      c.circle(cx + 4, by - 28, 2.5, C_LIME);
      break;
    case 'enemy_animatronic_bot':
      c.circle(cx - 10, by - 38, 6, C_PURP);
      c.circle(cx + 10, by - 38, 6, C_PURP);
      c.roundRect(cx - 14, by - 34, 28, 26, 6, C_PURP);
      c.ellipse(cx, by - 15, 10, 6, C_CREAM);
      c.circle(cx - 5, by - 26, 4, C_YEL);
      c.circle(cx + 5, by - 26, 4, C_YEL);
      c.px(cx - 5, by - 26, INK);
      c.px(cx + 5, by - 26, INK);
      // Creepy bowtie
      c.tri(cx - 8, by - 9, cx, by - 6, cx - 8, by - 3, C_RED);
      c.tri(cx + 8, by - 9, cx, by - 6, cx + 8, by - 3, C_RED);
      break;
    case 'enemy_blitz_trooper':
      c.ellipse(cx, by - 14, 13, 14, C_GRN_D);
      c.ellipse(cx, by - 27, 15, 9, hexToRgba('#49633c')); // steel helmet
      c.circle(cx + 4, by - 21, 3, EYE_W);
      c.px(cx + 5, by - 21, INK);
      // Rifle
      c.rect(cx + 4, by - 16, 20, 4, P2);
      c.rect(cx + 2, by - 14, 7, 5, C_BRN);
      break;
    case 'enemy_pickle_brawler':
      c.roundRect(cx - 10, by - 36, 20, 32, 9, C_GRN);
      c.circle(cx - 6, by - 26, 2, C_GRN_D);
      c.circle(cx + 6, by - 14, 2, C_GRN_D);
      c.circle(cx - 3, by - 26, 3.5, EYE_W);
      c.circle(cx + 5, by - 26, 3.5, EYE_W);
      c.px(cx - 2, by - 26, INK);
      c.px(cx + 6, by - 26, INK);
      // Big red boxing gloves!
      c.circle(cx - 15, by - 18, 6.5, C_RED);
      c.circle(cx + 16, by - 18, 6.5, C_RED);
      break;
    case 'enemy_static_minion':
    default:
      c.ellipse(cx, by - 14, 13, 13, S0);
      c.roundRect(cx - 9, by - 21, 18, 6, 2, S2);
      c.circle(cx - 4, by - 18, 3, EYE_W);
      c.circle(cx + 4, by - 18, 3, EYE_W);
      c.px(cx - 3, by - 18, INK);
      c.px(cx + 5, by - 18, INK);
      // Propeller cap!
      c.line(cx, by - 27, cx, by - 33, C_STEEL, 2);
      c.rect(cx - 10, by - 34, 20, 3, C_CYAN);
      c.ellipse(cx, by - 10, 6, 2.5, EYE_W);
      break;
  }
  c.inkOutline(INK, 1);
}

function drawBoss(c: SpriteCanvas, id: string): void {
  const cx = 48;
  const cy = 50;
  if (id === 'boss_b_artiste') {
    // Giant cocky crimson Bell-Pepper Artiste with smug shades & white gloves!
    c.line(cx, 12, cx + 6, 22, C_GRN_D, 6);
    c.ellipse(cx + 2, 12, 8, 4, C_GRN);
    // Lobed chunky red bell pepper torso
    c.ellipse(cx - 14, cy + 2, 16, 24, C_RED_D);
    c.ellipse(cx + 14, cy + 2, 16, 24, C_RED);
    c.ellipse(cx, cy + 2, 18, 27, C_RED);
    c.ellipse(cx - 6, cy - 6, 8, 16, C_RED_L);
    // Smug triangular shades!
    c.poly([[cx - 22, cy - 12], [cx - 2, cy - 6], [cx - 16, cy]], INK);
    c.poly([[cx + 22, cy - 12], [cx + 2, cy - 6], [cx + 16, cy]], INK);
    c.line(cx - 18, cy - 9, cx - 10, cy - 5, EYE_W, 2);
    c.line(cx + 10, cy - 9, cx + 16, cy - 5, EYE_W, 2);
    // Huge cocky grin
    c.ellipse(cx, cy + 10, 15, 7, EYE_W);
    c.line(cx - 14, cy + 10, cx + 14, cy + 10, INK, 1.5);
    // Chunky cartoon white gloves + paintbrush!
    c.circle(cx - 28, cy + 12, 9, EYE_W);
    c.circle(cx + 28, cy + 6, 9, EYE_W);
    c.line(cx + 28, cy + 6, cx + 38, cy - 18, C_BRN, 3.5);
    c.tri(cx + 35, cy - 18, cx + 43, cy - 18, cx + 40, cy - 28, C_GOLD);
    // Sneakers
    c.ellipse(cx - 12, 83, 10, 6, EYE_W);
    c.ellipse(cx + 12, 83, 10, 6, EYE_W);
  } else if (id === 'boss_b_cheddar') {
    // Western Cowboy Cheese Gunslinger!
    c.ellipse(cx, cy + 10, 26, 22, C_CHEESE);
    c.ellipse(cx + 5, cy + 14, 18, 15, C_CHEESE_D);
    // Red cowboy bandana + gold sheriff star!
    c.tri(cx - 20, cy + 12, cx + 20, cy + 12, cx, cy + 28, C_RED);
    c.star(cx + 14, cy + 20, 6, 2.5, 5, C_GOLD);
    // Big western cowboy Stetson hat!
    c.ellipse(cx, cy - 14, 34, 8, C_BRN_D);
    c.roundRect(cx - 18, cy - 34, 36, 22, 6, C_BRN);
    c.rect(cx - 18, cy - 18, 36, 5, C_RED);
    // Narrow squint western eyes
    c.rect(cx - 14, cy - 4, 10, 4, EYE_W);
    c.rect(cx + 4, cy - 4, 10, 4, EYE_W);
    c.px(cx - 8, cy - 2, INK);
    c.px(cx + 10, cy - 2, INK);
    // Twin cowboy boots & six-shooter!
    c.ellipse(cx - 14, 83, 10, 6, C_BRN_D);
    c.ellipse(cx + 14, 83, 10, 6, C_BRN_D);
    c.rect(cx + 20, cy + 6, 18, 6, C_STEEL);
    c.rect(cx + 18, cy + 10, 6, 8, C_BRN);
  } else if (id === 'boss_b_static') {
    // Grand Showman Static Boss with dramatic cape & giant mallet!
    c.poly([[cx - 26, cy - 8], [cx - 42, 78], [cx + 42, 78], [cx + 26, cy - 8]], S2);
    c.poly([[cx - 14, 24], [cx - 28, 6], [cx - 4, 18]], S0);
    c.poly([[cx + 14, 24], [cx + 28, 6], [cx + 4, 18]], S1);
    c.ellipse(cx, cy - 6, 20, 18, S0);
    c.ellipse(cx, cy - 4, 15, 12, S4);
    c.roundRect(cx - 16, cy - 14, 32, 10, 3, S2);
    c.circle(cx - 6, cy - 9, 4.5, EYE_W);
    c.circle(cx + 6, cy - 9, 4.5, EYE_W);
    c.circle(cx - 5, cy - 9, 2, INK);
    c.circle(cx + 7, cy - 9, 2, INK);
    c.ellipse(cx, cy + 4, 12, 6, EYE_W);
    c.ellipse(cx, cy + 24, 18, 16, S0);
    c.ellipse(cx - 12, 83, 9, 5, S3);
    c.ellipse(cx + 12, 83, 9, 5, S3);
    // Giant cartoon mallet
    c.line(cx + 20, cy + 16, cx + 34, cy - 14, C_BRN, 4);
    c.roundRect(cx + 22, cy - 28, 22, 14, 4, S3);
  } else if (id === 'boss_b_doppel') {
    // Uncanny melty lanky Doppel-Peppo!
    c.ellipse(cx, 18, 14, 12, P0);
    c.ellipse(cx + 6, 14, 12, 10, P1);
    // Melty stretched torso & dripping sleeves
    c.poly([[cx - 16, 36], [cx + 16, 36], [cx + 22, 74], [cx - 22, 74]], P2);
    c.ellipse(cx, 32, 15, 14, P4);
    // Dripping cheeks
    c.ellipse(cx - 11, 44, 4, 9, P5);
    c.ellipse(cx + 12, 46, 4, 10, P5);
    // Uncanny mismatched wide eyes!
    c.circle(cx - 6, 29, 6, EYE_W);
    c.circle(cx + 7, 30, 4.5, EYE_W);
    c.circle(cx - 7, 28, 2.2, C_RED);
    c.circle(cx + 8, 31, 1.8, INK);
    // Jagged huge uncanny grin!
    c.poly([[cx - 13, 38], [cx + 14, 36], [cx + 10, 48], [cx - 10, 46]], INK);
    for (let tx = cx - 9; tx <= cx + 9; tx += 4) {
      c.rect(tx, 38, 2.5, 4, EYE_W);
    }
    // Lanky clawed hands
    c.line(cx - 16, 44, cx - 34, 62, P0, 5);
    c.line(cx + 16, 44, cx + 34, 60, P0, 5);
    c.circle(cx - 35, 64, 6, P4);
    c.circle(cx + 35, 62, 6, P4);
  } else if (id === 'boss_b_megacrust') {
    // Theatrical Lord Dough supervillain!
    c.poly([[cx - 24, 34], [cx - 38, 86], [cx + 38, 86], [cx + 24, 34]], C_PURP_D);
    c.poly([[cx - 16, 38], [cx + 16, 38], [cx + 10, 82], [cx - 10, 82]], C_RED);
    // Giant manic pizza-wedge villain head!
    c.tri(cx - 24, 38, cx + 24, 38, cx, 6, C_CHEESE);
    c.rect(cx - 24, 34, 48, 7, C_BRN_L);
    c.circle(cx - 8, 26, 4.5, EYE_W);
    c.circle(cx + 8, 26, 4.5, EYE_W);
    c.circle(cx - 7, 26, 2, C_RED);
    c.circle(cx + 9, 26, 2, C_RED);
    c.ellipse(cx, 35, 13, 5, EYE_W);
    // Dramatic bowtie & white gloves
    c.star(cx, 44, 7, 3, 4, C_GOLD);
    c.circle(cx - 28, 56, 8, EYE_W);
    c.circle(cx + 28, 56, 8, EYE_W);
  } else {
    // mega_crust_chaser: GIANT menacing floating pepperoni pizza moon with mustache!
    c.circle(cx, cy, 40, C_BRN_L); // crispy crust rim
    c.circle(cx, cy, 34, C_RED); // marinara ring
    c.circle(cx, cy, 31, C_CHEESE); // melted cheese face
    // Pepperoni cheeks & brow spots
    c.circle(cx - 20, cy + 8, 6.5, C_RED_D);
    c.circle(cx + 20, cy + 8, 6.5, C_RED_D);
    c.circle(cx - 16, cy - 18, 5, C_RED);
    c.circle(cx + 16, cy - 18, 5, C_RED);
    // Glowing sinister cartoon eyes & furrowed angry brows
    c.ellipse(cx - 11, cy - 6, 8, 9, EYE_W);
    c.ellipse(cx + 11, cy - 6, 8, 9, EYE_W);
    c.circle(cx - 9, cy - 5, 4, C_RED);
    c.circle(cx + 9, cy - 5, 4, C_RED);
    c.circle(cx - 9, cy - 5, 2, INK);
    c.circle(cx + 9, cy - 5, 2, INK);
    c.line(cx - 22, cy - 16, cx - 2, cy - 10, INK, 4);
    c.line(cx + 22, cy - 16, cx + 2, cy - 10, INK, 4);
    // Giant curling cartoon nose & dark mustache
    c.ellipse(cx, cy + 3, 7, 5, C_ORG);
    c.poly(
      [
        [cx - 24, cy + 12],
        [cx - 8, cy + 7],
        [cx + 8, cy + 7],
        [cx + 24, cy + 12],
        [cx + 18, cy + 18],
        [cx, cy + 13],
        [cx - 18, cy + 18],
      ],
      INK
    );
    // Chomping toothy grin
    c.ellipse(cx, cy + 21, 16, 8, INK);
    for (let tx = cx - 12; tx <= cx + 10; tx += 5) {
      c.rect(tx, cy + 15, 3.5, 5, EYE_W);
      c.rect(tx + 1, cy + 23, 3.5, 4, EYE_W);
    }
  }
  c.inkOutline(INK, 2);
}

function drawToppin(c: SpriteCanvas, index: number): void {
  const cx = 18;
  const by = 30;
  if (index === 0) {
    // Shroom Pal
    c.roundRect(cx - 6, by - 12, 12, 10, 3, C_CREAM);
    c.ellipse(cx, by - 16, 13, 9, C_RED);
    c.circle(cx - 6, by - 18, 3, EYE_W);
    c.circle(cx + 5, by - 19, 3, EYE_W);
    c.circle(cx - 2, by - 8, 2, INK);
    c.circle(cx + 3, by - 8, 2, INK);
  } else if (index === 1) {
    // Cheese Pal
    c.tri(cx - 12, by - 4, cx + 12, by - 4, cx, by - 25, C_CHEESE);
    c.circle(cx - 5, by - 9, 2.5, C_CHEESE_D);
    c.circle(cx + 4, by - 13, 2, C_CHEESE_D);
    c.circle(cx - 3, by - 13, 2.5, EYE_W);
    c.circle(cx + 3, by - 13, 2.5, EYE_W);
    c.px(cx - 2, by - 13, INK);
    c.px(cx + 4, by - 13, INK);
  } else if (index === 2) {
    // Tomato Pal
    c.circle(cx, by - 12, 11, C_RED);
    c.circle(cx - 4, by - 16, 3, C_RED_L);
    c.star(cx, by - 23, 7, 3, 5, C_GRN);
    c.circle(cx - 3, by - 12, 2.5, EYE_W);
    c.circle(cx + 4, by - 12, 2.5, EYE_W);
    c.px(cx - 2, by - 12, INK);
    c.px(cx + 5, by - 12, INK);
  } else if (index === 3) {
    // Sausage Pal
    c.roundRect(cx - 7, by - 24, 14, 21, 7, C_BRN);
    c.roundRect(cx - 5, by - 22, 4, 16, 2, C_BRN_L);
    // Cool shades
    c.rect(cx - 6, by - 18, 12, 4, INK);
    c.px(cx - 4, by - 17, EYE_W);
    c.px(cx + 2, by - 17, EYE_W);
  } else {
    // Pineapple Pal
    c.tri(cx - 7, by - 20, cx + 7, by - 20, cx, by - 29, C_GRN);
    c.tri(cx - 10, by - 19, cx - 2, by - 20, cx - 8, by - 27, C_GRN_D);
    c.tri(cx + 10, by - 19, cx + 2, by - 20, cx + 8, by - 27, C_GRN_D);
    c.ellipse(cx, by - 11, 10, 11, C_GOLD);
    c.rect(cx - 8, by - 15, 16, 5, INK); // shades!
    c.line(cx - 6, by - 14, cx - 3, by - 11, C_CYAN, 1.4);
    c.line(cx + 2, by - 14, cx + 5, by - 11, C_CYAN, 1.4);
  }
  // Cute stubby dancing feet
  c.ellipse(cx - 5, by, 3.5, 2, INK);
  c.ellipse(cx + 5, by, 3.5, 2, INK);
  c.inkOutline(INK, 1);
}

function drawTile(c: SpriteCanvas, kind: string): void {
  const s = 32;
  switch (kind) {
    case 'tile_break_marble':
      c.rect(0, 0, s, s, C_STONE_L);
      c.rect(0, 0, s, 4, EYE_W);
      c.rect(0, s - 4, s, 4, C_STONE);
      c.rect(0, 0, 2, s, INK);
      c.rect(s - 2, 0, 2, s, INK);
      c.rect(0, 0, s, 2, INK);
      c.rect(0, s - 2, s, 2, INK);
      // Bold cartoon marble cracks!
      c.line(6, 3, 14, 14, INK, 2);
      c.line(14, 14, 9, 26, INK, 2);
      c.line(14, 14, 25, 18, INK, 1.8);
      c.line(22, 6, 16, 13, C_STONE_D, 1.5);
      break;
    case 'tile_break_metal':
      c.rect(0, 0, s, s, C_STEEL_D);
      c.rect(2, 2, s - 4, s - 4, C_STEEL);
      // Diagonal hazard band
      for (let i = -s; i < s; i += 10) {
        c.line(i, 4, i + 10, 14, C_YEL, 3);
      }
      c.rect(2, 13, s - 4, 15, C_STEEL);
      c.line(4, 15, 26, 25, C_STEEL_L, 2);
      // Corner rivets
      c.circle(6, 6, 2, INK);
      c.circle(26, 6, 2, INK);
      c.circle(6, 26, 2, INK);
      c.circle(26, 26, 2, INK);
      c.rect(0, 0, s, 2, INK);
      c.rect(0, s - 2, s, 2, INK);
      c.rect(0, 0, 2, s, INK);
      c.rect(s - 2, 0, 2, s, INK);
      break;
    case 'tile_ice_solid':
      c.rect(0, 0, s, s, hexToRgba('#80e5ff'));
      c.rect(2, 2, s - 4, 6, EYE_W);
      c.line(5, 24, 24, 5, EYE_W, 2.5);
      c.line(13, 27, 27, 13, C_CYAN, 2);
      c.rect(0, 0, s, 2, C_CYAN_D);
      c.rect(0, s - 2, s, 2, C_CYAN_D);
      c.rect(0, 0, 2, s, C_CYAN_D);
      c.rect(s - 2, 0, 2, s, C_CYAN_D);
      break;
    case 'tile_solid_stone':
      c.rect(0, 0, s, s, C_STONE);
      c.rect(0, 0, s, 4, C_STONE_L);
      c.rect(0, s - 4, s, 4, C_STONE_D);
      c.line(0, 16, s, 16, INK, 1.5);
      c.line(16, 0, 16, 16, INK, 1.5);
      c.line(8, 16, 8, s, INK, 1.5);
      c.line(24, 16, 24, s, INK, 1.5);
      break;
    case 'tile_solid_brick':
      c.rect(0, 0, s, s, hexToRgba('#9e4b3a'));
      c.rect(0, 0, s, 4, hexToRgba('#cc6c56'));
      c.line(0, 10, s, 10, INK, 1.5);
      c.line(0, 21, s, 21, INK, 1.5);
      c.line(14, 0, 14, 10, INK, 1.5);
      c.line(6, 10, 6, 21, INK, 1.5);
      c.line(22, 10, 22, 21, INK, 1.5);
      c.line(16, 21, 16, s, INK, 1.5);
      break;
    case 'tile_solid_wood':
      c.rect(0, 0, s, s, C_BRN);
      c.rect(0, 0, s, 4, C_BRN_L);
      for (let y = 8; y < s; y += 8) {
        c.line(0, y, s, y, C_BRN_D, 1.5);
      }
      c.circle(5, 4, 1.5, INK);
      c.circle(27, 20, 1.5, INK);
      break;
    case 'tile_solid_metal':
      c.rect(0, 0, s, s, C_STEEL_D);
      c.rect(2, 2, s - 4, 4, C_STEEL_L);
      c.rect(3, 6, s - 6, s - 9, C_STEEL);
      c.circle(6, 6, 1.5, INK);
      c.circle(26, 6, 1.5, INK);
      c.circle(6, 26, 1.5, INK);
      c.circle(26, 26, 1.5, INK);
      break;
    case 'tile_solid_cheese':
      c.rect(0, 0, s, s, C_CHEESE);
      c.rect(0, 0, s, 4, C_YEL);
      c.circle(9, 13, 4, C_CHEESE_D);
      c.circle(23, 22, 5, C_CHEESE_D);
      c.circle(22, 8, 2.5, C_CHEESE_D);
      break;
    case 'tile_solid_neon':
      c.rect(0, 0, s, s, hexToRgba('#251c45'));
      c.rect(0, 0, s, 3, C_MAG);
      c.rect(0, s - 3, s, 3, C_CYAN);
      c.line(2, 2, s - 2, s - 2, hexToRgba('#49327a'), 1.5);
      c.line(s - 2, 2, 2, s - 2, hexToRgba('#49327a'), 1.5);
      break;
    case 'tile_solid_snow':
      c.rect(0, 0, s, s, hexToRgba('#809bbd'));
      c.rect(0, 0, s, 9, EYE_W);
      c.circle(6, 9, 4, EYE_W);
      c.circle(16, 10, 4.5, EYE_W);
      c.circle(26, 9, 4, EYE_W);
      break;
    case 'tile_solid_war':
      c.rect(0, 0, s, s, hexToRgba('#4e593e'));
      c.rect(0, 0, s, 4, hexToRgba('#7a8a5e'));
      c.rect(4, 12, 24, 8, hexToRgba('#343b29'));
      c.circle(6, 6, 1.5, INK);
      c.circle(26, 6, 1.5, INK);
      break;
    case 'tile_one_way':
      c.rect(0, 0, s, 10, C_BRN);
      c.rect(0, 0, s, 3, C_GOLD);
      c.rect(0, 9, s, 2, INK);
      c.line(8, 2, 8, 9, INK, 1.2);
      c.line(24, 2, 24, 9, INK, 1.2);
      break;
    case 'tile_pillar_closed':
      c.rect(0, 0, s, s, C_PURP);
      c.rect(3, 3, s - 6, s - 6, C_PURP_D);
      c.circle(16, 16, 7, C_MAG);
      c.circle(16, 16, 3, EYE_W);
      c.rect(0, 0, s, 2, INK);
      c.rect(0, s - 2, s, 2, INK);
      break;
    case 'tile_pillar_open':
      c.rect(0, 0, s, s, hexToRgba('#9847e8', 70));
      c.rect(0, 0, s, 2, C_MAG);
      c.rect(0, s - 2, s, 2, C_MAG);
      c.rect(0, 0, 2, s, C_MAG);
      c.rect(s - 2, 0, 2, s, C_MAG);
      break;
    case 'tile_conveyor_r':
    case 'tile_conveyor_l': {
      const dir = kind === 'tile_conveyor_r' ? 1 : -1;
      c.rect(0, 0, s, s, P2);
      c.rect(0, 0, s, 5, C_ORG);
      c.rect(0, 27, s, 5, C_STEEL_D);
      const ax = 16;
      c.tri(ax - 7 * dir, 9, ax - 7 * dir, 23, ax + 8 * dir, 16, C_YEL);
      break;
    }
    case 'tile_lava':
      c.rect(0, 4, s, s - 4, C_RED);
      c.rect(0, 4, s, 8, C_ORG);
      c.circle(8, 7, 5, C_YEL);
      c.circle(22, 8, 6, C_YEL);
      c.circle(15, 20, 4, C_ORG);
      break;
    case 'tile_spike':
      c.tri(1, 31, 10, 31, 5.5, 6, C_STEEL_L);
      c.tri(11, 31, 21, 31, 16, 4, C_STEEL);
      c.tri(22, 31, 31, 31, 26.5, 6, C_STEEL_L);
      c.inkOutline(INK, 1);
      break;
    case 'tile_cheese_wall':
      c.rect(0, 0, s, s, C_CHEESE);
      c.circle(10, 12, 4, C_YEL);
      c.circle(22, 22, 5, C_CHEESE_D);
      c.rect(0, 0, 3, s, C_YEL);
      c.rect(s - 3, 0, 3, s, C_YEL);
      break;
    case 'tile_outlet_gate':
      c.rect(0, 0, s, s, C_CYAN_D);
      for (let x = 4; x < s; x += 7) {
        c.rect(x, 0, 3, s, C_CYAN);
      }
      c.rect(0, 0, s, 3, INK);
      c.rect(0, s - 3, s, 3, INK);
      break;
    case 'tile_secret_wall':
    default:
      c.rect(0, 0, s, s, hexToRgba('#a69e94', 200));
      c.circle(16, 16, 5, hexToRgba('#ff47b8', 95));
      c.line(4, 16, 28, 16, hexToRgba('#57228c', 120), 1.5);
      break;
  }
}

function drawRankBadge(c: SpriteCanvas, grade: 'D' | 'C' | 'B' | 'A' | 'S' | 'P'): void {
  const cx = 24;
  const cy = 24;
  const colors: Record<typeof grade, [RGBA, RGBA, RGBA]> = {
    D: [C_STONE, C_STONE_D, C_CREAM],
    C: [C_BLUE, C_BLUE_D, EYE_W],
    B: [C_GRN, C_GRN_D, EYE_W],
    A: [C_RED, C_RED_D, C_YEL],
    S: [C_GOLD, C_ORG, EYE_W],
    P: [C_PURP, C_MAG, C_GOLD],
  };
  const [fill, rim, letter] = colors[grade];
  if (grade === 'P' || grade === 'S') {
    c.star(cx, cy, 22, 16, 12, rim);
    c.circle(cx, cy, 17, fill);
  } else {
    c.circle(cx, cy, 20, rim);
    c.circle(cx, cy, 16, fill);
  }
  // Bold stylized comic letter
  if (grade === 'D') {
    c.rect(16, 13, 4, 22, letter);
    c.arc(20, 24, 11, 10, -Math.PI * 0.5, Math.PI * 0.5, letter, 4);
  } else if (grade === 'C') {
    c.arc(25, 24, 10, 10, 0.7, Math.PI * 2 - 0.7, letter, 4.2);
  } else if (grade === 'B') {
    c.rect(16, 13, 4, 22, letter);
    c.arc(21, 19, 8, 5, -Math.PI * 0.5, Math.PI * 0.5, letter, 3.6);
    c.arc(21, 29, 9, 5.5, -Math.PI * 0.5, Math.PI * 0.5, letter, 3.6);
  } else if (grade === 'A') {
    c.line(15, 34, 24, 13, letter, 4.2);
    c.line(33, 34, 24, 13, letter, 4.2);
    c.line(18, 27, 30, 27, letter, 3.6);
  } else if (grade === 'S') {
    c.arc(24, 19, 7, 5, Math.PI * 0.5, Math.PI * 2.1, letter, 4);
    c.arc(24, 29, 7, 5, -Math.PI * 0.5, Math.PI * 1.1, letter, 4);
  } else {
    // P-Rank crown + bold P!
    c.rect(17, 13, 4.5, 23, letter);
    c.arc(22, 20, 8.5, 6.5, -Math.PI * 0.5, Math.PI * 0.5, letter, 4);
    c.star(34, 12, 5, 2, 4, EYE_W);
  }
  c.inkOutline(INK, 1);
}

// Compact 5x7 crisp bitmap font definitions (for WebGL2 score pops & gate signs)
const FONT_5X7: Record<string, string[]> = {
  '0': ['01110', '10011', '10101', '11001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  ':': ['00000', '00100', '00000', '00000', '00000', '00100', '00000'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
};

export function fontGlyphKey(ch: string): string | null {
  const up = ch.toUpperCase();
  if (up === '+') return 'font_plus';
  if (up === '-') return 'font_minus';
  if (up === '!') return 'font_bang';
  if (up === ':') return 'font_colon';
  if (up === '$') return 'font_dollar';
  if (FONT_5X7[up]) return `font_${up}`;
  return null;
}

// ============================================================================
// Master Atlas Builder (100% Pure TypeScript, Deterministic, DOM-Free)
// ============================================================================

let cachedAtlas: BuiltAtlas | null = null;

export function buildKrunkedAtlas(): BuiltAtlas {
  if (cachedAtlas) return cachedAtlas;

  const p = new AtlasPacker();

  // ---- 1. Chef Peppo Core Action States (30 + sjump_land) ----
  p.add('peppo_idle', 64, 64, 32, 59, (c) => drawPeppoPose(c, { sweat: true }));
  p.add('peppo_walk', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, { lean: 3, armL: [-13, 3], armR: [14, 1], legL: [-10, 9], legR: [11, 8], mouth: 'grin' })
  );
  p.add('peppo_jump', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: 2,
      squash: -4,
      hatTilt: -3,
      armL: [-12, -9],
      armR: [12, -10],
      legL: [-9, 4],
      legR: [10, 3],
      mouth: 'o',
    })
  );
  p.add('peppo_fall', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: -2,
      hatTilt: 4,
      armL: [-15, -10],
      armR: [15, -11],
      legL: [-8, 12],
      legR: [9, 11],
      mouth: 'scream',
      sweat: true,
    })
  );
  p.add('peppo_crouch', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, { squash: 12, lean: 2, armL: [-12, 8], armR: [12, 8], legL: [-9, 4], legR: [9, 4] })
  );
  p.add('peppo_crouch_slide', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      squash: 14,
      lean: -8,
      hatTilt: -7,
      armL: [-14, 4],
      armR: [15, 7],
      legL: [6, 5],
      legR: [17, 4],
      speedLines: true,
      mouth: 'grin',
    })
  );
  p.add('peppo_mach1', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: 6,
      hatTilt: -4,
      armL: [-14, 2],
      armR: [14, -2],
      legL: [-12, 10],
      legR: [12, 8],
      mouth: 'grin',
      sweat: true,
    })
  );
  p.add('peppo_mach2', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: 10,
      hatTilt: -7,
      armL: [-18, 0],
      armR: [-10, 6],
      legL: [-14, 9],
      legR: [13, 6],
      eyes: 'rage',
      mouth: 'grin',
      speedLines: true,
    })
  );
  p.add('peppo_mach3', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: 13,
      hatTilt: -10,
      armL: [-20, -2],
      armR: [16, -2],
      wheelLegs: true,
      eyes: 'rage',
      mouth: 'scream',
      speedLines: true,
      sweat: true,
    })
  );
  p.add('peppo_mach4', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: 16,
      hatTilt: -13,
      armL: [-22, -4],
      armR: [17, -4],
      wheelLegs: true,
      wheelFast: true,
      eyes: 'rage',
      mouth: 'scream',
      speedLines: true,
      capeFlame: true,
    })
  );
  p.add('peppo_mach_slide', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: -10,
      squash: 4,
      hatTilt: 8,
      armL: [-13, -3],
      armR: [14, 2],
      legL: [7, 10],
      legR: [16, 9],
      eyes: 'rage',
      mouth: 'scream',
      sweat: true,
    })
  );
  p.add('peppo_mach_roll', 64, 64, 32, 59, (c) => {
    c.circle(32, 42, 16, P0);
    c.circle(32, 42, 12, P2);
    c.arc(32, 42, 14, 14, 0, Math.PI * 1.4, EYE_W, 3);
    c.arc(32, 42, 8, 8, Math.PI * 0.5, Math.PI * 1.8, P3, 3);
    c.circle(36, 39, 5, P4);
    c.circle(38, 38, 2, EYE_W);
    c.px(39, 38, INK);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_climb_wall', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: 5,
      hatTilt: -5,
      armL: [10, -14],
      armR: [15, -6],
      legL: [4, 10],
      legR: [13, 3],
      eyes: 'rage',
      mouth: 'scream',
      speedLines: true,
    })
  );
  p.add('peppo_grab_dash', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: 14,
      hatTilt: -8,
      armL: [16, 0],
      armR: [20, 4],
      legL: [-14, 9],
      legR: [-4, 11],
      eyes: 'rage',
      mouth: 'scream',
      speedLines: true,
    })
  );
  p.add('peppo_grab_hold', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, { lean: 2, armL: [-8, -16], armR: [8, -16], mouth: 'grin' })
  );
  p.add('peppo_piledriver', 64, 64, 32, 59, (c) => {
    // Upside down corkscrew piledriver!
    c.ellipse(32, 34, 12, 15, P2);
    c.ellipse(32, 22, 10, 8, P0);
    c.ellipse(32, 47, 10, 9, P4);
    c.circle(29, 48, 3, EYE_W);
    c.circle(35, 48, 3, EYE_W);
    c.px(29, 49, INK);
    c.px(35, 49, INK);
    c.line(18, 12, 18, 52, C_GOLD, 2);
    c.line(46, 12, 46, 52, C_GOLD, 2);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_uppercut', 64, 64, 32, 59, (c) => {
    c.star(38, 12, 13, 6, 7, C_GOLD);
    drawPeppoPose(c, {
      lean: 4,
      squash: -6,
      armL: [-12, 6],
      armR: [8, -22],
      legL: [-8, 10],
      legR: [6, 4],
      eyes: 'rage',
      mouth: 'scream',
    });
  });
  p.add('peppo_sjump_prep', 64, 64, 32, 59, (c) => {
    c.tri(18, 16, 46, 16, 32, 4, C_GOLD);
    drawPeppoPose(c, {
      squash: 11,
      armL: [-13, 5],
      armR: [13, 5],
      eyes: 'rage',
      mouth: 'grin',
      sweat: true,
    });
  });
  p.add('peppo_sjump', 64, 64, 32, 59, (c) => {
    // Vertical cartoon rocket launch straight upward!
    c.tri(20, 62, 44, 62, 32, 36, C_ORG);
    c.tri(25, 62, 39, 62, 32, 44, C_YEL);
    c.roundRect(23, 14, 18, 34, 8, P0);
    c.roundRect(25, 22, 14, 24, 5, P2);
    c.circle(32, 10, 6, P4); // Leading fist punching sky!
    drawPeppoHead(c, 31, 24, 0, 'rage', 'scream', false);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_sjump_land', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, { squash: 14, eyes: 'dizzy', mouth: 'ouch' })
  );
  p.add('peppo_sjump_cancel', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      lean: 15,
      armL: [-14, 3],
      armR: [18, -2],
      legL: [-14, 6],
      legR: [-6, 10],
      eyes: 'rage',
      mouth: 'scream',
      speedLines: true,
      capeFlame: true,
    })
  );
  p.add('peppo_freefall_prep', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, { squash: -4, armL: [-10, -10], armR: [10, -10], legL: [-7, -2], legR: [7, -2], mouth: 'o' })
  );
  p.add('peppo_freefall', 64, 64, 32, 59, (c) => {
    c.line(14, 4, 14, 24, EYE_W, 2);
    c.line(50, 4, 50, 24, EYE_W, 2);
    drawPeppoPose(c, {
      squash: 4,
      hatTilt: 0,
      armL: [-16, -8],
      armR: [16, -8],
      legL: [-12, 8],
      legR: [12, 8],
      eyes: 'rage',
      mouth: 'scream',
    });
  });
  p.add('peppo_freefall_land', 64, 64, 32, 59, (c) => {
    c.ellipse(14, 57, 10, 5, C_STONE_L);
    c.ellipse(50, 57, 10, 5, C_STONE_L);
    drawPeppoPose(c, { squash: 16, armL: [-16, 7], armR: [16, 7], eyes: 'wide', mouth: 'ouch' });
  });
  p.add('peppo_taunt', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      starburst: true,
      lean: -4,
      armL: [-14, -10],
      armR: [15, -12],
      legL: [-10, 9],
      legR: [11, 9],
      eyes: 'wink',
      mouth: 'smug',
    })
  );
  p.add('peppo_super_taunt', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      starburst: true,
      starColor: C_CYAN,
      aura: C_GOLD,
      armL: [-16, -12],
      armR: [16, -12],
      eyes: 'shades',
      mouth: 'grin',
    })
  );
  p.add('peppo_parry', 64, 64, 32, 59, (c) => {
    c.star(46, 30, 17, 7, 8, EYE_W);
    c.star(46, 30, 12, 5, 8, C_GOLD);
    drawPeppoPose(c, {
      lean: 6,
      armL: [-10, 2],
      armR: [17, -4],
      eyes: 'shades',
      mouth: 'smug',
    });
  });
  p.add('peppo_hurt', 64, 64, 32, 59, (c) => {
    c.star(20, 14, 7, 3, 5, C_YEL);
    c.star(46, 16, 6, 2.5, 5, C_RED);
    drawPeppoPose(c, {
      lean: -8,
      hatTilt: 9,
      armL: [-16, -6],
      armR: [14, -8],
      legL: [-12, 6],
      legR: [10, 11],
      eyes: 'dizzy',
      mouth: 'ouch',
    });
  });
  p.add('peppo_bump', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, { lean: -9, squash: 5, hatTilt: 8, eyes: 'dizzy', mouth: 'ouch' })
  );
  p.add('peppo_door_enter', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, { lean: 0, armL: [-10, 4], armR: [10, 4], legL: [-4, 10], legR: [5, 7], mouth: 'grin' })
  );
  p.add('peppo_victory_pose', 64, 64, 32, 59, (c) =>
    drawPeppoPose(c, {
      starburst: true,
      starColor: C_GOLD,
      armL: [-13, -12],
      armR: [12, -16],
      holdingPizza: true,
      eyes: 'wink',
      mouth: 'grin',
    })
  );

  // ---- 1b. 11 Hilarious Distinct Comic Taunt Freeze-Poses (`peppo_taunt_0..10`) ----
  const tauntConfigs: PeppoPoseOpts[] = [
    { starburst: true, starColor: C_GOLD, lean: -3, armL: [-15, -12], armR: [15, -12], eyes: 'wink', mouth: 'smug' },
    { starburst: true, starColor: C_PINK, lean: 4, armL: [-10, 4], armR: [14, -6], eyes: 'smug', mouth: 'o' },
    { starburst: true, starColor: C_ORG, squash: -2, armL: [-15, -10], armR: [15, -10], legL: [-11, 10], legR: [11, 10], eyes: 'rage', mouth: 'grin' },
    { starburst: true, starColor: C_CYAN, lean: 9, armL: [-14, 2], armR: [20, -4], eyes: 'shades', mouth: 'smug' },
    { starburst: true, starColor: C_LIME, squash: -5, armL: [-16, -6], armR: [16, -6], legL: [-2, 11], legR: [13, 3], eyes: 'wink', mouth: 'grin' },
    { starburst: true, starColor: C_GOLD, lean: -5, armL: [12, -2], armR: [18, -5], eyes: 'shades', mouth: 'smug' },
    { starburst: true, starColor: C_MAG, squash: 8, armL: [-15, 9], armR: [15, 9], legL: [-12, -4], legR: [12, -4], eyes: 'dizzy', mouth: 'grin' },
    { starburst: true, starColor: C_RED_L, lean: 0, armL: [-6, -5], armR: [7, -5], eyes: 'wide', mouth: 'scream', sweat: true },
    { starburst: true, starColor: C_GOLD, lean: 2, armL: [-12, 3], armR: [13, -10], holdingPizza: true, eyes: 'wink', mouth: 'grin' },
    { starburst: true, starColor: C_CYAN, squash: 13, armL: [-14, 4], armR: [14, 4], eyes: 'smug', mouth: 'grin' },
    { starburst: true, starColor: C_PURP, lean: -6, hatTilt: 6, armL: [-16, -2], armR: [10, 6], eyes: 'shades', mouth: 'smug' },
  ];
  for (let i = 0; i < 11; i++) {
    p.add(`peppo_taunt_${i}`, 64, 64, 32, 59, (c) => drawPeppoPose(c, tauntConfigs[i]));
  }

  // ---- 2. Chef Peppo Transformations (18) ----
  p.add('peppo_transfo_knight', 64, 64, 32, 59, (c) => {
    // Gleaming plate knight with plume & broadsword!
    c.poly([[30, 8], [46, 11], [38, 20]], C_RED);
    c.roundRect(20, 16, 24, 24, 6, C_STEEL);
    c.rect(22, 24, 20, 5, INK);
    c.circle(28, 26, 1.8, C_GOLD);
    c.circle(36, 26, 1.8, C_GOLD);
    c.roundRect(19, 38, 26, 16, 4, C_STEEL_D);
    c.line(44, 42, 58, 18, C_STEEL_L, 4);
    c.line(42, 36, 52, 42, C_GOLD, 3);
    c.ellipse(25, 57, 5, 3, C_STEEL_D);
    c.ellipse(39, 57, 5, 3, C_STEEL_D);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_ball', 64, 64, 32, 59, (c) => {
    c.circle(32, 38, 21, C_CHEESE);
    c.circle(36, 42, 15, C_CHEESE_D);
    c.circle(25, 32, 5, C_YEL);
    c.circle(40, 32, 4, C_YEL);
    c.circle(27, 36, 4, EYE_W);
    c.circle(37, 36, 4, EYE_W);
    c.px(28, 36, INK);
    c.px(38, 36, INK);
    c.arc(32, 44, 6, 4, 0, Math.PI, INK, 2);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_bomb', 64, 64, 32, 59, (c) => {
    drawPeppoPose(c, { lean: 4, armL: [-6, -15], armR: [6, -15], eyes: 'wide', mouth: 'scream', sweat: true });
    c.circle(32, 14, 10, P2);
    c.circle(29, 11, 2.5, C_STEEL_L);
    c.star(40, 6, 6, 2.5, 5, C_YEL);
    c.circle(40, 6, 2, C_RED);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_fire_butt', 64, 64, 32, 59, (c) => {
    c.poly([[18, 42], [46, 42], [32, 62]], C_ORG);
    c.poly([[24, 44], [40, 44], [32, 58]], C_YEL);
    drawPeppoPose(c, { squash: -8, armL: [-12, 8], armR: [12, 8], eyes: 'wide', mouth: 'scream', sweat: true });
  });
  p.add('peppo_transfo_firemouth', 64, 64, 32, 59, (c) => {
    c.poly([[42, 26], [62, 16], [62, 38], [42, 34]], C_ORG);
    c.poly([[44, 28], [58, 22], [58, 34]], C_YEL);
    drawPeppoPose(c, { lean: 5, eyes: 'rage', mouth: 'scream' });
  });
  p.add('peppo_transfo_ghost', 64, 64, 32, 59, (c) => {
    c.ellipse(32, 32, 17, 20, C_GHOST);
    c.tri(15, 42, 22, 57, 28, 44, C_GHOST);
    c.tri(26, 44, 32, 58, 38, 44, C_GHOST);
    c.tri(36, 44, 43, 57, 49, 42, C_GHOST);
    c.ellipse(32, 12, 10, 7, C_GHOST_D);
    c.circle(27, 28, 4.5, EYE_W);
    c.circle(37, 28, 4.5, EYE_W);
    c.circle(28, 28, 2, INK);
    c.circle(38, 28, 2, INK);
    c.ellipse(32, 39, 5, 6, INK);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_beak', 64, 64, 32, 59, (c) => {
    drawPeppoPose(c, { lean: 2, mouth: 'grin' });
    // Goofy white cartoon chicken pal perched on head!
    c.ellipse(32, 13, 10, 7, EYE_W);
    c.tri(40, 11, 49, 13, 40, 16, C_ORG);
    c.circle(30, 6, 3, C_RED);
    c.circle(35, 11, 2, INK);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_weenie', 64, 64, 32, 59, (c) => {
    // Giant smiling hotdog mount!
    c.roundRect(10, 34, 44, 16, 8, C_BRN);
    c.roundRect(14, 42, 36, 9, 4, C_CREAM);
    c.line(16, 38, 46, 38, C_YEL, 2.5);
    c.circle(47, 40, 2.5, EYE_W);
    c.px(48, 40, INK);
    c.ellipse(20, 55, 4, 3, INK);
    c.ellipse(44, 55, 4, 3, INK);
    drawPeppoHead(c, 30, 24, -2, 'wide', 'grin', false);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_barrel', 64, 64, 32, 59, (c) => {
    c.roundRect(15, 20, 34, 34, 8, C_BRN);
    c.rect(15, 25, 34, 4, C_STEEL_D);
    c.rect(15, 44, 34, 4, C_STEEL_D);
    c.circle(26, 35, 3.5, EYE_W);
    c.circle(38, 35, 3.5, EYE_W);
    c.px(27, 35, INK);
    c.px(39, 35, INK);
    c.ellipse(24, 57, 5, 3, P2);
    c.ellipse(40, 57, 5, 3, P2);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_rocket', 64, 64, 32, 59, (c) => {
    c.poly([[4, 38], [16, 30], [16, 46]], C_ORG);
    c.poly([[8, 38], [16, 34], [16, 42]], C_YEL);
    c.roundRect(16, 28, 32, 18, 6, C_RED);
    c.tri(46, 28, 46, 46, 60, 37, EYE_W);
    c.tri(16, 28, 26, 28, 16, 20, C_STEEL);
    c.tri(16, 46, 26, 46, 16, 54, C_STEEL);
    drawPeppoHead(c, 32, 23, -6, 'rage', 'scream', false);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_golf_carry', 64, 64, 32, 59, (c) => {
    drawPeppoPose(c, { lean: 3, armR: [16, -6], mouth: 'grin' });
    c.line(46, 22, 56, 48, C_STEEL_L, 2.5);
    c.rect(52, 46, 8, 4, C_STEEL);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_cheese_sticky', 64, 64, 32, 59, (c) => {
    c.ellipse(32, 38, 19, 20, C_CHEESE);
    c.ellipse(20, 52, 6, 8, C_CHEESE_D);
    c.ellipse(44, 51, 6, 8, C_CHEESE_D);
    c.circle(27, 32, 4, EYE_W);
    c.circle(37, 32, 4, EYE_W);
    c.px(28, 32, INK);
    c.px(38, 32, INK);
    c.arc(32, 42, 6, 3, 0, Math.PI, INK, 1.8);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_trash_roll', 64, 64, 32, 59, (c) => {
    c.roundRect(14, 24, 36, 30, 6, C_STEEL);
    c.line(20, 26, 20, 52, C_STEEL_D, 2);
    c.line(32, 26, 32, 52, C_STEEL_D, 2);
    c.line(44, 26, 44, 52, C_STEEL_D, 2);
    c.circle(46, 36, 4, EYE_W);
    c.px(47, 36, INK);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_boxed_flat', 64, 64, 32, 59, (c) => {
    c.rect(12, 38, 40, 18, C_CREAM);
    c.rect(12, 38, 40, 5, C_RED);
    c.circle(26, 48, 3, EYE_W);
    c.circle(38, 48, 3, EYE_W);
    c.px(27, 48, INK);
    c.px(39, 48, INK);
    c.ellipse(22, 58, 4, 2, P2);
    c.ellipse(42, 58, 4, 2, P2);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_inferno_pepper', 64, 64, 32, 59, (c) => {
    c.star(32, 34, 28, 16, 10, C_RED);
    c.star(32, 34, 21, 12, 10, C_ORG);
    drawPeppoPose(c, { lean: 8, eyes: 'rage', mouth: 'scream', capeFlame: true });
  });
  p.add('peppo_transfo_cross', 64, 64, 32, 59, (c) => {
    c.star(32, 34, 27, 15, 8, C_GOLD);
    c.ring(32, 8, 11, 4, 2.5, C_YEL);
    drawPeppoPose(c, { eyes: 'smug', mouth: 'grin' });
  });
  p.add('peppo_transfo_shotgun', 64, 64, 32, 59, (c) => {
    drawPeppoPose(c, { lean: 3, armR: [14, 3], eyes: 'shades', mouth: 'smug' });
    c.rect(34, 34, 25, 6, C_STEEL_D);
    c.rect(34, 34, 25, 2, C_STEEL_L);
    c.rect(28, 36, 9, 6, C_BRN);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_revolver', 64, 64, 32, 59, (c) => {
    drawPeppoPose(c, { lean: 4, armR: [15, 0], eyes: 'shades', mouth: 'smug' });
    c.rect(40, 29, 16, 5, C_STEEL_L);
    c.circle(43, 33, 3, C_GOLD);
    c.rect(38, 33, 5, 6, C_BRN);
    c.inkOutline(INK, 1);
  });

  // ---- 3. The Static (19) ----
  p.add('static_idle', 64, 64, 32, 59, (c) => drawStaticPose(c, { mouth: 'grin' }));
  p.add('static_walk', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { lean: 3, legL: [-9, 8], legR: [10, 7], armL: [-12, 2], armR: [13, -1], mouth: 'grin' })
  );
  p.add('static_jump', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { squash: -5, armL: [-13, -9], armR: [13, -9], legL: [-8, 3], legR: [9, 3], mouth: 'grin' })
  );
  p.add('static_fall', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { capeFlip: -8, armL: [-15, -7], armR: [15, -7], mouth: 'tongue' })
  );
  p.add('static_crouch', 64, 64, 32, 59, (c) => drawStaticPose(c, { squash: 10, mouth: 'grin' }));
  p.add('static_mach1', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { lean: 6, armL: [-14, 1], armR: [14, -2], mouth: 'grin' })
  );
  p.add('static_mach2', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { lean: 8, skateboard: true, armL: [-14, -2], armR: [15, -3], mouth: 'grin' })
  );
  p.add('static_mach3', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { lean: 11, skateboard: true, armL: [-16, -4], armR: [16, -5], mouth: 'tongue' })
  );
  p.add('static_mach4', 64, 64, 32, 59, (c) => {
    c.poly([[2, 46], [16, 40], [16, 54]], C_MAG);
    c.poly([[6, 47], [15, 43], [15, 51]], C_CYAN);
    drawStaticPose(c, { lean: 14, skateboard: true, mouth: 'scream' });
  });
  p.add('static_mach_slide', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { lean: -8, skateboard: true, mouth: 'scream' })
  );
  p.add('static_mach_roll', 64, 64, 32, 59, (c) => {
    c.circle(32, 42, 15, S0);
    c.arc(32, 42, 13, 13, 0, Math.PI * 1.4, S2, 4);
    c.arc(32, 42, 8, 8, Math.PI, Math.PI * 2.2, S3, 3);
    c.inkOutline(INK, 1);
  });
  p.add('static_wall_bounce', 64, 64, 32, 59, (c) => {
    c.star(14, 40, 11, 5, 6, C_CYAN);
    drawStaticPose(c, { lean: 8, squash: -5, legL: [-13, 4], legR: [10, 8], mouth: 'tongue' });
  });
  p.add('static_grab_dash', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { lean: 12, armL: [12, 0], armR: [19, 2], mouth: 'scream' })
  );
  p.add('static_sjump_prep', 64, 64, 32, 59, (c) => {
    c.tri(20, 16, 44, 16, 32, 4, C_CYAN);
    drawStaticPose(c, { squash: 10, mouth: 'grin' });
  });
  p.add('static_sjump', 64, 64, 32, 59, (c) => {
    c.tri(22, 62, 42, 62, 32, 40, C_MAG);
    c.tri(26, 62, 38, 62, 32, 46, C_CYAN);
    drawStaticPose(c, { squash: -8, armL: [-8, -14], armR: [8, -14], mouth: 'scream' });
  });
  p.add('static_freefall', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { capeFlip: -12, armL: [-14, -8], armR: [14, -8], mouth: 'scream' })
  );
  p.add('static_taunt', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { starburst: true, armL: [-14, -10], armR: [15, -10], mouth: 'tongue' })
  );
  p.add('static_hurt', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { lean: -8, armL: [-15, -6], armR: [15, -6], mouth: 'ouch' })
  );
  p.add('static_bomb', 64, 64, 32, 59, (c) =>
    drawStaticPose(c, { lean: 4, armR: [14, -8], bomb: true, mouth: 'grin' })
  );

  // ---- 4. Gusto & Chonks (9) ----
  p.add('gusto_idle', 64, 64, 32, 59, (c) => drawGustoPose(c, 'idle'));
  p.add('gusto_walk', 64, 64, 32, 59, (c) => drawGustoPose(c, 'walk'));
  p.add('gusto_mach', 64, 64, 32, 59, (c) => drawGustoPose(c, 'mach'));
  p.add('gusto_jump', 64, 64, 32, 59, (c) => drawGustoPose(c, 'jump'));
  p.add('gusto_fall', 64, 64, 32, 59, (c) => drawGustoPose(c, 'fall'));
  p.add('gusto_climb_wall', 64, 64, 32, 59, (c) => drawGustoPose(c, 'climb'));
  p.add('gusto_kick', 64, 64, 32, 59, (c) => drawGustoPose(c, 'kick'));
  p.add('gusto_taunt', 64, 64, 32, 59, (c) => drawGustoPose(c, 'taunt'));
  p.add('gusto_hurt', 64, 64, 32, 59, (c) => drawGustoPose(c, 'hurt'));

  // ---- 5. Corner CRT TV Frame & 16 Expressions ----
  p.add('tv_frame', 96, 80, 48, 40, (c) => drawTvFrame(c));
  const tvExprs = [
    'idle',
    'mach2',
    'mach3',
    'mach4',
    'panic',
    'hurt',
    'taunt',
    'combo',
    'happy',
    'boss',
    'gusto',
    'static',
    'knight',
    'ghost',
    'shotgun',
    'fire',
  ] as const;
  for (const expr of tvExprs) {
    p.add(`tv_${expr}`, 80, 64, 40, 32, (c) => drawTvScreen(c, expr));
  }

  // ---- 6. Enemies (22 Archetypes) ----
  const enemyKeys = [
    'enemy_slime_glob',
    'enemy_fork_imp',
    'enemy_swedish_ape',
    'enemy_pepper_goblin',
    'enemy_knight_squire',
    'enemy_bomb_imp',
    'enemy_tribal_cheese',
    'enemy_cow_charger',
    'enemy_ghost_ghoul',
    'enemy_mushroom_spitter',
    'enemy_cannon_goblin',
    'enemy_giant_bee',
    'enemy_archer_goblin',
    'enemy_ufo_olive',
    'enemy_burger_golfer',
    'enemy_ninja_slice',
    'enemy_clone_bot',
    'enemy_fake_santa',
    'enemy_animatronic_bot',
    'enemy_blitz_trooper',
    'enemy_pickle_brawler',
    'enemy_static_minion',
  ];
  for (const ek of enemyKeys) {
    p.add(ek, 64, 64, 32, 56, (c) => drawEnemy(c, ek));
  }

  // ---- 7. Bosses & Mega-Crust Escape Chaser (6) ----
  const bossKeys = [
    'boss_b_artiste',
    'boss_b_cheddar',
    'boss_b_static',
    'boss_b_doppel',
    'boss_b_megacrust',
    'mega_crust_chaser',
  ];
  for (const bk of bossKeys) {
    p.add(bk, 96, 96, 48, 88, (c) => drawBoss(c, bk));
  }

  // ---- 8. Props, Pickups, Toppin Pals & World Interactables ----
  p.add('prop_pillar_chronos', 64, 96, 32, 92, (c) => {
    // Ancient carved stone face Pillar Chronos!
    c.roundRect(10, 6, 44, 86, 6, C_STONE);
    c.rect(6, 4, 52, 10, C_STONE_L);
    c.rect(6, 82, 52, 10, C_STONE_D);
    // Deep carved eyebrows, glowing eyes, stoic pillar nose & mustache
    c.rect(14, 24, 36, 7, C_STONE_D);
    c.ellipse(23, 35, 6, 5, C_PURP_D);
    c.ellipse(41, 35, 6, 5, C_PURP_D);
    c.circle(23, 35, 2.5, C_MAG);
    c.circle(41, 35, 2.5, C_MAG);
    c.poly([[28, 34], [36, 34], [39, 54], [25, 54]], C_STONE_L);
    c.rect(16, 60, 32, 8, C_STONE_D);
    c.line(20, 64, 44, 64, INK, 2);
    // Cracks & moss
    c.line(12, 48, 22, 52, INK, 1.5);
    c.line(48, 20, 42, 30, INK, 1.5);
    c.ellipse(16, 12, 8, 4, C_GRN_D);
    c.inkOutline(INK, 1);
  });
  p.add('prop_toppin_cage', 56, 56, 28, 52, (c) => {
    c.rect(6, 6, 44, 6, C_STEEL_D);
    c.rect(6, 46, 44, 6, C_STEEL_D);
    for (let x = 9; x <= 45; x += 9) {
      c.rect(x, 10, 3, 38, C_STEEL_L);
    }
    c.roundRect(22, 38, 12, 12, 2, C_GOLD);
    c.circle(28, 44, 2, INK);
    c.inkOutline(INK, 1);
  });
  p.add('prop_gerry_janitor', 48, 64, 24, 60, (c) => {
    c.roundRect(14, 28, 20, 24, 5, C_BLUE);
    c.ellipse(24, 20, 10, 10, C_STONE_L);
    c.circle(21, 19, 3, EYE_W);
    c.circle(28, 19, 3, EYE_W);
    c.px(22, 19, INK);
    c.px(29, 19, INK);
    c.line(18, 16, 30, 16, INK, 1.5);
    // Golden key & broom!
    c.line(8, 14, 12, 56, C_BRN, 3);
    c.rect(6, 50, 12, 8, C_YEL_D);
    c.circle(39, 30, 5, C_GOLD);
    c.rect(37, 34, 4, 11, C_GOLD);
    c.inkOutline(INK, 1);
  });
  p.add('prop_treasure_chest', 56, 48, 28, 44, (c) => {
    c.roundRect(6, 16, 44, 26, 4, C_BRN);
    c.roundRect(6, 10, 44, 12, 6, C_BRN_L);
    c.rect(6, 20, 44, 4, C_GOLD);
    c.rect(14, 10, 4, 32, C_GOLD);
    c.rect(38, 10, 4, 32, C_GOLD);
    c.roundRect(23, 18, 10, 10, 2, C_GOLD_D);
    c.star(28, 8, 7, 3, 4, C_CYAN);
    c.inkOutline(INK, 1);
  });
  p.add('prop_lap2_portal', 72, 72, 36, 36, (c) => {
    c.circle(36, 36, 31, C_PURP_D);
    c.circle(36, 36, 26, C_PURP);
    c.circle(36, 36, 20, C_MAG);
    c.circle(36, 36, 13, C_GOLD);
    c.circle(36, 36, 6, EYE_W);
    for (let a = 0; a < 6; a++) {
      const rad = (a * Math.PI) / 3;
      c.arc(36, 36, 23, 23, rad, rad + 0.7, C_CYAN, 2.5);
    }
    c.inkOutline(INK, 1);
  });
  p.add('prop_exit_door', 64, 80, 32, 76, (c) => {
    c.roundRect(8, 14, 48, 62, 18, C_STONE_D);
    c.roundRect(14, 20, 36, 56, 14, P2);
    c.rect(14, 4, 36, 14, C_RED);
    c.rect(16, 6, 32, 10, C_GOLD);
    c.circle(44, 52, 3.5, C_GOLD);
    c.inkOutline(INK, 1);
  });
  p.add('prop_secret_eye', 48, 48, 24, 24, (c) => {
    c.ellipse(24, 24, 19, 13, C_PURP);
    c.ellipse(24, 24, 15, 10, EYE_W);
    c.circle(24, 24, 7, C_GOLD);
    c.circle(24, 24, 3.5, INK);
    c.px(22, 22, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('prop_time_terminal', 48, 64, 24, 60, (c) => {
    c.roundRect(8, 12, 32, 46, 4, hexToRgba('#4c5c40'));
    c.roundRect(12, 18, 24, 18, 3, hexToRgba('#142b1c'));
    c.line(16, 27, 32, 27, C_LIME, 2.5);
    c.line(24, 21, 24, 33, C_LIME, 2.5);
    c.circle(34, 44, 4, C_RED);
    c.rect(14, 42, 14, 8, C_STEEL_D);
    c.inkOutline(INK, 1);
  });
  p.add('prop_hub_broker', 56, 64, 28, 60, (c) => {
    c.roundRect(16, 26, 24, 30, 5, C_ORG);
    c.line(22, 26, 22, 56, C_ORG_D, 2);
    c.line(34, 26, 34, 56, C_ORG_D, 2);
    c.ellipse(28, 16, 11, 10, P4);
    c.ellipse(38, 17, 7, 4, P5); // Comically big broker nose!
    c.circle(24, 14, 3, EYE_W);
    c.px(25, 14, INK);
    c.ellipse(28, 22, 8, 3, EYE_W);
    c.star(28, 36, 6, 2.5, 5, C_GOLD);
    c.inkOutline(INK, 1);
  });
  p.add('prop_golf_ball', 32, 32, 16, 16, (c) => {
    c.circle(16, 16, 12, EYE_W);
    c.circle(12, 13, 2, C_STONE_L);
    c.circle(20, 12, 2, C_STONE_L);
    c.circle(16, 21, 2, C_STONE_L);
    c.circle(13, 15, 1.8, INK);
    c.circle(19, 15, 1.8, INK);
    c.inkOutline(INK, 1);
  });
  // Additional rich world props
  p.add('prop_transform_totem', 48, 56, 24, 52, (c) => {
    c.roundRect(10, 16, 28, 36, 6, C_PURP);
    c.star(24, 18, 12, 5, 6, C_GOLD);
    c.circle(24, 34, 6, C_CYAN);
    c.inkOutline(INK, 1);
  });
  p.add('prop_buddy_switch', 48, 48, 24, 44, (c) => {
    c.roundRect(8, 24, 32, 20, 5, C_RAT);
    c.circle(24, 18, 12, C_RED);
    c.circle(24, 18, 6, C_GOLD);
    c.inkOutline(INK, 1);
  });
  p.add('prop_golf_goal', 56, 64, 28, 60, (c) => {
    c.ellipse(28, 54, 18, 7, C_GRN);
    c.ellipse(28, 54, 9, 4, INK);
    c.line(28, 54, 28, 10, EYE_W, 3);
    c.tri(28, 10, 50, 18, 28, 26, C_RED);
    c.inkOutline(INK, 1);
  });
  p.add('prop_dash_button', 40, 28, 20, 26, (c) => {
    c.rect(4, 16, 32, 10, C_STEEL_D);
    c.roundRect(8, 6, 24, 12, 4, C_RED);
    c.rect(12, 8, 16, 3, C_RED_L);
    c.inkOutline(INK, 1);
  });
  p.add('prop_taxi_warp', 64, 44, 32, 40, (c) => {
    c.roundRect(6, 16, 52, 20, 6, C_YEL);
    c.roundRect(16, 6, 30, 14, 5, C_YEL);
    c.rect(20, 9, 22, 8, C_CYAN);
    for (let x = 10; x < 52; x += 8) c.rect(x, 26, 4, 4, INK);
    c.circle(16, 37, 6, P2);
    c.circle(48, 37, 6, P2);
    c.inkOutline(INK, 1);
  });
  p.add('prop_alarm_sensor', 36, 36, 18, 18, (c) => {
    c.circle(18, 18, 12, C_RED);
    c.circle(18, 18, 7, C_YEL);
    c.circle(18, 18, 3, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('prop_hub_stage_gate', 80, 96, 40, 92, (c) => {
    c.roundRect(6, 12, 68, 80, 28, C_STONE);
    c.roundRect(12, 18, 56, 74, 24, C_STONE_D);
    c.roundRect(18, 26, 44, 66, 20, P2);
    c.roundRect(10, 4, 60, 18, 5, C_GOLD);
    c.rect(14, 8, 52, 10, C_CREAM);
    c.inkOutline(INK, 1);
  });
  p.add('prop_hub_boss_gate', 88, 96, 44, 92, (c) => {
    c.roundRect(6, 14, 76, 78, 22, C_RED_D);
    c.roundRect(14, 24, 60, 68, 18, hexToRgba('#240a14'));
    c.star(44, 14, 15, 7, 5, C_GOLD);
    c.circle(44, 14, 6, C_RED);
    c.inkOutline(INK, 1);
  });
  p.add('prop_hub_elevator', 72, 96, 36, 92, (c) => {
    c.roundRect(6, 8, 60, 84, 6, C_GOLD_D);
    c.rect(12, 18, 23, 72, C_STEEL);
    c.rect(37, 18, 23, 72, C_STEEL_D);
    c.rect(20, 8, 32, 10, P2);
    c.circle(36, 13, 3.5, C_LIME);
    c.inkOutline(INK, 1);
  });
  p.add('prop_hub_bonus_gate', 72, 96, 36, 92, (c) => {
    c.roundRect(8, 14, 56, 78, 22, C_PURP);
    c.roundRect(16, 24, 40, 68, 18, hexToRgba('#180a33'));
    c.star(36, 14, 12, 5, 6, C_CYAN);
    c.inkOutline(INK, 1);
  });
  p.add('prop_tutorial_sign', 48, 48, 24, 44, (c) => {
    c.rect(21, 24, 6, 20, C_BRN_D);
    c.roundRect(6, 6, 36, 22, 4, C_BRN_L);
    c.line(12, 14, 34, 14, INK, 2);
    c.line(12, 20, 28, 20, INK, 2);
    c.inkOutline(INK, 1);
  });

  // ---- 9. Pickups (5) ----
  p.add('pickup_small_topping', 32, 32, 16, 16, (c) => {
    c.circle(16, 16, 9, C_CHEESE);
    c.circle(14, 14, 4, C_RED);
    c.circle(19, 18, 3, C_GRN);
    c.px(12, 11, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('pickup_big_topping', 32, 32, 16, 16, (c) => {
    c.circle(16, 16, 12, C_GOLD);
    c.circle(16, 16, 9, C_YEL);
    c.star(16, 16, 6, 3, 5, C_ORG);
    c.px(11, 10, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('pickup_pizza_slice', 32, 32, 16, 16, (c) => {
    c.tri(5, 24, 27, 24, 16, 5, C_CHEESE);
    c.rect(5, 22, 22, 5, C_BRN_L);
    c.circle(15, 16, 3, C_RED);
    c.circle(19, 20, 2.5, C_RED);
    c.inkOutline(INK, 1);
  });
  p.add('pickup_clock', 32, 32, 16, 16, (c) => {
    c.circle(9, 8, 5, C_GOLD);
    c.circle(23, 8, 5, C_GOLD);
    c.circle(16, 18, 11, C_RED);
    c.circle(16, 18, 8, EYE_W);
    c.line(16, 18, 16, 12, INK, 2);
    c.line(16, 18, 21, 18, INK, 2);
    c.inkOutline(INK, 1);
  });
  p.add('pickup_pumpkin', 32, 32, 16, 16, (c) => {
    c.rect(14, 4, 4, 6, C_GRN_D);
    c.ellipse(16, 19, 12, 10, C_ORG);
    c.tri(10, 16, 14, 16, 12, 13, C_YEL);
    c.tri(18, 16, 22, 16, 20, 13, C_YEL);
    c.arc(16, 22, 6, 3, 0, Math.PI, C_YEL, 2);
    c.inkOutline(INK, 1);
  });

  // ---- 10. Toppin Pals (5) ----
  for (let i = 0; i < 5; i++) {
    p.add(`toppin_${i}`, 36, 36, 18, 33, (c) => drawToppin(c, i));
  }

  // ---- 11. World & Destructible Tiles (21) ----
  const tileKeys = [
    'tile_break_marble',
    'tile_break_metal',
    'tile_ice_solid',
    'tile_solid_stone',
    'tile_solid_brick',
    'tile_solid_wood',
    'tile_solid_metal',
    'tile_solid_cheese',
    'tile_solid_neon',
    'tile_solid_snow',
    'tile_solid_war',
    'tile_one_way',
    'tile_pillar_closed',
    'tile_pillar_open',
    'tile_conveyor_r',
    'tile_conveyor_l',
    'tile_lava',
    'tile_spike',
    'tile_cheese_wall',
    'tile_outlet_gate',
    'tile_secret_wall',
  ];
  for (const tk of tileKeys) {
    p.add(tk, 32, 32, 0, 0, (c) => drawTile(c, tk));
  }

  // ---- 12. Rank Badges (6) ----
  for (const g of ['D', 'C', 'B', 'A', 'S', 'P'] as const) {
    p.add(`rank_${g}`, 48, 48, 24, 24, (c) => drawRankBadge(c, g));
  }

  // ---- 13. FX Sprites & Parallax Motifs ----
  p.add('fx_white_px', 4, 4, 0, 0, (c) => c.rect(0, 0, 4, 4, EYE_W));
  p.add('fx_circle', 24, 24, 12, 12, (c) => c.circle(12, 12, 10, EYE_W));
  p.add('fx_starburst', 48, 48, 24, 24, (c) => {
    c.star(24, 24, 22, 9, 8, C_GOLD);
    c.star(24, 24, 13, 5, 8, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('fx_parry_ring', 48, 48, 24, 24, (c) => {
    c.ring(24, 24, 21, 21, 4, EYE_W);
    c.ring(24, 24, 16, 16, 2, C_GOLD);
  });
  p.add('fx_speed_line', 32, 8, 16, 4, (c) => {
    c.tri(0, 4, 32, 1, 32, 7, EYE_W);
  });
  p.add('fx_flame', 24, 24, 12, 12, (c) => {
    c.poly([[12, 2], [22, 16], [12, 22], [2, 16]], C_ORG);
    c.poly([[12, 7], [17, 16], [12, 20], [7, 16]], C_YEL);
  });
  p.add('fx_dust', 24, 24, 12, 12, (c) => {
    c.circle(9, 14, 6, C_CREAM);
    c.circle(15, 13, 7, EYE_W);
    c.circle(12, 9, 5, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('fx_spark', 20, 20, 10, 10, (c) => {
    c.star(10, 10, 9, 2.5, 4, EYE_W);
  });

  // Parallax motifs
  p.add('bg_cloud', 96, 48, 48, 24, (c) => {
    c.ellipse(30, 30, 22, 14, EYE_W);
    c.ellipse(54, 26, 26, 18, EYE_W);
    c.ellipse(72, 32, 18, 12, C_CREAM);
    c.inkOutline(INK, 1);
  });
  p.add('bg_tower_silhouette', 96, 128, 48, 128, (c) => {
    c.rect(20, 24, 56, 104, hexToRgba('#2d2240'));
    c.rect(14, 16, 14, 14, hexToRgba('#2d2240'));
    c.rect(41, 16, 14, 14, hexToRgba('#2d2240'));
    c.rect(68, 16, 14, 14, hexToRgba('#2d2240'));
    c.rect(32, 46, 10, 16, C_GOLD);
    c.rect(54, 46, 10, 16, C_GOLD);
    c.rect(42, 78, 12, 20, C_ORG);
  });
  p.add('bg_pizza_moon', 64, 64, 32, 32, (c) => {
    c.circle(32, 32, 27, C_CHEESE);
    c.circle(22, 24, 5, C_RED);
    c.circle(40, 22, 4, C_RED);
    c.circle(34, 40, 6, C_RED);
    c.circle(20, 42, 3, C_CHEESE_D);
    c.inkOutline(INK, 1);
  });
  p.add('bg_pillar_arch', 64, 128, 32, 128, (c) => {
    c.rect(8, 0, 16, 128, hexToRgba('#453759'));
    c.rect(40, 0, 16, 128, hexToRgba('#453759'));
    c.rect(0, 0, 64, 20, hexToRgba('#5e4c78'));
    c.ellipse(32, 26, 16, 14, CLEAR);
  });
  p.add('bg_tree', 64, 96, 32, 96, (c) => {
    c.rect(26, 54, 12, 42, C_BRN_D);
    c.circle(32, 36, 22, C_GRN_D);
    c.circle(20, 44, 14, C_GRN_D);
    c.circle(44, 44, 14, C_GRN_D);
    c.circle(30, 30, 12, C_GRN);
  });
  p.add('bg_cactus', 48, 80, 24, 80, (c) => {
    c.roundRect(18, 12, 12, 68, 6, C_GRN_D);
    c.roundRect(6, 28, 14, 10, 4, C_GRN_D);
    c.roundRect(6, 18, 8, 18, 4, C_GRN_D);
    c.roundRect(28, 36, 14, 10, 4, C_GRN_D);
    c.roundRect(34, 24, 8, 20, 4, C_GRN_D);
  });
  p.add('bg_gear', 64, 64, 32, 32, (c) => {
    c.star(32, 32, 29, 21, 8, C_STEEL_D);
    c.circle(32, 32, 16, C_STEEL);
    c.circle(32, 32, 8, hexToRgba('#252230'));
  });
  p.add('bg_window_glow', 40, 64, 20, 32, (c) => {
    c.roundRect(4, 4, 32, 56, 14, C_GOLD);
    c.line(20, 4, 20, 60, INK, 3);
    c.line(4, 32, 36, 32, INK, 3);
  });

  // ---- 14. Outlined Bitmap Font Glyphs (5x7 scaled 2x + ink outline = 12x16) ----
  for (const [ch, rows] of Object.entries(FONT_5X7)) {
    const key = fontGlyphKey(ch);
    if (!key) continue;
    p.add(key, 12, 16, 0, 0, (c) => {
      for (let ry = 0; ry < rows.length; ry++) {
        const row = rows[ry];
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === '1') {
            c.rect(1 + rx * 2, 1 + ry * 2, 2, 2, EYE_W);
          }
        }
      }
      c.inkOutline(INK, 1);
    });
  }

  cachedAtlas = {
    width: ATLAS_SIZE,
    height: ATLAS_SIZE,
    pixels: p.pixels,
    rects: p.rects,
    keys: p.keys,
  };
  return cachedAtlas;
}
