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
// Wave 2 Floor 1-5 rich thematic colors
const C_PLUM = hexToRgba('#69428a');
const C_PLUM_D = hexToRgba('#3f2559');
const C_PLUM_L = hexToRgba('#9e6ec7');
const C_TERRA = hexToRgba('#c45835');
const C_TERRA_D = hexToRgba('#853520');
const C_TERRA_L = hexToRgba('#eb8854');
const C_TEAL = hexToRgba('#2da8a4');
const C_TEAL_D = hexToRgba('#1b6369');
const C_TEAL_L = hexToRgba('#78e3de');
const C_ICE = hexToRgba('#9ceeff');
const C_ICE_D = hexToRgba('#4fa8cc');
const C_SLUM = hexToRgba('#3c3959');
const C_SLUM_D = hexToRgba('#232038');
const C_SLUM_L = hexToRgba('#6a6494');
const C_TAN = hexToRgba('#d6b47a');
const C_TAN_D = hexToRgba('#997a49');

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

  clearEllipse(cx: number, cy: number, rx: number, ry: number): void {
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
        if (dx * dx * invRx2 + dy2 <= 1.0) {
          this.clearPx(px, py);
        }
      }
    }
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
    // Sheriff Cheddar — Western Cowboy Cheese Gunslinger with Stetson, Bandolier & Six-Shooter!
    // Melted cheddar desperado body with swiss cheese dimples & drips
    c.ellipse(cx, cy + 12, 27, 23, C_CHEESE);
    c.ellipse(cx + 5, cy + 16, 20, 16, C_CHEESE_D);
    c.ellipse(cx - 6, cy + 8, 14, 12, C_YEL);
    // Melty cheese puddles/craters along hem
    c.circle(cx - 18, cy + 20, 4.5, C_CHEESE_D);
    c.circle(cx + 17, cy + 10, 3.8, C_CHEESE_D);
    c.circle(cx - 10, cy + 28, 3.5, C_CHEESE_D);
    c.ellipse(cx - 22, cy + 28, 5, 8, C_CHEESE);
    c.ellipse(cx + 21, cy + 27, 5, 7, C_CHEESE_D);

    // Cross-chest leather bullet bandolier with gleaming brass cartridges!
    c.line(cx - 21, cy + 3, cx + 19, cy + 27, C_BRN_D, 7);
    c.line(cx - 21, cy + 3, cx + 19, cy + 27, C_BRN, 4);
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      const bx = cx - 18 + t * 34;
      const by = cy + 5 + t * 20;
      c.line(bx - 1, by - 3, bx + 2, by + 2, C_GOLD, 2.5);
      c.px(bx - 1, by - 3, EYE_W);
    }

    // Crimson cowboy bandana + gleaming 5-point Sheriff Star badge!
    c.poly(
      [
        [cx - 21, cy + 9],
        [cx + 21, cy + 9],
        [cx + 11, cy + 23],
        [cx, cy + 29],
        [cx - 11, cy + 23],
      ],
      C_RED
    );
    c.line(cx - 14, cy + 13, cx + 14, cy + 13, C_RED_L, 1.5);
    c.line(cx - 7, cy + 19, cx + 7, cy + 19, C_RED_D, 1.5);
    c.star(cx - 13, cy + 17, 6.5, 2.8, 5, C_GOLD);
    c.circle(cx - 13, cy + 17, 2, EYE_W);

    // Gritty western squinted eyes + bushy outlaw brows + cocky smirk with toothpick!
    c.rect(cx - 15, cy - 5, 11, 5, EYE_W);
    c.rect(cx + 4, cy - 5, 11, 5, EYE_W);
    c.circle(cx - 8, cy - 3, 2, INK);
    c.circle(cx + 11, cy - 3, 2, INK);
    c.line(cx - 17, cy - 7, cx - 3, cy - 5, C_BRN_D, 2.6);
    c.line(cx + 17, cy - 7, cx + 3, cy - 5, C_BRN_D, 2.6);
    // Smirk + toothpick
    c.arc(cx + 1, cy + 4, 8, 3.5, 0.1, Math.PI - 0.1, INK, 1.8);
    c.line(cx + 6, cy + 5, cx + 18, cy + 8, C_CREAM, 1.6);

    // Iconic wide-brimmed creased Western Stetson Hat!
    c.ellipse(cx, cy - 13, 37, 9, C_BRN_D);
    c.ellipse(cx, cy - 15, 35, 7, C_BRN);
    // Creased pinch crown
    c.poly(
      [
        [cx - 20, cy - 15],
        [cx - 15, cy - 36],
        [cx - 4, cy - 32],
        [cx, cy - 35],
        [cx + 4, cy - 32],
        [cx + 15, cy - 36],
        [cx + 20, cy - 15],
      ],
      C_BRN
    );
    c.poly(
      [
        [cx - 15, cy - 35],
        [cx - 4, cy - 31],
        [cx - 6, cy - 16],
        [cx - 18, cy - 16],
      ],
      C_BRN_L
    );
    // Red hatband + gold buckle
    c.rect(cx - 19, cy - 19, 38, 5, C_RED);
    c.roundRect(cx - 5, cy - 20, 10, 7, 1.5, C_GOLD);
    c.rect(cx - 2, cy - 18, 4, 3, C_BRN_D);

    // Spurred leather cowboy boots!
    c.roundRect(cx - 21, 74, 15, 12, 3, C_BRN_D);
    c.ellipse(cx - 11, 84, 9, 4.5, C_BRN);
    c.star(cx - 23, 82, 4, 1.8, 5, C_GOLD);
    c.roundRect(cx + 6, 74, 15, 12, 3, C_BRN_D);
    c.ellipse(cx + 16, 84, 9, 4.5, C_BRN);
    c.star(cx + 23, 82, 4, 1.8, 5, C_GOLD);

    // Detailed heavy Six-Shooter Revolver held forward!
    c.roundRect(cx + 15, cy + 9, 7, 11, 2, C_BRN_D); // grip
    c.roundRect(cx + 19, cy + 4, 24, 7, 2, C_STEEL_D); // long barrel
    c.rect(cx + 20, cy + 5, 22, 3, C_STEEL_L); // chrome sheen
    c.circle(cx + 24, cy + 9, 5, C_GOLD); // brass cylinder
    c.circle(cx + 24, cy + 9, 2, C_GOLD_D);
    c.rect(cx + 40, cy + 2, 3, 4, C_STEEL_L); // front sight
    // Gloved trigger hand
    c.circle(cx + 16, cy + 12, 5.5, C_CHEESE);
  } else if (id === 'boss_b_static') {
    // The Static — Chaotic Yellow Gremlin Showman on Coiled Spring Pogo + Neon Skateboard!
    // Electric static sparks radiating behind
    c.star(cx - 32, cy - 18, 8, 3, 4, C_CYAN);
    c.star(cx + 33, cy - 10, 7, 2.5, 4, C_YEL);
    // Dramatic billowing orange showman cape
    c.poly(
      [
        [cx - 22, cy - 12],
        [cx - 43, 62],
        [cx - 28, 54],
        [cx - 16, 66],
        [cx + 18, 66],
        [cx + 30, 54],
        [cx + 42, 62],
        [cx + 22, cy - 12],
      ],
      S2
    );
    // Neon hover-skateboard mounted at base!
    c.roundRect(cx - 28, 76, 56, 7, 3, C_CYAN);
    c.rect(cx - 22, 78, 44, 3, S3);
    c.circle(cx - 18, 85, 5, S2);
    c.circle(cx + 18, 85, 5, S2);
    c.circle(cx - 18, 85, 2, EYE_W);
    c.circle(cx + 18, 85, 2, EYE_W);
    // Coiled bouncy steel spring pogo shaft between skateboard & Static!
    c.line(cx, 54, cx, 78, C_STEEL_D, 4);
    for (let sy = 57; sy <= 74; sy += 4) {
      c.line(cx - 8, sy, cx + 8, sy + 2, C_STEEL_L, 2.5);
    }
    c.rect(cx - 13, 60, 26, 3.5, C_GOLD); // Pogo footpegs!
    // Static's yellow jumpsuit body perched chaotically on pogo!
    c.ellipse(cx, cy + 8, 17, 14, S0);
    c.ellipse(cx + 3, cy + 11, 12, 10, S1);
    c.rect(cx - 14, cy + 12, 28, 4, S3);
    c.ellipse(cx - 10, 60, 6.5, 4, S2);
    c.ellipse(cx + 10, 60, 6.5, 4, S2);
    // Wild floppy jester-rabbit hood ears!
    c.poly([[cx - 13, 24], [cx - 32, 5], [cx - 4, 17]], S0);
    c.poly([[cx - 12, 21], [cx - 24, 10], [cx - 8, 18]], S1);
    c.poly([[cx + 12, 24], [cx + 31, 6], [cx + 4, 17]], S1);
    // Oversized chaotic yellow hooded head
    c.ellipse(cx, cy - 14, 19, 16, S0);
    c.ellipse(cx + 1, cy - 11, 14, 11, S4);
    // Orange domino bandit mask
    c.roundRect(cx - 15, cy - 21, 30, 9, 3, S2);
    // Manic wild eyes (one wider than the other!)
    c.circle(cx - 6, cy - 17, 5, EYE_W);
    c.circle(cx + 7, cy - 17, 4.2, EYE_W);
    c.circle(cx - 5, cy - 17, 2.2, INK);
    c.circle(cx + 8, cy - 17, 1.8, C_RED);
    // Long mischievous pointed nose
    c.tri(cx + 2, cy - 14, cx + 16, cy - 12, cx + 2, cy - 9, S5);
    // Huge toothy unhinged grin + cheeky magenta tongue!
    c.ellipse(cx, cy - 5, 13, 6, EYE_W);
    c.line(cx - 12, cy - 5, cx + 12, cy - 5, INK, 1.4);
    c.line(cx - 6, cy - 10, cx - 6, cy, INK, 1.2);
    c.line(cx, cy - 10, cx, cy, INK, 1.2);
    c.line(cx + 6, cy - 10, cx + 6, cy, INK, 1.2);
    c.ellipse(cx + 6, cy + 1, 5, 3.5, S3);
    // Gloved hands: left holding a lit cartoon bomb, right hoisting oversized magenta mallet!
    c.circle(cx - 22, cy + 6, 6.5, EYE_W);
    c.circle(cx - 28, cy - 4, 8, P2);
    c.circle(cx - 31, cy - 7, 2.2, C_STEEL_L);
    c.star(cx - 23, cy - 16, 5.5, 2.2, 5, C_YEL);
    c.circle(cx + 22, cy + 4, 6.5, EYE_W);
    c.line(cx + 22, cy + 4, cx + 33, cy - 20, C_BRN, 4);
    c.roundRect(cx + 21, cy - 33, 24, 15, 4, S3);
    c.rect(cx + 24, cy - 31, 18, 4, C_PINK);
  } else if (id === 'boss_b_doppel') {
    // Doppel-Peppo — Uncanny Tall Melty Crooked-Toque Mirror Twin!
    // Crooked collapsing melting chef toque leaning heavily to one side
    c.poly(
      [
        [cx - 16, 20],
        [cx - 8, 4],
        [cx + 12, 3],
        [cx + 26, 13],
        [cx + 19, 24],
        [cx - 14, 24],
      ],
      P0
    );
    c.ellipse(cx + 17, 17, 9, 7, P1);
    c.ellipse(cx + 24, 24, 4, 9, P1); // melting toque drip!
    c.line(cx - 6, 20, cx - 2, 7, INK, 1.4);
    c.line(cx + 6, 20, cx + 13, 8, INK, 1.4);
    c.rect(cx - 15, 19, 30, 5, P1);

    // Tall lanky hunched rubber-hose torso with melting tank & apron drips!
    c.poly([[cx - 14, 38], [cx + 14, 38], [cx + 19, 76], [cx - 19, 76]], P0);
    c.poly([[cx - 11, 41], [cx + 11, 41], [cx + 16, 75], [cx - 16, 75]], P2);
    // Dripping black apron ooze tendrils!
    c.ellipse(cx - 13, 79, 4, 7, P2);
    c.ellipse(cx + 14, 78, 4, 8, P2);
    c.ellipse(cx, 80, 3.5, 6, P2);
    // Crooked red accent belt
    c.line(cx - 15, 68, cx + 16, 72, P3, 3);
    // Tall spindly knees & oversized uneven shoes
    c.line(cx - 8, 74, cx - 12, 84, P2, 5);
    c.line(cx + 8, 74, cx + 11, 84, P2, 5);
    c.ellipse(cx - 13, 85, 8, 4, P2);
    c.ellipse(cx + 13, 85, 8, 4, P2);

    // Overly long lanky melting arms hanging low with creepy spindly fingers!
    c.line(cx - 14, 43, cx - 32, 62, P0, 6);
    c.line(cx - 32, 62, cx - 35, 75, P4, 5);
    c.line(cx + 14, 43, cx + 33, 60, P0, 6);
    c.line(cx + 33, 60, cx + 36, 73, P4, 5);
    // Melting sleeve drips & long clawed fingers
    c.ellipse(cx - 26, 61, 3, 7, P1);
    c.ellipse(cx + 27, 59, 3, 7, P1);
    c.circle(cx - 35, 76, 6.5, P4);
    c.circle(cx + 36, 74, 6.5, P4);
    c.line(cx - 39, 79, cx - 42, 86, P5, 2);
    c.line(cx - 35, 80, cx - 35, 87, P5, 2);
    c.line(cx + 39, 77, cx + 42, 84, P5, 2);
    c.line(cx + 35, 78, cx + 35, 85, P5, 2);

    // Uncanny stretched melting head!
    c.ellipse(cx, 33, 15, 14, P4);
    c.ellipse(cx - 12, 46, 4.5, 11, P5); // melty drooping cheek left
    c.ellipse(cx + 13, 48, 4.5, 12, P5); // melty drooping cheek right
    c.ellipse(cx - 3, 47, 4, 8, P4);
    // Mismatched unhinged bulging eyes!
    c.ellipse(cx - 7, 29, 7, 7.5, EYE_W);
    c.ellipse(cx + 8, 32, 5, 4.5, EYE_W);
    c.circle(cx - 8, 28, 3, C_RED);
    c.circle(cx - 8, 28, 1.5, INK);
    c.circle(cx + 9, 33, 2, INK);
    c.arc(cx - 7, 36, 5, 2, 0.2, Math.PI - 0.2, INK, 1.4);
    // Crooked oversized melting nose
    c.ellipse(cx + 2, 35, 6, 4, P5);
    c.ellipse(cx + 1, 34, 4, 3, P4);
    // Jagged crooked asymmetrical mustache
    c.poly(
      [
        [cx - 17, 41],
        [cx - 4, 37],
        [cx + 6, 38],
        [cx + 18, 35],
        [cx + 15, 43],
        [cx + 3, 41],
        [cx - 9, 44],
      ],
      INK
    );
    // Wide unhinged uncanny toothed grin!
    c.poly([[cx - 14, 42], [cx + 15, 40], [cx + 11, 54], [cx - 11, 52]], INK);
    for (let tx = cx - 10; tx <= cx + 10; tx += 4) {
      c.rect(tx, 42, 2.5, 5, EYE_W);
      c.rect(tx + 1, 49, 2.2, 4, EYE_W);
    }
  } else if (id === 'boss_b_megacrust') {
    // Lord Dough — Lanky Maniacal Supervillain in Checkered Shorts, Royal Crown & Unhinged Grin!
    // Dramatic jagged dark-purple cape flaring behind shoulders
    c.poly([[cx - 18, 34], [cx - 38, 68], [cx - 24, 62], [cx + 24, 62], [cx + 38, 68], [cx + 18, 34]], C_PURP_D);

    // Lanky gangly legs with cartoon striped socks & oversized pointy villain shoes!
    c.line(cx - 9, 64, cx - 12, 82, P4, 5);
    c.line(cx + 9, 64, cx + 12, 82, P4, 5);
    c.rect(cx - 14, 73, 5, 8, EYE_W);
    c.rect(cx - 14, 76, 5, 2, C_RED);
    c.rect(cx + 9, 73, 5, 8, EYE_W);
    c.rect(cx + 9, 76, 5, 2, C_RED);
    c.poly([[cx - 23, 86], [cx - 6, 86], [cx - 9, 80], [cx - 20, 82]], C_PURP);
    c.poly([[cx + 6, 86], [cx + 23, 86], [cx + 20, 82], [cx + 9, 80]], C_PURP);

    // Iconic Red-and-White Checkered Shorts!
    c.roundRect(cx - 17, 54, 34, 15, 3, EYE_W);
    for (let sy = 55; sy < 68; sy += 5) {
      for (let sx = cx - 16; sx < cx + 16; sx += 5) {
        if (((Math.floor((sx - (cx - 16)) / 5) + Math.floor((sy - 55) / 5)) & 1) === 0) {
          c.rect(sx, sy, 5, 5, C_RED);
        }
      }
    }
    c.rect(cx - 17, 53, 34, 3, C_GOLD); // Gold waistband!

    // Lanky slender crimson showman vest & crisp white shirt collar
    c.poly([[cx - 14, 35], [cx + 14, 35], [cx + 12, 54], [cx - 12, 54]], C_RED);
    c.tri(cx - 8, 35, cx + 8, 35, cx, 46, EYE_W);
    c.star(cx, 41, 7, 3, 4, C_GOLD); // Dramatic golden bowtie!
    c.circle(cx, 48, 2, C_GOLD);
    c.circle(cx, 52, 2, C_GOLD);

    // Exaggerated lanky rubber-hose arms + theatrical white showman gloves!
    c.line(cx - 14, 39, cx - 31, 49, C_RED_D, 5);
    c.line(cx + 14, 39, cx + 31, 47, C_RED_D, 5);
    c.circle(cx - 33, 51, 8, EYE_W);
    c.circle(cx + 33, 49, 8, EYE_W);
    c.line(cx - 36, 49, cx - 32, 53, INK, 1.3);
    c.line(cx + 32, 47, cx + 36, 51, INK, 1.3);

    // Maniacal tall wedge-crust Lord Dough head + gleeful huge grin + royal golden crown!
    c.tri(cx - 22, 37, cx + 22, 37, cx, 11, C_CHEESE);
    c.roundRect(cx - 23, 32, 46, 8, 3, C_BRN_L); // crispy crust chin-rim
    c.circle(cx - 9, 28, 3, C_RED); // pepperoni dimple
    c.circle(cx + 10, 29, 2.5, C_RED);
    // Gleaming Royal Golden Crown perched atop his head!
    c.poly(
      [
        [cx - 13, 15],
        [cx - 16, 4],
        [cx - 6, 10],
        [cx, 2],
        [cx + 6, 10],
        [cx + 16, 4],
        [cx + 13, 15],
      ],
      C_GOLD
    );
    c.circle(cx, 11, 2.2, C_RED);
    c.circle(cx - 8, 12, 1.8, C_CYAN);
    c.circle(cx + 8, 12, 1.8, C_CYAN);

    // Wild maniacal cartoon eyes & arched brows
    c.ellipse(cx - 8, 23, 5.5, 6, EYE_W);
    c.ellipse(cx + 8, 23, 5.5, 6, EYE_W);
    c.circle(cx - 7, 23, 2.6, C_RED);
    c.circle(cx + 9, 23, 2.6, C_RED);
    c.px(cx - 7, 23, INK);
    c.px(cx + 9, 23, INK);
    c.line(cx - 14, 16, cx - 3, 19, INK, 2);
    c.line(cx + 14, 16, cx + 3, 19, INK, 2);
    // Massive manic rubber-hose grin packed with shiny teeth!
    c.ellipse(cx, 33, 15, 6.5, INK);
    c.ellipse(cx, 32, 13, 4.5, EYE_W);
    c.line(cx - 12, 32, cx + 12, 32, INK, 1.4);
    for (let tx = cx - 9; tx <= cx + 9; tx += 4.5) {
      c.line(tx, 28, tx, 36, INK, 1.1);
    }
  } else {
    // mega_crust_chaser: ULTRA-EXPRESSIVE Giant Grinning Pepperoni Moon Face!
    // Melty dripping cheese tendrils hanging off bottom rim
    c.ellipse(cx - 18, cy + 37, 4.5, 8, C_CHEESE);
    c.ellipse(cx + 16, cy + 38, 4, 7, C_CHEESE_D);
    c.ellipse(cx + 2, cy + 40, 5, 6, C_CHEESE);
    // Blistered oven-baked crispy crust rim
    c.circle(cx, cy, 41, C_BRN);
    c.circle(cx, cy, 39, C_BRN_L);
    // Toasted oven crust bubbles around outer rim
    for (let a = 0; a < 10; a++) {
      const ang = (a * Math.PI * 2) / 10 + 0.2;
      c.circle(cx + Math.cos(ang) * 37, cy + Math.sin(ang) * 37, 3.2, C_BRN_D);
      c.circle(cx + Math.cos(ang) * 36 - 1, cy + Math.sin(ang) * 36 - 1, 1.5, C_GOLD);
    }
    c.circle(cx, cy, 34, C_RED); // glossy deep marinara sauce ring
    c.circle(cx, cy, 31, C_CHEESE); // rich melted cheddar face
    c.ellipse(cx - 6, cy - 8, 22, 16, C_YEL); // glossy cheese highlight
    // Juicy pepperoni cheeks & brow spots with glistening highlights
    c.circle(cx - 21, cy + 6, 7, C_RED_D);
    c.circle(cx - 22, cy + 5, 5, C_RED);
    c.px(cx - 24, cy + 3, C_RED_L);
    c.circle(cx + 21, cy + 6, 7, C_RED_D);
    c.circle(cx + 20, cy + 5, 5, C_RED);
    c.px(cx + 18, cy + 3, C_RED_L);
    c.circle(cx - 17, cy - 20, 5.2, C_RED);
    c.circle(cx + 17, cy - 20, 5.2, C_RED);
    c.circle(cx, cy - 25, 4.5, C_GRN); // green pepper olive crest!

    // Huge bloodshot maniacal glowing eyes & dramatic thick cartoon brows
    c.ellipse(cx - 12, cy - 7, 9, 10.5, EYE_W);
    c.ellipse(cx + 12, cy - 7, 9, 10.5, EYE_W);
    // Crimson manic iris + spiral glint
    c.circle(cx - 10, cy - 6, 4.8, C_RED);
    c.circle(cx + 10, cy - 6, 4.8, C_RED);
    c.circle(cx - 10, cy - 6, 2.3, INK);
    c.circle(cx + 10, cy - 6, 2.3, INK);
    c.circle(cx - 12, cy - 9, 1.8, EYE_W);
    c.circle(cx + 8, cy - 9, 1.8, EYE_W);
    c.line(cx - 23, cy - 17, cx - 2, cy - 11, INK, 4.2);
    c.line(cx + 23, cy - 17, cx + 2, cy - 11, INK, 4.2);

    // Big mischievous cartoon mushroom/olive nose + sweeping dark mustache!
    c.ellipse(cx, cy + 3, 8, 5.5, C_ORG);
    c.ellipse(cx - 2, cy + 1.5, 4.5, 2.8, C_GOLD);
    c.poly(
      [
        [cx - 28, cy + 10],
        [cx - 10, cy + 6],
        [cx + 10, cy + 6],
        [cx + 28, cy + 10],
        [cx + 23, cy + 17],
        [cx + 10, cy + 13],
        [cx, cy + 15],
        [cx - 10, cy + 13],
        [cx - 23, cy + 17],
      ],
      INK
    );

    // Ultra-expressive wide chomping maniacal toothy grin + crimson tongue!
    c.ellipse(cx, cy + 21, 19, 10, INK);
    c.ellipse(cx, cy + 25, 11, 5, C_RED);
    c.ellipse(cx, cy + 26, 7, 3, C_PINK);
    for (let tx = cx - 15; tx <= cx + 13; tx += 5) {
      c.rect(tx, cy + 13, 4, 6, EYE_W);
      c.rect(tx + 0.5, cy + 25, 3.5, 4.5, EYE_W);
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
      c.rect(2, 5, 12, 9, C_STONE_L);
      c.rect(18, 18, 12, 9, C_STONE_D);
      c.line(0, 16, s, 16, INK, 1.5);
      c.line(16, 0, 16, 16, INK, 1.5);
      c.line(8, 16, 8, s, INK, 1.5);
      c.line(24, 16, 24, s, INK, 1.5);
      c.line(4, 21, 7, 25, INK, 1); // subtle stone crack
      break;
    case 'tile_solid_lobby_brick':
      // Floor 1 Lobby — Royal purple castle brickwork with lavender mortar bevels
      c.rect(0, 0, s, s, C_PLUM);
      c.rect(0, 0, s, 4, C_PLUM_L);
      c.rect(0, s - 3, s, 3, C_PLUM_D);
      c.rect(2, 12, 11, 7, C_PLUM_D);
      c.rect(18, 2, 12, 7, C_PLUM_L);
      c.line(0, 10, s, 10, INK, 1.5);
      c.line(0, 21, s, 21, INK, 1.5);
      c.line(15, 0, 15, 10, INK, 1.5);
      c.line(7, 10, 7, 21, INK, 1.5);
      c.line(23, 10, 23, 21, INK, 1.5);
      c.line(14, 21, 14, s, INK, 1.5);
      c.px(4, 3, C_GOLD); // gilded mortar glint
      break;
    case 'tile_solid_catacomb':
      // Floor 1 Catacombs — Scorched obsidian & ember-veined brick
      c.rect(0, 0, s, s, hexToRgba('#54232c'));
      c.rect(0, 0, s, 4, hexToRgba('#8f3940'));
      c.rect(0, s - 4, s, 4, hexToRgba('#2e1118'));
      c.line(0, 11, s, 11, INK, 1.6);
      c.line(0, 22, s, 22, INK, 1.6);
      c.line(12, 0, 12, 11, INK, 1.6);
      c.line(22, 11, 22, 22, INK, 1.6);
      c.line(9, 22, 9, s, INK, 1.6);
      c.line(13, 13, 19, 19, C_ORG, 1.4); // glowing lava vein
      break;
    case 'tile_solid_brick':
      c.rect(0, 0, s, s, hexToRgba('#9e4b3a'));
      c.rect(0, 0, s, 4, hexToRgba('#cc6c56'));
      c.rect(0, s - 3, s, 3, hexToRgba('#6e2e24'));
      c.line(0, 10, s, 10, INK, 1.5);
      c.line(0, 21, s, 21, INK, 1.5);
      c.line(14, 0, 14, 10, INK, 1.5);
      c.line(6, 10, 6, 21, INK, 1.5);
      c.line(22, 10, 22, 21, INK, 1.5);
      c.line(16, 21, 16, s, INK, 1.5);
      break;
    case 'tile_solid_mesa':
      // Floor 2 Western — Stratified red-rock terracotta canyon sandstone
      c.rect(0, 0, s, s, C_TERRA);
      c.rect(0, 0, s, 5, C_TERRA_L);
      c.rect(0, 11, s, 6, C_TERRA_D);
      c.rect(0, 23, s, 9, C_TERRA_D);
      c.rect(0, 17, s, 4, C_TERRA_L);
      c.line(0, 11, s, 11, INK, 1.2);
      c.line(0, 23, s, 23, INK, 1.2);
      c.line(10, 4, 14, 10, INK, 1.1);
      c.line(22, 18, 26, 23, INK, 1.1);
      break;
    case 'tile_solid_graveyard':
      // Floor 2 Graveyard — Moss-rimmed spooky midnight cobblestone
      c.rect(0, 0, s, s, hexToRgba('#494c69'));
      c.rect(0, 0, s, 5, hexToRgba('#6c7499'));
      c.rect(2, 0, 9, 4, C_GRN_D);
      c.rect(19, 0, 8, 3, C_GRN_D);
      c.roundRect(2, 7, 13, 10, 3, hexToRgba('#5d6182'));
      c.roundRect(17, 7, 13, 10, 3, hexToRgba('#3d3f59'));
      c.roundRect(8, 19, 16, 11, 3, hexToRgba('#575b7a'));
      c.line(0, 18, s, 18, INK, 1.4);
      c.line(16, 6, 16, 18, INK, 1.4);
      break;
    case 'tile_solid_wood':
      c.rect(0, 0, s, s, C_BRN);
      c.rect(0, 0, s, 4, C_BRN_L);
      c.rect(0, s - 3, s, 3, C_BRN_D);
      for (let y = 8; y < s; y += 8) {
        c.line(0, y, s, y, C_BRN_D, 1.5);
      }
      c.line(16, 0, 16, 8, C_BRN_D, 1.4);
      c.line(8, 8, 8, 16, C_BRN_D, 1.4);
      c.line(24, 16, 24, 24, C_BRN_D, 1.4);
      c.circle(5, 4, 1.5, INK);
      c.circle(27, 20, 1.5, INK);
      break;
    case 'tile_solid_resort':
      // Floor 3 Resort — Sunlit turquoise & cream seaside boardwalk mosaic
      c.rect(0, 0, s, s, C_TEAL);
      c.rect(0, 0, s, 5, C_CREAM);
      c.rect(0, 5, s, 2, C_GOLD);
      c.rect(2, 9, 12, 10, C_TEAL_L);
      c.rect(18, 20, 12, 10, C_TEAL_D);
      c.line(0, 19, s, 19, INK, 1.3);
      c.line(16, 7, 16, s, INK, 1.3);
      break;
    case 'tile_solid_orbit':
      // Floor 3 Space — Starry cosmic hull alloy with cyan energy trim
      c.rect(0, 0, s, s, hexToRgba('#252154'));
      c.rect(0, 0, s, 3, C_CYAN);
      c.rect(2, 5, s - 4, s - 8, hexToRgba('#342e73'));
      c.line(0, 16, s, 16, INK, 1.4);
      c.line(16, 3, 16, s, INK, 1.4);
      c.circle(6, 9, 1.6, C_GOLD);
      c.circle(26, 24, 1.6, C_CYAN);
      c.px(23, 10, EYE_W);
      c.px(9, 25, EYE_W);
      break;
    case 'tile_solid_golf':
      // Floor 3 Golf — Manicured checkered fairway turf over rich earth
      c.rect(0, 0, s, s, C_BRN);
      c.rect(0, 10, s, s - 10, C_BRN_D);
      c.circle(9, 20, 3, C_BRN);
      c.circle(23, 25, 3.5, C_BRN);
      c.rect(0, 0, 16, 9, C_GRN);
      c.rect(16, 0, 16, 9, C_LIME);
      c.rect(0, 8, s, 3, C_GRN_D);
      c.line(0, 11, s, 11, INK, 1.4);
      break;
    case 'tile_solid_slum_brick':
      // Floor 4 Neon Slum — Damp wet-brick subway masonry with neon specular rim
      c.rect(0, 0, s, s, C_SLUM);
      c.rect(0, 0, s, 4, C_SLUM_L);
      c.rect(0, s - 3, s, 3, C_SLUM_D);
      c.line(0, 10, s, 10, INK, 1.6);
      c.line(0, 21, s, 21, INK, 1.6);
      c.line(13, 0, 13, 10, INK, 1.6);
      c.line(6, 10, 6, 21, INK, 1.6);
      c.line(23, 10, 23, 21, INK, 1.6);
      c.line(16, 21, 16, s, INK, 1.6);
      // Wet glossy rain reflection streaks!
      c.line(3, 3, 10, 3, C_CYAN, 1.2);
      c.line(18, 14, 21, 18, C_MAG, 1.2);
      break;
    case 'tile_solid_sewer':
      // Floor 4 Sewer — Grimy moss-teal drainage tile with industrial pipe rivets
      c.rect(0, 0, s, s, hexToRgba('#2f4f46'));
      c.rect(0, 0, s, 4, hexToRgba('#57856d'));
      c.rect(0, s - 4, s, 4, hexToRgba('#1b302b'));
      c.rect(3, 6, 11, 10, hexToRgba('#3c6658'));
      c.rect(18, 17, 11, 10, hexToRgba('#254038'));
      c.line(0, 16, s, 16, INK, 1.5);
      c.line(16, 0, 16, s, INK, 1.5);
      c.circle(25, 8, 2.2, C_LIME); // slime drip highlight
      c.circle(7, 24, 1.8, C_STEEL);
      break;
    case 'tile_solid_metal':
      c.rect(0, 0, s, s, C_STEEL_D);
      c.rect(2, 2, s - 4, 4, C_STEEL_L);
      c.rect(3, 6, s - 6, s - 9, C_STEEL);
      c.line(6, 24, 18, 12, C_STEEL_L, 1.5);
      c.line(14, 24, 26, 12, C_STEEL_D, 1.5);
      c.circle(6, 6, 1.8, INK);
      c.circle(26, 6, 1.8, INK);
      c.circle(6, 26, 1.8, INK);
      c.circle(26, 26, 1.8, INK);
      break;
    case 'tile_solid_cheese':
      c.rect(0, 0, s, s, C_CHEESE);
      c.rect(0, 0, s, 4, C_YEL);
      c.rect(0, s - 3, s, 3, C_CHEESE_D);
      c.circle(9, 13, 4, C_CHEESE_D);
      c.circle(23, 22, 5, C_CHEESE_D);
      c.circle(22, 8, 2.5, C_CHEESE_D);
      c.circle(8, 12, 1.5, C_YEL);
      break;
    case 'tile_solid_neon':
      c.rect(0, 0, s, s, hexToRgba('#20163d'));
      c.rect(0, 0, s, 3, C_MAG);
      c.rect(0, s - 3, s, 3, C_CYAN);
      c.rect(4, 6, s - 8, s - 12, hexToRgba('#2d1f59'));
      c.line(4, 6, s - 4, s - 6, hexToRgba('#5e3ba6'), 1.5);
      c.line(s - 4, 6, 4, s - 6, hexToRgba('#5e3ba6'), 1.5);
      c.circle(16, 16, 3, C_CYAN);
      break;
    case 'tile_solid_snow':
      c.rect(0, 0, s, s, hexToRgba('#6d90ba'));
      c.tri(2, 28, 12, 12, 20, 28, C_ICE_D);
      c.tri(14, 28, 24, 14, 30, 28, C_ICE);
      c.rect(0, 0, s, 9, EYE_W);
      c.circle(6, 9, 4, EYE_W);
      c.circle(16, 10, 4.5, EYE_W);
      c.circle(26, 9, 4, EYE_W);
      c.line(0, 12, s, 12, C_ICE, 1.2);
      break;
    case 'tile_solid_manor':
      // Floor 5 Haunted Manor — Ornate dark-plum gothic wainscot & cobwebbed stone
      c.rect(0, 0, s, s, hexToRgba('#382447'));
      c.rect(0, 0, s, 4, hexToRgba('#6c4b85'));
      c.rect(3, 7, s - 6, s - 10, hexToRgba('#2b1a38'));
      c.rect(6, 10, s - 12, s - 16, hexToRgba('#4a325c'));
      c.line(0, 4, s, 4, C_GOLD_D, 1.3);
      c.line(0, s - 2, s, s - 2, INK, 1.5);
      break;
    case 'tile_solid_war':
      c.rect(0, 0, s, s, hexToRgba('#495439'));
      c.rect(0, 0, s, 4, hexToRgba('#7a8a5e'));
      c.rect(0, s - 3, s, 3, hexToRgba('#2b3321'));
      c.roundRect(3, 8, 12, 8, 3, hexToRgba('#636e4d'));
      c.roundRect(17, 8, 12, 8, 3, hexToRgba('#576143'));
      c.roundRect(6, 18, 20, 9, 3, hexToRgba('#38402c'));
      c.circle(6, 6, 1.5, INK);
      c.circle(26, 6, 1.5, INK);
      break;
    case 'tile_solid_spire':
      // Floor 5 Crumbling Spire — Dark crimson-basalt masonry split with glowing spire cracks!
      c.rect(0, 0, s, s, hexToRgba('#471d2c'));
      c.rect(0, 0, s, 4, hexToRgba('#803242'));
      c.rect(0, s - 4, s, 4, hexToRgba('#260e18'));
      c.line(0, 15, s, 15, INK, 1.6);
      c.line(15, 0, 15, 15, INK, 1.6);
      c.line(8, 15, 8, s, INK, 1.6);
      // Glowing molten crumbling spire fracture!
      c.line(4, 3, 14, 14, C_ORG, 2.2);
      c.line(14, 14, 24, 26, C_GOLD, 1.8);
      c.line(14, 14, 25, 10, C_YEL, 1.3);
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

  // ---- 2. Chef Peppo Transformations (All 18 — Hilarious & Unmistakably Distinct!) ----
  p.add('peppo_transfo_knight', 64, 64, 32, 59, (c) => {
    // Gleaming riveted steel knight armor with flowing crimson plume, mustache under visor & broadsword!
    // Flowing crimson crest plume
    c.poly([[29, 4], [49, 7], [44, 15], [34, 17]], C_RED);
    c.poly([[32, 7], [46, 9], [41, 13]], C_RED_L);
    // Steel pauldrons & breastplate
    c.circle(18, 41, 7, C_STEEL);
    c.circle(44, 41, 7, C_STEEL);
    c.roundRect(18, 36, 26, 18, 5, C_STEEL_D);
    c.roundRect(21, 38, 20, 12, 3, C_STEEL);
    c.line(23, 40, 28, 46, C_STEEL_L, 2); // armor polish glint
    // Golden belt & crest
    c.rect(19, 48, 24, 4, C_GOLD);
    // Domed steel helm + visor slit + glowing eyes + iconic mustache poking out!
    c.roundRect(19, 14, 24, 23, 8, C_STEEL);
    c.roundRect(21, 16, 10, 10, 4, C_STEEL_L);
    c.rect(21, 22, 20, 6, INK);
    c.circle(27, 25, 2, C_GOLD);
    c.circle(36, 25, 2, C_GOLD);
    // Peppo's mustache poking right under the knight visor!
    c.poly([[22, 33], [27, 30], [35, 30], [41, 33], [38, 35], [25, 35]], INK);
    // Oversized gleaming broadsword held high with golden crossguard!
    c.poly([[45, 39], [59, 10], [61, 14], [49, 41]], C_STEEL_L);
    c.line(47, 39, 58, 14, EYE_W, 1.5);
    c.line(41, 34, 53, 40, C_GOLD, 3.5);
    c.circle(44, 43, 3, C_GOLD_D);
    // Armored sabatons
    c.ellipse(24, 57, 6, 3.5, C_STEEL_D);
    c.ellipse(38, 57, 6, 3.5, C_STEEL_D);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_ball', 64, 64, 32, 59, (c) => {
    // Giant rolling swiss-cheese boulder with squished toque, dizzy eyes & flailing feet!
    // Flailing shoes sticking out top-left & bottom-right
    c.ellipse(12, 26, 6, 3.5, P2);
    c.ellipse(52, 48, 6, 3.5, P2);
    // Squished chef toque stuck to top of cheese ball
    c.ellipse(28, 13, 9, 6, P0);
    c.ellipse(35, 14, 7, 5, P1);
    // Giant round cheddar boulder
    c.circle(32, 37, 21, C_CHEESE);
    c.circle(36, 41, 16, C_CHEESE_D);
    c.circle(27, 32, 13, C_YEL);
    // Swiss cheese craters
    c.circle(19, 44, 4, C_CHEESE_D);
    c.circle(45, 31, 3.5, C_CHEESE_D);
    c.circle(38, 51, 3, C_CHEESE_D);
    // Spinning cartoon motion arcs
    c.arc(32, 37, 19, 19, -0.6, 0.9, EYE_W, 2);
    c.arc(32, 37, 19, 19, 2.5, 3.8, C_ORG, 2);
    // Frantic Peppo face squished in the middle!
    c.ellipse(26, 35, 4.5, 5, EYE_W);
    c.ellipse(37, 35, 4.5, 5, EYE_W);
    c.circle(27, 34, 2, INK);
    c.circle(36, 36, 2, INK);
    c.poly([[21, 42], [28, 40], [36, 40], [43, 42], [38, 45], [26, 45]], INK);
    c.circle(32, 47, 3.5, INK);
    c.circle(32, 47.5, 2, C_RED);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_bomb', 64, 64, 32, 59, (c) => {
    // Panicked sweating Peppo sprinting while holding a GIGANTIC sizzling iron bomb overhead!
    drawPeppoPose(c, {
      lean: 5,
      squash: 5,
      armL: [-9, -18],
      armR: [9, -18],
      wheelLegs: true,
      eyes: 'wide',
      mouth: 'scream',
      sweat: true,
      speedLines: true,
    });
    // Giant sizzling cartoon iron bomb overhead
    c.circle(33, 16, 12, P2);
    c.circle(29, 12, 3.5, C_STEEL_L);
    c.rect(28, 3, 10, 4, C_STEEL_D); // bomb cap
    c.line(23, 17, 43, 17, C_RED, 2.2); // red danger stripe
    c.arc(38, 6, 7, 5, -Math.PI, 0.2, C_TAN, 2); // sizzling rope fuse
    // Explosive sparkling fuse burst!
    c.star(46, 8, 8, 3, 6, C_ORG);
    c.star(46, 8, 5, 2, 6, C_YEL);
    c.circle(46, 8, 2.2, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_fire_butt', 64, 64, 32, 59, (c) => {
    // Airborne shrieking Peppo rocketing upward on a hilarious blazing rear jet-flame!
    // Massive roaring multi-stage flame plume shooting downward
    c.poly([[14, 38], [50, 38], [44, 54], [32, 63], [20, 54]], C_RED);
    c.poly([[19, 39], [45, 39], [39, 52], [32, 60], [25, 52]], C_ORG);
    c.poly([[24, 40], [40, 40], [32, 55]], C_YEL);
    c.poly([[28, 41], [36, 41], [32, 49]], EYE_W);
    // Smoke puffs on sides
    c.circle(13, 52, 5, C_CREAM);
    c.circle(51, 52, 5, C_CREAM);
    // High-flying screaming Peppo holding his scorched backside!
    drawPeppoPose(c, {
      squash: -10,
      hatTilt: 8,
      armL: [-11, 10],
      armR: [11, 10],
      legL: [-11, -3],
      legR: [11, -3],
      eyes: 'wide',
      mouth: 'scream',
      sweat: true,
    });
  });
  p.add('peppo_transfo_firemouth', 64, 64, 32, 59, (c) => {
    // Spicy bright-red-faced Peppo blasting a HUGE flamethrower fireball forward!
    drawPeppoPose(c, {
      lean: 5,
      armL: [-13, 2],
      armR: [-7, 7],
      eyes: 'rage',
      mouth: 'scream',
      speedLines: true,
    });
    // Spicy red heat blush on face + whistling steam from ears!
    c.ellipse(34, 24, 8, 6, C_RED_L);
    c.circle(17, 17, 4, EYE_W);
    c.circle(12, 13, 3, C_CREAM);
    // Huge roaring cartoon fire jet blasting out of mouth!
    c.poly([[39, 26], [62, 12], [58, 25], [63, 35], [56, 42], [39, 33]], C_RED);
    c.poly([[41, 27], [59, 17], [56, 26], [60, 34], [41, 32]], C_ORG);
    c.poly([[42, 28], [55, 22], [55, 32]], C_YEL);
    c.circle(46, 29, 3, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_ghost', 64, 64, 32, 59, (c) => {
    // Translucent floating mint-cyan ectoplasm Peppo with spectral toque, mustache & spooky wisps!
    // Floating ectoplasm orbit motes
    c.circle(10, 22, 3.5, C_CYAN);
    c.circle(54, 18, 3, C_GHOST);
    c.circle(52, 46, 2.5, C_CYAN);
    // Glowing translucent spectral chef toque!
    c.ellipse(27, 11, 8, 6, C_GHOST);
    c.ellipse(37, 11, 8, 6, C_GHOST_D);
    c.ellipse(32, 8, 9, 6, C_GHOST);
    // Billowing ghostly sheet body with wavy ecto-tail
    c.ellipse(32, 31, 18, 19, C_GHOST);
    c.ellipse(35, 34, 13, 14, C_GHOST_D);
    c.ellipse(29, 28, 12, 13, C_GHOST);
    c.tri(14, 38, 19, 57, 27, 44, C_GHOST);
    c.tri(24, 44, 32, 60, 40, 44, C_GHOST_D);
    c.tri(37, 44, 45, 57, 50, 38, C_GHOST);
    // Spooky outstretched phantom arms
    c.ellipse(12, 34, 6, 4, C_GHOST);
    c.ellipse(52, 34, 6, 4, C_GHOST);
    // Glowing wide haunted eyes + iconic floating black mustache + "OOOOH" wail mouth!
    c.ellipse(26, 27, 5, 6, EYE_W);
    c.ellipse(38, 27, 5, 6, EYE_W);
    c.circle(27, 27, 2.2, C_PURP_D);
    c.circle(39, 27, 2.2, C_PURP_D);
    c.poly([[21, 35], [27, 33], [37, 33], [43, 35], [39, 38], [25, 38]], INK);
    c.ellipse(32, 43, 5.5, 6.5, INK);
    c.ellipse(32, 44, 3, 3.5, C_CYAN_D);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_beak', 64, 64, 32, 59, (c) => {
    // Cheerful Peppo with an adorable goofy plump white chicken pal perched on his hat!
    drawPeppoPose(c, { lean: 2, armL: [-13, -4], armR: [14, -4], eyes: 'wide', mouth: 'grin' });
    // Plump white cartoon chicken buddy clinging to toque!
    c.ellipse(32, 13, 12, 8, EYE_W);
    c.ellipse(29, 15, 7, 5, C_CREAM);
    // Flapping little white wing + tail feathers
    c.tri(16, 10, 22, 15, 19, 5, EYE_W);
    c.ellipse(27, 14, 5, 3, C_STONE_L);
    // Bright red floppy comb & wattle
    c.circle(28, 5, 3.5, C_RED);
    c.circle(33, 4, 3.8, C_RED);
    c.circle(38, 6, 3, C_RED);
    c.circle(41, 17, 2.5, C_RED);
    // Expressive googly chicken eye + pointy orange beak!
    c.circle(37, 11, 3.2, EYE_W);
    c.circle(38, 11, 1.6, INK);
    c.tri(42, 10, 53, 13, 42, 16, C_ORG);
    c.line(42, 13, 51, 13, INK, 1.2);
    // Orange bird claws gripping Peppo's toque
    c.line(29, 20, 27, 23, C_ORG, 1.8);
    c.line(35, 20, 37, 23, C_ORG, 1.8);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_weenie', 64, 64, 32, 59, (c) => {
    // Hilarious giant smiling hotdog-in-a-bun mount with squiggly mustard & cowboy-riding Peppo!
    // Peppo riding wildly on top holding imaginary reins!
    c.ellipse(29, 29, 9, 7, P2);
    c.line(33, 28, 44, 33, P0, 4.5);
    c.circle(45, 33, 3.5, P4);
    drawPeppoHead(c, 28, 22, -5, 'wide', 'scream', true);
    // Giant toasted bun & glossy plump sausage mount!
    c.roundRect(7, 36, 50, 15, 7.5, C_BRN);
    c.roundRect(10, 38, 42, 5, 3, C_RED);
    c.roundRect(11, 44, 42, 10, 5, C_TAN);
    c.roundRect(14, 45, 36, 4, 2, C_CREAM);
    // Bright yellow squiggly mustard zigzag across the hotdog!
    c.line(14, 40, 20, 37, C_YEL, 2.6);
    c.line(20, 37, 26, 41, C_YEL, 2.6);
    c.line(26, 41, 32, 37, C_YEL, 2.6);
    c.line(32, 37, 38, 41, C_YEL, 2.6);
    c.line(38, 41, 44, 38, C_YEL, 2.6);
    // Cute smiling hotdog face & sprinting tiny legs!
    c.circle(49, 41, 3.2, EYE_W);
    c.circle(50, 41, 1.6, INK);
    c.arc(51, 45, 4, 2.5, 0, Math.PI, INK, 1.5);
    c.line(18, 53, 14, 58, INK, 3);
    c.line(28, 53, 30, 58, INK, 3);
    c.line(44, 53, 49, 58, INK, 3);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_barrel', 64, 64, 32, 59, (c) => {
    // Chunky oak barrel with iron hoops, Peppo's hat popping out the top & eyes peeking through planks!
    // Chef toque popped straight out of the top!
    c.ellipse(28, 12, 8, 6, P0);
    c.ellipse(36, 13, 8, 6, P1);
    c.ellipse(32, 9, 9, 6, P0);
    // Stubby sprinting shoes underneath
    c.ellipse(22, 57, 6.5, 3.5, P2);
    c.ellipse(42, 57, 6.5, 3.5, P2);
    // Bulging wooden barrel body with plank seams
    c.ellipse(32, 37, 21, 20, C_BRN);
    c.roundRect(14, 19, 36, 36, 9, C_BRN);
    c.rect(18, 20, 5, 34, C_BRN_L);
    c.line(24, 19, 24, 55, C_BRN_D, 1.6);
    c.line(32, 19, 32, 55, C_BRN_D, 1.6);
    c.line(40, 19, 40, 55, C_BRN_D, 1.6);
    // Riveted dark iron barrel hoops
    c.rect(13, 24, 38, 5, C_STEEL_D);
    c.rect(13, 45, 38, 5, C_STEEL_D);
    c.circle(18, 26, 1.5, C_STEEL_L);
    c.circle(46, 26, 1.5, C_STEEL_L);
    c.circle(18, 47, 1.5, C_STEEL_L);
    c.circle(46, 47, 1.5, C_STEEL_L);
    // Dark peek-slot with Peppo's frantic wide eyes & mustache!
    c.roundRect(19, 31, 26, 11, 3, INK);
    c.ellipse(26, 36, 4, 4.5, EYE_W);
    c.ellipse(38, 36, 4, 4.5, EYE_W);
    c.circle(27, 36, 1.8, INK);
    c.circle(39, 36, 1.8, INK);
    c.poly([[23, 41], [32, 39], [41, 41], [38, 44], [26, 44]], INK);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_rocket', 64, 64, 32, 59, (c) => {
    // Retro red-and-white rocket blasting horizontally with terrified clinging Peppo & huge exhaust flame!
    // Blazing multi-layer jet exhaust plume on the left
    c.poly([[1, 39], [18, 28], [18, 50]], C_RED);
    c.poly([[5, 39], [18, 32], [18, 46]], C_ORG);
    c.poly([[10, 39], [18, 35], [18, 43]], C_YEL);
    c.circle(16, 39, 3.5, EYE_W);
    // Tail fins
    c.tri(15, 29, 28, 29, 13, 17, C_STEEL_D);
    c.tri(15, 49, 28, 49, 13, 60, C_STEEL_D);
    // Striped rocket fuselage & gleaming nosecone
    c.roundRect(16, 29, 32, 20, 6, C_RED);
    c.rect(25, 29, 8, 20, EYE_W); // crisp white rocket stripe
    c.rect(38, 29, 4, 20, C_YEL);
    c.circle(29, 39, 4.5, C_CYAN); // porthole window
    c.circle(28, 38, 1.8, EYE_W);
    c.tri(47, 29, 47, 49, 62, 39, EYE_W);
    c.tri(47, 39, 47, 49, 62, 39, C_STEEL_L);
    // Screaming Peppo clinging tightly on top with hat whipped backward!
    c.line(25, 30, 36, 33, P0, 4.5);
    c.circle(37, 33, 3.5, P4);
    drawPeppoHead(c, 31, 22, -9, 'rage', 'scream', true);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_golf_carry', 64, 64, 32, 59, (c) => {
    // Sporty golfing Peppo swinging a gleaming iron club with green visor & dimpled golf ball!
    // Comic swing whoosh arc behind club
    c.arc(44, 34, 16, 16, -1.2, 0.9, C_CYAN, 2.5);
    drawPeppoPose(c, { lean: 4, armL: [-8, -6], armR: [15, -7], eyes: 'smug', mouth: 'grin' });
    // Jaunty green golf visor right across forehead!
    c.rect(26, 17, 21, 4, C_GRN);
    c.rect(36, 18, 14, 3, C_LIME);
    // Gleaming silver golf club held in swing
    c.line(46, 20, 56, 48, C_STEEL_L, 3);
    c.roundRect(51, 46, 10, 5, 2, C_STEEL_D);
    // Dimpled cartoon golf ball ready by feet!
    c.circle(15, 53, 6, EYE_W);
    c.px(13, 51, C_STONE);
    c.px(17, 54, C_STONE);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_cheese_sticky', 64, 64, 32, 59, (c) => {
    // Gooey dripping cheddar-slime Peppo covered in stretchy melted mozzarella tendrils!
    // Sticky cheese puddles & stretching wall-climb drips
    c.ellipse(15, 54, 8, 6, C_CHEESE_D);
    c.ellipse(49, 54, 8, 6, C_CHEESE_D);
    c.ellipse(32, 56, 22, 6, C_CHEESE);
    // Stretchy cheese tendrils sticking off arms
    c.line(14, 34, 6, 44, C_CHEESE, 4);
    c.line(50, 34, 58, 44, C_CHEESE, 4);
    c.circle(6, 45, 3.5, C_YEL);
    c.circle(58, 45, 3.5, C_YEL);
    // Melted gooey cheese body + melty toque blob!
    c.ellipse(32, 15, 11, 8, C_YEL);
    c.ellipse(32, 37, 20, 21, C_CHEESE);
    c.ellipse(36, 41, 14, 15, C_CHEESE_D);
    c.ellipse(28, 31, 12, 11, C_YEL);
    // Melty goo drips hanging off chin/brow
    c.ellipse(21, 45, 3.5, 7, C_YEL);
    c.ellipse(43, 44, 3.5, 7, C_CHEESE_D);
    // Confused wide cartoon Peppo eyes + mustache poking out of goo!
    c.ellipse(26, 31, 4.5, 5, EYE_W);
    c.ellipse(38, 31, 4.5, 5, EYE_W);
    c.circle(27, 32, 2, INK);
    c.circle(39, 30, 2, INK);
    c.poly([[21, 39], [28, 37], [36, 37], [43, 39], [39, 42], [25, 42]], INK);
    c.ellipse(32, 45, 4, 3, INK);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_trash_roll', 64, 64, 32, 59, (c) => {
    // High-speed sliding galvanized trash-can rocket sled with Peppo peeking out the lid & sparks!
    // Speed sparks shooting off bottom edge
    c.star(10, 54, 7, 3, 5, C_YEL);
    c.line(2, 48, 16, 48, C_ORG, 2.5);
    // Goofy banana peel & fishbone sticking out back
    c.arc(12, 26, 7, 6, 0.3, 2.5, C_YEL, 3);
    // Sideways corrugated galvanized steel trash can!
    c.roundRect(12, 24, 37, 30, 6, C_STEEL);
    c.rect(14, 26, 33, 6, C_STEEL_L); // metallic highlight
    c.line(20, 26, 20, 52, C_STEEL_D, 2.5);
    c.line(28, 26, 28, 52, C_STEEL_D, 2.5);
    c.line(36, 26, 36, 52, C_STEEL_D, 2.5);
    c.line(44, 26, 44, 52, C_STEEL_D, 2.5);
    // Cracked-open front trash lid with Peppo's frantic wide eyes & mustache peeking out!
    c.rect(44, 29, 8, 20, INK);
    c.ellipse(47, 35, 3.8, 4.2, EYE_W);
    c.circle(48, 35, 1.6, INK);
    c.poly([[44, 42], [53, 41], [51, 45], [44, 45]], INK);
    // Tilted steel lid shield + handle at front
    c.roundRect(51, 22, 6, 34, 3, C_STEEL_L);
    c.arc(57, 39, 4, 6, -1.4, 1.4, C_STEEL_D, 2.5);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_boxed_flat', 64, 64, 32, 59, (c) => {
    // Hilariously accordion-flattened pizzeria delivery box with glaring eyes peeking from lid slit!
    // Tiny flat shuffling cartoon shoes underneath
    c.ellipse(20, 58, 6, 2.5, P2);
    c.ellipse(44, 58, 6, 2.5, P2);
    // Flat cardboard pizza box body with pizzeria stripe & stamp!
    c.rect(8, 36, 48, 20, C_CREAM);
    c.rect(8, 36, 48, 6, C_RED);
    c.rect(10, 37, 44, 2, EYE_W); // crisp trim line
    // Little pizzeria emblem on top lid
    c.circle(32, 39, 3, C_GOLD);
    // Cracked dark lid slit revealing squished flat glaring Peppo eyes & mustache!
    c.rect(13, 44, 38, 8, INK);
    c.rect(20, 45, 8, 5, EYE_W);
    c.rect(36, 45, 8, 5, EYE_W);
    c.circle(25, 48, 1.8, INK);
    c.circle(41, 48, 1.8, INK);
    c.poly([[23, 52], [32, 50], [41, 52], [38, 54], [26, 54]], INK);
    // Squished flat chef toque ribbon on top!
    c.ellipse(32, 34, 12, 3, P0);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_inferno_pepper', 64, 64, 32, 59, (c) => {
    // Blazing Super-Spicy Inferno Pepper Power-Up! Roaring flame corona, fiery boots & chili sparks!
    c.star(32, 33, 30, 17, 12, C_RED);
    c.star(32, 33, 23, 13, 10, C_ORG);
    c.star(32, 33, 16, 9, 8, C_YEL);
    // Jet flames kicking off feet
    c.poly([[10, 56], [26, 48], [22, 61]], C_ORG);
    c.poly([[38, 48], [54, 56], [42, 61]], C_ORG);
    drawPeppoPose(c, {
      lean: 9,
      squash: -3,
      hatTilt: -9,
      armL: [-16, -6],
      armR: [17, -6],
      eyes: 'rage',
      mouth: 'scream',
      capeFlame: true,
      speedLines: true,
    });
    // Flaming chili crest flickering right off chef hat!
    c.tri(24, 6, 36, 6, 30, 1, C_YEL);
    c.tri(18, 11, 26, 11, 21, 3, C_ORG);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_cross', 64, 64, 32, 59, (c) => {
    // Radiant Holy Exorcist Peppo with celestial golden starburst, floating halo & ornate golden cross!
    // Golden radiant starburst + light rays
    c.star(32, 33, 29, 16, 10, C_GOLD);
    c.star(32, 33, 21, 11, 10, C_YEL);
    c.circle(32, 33, 14, EYE_W);
    // Floating shining angel halo above chef hat!
    c.ring(32, 6, 13, 4.5, 2.5, C_GOLD);
    c.ring(32, 5.5, 11, 3.5, 1.5, EYE_W);
    drawPeppoPose(c, { lean: 2, armL: [-10, 4], armR: [16, -4], eyes: 'smug', mouth: 'grin' });
    // Gleaming ornate golden cross thrust forward!
    c.rect(47, 17, 6, 28, C_GOLD);
    c.rect(40, 24, 20, 6, C_GOLD);
    c.rect(49, 19, 2, 24, EYE_W);
    c.rect(42, 26, 16, 2, EYE_W);
    c.star(50, 27, 7, 2.5, 4, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_shotgun', 64, 64, 32, 59, (c) => {
    // Hardboiled action-hero Peppo wielding a chunky double-barreled pump shotgun & red shell sash!
    drawPeppoPose(c, {
      lean: 4,
      armL: [6, 6],
      armR: [15, 3],
      eyes: 'shades',
      mouth: 'smug',
    });
    // Diagonal red shotgun-shell bandolier across apron!
    c.line(24, 31, 39, 44, C_BRN_D, 4.5);
    c.rect(26, 32, 3, 4, C_RED);
    c.rect(31, 36, 3, 4, C_RED);
    c.rect(35, 40, 3, 4, C_RED);
    // Chunky oversized double-barreled pump shotgun!
    c.poly([[22, 37], [33, 34], [34, 42], [23, 44]], C_BRN); // walnut stock
    c.rect(32, 32, 28, 7, C_STEEL_D); // twin barrels
    c.rect(32, 32, 28, 3, C_STEEL_L); // top sheen
    c.rect(38, 38, 12, 4, C_BRN_L); // ribbed pump grip
    c.rect(56, 31, 4, 9, C_GOLD); // brass muzzle clamp
    c.inkOutline(INK, 1);
  });
  p.add('peppo_transfo_revolver', 64, 64, 32, 59, (c) => {
    // Western quick-draw Peppo with red bandana neckerchief, shades & gleaming brass-cylinder revolver!
    drawPeppoPose(c, {
      lean: 5,
      armL: [-12, 4],
      armR: [16, -1],
      eyes: 'shades',
      mouth: 'smug',
    });
    // Red cowboy neckerchief bandana!
    c.tri(24, 30, 42, 30, 34, 40, C_RED);
    c.line(27, 32, 39, 32, C_GOLD, 1.4);
    // Gleaming six-shooter revolver aimed dead ahead!
    c.roundRect(38, 33, 6, 8, 2, C_BRN); // wooden handle
    c.rect(40, 27, 20, 6, C_STEEL_D); // barrel
    c.rect(40, 27, 20, 2.5, C_STEEL_L); // chrome highlight
    c.circle(45, 32, 4.2, C_GOLD); // brass cylinder
    c.circle(45, 32, 1.5, C_GOLD_D);
    c.rect(57, 25, 3, 3, C_STEEL_L); // front sight
    c.star(59, 27, 4.5, 1.5, 4, EYE_W); // metallic barrel glint!
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
    // Roof glowing TAXI checker topper sign!
    c.roundRect(24, 2, 16, 6, 2, C_GOLD);
    c.rect(26, 3, 12, 4, EYE_W);
    c.line(28, 5, 36, 5, INK, 1.4);
    // Yellow checkered cab body + glossy roof & windshield!
    c.roundRect(15, 8, 32, 14, 5, C_YEL);
    c.rect(19, 11, 24, 8, C_CYAN);
    c.line(22, 12, 26, 17, EYE_W, 1.5); // glass reflection
    c.roundRect(5, 18, 54, 19, 6, C_YEL);
    c.rect(7, 19, 50, 4, C_GOLD);
    // Bold black-and-white checkered cab stripe!
    c.rect(7, 25, 50, 6, EYE_W);
    for (let x = 8; x < 55; x += 6) {
      c.rect(x, 25, 3, 3, INK);
      c.rect(x + 3, 28, 3, 3, INK);
    }
    // Glowing front headlight, red taillight & chrome bumpers
    c.rect(55, 21, 4, 6, EYE_W);
    c.rect(5, 21, 3, 5, C_RED);
    c.rect(4, 32, 6, 3, C_STEEL_L);
    c.rect(54, 32, 6, 3, C_STEEL_L);
    // Chunky cartoon wheels with shiny hubcaps
    c.circle(16, 37, 6.2, P2);
    c.circle(16, 37, 2.8, C_STEEL_L);
    c.circle(48, 37, 6.2, P2);
    c.circle(48, 37, 2.8, C_STEEL_L);
    c.inkOutline(INK, 1);
  });
  p.add('prop_alarm_sensor', 36, 36, 18, 18, (c) => {
    // Industrial mounting bracket & ribbed rotating red siren dome!
    c.roundRect(7, 24, 22, 8, 3, C_STEEL_D);
    c.rect(10, 25, 16, 3, C_STEEL_L);
    c.circle(18, 17, 12, C_RED_D);
    c.circle(18, 17, 10, C_RED);
    c.circle(18, 16, 6.5, C_ORG);
    c.circle(18, 15, 3.8, C_YEL);
    c.circle(16, 13, 2, EYE_W);
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

  // ---- 11. World & Destructible Tiles (32: 21 original + 11 Wave 2 Floor-specific tiles) ----
  const tileKeys = [
    'tile_break_marble',
    'tile_break_metal',
    'tile_ice_solid',
    'tile_solid_stone',
    'tile_solid_lobby_brick',
    'tile_solid_catacomb',
    'tile_solid_brick',
    'tile_solid_mesa',
    'tile_solid_graveyard',
    'tile_solid_wood',
    'tile_solid_resort',
    'tile_solid_orbit',
    'tile_solid_golf',
    'tile_solid_slum_brick',
    'tile_solid_sewer',
    'tile_solid_metal',
    'tile_solid_cheese',
    'tile_solid_neon',
    'tile_solid_snow',
    'tile_solid_manor',
    'tile_solid_war',
    'tile_solid_spire',
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

  // ---- 13. FX Sprites & 5-Floor Parallax Motifs ----
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
  // Wave 2 Shotgun / Revolver directional cartoon muzzle flash!
  p.add('fx_muzzle_flash', 48, 32, 6, 16, (c) => {
    c.poly(
      [
        [4, 16],
        [15, 5],
        [21, 11],
        [45, 7],
        [33, 16],
        [46, 24],
        [20, 21],
        [14, 27],
      ],
      C_ORG
    );
    c.poly(
      [
        [5, 16],
        [16, 9],
        [37, 12],
        [27, 16],
        [37, 20],
        [16, 23],
      ],
      C_YEL
    );
    c.ellipse(14, 16, 8, 4.5, EYE_W);
    c.inkOutline(INK, 1);
  });
  // Wave 2 Rotating red alarm sensor / taxi headlight cone!
  p.add('fx_beacon_cone', 64, 32, 4, 16, (c) => {
    c.poly(
      [
        [3, 15],
        [62, 2],
        [62, 30],
        [3, 17],
      ],
      [255, 255, 255, 120]
    );
    c.poly(
      [
        [4, 15],
        [52, 8],
        [52, 24],
        [4, 17],
      ],
      [255, 255, 255, 185]
    );
  });

  // ---- Parallax Motifs (Original 8 Enriched + 13 Wave 2 Floor 1-5 Signature Landmarks) ----
  p.add('bg_cloud', 96, 48, 48, 24, (c) => {
    c.ellipse(28, 30, 22, 14, C_CREAM);
    c.ellipse(54, 25, 26, 18, EYE_W);
    c.ellipse(74, 32, 18, 12, C_CREAM);
    c.ellipse(38, 23, 18, 12, EYE_W);
    c.inkOutline(INK, 1);
  });
  p.add('bg_tower_silhouette', 96, 128, 48, 128, (c) => {
    c.rect(20, 24, 56, 104, C_PLUM_D);
    c.rect(24, 28, 14, 96, C_PLUM);
    c.rect(14, 14, 14, 14, C_PLUM_D);
    c.rect(41, 14, 14, 14, C_PLUM_D);
    c.rect(68, 14, 14, 14, C_PLUM_D);
    // Pointed banner spire on roof
    c.tri(34, 16, 62, 16, 48, 2, C_PLUM);
    c.rect(31, 44, 11, 17, C_GOLD);
    c.rect(54, 44, 11, 17, C_GOLD);
    c.roundRect(40, 76, 16, 26, 7, C_ORG);
    c.line(48, 76, 48, 102, INK, 2);
  });
  p.add('bg_castle_keep', 96, 128, 48, 128, (c) => {
    // Floor 1 Lobby & Keep — Multi-turret gothic purple cartoon castle with flags!
    c.rect(10, 46, 76, 82, C_PLUM_D);
    c.rect(10, 34, 20, 94, C_PLUM);
    c.rect(66, 34, 20, 94, C_PLUM);
    c.rect(34, 22, 28, 106, C_PLUM_D);
    c.tri(6, 36, 34, 36, 20, 10, C_RED_D);
    c.tri(62, 36, 90, 36, 76, 10, C_RED_D);
    c.tri(30, 24, 66, 24, 48, 2, C_RED);
    // Pennant flags
    c.tri(48, 2, 62, 6, 48, 10, C_GOLD);
    // Glowing arched castle windows & portcullis
    c.roundRect(16, 52, 8, 14, 4, C_GOLD);
    c.roundRect(72, 52, 8, 14, 4, C_GOLD);
    c.roundRect(42, 36, 12, 18, 5, C_YEL);
    c.roundRect(36, 92, 24, 36, 11, INK);
    c.line(44, 94, 44, 126, C_STEEL_D, 2);
    c.line(52, 94, 52, 126, C_STEEL_D, 2);
  });
  p.add('bg_pizza_moon', 64, 64, 32, 32, (c) => {
    c.circle(32, 32, 28, C_BRN_L);
    c.circle(32, 32, 25, C_CHEESE);
    c.circle(22, 23, 5, C_RED);
    c.circle(41, 21, 4.5, C_RED);
    c.circle(35, 41, 6, C_RED);
    c.circle(19, 41, 3.5, C_CHEESE_D);
    c.circle(45, 36, 3, C_CHEESE_D);
    c.inkOutline(INK, 1);
  });
  p.add('bg_pillar_arch', 64, 128, 32, 128, (c) => {
    c.rect(6, 0, 16, 128, C_PLUM_D);
    c.rect(42, 0, 16, 128, C_PLUM_D);
    c.rect(0, 0, 64, 24, C_PLUM);
    c.clearEllipse(32, 26, 14, 14);
    c.rect(4, 20, 20, 5, C_PLUM_L);
    c.rect(40, 20, 20, 5, C_PLUM_L);
  });
  p.add('bg_tree', 64, 96, 32, 96, (c) => {
    c.rect(25, 52, 14, 44, C_BRN_D);
    c.rect(27, 54, 5, 40, C_BRN);
    c.circle(32, 35, 23, C_GRN_D);
    c.circle(19, 44, 15, C_GRN_D);
    c.circle(45, 44, 15, C_GRN_D);
    c.circle(30, 29, 13, C_GRN);
    c.circle(23, 38, 8, C_GRN);
  });
  p.add('bg_cactus', 48, 80, 24, 80, (c) => {
    // Enriched Floor 2 Western saguaro cactus with vertical ribs & desert blossom!
    c.roundRect(17, 12, 14, 68, 6, C_GRN_D);
    c.roundRect(5, 29, 14, 10, 4, C_GRN_D);
    c.roundRect(5, 17, 9, 19, 4, C_GRN_D);
    c.roundRect(29, 36, 14, 10, 4, C_GRN_D);
    c.roundRect(34, 23, 9, 20, 4, C_GRN_D);
    c.line(22, 16, 22, 76, C_GRN, 2);
    c.line(27, 18, 27, 76, C_GRN, 1.5);
    c.star(24, 10, 5.5, 2.5, 5, C_PINK); // desert cactus flower!
    c.circle(24, 10, 2, C_YEL);
  });
  p.add('bg_mesa_canyon', 96, 96, 48, 96, (c) => {
    // Floor 2 Western — Layered terraced red-rock desert mesa butte!
    c.poly([[4, 96], [16, 46], [30, 46], [36, 18], [64, 18], [72, 42], [86, 42], [94, 96]], C_TERRA_D);
    c.poly([[10, 96], [20, 50], [34, 50], [39, 22], [62, 22], [69, 46], [82, 46], [88, 96]], C_TERRA);
    c.rect(36, 18, 28, 6, C_TERRA_L);
    c.rect(18, 46, 16, 5, C_TERRA_L);
    c.rect(18, 64, 64, 5, C_TERRA_D);
    c.rect(12, 78, 74, 6, C_BRN_D);
  });
  p.add('bg_saloon_front', 96, 112, 48, 112, (c) => {
    // Floor 2 Western — Classic timber saloon false-front with glowing windows & batwing doors!
    c.rect(10, 32, 76, 80, C_BRN_D);
    c.rect(14, 36, 68, 76, C_BRN);
    // False-front stepped parapet & golden sign board
    c.roundRect(14, 10, 68, 26, 4, C_BRN_D);
    c.rect(20, 15, 56, 14, C_TAN);
    c.line(26, 22, 70, 22, C_RED_D, 3);
    // Glowing saloon windows + porch roof
    c.rect(20, 46, 18, 22, C_GOLD);
    c.rect(58, 46, 18, 22, C_GOLD);
    c.line(29, 46, 29, 68, INK, 2);
    c.line(67, 46, 67, 68, INK, 2);
    c.rect(6, 70, 84, 7, C_BRN_L);
    // Swinging batwing doors
    c.rect(37, 82, 22, 30, INK);
    c.roundRect(38, 86, 9, 18, 2, C_BRN_L);
    c.roundRect(49, 86, 9, 18, 2, C_BRN_L);
  });
  p.add('bg_gravestone', 64, 80, 32, 80, (c) => {
    // Floor 2 Graveyard — Crooked mossy tombstones & iron fence spikes!
    for (let fx = 4; fx < 62; fx += 10) {
      c.rect(fx, 44, 3, 36, INK);
      c.tri(fx - 1, 44, fx + 4, 44, fx + 1.5, 38, INK);
    }
    c.rect(2, 54, 60, 3, INK);
    c.roundRect(16, 20, 30, 58, 13, C_STONE_D);
    c.roundRect(19, 23, 24, 52, 11, C_STONE);
    c.rect(29, 30, 4, 16, INK);
    c.rect(24, 34, 14, 4, INK);
    c.ellipse(22, 24, 7, 3, C_GRN_D);
  });
  p.add('bg_palm_pier', 88, 120, 44, 120, (c) => {
    // Floor 3 Resort — Tropical curving palm tree perched by wooden pier pilings!
    // Boardwalk pier posts & deck
    c.rect(4, 96, 80, 9, C_BRN_L);
    c.rect(10, 105, 8, 15, C_BRN_D);
    c.rect(70, 105, 8, 15, C_BRN_D);
    // Curved segmented palm trunk
    c.line(42, 98, 34, 66, C_BRN, 10);
    c.line(34, 66, 44, 34, C_BRN_L, 8);
    // Coconuts
    c.circle(40, 36, 4, C_BRN_D);
    c.circle(48, 37, 4, C_BRN_D);
    // Sweeping lush tropical fronds!
    c.poly([[44, 30], [10, 18], [18, 34], [44, 34]], C_GRN);
    c.poly([[44, 30], [16, 40], [26, 49], [44, 35]], C_GRN_D);
    c.poly([[44, 30], [78, 16], [70, 32], [44, 34]], C_GRN);
    c.poly([[44, 30], [76, 42], [64, 50], [44, 35]], C_GRN_D);
    c.poly([[44, 29], [36, 6], [54, 8], [46, 30]], C_LIME);
  });
  p.add('bg_space_dome', 96, 104, 48, 104, (c) => {
    // Floor 3 Space — Starry cosmic observatory dome with glowing ringed planet!
    // Twinkling starfield dots
    c.star(14, 18, 5, 2, 4, C_YEL);
    c.star(82, 14, 4, 1.5, 4, C_CYAN);
    c.px(26, 10, EYE_W);
    c.px(70, 26, EYE_W);
    // Translucent glass observatory dome
    c.ellipse(48, 72, 38, 36, hexToRgba('#2d2566'));
    c.ellipse(48, 72, 34, 32, hexToRgba('#42388c'));
    c.arc(48, 72, 34, 32, Math.PI, Math.PI * 2, C_CYAN, 2.5);
    // Ringed cartoon planet inside starry dome!
    c.circle(48, 60, 12, C_MAG);
    c.ellipse(48, 60, 24, 5, C_GOLD);
    c.circle(48, 57, 10, C_PURP);
    // Metallic observatory base rim
    c.roundRect(6, 74, 84, 30, 4, C_STEEL_D);
    c.rect(10, 78, 76, 6, C_STEEL);
    c.rect(18, 88, 12, 8, C_CYAN);
    c.rect(42, 88, 12, 8, C_GOLD);
    c.rect(66, 88, 12, 8, C_CYAN);
  });
  p.add('bg_subway_arch', 88, 112, 44, 112, (c) => {
    // Floor 4 Neon Slum — Wet-brick subway tunnel arch with glowing neon bar sign!
    c.rect(4, 8, 80, 104, C_SLUM_D);
    c.rect(4, 8, 80, 10, C_SLUM_L);
    c.clearEllipse(44, 62, 26, 36);
    c.rect(18, 62, 52, 50, CLEAR);
    // Actually clear tunnel opening pixels cleanly
    for (let y = 62; y < 112; y++) {
      for (let x = 18; x < 70; x++) c.clearPx(x, y);
    }
    // Glowing neon marquee bar across top arch!
    c.roundRect(18, 12, 52, 12, 4, C_MAG);
    c.rect(22, 15, 44, 6, C_CYAN);
    // Wet reflection rivets on brick piers
    c.rect(8, 32, 6, 68, C_SLUM);
    c.rect(74, 32, 6, 68, C_SLUM);
  });
  p.add('bg_sewer_pipes', 80, 112, 40, 112, (c) => {
    // Floor 4 Drain — Tangled industrial sewer pipes with dripping lime slime & red valve wheel!
    c.rect(12, 0, 18, 112, hexToRgba('#2e594c'));
    c.rect(15, 0, 5, 112, hexToRgba('#57997f'));
    c.rect(50, 24, 16, 88, C_STEEL_D);
    c.rect(53, 24, 5, 88, C_STEEL);
    // Horizontal cross-pipe & bolted flanges
    c.rect(0, 44, 80, 16, hexToRgba('#3d6e5e'));
    c.rect(0, 47, 80, 4, hexToRgba('#6eb595'));
    c.rect(8, 40, 6, 24, C_STEEL_D);
    c.rect(64, 40, 6, 24, C_STEEL_D);
    // Red valve wheel!
    c.ring(40, 52, 11, 11, 3, C_RED);
    c.line(31, 52, 49, 52, C_RED, 2.5);
    c.line(40, 43, 40, 61, C_RED, 2.5);
    // Glowing toxic lime drips!
    c.ellipse(26, 67, 3.5, 8, C_LIME);
    c.circle(26, 79, 3, C_LIME);
  });
  p.add('bg_gear', 64, 64, 32, 32, (c) => {
    c.star(32, 32, 30, 21, 10, C_STEEL_D);
    c.circle(32, 32, 20, C_STEEL);
    c.circle(32, 32, 15, C_STEEL_D);
    c.clearEllipse(32, 32, 8, 8);
    c.ring(32, 32, 10, 10, 2.2, C_GOLD);
    c.circle(32, 17, 2.2, C_STEEL_L);
    c.circle(32, 47, 2.2, C_STEEL_L);
    c.circle(17, 32, 2.2, C_STEEL_L);
    c.circle(47, 32, 2.2, C_STEEL_L);
  });
  p.add('bg_ice_crystal', 64, 104, 32, 104, (c) => {
    // Floor 4 Freezer — Faceted gleaming glacial ice crystal spire cluster!
    c.poly([[32, 4], [48, 36], [42, 104], [22, 104], [16, 36]], C_ICE_D);
    c.poly([[32, 4], [40, 36], [34, 104], [22, 104], [18, 36]], C_ICE);
    c.poly([[32, 6], [36, 36], [30, 74], [24, 36]], EYE_W);
    c.poly([[12, 36], [24, 64], [22, 104], [4, 104], [4, 60]], C_ICE);
    c.poly([[52, 42], [60, 66], [58, 104], [40, 104], [42, 64]], C_ICE_D);
    c.star(32, 22, 6, 2, 4, EYE_W);
  });
  p.add('bg_chandelier', 80, 96, 40, 20, (c) => {
    // Floor 5 Manor — Haunted gothic wrought-iron chandelier with flickering candles!
    c.line(40, 0, 40, 42, INK, 4); // hanging chain
    c.arc(40, 48, 28, 16, 0, Math.PI, C_STEEL_D, 4);
    c.arc(40, 44, 16, 10, 0, Math.PI, C_GOLD_D, 3);
    // 5 eerie candles + glowing flames
    const xs = [12, 26, 40, 54, 68];
    for (const cx0 of xs) {
      c.rect(cx0 - 3, 30, 6, 16, C_CREAM);
      c.tri(cx0 - 3, 29, cx0 + 3, 29, cx0, 18, C_ORG);
      c.tri(cx0 - 1.5, 29, cx0 + 1.5, 29, cx0, 22, C_YEL);
    }
    // Creepy hanging cobweb threads
    c.line(12, 46, 26, 62, [220, 220, 240, 130], 1.2);
    c.line(68, 46, 54, 62, [220, 220, 240, 130], 1.2);
  });
  p.add('bg_arcade_cabinet', 72, 112, 36, 112, (c) => {
    // Floor 5 Arcade — Glowing retro synthwave arcade cabinet with lit CRT screen!
    c.poly([[10, 112], [10, 52], [18, 10], [54, 10], [62, 52], [62, 112]], hexToRgba('#231645'));
    c.roundRect(14, 12, 44, 14, 3, C_MAG); // glowing top marquee
    c.rect(18, 15, 36, 8, C_YEL);
    // Glowing cyan CRT arcade monitor!
    c.roundRect(16, 30, 40, 28, 5, C_CYAN);
    c.rect(20, 34, 32, 20, hexToRgba('#152247'));
    c.star(36, 44, 7, 3, 5, C_LIME);
    // Control deck with joystick & neon buttons
    c.rect(10, 62, 52, 8, C_PURP);
    c.line(22, 62, 22, 54, C_STEEL_L, 2.5);
    c.circle(22, 53, 3.5, C_RED);
    c.circle(42, 65, 2.5, C_YEL);
    c.circle(50, 65, 2.5, C_CYAN);
    // Coin door
    c.rect(24, 78, 24, 24, P2);
    c.rect(28, 84, 6, 8, C_ORG);
    c.rect(38, 84, 6, 8, C_ORG);
  });
  p.add('bg_war_trench', 96, 96, 48, 96, (c) => {
    // Floor 5 Blitz — War trench watchtower, sandbag parapet & angled searchlight beam!
    // Dramatic searchlight beam sweeping upward
    c.poly([[54, 42], [14, 0], [44, 0], [60, 42]], [255, 245, 170, 95]);
    // Wooden/steel watchtower frame
    c.line(54, 42, 44, 96, hexToRgba('#38402b'), 5);
    c.line(74, 42, 84, 96, hexToRgba('#38402b'), 5);
    c.roundRect(48, 28, 32, 18, 3, hexToRgba('#495439'));
    c.circle(54, 40, 4, C_YEL);
    // Stacked sandbags along bottom trench parapet
    for (let sx = 6; sx < 86; sx += 18) {
      c.roundRect(sx, 78, 17, 10, 4, C_TAN_D);
      c.roundRect(sx + 6, 86, 17, 10, 4, C_TAN);
    }
    // Barbed wire line across trench top
    c.line(2, 74, 94, 74, INK, 1.5);
    for (let wx = 10; wx < 90; wx += 14) {
      c.line(wx - 3, 71, wx + 3, 77, INK, 1.4);
      c.line(wx + 3, 71, wx - 3, 77, INK, 1.4);
    }
  });
  p.add('bg_spire_cracks', 80, 128, 40, 128, (c) => {
    // Floor 5 Crumbling Spire — Shattering tower column splitting with glowing golden/molten fractures!
    c.poly([[16, 0], [64, 0], [60, 52], [68, 128], [12, 128], [20, 56]], hexToRgba('#3b1525'));
    c.rect(12, 0, 56, 10, hexToRgba('#692438'));
    // Dramatic glowing molten spire cracks splitting the masonry!
    c.line(38, 6, 26, 38, C_ORG, 5);
    c.line(26, 38, 52, 72, C_ORG, 5);
    c.line(52, 72, 34, 124, C_ORG, 5);
    c.line(38, 6, 26, 38, C_GOLD, 2.5);
    c.line(26, 38, 52, 72, C_YEL, 2.5);
    c.line(52, 72, 34, 124, C_YEL, 2.5);
    c.line(26, 38, 16, 46, C_YEL, 2);
    c.line(52, 72, 64, 62, C_YEL, 2);
    // Floating broken rubble chunks detaching off the spire!
    c.roundRect(2, 34, 10, 10, 2, hexToRgba('#5e2236'));
    c.roundRect(68, 48, 10, 12, 2, hexToRgba('#5e2236'));
  });
  p.add('bg_window_glow', 40, 64, 20, 32, (c) => {
    c.roundRect(4, 4, 32, 56, 14, C_GOLD);
    c.roundRect(8, 8, 24, 48, 11, C_YEL);
    c.line(20, 4, 20, 60, INK, 3);
    c.line(4, 32, 36, 32, INK, 3);
    c.inkOutline(INK, 1);
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
