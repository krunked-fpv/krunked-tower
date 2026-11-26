// ============================================================================
// Krunked Tower — All 5 Boss Definitions & Clean-Room Arenas
// Pure declarative data — ZERO DOM or RNG calls.
// ============================================================================

import type { BossDef, BossId, RoomDef, RoomThemeId } from '../contracts/index';

function buildArenaRoom(
  id: string,
  name: string,
  theme: RoomThemeId,
  widthTiles: number,
  heightTiles: number,
  options?: {
    platforms?: Array<{ x: number; y: number; w: number }>;
    marblePillars?: Array<{ x: number; y: number; h: number }>;
  },
): RoomDef {
  const grid: string[][] = Array.from({ length: heightTiles }, () =>
    Array.from({ length: widthTiles }, () => '.'),
  );

  // Outer borders: ceiling at row 0, solid walls at col 0 & widthTiles-1, ground rows heightTiles-3..heightTiles-1
  const floorRow = heightTiles - 3; // For heightTiles=17, floorRow=14 (y=448)
  for (let x = 0; x < widthTiles; x++) {
    grid[0][x] = '#';
    for (let y = floorRow; y < heightTiles; y++) {
      grid[y][x] = '#';
    }
  }
  for (let y = 0; y < heightTiles; y++) {
    grid[y][0] = '#';
    grid[y][widthTiles - 1] = '#';
  }

  // Optional one-way catwalks
  if (options?.platforms) {
    for (const p of options.platforms) {
      for (let dx = 0; dx < p.w; dx++) {
        const tx = p.x + dx;
        if (tx > 0 && tx < widthTiles - 1 && p.y > 1 && p.y < floorRow) {
          grid[p.y][tx] = '-';
        }
      }
    }
  }

  // Optional breakable marble accents
  if (options?.marblePillars) {
    for (const mp of options.marblePillars) {
      for (let dy = 0; dy < mp.h; dy++) {
        const ty = mp.y - dy;
        if (mp.x > 1 && mp.x < widthTiles - 2 && ty > 1 && ty < floorRow) {
          grid[ty][mp.x] = 'm';
        }
      }
    }
  }

  return {
    id,
    name,
    theme,
    widthTiles,
    heightTiles,
    rows: grid.map((r) => r.join('')),
    spawnX: 160,
    spawnY: floorRow * 32,
    doors: [],
    spawns: [],
  };
}

