// ============================================================================
// Krunked Tower — Zero-Allocation Particles & Mach Afterimage Pools
// Pre-allocated fixed pools:
//   - 256 particles (dust, sparks, marble/metal chunks, starbursts, parry rings,
//     slam waves, flames, smoke, confetti, speed lines, floating score pops)
//   - 32-slot afterimage ring buffer (ENGINE_CONSTANTS.MAX_AFTERIMAGES)
// ZERO per-frame heap allocations!
// ============================================================================

import { ENGINE_CONSTANTS, type ParticleKind, type SimEvent } from '../contracts/index';

export const MAX_PARTICLES = 256;
export const MAX_AFTERIMAGES = ENGINE_CONSTANTS.MAX_AFTERIMAGES; // 32

export interface ParticleSlot {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  size: number;
  endSize: number;
  age: number;
  maxAge: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  rotation: number;
  vRot: number;
  text: string;
}

export interface AfterimageSlot {
  active: boolean;
  x: number;
  y: number;
  facing: 1 | -1;
  spriteKey: string;
  r: number;
  g: number;
  b: number;
  alpha: number;
  age: number;
  maxAge: number;
}

// Pre-parsed color scratch tuple (reused, zero alloc)
const TMP_RGB = new Float32Array(3);

function parseHexToFloatRgb(hex: string | undefined, defR: number, defG: number, defB: number): void {
  if (!hex || hex.length < 4) {
    TMP_RGB[0] = defR;
    TMP_RGB[1] = defG;
    TMP_RGB[2] = defB;
    return;
  }
  const s = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      TMP_RGB[0] = r / 255;
      TMP_RGB[1] = g / 255;
      TMP_RGB[2] = b / 255;
      return;
    }
  } else if (s.length >= 6) {
    const n = parseInt(s.slice(0, 6), 16);
    if (!Number.isNaN(n)) {
      TMP_RGB[0] = ((n >> 16) & 255) / 255;
      TMP_RGB[1] = ((n >> 8) & 255) / 255;
      TMP_RGB[2] = (n & 255) / 255;
      return;
    }
  }
  TMP_RGB[0] = defR;
  TMP_RGB[1] = defG;
  TMP_RGB[2] = defB;
}

const CONFETTI_COLORS: readonly [number, number, number][] = [
  [1.0, 0.28, 0.35],
  [1.0, 0.85, 0.22],
  [0.24, 0.92, 1.0],
  [0.42, 0.94, 0.42],
  [1.0, 0.35, 0.82],
  [0.72, 0.44, 1.0],
];

export class ParticlesAndTrails {
  readonly particles: ParticleSlot[];
  readonly afterimages: AfterimageSlot[];

  activeParticleCount = 0;
  activeAfterimageCount = 0;

  private particleCursor = 0;
  private afterimageCursor = 0;
  // Purely visual deterministic LCG seed (isolated from sim RNG)
  private visualSeed = 0x51a7c3d9;

