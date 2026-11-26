// ============================================================================
// Krunked Tower — All 5 Boss Definitions & Clean-Room Arenas
// Pure declarative data — ZERO DOM or RNG calls.
// ============================================================================

import type { BossDef, BossId, RoomDef, RoomThemeId } from '../contracts/index';

interface ArenaOptions {
  platforms?: Array<{ x: number; y: number; w: number }>;
  marblePillars?: Array<{ x: number; y: number; h: number }>;
  pillarGates?: Array<{ x: number; yTop: number; yBot: number }>;
  slopes?: Array<{ x: number; y: number; ch: '/' | '\\' }>;
  spawnX?: number;
  isEscapeChase?: boolean;
}

function buildArenaRoom(
  id: string,
  name: string,
  theme: RoomThemeId,
  widthTiles: number,
  heightTiles: number,
  options?: ArenaOptions,
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

  // Optional breakable marble accents / hurdles
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

  // Optional escape-flipping pillar gates ('P' = solid until state.escape.active!)
  if (options?.pillarGates) {
    for (const pg of options.pillarGates) {
      for (let ty = pg.yTop; ty <= pg.yBot; ty++) {
        if (pg.x > 1 && pg.x < widthTiles - 2 && ty > 0 && ty < floorRow) {
          grid[ty][pg.x] = 'P';
        }
      }
    }
  }

  // Optional 45-degree speed ramps
  if (options?.slopes) {
    for (const sl of options.slopes) {
      if (sl.x > 1 && sl.x < widthTiles - 2 && sl.y > 1 && sl.y < floorRow) {
        grid[sl.y][sl.x] = sl.ch;
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
    spawnX: options?.spawnX ?? 160,
    spawnY: floorRow * 32,
    doors: [],
    spawns: [],
    isEscapeChase: options?.isEscapeChase,
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
        attacks: ['shoulder_charge', 'bowling_marble', 'bounce_slam'],
      },
      {
        phase: 2,
        hpThreshold: 5,
        name: 'Masterpiece Frenzy',
        speedMult: 1.32,
        attacks: [
          'shoulder_charge',
          'statue_drop',
          'double_bounce_slam',
          'bowling_marble',
          'smug_pose',
        ],
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
        attacks: ['bazooka_shot', 'dynamite_toss', 'flame_dash'],
      },
      {
        phase: 2,
        hpThreshold: 4,
        name: 'Dynamite Desperado',
        speedMult: 1.35,
        attacks: ['cow_stampede', 'dynamite_volley', 'flame_dash', 'bazooka_shot'],
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
        attacks: ['skate_blitz', 'spring_pogo', 'bomb_toss'],
      },
      {
        phase: 2,
        hpThreshold: 4,
        name: 'Overdrive Broadcast',
        speedMult: 1.42,
        attacks: ['jetpack_dive', 'balloon_barrage', 'minion_spawn', 'skate_blitz'],
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
        speedMult: 1.18,
        attacks: ['copy_dash', 'super_slam', 'head_toss', 'clone_surge'],
      },
      {
        phase: 2,
        hpThreshold: 0,
        name: 'Hallway Escape Chase',
        speedMult: 1.48,
        attacks: ['hallway_chase'],
      },
    ],
    // Phase 1 fights inside cols 0..30; when HP hits 0, the Pillar Gate ('P') at col 30 shatters
    // and unveils a high-speed 54-tile Hallway Escape Chase to the right exit door!
    room: buildArenaRoom('boss_doppel_arena', 'Mirrored Kitchen Hall', 'boss_doppel', 84, 17, {
      platforms: [
        // Phase 1 battle platforms
        { x: 6, y: 10, w: 5 },
        { x: 19, y: 10, w: 5 },
        // Phase 2 hallway escape catwalks
        { x: 35, y: 10, w: 5 },
        { x: 47, y: 9, w: 6 },
        { x: 60, y: 10, w: 5 },
        { x: 71, y: 10, w: 5 },
      ],
      pillarGates: [{ x: 30, yTop: 1, yBot: 13 }],
      marblePillars: [
        { x: 41, y: 13, h: 2 },
        { x: 55, y: 13, h: 2 },
        { x: 68, y: 13, h: 2 },
      ],
      isEscapeChase: true,
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
        attacks: ['moon_drop', 'moon_swoop', 'moon_drop', 'moon_cog'],
      },
      {
        phase: 2,
        hpThreshold: 8,
        name: 'Phase 2 — Lord Dough',
        speedMult: 1.25,
        attacks: ['tv_toss', 'cog_shower', 'gatling_pellet', 'boot_stomp'],
      },
      {
        phase: 3,
        hpThreshold: 6,
        name: 'Phase 3 — Boss Rush Finale',
        speedMult: 1.48,
        attacks: ['cameo_artiste', 'cameo_cheddar', 'cameo_static'],
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