export const BOSSES: Record<BossId, BossDef> = {
  b_artiste: {
    id: 'b_artiste',
    name: 'Artiste Bell',
    title: 'The Sculpting Sensation',
    floor: 1,
    tollCash: 100,
    theme: 'boss_gallery',
    music: 'boss_artiste',
    maxHp: 10,
    phases: [
      {
        phase: 1,
        hpThreshold: 10,
        name: 'Gallery Warmup',
        speedMult: 1.0,
        attacks: ['shoulder_charge', 'statue_drop', 'bounce_slam'],
      },
      {
        phase: 2,
        hpThreshold: 5,
        name: 'Masterpiece Frenzy',
        speedMult: 1.32,
        attacks: ['shoulder_charge', 'bowling_marble', 'statue_drop', 'bounce_slam'],
      },
    ],
    room: buildArenaRoom('boss_artiste_arena', 'Artiste Gallery', 'boss_gallery', 30, 17, {
      platforms: [
        { x: 5, y: 10, w: 4 },
        { x: 21, y: 10, w: 4 },
      ],
    }),
  },

  b_cheddar: {
    id: 'b_cheddar',
    name: 'Sheriff Cheddar',
    title: 'Outlaw of the Mesa',
    floor: 2,
    tollCash: 150,
    theme: 'boss_canyon',
    music: 'boss_cheddar',
    maxHp: 9,
    givesRevolver: true,
    phases: [
      {
        phase: 1,
        hpThreshold: 9,
        name: 'High Noon Showdown',
        speedMult: 1.05,
        attacks: ['quick_draw', 'dynamite_toss', 'boot_dash'],
      },
      {
        phase: 2,
        hpThreshold: 4,
        name: 'Dynamite Desperado',
        speedMult: 1.35,
        attacks: ['fan_hammer', 'dynamite_toss', 'flame_sweep', 'boot_dash'],
      },
    ],
    room: buildArenaRoom('boss_cheddar_arena', 'Sundown Canyon', 'boss_canyon', 30, 17, {
      platforms: [
        { x: 6, y: 10, w: 5 },
        { x: 19, y: 10, w: 5 },
      ],
    }),
  },

  b_static: {
    id: 'b_static',
    name: 'The Static',
    staticName: 'The Glitch',
    title: 'Channel-Hopping Chaos',
    floor: 3,
    tollCash: 200,
    theme: 'boss_studio',
    music: 'boss_static',
    maxHp: 8,
    phases: [
      {
        phase: 1,
        hpThreshold: 8,
        name: 'Prime Time Pranks',
        speedMult: 1.15,
        attacks: ['skate_blitz', 'bomb_volley', 'spring_pogo'],
      },
      {
        phase: 2,
        hpThreshold: 4,
        name: 'Overdrive Broadcast',
        speedMult: 1.45,
        attacks: ['skate_blitz', 'bomb_volley', 'spring_pogo', 'air_dive'],
      },
    ],
    room: buildArenaRoom('boss_static_arena', 'Broadcast Stage 3', 'boss_studio', 30, 17, {
      platforms: [
        { x: 4, y: 10, w: 5 },
        { x: 12, y: 8, w: 6 },
        { x: 21, y: 10, w: 5 },
      ],
    }),
  },

  b_doppel: {
    id: 'b_doppel',
    name: 'Doppel-Peppo',
    title: 'Uncanny Kitchen Twin',
    floor: 4,
    tollCash: 210,
    theme: 'boss_doppel',
    music: 'boss_doppel',
    maxHp: 6,
    hasEscapePhase: true,
    phases: [
      {
        phase: 1,
        hpThreshold: 6,
        name: 'Mirror Mach',
        speedMult: 1.15,
        attacks: ['copy_dash', 'head_toss', 'super_slam'],
      },
      {
        phase: 2,
        hpThreshold: 3,
        name: 'Melty Meltdown',
        speedMult: 1.45,
        attacks: ['copy_dash', 'head_toss', 'super_slam', 'double_lunge'],
      },
    ],
    room: buildArenaRoom('boss_doppel_arena', 'Mirrored Kitchen Hall', 'boss_doppel', 34, 17, {
      platforms: [
        { x: 8, y: 10, w: 5 },
        { x: 21, y: 10, w: 5 },
      ],
    }),
  },

  b_megacrust: {
    id: 'b_megacrust',
    name: 'Mega-Crust & Lord Dough',
    title: 'Sovereigns of Krunked Tower',
    floor: 5,
    tollCash: 0,
    theme: 'boss_summit',
    music: 'boss_megacrust',
    maxHp: 8,
    phase2Hp: 8,
    phase3Hp: 6,
    phases: [
      {
        phase: 1,
        hpThreshold: 8,
        name: 'Phase 1 — Mega-Crust',
        speedMult: 1.0,
        attacks: ['hover_slam', 'cog_shower', 'swoop_charge'],
      },
      {
        phase: 2,
        hpThreshold: 8,
        name: 'Phase 2 — Lord Dough',
        speedMult: 1.25,
        attacks: ['tv_toss', 'spring_charge', 'cog_shower', 'hover_slam'],
      },
      {
        phase: 3,
        hpThreshold: 6,
        name: 'Phase 3 — Tower Showdown',
        speedMult: 1.5,
        attacks: ['tv_toss', 'swoop_charge', 'hover_slam', 'final_barrage'],
      },
    ],
    room: buildArenaRoom('boss_summit_arena', 'Krunked Tower Summit', 'boss_summit', 32, 17, {
      platforms: [
        { x: 5, y: 10, w: 5 },
        { x: 13, y: 8, w: 6 },
        { x: 22, y: 10, w: 5 },
      ],
    }),
  },
};

export function getBossDef(id: BossId): BossDef {
  return BOSSES[id];
}