  constructor() {
    this.particles = new Array<ParticleSlot>(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = {
        active: false,
        kind: 'dust',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        gravity: 0,
        drag: 1,
        size: 8,
        endSize: 0,
        age: 0,
        maxAge: 0.4,
        r: 1,
        g: 1,
        b: 1,
        alpha: 1,
        rotation: 0,
        vRot: 0,
        text: '',
      };
    }

    this.afterimages = new Array<AfterimageSlot>(MAX_AFTERIMAGES);
    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      this.afterimages[i] = {
        active: false,
        x: 0,
        y: 0,
        facing: 1,
        spriteKey: 'peppo_mach2',
        r: 1,
        g: 0.3,
        b: 0.3,
        alpha: 0.65,
        age: 0,
        maxAge: 0.22,
      };
    }
  }

  private rand(): number {
    this.visualSeed = (Math.imul(this.visualSeed, 1664525) + 1013904223) >>> 0;
    return this.visualSeed / 4294967296;
  }

  private randRange(min: number, max: number): number {
    return min + (max - min) * this.rand();
  }

  clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i].active = false;
    }
    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      this.afterimages[i].active = false;
    }
    this.activeParticleCount = 0;
    this.activeAfterimageCount = 0;
  }

  private acquireParticle(): ParticleSlot {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const idx = (this.particleCursor + i) % MAX_PARTICLES;
      if (!this.particles[idx].active) {
        this.particleCursor = (idx + 1) % MAX_PARTICLES;
        return this.particles[idx];
      }
    }
    // Pool full: recycle oldest ring cursor slot without allocation
    const slot = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
    return slot;
  }

  spawnParticleBurst(
    kind: ParticleKind,
    x: number,
    y: number,
    vx = 0,
    vy = 0,
    color?: string,
    count = 1,
    text = ''
  ): void {
    const clampedCount = Math.max(1, Math.min(24, count | 0));

    for (let n = 0; n < clampedCount; n++) {
      const p = this.acquireParticle();
      p.active = true;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.age = 0;
      p.text = text;
      p.rotation = 0;
      p.vRot = 0;
      p.drag = 0.96;

      switch (kind) {
        case 'dust':
          parseHexToFloatRgb(color, 0.95, 0.91, 0.82);
          p.vx = vx + this.randRange(-45, 45);
          p.vy = vy + this.randRange(-55, -10);
          p.gravity = 90;
          p.size = this.randRange(10, 18);
          p.endSize = 2;
          p.maxAge = this.randRange(0.22, 0.38);
          p.alpha = 0.9;
          break;

        case 'spark':
          parseHexToFloatRgb(color, 1.0, 0.88, 0.25);
          p.vx = vx + this.randRange(-190, 190);
          p.vy = vy + this.randRange(-180, -30);
          p.gravity = 420;
          p.size = this.randRange(7, 13);
          p.endSize = 1;
          p.maxAge = this.randRange(0.18, 0.34);
          p.alpha = 1.0;
          p.vRot = this.randRange(-10, 10);
          break;

        case 'marble_chunk':
          parseHexToFloatRgb(color, 0.88, 0.84, 0.78);
          p.vx = vx + this.randRange(-210, 210);
          p.vy = vy + this.randRange(-280, -80);
          p.gravity = 880;
          p.drag = 0.99;
          p.size = this.randRange(8, 15);
          p.endSize = 6;
          p.maxAge = this.randRange(0.45, 0.75);
          p.alpha = 1.0;
          p.vRot = this.randRange(-12, 12);
          break;

        case 'metal_chunk':
          parseHexToFloatRgb(color, 0.65, 0.74, 0.82);
          p.vx = vx + this.randRange(-260, 260);
          p.vy = vy + this.randRange(-320, -100);
          p.gravity = 960;
          p.drag = 0.99;
          p.size = this.randRange(9, 16);
          p.endSize = 7;
          p.maxAge = this.randRange(0.45, 0.8);
          p.alpha = 1.0;
          p.vRot = this.randRange(-14, 14);
          break;

        case 'starburst':
          parseHexToFloatRgb(color, 1.0, 0.86, 0.28);
          p.vx = vx * 0.2;
          p.vy = vy * 0.2;
          p.gravity = 0;
          p.size = 22;
          p.endSize = 64;
          p.maxAge = 0.28;
          p.alpha = 1.0;
          p.vRot = 4.5;
          break;

        case 'parry_ring':
          parseHexToFloatRgb(color, 1.0, 0.97, 0.65);
          p.vx = 0;
          p.vy = 0;
          p.gravity = 0;
          p.size = 18;
          p.endSize = 92;
          p.maxAge = 0.26;
          p.alpha = 1.0;
          break;

        case 'slam_wave':
          parseHexToFloatRgb(color, 1.0, 0.92, 0.65);
          p.vx = (n % 2 === 0 ? 1 : -1) * this.randRange(140, 240);
          p.vy = this.randRange(-35, -5);
          p.gravity = 40;
          p.size = 24;
          p.endSize = 6;
          p.maxAge = 0.28;
          p.alpha = 0.95;
          break;

        case 'flame':
          parseHexToFloatRgb(color, 1.0, 0.52, 0.14);
          p.vx = vx + this.randRange(-55, 55);
          p.vy = vy + this.randRange(-120, -30);
          p.gravity = -120;
          p.size = this.randRange(12, 20);
          p.endSize = 3;
          p.maxAge = this.randRange(0.22, 0.42);
          p.alpha = 0.95;
          break;

        case 'smoke':
          parseHexToFloatRgb(color, 0.55, 0.52, 0.6);
          p.vx = vx + this.randRange(-30, 30);
          p.vy = vy + this.randRange(-70, -25);
          p.gravity = -40;
          p.size = this.randRange(12, 18);
          p.endSize = 28;
          p.maxAge = this.randRange(0.35, 0.6);
          p.alpha = 0.72;
          break;

        case 'confetti': {
          const cc = CONFETTI_COLORS[(n + (this.visualSeed & 7)) % CONFETTI_COLORS.length];
          TMP_RGB[0] = cc[0];
          TMP_RGB[1] = cc[1];
          TMP_RGB[2] = cc[2];
          p.vx = vx + this.randRange(-190, 190);
          p.vy = vy + this.randRange(-260, -70);
          p.gravity = 320;
          p.drag = 0.95;
          p.size = this.randRange(6, 10);
          p.endSize = 5;
          p.maxAge = this.randRange(0.7, 1.25);
          p.alpha = 1.0;
          p.vRot = this.randRange(-12, 12);
          break;
        }

        case 'speed_line':
          parseHexToFloatRgb(color, 1.0, 1.0, 1.0);
          p.vx = vx !== 0 ? vx : -380;
          p.vy = vy;
          p.gravity = 0;
          p.drag = 1;
          p.size = this.randRange(24, 48);
          p.endSize = 18;
          p.maxAge = this.randRange(0.1, 0.18);
          p.alpha = 0.85;
          break;

        case 'score_pop':
        case 'combo_pop':
          parseHexToFloatRgb(color, 1.0, 0.92, 0.25);
          p.vx = vx * 0.2;
          p.vy = -68;
          p.gravity = 45;
          p.drag = 0.94;
          p.size = kind === 'combo_pop' ? 14 : 11;
          p.endSize = p.size;
          p.maxAge = 0.72;
          p.alpha = 1.0;
          break;
      }

      p.r = TMP_RGB[0];
      p.g = TMP_RGB[1];
      p.b = TMP_RGB[2];
    }
  }

  spawnAfterimage(
    x: number,
    y: number,
    facing: 1 | -1,
    spriteKey: string,
    tintHex: string,
    alpha = 0.65,
    maxAge = 0.22
  ): void {
    const slot = this.afterimages[this.afterimageCursor];
    this.afterimageCursor = (this.afterimageCursor + 1) % MAX_AFTERIMAGES;

    parseHexToFloatRgb(tintHex, 1.0, 0.25, 0.35);
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.facing = facing;
    slot.spriteKey = spriteKey;
    slot.r = TMP_RGB[0];
    slot.g = TMP_RGB[1];
    slot.b = TMP_RGB[2];
    slot.alpha = alpha;
    slot.age = 0;
    slot.maxAge = maxAge;
  }

  consumeEvents(events: readonly SimEvent[]): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'particle') {
        this.spawnParticleBurst(
          ev.kind,
          ev.x,
          ev.y,
          ev.vx ?? 0,
          ev.vy ?? 0,
          ev.color,
          ev.count ?? (ev.kind === 'score_pop' || ev.kind === 'combo_pop' || ev.kind === 'parry_ring' || ev.kind === 'starburst' ? 1 : 6),
          ev.text ?? ''
        );
      } else if (ev.type === 'afterimage') {
        this.spawnAfterimage(ev.x, ev.y, ev.facing, ev.spriteKey, ev.tint, ev.alpha ?? 0.68);
      }
    }
  }

  update(dtSeconds: number): void {
    const dt = dtSeconds > 0.05 ? 0.05 : dtSeconds < 0 ? 0 : dtSeconds;
    const dragPow = dt * 60;

    let pCount = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        continue;
      }
      if (p.drag < 0.999) {
        const d = Math.pow(p.drag, dragPow);
        p.vx *= d;
        p.vy *= d;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vRot * dt;
      pCount++;
    }
    this.activeParticleCount = pCount;

    let aCount = 0;
    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      const a = this.afterimages[i];
      if (!a.active) continue;
      a.age += dt;
      if (a.age >= a.maxAge) {
        a.active = false;
        continue;
      }
      aCount++;
    }
    this.activeAfterimageCount = aCount;
  }
}
