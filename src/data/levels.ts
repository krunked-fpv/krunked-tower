// ============================================================================
// Krunked Tower — All 23 Bespoke Stages + 5 Physical Tower Floor Hubs
// Every stage features handcrafted multi-room layouts, signature gimmicks,
// escape-flip return highways, 3 secret challenges, and exact oracle targets.
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// CLEAN-ROOM IP FIREWALL — ZERO third-party proper nouns.
// ============================================================================

import type {
  EnemyArchetypeId,
  FloorId,
  LevelDef,
  PickupState,
  RoomDef,
  RoomEntitySpawn,
  RoomThemeId,
  StageId,
  TransformationId,
} from '../contracts/index';

const T = 32;
const px = (tileX: number): number => tileX * T + 16;
const groundY = (floorRow: number): number => floorRow * T;

// ----------------------------------------------------------------------------
// Deterministic ASCII Grid Builder (guarantees exact widthTiles x heightTiles)
// Legend:
//   '.'=EMPTY '#' =SOLID '-'=ONE_WAY '/'=SLOPE_45_UP_RIGHT '\'=SLOPE_45_UP_LEFT
//   'a'=SLOPE_26_LOW_RIGHT 'b'=SLOPE_26_HIGH_RIGHT
//   'c'=SLOPE_26_HIGH_LEFT 'd'=SLOPE_26_LOW_LEFT
//   'm'=BREAK_MARBLE 'M'=BREAK_METAL 'P'=PILLAR_CLOSED 'O'=PILLAR_OPEN
//   'I'=ICE_SOLID '>'=CONVEYOR_RIGHT '<'=CONVEYOR_LEFT 'L'=LAVA '^'=SPIKE
//   'C'=CHEESE_STICK_WALL 'G'=OUTLET_GATE 'S'=SECRET_WALL
// ----------------------------------------------------------------------------
class RoomGrid {
  readonly w: number;
  readonly h: number;
  readonly cells: string[][];

  constructor(w: number, h: number, floorRow: number) {
    this.w = w;
    this.h = h;
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
    // Outer frame
    this.fillRect(0, 0, w, 1, '#');
    this.fillRect(0, floorRow, w, h - floorRow, '#');
    this.fillRect(0, 0, 1, h, '#');
    this.fillRect(w - 1, 0, 1, h, '#');
  }

  get(x: number, y: number): string {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return '#';
    return this.cells[y][x];
  }

  set(x: number, y: number, ch: string): this {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
      this.cells[y][x] = ch;
    }
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number, ch: string): this {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, ch);
      }
    }
    return this;
  }

  carve(x: number, y: number, w: number, h: number): this {
    return this.fillRect(x, y, w, h, '.');
  }

  oneWay(x: number, y: number, w: number): this {
    return this.fillRect(x, y, w, 1, '-');
  }

  /** 45° ramp rising rightwards from baseFloorRow up by `steps` tiles */
  slope45UpRight(startX: number, baseFloorRow: number, steps: number): this {
    for (let i = 0; i < steps; i++) {
      const tx = startX + i;
      const ty = baseFloorRow - 1 - i;
      this.set(tx, ty, '/');
      this.fillRect(tx, ty + 1, 1, this.h - (ty + 1), '#');
    }
    return this;
  }

  /** 45° ramp descending rightwards from topDeckRow down by `steps` tiles */
  slope45DownRight(startX: number, topDeckRow: number, steps: number): this {
    for (let i = 0; i < steps; i++) {
      const tx = startX + i;
      const ty = topDeckRow + i;
      this.set(tx, ty, '\\');
      this.fillRect(tx, ty + 1, 1, this.h - (ty + 1), '#');
    }
    return this;
  }

  /** 26.5° gentle ramp rising rightwards by `riseTiles` (width = 2 * riseTiles) */
  slope26UpRight(startX: number, baseFloorRow: number, riseTiles: number): this {
    for (let i = 0; i < riseTiles; i++) {
      const tx = startX + i * 2;
      const ty = baseFloorRow - 1 - i;
      this.set(tx, ty, 'a');
      this.set(tx + 1, ty, 'b');
      this.fillRect(tx, ty + 1, 2, this.h - (ty + 1), '#');
    }
    return this;
  }

  /** 26.5° gentle ramp descending rightwards by `dropTiles` (width = 2 * dropTiles) */
  slope26DownRight(startX: number, topDeckRow: number, dropTiles: number): this {
    for (let i = 0; i < dropTiles; i++) {
      const tx = startX + i * 2;
      const ty = topDeckRow + i;
      this.set(tx, ty, 'c');
      this.set(tx + 1, ty, 'd');
      this.fillRect(tx, ty + 1, 2, this.h - (ty + 1), '#');
    }
    return this;
  }

  /** Solid elevated plateau spanning [startX, startX + w) with surface at topRow */
  plateau(startX: number, topRow: number, w: number, baseFloorRow: number, fill = '#'): this {
    return this.fillRect(startX, topRow, w, Math.max(1, baseFloorRow - topRow), fill);
  }

  isOpenCell(tx: number, ty: number): boolean {
    const c = this.get(tx, ty);
    return c === '.' || c === '-';
  }

  toRows(): string[] {
    return this.cells.map((row) => row.join(''));
  }
}

/**
 * Geometry-aware pickup trail: places pickups ONLY in open air (never inside
 * solids, breakables, pillars, hazards, or slopes), gently lifting above slopes.
 */
function addSafeTrail(
  g: RoomGrid,
  spawns: RoomEntitySpawn[],
  pickupKind: PickupState['kind'],
  startTileX: number,
  count: number,
  floorRow: number,
  step = 2,
): void {
  const yOff = pickupKind === 'small_topping' ? 18 : 20;
  for (let i = 0; i < count; i++) {
    const tx = startTileX + i * step;
    if (tx <= 1 || tx >= g.w - 2) continue;
    let row = floorRow;
    while (row > 2 && !g.isOpenCell(tx, row - 1)) {
      row -= 1;
    }
    if (g.isOpenCell(tx, row - 1)) {
      spawns.push({
        kind: 'pickup',
        pickupKind,
        x: px(tx),
        y: groundY(row) - yOff,
      });
    }
  }
}

function addTotem(
  spawns: RoomEntitySpawn[],
  tileX: number,
  floorRow: number,
  transformation: TransformationId,
  label: string,
  escapeOnly = false,
): void {
  spawns.push({
    kind: 'prop',
    propKind: 'transform_totem',
    x: px(tileX),
    y: groundY(floorRow),
    transformation,
    label,
    escapeOnly: escapeOnly || undefined,
  });
}

function addSecretEye(
  spawns: RoomEntitySpawn[],
  index: number,
  tileX: number,
  floorRow: number,
  targetRoomIndex: number,
  label: string,
): void {
  spawns.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index,
    x: px(tileX),
    y: groundY(floorRow),
    targetRoomIndex,
    targetX: px(3),
    targetY: groundY(13),
    label,
  });
}

// ============================================================================
// FLAGSHIP 1: TUTORIAL — Boot Camp Kitchen
// ============================================================================
function buildTutorialLevel(): LevelDef {
  const floorRow = 18;
  const g = new RoomGrid(124, 22, floorRow);
  const spawns: RoomEntitySpawn[] = [];

  // Zone 1: Jump & Mach intro (x=3..22)
  spawns.push({
    kind: 'prop',
    propKind: 'tutorial_sign',
    x: px(6),
    y: groundY(floorRow),
    label: 'HOLD MACH TO SPRINT — PRESS JUMP TO LEAP!',
  });
  g.oneWay(12, 15, 4);
  addSafeTrail(g, spawns, 'small_topping', 8, 5, floorRow, 2);
  addSafeTrail(g, spawns, 'big_topping', 13, 2, 15, 2);

  // Zone 2: Slopes & Marble Smash (x=22..48)
  spawns.push({
    kind: 'prop',
    propKind: 'tutorial_sign',
    x: px(22),
    y: groundY(floorRow),
    label: 'RIDE SLOPES & SMASH MARBLE AT MACH 2 OR GRAB!',
  });
  g.slope26UpRight(24, floorRow, 2);
  g.plateau(28, 16, 8, floorRow);
  g.fillRect(31, 13, 2, 3, 'm');
  g.slope45DownRight(36, 16, 2);
  g.fillRect(42, 14, 2, 4, 'm');
  addSafeTrail(g, spawns, 'small_topping', 25, 6, 15, 2);
  addSafeTrail(g, spawns, 'big_topping', 39, 3, floorRow, 2);

  // Zone 3: Wall-Climb Shaft (x=48..66)
  spawns.push({
    kind: 'prop',
    propKind: 'tutorial_sign',
    x: px(48),
    y: groundY(floorRow),
    label: 'RUN AT WALLS IN MACH 2+ TO WALL-CLIMB!',
  });
  g.plateau(54, 11, 12, floorRow);
  g.oneWay(50, 15, 3);
  g.oneWay(50, 12, 3);
  addSafeTrail(g, spawns, 'big_topping', 56, 3, 11, 2);
  g.slope45DownRight(66, 11, 7);
  addSafeTrail(g, spawns, 'small_topping', 67, 5, 13, 2);

  // Zone 4: Metal Blocks & Superjump Chimney (x=74..94)
  spawns.push({
    kind: 'prop',
    propKind: 'tutorial_sign',
    x: px(75),
    y: groundY(floorRow),
    label: 'MACH 3 SMASHES METAL — HOLD UP + RELEASE TO SUPERJUMP!',
  });
  g.fillRect(79, 14, 2, 4, 'M');
  g.fillRect(83, 11, 4, 1, '#');
  g.fillRect(87, 11, 3, 1, 'M');
  g.fillRect(90, 11, 4, 1, '#');
  g.oneWay(87, 7, 6);
  addSafeTrail(g, spawns, 'big_topping', 88, 3, 7, 2);
  addSafeTrail(g, spawns, 'small_topping', 84, 5, floorRow, 2);

  // Zone 5: Enemies, Grab/Throw & Taunt Parry Dojo (x=95..112)
  spawns.push({
    kind: 'prop',
    propKind: 'tutorial_sign',
    x: px(96),
    y: groundY(floorRow),
    label: 'GRAB ENEMIES OR PRESS TAUNT RIGHT BEFORE A HIT TO PARRY!',
  });
  spawns.push({ kind: 'enemy', archetype: 'slime_glob', x: px(101), y: groundY(floorRow) });
  spawns.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(108), y: groundY(floorRow) });
  addSafeTrail(g, spawns, 'big_topping', 102, 3, 15, 3);

  // Zone 6: Bodyslam Marble Floor & Exit Door (x=112..123)
  g.fillRect(114, 15, 2, 3, 'm');
  spawns.push({
    kind: 'prop',
    propKind: 'exit_door',
    x: px(120),
    y: groundY(floorRow),
    label: 'GRADUATE BOOT CAMP',
  });

  const room: RoomDef = {
    id: 'tutorial_main',
    name: 'Boot Camp Kitchen',
    theme: 'crypt',
    widthTiles: g.w,
    heightTiles: g.h,
    rows: g.toRows(),
    spawnX: px(3),
    spawnY: groundY(floorRow),
    doors: [],
    spawns,
  };

  return {
    id: 'tutorial',
    name: 'Boot Camp Kitchen',
    subtitle: 'Master Mach, Slopes, Wall-Climb, Superjump & Parry',
    floor: 0,
    theme: 'crypt',
    music: 'tutorial',
    sRankScore: 4000,
    escapeSeconds: 0,
    hasPillar: false,
    hasLap2: false,
    featuredGimmick: 'Full Kinetic Moveset Training',
    rooms: [room],
  };
}

// ============================================================================
// Helper for Themed Secret Rooms (48x16 punchy kinetic challenges)
// ============================================================================
type SecretStyle =
  | 'marble_dash'
  | 'slope_jump'
  | 'superjump_vault'
  | 'gimmick_dash'
  | 'vertical_shaft';

function buildSecretRoom(
  id: string,
  name: string,
  theme: RoomThemeId,
  secretIndex: number,
  returnRoomIndex: number,
  returnX: number,
  returnY: number,
  style: SecretStyle,
  enemyArchetype: EnemyArchetypeId,
  totem?: TransformationId,
): RoomDef {
  const floorRow = 13;
  const g = new RoomGrid(48, 16, floorRow);
  const spawns: RoomEntitySpawn[] = [];

  if (totem) {
    addTotem(spawns, 6, floorRow, totem, totem.toUpperCase());
  }

  if (style === 'marble_dash') {
    g.fillRect(12, 9, 2, 4, 'm');
    g.fillRect(20, 9, 2, 4, 'm');
    g.fillRect(28, 9, 2, 4, 'M');
    g.fillRect(36, 9, 2, 4, 'm');
    addSafeTrail(g, spawns, 'small_topping', 8, 14, floorRow, 2);
    addSafeTrail(g, spawns, 'big_topping', 15, 5, 10, 4);
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(17), y: groundY(floorRow) });
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(25), y: groundY(floorRow) });
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(33), y: groundY(floorRow) });
  } else if (style === 'slope_jump') {
    g.slope45UpRight(9, floorRow, 3);
    g.plateau(12, 10, 5, floorRow);
    g.slope45DownRight(17, 10, 3);
    g.fillRect(22, floorRow, 5, 1, '^');
    g.oneWay(22, 10, 5);
    g.slope26UpRight(29, floorRow, 2);
    g.plateau(33, 11, 4, floorRow);
    g.slope26DownRight(37, 11, 2);
    addSafeTrail(g, spawns, 'big_topping', 12, 5, 9, 5);
    addSafeTrail(g, spawns, 'small_topping', 19, 10, 9, 2);
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(35), y: groundY(11) });
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(24), y: groundY(10) });
  } else if (style === 'superjump_vault') {
    g.fillRect(14, 8, 4, 1, '#');
    g.fillRect(18, 8, 4, 1, 'M');
    g.fillRect(22, 8, 6, 1, '#');
    g.oneWay(11, 10, 3);
    g.oneWay(17, 5, 16);
    addSafeTrail(g, spawns, 'big_topping', 18, 6, 5, 2);
    addSafeTrail(g, spawns, 'small_topping', 10, 12, floorRow, 2);
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(26), y: groundY(floorRow) });
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(32), y: groundY(floorRow) });
  } else if (style === 'gimmick_dash') {
    g.slope45DownRight(10, 10, 3);
    g.plateau(7, 10, 3, floorRow);
    g.oneWay(4, 11, 3);
    g.fillRect(18, 9, 2, 4, 'M');
    g.fillRect(26, 9, 2, 4, 'M');
    g.fillRect(34, 9, 2, 4, 'm');
    addSafeTrail(g, spawns, 'big_topping', 15, 7, floorRow, 3);
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(23), y: groundY(floorRow) });
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(31), y: groundY(floorRow) });
  } else {
    // vertical_shaft
    g.oneWay(10, 10, 8);
    g.oneWay(20, 7, 10);
    g.oneWay(32, 10, 8);
    g.fillRect(18, floorRow, 12, 1, '^');
    addSafeTrail(g, spawns, 'big_topping', 11, 3, 10, 2);
    addSafeTrail(g, spawns, 'big_topping', 21, 4, 7, 2);
    addSafeTrail(g, spawns, 'big_topping', 33, 3, 10, 2);
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(24), y: groundY(7) });
  }

  if (totem) {
    addTotem(spawns, 41, floorRow, 'none', 'RESET FORM');
  }

  return {
    id,
    name,
    theme,
    widthTiles: g.w,
    heightTiles: g.h,
    rows: g.toRows(),
    spawnX: px(3),
    spawnY: groundY(floorRow),
    isSecretRoom: true,
    secretIndex,
    doors: [
      {
        id: `${id}_exit`,
        x: px(44),
        y: groundY(floorRow),
        targetRoomIndex: returnRoomIndex,
        targetX: returnX,
        targetY: returnY,
        requireUp: false,
        label: 'EXIT SECRET',
      },
    ],
    spawns,
  };
}

// ============================================================================
// FLAGSHIP 2: ENTRANCE — Gutter Crypt (4 Main Rooms + 3 Secret Rooms)
// Oracle: sRankScore = 16000, escapeSeconds = 155
// ============================================================================
function buildEntranceLevel(): LevelDef {
  // ---- Room 0: Crypt Foyer & Entry Runway (96x22) ----
  const r0Floor = 18;
  const g0 = new RoomGrid(96, 22, r0Floor);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(r0Floor), label: 'EXIT GUTTER CRYPT' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(7), y: groundY(r0Floor), label: 'LAP 2 PORTAL' });

  g0.slope26UpRight(16, r0Floor, 2);
  g0.plateau(20, 16, 14, r0Floor);
  g0.fillRect(25, 13, 2, 3, 'm');
  g0.slope45DownRight(34, 16, 2);

  g0.oneWay(20, 11, 24);
  g0.fillRect(44, 7, 2, 4, 'P');
  g0.oneWay(46, 11, 22);

  g0.fillRect(46, 14, 2, 4, 'm');
  g0.oneWay(52, 14, 8);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(56), y: groundY(14), label: 'SHROOM PAL' });

  g0.fillRect(72, 11, 1, 3, 'S');
  g0.oneWay(73, 14, 7);
  addSecretEye(s0, 0, 76, 14, 4, 'SECRET 1');

  g0.slope45UpRight(80, r0Floor, 2);
  g0.plateau(82, 16, 13, r0Floor);

  addSafeTrail(g0, s0, 'small_topping', 10, 3, r0Floor, 2);
  addSafeTrail(g0, s0, 'small_topping', 21, 4, 16, 2);
  addSafeTrail(g0, s0, 'big_topping', 22, 3, 15, 4);
  addSafeTrail(g0, s0, 'small_topping', 38, 8, r0Floor, 2);
  addSafeTrail(g0, s0, 'big_topping', 26, 4, 11, 6);
  s0.push({ kind: 'enemy', archetype: 'slime_glob', x: px(29), y: groundY(16) });
  s0.push({ kind: 'enemy', archetype: 'fork_imp', x: px(42), y: groundY(r0Floor) });
  s0.push({ kind: 'enemy', archetype: 'slime_glob', x: px(63), y: groundY(r0Floor) });
  s0.push({ kind: 'enemy', archetype: 'swedish_ape', x: px(70), y: groundY(r0Floor) });
  s0.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(55), y: groundY(11), escapeOnly: true });

  const room0: RoomDef = {
    id: 'entrance_r0',
    name: 'Gutter Crypt — Foyer',
    theme: 'crypt',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(r0Floor),
    doors: [
      {
        id: 'ent_0_to_1',
        x: px(93),
        y: groundY(16),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(15),
        requireUp: false,
        label: 'MARBLE HALL',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Marble Hall & Mach 4 Slope Expressway (110x24) ----
  const r1Floor = 20;
  const g1 = new RoomGrid(110, 24, r1Floor);
  const s1: RoomEntitySpawn[] = [];

  g1.plateau(1, 15, 11, r1Floor);
  g1.slope45DownRight(12, 15, 5);

  g1.fillRect(23, 16, 2, 4, 'm');
  g1.fillRect(32, 16, 2, 4, 'M');
  g1.fillRect(42, 16, 2, 4, 'm');
  g1.fillRect(52, 16, 2, 4, 'M');

  g1.fillRect(62, 14, 10, 1, 'O');
  g1.oneWay(56, 16, 5);

  g1.oneWay(26, 13, 8);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(30), y: groundY(13), label: 'CHEESE PAL' });

  g1.fillRect(64, 17, 1, 3, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(68), y: groundY(r1Floor), label: 'JANITOR GERRY' });

  g1.plateau(74, 13, 14, r1Floor);
  g1.oneWay(70, 17, 3);
  g1.oneWay(70, 14, 3);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(78), y: groundY(13), label: 'TOMATO PAL' });
  s1.push({ kind: 'prop', propKind: 'treasure_chest', x: px(84), y: groundY(13), label: 'CRYPT TREASURE' });

  g1.oneWay(88, 10, 8);
  g1.fillRect(91, 7, 1, 3, 'S');
  addSecretEye(s1, 1, 94, 10, 5, 'SECRET 2');

  g1.slope26DownRight(88, 13, 4);
  g1.plateau(96, 17, 13, r1Floor);

  addSafeTrail(g1, s1, 'small_topping', 17, 10, r1Floor, 2);
  addSafeTrail(g1, s1, 'big_topping', 20, 5, 18, 8);
  addSafeTrail(g1, s1, 'big_topping', 75, 3, 12, 4);
  s1.push({ kind: 'enemy', archetype: 'slime_glob', x: px(28), y: groundY(r1Floor) });
  s1.push({ kind: 'enemy', archetype: 'swedish_ape', x: px(38), y: groundY(r1Floor) });
  s1.push({ kind: 'enemy', archetype: 'fork_imp', x: px(48), y: groundY(r1Floor) });
  s1.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(60), y: groundY(r1Floor) });
  s1.push({ kind: 'enemy', archetype: 'fork_imp', x: px(81), y: groundY(13) });
  s1.push({ kind: 'enemy', archetype: 'knight_squire', x: px(101), y: groundY(17), escapeOnly: true });

  const room1: RoomDef = {
    id: 'entrance_r1',
    name: 'Gutter Crypt — Marble Expressway',
    theme: 'crypt',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(15),
    doors: [
      {
        id: 'ent_1_to_0',
        x: px(2),
        y: groundY(15),
        targetRoomIndex: 0,
        targetX: px(90),
        targetY: groundY(16),
        requireUp: false,
        label: 'TO FOYER',
      },
      {
        id: 'ent_1_to_2',
        x: px(107),
        y: groundY(17),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'CHIMNEY VAULT',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Vertical Wall-Climb & Superjump Chimney (96x26) ----
  const r2Floor = 22;
  const g2 = new RoomGrid(96, 26, r2Floor);
  const s2: RoomEntitySpawn[] = [];

  g2.fillRect(18, 18, 2, 4, 'm');
  g2.fillRect(28, 14, 6, 1, '#');
  g2.fillRect(34, 14, 4, 1, 'M');
  g2.fillRect(38, 14, 8, 1, '#');
  g2.oneWay(24, 18, 3);
  g2.oneWay(24, 15, 3);

  g2.oneWay(32, 10, 20);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(42), y: groundY(10), label: 'SAUSAGE PAL' });

  g2.oneWay(54, 8, 12);
  g2.fillRect(58, 5, 1, 3, 'S');
  addSecretEye(s2, 2, 62, 8, 6, 'SECRET 3');

  g2.fillRect(52, 18, 2, 4, 'M');
  g2.slope26UpRight(62, r2Floor, 3);
  g2.plateau(68, 19, 10, r2Floor);
  g2.fillRect(72, 15, 2, 4, 'P');
  g2.slope45DownRight(78, 19, 3);

  addSafeTrail(g2, s2, 'small_topping', 8, 10, r2Floor, 2);
  addSafeTrail(g2, s2, 'big_topping', 34, 4, 10, 4);
  addSafeTrail(g2, s2, 'big_topping', 68, 3, 18, 3);
  s2.push({ kind: 'enemy', archetype: 'fork_imp', x: px(25), y: groundY(r2Floor) });
  s2.push({ kind: 'enemy', archetype: 'knight_squire', x: px(47), y: groundY(r2Floor) });
  s2.push({ kind: 'enemy', archetype: 'slime_glob', x: px(58), y: groundY(r2Floor) });
  s2.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(84), y: groundY(r2Floor) });
  s2.push({ kind: 'enemy', archetype: 'swedish_ape', x: px(48), y: groundY(10) });

  const room2: RoomDef = {
    id: 'entrance_r2',
    name: 'Gutter Crypt — Chimney Vault',
    theme: 'crypt',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(r2Floor),
    doors: [
      {
        id: 'ent_2_to_1',
        x: px(2),
        y: groundY(r2Floor),
        targetRoomIndex: 1,
        targetX: px(104),
        targetY: groundY(17),
        requireUp: false,
        label: 'TO EXPRESSWAY',
      },
      {
        id: 'ent_2_to_3',
        x: px(93),
        y: groundY(r2Floor),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(16),
        requireUp: false,
        label: 'PILLAR SANCTUM',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Pillar Chronos Sanctum (72x20) ----
  const r3Floor = 16;
  const g3 = new RoomGrid(72, 20, r3Floor);
  const s3: RoomEntitySpawn[] = [];

  g3.oneWay(18, 12, 10);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(23), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.slope26UpRight(32, r3Floor, 2);
  g3.plateau(36, 14, 8, r3Floor);
  g3.slope26DownRight(44, 14, 2);
  g3.fillRect(50, 12, 2, 4, 'm');

  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(63), y: groundY(r3Floor), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'small_topping', 10, 8, r3Floor, 2);
  addSafeTrail(g3, s3, 'big_topping', 37, 3, 13, 2);
  addSafeTrail(g3, s3, 'big_topping', 54, 3, r3Floor, 2);
  s3.push({ kind: 'enemy', archetype: 'slime_glob', x: px(16), y: groundY(r3Floor) });
  s3.push({ kind: 'enemy', archetype: 'fork_imp', x: px(40), y: groundY(14) });
  s3.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(56), y: groundY(r3Floor) });

  const room3: RoomDef = {
    id: 'entrance_r3',
    name: 'Gutter Crypt — Pillar Sanctum',
    theme: 'crypt',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(r3Floor),
    doors: [
      {
        id: 'ent_3_to_2',
        x: px(2),
        y: groundY(r3Floor),
        targetRoomIndex: 2,
        targetX: px(90),
        targetY: groundY(22),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const secret1 = buildSecretRoom('entrance_s1', 'Crypt Secret 1 — Marble Run', 'secret', 0, 0, px(74), groundY(14), 'marble_dash', 'slime_glob');
  const secret2 = buildSecretRoom('entrance_s2', 'Crypt Secret 2 — Slope Pit', 'secret', 1, 1, px(90), groundY(10), 'slope_jump', 'swedish_ape');
  const secret3 = buildSecretRoom('entrance_s3', 'Crypt Secret 3 — Superjump Attic', 'secret', 2, 2, px(56), groundY(8), 'superjump_vault', 'fork_imp');

  return {
    id: 'entrance',
    name: 'Gutter Crypt',
    subtitle: 'Floor 1 Flagship — Classic Mach Slopes & Marble Ruins',
    floor: 1,
    theme: 'crypt',
    music: 'stage_crypt',
    sRankScore: 16000,
    escapeSeconds: 155,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Mach Slopes, Wall-Climb & Pillar Escape Flip',
    rooms: [room0, room1, room2, room3, secret1, secret2, secret3],
  };
}

// ============================================================================
// FLOOR 1 STAGE 2: MEDIEVAL — Crust Keep (Knight Armor + Rolling Ball)
// Oracle: sRankScore = 20000, escapeSeconds = 170
// ============================================================================
function buildMedievalLevel(): LevelDef {
  // ---- Room 0: Castle Drawbridge & Knight Armory (102x22) ----
  const f0 = 18;
  const g0 = new RoomGrid(102, 22, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT CRUST KEEP' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 13, f0, 'knight', 'KNIGHT ARMOR');

  // Steep battlement climb & Knight downhill metal smash chain
  g0.slope45UpRight(18, f0, 4); // x=18..21 up to 14
  g0.plateau(22, 14, 10, f0);
  g0.slope45DownRight(32, 14, 4); // x=32..35 plunges to 18!
  g0.fillRect(40, 14, 2, 4, 'M');
  g0.fillRect(48, 14, 2, 4, 'M');
  g0.fillRect(56, 14, 2, 4, 'm');

  // High castle rafters with Toppin #0 & Secret Eye #1
  g0.oneWay(24, 10, 16);
  g0.oneWay(44, 10, 16);
  g0.fillRect(60, 7, 2, 3, 'P'); // Opens for escape return flight!
  g0.oneWay(62, 10, 16);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(50), y: groundY(10), label: 'SHROOM PAL' });

  g0.oneWay(74, 13, 10);
  g0.fillRect(77, 10, 1, 3, 'S');
  addSecretEye(s0, 0, 81, 13, 4, 'KEEP SECRET 1');

  addTotem(s0, 91, f0, 'none', 'REMOVE ARMOR');
  addSafeTrail(g0, s0, 'small_topping', 14, 10, f0, 2);
  addSafeTrail(g0, s0, 'big_topping', 24, 5, 10, 4);
  addSafeTrail(g0, s0, 'big_topping', 43, 5, f0, 5);
  s0.push({ kind: 'enemy', archetype: 'knight_squire', x: px(27), y: groundY(14) });
  s0.push({ kind: 'enemy', archetype: 'fork_imp', x: px(45), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'knight_squire', x: px(64), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(70), y: groundY(10), escapeOnly: true });

  const room0: RoomDef = {
    id: 'medieval_r0',
    name: 'Crust Keep — Castle Drawbridge',
    theme: 'keep',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'med_0_to_1',
        x: px(99),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(13),
        requireUp: false,
        label: 'JOUSTING RAMPARTS',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Jousting Ramparts — Huge 7-Tile Knight Plunge (114x24) ----
  const f1 = 20;
  const g1 = new RoomGrid(114, 24, f1);
  const s1: RoomEntitySpawn[] = [];

  g1.plateau(1, 13, 13, f1);
  addTotem(s1, 10, 13, 'knight', 'KNIGHT ARMOR');
  g1.slope45DownRight(14, 13, 7); // x=14..20 plunges 7 tiles to row 20!

  // Triple Metal fortress gates smashed in full Knight slide!
  g1.fillRect(26, 16, 2, 4, 'M');
  g1.fillRect(36, 16, 2, 4, 'M');
  g1.fillRect(46, 16, 2, 4, 'M');

  // Castle rafters catwalk: Toppin #1, Janitor Gerry, Secret Eye #2
  g1.oneWay(24, 13, 14);
  g1.oneWay(42, 11, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(49), y: groundY(11), label: 'CHEESE PAL' });

  g1.fillRect(58, 16, 1, 4, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(63), y: groundY(f1), label: 'JANITOR GERRY' });

  // Escape sky-bridge ('O') & rafter Secret #2
  g1.fillRect(62, 13, 14, 1, 'O');
  g1.oneWay(76, 10, 12);
  g1.fillRect(80, 7, 1, 3, 'S');
  addSecretEye(s1, 1, 84, 10, 5, 'KEEP SECRET 2');

  // Ramp up to Ball Dungeon door
  g1.slope26UpRight(84, f1, 3); // x=84..89 rises to 17
  g1.plateau(90, 17, 23, f1);
  addTotem(s1, 102, 17, 'none', 'REMOVE ARMOR');

  addSafeTrail(g1, s1, 'small_topping', 15, 14, f1, 2);
  addSafeTrail(g1, s1, 'big_topping', 28, 6, 13, 4);
  addSafeTrail(g1, s1, 'big_topping', 92, 4, 17, 3);
  s1.push({ kind: 'enemy', archetype: 'knight_squire', x: px(32), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'knight_squire', x: px(42), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'fork_imp', x: px(54), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(74), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'knight_squire', x: px(97), y: groundY(17), escapeOnly: true });

  const room1: RoomDef = {
    id: 'medieval_r1',
    name: 'Crust Keep — Jousting Ramparts',
    theme: 'keep',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(13),
    doors: [
      {
        id: 'med_1_to_0',
        x: px(2),
        y: groundY(13),
        targetRoomIndex: 0,
        targetX: px(96),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO DRAWBRIDGE',
      },
      {
        id: 'med_1_to_2',
        x: px(111),
        y: groundY(17),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(14),
        requireUp: false,
        label: 'ROLLING BALL VAULT',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Rolling Ball Dungeon & Castle Rafters (106x24) ----
  const f2 = 20;
  const g2 = new RoomGrid(106, 24, f2);
  const s2: RoomEntitySpawn[] = [];

  g2.plateau(1, 14, 12, f2);
  addTotem(s2, 10, 14, 'ball', 'ROLLING BALL');
  g2.slope45DownRight(13, 14, 6); // x=13..18 launches Cheese Ball to row 20!

  // Ball smash alley: Metal & Marble pins!
  g2.fillRect(24, 16, 2, 4, 'M');
  g2.fillRect(34, 16, 2, 4, 'm');
  g2.fillRect(44, 16, 2, 4, 'M');
  g2.slope26UpRight(50, f2, 3); // x=50..55 rises to 17
  g2.plateau(56, 17, 14, f2);
  g2.fillRect(62, 13, 2, 4, 'M');
  g2.slope45DownRight(70, 17, 3); // x=70..72 drops to 20

  // Rafters holding Toppin #2, Toppin #3, Treasure Chest & Escape P shortcut
  g2.oneWay(26, 13, 14);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(32), y: groundY(13), label: 'TOMATO PAL' });
  g2.oneWay(54, 11, 20);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(64), y: groundY(11), label: 'KEEP TREASURE' });
  g2.oneWay(78, 14, 12);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(84), y: groundY(14), label: 'SAUSAGE PAL' });
  g2.fillRect(76, 16, 2, 4, 'P');

  addTotem(s2, 95, f2, 'none', 'RESET FORM');
  addSafeTrail(g2, s2, 'small_topping', 19, 12, f2, 2);
  addSafeTrail(g2, s2, 'big_topping', 56, 5, 11, 3);
  addSafeTrail(g2, s2, 'big_topping', 78, 4, f2, 4);
  s2.push({ kind: 'enemy', archetype: 'fork_imp', x: px(30), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'knight_squire', x: px(40), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(66), y: groundY(17) });
  s2.push({ kind: 'enemy', archetype: 'knight_squire', x: px(88), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'medieval_r2',
    name: 'Crust Keep — Rolling Ball Vault',
    theme: 'keep',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(14),
    doors: [
      {
        id: 'med_2_to_1',
        x: px(2),
        y: groundY(14),
        targetRoomIndex: 1,
        targetX: px(108),
        targetY: groundY(17),
        requireUp: false,
        label: 'TO RAMPARTS',
      },
      {
        id: 'med_2_to_3',
        x: px(103),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'BELFRY SANCTUM',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Belfry Sanctum (80x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(80, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  addTotem(s3, 12, f3, 'knight', 'KNIGHT ARMOR');
  g3.oneWay(18, 14, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(24), y: groundY(14), label: 'PINEAPPLE PAL' });
  g3.oneWay(32, 10, 12);
  g3.fillRect(36, 7, 1, 3, 'S');
  addSecretEye(s3, 2, 40, 10, 6, 'KEEP SECRET 3');

  g3.slope45UpRight(28, f3, 3);
  g3.plateau(31, 15, 10, f3);
  g3.slope45DownRight(41, 15, 3);
  g3.fillRect(48, 14, 2, 4, 'M');
  addTotem(s3, 56, f3, 'none', 'REMOVE ARMOR');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(69), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'small_topping', 14, 10, f3, 2);
  addSafeTrail(g3, s3, 'big_topping', 32, 4, 15, 2);
  addSafeTrail(g3, s3, 'big_topping', 58, 4, f3, 2);
  s3.push({ kind: 'enemy', archetype: 'knight_squire', x: px(36), y: groundY(15) });
  s3.push({ kind: 'enemy', archetype: 'fork_imp', x: px(53), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'medieval_r3',
    name: 'Crust Keep — Belfry Sanctum',
    theme: 'keep',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'med_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(100),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('medieval_s1', 'Keep Secret 1 — Knight Joust', 'keep', 0, 0, px(75), groundY(13), 'gimmick_dash', 'knight_squire', 'knight');
  const sec2 = buildSecretRoom('medieval_s2', 'Keep Secret 2 — Rafter Leap', 'keep', 1, 1, px(78), groundY(10), 'slope_jump', 'fork_imp');
  const sec3 = buildSecretRoom('medieval_s3', 'Keep Secret 3 — Ball Pinball', 'keep', 2, 3, px(34), groundY(10), 'gimmick_dash', 'pepper_goblin', 'ball');

  return {
    id: 'medieval',
    name: 'Crust Keep',
    subtitle: 'Knight Armor Slides, Rolling Balls & Castle Rafters',
    floor: 1,
    theme: 'keep',
    music: 'stage_keep',
    sRankScore: 20000,
    escapeSeconds: 170,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Knight Armor Slopes & Rolling Ball Chains',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 1 STAGE 3: RUIN — Cheddar Ruins (Bomb Carrier Demolition Vaults)
// Oracle: sRankScore = 17000, escapeSeconds = 180
// ============================================================================
function buildRuinLevel(): LevelDef {
  // ---- Room 0: Sunlit Courtyard & Ancient Vaults (100x22) ----
  const f0 = 18;
  const g0 = new RoomGrid(100, 22, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT CHEDDAR RUINS' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'bomb', 'BOMB CARRIER');

  // Ancient Marble & Metal vault chambers ready to be blasted open!
  g0.fillRect(22, 13, 3, 5, 'M');
  g0.fillRect(34, 13, 2, 5, 'm');
  g0.oneWay(26, 13, 8);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(30), y: groundY(13), label: 'SHROOM PAL' });

  addTotem(s0, 42, f0, 'bomb', 'BOMB CARRIER');
  g0.slope26UpRight(46, f0, 2);
  g0.plateau(50, 16, 14, f0);
  g0.fillRect(55, 12, 3, 4, 'M');
  g0.slope45DownRight(64, 16, 2);

  // Secret Eye #1 tucked in blasted upper shrine
  g0.oneWay(70, 11, 14);
  g0.fillRect(75, 8, 1, 3, 'S');
  addSecretEye(s0, 0, 79, 11, 4, 'RUIN SECRET 1');
  g0.fillRect(72, 14, 2, 4, 'P');

  addSafeTrail(g0, s0, 'small_topping', 16, 12, f0, 2);
  addSafeTrail(g0, s0, 'big_topping', 50, 5, 16, 3);
  addSafeTrail(g0, s0, 'big_topping', 76, 4, f0, 4);
  s0.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(30), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(60), y: groundY(16) });
  s0.push({ kind: 'enemy', archetype: 'slime_glob', x: px(82), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(86), y: groundY(f0), escapeOnly: true });

  const room0: RoomDef = {
    id: 'ruin_r0',
    name: 'Cheddar Ruins — Sunlit Courtyard',
    theme: 'ruins',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'ruin_0_to_1',
        x: px(97),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'CHEESE VAULTS',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Sunken Cheese Vaults (108x24) ----
  const f1 = 20;
  const g1 = new RoomGrid(108, 24, f1);
  const s1: RoomEntitySpawn[] = [];

  addTotem(s1, 10, f1, 'bomb', 'BOMB CARRIER');
  // Multi-tier bombable vault chamber!
  g1.fillRect(18, 15, 2, 5, 'M');
  g1.fillRect(28, 15, 2, 5, 'm');
  g1.oneWay(18, 15, 14);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(24), y: groundY(15), label: 'CHEESE PAL' });

  // Mid-room spike trench + upper vault holding Gerry & Toppin #2
  g1.fillRect(36, f1, 5, 1, '^');
  g1.oneWay(35, 16, 7);
  addTotem(s1, 46, f1, 'bomb', 'BOMB CARRIER');
  g1.fillRect(54, 15, 3, 5, 'M');
  g1.oneWay(52, 13, 16);
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(61), y: groundY(f1), label: 'JANITOR GERRY' });
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(60), y: groundY(13), label: 'TOMATO PAL' });

  // Upper secret alcove + escape speed bridge
  g1.oneWay(72, 10, 12);
  g1.fillRect(76, 7, 1, 3, 'S');
  addSecretEye(s1, 1, 80, 10, 5, 'RUIN SECRET 2');
  g1.fillRect(70, 15, 14, 1, 'O');

  addTotem(s1, 86, f1, 'bomb', 'BOMB CARRIER');
  g1.fillRect(94, 16, 2, 4, 'M');

  addSafeTrail(g1, s1, 'small_topping', 13, 10, f1, 2);
  addSafeTrail(g1, s1, 'big_topping', 53, 5, 13, 3);
  addSafeTrail(g1, s1, 'big_topping', 72, 4, f1, 4);
  s1.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(25), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(50), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(78), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'slime_glob', x: px(90), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'ruin_r1',
    name: 'Cheddar Ruins — Sunken Cheese Vaults',
    theme: 'ruins',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'ruin_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(94),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO COURTYARD',
      },
      {
        id: 'ruin_1_to_2',
        x: px(105),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'OBELISK TREASURY',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Obelisk Treasury & Spike Bridges (104x24) ----
  const f2 = 20;
  const g2 = new RoomGrid(104, 24, f2);
  const s2: RoomEntitySpawn[] = [];

  g2.slope45UpRight(12, f2, 3);
  g2.plateau(15, 17, 14, f2);
  addTotem(s2, 18, 17, 'bomb', 'BOMB CARRIER');
  g2.fillRect(25, 13, 2, 4, 'M');
  g2.slope45DownRight(29, 17, 3);

  g2.fillRect(36, f2, 6, 1, '^');
  g2.oneWay(35, 17, 8);
  g2.fillRect(36, 14, 6, 1, 'O');

  // Double-sealed Metal Treasury Vault holding Treasure Chest!
  addTotem(s2, 46, f2, 'bomb', 'BOMB CARRIER');
  g2.fillRect(54, 15, 3, 5, 'M');
  g2.fillRect(67, 15, 3, 5, 'M');
  g2.fillRect(54, 14, 16, 1, '#');
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(62), y: groundY(f2), label: 'RUIN TREASURE' });

  g2.oneWay(54, 10, 16);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(62), y: groundY(10), label: 'SAUSAGE PAL' });

  g2.oneWay(76, 11, 12);
  g2.fillRect(80, 8, 1, 3, 'S');
  addSecretEye(s2, 2, 84, 11, 6, 'RUIN SECRET 3');

  addSafeTrail(g2, s2, 'small_topping', 33, 8, 17, 2);
  addSafeTrail(g2, s2, 'big_topping', 56, 4, 10, 3);
  addSafeTrail(g2, s2, 'big_topping', 74, 5, f2, 4);
  s2.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(22), y: groundY(17) });
  s2.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(50), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(78), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'ruin_r2',
    name: 'Cheddar Ruins — Obelisk Treasury',
    theme: 'ruins',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'ruin_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(102),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO VAULTS',
      },
      {
        id: 'ruin_2_to_3',
        x: px(101),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(16),
        requireUp: false,
        label: 'TEMPLE SHRINE',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Temple Pillar Shrine (76x20) ----
  const f3 = 16;
  const g3 = new RoomGrid(76, 20, f3);
  const s3: RoomEntitySpawn[] = [];

  addTotem(s3, 12, f3, 'bomb', 'BOMB CARRIER');
  g3.fillRect(22, 12, 2, 4, 'M');
  g3.oneWay(26, 12, 10);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(31), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.fillRect(42, 12, 2, 4, 'M');
  g3.fillRect(50, 12, 2, 4, 'm');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(65), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'small_topping', 14, 12, f3, 2);
  addSafeTrail(g3, s3, 'big_topping', 46, 5, f3, 3);
  s3.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(34), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(56), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'ruin_r3',
    name: 'Cheddar Ruins — Temple Shrine',
    theme: 'ruins',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'ruin_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(98),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('ruin_s1', 'Ruins Secret 1 — Blast Vault', 'ruins', 0, 0, px(72), groundY(11), 'gimmick_dash', 'bomb_imp', 'bomb');
  const sec2 = buildSecretRoom('ruin_s2', 'Ruins Secret 2 — Spike Relics', 'ruins', 1, 1, px(74), groundY(10), 'slope_jump', 'tribal_cheese');
  const sec3 = buildSecretRoom('ruin_s3', 'Ruins Secret 3 — Cheese Chimney', 'ruins', 2, 2, px(78), groundY(11), 'superjump_vault', 'slime_glob');

  return {
    id: 'ruin',
    name: 'Cheddar Ruins',
    subtitle: 'Bomb Carrier Vaults & Ancient Cheese-Stone Temples',
    floor: 1,
    theme: 'ruins',
    music: 'stage_ruins',
    sRankScore: 17000,
    escapeSeconds: 180,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Bomb Carrier Demolition & Marble/Metal Vaults',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 1 STAGE 4: DUNGEON — Sauce Catacombs (Vertical Drop Shaft + Lava Rockets!)
// Oracle: sRankScore = 18500, escapeSeconds = 205
// ============================================================================
function buildDungeonLevel(): LevelDef {
  // ---- Room 0: Upper Caldera Entry & Descent Gate (90x24) ----
  const f0 = 20;
  const g0 = new RoomGrid(90, 24, f0);
  const s0: RoomEntitySpawn[] = [];

  // Entry balcony at top left (row 10) -> slopes & lava pit drop to row 20
  g0.plateau(1, 10, 14, f0);
  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(10), label: 'EXIT SAUCE CATACOMBS' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(9), y: groundY(10), label: 'LAP 2 PORTAL' });
  g0.slope45DownRight(15, 10, 4); // down to 14
  g0.plateau(19, 14, 10, f0);
  g0.slope45DownRight(29, 14, 6); // dramatic plunge down to row 20!

  // Lava pit boosting player right back up to upper catacombs ledge!
  g0.fillRect(42, f0, 6, 1, 'L');
  g0.oneWay(41, 16, 8);
  g0.fillRect(43, 12, 4, 1, 'M'); // Fire-Butt rockets straight through overhead Metal!
  g0.oneWay(41, 9, 14);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(48), y: groundY(9), label: 'SHROOM PAL' });

  // Escape climb platforms ('O') linking lower floor straight back up to Exit balcony!
  g0.fillRect(36, 16, 4, 1, 'O');
  g0.fillRect(32, 13, 4, 1, 'O');
  g0.fillRect(28, 10, 4, 1, 'O');

  // Secret Eye #1 tucked on scorching rafter
  g0.oneWay(60, 11, 12);
  g0.fillRect(64, 8, 1, 3, 'S');
  addSecretEye(s0, 0, 68, 11, 4, 'CATACOMBS SECRET 1');

  g0.fillRect(62, 16, 2, 4, 'm');
  g0.fillRect(74, 16, 2, 4, 'M');

  addSafeTrail(g0, s0, 'small_topping', 19, 8, 14, 2);
  addSafeTrail(g0, s0, 'big_topping', 42, 4, 9, 3);
  addSafeTrail(g0, s0, 'big_topping', 56, 6, f0, 4);
  s0.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(24), y: groundY(14) });
  s0.push({ kind: 'enemy', archetype: 'fork_imp', x: px(57), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(80), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'dungeon_r0',
    name: 'Sauce Catacombs — Caldera Rim',
    theme: 'catacombs',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(6),
    spawnY: groundY(10),
    doors: [
      {
        id: 'dun_0_to_1',
        x: px(87),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(8),
        requireUp: false,
        label: 'THE MAGMA SHAFT',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: THE MAGMA PLUNGE — Dramatic 76x40 Vertical Tower Drop Shaft! ----
  const f1 = 36;
  const g1 = new RoomGrid(76, 40, f1);
  const s1: RoomEntitySpawn[] = [];

  // Tier 1 (Top entry, row 8)
  g1.fillRect(1, 8, 28, 1, '#');
  g1.fillRect(29, 8, 6, 1, 'm'); // Bodyslam straight down the shaft!
  g1.fillRect(35, 8, 40, 1, '#');
  g1.carve(60, 8, 10, 1); // Open right-hand drop/climb chute!
  g1.oneWay(60, 8, 10);

  // Tier 2 (row 15) — Lava Rocket launch pad & Toppin #1
  g1.fillRect(1, 15, 22, 1, '#');
  g1.oneWay(23, 15, 16);
  g1.fillRect(39, 15, 20, 1, '#');
  g1.fillRect(46, 15, 5, 1, 'L'); // Lava pit rockets you back to Tier 1!
  g1.oneWay(60, 15, 10);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(14), y: groundY(15), label: 'CHEESE PAL' });

  // Tier 3 (row 22) — Gerry + Secret Eye #2 + Lava Boost
  g1.fillRect(1, 22, 34, 1, '#');
  g1.fillRect(16, 22, 5, 1, 'L');
  g1.oneWay(35, 22, 16);
  g1.fillRect(51, 22, 24, 1, '#');
  g1.carve(60, 22, 10, 1);
  g1.oneWay(60, 22, 10);
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(9), y: groundY(22), label: 'JANITOR GERRY' });
  g1.fillRect(53, 19, 1, 3, 'S');
  addSecretEye(s1, 1, 56, 22, 5, 'CATACOMBS SECRET 2');

  // Tier 4 (row 29) — Toppin #2 + Metal break floor
  g1.fillRect(1, 29, 18, 1, '#');
  g1.fillRect(19, 29, 6, 1, 'M');
  g1.fillRect(25, 29, 34, 1, '#');
  g1.oneWay(60, 29, 10);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(32), y: groundY(29), label: 'TOMATO PAL' });

  // High-speed Escape Climb Chute on the right (x=60..70): 3-tile spaced platforms + Lava Rockets!
  for (const r of [33, 26, 19, 12]) {
    g1.oneWay(60, r, 10);
  }
  // Extra escape-only bridges ('O') in center shaft for blistering Mach/Wall-Climb ascent!
  g1.fillRect(36, 32, 6, 1, 'O');
  g1.fillRect(36, 25, 6, 1, 'O');
  g1.fillRect(36, 18, 6, 1, 'O');
  g1.fillRect(36, 11, 6, 1, 'O');
  // Bottom lava booster pad
  g1.fillRect(46, f1, 6, 1, 'L');
  g1.oneWay(45, 33, 8);

  addSafeTrail(g1, s1, 'big_topping', 12, 4, 8, 4);
  addSafeTrail(g1, s1, 'big_topping', 24, 4, 15, 3);
  addSafeTrail(g1, s1, 'big_topping', 26, 4, 22, 4);
  addSafeTrail(g1, s1, 'big_topping', 36, 4, 29, 4);
  addSafeTrail(g1, s1, 'small_topping', 14, 12, f1, 3);
  s1.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(22), y: groundY(8) });
  s1.push({ kind: 'enemy', archetype: 'fork_imp', x: px(42), y: groundY(15) });
  s1.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(28), y: groundY(22) });
  s1.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(44), y: groundY(29) });
  s1.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(25), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(64), y: groundY(19), escapeOnly: true });

  const room1: RoomDef = {
    id: 'dungeon_r1',
    name: 'Sauce Catacombs — The Magma Shaft',
    theme: 'catacombs',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(8),
    doors: [
      {
        id: 'dun_1_to_0',
        x: px(2),
        y: groundY(8),
        targetRoomIndex: 0,
        targetX: px(84),
        targetY: groundY(f0),
        requireUp: false,
        label: 'UP TO CALDERA',
      },
      {
        id: 'dun_1_to_2',
        x: px(73),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'BOILING CAULDRON',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Boiling Cauldron & Fire-Butt Skyways (104x26) ----
  const f2 = 22;
  const g2 = new RoomGrid(104, 26, f2);
  const s2: RoomEntitySpawn[] = [];

  // Wide simmering lava cauldrons launching Fire-Butt straight into overhead vaults!
  g2.fillRect(18, f2, 8, 1, 'L');
  g2.oneWay(17, 18, 10);
  g2.fillRect(20, 14, 4, 1, 'M');
  g2.oneWay(16, 11, 18);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(25), y: groundY(11), label: 'SAUSAGE PAL' });

  g2.fillRect(42, f2, 8, 1, 'L');
  g2.oneWay(41, 18, 10);
  g2.oneWay(40, 11, 18);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(49), y: groundY(11), label: 'CATACOMBS TREASURE' });

  g2.fillRect(66, f2, 8, 1, 'L');
  g2.oneWay(65, 18, 10);
  g2.oneWay(66, 10, 14);
  g2.fillRect(70, 7, 1, 3, 'S');
  addSecretEye(s2, 2, 74, 10, 6, 'CATACOMBS SECRET 3');

  // Escape sky-highway ('O') right across the cauldrons!
  g2.fillRect(34, 15, 8, 1, 'O');
  g2.fillRect(58, 15, 8, 1, 'O');
  g2.fillRect(82, 18, 2, 4, 'm');

  addSafeTrail(g2, s2, 'big_topping', 18, 5, 11, 3);
  addSafeTrail(g2, s2, 'big_topping', 42, 5, 11, 3);
  addSafeTrail(g2, s2, 'small_topping', 28, 12, f2, 3);
  s2.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(34), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(58), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'fork_imp', x: px(88), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'dungeon_r2',
    name: 'Sauce Catacombs — Boiling Cauldron',
    theme: 'catacombs',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'dun_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(70),
        targetY: groundY(f1),
        requireUp: false,
        label: 'UP MAGMA SHAFT',
      },
      {
        id: 'dun_2_to_3',
        x: px(101),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'DEEP SAUCE ALTAR',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Deep Sauce Altar (78x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(78, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  g3.fillRect(18, f3, 6, 1, 'L');
  g3.oneWay(17, 14, 10);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(22), y: groundY(14), label: 'PINEAPPLE PAL' });
  g3.slope26UpRight(30, f3, 2);
  g3.plateau(34, 16, 10, f3);
  g3.slope26DownRight(44, 16, 2);
  g3.fillRect(50, 14, 2, 4, 'M');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(66), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'small_topping', 9, 10, f3, 2);
  addSafeTrail(g3, s3, 'big_topping', 35, 4, 16, 2);
  addSafeTrail(g3, s3, 'big_topping', 54, 4, f3, 2);
  s3.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(39), y: groundY(16) });
  s3.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(57), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'dungeon_r3',
    name: 'Sauce Catacombs — Deep Sauce Altar',
    theme: 'catacombs',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'dun_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(98),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE CLIMB!',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('dungeon_s1', 'Catacombs Secret 1 — Lava Boost', 'catacombs', 0, 0, px(62), groundY(11), 'superjump_vault', 'pepper_goblin', 'fire_butt');
  const sec2 = buildSecretRoom('dungeon_s2', 'Catacombs Secret 2 — Magma Leap', 'catacombs', 1, 1, px(51), groundY(22), 'slope_jump', 'bomb_imp');
  const sec3 = buildSecretRoom('dungeon_s3', 'Catacombs Secret 3 — Boiler Run', 'catacombs', 2, 2, px(68), groundY(10), 'marble_dash', 'fork_imp');

  return {
    id: 'dungeon',
    name: 'Sauce Catacombs',
    subtitle: 'Vertical Drop Shafts, Lava Fire-Butt Boosts & Escape Climb',
    floor: 1,
    theme: 'catacombs',
    music: 'stage_catacombs',
    sRankScore: 18500,
    escapeSeconds: 205,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Vertical Tower Drop Shafts & Lava Fire-Butt Ascent',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 2 STAGE 1: BADLAND — Spice Mesa (Firemouth Ice Melt + Cow Stampedes)
// Oracle: sRankScore = 19500, escapeSeconds = 213
// ============================================================================
function buildBadlandLevel(): LevelDef {
  // ---- Room 0: Red-Rock Flats & Frozen Canyon Gate (102x22) ----
  const f0 = 18;
  const g0 = new RoomGrid(102, 22, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT SPICE MESA' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'firemouth', 'FIREMOUTH PEPPER');

  // Thick ICE_SOLID desert oasis barriers melted cleanly by Firemouth!
  g0.fillRect(22, 14, 2, 4, 'I');
  g0.slope26UpRight(28, f0, 2);
  g0.plateau(32, 16, 18, f0);
  g0.fillRect(40, 12, 2, 4, 'I');
  g0.slope45DownRight(50, 16, 2);

  // Upper desert mesa with Toppin #0 & ice-sealed Secret Eye #1
  g0.oneWay(32, 11, 16);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(40), y: groundY(11), label: 'SHROOM PAL' });

  g0.fillRect(62, 14, 2, 4, 'I');
  g0.oneWay(70, 11, 14);
  g0.fillRect(74, 8, 2, 3, 'I');
  g0.fillRect(77, 8, 1, 3, 'S');
  addSecretEye(s0, 0, 81, 11, 4, 'MESA SECRET 1');
  g0.fillRect(72, 14, 2, 4, 'P');

  addSafeTrail(g0, s0, 'small_topping', 16, 10, f0, 2);
  addSafeTrail(g0, s0, 'big_topping', 33, 5, 16, 3);
  addSafeTrail(g0, s0, 'big_topping', 56, 6, f0, 5);
  s0.push({ kind: 'enemy', archetype: 'cow_charger', x: px(36), y: groundY(16) });
  s0.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(57), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'cow_charger', x: px(78), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(88), y: groundY(f0), escapeOnly: true });

  const room0: RoomDef = {
    id: 'badland_r0',
    name: 'Spice Mesa — Red-Rock Flats',
    theme: 'mesa',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'bad_0_to_1',
        x: px(99),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'STAMPEDE CANYON',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Stampede Canyon & Triple Ice Vaults (114x24) ----
  const f1 = 20;
  const g1 = new RoomGrid(114, 24, f1);
  const s1: RoomEntitySpawn[] = [];

  addTotem(s1, 11, f1, 'firemouth', 'FIREMOUTH PEPPER');
  // Wide stampede valley with triple ICE_SOLID walls & charging cow_charger packs!
  g1.fillRect(20, 16, 2, 4, 'I');
  g1.fillRect(36, 16, 2, 4, 'I');
  g1.fillRect(52, 16, 2, 4, 'I');

  // Elevated red-rock plateaus holding Toppin #1, Toppin #2, Gerry & Secret #2
  g1.oneWay(24, 14, 10);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(29), y: groundY(14), label: 'CHEESE PAL' });

  g1.slope45UpRight(58, f1, 3);
  g1.plateau(61, 17, 22, f1);
  g1.fillRect(68, 13, 2, 4, 'I');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(74), y: groundY(17), label: 'JANITOR GERRY' });
  g1.oneWay(60, 11, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(66), y: groundY(11), label: 'TOMATO PAL' });

  g1.oneWay(80, 10, 12);
  g1.fillRect(84, 7, 1, 3, 'S');
  addSecretEye(s1, 1, 88, 10, 5, 'MESA SECRET 2');

  g1.slope45DownRight(83, 17, 3);
  g1.fillRect(92, 16, 2, 4, 'm');
  g1.fillRect(42, 13, 14, 1, 'O');

  addSafeTrail(g1, s1, 'small_topping', 14, 14, f1, 3);
  addSafeTrail(g1, s1, 'big_topping', 62, 5, 17, 4);
  addSafeTrail(g1, s1, 'big_topping', 88, 5, f1, 4);
  s1.push({ kind: 'enemy', archetype: 'cow_charger', x: px(29), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'cow_charger', x: px(45), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(65), y: groundY(17) });
  s1.push({ kind: 'enemy', archetype: 'cow_charger', x: px(97), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'badland_r1',
    name: 'Spice Mesa — Stampede Canyon',
    theme: 'mesa',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'bad_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(96),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO FLATS',
      },
      {
        id: 'bad_1_to_2',
        x: px(111),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'FROZEN OASIS',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Frozen Oasis Mesa (106x24) ----
  const f2 = 20;
  const g2 = new RoomGrid(106, 24, f2);
  const s2: RoomEntitySpawn[] = [];

  addTotem(s2, 12, f2, 'firemouth', 'FIREMOUTH PEPPER');
  g2.slope26UpRight(18, f2, 3); // rises to 17
  g2.plateau(24, 17, 18, f2);
  g2.fillRect(30, 13, 2, 4, 'I');
  g2.slope26DownRight(42, 17, 3);

  // Twin-walled Ice Oasis holding Treasure Chest & Toppin #3!
  g2.fillRect(52, 15, 2, 5, 'I');
  g2.fillRect(66, 15, 2, 5, 'I');
  g2.fillRect(52, 14, 16, 1, '#');
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(60), y: groundY(f2), label: 'MESA TREASURE' });

  g2.oneWay(54, 10, 14);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(61), y: groundY(10), label: 'SAUSAGE PAL' });

  g2.oneWay(74, 11, 14);
  g2.fillRect(78, 8, 1, 3, 'S');
  addSecretEye(s2, 2, 82, 11, 6, 'MESA SECRET 3');
  g2.fillRect(76, 16, 2, 4, 'P');

  addSafeTrail(g2, s2, 'small_topping', 24, 8, 17, 2);
  addSafeTrail(g2, s2, 'big_topping', 55, 4, 10, 3);
  addSafeTrail(g2, s2, 'big_topping', 72, 6, f2, 4);
  s2.push({ kind: 'enemy', archetype: 'cow_charger', x: px(36), y: groundY(17) });
  s2.push({ kind: 'enemy', archetype: 'pepper_goblin', x: px(72), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'cow_charger', x: px(90), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'badland_r2',
    name: 'Spice Mesa — Frozen Oasis',
    theme: 'mesa',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'bad_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(108),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO CANYON',
      },
      {
        id: 'bad_2_to_3',
        x: px(103),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(16),
        requireUp: false,
        label: 'CHILI PEAK',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Chili Peak Sanctum (78x20) ----
  const f3 = 16;
  const g3 = new RoomGrid(78, 20, f3);
  const s3: RoomEntitySpawn[] = [];

  addTotem(s3, 12, f3, 'firemouth', 'FIREMOUTH PEPPER');
  g3.fillRect(22, 12, 2, 4, 'I');
  g3.oneWay(26, 12, 10);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(31), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.fillRect(42, 12, 2, 4, 'I');
  g3.fillRect(50, 12, 2, 4, 'M');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(67), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'small_topping', 14, 12, f3, 2);
  addSafeTrail(g3, s3, 'big_topping', 46, 5, f3, 3);
  s3.push({ kind: 'enemy', archetype: 'cow_charger', x: px(33), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(56), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'badland_r3',
    name: 'Spice Mesa — Chili Peak Sanctum',
    theme: 'mesa',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'bad_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(100),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('badland_s1', 'Mesa Secret 1 — Pepper Melt', 'mesa', 0, 0, px(72), groundY(11), 'marble_dash', 'tribal_cheese', 'firemouth');
  const sec2 = buildSecretRoom('badland_s2', 'Mesa Secret 2 — Stampede Ridge', 'mesa', 1, 1, px(82), groundY(10), 'slope_jump', 'cow_charger');
  const sec3 = buildSecretRoom('badland_s3', 'Mesa Secret 3 — Canyon Vault', 'mesa', 2, 2, px(76), groundY(11), 'superjump_vault', 'pepper_goblin');

  return {
    id: 'badland',
    name: 'Spice Mesa',
    subtitle: 'Firemouth Ice-Melts, Bovine Stampedes & Red-Rock Plateaus',
    floor: 2,
    theme: 'mesa',
    music: 'stage_mesa',
    sRankScore: 19500,
    escapeSeconds: 213,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Firemouth Pepper Ice-Melting & Stampede Plateaus',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 2 STAGE 2: GRAVEYARD — Bone Crypt (Ghost Form 8-Way Flight & Vaults)
// Oracle: sRankScore = 20500, escapeSeconds = 220
// ============================================================================
function buildGraveyardLevel(): LevelDef {
  // ---- Room 0: Haunted Mausoleum Entry (100x24) ----
  const f0 = 20;
  const g0 = new RoomGrid(100, 24, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT BONE CRYPT' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'ghost', 'GHOST FORM');

  // 8-way Ghost flight gauntlet weaving over spike tombs & through crypt arches!
  g0.fillRect(20, f0, 16, 1, '^');
  g0.oneWay(20, 16, 16);
  g0.fillRect(27, 1, 2, 11, '#'); // Upper wall baffle to weave under/around!
  g0.oneWay(38, 12, 12);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(44), y: groundY(12), label: 'SHROOM PAL' });

  g0.fillRect(52, f0, 14, 1, '^');
  g0.oneWay(52, 15, 14);
  g0.fillRect(58, 10, 2, 6, 'P');

  g0.oneWay(70, 9, 14);
  g0.fillRect(74, 6, 1, 3, 'S');
  addSecretEye(s0, 0, 78, 9, 4, 'CRYPT SECRET 1');

  addTotem(s0, 88, f0, 'none', 'EXORCISE FORM');
  addSafeTrail(g0, s0, 'big_topping', 21, 5, 15, 3);
  addSafeTrail(g0, s0, 'big_topping', 39, 4, 9, 3);
  addSafeTrail(g0, s0, 'small_topping', 53, 8, 13, 2);
  s0.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(32), y: groundY(13) });
  s0.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(56), y: groundY(11) });
  s0.push({ kind: 'enemy', archetype: 'knight_squire', x: px(76), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(82), y: groundY(14), escapeOnly: true });

  const room0: RoomDef = {
    id: 'graveyard_r0',
    name: 'Bone Crypt — Haunted Mausoleum',
    theme: 'graveyard',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'grv_0_to_1',
        x: px(97),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'SPIRIT VAULTS',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Phantom Spirit Vaults (108x26) ----
  const f1 = 22;
  const g1 = new RoomGrid(108, 26, f1);
  const s1: RoomEntitySpawn[] = [];

  addTotem(s1, 11, f1, 'ghost', 'GHOST FORM');

  // Vertical & horizontal spirit-dash vaults!
  g1.fillRect(20, 14, 18, 1, '#');
  g1.carve(27, 14, 5, 1); // Vertical spirit shaft!
  g1.oneWay(27, 14, 5);
  g1.oneWay(20, 9, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(24), y: groundY(9), label: 'CHEESE PAL' });

  g1.fillRect(42, f1, 14, 1, '^');
  g1.oneWay(42, 18, 14);
  g1.fillRect(48, 8, 2, 9, '#'); // Mid-air crypt pillar to spirit-dash around
  g1.oneWay(56, 12, 16);
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(64), y: groundY(f1), label: 'JANITOR GERRY' });
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(64), y: groundY(12), label: 'TOMATO PAL' });

  g1.oneWay(76, 8, 14);
  g1.fillRect(80, 5, 1, 3, 'S');
  addSecretEye(s1, 1, 84, 8, 5, 'CRYPT SECRET 2');

  // Escape express bridge ('O') across spikes so normal Mach 4 flies back!
  g1.fillRect(42, 16, 14, 1, 'O');
  addTotem(s1, 96, f1, 'none', 'EXORCISE FORM');

  addSafeTrail(g1, s1, 'big_topping', 21, 5, 9, 3);
  addSafeTrail(g1, s1, 'big_topping', 43, 6, 15, 3);
  addSafeTrail(g1, s1, 'small_topping', 68, 10, f1, 2);
  s1.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(34), y: groundY(10) });
  s1.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(52), y: groundY(14) });
  s1.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(74), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(88), y: groundY(13) });

  const room1: RoomDef = {
    id: 'graveyard_r1',
    name: 'Bone Crypt — Spirit Vaults',
    theme: 'graveyard',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'grv_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(94),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO MAUSOLEUM',
      },
      {
        id: 'grv_1_to_2',
        x: px(105),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'CATACOMB GAUNTLET',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Catacomb Gauntlet & Spectral Treasury (104x26) ----
  const f2 = 22;
  const g2 = new RoomGrid(104, 26, f2);
  const s2: RoomEntitySpawn[] = [];

  g2.slope45UpRight(12, f2, 3);
  g2.plateau(15, 19, 12, f2);
  addTotem(s2, 20, 19, 'ghost', 'GHOST FORM');
  g2.slope45DownRight(27, 19, 3);

  g2.fillRect(34, f2, 20, 1, '^');
  g2.oneWay(34, 18, 20);
  g2.fillRect(34, 15, 20, 1, 'O');
  g2.oneWay(38, 10, 16);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(46), y: groundY(10), label: 'CRYPT TREASURE' });

  g2.oneWay(60, 13, 14);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(67), y: groundY(13), label: 'SAUSAGE PAL' });

  g2.oneWay(78, 9, 12);
  g2.fillRect(82, 6, 1, 3, 'S');
  addSecretEye(s2, 2, 86, 9, 6, 'CRYPT SECRET 3');

  addTotem(s2, 93, f2, 'none', 'EXORCISE FORM');
  addSafeTrail(g2, s2, 'big_topping', 39, 5, 10, 3);
  addSafeTrail(g2, s2, 'big_topping', 60, 5, 13, 3);
  addSafeTrail(g2, s2, 'small_topping', 58, 12, f2, 2);
  s2.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(42), y: groundY(14) });
  s2.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(64), y: groundY(10) });
  s2.push({ kind: 'enemy', archetype: 'knight_squire', x: px(80), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'graveyard_r2',
    name: 'Bone Crypt — Spectral Treasury',
    theme: 'graveyard',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'grv_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(102),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO VAULTS',
      },
      {
        id: 'grv_2_to_3',
        x: px(101),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'CRYPT BELLTOWER',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Crypt Belltower Sanctum (78x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(78, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  addTotem(s3, 12, f3, 'ghost', 'GHOST FORM');
  g3.oneWay(20, 12, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(26), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.fillRect(34, f3, 8, 1, '^');
  g3.oneWay(34, 15, 8);
  addTotem(s3, 50, f3, 'none', 'EXORCISE FORM');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(67), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 21, 5, 12, 3);
  addSafeTrail(g3, s3, 'small_topping', 44, 8, f3, 2);
  s3.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(38), y: groundY(12) });
  s3.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(57), y: groundY(14) });

  const room3: RoomDef = {
    id: 'graveyard_r3',
    name: 'Bone Crypt — Belltower Sanctum',
    theme: 'graveyard',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'grv_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(98),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('graveyard_s1', 'Crypt Secret 1 — Phantom Maze', 'graveyard', 0, 0, px(72), groundY(9), 'vertical_shaft', 'ghost_ghoul', 'ghost');
  const sec2 = buildSecretRoom('graveyard_s2', 'Crypt Secret 2 — Tomb Leaps', 'graveyard', 1, 1, px(78), groundY(8), 'slope_jump', 'knight_squire');
  const sec3 = buildSecretRoom('graveyard_s3', 'Crypt Secret 3 — Spirit Spire', 'graveyard', 2, 2, px(80), groundY(9), 'superjump_vault', 'ghost_ghoul');

  return {
    id: 'graveyard',
    name: 'Bone Crypt',
    subtitle: 'Ghost 8-Way Flight Gauntlets & Spirit-Dash Vaults',
    floor: 2,
    theme: 'graveyard',
    music: 'stage_graveyard',
    sRankScore: 20500,
    escapeSeconds: 220,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Ghost Form 8-Way Flight & Spectral Vaults',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 2 STAGE 3: FARM — Cluck Farm (Beak Companion Glides & Hayloft Climbs)
// Oracle: sRankScore = 19000, escapeSeconds = 160
// ============================================================================
function buildFarmLevel(): LevelDef {
  // ---- Room 0: Red Barn & Hayloft Rafters (100x26) ----
  const f0 = 22;
  const g0 = new RoomGrid(100, 26, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT CLUCK FARM' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'beak', 'BEAK COMPANION');

  // Towering barn haylofts designed for Beak double-jump + glide + Mach wall-climb!
  g0.plateau(24, 15, 10, f0); // 7-tile barn wall climb!
  g0.oneWay(18, 19, 5);
  g0.oneWay(18, 16, 5);
  g0.oneWay(36, 12, 14);
  g0.oneWay(54, 9, 16);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(62), y: groundY(9), label: 'SHROOM PAL' });

  // Barn gable Secret Eye #1
  g0.oneWay(74, 8, 12);
  g0.fillRect(78, 5, 1, 3, 'S');
  addSecretEye(s0, 0, 82, 8, 4, 'FARM SECRET 1');

  // Ground pasture runway with hay-bale marble walls
  g0.fillRect(44, 18, 2, 4, 'm');
  g0.fillRect(62, 18, 2, 4, 'm');
  g0.fillRect(76, 14, 10, 1, 'O');

  addSafeTrail(g0, s0, 'big_topping', 26, 4, 14, 2);
  addSafeTrail(g0, s0, 'big_topping', 38, 4, 11, 3);
  addSafeTrail(g0, s0, 'big_topping', 55, 5, 8, 3);
  addSafeTrail(g0, s0, 'small_topping', 38, 14, f0, 3);
  s0.push({ kind: 'enemy', archetype: 'cow_charger', x: px(52), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(72), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'slime_glob', x: px(43), y: groundY(12) });

  const room0: RoomDef = {
    id: 'farm_r0',
    name: 'Cluck Farm — Red Barn Haylofts',
    theme: 'farm',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'frm_0_to_1',
        x: px(97),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(24),
        requireUp: false,
        label: 'SILO PASTURE',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Silo Climb & Pasture Stampede (110x28) ----
  const f1 = 24;
  const g1 = new RoomGrid(110, 28, f1);
  const s1: RoomEntitySpawn[] = [];

  addTotem(s1, 11, f1, 'beak', 'BEAK COMPANION');

  // Twin vertical farm silos for wall-climb + high-altitude Beak glide!
  g1.plateau(20, 14, 8, f1);
  g1.oneWay(15, 20, 4);
  g1.oneWay(15, 17, 4);
  g1.oneWay(30, 11, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(38), y: groundY(11), label: 'CHEESE PAL' });

  g1.plateau(52, 12, 10, f1);
  g1.oneWay(47, 18, 4);
  g1.oneWay(47, 15, 4);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(57), y: groundY(12), label: 'TOMATO PAL' });
  g1.fillRect(66, 20, 1, 4, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(70), y: groundY(f1), label: 'JANITOR GERRY' });

  // High-altitude glide lane to Secret Eye #2
  g1.oneWay(68, 9, 16);
  g1.fillRect(74, 6, 1, 3, 'S');
  addSecretEye(s1, 1, 79, 9, 5, 'FARM SECRET 2');

  g1.slope45DownRight(86, 17, 7);
  g1.plateau(80, 17, 6, f1);
  g1.oneWay(75, 20, 4);

  addSafeTrail(g1, s1, 'big_topping', 31, 5, 10, 3);
  addSafeTrail(g1, s1, 'big_topping', 68, 5, 8, 3);
  addSafeTrail(g1, s1, 'small_topping', 32, 10, f1, 3);
  s1.push({ kind: 'enemy', archetype: 'cow_charger', x: px(38), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(57), y: groundY(12) });
  s1.push({ kind: 'enemy', archetype: 'cow_charger', x: px(96), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'farm_r1',
    name: 'Cluck Farm — Silo Pasture',
    theme: 'farm',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'frm_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(94),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO RED BARN',
      },
      {
        id: 'frm_1_to_2',
        x: px(107),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'WINDMILL RAFTERS',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Windmill Rafters & High-Altitude Vault (104x26) ----
  const f2 = 22;
  const g2 = new RoomGrid(104, 26, f2);
  const s2: RoomEntitySpawn[] = [];

  addTotem(s2, 11, f2, 'beak', 'BEAK COMPANION');
  g2.oneWay(18, 18, 12);
  g2.oneWay(34, 14, 14);
  g2.oneWay(52, 10, 18);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(61), y: groundY(10), label: 'FARM TREASURE' });

  g2.oneWay(74, 13, 12);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(80), y: groundY(13), label: 'SAUSAGE PAL' });

  g2.oneWay(72, 7, 14);
  g2.fillRect(76, 4, 1, 3, 'S');
  addSecretEye(s2, 2, 81, 7, 6, 'FARM SECRET 3');

  g2.fillRect(30, 18, 2, 4, 'm');
  g2.fillRect(50, 18, 2, 4, 'M');
  g2.fillRect(68, 16, 14, 1, 'O');

  addSafeTrail(g2, s2, 'big_topping', 20, 4, 17, 2);
  addSafeTrail(g2, s2, 'big_topping', 36, 4, 13, 3);
  addSafeTrail(g2, s2, 'big_topping', 54, 5, 9, 3);
  addSafeTrail(g2, s2, 'small_topping', 20, 16, f2, 4);
  s2.push({ kind: 'enemy', archetype: 'cow_charger', x: px(40), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(64), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'slime_glob', x: px(86), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'farm_r2',
    name: 'Cluck Farm — Windmill Rafters',
    theme: 'farm',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'frm_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(104),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO PASTURE',
      },
      {
        id: 'frm_2_to_3',
        x: px(101),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'ROOSTER COOP',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Rooster Coop Sanctum (78x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(78, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  g3.oneWay(18, 13, 12);
  g3.oneWay(32, 9, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(38), y: groundY(9), label: 'PINEAPPLE PAL' });
  g3.fillRect(46, 14, 2, 4, 'm');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(67), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 20, 4, 12, 3);
  addSafeTrail(g3, s3, 'small_topping', 12, 14, f3, 3);
  s3.push({ kind: 'enemy', archetype: 'cow_charger', x: px(36), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(54), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'farm_r3',
    name: 'Cluck Farm — Rooster Coop',
    theme: 'farm',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'frm_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(98),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('farm_s1', 'Farm Secret 1 — Hayloft Glide', 'farm', 0, 0, px(76), groundY(8), 'vertical_shaft', 'slime_glob', 'beak');
  const sec2 = buildSecretRoom('farm_s2', 'Farm Secret 2 — Pasture Leap', 'farm', 1, 1, px(70), groundY(9), 'slope_jump', 'cow_charger');
  const sec3 = buildSecretRoom('farm_s3', 'Farm Secret 3 — Silo Chimney', 'farm', 2, 2, px(74), groundY(7), 'superjump_vault', 'mushroom_spitter');

  return {
    id: 'farm',
    name: 'Cluck Farm',
    subtitle: 'Beak Companion Glides, Hayloft Wall-Climbs & Aerial Lofts',
    floor: 2,
    theme: 'farm',
    music: 'stage_farm',
    sRankScore: 19000,
    escapeSeconds: 160,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Beak Companion Double-Jump Glide & Hayloft Climbs',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 2 STAGE 4: SALOON — Grease Saloon (Weenie Mount + Dash Button Gates!)
// Oracle: sRankScore = 20000, escapeSeconds = 175
// ============================================================================
function buildSaloonLevel(): LevelDef {
  // ---- Room 0: Frontier Strip & Timed Outlet Gates (104x22) ----
  const f0 = 18;
  const g0 = new RoomGrid(104, 22, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT GREASE SALOON' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'weenie', 'WEENIE MOUNT');

  // Timed speedrun gate #1: hit dash_button -> rocket through BREAK_OUTLET_GATE ('G')!
  s0.push({ kind: 'prop', propKind: 'dash_button', x: px(22), y: groundY(f0), label: 'OPEN OUTLET GATE' });
  g0.fillRect(36, 14, 1, 4, 'G');
  g0.fillRect(36, 10, 1, 4, '#');

  // Mid-street saloon balcony with Toppin #0
  g0.oneWay(40, 14, 14);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(47), y: groundY(14), label: 'SHROOM PAL' });

  // Timed speedrun gate #2 guarding Secret Eye #1 & passage
  s0.push({ kind: 'prop', propKind: 'dash_button', x: px(56), y: groundY(f0), label: 'OPEN GATE 2' });
  g0.fillRect(72, 14, 1, 4, 'G');
  g0.oneWay(76, 11, 12);
  g0.fillRect(80, 8, 1, 3, 'S');
  addSecretEye(s0, 0, 84, 11, 4, 'SALOON SECRET 1');

  addTotem(s0, 93, f0, 'none', 'DISMOUNT');
  addSafeTrail(g0, s0, 'small_topping', 16, 14, f0, 2);
  addSafeTrail(g0, s0, 'big_topping', 42, 4, 14, 3);
  addSafeTrail(g0, s0, 'big_topping', 60, 6, f0, 4);
  s0.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(31), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'cow_charger', x: px(64), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(86), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'saloon_r0',
    name: 'Grease Saloon — Frontier Strip',
    theme: 'saloon',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'sal_0_to_1',
        x: px(101),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'WEENIE EXPRESS',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Weenie Express Track — 3 Chained Dash-Button Gates (118x24) ----
  const f1 = 20;
  const g1 = new RoomGrid(118, 24, f1);
  const s1: RoomEntitySpawn[] = [];

  addTotem(s1, 10, f1, 'weenie', 'WEENIE MOUNT');

  // Gate sprint 1
  s1.push({ kind: 'prop', propKind: 'dash_button', x: px(16), y: groundY(f1), label: 'GATE 1' });
  g1.fillRect(24, f1, 4, 1, '^');
  g1.oneWay(24, 17, 4);
  g1.fillRect(34, 16, 1, 4, 'G');

  // Gate sprint 2 + Toppin #1
  s1.push({ kind: 'prop', propKind: 'dash_button', x: px(42), y: groundY(f1), label: 'GATE 2' });
  g1.oneWay(46, 15, 12);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(52), y: groundY(15), label: 'CHEESE PAL' });
  g1.fillRect(62, 16, 1, 4, 'G');

  // Gate sprint 3 + Gerry + Toppin #2 + Secret #2
  s1.push({ kind: 'prop', propKind: 'dash_button', x: px(68), y: groundY(f1), label: 'GATE 3' });
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(76), y: groundY(f1), label: 'JANITOR GERRY' });
  g1.oneWay(74, 13, 14);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(80), y: groundY(13), label: 'TOMATO PAL' });
  g1.oneWay(88, 10, 12);
  g1.fillRect(92, 7, 1, 3, 'S');
  addSecretEye(s1, 1, 96, 10, 5, 'SALOON SECRET 2');
  g1.fillRect(90, 16, 1, 4, 'G');

  addTotem(s1, 106, f1, 'none', 'DISMOUNT');
  // Escape shortcut button near right door so escape runners can also open gates cleanly!
  s1.push({ kind: 'prop', propKind: 'dash_button', x: px(102), y: groundY(f1), label: 'ESCAPE GATE SWITCH' });

  addSafeTrail(g1, s1, 'small_topping', 18, 16, f1, 3);
  addSafeTrail(g1, s1, 'big_topping', 47, 4, 15, 3);
  addSafeTrail(g1, s1, 'big_topping', 75, 4, 13, 3);
  s1.push({ kind: 'enemy', archetype: 'cow_charger', x: px(48), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(72), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(98), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'saloon_r1',
    name: 'Grease Saloon — Weenie Express Track',
    theme: 'saloon',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'sal_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(98),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO STRIP',
      },
      {
        id: 'sal_1_to_2',
        x: px(115),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'SALOON HALL',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: High-Noon Saloon Hall (106x24) ----
  const f2 = 20;
  const g2 = new RoomGrid(106, 24, f2);
  const s2: RoomEntitySpawn[] = [];

  s2.push({ kind: 'prop', propKind: 'dash_button', x: px(16), y: groundY(f2), label: 'OPEN BALCONY GATE' });
  g2.slope26UpRight(20, f2, 3);
  g2.plateau(26, 17, 20, f2);
  g2.fillRect(36, 13, 1, 4, 'G');
  g2.slope26DownRight(46, 17, 3);

  // Two-story saloon balcony with timed gate vault holding Treasure Chest!
  g2.oneWay(52, 13, 24);
  s2.push({ kind: 'prop', propKind: 'dash_button', x: px(54), y: groundY(13), label: 'TREASURE GATE' });
  g2.fillRect(64, 9, 1, 4, 'G');
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(70), y: groundY(13), label: 'SALOON TREASURE' });

  g2.oneWay(78, 15, 12);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(84), y: groundY(15), label: 'SAUSAGE PAL' });

  g2.oneWay(74, 8, 12);
  g2.fillRect(78, 5, 1, 3, 'S');
  addSecretEye(s2, 2, 82, 8, 6, 'SALOON SECRET 3');
  g2.fillRect(72, 16, 2, 4, 'P');

  addSafeTrail(g2, s2, 'big_topping', 28, 5, 17, 3);
  addSafeTrail(g2, s2, 'big_topping', 56, 5, 13, 3);
  addSafeTrail(g2, s2, 'small_topping', 56, 14, f2, 3);
  s2.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(32), y: groundY(17) });
  s2.push({ kind: 'enemy', archetype: 'cow_charger', x: px(62), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(90), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'saloon_r2',
    name: 'Grease Saloon — High-Noon Hall',
    theme: 'saloon',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'sal_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(112),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO EXPRESS TRACK',
      },
      {
        id: 'sal_2_to_3',
        x: px(103),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(16),
        requireUp: false,
        label: 'BACKROOM SANCTUM',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Sheriff's Backroom Sanctum (78x20) ----
  const f3 = 16;
  const g3 = new RoomGrid(78, 20, f3);
  const s3: RoomEntitySpawn[] = [];

  addTotem(s3, 11, f3, 'weenie', 'WEENIE MOUNT');
  s3.push({ kind: 'prop', propKind: 'dash_button', x: px(18), y: groundY(f3), label: 'OPEN SANCTUM GATE' });
  g3.fillRect(32, 12, 1, 4, 'G');
  g3.oneWay(20, 12, 10);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(25), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.fillRect(46, 12, 1, 4, 'G');
  addTotem(s3, 55, f3, 'none', 'DISMOUNT');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(67), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'small_topping', 14, 14, f3, 2);
  addSafeTrail(g3, s3, 'big_topping', 36, 6, f3, 3);
  s3.push({ kind: 'enemy', archetype: 'tribal_cheese', x: px(40), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'cow_charger', x: px(52), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'saloon_r3',
    name: 'Grease Saloon — Backroom Sanctum',
    theme: 'saloon',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'sal_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(100),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('saloon_s1', 'Saloon Secret 1 — Weenie Sprint', 'saloon', 0, 0, px(78), groundY(11), 'gimmick_dash', 'tribal_cheese', 'weenie');
  const sec2 = buildSecretRoom('saloon_s2', 'Saloon Secret 2 — Frontier Jump', 'saloon', 1, 1, px(90), groundY(10), 'slope_jump', 'cow_charger');
  const sec3 = buildSecretRoom('saloon_s3', 'Saloon Secret 3 — Saloon Loft', 'saloon', 2, 2, px(76), groundY(8), 'superjump_vault', 'bomb_imp');

  return {
    id: 'saloon',
    name: 'Grease Saloon',
    subtitle: 'Weenie Mount Express Tracks & Timed Outlet Speedrun Gates',
    floor: 2,
    theme: 'saloon',
    music: 'stage_saloon',
    sRankScore: 20000,
    escapeSeconds: 175,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Weenie Mount Tracks & Dash-Button Timed Gates',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 3 STAGE 1: PLAGE — Cove Pier (Barrel Roll Metal Smash & Cannon Batteries)
// Oracle: sRankScore = 23000, escapeSeconds = 185
// ============================================================================
function buildPlageLevel(): LevelDef {
  // ---- Room 0: Seaside Boardwalk (106x22) ----
  const f0 = 18;
  const g0 = new RoomGrid(106, 22, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT COVE PIER' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'barrel', 'BARREL ROLL');

  // Seaside boardwalk plunge smashing Metal dock crates & cannon batteries!
  g0.slope45UpRight(19, f0, 3);
  g0.plateau(22, 15, 10, f0);
  g0.slope45DownRight(32, 15, 3);
  g0.fillRect(40, 14, 2, 4, 'M');
  g0.fillRect(50, 14, 2, 4, 'M');
  g0.fillRect(62, 14, 2, 4, 'M');

  // Elevated boardwalk pier deck holding Toppin #0 & Secret Eye #1
  g0.oneWay(24, 11, 16);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(32), y: groundY(11), label: 'SHROOM PAL' });
  g0.oneWay(70, 11, 14);
  g0.fillRect(74, 8, 1, 3, 'S');
  addSecretEye(s0, 0, 78, 11, 4, 'PIER SECRET 1');
  g0.fillRect(70, 14, 2, 4, 'P');

  addTotem(s0, 94, f0, 'none', 'EXIT BARREL');
  addSafeTrail(g0, s0, 'small_topping', 16, 12, f0, 2);
  addSafeTrail(g0, s0, 'big_topping', 44, 7, f0, 5);
  addSafeTrail(g0, s0, 'big_topping', 26, 4, 11, 3);
  s0.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(46), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(58), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'swedish_ape', x: px(78), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'pickle_brawler', x: px(86), y: groundY(f0), escapeOnly: true });

  const room0: RoomDef = {
    id: 'plage_r0',
    name: 'Cove Pier — Seaside Boardwalk',
    theme: 'pier',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'plg_0_to_1',
        x: px(103),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(14),
        requireUp: false,
        label: 'CANNONBALL WHARF',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Cannonball Wharf — Barrel Broadside Run (116x24) ----
  const f1 = 20;
  const g1 = new RoomGrid(116, 24, f1);
  const s1: RoomEntitySpawn[] = [];

  g1.plateau(1, 14, 12, f1);
  addTotem(s1, 9, 14, 'barrel', 'BARREL ROLL');
  g1.slope45DownRight(13, 14, 6); // x=13..18 launches Barrel down to row 20!

  // Four Metal cargo bulkheads flanked by Cannon Goblin batteries!
  g1.fillRect(24, 16, 2, 4, 'M');
  g1.fillRect(36, 16, 2, 4, 'M');
  g1.fillRect(48, 16, 2, 4, 'M');
  g1.fillRect(62, 16, 2, 4, 'M');

  // Upper crane catwalks: Toppin #1, Toppin #2, Gerry & Secret #2
  g1.oneWay(26, 13, 12);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(32), y: groundY(13), label: 'CHEESE PAL' });
  g1.oneWay(52, 12, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(60), y: groundY(12), label: 'TOMATO PAL' });
  g1.fillRect(72, 16, 1, 4, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(76), y: groundY(f1), label: 'JANITOR GERRY' });

  g1.oneWay(82, 10, 14);
  g1.fillRect(86, 7, 1, 3, 'S');
  addSecretEye(s1, 1, 90, 10, 5, 'PIER SECRET 2');

  g1.fillRect(68, 13, 12, 1, 'O');
  addTotem(s1, 104, f1, 'none', 'EXIT BARREL');

  addSafeTrail(g1, s1, 'big_topping', 20, 9, f1, 5);
  addSafeTrail(g1, s1, 'big_topping', 54, 5, 12, 3);
  addSafeTrail(g1, s1, 'small_topping', 78, 12, f1, 2);
  s1.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(31), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(43), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(56), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'pickle_brawler', x: px(84), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'swedish_ape', x: px(96), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'plage_r1',
    name: 'Cove Pier — Cannonball Wharf',
    theme: 'pier',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(14),
    doors: [
      {
        id: 'plg_1_to_0',
        x: px(2),
        y: groundY(14),
        targetRoomIndex: 0,
        targetX: px(100),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO BOARDWALK',
      },
      {
        id: 'plg_1_to_2',
        x: px(113),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'BREAKWATER WAREHOUSE',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Lighthouse Breakwater & Metal Warehouse (108x24) ----
  const f2 = 20;
  const g2 = new RoomGrid(108, 24, f2);
  const s2: RoomEntitySpawn[] = [];

  addTotem(s2, 11, f2, 'barrel', 'BARREL ROLL');
  g2.slope26UpRight(16, f2, 3);
  g2.plateau(22, 17, 16, f2);
  g2.fillRect(28, 13, 2, 4, 'M');
  g2.slope26DownRight(38, 17, 3);

  // Triple-Metal seaside warehouse holding Treasure Chest!
  g2.fillRect(50, 15, 2, 5, 'M');
  g2.fillRect(62, 15, 2, 5, 'M');
  g2.fillRect(74, 15, 2, 5, 'M');
  g2.fillRect(50, 14, 26, 1, '#');
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(68), y: groundY(f2), label: 'PIER TREASURE' });

  g2.oneWay(52, 10, 22);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(62), y: groundY(10), label: 'SAUSAGE PAL' });

  g2.oneWay(80, 9, 14);
  g2.fillRect(84, 6, 1, 3, 'S');
  addSecretEye(s2, 2, 88, 9, 6, 'PIER SECRET 3');
  g2.fillRect(80, 15, 14, 1, 'O');
  addTotem(s2, 96, f2, 'none', 'EXIT BARREL');

  addSafeTrail(g2, s2, 'big_topping', 24, 5, 17, 3);
  addSafeTrail(g2, s2, 'big_topping', 54, 6, 10, 3);
  addSafeTrail(g2, s2, 'big_topping', 78, 5, f2, 4);
  s2.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(34), y: groundY(17) });
  s2.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(57), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'pickle_brawler', x: px(84), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'plage_r2',
    name: 'Cove Pier — Breakwater Warehouse',
    theme: 'pier',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'plg_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(110),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO WHARF',
      },
      {
        id: 'plg_2_to_3',
        x: px(105),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(16),
        requireUp: false,
        label: 'GALLEON SANCTUM',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Galleon Sanctum (80x20) ----
  const f3 = 16;
  const g3 = new RoomGrid(80, 20, f3);
  const s3: RoomEntitySpawn[] = [];

  addTotem(s3, 11, f3, 'barrel', 'BARREL ROLL');
  g3.fillRect(22, 12, 2, 4, 'M');
  g3.oneWay(26, 11, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(32), y: groundY(11), label: 'PINEAPPLE PAL' });
  g3.fillRect(42, 12, 2, 4, 'M');
  addTotem(s3, 56, f3, 'none', 'EXIT BARREL');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(68), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 15, 10, f3, 4);
  s3.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(35), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(50), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'plage_r3',
    name: 'Cove Pier — Galleon Sanctum',
    theme: 'pier',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'plg_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(102),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('plage_s1', 'Pier Secret 1 — Barrel Blitz', 'pier', 0, 0, px(72), groundY(11), 'gimmick_dash', 'cannon_goblin', 'barrel');
  const sec2 = buildSecretRoom('plage_s2', 'Pier Secret 2 — Dock Leaps', 'pier', 1, 1, px(84), groundY(10), 'slope_jump', 'swedish_ape');
  const sec3 = buildSecretRoom('plage_s3', 'Pier Secret 3 — Crane Vault', 'pier', 2, 2, px(82), groundY(9), 'superjump_vault', 'pickle_brawler');

  return {
    id: 'plage',
    name: 'Cove Pier',
    subtitle: 'Barrel Roll Boardwalks, Metal Bulkheads & Cannon Batteries',
    floor: 3,
    theme: 'pier',
    music: 'stage_pier',
    sRankScore: 23000,
    escapeSeconds: 185,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Barrel Roll Metal Smash & Cannon Goblin Batteries',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLAGSHIP 3: FOREST — Shroom Woods (Gusto & Chonks Showcase, 7 Rooms)
// Oracle: sRankScore = 19000, escapeSeconds = 210
// ============================================================================
function buildForestLevel(): LevelDef {
  // ---- Room 0: Canopy Trail (96x22) ----
  const r0Floor = 18;
  const g0 = new RoomGrid(96, 22, r0Floor);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(r0Floor), label: 'EXIT SHROOM WOODS' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(7), y: groundY(r0Floor), label: 'LAP 2 PORTAL' });

  g0.slope26UpRight(16, r0Floor, 3);
  g0.plateau(22, 15, 14, r0Floor);
  g0.fillRect(28, 11, 2, 4, 'm');
  g0.slope45DownRight(36, 15, 3);

  g0.oneWay(46, 14, 10);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(51), y: groundY(14), label: 'SHROOM PAL' });

  g0.oneWay(64, 12, 10);
  g0.fillRect(68, 9, 1, 3, 'S');
  addSecretEye(s0, 0, 71, 12, 4, 'WOODS SECRET 1');

  s0.push({
    kind: 'prop',
    propKind: 'buddy_switch',
    x: px(84),
    y: groundY(r0Floor),
    riderTarget: 'gusto_chonks',
    label: 'TAG IN GUSTO & CHONKS!',
  });

  addSafeTrail(g0, s0, 'small_topping', 10, 3, r0Floor, 2);
  addSafeTrail(g0, s0, 'small_topping', 23, 5, 15, 2);
  addSafeTrail(g0, s0, 'big_topping', 24, 4, 14, 4);
  addSafeTrail(g0, s0, 'big_topping', 56, 3, r0Floor, 4);
  s0.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(31), y: groundY(15) });
  s0.push({ kind: 'enemy', archetype: 'giant_bee', x: px(49), y: groundY(12) });
  s0.push({ kind: 'enemy', archetype: 'archer_goblin', x: px(75), y: groundY(r0Floor) });

  const room0: RoomDef = {
    id: 'forest_r0',
    name: 'Shroom Woods — Canopy Trail',
    theme: 'woods',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(r0Floor),
    doors: [
      {
        id: 'for_0_to_1',
        x: px(93),
        y: groundY(r0Floor),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'GUSTO MEADOW',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Gusto & Chonks Meadow (104x22, allowRider: 'gusto_chonks') ----
  const r1Floor = 18;
  const g1 = new RoomGrid(104, 22, r1Floor);
  const s1: RoomEntitySpawn[] = [];

  g1.fillRect(20, 14, 2, 4, 'M');
  g1.fillRect(36, 14, 2, 4, 'M');
  g1.slope45UpRight(44, r1Floor, 3);
  g1.plateau(47, 15, 16, r1Floor);
  g1.fillRect(54, 11, 2, 4, 'M');
  g1.slope26DownRight(63, 15, 3);

  g1.oneWay(24, 13, 9);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(28), y: groundY(13), label: 'CHEESE PAL' });
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(58), y: groundY(15), label: 'TOMATO PAL' });

  g1.fillRect(72, 15, 1, 3, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(76), y: groundY(r1Floor), label: 'JANITOR GERRY' });

  g1.oneWay(76, 11, 12);
  g1.fillRect(82, 8, 1, 3, 'S');
  addSecretEye(s1, 1, 85, 11, 5, 'WOODS SECRET 2');

  addSafeTrail(g1, s1, 'small_topping', 10, 12, r1Floor, 2);
  addSafeTrail(g1, s1, 'big_topping', 48, 4, 14, 3);
  addSafeTrail(g1, s1, 'big_topping', 78, 3, 10, 3);
  s1.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(29), y: groundY(r1Floor) });
  s1.push({ kind: 'enemy', archetype: 'giant_bee', x: px(42), y: groundY(13) });
  s1.push({ kind: 'enemy', archetype: 'archer_goblin', x: px(60), y: groundY(15) });
  s1.push({ kind: 'enemy', archetype: 'swedish_ape', x: px(88), y: groundY(r1Floor) });
  s1.push({ kind: 'enemy', archetype: 'pickle_brawler', x: px(94), y: groundY(r1Floor), escapeOnly: true });

  const room1: RoomDef = {
    id: 'forest_r1',
    name: 'Shroom Woods — Gusto & Chonks Meadow',
    theme: 'woods',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(r1Floor),
    allowRider: 'gusto_chonks',
    doors: [
      {
        id: 'for_1_to_0',
        x: px(2),
        y: groundY(r1Floor),
        targetRoomIndex: 0,
        targetX: px(90),
        targetY: groundY(18),
        requireUp: false,
        label: 'TO CANOPY',
      },
      {
        id: 'for_1_to_2',
        x: px(101),
        y: groundY(r1Floor),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'HOLLOW TRUNK',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Hollow Trunk & Bramble Bridge (96x24, allowRider: 'gusto_chonks') ----
  const r2Floor = 20;
  const g2 = new RoomGrid(96, 24, r2Floor);
  const s2: RoomEntitySpawn[] = [];

  g2.plateau(16, 14, 14, r2Floor);
  g2.oneWay(11, 17, 4);
  g2.oneWay(11, 14, 4);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(23), y: groundY(14), label: 'SAUSAGE PAL' });

  g2.fillRect(36, 15, 6, 1, 'M');
  g2.oneWay(32, 16, 4);
  g2.oneWay(42, 12, 14);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(49), y: groundY(12), label: 'WOODS TREASURE' });

  g2.oneWay(60, 9, 12);
  g2.fillRect(65, 6, 1, 3, 'S');
  addSecretEye(s2, 2, 68, 9, 6, 'WOODS SECRET 3');

  g2.fillRect(58, 16, 12, 1, 'O');
  g2.fillRect(74, 16, 2, 4, 'P');
  s2.push({
    kind: 'prop',
    propKind: 'buddy_switch',
    x: px(84),
    y: groundY(r2Floor),
    riderTarget: 'peppo',
    label: 'TAG BACK SOLO!',
  });

  addSafeTrail(g2, s2, 'small_topping', 32, 10, r2Floor, 2);
  addSafeTrail(g2, s2, 'big_topping', 18, 4, 13, 3);
  addSafeTrail(g2, s2, 'big_topping', 44, 4, 11, 4);
  s2.push({ kind: 'enemy', archetype: 'archer_goblin', x: px(27), y: groundY(14) });
  s2.push({ kind: 'enemy', archetype: 'giant_bee', x: px(52), y: groundY(15) });
  s2.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(66), y: groundY(r2Floor) });
  s2.push({ kind: 'enemy', archetype: 'pickle_brawler', x: px(79), y: groundY(r2Floor) });

  const room2: RoomDef = {
    id: 'forest_r2',
    name: 'Shroom Woods — Hollow Trunk',
    theme: 'woods',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(r2Floor),
    allowRider: 'gusto_chonks',
    doors: [
      {
        id: 'for_2_to_1',
        x: px(2),
        y: groundY(r2Floor),
        targetRoomIndex: 1,
        targetX: px(98),
        targetY: groundY(18),
        requireUp: false,
        label: 'TO MEADOW',
      },
      {
        id: 'for_2_to_3',
        x: px(93),
        y: groundY(r2Floor),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(16),
        requireUp: false,
        label: 'ANCIENT STUMP',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Ancient Stump Sanctum (72x20) ----
  const r3Floor = 16;
  const g3 = new RoomGrid(72, 20, r3Floor);
  const s3: RoomEntitySpawn[] = [];

  g3.oneWay(20, 12, 10);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(25), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.slope45UpRight(34, r3Floor, 2);
  g3.plateau(36, 14, 10, r3Floor);
  g3.slope45DownRight(46, 14, 2);
  g3.fillRect(52, 12, 2, 4, 'M');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(63), y: groundY(r3Floor), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'small_topping', 10, 8, r3Floor, 2);
  addSafeTrail(g3, s3, 'big_topping', 37, 4, 13, 2);
  s3.push({ kind: 'enemy', archetype: 'giant_bee', x: px(18), y: groundY(13) });
  s3.push({ kind: 'enemy', archetype: 'archer_goblin', x: px(41), y: groundY(14) });
  s3.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(56), y: groundY(r3Floor) });

  const room3: RoomDef = {
    id: 'forest_r3',
    name: 'Shroom Woods — Ancient Stump',
    theme: 'woods',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(r3Floor),
    doors: [
      {
        id: 'for_3_to_2',
        x: px(2),
        y: groundY(r3Floor),
        targetRoomIndex: 2,
        targetX: px(90),
        targetY: groundY(20),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const secret1 = buildSecretRoom('forest_s1', 'Woods Secret 1 — Bracken Sprint', 'secret', 0, 0, px(66), groundY(12), 'marble_dash', 'mushroom_spitter');
  const secret2 = buildSecretRoom('forest_s2', 'Woods Secret 2 — Canopy Leap', 'secret', 1, 1, px(78), groundY(11), 'slope_jump', 'giant_bee');
  const secret3 = buildSecretRoom('forest_s3', 'Woods Secret 3 — Hollow Crown', 'secret', 2, 2, px(62), groundY(9), 'superjump_vault', 'archer_goblin');

  return {
    id: 'forest',
    name: 'Shroom Woods',
    subtitle: 'Floor 3 Flagship — Gusto & Chonks Tag-Team Woodland',
    floor: 3,
    theme: 'woods',
    music: 'stage_woods',
    sRankScore: 19000,
    escapeSeconds: 210,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Gusto & Chonks Tag-Team + Metal Smash Trails',
    rooms: [room0, room1, room2, room3, secret1, secret2, secret3],
  };
}

// ============================================================================
// FLOOR 3 STAGE 3: SPACE — Orbit Nine (Rocket Ride Tunnels & Planetary Warps)
// Oracle: sRankScore = 20000, escapeSeconds = 185
// ============================================================================
function buildSpaceLevel(): LevelDef {
  // ---- Room 0: Launchpad Station (106x24) ----
  const f0 = 20;
  const g0 = new RoomGrid(106, 24, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT ORBIT NINE' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'rocket', 'ROCKET RIDE');

  // Wide Rocket boost corridor smashing asteroid Metal walls & UFO Olive swarms!
  g0.fillRect(24, 15, 2, 5, 'M');
  g0.fillRect(38, 15, 2, 5, 'M');
  g0.fillRect(54, 15, 2, 5, 'M');
  g0.oneWay(26, 11, 20);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(36), y: groundY(11), label: 'SHROOM PAL' });

  // Upper Docking Bay Secret Eye #1
  g0.oneWay(68, 9, 14);
  g0.fillRect(72, 6, 1, 3, 'S');
  addSecretEye(s0, 0, 76, 9, 4, 'ORBIT SECRET 1');
  g0.fillRect(70, 16, 2, 4, 'P');

  addTotem(s0, 92, f0, 'none', 'EJECT ROCKET');
  addSafeTrail(g0, s0, 'big_topping', 18, 9, 16, 5);
  addSafeTrail(g0, s0, 'big_topping', 28, 5, 11, 3);
  addSafeTrail(g0, s0, 'small_topping', 66, 12, f0, 2);
  s0.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(32), y: groundY(14) });
  s0.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(48), y: groundY(13) });
  s0.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(64), y: groundY(14) });
  s0.push({ kind: 'enemy', archetype: 'static_minion', x: px(82), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'space_r0',
    name: 'Orbit Nine — Launchpad Station',
    theme: 'orbit',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'spc_0_to_1',
        x: px(103),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'WARP: ASTEROID TUNNEL',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Asteroid Boost Tunnel (118x26) ----
  const f1 = 22;
  const g1 = new RoomGrid(118, 26, f1);
  const s1: RoomEntitySpawn[] = [];

  addTotem(s1, 11, f1, 'rocket', 'ROCKET RIDE');

  // Dual upper & lower Rocket boost tunnels divided by horizontal asteroid deck!
  g1.fillRect(20, 14, 72, 1, '#');
  g1.carve(38, 14, 8, 1); // Vertical rocket lane transfer!
  g1.oneWay(38, 14, 8);
  g1.carve(72, 14, 8, 1);
  g1.oneWay(72, 14, 8);

  // Lower lane Metal airlocks
  g1.fillRect(28, 18, 2, 4, 'M');
  g1.fillRect(54, 18, 2, 4, 'M');
  g1.fillRect(82, 18, 2, 4, 'M');

  // Upper lane asteroid airlocks + Toppin #1, Toppin #2, Gerry, Secret #2
  g1.fillRect(30, 8, 2, 6, 'M');
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(48), y: groundY(14), label: 'CHEESE PAL' });
  g1.fillRect(60, 8, 2, 6, 'M');
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(68), y: groundY(14), label: 'TOMATO PAL' });
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(64), y: groundY(f1), label: 'JANITOR GERRY' });

  g1.oneWay(82, 9, 14);
  g1.fillRect(86, 6, 1, 3, 'S');
  addSecretEye(s1, 1, 90, 9, 5, 'ORBIT SECRET 2');

  addTotem(s1, 102, f1, 'none', 'EJECT ROCKET');
  addSafeTrail(g1, s1, 'big_topping', 20, 10, 19, 6);
  addSafeTrail(g1, s1, 'big_topping', 24, 9, 10, 6);
  s1.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(36), y: groundY(18) });
  s1.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(56), y: groundY(10) });
  s1.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(76), y: groundY(18) });
  s1.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(92), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'space_r1',
    name: 'Orbit Nine — Asteroid Boost Tunnel',
    theme: 'orbit',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'spc_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(100),
        targetY: groundY(f0),
        requireUp: false,
        label: 'WARP: LAUNCHPAD',
      },
      {
        id: 'spc_1_to_2',
        x: px(115),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'WARP: SATELLITE RING',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Satellite Ring & Planetary Warp Hub (108x26) ----
  const f2 = 22;
  const g2 = new RoomGrid(108, 26, f2);
  const s2: RoomEntitySpawn[] = [];

  addTotem(s2, 11, f2, 'rocket', 'ROCKET RIDE');
  g2.fillRect(22, f2, 10, 1, '^');
  g2.oneWay(22, 18, 10);
  g2.fillRect(22, 15, 10, 1, 'O');

  g2.fillRect(42, 14, 24, 1, '#');
  g2.oneWay(36, 18, 5);
  g2.oneWay(36, 15, 5);
  g2.fillRect(48, 10, 2, 4, 'M');
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(58), y: groundY(14), label: 'ORBIT TREASURE' });

  g2.oneWay(70, 16, 14);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(77), y: groundY(16), label: 'SAUSAGE PAL' });

  g2.oneWay(74, 9, 14);
  g2.fillRect(78, 6, 1, 3, 'S');
  addSecretEye(s2, 2, 82, 9, 6, 'ORBIT SECRET 3');

  addTotem(s2, 95, f2, 'none', 'EJECT ROCKET');
  addSafeTrail(g2, s2, 'big_topping', 24, 5, 14, 4);
  addSafeTrail(g2, s2, 'big_topping', 44, 5, 11, 4);
  addSafeTrail(g2, s2, 'small_topping', 46, 14, f2, 3);
  s2.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(32), y: groundY(13) });
  s2.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(64), y: groundY(12) });
  s2.push({ kind: 'enemy', archetype: 'static_minion', x: px(78), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'space_r2',
    name: 'Orbit Nine — Satellite Ring',
    theme: 'orbit',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'spc_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(112),
        targetY: groundY(f1),
        requireUp: false,
        label: 'WARP: TUNNEL',
      },
      {
        id: 'spc_2_to_3',
        x: px(105),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'WARP: LUNAR CORE',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Lunar Core Sanctum (80x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(80, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  addTotem(s3, 11, f3, 'rocket', 'ROCKET RIDE');
  g3.fillRect(24, 14, 2, 4, 'M');
  g3.oneWay(28, 12, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(34), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.fillRect(44, 14, 2, 4, 'M');
  addTotem(s3, 55, f3, 'none', 'EJECT ROCKET');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(68), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 16, 10, f3, 4);
  s3.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(34), y: groundY(15) });
  s3.push({ kind: 'enemy', archetype: 'ufo_olive', x: px(50), y: groundY(14) });

  const room3: RoomDef = {
    id: 'space_r3',
    name: 'Orbit Nine — Lunar Core',
    theme: 'orbit',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'spc_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(102),
        targetY: groundY(f2),
        requireUp: false,
        label: 'WARP: ESCAPE!',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('space_s1', 'Orbit Secret 1 — Rocket Lane', 'orbit', 0, 0, px(70), groundY(9), 'gimmick_dash', 'ufo_olive', 'rocket');
  const sec2 = buildSecretRoom('space_s2', 'Orbit Secret 2 — Zero-G Leap', 'orbit', 1, 1, px(84), groundY(9), 'slope_jump', 'static_minion');
  const sec3 = buildSecretRoom('space_s3', 'Orbit Secret 3 — Thruster Shaft', 'orbit', 2, 2, px(76), groundY(9), 'superjump_vault', 'ufo_olive');

  return {
    id: 'space',
    name: 'Orbit Nine',
    subtitle: 'Rocket Ride Boost Tunnels, Saucer Swarms & Planetary Warps',
    floor: 3,
    theme: 'orbit',
    music: 'stage_orbit',
    sRankScore: 20000,
    escapeSeconds: 185,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Rocket Ride Tunnels & Planetary Warp Doors',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 3 STAGE 4: MINIGOLF — Turbo Links (Multi-Room Par Fairways!)
// Oracle: sRankScore = 23000, escapeSeconds = 270
// ============================================================================
function buildMinigolfLevel(): LevelDef {
  // ---- Room 0: Hole 1 — Clubhouse Fairway (108x22) ----
  const f0 = 18;
  const g0 = new RoomGrid(108, 22, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT TURBO LINKS' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });

  // Hole #1: Tee at x=16 -> smooth rolling hills + Marble bunker -> Flagstick Goal at x=86!
  s0.push({ kind: 'prop', propKind: 'golf_ball', index: 0, x: px(16), y: groundY(f0), label: 'GREASEBALL #1' });
  g0.slope26UpRight(26, f0, 2);
  g0.plateau(30, 16, 14, f0);
  g0.fillRect(36, 13, 2, 3, 'm'); // Smashable Marble bunker!
  g0.slope26DownRight(44, 16, 2);
  g0.fillRect(58, 15, 2, 3, 'm');
  s0.push({ kind: 'prop', propKind: 'golf_goal', index: 0, x: px(86), y: groundY(f0), label: 'HOLE 1 (PAR 3)' });

  // Clubhouse balcony: Toppin #0 & Secret Eye #1
  g0.oneWay(32, 11, 14);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(39), y: groundY(11), label: 'SHROOM PAL' });
  g0.oneWay(66, 10, 14);
  g0.fillRect(70, 7, 1, 3, 'S');
  addSecretEye(s0, 0, 74, 10, 4, 'LINKS SECRET 1');
  g0.fillRect(72, 14, 2, 4, 'P');

  addSafeTrail(g0, s0, 'small_topping', 19, 14, f0, 3);
  addSafeTrail(g0, s0, 'big_topping', 31, 5, 15, 3);
  addSafeTrail(g0, s0, 'big_topping', 64, 6, f0, 3);
  s0.push({ kind: 'enemy', archetype: 'burger_golfer', x: px(41), y: groundY(16) });
  s0.push({ kind: 'enemy', archetype: 'burger_golfer', x: px(66), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'slime_glob', x: px(78), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'minigolf_r0',
    name: 'Turbo Links — Hole 1 Fairway',
    theme: 'golf',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'glf_0_to_1',
        x: px(105),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'HOLE 2 HILLS',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Hole 2 — Rolling Hills & Elevated Green (116x24) ----
  const f1 = 20;
  const g1 = new RoomGrid(116, 24, f1);
  const s1: RoomEntitySpawn[] = [];

  // Hole #2: Kick ball up rolling 26.5° fairway hill onto elevated Green at x=94!
  s1.push({ kind: 'prop', propKind: 'golf_ball', index: 1, x: px(14), y: groundY(f1), label: 'GREASEBALL #2' });
  g1.slope26UpRight(24, f1, 3); // rises to 17
  g1.plateau(30, 17, 16, f1);
  g1.fillRect(38, 14, 2, 3, 'm');
  g1.slope26DownRight(46, 17, 3); // back to 20
  g1.slope26UpRight(62, f1, 2); // rises to 18
  g1.plateau(66, 18, 34, f1);
  g1.fillRect(76, 15, 2, 3, 'm');
  s1.push({ kind: 'prop', propKind: 'golf_goal', index: 1, x: px(94), y: groundY(18), label: 'HOLE 2 (PAR 3)' });
  g1.slope45DownRight(100, 18, 2);

  // Fairway grandstands: Toppin #1, Toppin #2, Gerry, Secret #2
  g1.oneWay(30, 12, 14);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(37), y: groundY(12), label: 'CHEESE PAL' });
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(57), y: groundY(f1), label: 'JANITOR GERRY' });
  g1.oneWay(68, 12, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(76), y: groundY(12), label: 'TOMATO PAL' });
  g1.oneWay(84, 9, 12);
  g1.fillRect(88, 6, 1, 3, 'S');
  addSecretEye(s1, 1, 92, 9, 5, 'LINKS SECRET 2');

  addSafeTrail(g1, s1, 'big_topping', 31, 5, 16, 3);
  addSafeTrail(g1, s1, 'big_topping', 68, 7, 17, 3);
  addSafeTrail(g1, s1, 'small_topping', 18, 12, f1, 3);
  s1.push({ kind: 'enemy', archetype: 'burger_golfer', x: px(35), y: groundY(17) });
  s1.push({ kind: 'enemy', archetype: 'archer_goblin', x: px(54), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'burger_golfer', x: px(84), y: groundY(18) });

  const room1: RoomDef = {
    id: 'minigolf_r1',
    name: 'Turbo Links — Hole 2 Rolling Hills',
    theme: 'golf',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'glf_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(102),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO HOLE 1',
      },
      {
        id: 'glf_1_to_2',
        x: px(113),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'HOLE 3 CHAMPIONSHIP',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Hole 3 — Championship Bunker & Trophy Pavilion (112x24) ----
  const f2 = 20;
  const g2 = new RoomGrid(112, 24, f2);
  const s2: RoomEntitySpawn[] = [];

  s2.push({ kind: 'prop', propKind: 'golf_ball', index: 2, x: px(14), y: groundY(f2), label: 'GREASEBALL #3' });
  // Lob-shot hurdle over a low bunker wall & sand trap!
  g2.plateau(30, 18, 6, f2);
  g2.oneWay(40, 17, 8);
  g2.fillRect(42, f2, 4, 1, '^'); // Water/spike trap under bridge!
  g2.fillRect(42, 15, 6, 1, 'O');
  g2.slope26UpRight(54, f2, 2);
  g2.plateau(58, 18, 36, f2);
  g2.fillRect(68, 15, 2, 3, 'm');
  s2.push({ kind: 'prop', propKind: 'golf_goal', index: 2, x: px(88), y: groundY(18), label: 'HOLE 3 (PAR 3)' });
  g2.slope45DownRight(94, 18, 2);

  // Trophy Pavilion above fairway: Treasure Chest, Toppin #3, Secret #3
  g2.oneWay(54, 11, 22);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(64), y: groundY(11), label: 'LINKS TROPHY' });
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(72), y: groundY(11), label: 'SAUSAGE PAL' });

  g2.oneWay(80, 9, 14);
  g2.fillRect(84, 6, 1, 3, 'S');
  addSecretEye(s2, 2, 88, 9, 6, 'LINKS SECRET 3');

  addSafeTrail(g2, s2, 'big_topping', 56, 6, 11, 3);
  addSafeTrail(g2, s2, 'big_topping', 60, 7, 17, 4);
  addSafeTrail(g2, s2, 'small_topping', 18, 10, f2, 3);
  s2.push({ kind: 'enemy', archetype: 'burger_golfer', x: px(33), y: groundY(18) });
  s2.push({ kind: 'enemy', archetype: 'burger_golfer', x: px(76), y: groundY(18) });
  s2.push({ kind: 'enemy', archetype: 'archer_goblin', x: px(98), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'minigolf_r2',
    name: 'Turbo Links — Hole 3 Championship',
    theme: 'golf',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'glf_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(110),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO HOLE 2',
      },
      {
        id: 'glf_2_to_3',
        x: px(109),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(16),
        requireUp: false,
        label: '18TH HOLE SANCTUM',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: 18th Hole Sanctum (82x20) ----
  const f3 = 16;
  const g3 = new RoomGrid(82, 20, f3);
  const s3: RoomEntitySpawn[] = [];

  s3.push({ kind: 'prop', propKind: 'golf_ball', index: 3, x: px(14), y: groundY(f3), label: 'CHAMPION BALL' });
  g3.oneWay(22, 12, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(28), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.fillRect(36, 13, 2, 3, 'm');
  s3.push({ kind: 'prop', propKind: 'golf_goal', index: 3, x: px(56), y: groundY(f3), label: '18TH HOLE!' });
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(70), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 18, 9, f3, 4);
  s3.push({ kind: 'enemy', archetype: 'burger_golfer', x: px(45), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'minigolf_r3',
    name: 'Turbo Links — 18th Hole Sanctum',
    theme: 'golf',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'glf_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(106),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('minigolf_s1', 'Links Secret 1 — Fairway Dash', 'golf', 0, 0, px(68), groundY(10), 'marble_dash', 'burger_golfer');
  const sec2 = buildSecretRoom('minigolf_s2', 'Links Secret 2 — Bunker Leap', 'golf', 1, 1, px(86), groundY(9), 'slope_jump', 'archer_goblin');
  const sec3 = buildSecretRoom('minigolf_s3', 'Links Secret 3 — Caddy Loft', 'golf', 2, 2, px(82), groundY(9), 'superjump_vault', 'burger_golfer');

  return {
    id: 'minigolf',
    name: 'Turbo Links',
    subtitle: 'Multi-Room Greaseball Golf Fairways & Par Bonuses',
    floor: 3,
    theme: 'golf',
    music: 'stage_golf',
    sRankScore: 23000,
    escapeSeconds: 270,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Greaseball Golf Par Holes & Fairway Hazards',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 4 STAGE 1: STREET — Hog Metro (Taxi Warps + Gusto & Chonks Subway!)
// Oracle: sRankScore = 20000, escapeSeconds = 190
// ============================================================================
function buildStreetLevel(): LevelDef {
  // ---- Room 0: Neon Downtown & Express Cab Plaza (106x24) ----
  const f0 = 20;
  const g0 = new RoomGrid(106, 24, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT HOG METRO' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });

  // City blocks + Taxi Cab warping straight up to the Penthouse Rooftop!
  g0.slope26UpRight(16, f0, 2);
  g0.plateau(20, 18, 14, f0);
  g0.fillRect(26, 15, 2, 3, 'm');
  g0.slope45DownRight(34, 18, 2);

  s0.push({
    kind: 'prop',
    propKind: 'taxi_warp',
    x: px(42),
    y: groundY(f0),
    targetRoomIndex: 0,
    targetX: px(54),
    targetY: groundY(10),
    label: 'CAB TO ROOFTOP',
  });

  // Elevated Neon Rooftop Block (row 10): Toppin #0 + Secret Eye #1 + Return Cab!
  g0.fillRect(48, 10, 32, 1, '#');
  g0.oneWay(44, 15, 4);
  g0.oneWay(44, 12, 4);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(62), y: groundY(10), label: 'SHROOM PAL' });
  g0.fillRect(72, 7, 1, 3, 'S');
  addSecretEye(s0, 0, 76, 10, 4, 'METRO SECRET 1');

  // Buddy Switch introducing Gusto & Chonks right before Subway Tunnel!
  s0.push({
    kind: 'prop',
    propKind: 'buddy_switch',
    x: px(92),
    y: groundY(f0),
    riderTarget: 'gusto_chonks',
    label: 'TAG IN GUSTO & CHONKS!',
  });

  g0.fillRect(58, 16, 2, 4, 'M');
  g0.fillRect(74, 16, 2, 4, 'P');
  addSafeTrail(g0, s0, 'small_topping', 14, 10, f0, 2);
  addSafeTrail(g0, s0, 'big_topping', 54, 6, 10, 3);
  addSafeTrail(g0, s0, 'big_topping', 64, 5, f0, 4);
  s0.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(29), y: groundY(18) });
  s0.push({ kind: 'enemy', archetype: 'pickle_brawler', x: px(66), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'static_minion', x: px(84), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'street_r0',
    name: 'Hog Metro — Neon Downtown',
    theme: 'metro',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'str_0_to_1',
        x: px(103),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'SUBWAY EXPRESS',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Subway Express (Gusto & Chonks!) (116x24) ----
  const f1 = 20;
  const g1 = new RoomGrid(116, 24, f1);
  const s1: RoomEntitySpawn[] = [];

  // Subway Metal turnstiles smashed by Gusto & Chonks + Express Cab to Mezzanine!
  g1.fillRect(18, 16, 2, 4, 'M');
  g1.fillRect(32, 16, 2, 4, 'M');
  g1.fillRect(46, 16, 2, 4, 'M');

  s1.push({
    kind: 'prop',
    propKind: 'taxi_warp',
    x: px(25),
    y: groundY(f1),
    targetRoomIndex: 1,
    targetX: px(62),
    targetY: groundY(11),
    label: 'EXPRESS MEZZANINE CAB',
  });

  // Subway Mezzanine Deck: Toppin #1, Toppin #2, Secret #2
  g1.oneWay(26, 13, 14);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(33), y: groundY(13), label: 'CHEESE PAL' });
  g1.fillRect(58, 11, 28, 1, '#');
  g1.oneWay(52, 16, 5);
  g1.oneWay(52, 13, 5);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(70), y: groundY(11), label: 'TOMATO PAL' });
  g1.fillRect(78, 8, 1, 3, 'S');
  addSecretEye(s1, 1, 82, 11, 5, 'METRO SECRET 2');

  // Lower subway platform: Janitor Gerry
  g1.fillRect(66, 17, 1, 3, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(71), y: groundY(f1), label: 'JANITOR GERRY' });

  g1.slope45UpRight(84, f1, 3);
  g1.plateau(87, 17, 14, f1);
  g1.fillRect(93, 13, 2, 4, 'M');
  g1.slope45DownRight(101, 17, 3);

  addSafeTrail(g1, s1, 'big_topping', 22, 7, f1, 6);
  addSafeTrail(g1, s1, 'big_topping', 60, 5, 11, 3);
  addSafeTrail(g1, s1, 'small_topping', 88, 6, 17, 2);
  s1.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(40), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'pickle_brawler', x: px(58), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'static_minion', x: px(78), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(96), y: groundY(17), escapeOnly: true });

  const room1: RoomDef = {
    id: 'street_r1',
    name: 'Hog Metro — Gusto Subway Express',
    theme: 'metro',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    allowRider: 'gusto_chonks',
    doors: [
      {
        id: 'str_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(100),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO DOWNTOWN',
      },
      {
        id: 'str_1_to_2',
        x: px(113),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'UPTOWN OVERPASS',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Uptown Metro Overpass (Gusto & Chonks + Cross-Town Cab!) (108x24) ----
  const f2 = 20;
  const g2 = new RoomGrid(108, 24, f2);
  const s2: RoomEntitySpawn[] = [];

  g2.fillRect(18, 16, 2, 4, 'M');
  s2.push({
    kind: 'prop',
    propKind: 'taxi_warp',
    x: px(26),
    y: groundY(f2),
    targetRoomIndex: 2,
    targetX: px(60),
    targetY: groundY(12),
    label: 'CAB TO TREASURY DECK',
  });

  g2.fillRect(46, 12, 26, 1, '#');
  g2.oneWay(40, 16, 5);
  g2.oneWay(40, 13, 5);
  g2.fillRect(52, 8, 2, 4, 'M');
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(64), y: groundY(12), label: 'METRO TREASURE' });

  g2.oneWay(74, 14, 14);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(81), y: groundY(14), label: 'SAUSAGE PAL' });

  g2.oneWay(76, 8, 14);
  g2.fillRect(80, 5, 1, 3, 'S');
  addSecretEye(s2, 2, 84, 8, 6, 'METRO SECRET 3');

  g2.fillRect(52, 16, 16, 1, 'O');
  s2.push({
    kind: 'prop',
    propKind: 'buddy_switch',
    x: px(94),
    y: groundY(f2),
    riderTarget: 'peppo',
    label: 'TAG BACK SOLO!',
  });

  addSafeTrail(g2, s2, 'big_topping', 48, 6, 12, 3);
  addSafeTrail(g2, s2, 'big_topping', 32, 10, f2, 5);
  s2.push({ kind: 'enemy', archetype: 'pickle_brawler', x: px(36), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(62), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'static_minion', x: px(84), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'street_r2',
    name: 'Hog Metro — Uptown Overpass',
    theme: 'metro',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    allowRider: 'gusto_chonks',
    doors: [
      {
        id: 'str_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(110),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO SUBWAY',
      },
      {
        id: 'str_2_to_3',
        x: px(105),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(16),
        requireUp: false,
        label: 'GRAND CENTRAL',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Grand Central Sanctum (80x20) ----
  const f3 = 16;
  const g3 = new RoomGrid(80, 20, f3);
  const s3: RoomEntitySpawn[] = [];

  g3.oneWay(18, 12, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(24), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.fillRect(36, 12, 2, 4, 'M');
  g3.fillRect(48, 12, 2, 4, 'm');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(68), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 14, 10, f3, 4);
  s3.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(32), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'pickle_brawler', x: px(55), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'street_r3',
    name: 'Hog Metro — Grand Central',
    theme: 'metro',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'str_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(102),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('street_s1', 'Metro Secret 1 — Alley Dash', 'metro', 0, 0, px(68), groundY(10), 'marble_dash', 'ninja_slice');
  const sec2 = buildSecretRoom('street_s2', 'Metro Secret 2 — Rooftop Leap', 'metro', 1, 1, px(74), groundY(11), 'slope_jump', 'pickle_brawler');
  const sec3 = buildSecretRoom('street_s3', 'Metro Secret 3 — Subway Shaft', 'metro', 2, 2, px(78), groundY(8), 'superjump_vault', 'static_minion');

  return {
    id: 'street',
    name: 'Hog Metro',
    subtitle: 'Express Taxi Warps & Gusto & Chonks Subway Dash',
    floor: 4,
    theme: 'metro',
    music: 'stage_metro',
    sRankScore: 20000,
    escapeSeconds: 190,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Express Taxi Warps & Gusto & Chonks Subway Rooms',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 4 STAGE 2: SEWER — Sludge Drain (Sticky-Cheese + Trash-Can Roll + Ninjas!)
// Oracle: sRankScore = 20000, escapeSeconds = 275
// ============================================================================
function buildSewerLevel(): LevelDef {
  // ---- Room 0: Storm Grate Intake (104x24) ----
  const f0 = 20;
  const g0 = new RoomGrid(104, 24, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT SLUDGE DRAIN' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'cheese_sticky', 'STICKY CHEESE');

  // Vertical CHEESE_STICK_WALL ('C') chimney to cling & wall-jump up!
  g0.fillRect(24, 9, 1, 10, 'C');
  g0.fillRect(32, 9, 1, 10, 'C');
  g0.oneWay(25, 17, 7);
  g0.oneWay(25, 13, 7);
  g0.oneWay(25, 9, 18);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(37), y: groundY(9), label: 'SHROOM PAL' });

  // Ninja Slice parry dojo runway below
  g0.fillRect(46, 16, 2, 4, 'm');
  addTotem(s0, 56, f0, 'none', 'WASH OFF CHEESE');
  g0.oneWay(68, 11, 14);
  g0.fillRect(72, 8, 1, 3, 'S');
  addSecretEye(s0, 0, 76, 11, 4, 'DRAIN SECRET 1');
  g0.fillRect(74, 16, 2, 4, 'P');

  addSafeTrail(g0, s0, 'big_topping', 26, 5, 9, 3);
  addSafeTrail(g0, s0, 'small_topping', 36, 14, f0, 3);
  s0.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(42), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(64), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'slime_glob', x: px(84), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'sewer_r0',
    name: 'Sludge Drain — Storm Grate Intake',
    theme: 'drain',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'swr_0_to_1',
        x: px(101),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'PIPEWORKS ROLL',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Pipeworks & Trash-Can Roll Tunnel (114x26) ----
  const f1 = 22;
  const g1 = new RoomGrid(114, 26, f1);
  const s1: RoomEntitySpawn[] = [];

  // Low 32px-clearance drainage pipe built for Trash-Can Roll!
  addTotem(s1, 12, f1, 'trash_roll', 'TRASH-CAN ROLL');
  g1.fillRect(18, 20, 24, 1, '#'); // Leaves exact 1-tile (32px) crouch/trash_roll duct at row 21!
  g1.fillRect(28, 21, 2, 1, 'm'); // Smashable Marble drain plug!
  g1.fillRect(36, 21, 2, 1, 'm');
  g1.oneWay(18, 16, 24);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(30), y: groundY(16), label: 'CHEESE PAL' });

  // Mid-room Cheese Stick tower leading up to Toppin #2 & Secret #2!
  addTotem(s1, 48, f1, 'cheese_sticky', 'STICKY CHEESE');
  g1.fillRect(56, 10, 1, 11, 'C');
  g1.fillRect(64, 10, 1, 11, 'C');
  g1.oneWay(57, 18, 7);
  g1.oneWay(57, 14, 7);
  g1.oneWay(57, 10, 20);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(68), y: groundY(10), label: 'TOMATO PAL' });
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(72), y: groundY(f1), label: 'JANITOR GERRY' });

  g1.oneWay(80, 9, 14);
  g1.fillRect(84, 6, 1, 3, 'S');
  addSecretEye(s1, 1, 88, 9, 5, 'DRAIN SECRET 2');

  addTotem(s1, 98, f1, 'none', 'RESET FORM');
  addSafeTrail(g1, s1, 'small_topping', 19, 10, f1, 2);
  addSafeTrail(g1, s1, 'big_topping', 58, 6, 10, 3);
  addSafeTrail(g1, s1, 'big_topping', 76, 5, f1, 4);
  s1.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(45), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(82), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'mushroom_spitter', x: px(92), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'sewer_r1',
    name: 'Sludge Drain — Pipeworks Roll',
    theme: 'drain',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'swr_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(98),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO INTAKE',
      },
      {
        id: 'swr_1_to_2',
        x: px(111),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'DEEP CISTERN',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Deep Cistern (Cheese Walls + Trash-Roll Vault) (108x26) ----
  const f2 = 22;
  const g2 = new RoomGrid(108, 26, f2);
  const s2: RoomEntitySpawn[] = [];

  addTotem(s2, 11, f2, 'cheese_sticky', 'STICKY CHEESE');
  g2.fillRect(20, 10, 1, 11, 'C');
  g2.fillRect(28, 10, 1, 11, 'C');
  g2.oneWay(21, 18, 7);
  g2.oneWay(21, 14, 7);
  g2.oneWay(21, 10, 24);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(36), y: groundY(10), label: 'DRAIN TREASURE' });

  addTotem(s2, 48, f2, 'trash_roll', 'TRASH-CAN ROLL');
  g2.fillRect(54, 20, 22, 1, '#'); // Low drain pipe
  g2.fillRect(62, 21, 2, 1, 'm');
  g2.oneWay(56, 14, 18);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(65), y: groundY(14), label: 'SAUSAGE PAL' });

  g2.oneWay(78, 9, 14);
  g2.fillRect(82, 6, 1, 3, 'S');
  addSecretEye(s2, 2, 86, 9, 6, 'DRAIN SECRET 3');
  g2.fillRect(80, 16, 14, 1, 'O');
  addTotem(s2, 95, f2, 'none', 'RESET FORM');

  addSafeTrail(g2, s2, 'big_topping', 24, 6, 10, 3);
  addSafeTrail(g2, s2, 'small_topping', 55, 10, f2, 2);
  addSafeTrail(g2, s2, 'big_topping', 80, 5, f2, 4);
  s2.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(40), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(84), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'slime_glob', x: px(68), y: groundY(14) });

  const room2: RoomDef = {
    id: 'sewer_r2',
    name: 'Sludge Drain — Deep Cistern',
    theme: 'drain',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'swr_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(108),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO PIPEWORKS',
      },
      {
        id: 'swr_2_to_3',
        x: px(105),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'SUMP SANCTUM',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Sump Sanctum (Ninja Duel Arena!) (80x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(80, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  g3.oneWay(20, 13, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(26), y: groundY(13), label: 'PINEAPPLE PAL' });
  g3.fillRect(38, 14, 2, 4, 'm');
  g3.fillRect(50, 14, 2, 4, 'M');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(68), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 14, 10, f3, 4);
  s3.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(32), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(46), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(58), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'sewer_r3',
    name: 'Sludge Drain — Sump Sanctum',
    theme: 'drain',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'swr_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(102),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('sewer_s1', 'Drain Secret 1 — Trash Roll', 'drain', 0, 0, px(70), groundY(11), 'marble_dash', 'ninja_slice', 'trash_roll');
  const sec2 = buildSecretRoom('sewer_s2', 'Drain Secret 2 — Cistern Leap', 'drain', 1, 1, px(82), groundY(9), 'slope_jump', 'slime_glob');
  const sec3 = buildSecretRoom('sewer_s3', 'Drain Secret 3 — Cheese Shaft', 'drain', 2, 2, px(80), groundY(9), 'vertical_shaft', 'ninja_slice', 'cheese_sticky');

  return {
    id: 'sewer',
    name: 'Sludge Drain',
    subtitle: 'Sticky-Cheese Wall Clings, Trash-Can Pipes & Ninja Duels',
    floor: 4,
    theme: 'drain',
    music: 'stage_drain',
    sRankScore: 20000,
    escapeSeconds: 275,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Sticky-Cheese Wall Cling, Trash-Can Roll & Ninja Duels',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 4 STAGE 3: INDUSTRIAL — Bot Foundry (Boxed Flat Vents & Conveyors!)
// Oracle: sRankScore = 20000, escapeSeconds = 230
// ============================================================================
function buildIndustrialLevel(): LevelDef {
  // ---- Room 0: Assembly Line Alpha (106x24) ----
  const f0 = 20;
  const g0 = new RoomGrid(106, 24, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT BOT FOUNDRY' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });

  // Fast CONVEYOR_RIGHT ('>') & opposing CONVEYOR_LEFT ('<') assembly belts!
  g0.fillRect(14, f0, 24, 1, '>');
  g0.fillRect(42, f0, 22, 1, '<');
  g0.fillRect(68, f0, 22, 1, '>');

  // Boxed Flat air-vent glide duct on upper catwalk!
  addTotem(s0, 14, f0, 'boxed_flat', 'BOXED FLAT');
  g0.oneWay(22, 16, 12);
  g0.fillRect(36, 14, 24, 1, '#');
  g0.fillRect(38, 12, 18, 1, '#'); // Exact 32px (1-tile) Boxed Flat air-vent at row 13!
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(58), y: groundY(14), label: 'SHROOM PAL' });

  g0.oneWay(70, 10, 14);
  g0.fillRect(74, 7, 1, 3, 'S');
  addSecretEye(s0, 0, 78, 10, 4, 'FOUNDRY SECRET 1');
  g0.fillRect(64, 16, 2, 4, 'M');
  addTotem(s0, 94, f0, 'none', 'UNBOX FORM');

  addSafeTrail(g0, s0, 'small_topping', 16, 12, f0, 2);
  addSafeTrail(g0, s0, 'big_topping', 38, 6, 14, 3);
  addSafeTrail(g0, s0, 'big_topping', 68, 5, f0, 4);
  s0.push({ kind: 'enemy', archetype: 'clone_bot', x: px(30), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'clone_bot', x: px(52), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(82), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'industrial_r0',
    name: 'Bot Foundry — Assembly Line Alpha',
    theme: 'foundry',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'ind_0_to_1',
        x: px(103),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'AIR-VENT PRESS ROOM',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Air-Vent Press Room & Gliding Shafts (116x26) ----
  const f1 = 22;
  const g1 = new RoomGrid(116, 26, f1);
  const s1: RoomEntitySpawn[] = [];

  g1.fillRect(14, f1, 20, 1, '>');
  g1.fillRect(54, f1, 20, 1, '<');
  g1.fillRect(78, f1, 24, 1, '>');

  // Spike crusher pit crossed via Boxed Flat gentle flutter-glide!
  addTotem(s1, 14, f1, 'boxed_flat', 'BOXED FLAT');
  g1.oneWay(22, 18, 10);
  g1.oneWay(30, 14, 8);
  g1.fillRect(36, f1, 14, 1, '^');
  g1.oneWay(36, 18, 14);
  g1.fillRect(36, 15, 14, 1, 'O'); // Escape bridge!
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(43), y: groundY(12), label: 'CHEESE PAL' });
  g1.oneWay(39, 12, 8);

  // Upper press-room duct + Gerry + Toppin #2 + Secret #2
  g1.fillRect(56, 13, 22, 1, '#');
  g1.fillRect(58, 11, 16, 1, '#'); // 32px air-vent!
  g1.oneWay(52, 16, 4);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(76), y: groundY(13), label: 'TOMATO PAL' });
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(64), y: groundY(f1), label: 'JANITOR GERRY' });

  g1.oneWay(82, 9, 14);
  g1.fillRect(86, 6, 1, 3, 'S');
  addSecretEye(s1, 1, 90, 9, 5, 'FOUNDRY SECRET 2');

  addTotem(s1, 102, f1, 'none', 'UNBOX FORM');
  addSafeTrail(g1, s1, 'big_topping', 36, 6, 14, 3);
  addSafeTrail(g1, s1, 'big_topping', 58, 6, 13, 3);
  addSafeTrail(g1, s1, 'small_topping', 78, 10, f1, 2);
  s1.push({ kind: 'enemy', archetype: 'clone_bot', x: px(28), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'clone_bot', x: px(68), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'bomb_imp', x: px(88), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'industrial_r1',
    name: 'Bot Foundry — Air-Vent Press Room',
    theme: 'foundry',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'ind_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(100),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO ASSEMBLY LINE',
      },
      {
        id: 'ind_1_to_2',
        x: px(113),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'SMELTER CONVEYORS',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Smelter Conveyor Hall (108x24) ----
  const f2 = 20;
  const g2 = new RoomGrid(108, 24, f2);
  const s2: RoomEntitySpawn[] = [];

  g2.fillRect(14, f2, 24, 1, '>');
  g2.fillRect(42, f2, 24, 1, '<');
  g2.fillRect(70, f2, 24, 1, '>');
  g2.fillRect(28, 16, 2, 4, 'M');
  g2.fillRect(54, 16, 2, 4, 'M');

  // Boxed Flat duct leading straight into Smelter Treasury!
  addTotem(s2, 40, f2, 'boxed_flat', 'BOXED FLAT');
  g2.oneWay(42, 16, 6);
  g2.fillRect(48, 13, 24, 1, '#');
  g2.fillRect(50, 11, 14, 1, '#');
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(68), y: groundY(13), label: 'FOUNDRY TREASURE' });

  g2.oneWay(74, 14, 14);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(81), y: groundY(14), label: 'SAUSAGE PAL' });

  g2.oneWay(76, 8, 14);
  g2.fillRect(80, 5, 1, 3, 'S');
  addSecretEye(s2, 2, 84, 8, 6, 'FOUNDRY SECRET 3');
  g2.fillRect(74, 16, 2, 4, 'P');
  addTotem(s2, 96, f2, 'none', 'UNBOX FORM');

  addSafeTrail(g2, s2, 'big_topping', 50, 5, 13, 3);
  addSafeTrail(g2, s2, 'small_topping', 18, 16, f2, 4);
  s2.push({ kind: 'enemy', archetype: 'clone_bot', x: px(22), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'clone_bot', x: px(62), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(86), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'industrial_r2',
    name: 'Bot Foundry — Smelter Conveyors',
    theme: 'foundry',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'ind_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(110),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO PRESS ROOM',
      },
      {
        id: 'ind_2_to_3',
        x: px(105),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(16),
        requireUp: false,
        label: 'CORE FURNACE',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Core Furnace Sanctum (80x20) ----
  const f3 = 16;
  const g3 = new RoomGrid(80, 20, f3);
  const s3: RoomEntitySpawn[] = [];

  g3.fillRect(14, f3, 44, 1, '>');
  g3.oneWay(20, 12, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(26), y: groundY(12), label: 'PINEAPPLE PAL' });
  g3.fillRect(38, 12, 2, 4, 'M');
  g3.fillRect(50, 12, 2, 4, 'm');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(68), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 16, 10, f3, 4);
  s3.push({ kind: 'enemy', archetype: 'clone_bot', x: px(32), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'clone_bot', x: px(45), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'clone_bot', x: px(57), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'industrial_r3',
    name: 'Bot Foundry — Core Furnace',
    theme: 'foundry',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'ind_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(102),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('industrial_s1', 'Foundry Secret 1 — Belt Blitz', 'foundry', 0, 0, px(72), groundY(10), 'marble_dash', 'clone_bot');
  const sec2 = buildSecretRoom('industrial_s2', 'Foundry Secret 2 — Vent Glide', 'foundry', 1, 1, px(84), groundY(9), 'vertical_shaft', 'bomb_imp', 'boxed_flat');
  const sec3 = buildSecretRoom('industrial_s3', 'Foundry Secret 3 — Press Shaft', 'foundry', 2, 2, px(78), groundY(8), 'superjump_vault', 'clone_bot');

  return {
    id: 'industrial',
    name: 'Bot Foundry',
    subtitle: 'Boxed Flat Air-Vent Glides, Assembly Lines & Clone Ambushes',
    floor: 4,
    theme: 'foundry',
    music: 'stage_foundry',
    sRankScore: 20000,
    escapeSeconds: 230,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Boxed Flat Air-Vents & Opposing Conveyor Lines',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 4 STAGE 4: FREEZER — Sub-Zero Vault (Inferno Pepper + Slick Ice Slopes!)
// Oracle: sRankScore = 18200, escapeSeconds = 220
// ============================================================================
function buildFreezerLevel(): LevelDef {
  // ---- Room 0: Frost Lock Entry (104x24) ----
  const f0 = 20;
  const g0 = new RoomGrid(104, 24, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT SUB-ZERO VAULT' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'inferno_pepper', 'INFERNO PEPPER');

  // Slippery ICE_SOLID floor + overhead ice ceiling melted during Inferno Pepper flight!
  g0.fillRect(16, f0, 74, 1, 'I');
  g0.slope26UpRight(20, f0, 3);
  g0.plateau(26, 17, 14, f0, 'I');
  g0.slope45DownRight(40, 17, 3);

  // Overhead ice barrier loft burned upward via Inferno Pepper!
  g0.fillRect(46, 13, 14, 1, 'I');
  g0.oneWay(46, 9, 14);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(53), y: groundY(9), label: 'SHROOM PAL' });

  g0.oneWay(70, 9, 14);
  g0.fillRect(74, 6, 1, 3, 'S');
  addSecretEye(s0, 0, 78, 9, 4, 'VAULT SECRET 1');
  g0.fillRect(72, 16, 2, 4, 'P');

  addSafeTrail(g0, s0, 'big_topping', 27, 4, 16, 3);
  addSafeTrail(g0, s0, 'big_topping', 48, 4, 9, 3);
  addSafeTrail(g0, s0, 'small_topping', 48, 12, f0, 3);
  s0.push({ kind: 'enemy', archetype: 'fake_santa', x: px(34), y: groundY(17) });
  s0.push({ kind: 'enemy', archetype: 'swedish_ape', x: px(58), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'fake_santa', x: px(84), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'freezer_r0',
    name: 'Sub-Zero Vault — Frost Lock Entry',
    theme: 'freezer',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'frz_0_to_1',
        x: px(101),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(15),
        requireUp: false,
        label: 'GLACIAL CHASM',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Glacial Chasm — Ice Slopes & Inferno Flight-Burn (114x26) ----
  const f1 = 22;
  const g1 = new RoomGrid(114, 26, f1);
  const s1: RoomEntitySpawn[] = [];

  g1.plateau(1, 15, 11, f1);
  addTotem(s1, 9, 15, 'inferno_pepper', 'INFERNO PEPPER');
  g1.slope45DownRight(12, 15, 7); // Huge 7-tile glacial plunge to row 22!
  g1.fillRect(19, f1, 86, 1, 'I');

  // Suspended ice ceilings to fly-burn straight through!
  g1.fillRect(30, 15, 14, 1, 'I');
  g1.oneWay(30, 11, 14);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(37), y: groundY(11), label: 'CHEESE PAL' });

  g1.fillRect(54, 18, 2, 4, 'I');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(60), y: groundY(f1), label: 'JANITOR GERRY' });
  g1.fillRect(56, 13, 16, 1, 'I');
  g1.oneWay(56, 9, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(64), y: groundY(9), label: 'TOMATO PAL' });

  g1.oneWay(78, 8, 14);
  g1.fillRect(82, 5, 1, 3, 'S');
  addSecretEye(s1, 1, 86, 8, 5, 'VAULT SECRET 2');
  g1.fillRect(74, 15, 14, 1, 'O');

  addSafeTrail(g1, s1, 'big_topping', 32, 4, 11, 3);
  addSafeTrail(g1, s1, 'big_topping', 58, 5, 9, 3);
  addSafeTrail(g1, s1, 'small_topping', 24, 16, f1, 4);
  s1.push({ kind: 'enemy', archetype: 'fake_santa', x: px(46), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'clone_bot', x: px(72), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'fake_santa', x: px(92), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'freezer_r1',
    name: 'Sub-Zero Vault — Glacial Chasm',
    theme: 'freezer',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(15),
    doors: [
      {
        id: 'frz_1_to_0',
        x: px(2),
        y: groundY(15),
        targetRoomIndex: 0,
        targetX: px(98),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO FROST LOCK',
      },
      {
        id: 'frz_1_to_2',
        x: px(111),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'CRYO-CHAMBER',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Cryo-Chamber Slopes & Thermal Chimney (108x26) ----
  const f2 = 22;
  const g2 = new RoomGrid(108, 26, f2);
  const s2: RoomEntitySpawn[] = [];

  g2.fillRect(10, f2, 90, 1, 'I');
  addTotem(s2, 12, f2, 'inferno_pepper', 'INFERNO PEPPER');
  g2.slope26UpRight(18, f2, 3);
  g2.plateau(24, 19, 14, f2, 'I');
  g2.slope45DownRight(38, 19, 3);

  // Thermal ice chimney leading up to Treasure Chest & Toppin #3!
  g2.fillRect(48, 15, 18, 1, 'I');
  g2.oneWay(48, 10, 18);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(57), y: groundY(10), label: 'VAULT TREASURE' });

  g2.oneWay(70, 14, 14);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(77), y: groundY(14), label: 'SAUSAGE PAL' });

  g2.oneWay(76, 8, 14);
  g2.fillRect(80, 5, 1, 3, 'S');
  addSecretEye(s2, 2, 84, 8, 6, 'VAULT SECRET 3');
  g2.fillRect(74, 18, 2, 4, 'P');

  addSafeTrail(g2, s2, 'big_topping', 50, 5, 10, 3);
  addSafeTrail(g2, s2, 'small_topping', 44, 14, f2, 3);
  s2.push({ kind: 'enemy', archetype: 'fake_santa', x: px(32), y: groundY(19) });
  s2.push({ kind: 'enemy', archetype: 'fake_santa', x: px(64), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'swedish_ape', x: px(88), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'freezer_r2',
    name: 'Sub-Zero Vault — Cryo-Chamber',
    theme: 'freezer',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'frz_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(108),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO CHASM',
      },
      {
        id: 'frz_2_to_3',
        x: px(105),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'DEEP-FREEZE SANCTUM',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Deep-Freeze Sanctum (80x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(80, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  g3.fillRect(10, f3, 62, 1, 'I');
  addTotem(s3, 12, f3, 'inferno_pepper', 'INFERNO PEPPER');
  g3.fillRect(22, 13, 12, 1, 'I');
  g3.oneWay(22, 9, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(28), y: groundY(9), label: 'PINEAPPLE PAL' });
  g3.fillRect(42, 14, 2, 4, 'I');
  g3.fillRect(52, 14, 2, 4, 'M');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(68), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 16, 10, f3, 4);
  s3.push({ kind: 'enemy', archetype: 'fake_santa', x: px(36), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'fake_santa', x: px(57), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'freezer_r3',
    name: 'Sub-Zero Vault — Deep-Freeze Sanctum',
    theme: 'freezer',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'frz_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(102),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('freezer_s1', 'Vault Secret 1 — Ice Slide', 'freezer', 0, 0, px(72), groundY(9), 'slope_jump', 'swedish_ape');
  const sec2 = buildSecretRoom('freezer_s2', 'Vault Secret 2 — Thermal Burn', 'freezer', 1, 1, px(80), groundY(8), 'vertical_shaft', 'fake_santa', 'inferno_pepper');
  const sec3 = buildSecretRoom('freezer_s3', 'Vault Secret 3 — Glacial Vault', 'freezer', 2, 2, px(78), groundY(8), 'superjump_vault', 'clone_bot');

  return {
    id: 'freezer',
    name: 'Sub-Zero Vault',
    subtitle: 'Inferno Pepper Flight-Burns, Slick Ice Slopes & Frosty Drops',
    floor: 4,
    theme: 'freezer',
    music: 'stage_freezer',
    sRankScore: 18200,
    escapeSeconds: 220,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Inferno Pepper Flight & Slippery Ice Slopes',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 5 STAGE 1: CHATEAU — Spook Manor (Exorcist Cross + Rolling Ramp Balls!)
// Oracle: sRankScore = 18000, escapeSeconds = 210
// ============================================================================
function buildChateauLevel(): LevelDef {
  // ---- Room 0: Grand Haunted Foyer (104x24) ----
  const f0 = 20;
  const g0 = new RoomGrid(104, 24, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT SPOOK MANOR' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });
  addTotem(s0, 14, f0, 'cross', 'EXORCIST CROSS');

  // Haunted halls swarming with Crypt Ghouls vaporized by Cross aura!
  g0.slope26UpRight(20, f0, 3);
  g0.plateau(26, 17, 16, f0);
  g0.fillRect(34, 13, 2, 4, 'm');
  g0.slope45DownRight(42, 17, 3);

  // Chandelier rafters: Toppin #0 & Secret Eye #1
  g0.oneWay(26, 11, 18);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(35), y: groundY(11), label: 'SHROOM PAL' });
  g0.oneWay(68, 10, 14);
  g0.fillRect(72, 7, 1, 3, 'S');
  addSecretEye(s0, 0, 76, 10, 4, 'MANOR SECRET 1');
  g0.fillRect(72, 16, 2, 4, 'P');

  addSafeTrail(g0, s0, 'big_topping', 28, 5, 11, 3);
  addSafeTrail(g0, s0, 'small_topping', 16, 14, f0, 3);
  addSafeTrail(g0, s0, 'big_topping', 54, 6, f0, 5);
  s0.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(28), y: groundY(14) });
  s0.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(48), y: groundY(14) });
  s0.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(62), y: groundY(15) });
  s0.push({ kind: 'enemy', archetype: 'knight_squire', x: px(82), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'chateau_r0',
    name: 'Spook Manor — Grand Foyer',
    theme: 'manor',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'cht_0_to_1',
        x: px(101),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(14),
        requireUp: false,
        label: 'HAUNTED RAMPS',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Haunted Ramp Gallery — Rolling Ramp Balls + Cross Purge (116x24) ----
  const f1 = 20;
  const g1 = new RoomGrid(116, 24, f1);
  const s1: RoomEntitySpawn[] = [];

  g1.plateau(1, 14, 12, f1);
  addTotem(s1, 9, 14, 'ball', 'ROLLING RAMP BALL');
  g1.slope45DownRight(13, 14, 6); // Steep haunted staircase ball plunge to row 20!

  g1.fillRect(24, 16, 2, 4, 'M');
  g1.fillRect(36, 16, 2, 4, 'M');
  g1.fillRect(48, 16, 2, 4, 'm');
  addTotem(s1, 56, f1, 'cross', 'EXORCIST CROSS');

  // Upper haunted gallery: Toppin #1, Toppin #2, Gerry, Secret #2
  g1.oneWay(24, 12, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(32), y: groundY(12), label: 'CHEESE PAL' });
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(66), y: groundY(f1), label: 'JANITOR GERRY' });
  g1.oneWay(60, 12, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(68), y: groundY(12), label: 'TOMATO PAL' });

  g1.oneWay(82, 9, 14);
  g1.fillRect(86, 6, 1, 3, 'S');
  addSecretEye(s1, 1, 90, 9, 5, 'MANOR SECRET 2');
  g1.fillRect(72, 15, 14, 1, 'O');

  addSafeTrail(g1, s1, 'big_topping', 20, 8, f1, 5);
  addSafeTrail(g1, s1, 'big_topping', 62, 5, 12, 3);
  s1.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(62), y: groundY(15) });
  s1.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(76), y: groundY(14) });
  s1.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(92), y: groundY(15) });
  s1.push({ kind: 'enemy', archetype: 'ninja_slice', x: px(102), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'chateau_r1',
    name: 'Spook Manor — Haunted Ramp Gallery',
    theme: 'manor',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(14),
    doors: [
      {
        id: 'cht_1_to_0',
        x: px(2),
        y: groundY(14),
        targetRoomIndex: 0,
        targetX: px(98),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO FOYER',
      },
      {
        id: 'cht_1_to_2',
        x: px(113),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'PHANTOM BALLROOM',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Phantom Ballroom (108x26) ----
  const f2 = 22;
  const g2 = new RoomGrid(108, 26, f2);
  const s2: RoomEntitySpawn[] = [];

  addTotem(s2, 11, f2, 'cross', 'EXORCIST CROSS');
  g2.slope26UpRight(18, f2, 3);
  g2.plateau(24, 19, 14, f2);
  addTotem(s2, 34, 19, 'ball', 'ROLLING RAMP BALL');
  g2.slope45DownRight(38, 19, 3);

  // Metal ballroom vault smashed by Ramp Ball -> Treasure Chest!
  g2.fillRect(48, 17, 2, 5, 'M');
  g2.fillRect(62, 17, 2, 5, 'M');
  g2.fillRect(48, 16, 16, 1, '#');
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(56), y: groundY(f2), label: 'MANOR TREASURE' });

  addTotem(s2, 68, f2, 'cross', 'EXORCIST CROSS');
  g2.oneWay(50, 11, 18);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(59), y: groundY(11), label: 'SAUSAGE PAL' });

  g2.oneWay(76, 9, 14);
  g2.fillRect(80, 6, 1, 3, 'S');
  addSecretEye(s2, 2, 84, 9, 6, 'MANOR SECRET 3');
  g2.fillRect(74, 15, 14, 1, 'O');

  addSafeTrail(g2, s2, 'big_topping', 52, 5, 11, 3);
  addSafeTrail(g2, s2, 'small_topping', 70, 12, f2, 2);
  s2.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(28), y: groundY(15) });
  s2.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(76), y: groundY(16) });
  s2.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(90), y: groundY(15) });
  s2.push({ kind: 'enemy', archetype: 'knight_squire', x: px(86), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'chateau_r2',
    name: 'Spook Manor — Phantom Ballroom',
    theme: 'manor',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'cht_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(110),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO RAMPS',
      },
      {
        id: 'cht_2_to_3',
        x: px(105),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'MANOR CRYPT',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Manor Crypt Sanctum (80x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(80, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  addTotem(s3, 12, f3, 'cross', 'EXORCIST CROSS');
  g3.oneWay(22, 13, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(28), y: groundY(13), label: 'PINEAPPLE PAL' });
  g3.fillRect(42, 14, 2, 4, 'm');
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(68), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 16, 10, f3, 4);
  s3.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(32), y: groundY(14) });
  s3.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(48), y: groundY(13) });
  s3.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(58), y: groundY(14) });

  const room3: RoomDef = {
    id: 'chateau_r3',
    name: 'Spook Manor — Manor Crypt',
    theme: 'manor',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'cht_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(102),
        targetY: groundY(f2),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('chateau_s1', 'Manor Secret 1 — Ghost Purge', 'manor', 0, 0, px(70), groundY(10), 'marble_dash', 'ghost_ghoul', 'cross');
  const sec2 = buildSecretRoom('chateau_s2', 'Manor Secret 2 — Ramp Ball Run', 'manor', 1, 1, px(84), groundY(9), 'gimmick_dash', 'knight_squire', 'ball');
  const sec3 = buildSecretRoom('chateau_s3', 'Manor Secret 3 — Belltower Vault', 'manor', 2, 2, px(78), groundY(9), 'superjump_vault', 'ghost_ghoul');

  return {
    id: 'chateau',
    name: 'Spook Manor',
    subtitle: 'Exorcist Cross Ghost-Purges, Rolling Ramp Balls & Haunted Halls',
    floor: 5,
    theme: 'manor',
    music: 'stage_manor',
    sRankScore: 18000,
    escapeSeconds: 210,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Exorcist Cross Aura & Rolling Ramp Balls',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 5 STAGE 2: KIDSPARTY — Silent Arcade (Alarm Sensors + Escape Shotgun Payback!)
// Oracle: sRankScore = 22000, escapeSeconds = 205
// ============================================================================
function buildKidsPartyLevel(): LevelDef {
  // ---- Room 0: Prize Lobby & Stealth Sensor Zone (106x24) ----
  const f0 = 20;
  const g0 = new RoomGrid(106, 24, f0);
  const s0: RoomEntitySpawn[] = [];

  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: 'EXIT SILENT ARCADE' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(8), y: groundY(f0), label: 'LAP 2 PORTAL' });

  // Alarm Sensor patrol zone with stealth upper catwalk bypass!
  s0.push({ kind: 'prop', propKind: 'alarm_sensor', x: px(28), y: groundY(f0), label: 'ALARM SENSOR 1' });
  g0.oneWay(22, 15, 16);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(30), y: groundY(15), label: 'SHROOM PAL' });

  s0.push({ kind: 'prop', propKind: 'alarm_sensor', x: px(58), y: groundY(f0), label: 'ALARM SENSOR 2' });
  g0.oneWay(52, 14, 16);
  g0.fillRect(68, 16, 2, 4, 'm');
  g0.fillRect(76, 16, 2, 4, 'P');

  g0.oneWay(74, 10, 14);
  g0.fillRect(78, 7, 1, 3, 'S');
  addSecretEye(s0, 0, 82, 10, 4, 'ARCADE SECRET 1');

  // Escape payback Shotgun totem unlocks once Pillar breaks!
  addTotem(s0, 92, f0, 'shotgun', 'PAYBACK SHOTGUN', true);

  addSafeTrail(g0, s0, 'big_topping', 23, 5, 15, 3);
  addSafeTrail(g0, s0, 'big_topping', 53, 5, 14, 3);
  addSafeTrail(g0, s0, 'small_topping', 14, 16, f0, 4);
  s0.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(38), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(64), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'static_minion', x: px(84), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(48), y: groundY(f0), escapeOnly: true });

  const room0: RoomDef = {
    id: 'kidsparty_r0',
    name: 'Silent Arcade — Prize Lobby',
    theme: 'arcade',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: 'kid_0_to_1',
        x: px(103),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'MASCOT PATROL HALL',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Mascot Patrol Hall (3 Sensor Zones + Ceiling Stealth!) (116x26) ----
  const f1 = 22;
  const g1 = new RoomGrid(116, 26, f1);
  const s1: RoomEntitySpawn[] = [];

  s1.push({ kind: 'prop', propKind: 'alarm_sensor', x: px(22), y: groundY(f1), label: 'SENSOR ALPHA' });
  g1.oneWay(16, 17, 16);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(24), y: groundY(17), label: 'CHEESE PAL' });

  s1.push({ kind: 'prop', propKind: 'alarm_sensor', x: px(52), y: groundY(f1), label: 'SENSOR BETA' });
  g1.oneWay(44, 15, 20);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(54), y: groundY(15), label: 'TOMATO PAL' });
  g1.fillRect(64, 19, 1, 3, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(68), y: groundY(f1), label: 'JANITOR GERRY' });

  s1.push({ kind: 'prop', propKind: 'alarm_sensor', x: px(84), y: groundY(f1), label: 'SENSOR GAMMA' });
  g1.oneWay(76, 12, 16);
  g1.oneWay(82, 8, 14);
  g1.fillRect(86, 5, 1, 3, 'S');
  addSecretEye(s1, 1, 90, 8, 5, 'ARCADE SECRET 2');

  g1.fillRect(72, 16, 14, 1, 'O');
  addTotem(s1, 102, f1, 'shotgun', 'PAYBACK SHOTGUN', true);

  addSafeTrail(g1, s1, 'big_topping', 18, 5, 17, 3);
  addSafeTrail(g1, s1, 'big_topping', 46, 6, 15, 3);
  addSafeTrail(g1, s1, 'small_topping', 28, 16, f1, 4);
  s1.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(34), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(60), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(94), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'clone_bot', x: px(78), y: groundY(12) });

  const room1: RoomDef = {
    id: 'kidsparty_r1',
    name: 'Silent Arcade — Mascot Patrol Hall',
    theme: 'arcade',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    doors: [
      {
        id: 'kid_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(100),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO PRIZE LOBBY',
      },
      {
        id: 'kid_1_to_2',
        x: px(113),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(22),
        requireUp: false,
        label: 'BACKSTAGE ARCADE',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Backstage Arcade Vault (108x26) ----
  const f2 = 22;
  const g2 = new RoomGrid(108, 26, f2);
  const s2: RoomEntitySpawn[] = [];

  s2.push({ kind: 'prop', propKind: 'alarm_sensor', x: px(26), y: groundY(f2), label: 'VAULT SENSOR 1' });
  g2.slope26UpRight(32, f2, 3);
  g2.plateau(38, 19, 18, f2);
  g2.fillRect(46, 15, 2, 4, 'M');
  g2.slope26DownRight(56, 19, 3);

  g2.oneWay(40, 12, 22);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(50), y: groundY(12), label: 'ARCADE TREASURE' });
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(58), y: groundY(12), label: 'SAUSAGE PAL' });

  s2.push({ kind: 'prop', propKind: 'alarm_sensor', x: px(74), y: groundY(f2), label: 'VAULT SENSOR 2' });
  g2.oneWay(74, 9, 14);
  g2.fillRect(78, 6, 1, 3, 'S');
  addSecretEye(s2, 2, 82, 9, 6, 'ARCADE SECRET 3');
  g2.fillRect(70, 18, 2, 4, 'P');
  addTotem(s2, 94, f2, 'shotgun', 'PAYBACK SHOTGUN', true);

  addSafeTrail(g2, s2, 'big_topping', 41, 6, 12, 3);
  addSafeTrail(g2, s2, 'small_topping', 14, 16, f2, 5);
  s2.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(20), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(42), y: groundY(19) });
  s2.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(84), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'kidsparty_r2',
    name: 'Silent Arcade — Backstage Vault',
    theme: 'arcade',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: 'kid_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(110),
        targetY: groundY(f1),
        requireUp: false,
        label: 'TO PATROL HALL',
      },
      {
        id: 'kid_2_to_3',
        x: px(105),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'SHOWSTAGE SANCTUM',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Showstage Sanctum (Shotgun Unlocks RIGHT When Pillar Shatters!) (82x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(82, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  s3.push({ kind: 'prop', propKind: 'alarm_sensor', x: px(22), y: groundY(f3), label: 'STAGE SENSOR' });
  g3.oneWay(18, 13, 16);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(26), y: groundY(13), label: 'PINEAPPLE PAL' });
  g3.fillRect(42, 14, 2, 4, 'M');

  // Escape-only Shotgun Payback Totem spawns RIGHT beside Pillar Chronos the moment it shatters!
  addTotem(s3, 58, f3, 'shotgun', 'PAYBACK SHOTGUN!', true);
  s3.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(70), y: groundY(f3), label: 'PILLAR CHRONOS' });

  addSafeTrail(g3, s3, 'big_topping', 16, 10, f3, 4);
  s3.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(34), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(50), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'animatronic_bot', x: px(46), y: groundY(f3), escapeOnly: true });

  const room3: RoomDef = {
    id: 'kidsparty_r3',
    name: 'Silent Arcade — Showstage Sanctum',
    theme: 'arcade',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    doors: [
      {
        id: 'kid_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(102),
        targetY: groundY(f2),
        requireUp: false,
        label: 'PAYBACK ESCAPE!',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('kidsparty_s1', 'Arcade Secret 1 — Prize Dash', 'arcade', 0, 0, px(76), groundY(10), 'marble_dash', 'static_minion');
  const sec2 = buildSecretRoom('kidsparty_s2', 'Arcade Secret 2 — Ticket Leap', 'arcade', 1, 1, px(84), groundY(8), 'slope_jump', 'clone_bot');
  const sec3 = buildSecretRoom('kidsparty_s3', 'Arcade Secret 3 — Crane Vault', 'arcade', 2, 2, px(76), groundY(9), 'superjump_vault', 'animatronic_bot', 'shotgun');

  return {
    id: 'kidsparty',
    name: 'Silent Arcade',
    subtitle: 'Alarm Sensor Patrols & Escape Shotgun Payback',
    floor: 5,
    theme: 'arcade',
    music: 'stage_arcade',
    sRankScore: 22000,
    escapeSeconds: 205,
    hasPillar: true,
    hasLap2: true,
    featuredGimmick: 'Alarm Sensors & Pillar-Break Shotgun Payback',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// FLOOR 5 STAGE 3: WAR — BLITZ ZONE (4 Relentless War-Trench Rooms + Permanent Shotgun!)
// Oracle: sRankScore = 21500, escapeSeconds = 60 (+30s Time Terminals!), warTimerMode = true
// ============================================================================
function buildWarLevel(): LevelDef {
  // ---- Room 0: Trench Sector 1 (106x22) ----
  const f0 = 18;
  const g0 = new RoomGrid(106, 22, f0);
  const s0: RoomEntitySpawn[] = [];

  // Immediate live countdown — blast barricades & hit Time Terminal #1 (+30s)!
  g0.fillRect(18, 14, 2, 4, 'm');
  g0.fillRect(30, 14, 2, 4, 'M');
  g0.fillRect(38, f0, 4, 1, '^');
  g0.oneWay(37, 15, 6);
  s0.push({ kind: 'prop', propKind: 'time_terminal', x: px(48), y: groundY(f0), label: 'TIME TERMINAL +30S' });

  g0.oneWay(22, 12, 12);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(28), y: groundY(12), label: 'SHROOM PAL' });

  g0.slope26UpRight(54, f0, 2);
  g0.plateau(58, 16, 16, f0);
  g0.fillRect(64, 12, 2, 4, 'M');
  g0.slope45DownRight(74, 16, 2);

  g0.oneWay(76, 10, 14);
  g0.fillRect(80, 7, 1, 3, 'S');
  addSecretEye(s0, 0, 84, 10, 4, 'BLITZ SECRET 1');

  addSafeTrail(g0, s0, 'big_topping', 12, 12, f0, 6);
  addSafeTrail(g0, s0, 'big_topping', 59, 5, 16, 3);
  s0.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(25), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(61), y: groundY(16) });
  s0.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(71), y: groundY(16) });
  s0.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(88), y: groundY(f0) });

  const room0: RoomDef = {
    id: 'war_r0',
    name: 'BLITZ ZONE — Trench Sector 1',
    theme: 'blitz',
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    isEscapeChase: true,
    doors: [
      {
        id: 'war_0_to_1',
        x: px(103),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'SECTOR 2 BUNKERS',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Bunker Sector 2 (110x24) ----
  const f1 = 20;
  const g1 = new RoomGrid(110, 24, f1);
  const s1: RoomEntitySpawn[] = [];

  g1.fillRect(16, 16, 2, 4, 'M');
  g1.fillRect(32, 16, 2, 4, 'M');
  g1.oneWay(20, 14, 14);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(27), y: groundY(14), label: 'CHEESE PAL' });

  // Multi-tier concrete bunker + Time Terminal #2 (+30s) + Gerry + Toppin #2!
  g1.fillRect(42, 14, 24, 1, '#');
  g1.oneWay(37, 17, 5);
  s1.push({ kind: 'prop', propKind: 'time_terminal', x: px(54), y: groundY(14), label: 'TIME TERMINAL +30S' });
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(56), y: groundY(f1), label: 'JANITOR GERRY' });
  g1.oneWay(68, 13, 12);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(74), y: groundY(13), label: 'TOMATO PAL' });

  g1.oneWay(80, 9, 14);
  g1.fillRect(84, 6, 1, 3, 'S');
  addSecretEye(s1, 1, 88, 9, 5, 'BLITZ SECRET 2');

  g1.fillRect(82, 16, 2, 4, 'M');
  addSafeTrail(g1, s1, 'big_topping', 44, 6, 14, 3);
  addSafeTrail(g1, s1, 'big_topping', 20, 12, f1, 6);
  s1.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(24), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(46), y: groundY(14) });
  s1.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(74), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: 'clone_bot', x: px(94), y: groundY(f1) });

  const room1: RoomDef = {
    id: 'war_r1',
    name: 'BLITZ ZONE — Bunker Sector 2',
    theme: 'blitz',
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    isEscapeChase: true,
    doors: [
      {
        id: 'war_1_to_0',
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(100),
        targetY: groundY(f0),
        requireUp: false,
        label: 'SECTOR 1',
      },
      {
        id: 'war_1_to_2',
        x: px(107),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(20),
        requireUp: false,
        label: 'SECTOR 3 RIDGE',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Artillery Ridge — Sector 3 (110x24) ----
  const f2 = 20;
  const g2 = new RoomGrid(110, 24, f2);
  const s2: RoomEntitySpawn[] = [];

  g2.slope45UpRight(14, f2, 4);
  g2.plateau(18, 16, 20, f2);
  g2.fillRect(26, 12, 2, 4, 'M');
  s2.push({ kind: 'prop', propKind: 'time_terminal', x: px(34), y: groundY(16), label: 'TIME TERMINAL +30S' });
  g2.slope45DownRight(38, 16, 4);

  // Metal Ammo Depot holding Treasure Chest & Toppin #3!
  g2.fillRect(50, 15, 2, 5, 'M');
  g2.fillRect(66, 15, 2, 5, 'M');
  g2.fillRect(50, 14, 18, 1, '#');
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(59), y: groundY(f2), label: 'WAR CHEST' });
  g2.oneWay(52, 10, 16);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(60), y: groundY(10), label: 'SAUSAGE PAL' });

  g2.oneWay(76, 9, 14);
  g2.fillRect(80, 6, 1, 3, 'S');
  addSecretEye(s2, 2, 84, 9, 6, 'BLITZ SECRET 3');
  g2.fillRect(86, 16, 2, 4, 'M');

  addSafeTrail(g2, s2, 'big_topping', 19, 5, 16, 3);
  addSafeTrail(g2, s2, 'big_topping', 53, 5, 10, 3);
  addSafeTrail(g2, s2, 'big_topping', 72, 6, f2, 4);
  s2.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(22), y: groundY(16) });
  s2.push({ kind: 'enemy', archetype: 'cannon_goblin', x: px(74), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(94), y: groundY(f2) });

  const room2: RoomDef = {
    id: 'war_r2',
    name: 'BLITZ ZONE — Artillery Ridge',
    theme: 'blitz',
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    isEscapeChase: true,
    doors: [
      {
        id: 'war_2_to_1',
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(104),
        targetY: groundY(f1),
        requireUp: false,
        label: 'SECTOR 2',
      },
      {
        id: 'war_2_to_3',
        x: px(107),
        y: groundY(f2),
        targetRoomIndex: 3,
        targetX: px(5),
        targetY: groundY(18),
        requireUp: false,
        label: 'WARHEAD SILO',
      },
    ],
    spawns: s2,
  };

  // ---- Room 3: Warhead Silo — Sector 4 (Final Charge + Lap 2 + Exit!) (94x22) ----
  const f3 = 18;
  const g3 = new RoomGrid(94, 22, f3);
  const s3: RoomEntitySpawn[] = [];

  g3.fillRect(16, 14, 2, 4, 'M');
  g3.fillRect(30, 14, 2, 4, 'M');
  g3.oneWay(20, 12, 12);
  s3.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(26), y: groundY(12), label: 'PINEAPPLE PAL' });
  s3.push({ kind: 'prop', propKind: 'time_terminal', x: px(44), y: groundY(f3), label: 'FINAL TERMINAL +30S' });
  g3.fillRect(54, 14, 2, 4, 'M');
  g3.fillRect(64, 14, 2, 4, 'M');

  s3.push({ kind: 'prop', propKind: 'lap2_portal', x: px(76), y: groundY(f3), label: 'LAP 2 BLITZ!' });
  s3.push({ kind: 'prop', propKind: 'exit_door', x: px(86), y: groundY(f3), label: 'FINISH BLITZ ZONE!' });

  addSafeTrail(g3, s3, 'big_topping', 12, 12, f3, 5);
  s3.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(24), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(38), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'clone_bot', x: px(60), y: groundY(f3) });
  s3.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(70), y: groundY(f3) });

  const room3: RoomDef = {
    id: 'war_r3',
    name: 'BLITZ ZONE — Warhead Silo',
    theme: 'blitz',
    widthTiles: g3.w,
    heightTiles: g3.h,
    rows: g3.toRows(),
    spawnX: px(5),
    spawnY: groundY(f3),
    isEscapeChase: true,
    doors: [
      {
        id: 'war_3_to_2',
        x: px(2),
        y: groundY(f3),
        targetRoomIndex: 2,
        targetX: px(104),
        targetY: groundY(f2),
        requireUp: false,
        label: 'SECTOR 3',
      },
    ],
    spawns: s3,
  };

  const sec1 = buildSecretRoom('war_s1', 'Blitz Secret 1 — Ammo Bunker', 'blitz', 0, 0, px(78), groundY(10), 'marble_dash', 'blitz_trooper');
  const sec2 = buildSecretRoom('war_s2', 'Blitz Secret 2 — Trench Jump', 'blitz', 1, 1, px(82), groundY(9), 'slope_jump', 'cannon_goblin');
  const sec3 = buildSecretRoom('war_s3', 'Blitz Secret 3 — Silo Vault', 'blitz', 2, 2, px(78), groundY(9), 'superjump_vault', 'clone_bot');

  return {
    id: 'war',
    name: 'BLITZ ZONE',
    subtitle: 'Permanent Shotgun & 60s Live Fuse — Blast Time Terminals (+30s)!',
    floor: 5,
    theme: 'blitz',
    music: 'stage_blitz',
    sRankScore: 21500,
    escapeSeconds: 60,
    hasPillar: false,
    hasLap2: true,
    warTimerMode: true,
    featuredGimmick: 'Permanent Shotgun, 60s War Fuse & +30s Time Terminals',
    rooms: [room0, room1, room2, room3, sec1, sec2, sec3],
  };
}

// ============================================================================
// GRAND FINALE: EXIT — The Crumbling Spire (5-Room Nonstop Tower Collapse Sprint!)
// Oracle: sRankScore = 5500, escapeSeconds = 338, hasPillar: false, hasLap2: false
// ============================================================================
function buildExitFinaleLevel(): LevelDef {
  const configs: Array<{
    name: string;
    theme: RoomThemeId;
    surface?: 'I' | '>';
    hazard?: 'L' | '^';
    enemyA: EnemyArchetypeId;
    enemyB: EnemyArchetypeId;
    toppinIdx: number;
    toppinLabel: string;
    hasGerry?: boolean;
    isFinal?: boolean;
  }> = [
    {
      name: 'The Crumbling Spire — Floor 5 Penthouse Collapse',
      theme: 'spire',
      enemyA: 'blitz_trooper',
      enemyB: 'ghost_ghoul',
      toppinIdx: 0,
      toppinLabel: 'RESCUE SHROOM PAL!',
    },
    {
      name: 'The Crumbling Spire — Floor 4 Foundry Meltdown',
      theme: 'foundry',
      surface: '>',
      enemyA: 'clone_bot',
      enemyB: 'ninja_slice',
      toppinIdx: 1,
      toppinLabel: 'RESCUE CHEESE PAL!',
      hasGerry: true,
    },
    {
      name: 'The Crumbling Spire — Floor 3 Resort Plunge',
      theme: 'pier',
      enemyA: 'cannon_goblin',
      enemyB: 'ufo_olive',
      toppinIdx: 2,
      toppinLabel: 'RESCUE TOMATO PAL!',
    },
    {
      name: 'The Crumbling Spire — Floor 2 Canyon Earthquake',
      theme: 'mesa',
      hazard: 'L',
      enemyA: 'cow_charger',
      enemyB: 'tribal_cheese',
      toppinIdx: 3,
      toppinLabel: 'RESCUE SAUSAGE PAL!',
    },
    {
      name: 'The Crumbling Spire — Floor 1 Front Door Sprint!',
      theme: 'spire',
      enemyA: 'knight_squire',
      enemyB: 'fork_imp',
      toppinIdx: 4,
      toppinLabel: 'RESCUE PINEAPPLE PAL!',
      isFinal: true,
    },
  ];

  const f = 18;
  const rooms: RoomDef[] = configs.map((cfg, idx) => {
    const w = cfg.isFinal ? 104 : 96;
    const g = new RoomGrid(w, 22, f);
    const s: RoomEntitySpawn[] = [];

    // High collapsing balcony plunging straight into a Mach 4 rubble runway!
    g.plateau(1, 14, 10, f);
    g.slope45DownRight(11, 14, 4); // x=11..14 drops to row 18!

    if (cfg.surface) {
      g.fillRect(16, f, 26, 1, cfg.surface);
    }

    // Explosive Marble & Metal collapse rubble walls
    g.fillRect(22, 14, 2, 4, 'm');
    g.fillRect(34, 14, 2, 4, 'M');

    if (cfg.hazard) {
      g.fillRect(40, f, 5, 1, cfg.hazard);
      g.oneWay(39, 15, 7);
    }

    // Heroic mid-run ramp rescuing Toppin Pal Ally on the fly!
    g.slope26UpRight(48, f, 2);
    g.plateau(52, 16, 14, f);
    s.push({
      kind: 'prop',
      propKind: 'toppin_cage',
      index: cfg.toppinIdx,
      x: px(59),
      y: groundY(16),
      label: cfg.toppinLabel,
    });
    g.slope45DownRight(66, 16, 2);
    g.fillRect(74, 14, 2, 4, 'm');
    g.fillRect(82, 14, 2, 4, 'M');

    if (cfg.hasGerry) {
      s.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(70), y: groundY(f), label: 'RESCUE JANITOR GERRY!' });
    }

    if (cfg.isFinal) {
      s.push({
        kind: 'prop',
        propKind: 'exit_door',
        x: px(97),
        y: groundY(f),
        label: 'TOWER FRONT DOOR — ESCAPE!',
      });
    }

    addSafeTrail(g, s, 'small_topping', 15, 10, f, 2);
    addSafeTrail(g, s, 'big_topping', 53, 4, 16, 3);
    addSafeTrail(g, s, 'big_topping', 70, 5, f, 4);
    s.push({ kind: 'enemy', archetype: cfg.enemyA, x: px(28), y: groundY(f) });
    s.push({ kind: 'enemy', archetype: cfg.enemyB, x: px(63), y: groundY(16) });
    s.push({ kind: 'enemy', archetype: cfg.enemyA, x: px(79), y: groundY(f) });

    return {
      id: `exit_r${idx}`,
      name: cfg.name,
      theme: cfg.theme,
      widthTiles: g.w,
      heightTiles: g.h,
      rows: g.toRows(),
      spawnX: px(4),
      spawnY: groundY(14),
      isEscapeChase: true,
      doors: cfg.isFinal
        ? []
        : [
            {
              id: `exit_${idx}_to_${idx + 1}`,
              x: px(w - 3),
              y: groundY(f),
              targetRoomIndex: idx + 1,
              targetX: px(4),
              targetY: groundY(14),
              requireUp: false,
              label: `FLOOR ${4 - idx} DESCENT!`,
            },
          ],
      spawns: s,
    };
  });

  return {
    id: 'exit',
    name: 'The Crumbling Spire',
    subtitle: 'Grand Finale — Rescue Allies & Outrun the Tower Collapse!',
    floor: 5,
    theme: 'spire',
    music: 'escape_spire',
    sRankScore: 5500,
    escapeSeconds: 338,
    hasPillar: false,
    hasLap2: false,
    featuredGimmick: '5-Floor Continuous Tower-Collapse Ally Rescue Sprint',
    rooms,
  };
}

// ============================================================================
// BONUS MODE 1: SECRETWORLD — Secrets of the Tower (8-Course Continuous Gauntlet!)
// Oracle: sRankScore = 38000, escapeSeconds = 0, secretGauntletMode = true
// ============================================================================
function buildSecretWorldLevel(): LevelDef {
  const f = 16;
  const trials: Array<{
    name: string;
    theme: RoomThemeId;
    totem?: TransformationId;
    enemyA: EnemyArchetypeId;
    enemyB: EnemyArchetypeId;
    gimmick: 'marble' | 'knight_slope' | 'lava_boost' | 'ghost_ring' | 'saloon_gate' | 'rocket_lane' | 'foundry_belt' | 'grand_vault';
    toppinIdx?: number;
    hasGerry?: boolean;
    hasTreasure?: boolean;
  }> = [
    { name: 'Trial 1 — Crypt Marble Blitz', theme: 'secret', enemyA: 'slime_glob', enemyB: 'fork_imp', gimmick: 'marble', toppinIdx: 0 },
    { name: 'Trial 2 — Keep Knight Joust', theme: 'keep', totem: 'knight', enemyA: 'knight_squire', enemyB: 'fork_imp', gimmick: 'knight_slope' },
    { name: 'Trial 3 — Magma Fire-Butt Ascent', theme: 'catacombs', enemyA: 'pepper_goblin', enemyB: 'bomb_imp', gimmick: 'lava_boost', toppinIdx: 1 },
    { name: 'Trial 4 — Bone Crypt Flight', theme: 'graveyard', totem: 'ghost', enemyA: 'ghost_ghoul', enemyB: 'ghost_ghoul', gimmick: 'ghost_ring' },
    { name: 'Trial 5 — Saloon Speed Gates', theme: 'saloon', enemyA: 'tribal_cheese', enemyB: 'cow_charger', gimmick: 'saloon_gate', toppinIdx: 2, hasGerry: true },
    { name: 'Trial 6 — Orbit Rocket Tunnel', theme: 'orbit', totem: 'rocket', enemyA: 'ufo_olive', enemyB: 'static_minion', gimmick: 'rocket_lane', toppinIdx: 3 },
    { name: 'Trial 7 — Foundry Conveyor & Vents', theme: 'foundry', enemyA: 'clone_bot', enemyB: 'ninja_slice', gimmick: 'foundry_belt', hasTreasure: true },
    { name: 'Trial 8 — Tower Grand Vault', theme: 'secret', enemyA: 'pickle_brawler', enemyB: 'blitz_trooper', gimmick: 'grand_vault', toppinIdx: 4 },
  ];

  const rooms: RoomDef[] = trials.map((tr, idx) => {
    const isLast = idx === trials.length - 1;
    const w = 80;
    const g = new RoomGrid(w, 20, f);
    const s: RoomEntitySpawn[] = [];

    const spawnRow = tr.gimmick === 'knight_slope' ? 11 : f;

    if (tr.totem) {
      addTotem(s, 8, spawnRow, tr.totem, tr.totem.toUpperCase());
    }

    switch (tr.gimmick) {
      case 'marble': {
        g.fillRect(16, 12, 2, 4, 'm');
        g.fillRect(28, 12, 2, 4, 'M');
        g.fillRect(42, 12, 2, 4, 'm');
        g.fillRect(56, 12, 2, 4, 'M');
        g.oneWay(20, 10, 36);
        addSafeTrail(g, s, 'big_topping', 12, 16, f, 4);
        addSafeTrail(g, s, 'big_topping', 22, 10, 10, 3);
        break;
      }
      case 'knight_slope': {
        g.plateau(1, 11, 14, f);
        g.slope45DownRight(15, 11, 5);
        g.fillRect(28, 12, 2, 4, 'M');
        g.fillRect(40, 12, 2, 4, 'M');
        g.fillRect(54, 12, 2, 4, 'M');
        addSafeTrail(g, s, 'big_topping', 21, 14, f, 3);
        break;
      }
      case 'lava_boost': {
        g.fillRect(20, f, 6, 1, 'L');
        g.oneWay(19, 13, 8);
        g.fillRect(21, 9, 4, 1, 'M');
        g.oneWay(18, 6, 36);
        g.fillRect(46, f, 6, 1, 'L');
        g.oneWay(45, 13, 8);
        addSafeTrail(g, s, 'big_topping', 20, 11, 6, 3);
        addSafeTrail(g, s, 'big_topping', 14, 14, f, 4);
        break;
      }
      case 'ghost_ring': {
        g.fillRect(16, f, 44, 1, '^');
        g.oneWay(16, 13, 44);
        g.oneWay(22, 8, 32);
        addSafeTrail(g, s, 'big_topping', 18, 14, 12, 3);
        addSafeTrail(g, s, 'big_topping', 23, 10, 8, 3);
        break;
      }
      case 'saloon_gate': {
        s.push({ kind: 'prop', propKind: 'dash_button', x: px(14), y: groundY(f), label: 'OPEN GATE 1' });
        g.fillRect(32, 12, 1, 4, 'G');
        s.push({ kind: 'prop', propKind: 'dash_button', x: px(42), y: groundY(f), label: 'OPEN GATE 2' });
        g.fillRect(60, 12, 1, 4, 'G');
        g.oneWay(20, 10, 38);
        addSafeTrail(g, s, 'big_topping', 18, 14, f, 3);
        addSafeTrail(g, s, 'big_topping', 22, 10, 10, 3);
        break;
      }
      case 'rocket_lane': {
        g.fillRect(20, 12, 2, 4, 'M');
        g.fillRect(34, 12, 2, 4, 'M');
        g.fillRect(48, 12, 2, 4, 'M');
        g.fillRect(60, 12, 2, 4, 'M');
        g.oneWay(32, 10, 14);
        addSafeTrail(g, s, 'big_topping', 14, 16, 13, 3);
        addSafeTrail(g, s, 'big_topping', 16, 14, 9, 4);
        break;
      }
      case 'foundry_belt': {
        g.fillRect(12, f, 54, 1, '>');
        g.fillRect(28, 12, 2, 4, 'M');
        g.fillRect(48, 12, 2, 4, 'M');
        g.oneWay(18, 10, 40);
        addSafeTrail(g, s, 'big_topping', 16, 15, f, 3);
        addSafeTrail(g, s, 'big_topping', 20, 11, 10, 3);
        break;
      }
      case 'grand_vault': {
        g.slope45UpRight(14, f, 3);
        g.plateau(17, 13, 14, f);
        g.fillRect(23, 9, 2, 4, 'M');
        g.slope45DownRight(31, 13, 3);
        g.fillRect(42, 12, 2, 4, 'M');
        g.fillRect(54, 12, 2, 4, 'M');
        g.oneWay(34, 9, 24);
        addSafeTrail(g, s, 'big_topping', 18, 5, 13, 2);
        addSafeTrail(g, s, 'big_topping', 36, 9, 9, 2);
        addSafeTrail(g, s, 'pizza_slice', 36, 10, f, 3);
        break;
      }
    }

    if (tr.toppinIdx !== undefined) {
      const toppinRow =
        tr.gimmick === 'lava_boost' ? 6 : tr.gimmick === 'grand_vault' ? 9 : 10;
      s.push({
        kind: 'prop',
        propKind: 'toppin_cage',
        index: tr.toppinIdx,
        x: px(38),
        y: groundY(toppinRow),
        label: `GAUNTLET PAL ${tr.toppinIdx + 1}`,
      });
    }
    if (tr.hasGerry) {
      s.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(50), y: groundY(f), label: 'JANITOR GERRY' });
    }
    if (tr.hasTreasure) {
      s.push({ kind: 'prop', propKind: 'treasure_chest', x: px(42), y: groundY(10), label: 'SECRET TREASURE' });
    }
    if (tr.totem) {
      addTotem(s, 70, f, 'none', 'RESET FORM');
    }

    const enemyAX = tr.gimmick === 'grand_vault' ? 28 : 24;
    const enemyARow =
      tr.gimmick === 'ghost_ring' ? 11 : tr.gimmick === 'grand_vault' ? 13 : f;
    s.push({ kind: 'enemy', archetype: tr.enemyA, x: px(enemyAX), y: groundY(enemyARow) });
    s.push({ kind: 'enemy', archetype: tr.enemyB, x: px(46), y: groundY(tr.gimmick === 'ghost_ring' ? 10 : f) });
    s.push({ kind: 'enemy', archetype: tr.enemyA, x: px(64), y: groundY(tr.gimmick === 'ghost_ring' ? 11 : f) });

    if (isLast) {
      s.push({ kind: 'prop', propKind: 'exit_door', x: px(74), y: groundY(f), label: 'CONQUER SECRET GAUNTLET!' });
    }

    return {
      id: `secretworld_r${idx}`,
      name: `Secrets of the Tower — ${tr.name}`,
      theme: tr.theme,
      widthTiles: g.w,
      heightTiles: g.h,
      rows: g.toRows(),
      spawnX: px(4),
      spawnY: groundY(spawnRow),
      isSecretRoom: true,
      secretIndex: idx % 3,
      doors: isLast
        ? []
        : [
            {
              id: `sw_${idx}_to_${idx + 1}`,
              x: px(77),
              y: groundY(f),
              targetRoomIndex: idx + 1,
              targetX: px(4),
              targetY: groundY(trials[idx + 1].gimmick === 'knight_slope' ? 11 : f),
              requireUp: false,
              label: `TRIAL ${idx + 2}`,
            },
          ],
      spawns: s,
    };
  });

  return {
    id: 'secretworld',
    name: 'Secrets of the Tower',
    subtitle: 'Bonus Mode — 8-Course Nonstop Secret Speed Gauntlet',
    floor: 0,
    theme: 'secret',
    music: 'secret_room',
    sRankScore: 38000,
    escapeSeconds: 0,
    hasPillar: false,
    hasLap2: false,
    secretGauntletMode: true,
    featuredGimmick: '8-Course Continuous Secret Gauntlet',
    rooms,
  };
}

// ============================================================================
// BONUS MODE 2: TRICKYTREAT — Candy Panic (4-Wing Haunted Pumpkin Collection Loop!)
// Oracle: sRankScore = 12000, escapeSeconds = 120, candyPanicMode = true
// ============================================================================
function buildTrickyTreatLevel(): LevelDef {
  const f = 18;
  const wingConfigs: Array<{
    name: string;
    totem?: TransformationId;
    hasSpikes?: boolean;
    hasSteepRamp?: boolean;
    isFinalWing?: boolean;
  }> = [
    { name: 'Candy Panic — Wing 1: Pumpkin Porch' },
    { name: 'Candy Panic — Wing 2: Spectral Attic', totem: 'ghost', hasSpikes: true },
    { name: 'Candy Panic — Wing 3: Candy Cellar', totem: 'ball', hasSteepRamp: true },
    { name: 'Candy Panic — Wing 4: Jack-o-Lantern Loop', isFinalWing: true },
  ];

  const rooms: RoomDef[] = wingConfigs.map((cfg, idx) => {
    const w = 86;
    const g = new RoomGrid(w, 22, f);
    const s: RoomEntitySpawn[] = [];

    if (cfg.hasSteepRamp) {
      g.plateau(1, 13, 12, f);
      addTotem(s, 9, 13, 'ball', 'CANDY BALL');
      g.slope45DownRight(13, 13, 5);
      g.fillRect(26, 14, 2, 4, 'm');
      g.fillRect(42, 14, 2, 4, 'M');
      g.fillRect(58, 14, 2, 4, 'm');
      g.oneWay(28, 11, 28);
      addTotem(s, 74, f, 'none', 'RESET FORM');
    } else if (cfg.hasSpikes) {
      addTotem(s, 10, f, 'ghost', 'PHANTOM TOTEM');
      g.fillRect(18, f, 44, 1, '^');
      g.oneWay(18, 14, 44);
      g.oneWay(24, 9, 32);
      addTotem(s, 74, f, 'none', 'EXORCISE');
    } else {
      g.slope26UpRight(16, f, 2);
      g.plateau(20, 16, 16, f);
      g.fillRect(27, 13, 2, 3, 'm');
      g.slope26DownRight(36, 16, 2);
      g.oneWay(44, 13, 18);
      g.oneWay(22, 11, 14);
    }

    // Generous Haunted Pumpkin haul (14 pumpkins per wing = 56 total = 14,000+ pts!)
    addSafeTrail(g, s, 'pumpkin', 14, 9, cfg.hasSpikes ? 14 : f, 6);
    addSafeTrail(g, s, 'pumpkin', 24, 5, cfg.hasSpikes ? 9 : 11, 6);
    // Bonus Clock Pickups (+5s each) tucked high!
    s.push({ kind: 'pickup', pickupKind: 'clock_pickup', x: px(32), y: groundY(10) - 20 });
    s.push({ kind: 'pickup', pickupKind: 'clock_pickup', x: px(56), y: groundY(12) - 20 });

    s.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(30), y: groundY(12) });
    s.push({ kind: 'enemy', archetype: 'static_minion', x: px(50), y: groundY(cfg.hasSpikes ? 14 : f) });
    s.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(66), y: groundY(13) });

    if (cfg.isFinalWing) {
      s.push({ kind: 'prop', propKind: 'exit_door', x: px(80), y: groundY(f), label: 'CASH IN CANDY!' });
    }

    const spawnRow = cfg.hasSteepRamp ? 13 : f;
    const doors = cfg.isFinalWing
      ? [
          {
            id: 'tt_loop_to_0',
            x: px(71),
            y: groundY(f),
            targetRoomIndex: 0,
            targetX: px(4),
            targetY: groundY(f),
            requireUp: true,
            label: 'LOOP TO WING 1 (UP)',
          },
        ]
      : [
          {
            id: `tt_${idx}_to_${idx + 1}`,
            x: px(83),
            y: groundY(f),
            targetRoomIndex: idx + 1,
            targetX: px(4),
            targetY: groundY(wingConfigs[idx + 1].hasSteepRamp ? 13 : f),
            requireUp: false,
            label: `WING ${idx + 2}`,
          },
        ];

    return {
      id: `trickytreat_r${idx}`,
      name: cfg.name,
      theme: 'candy',
      widthTiles: g.w,
      heightTiles: g.h,
      rows: g.toRows(),
      spawnX: px(4),
      spawnY: groundY(spawnRow),
      doors,
      spawns: s,
    };
  });

  return {
    id: 'trickytreat',
    name: 'Candy Panic',
    subtitle: 'Bonus Mode — High-Speed Haunted Pumpkin-Collection Loop',
    floor: 0,
    theme: 'candy',
    music: 'candy_panic',
    sRankScore: 12000,
    escapeSeconds: 120,
    hasPillar: false,
    hasLap2: false,
    candyPanicMode: true,
    featuredGimmick: 'Haunted Pumpkin Loop, Ghost Attic & Clock Pickups',
    rooms,
  };
}

// ============================================================================
// ALL 23 LEVELS REGISTRY
// ============================================================================
export const LEVELS: Record<StageId, LevelDef> = {
  tutorial: buildTutorialLevel(),

  // ---- FLOOR 1 ----
  entrance: buildEntranceLevel(),
  medieval: buildMedievalLevel(),
  ruin: buildRuinLevel(),
  dungeon: buildDungeonLevel(),

  // ---- FLOOR 2 ----
  badland: buildBadlandLevel(),
  graveyard: buildGraveyardLevel(),
  farm: buildFarmLevel(),
  saloon: buildSaloonLevel(),

  // ---- FLOOR 3 ----
  plage: buildPlageLevel(),
  forest: buildForestLevel(),
  space: buildSpaceLevel(),
  minigolf: buildMinigolfLevel(),

  // ---- FLOOR 4 ----
  street: buildStreetLevel(),
  sewer: buildSewerLevel(),
  industrial: buildIndustrialLevel(),
  freezer: buildFreezerLevel(),

  // ---- FLOOR 5 ----
  chateau: buildChateauLevel(),
  kidsparty: buildKidsPartyLevel(),
  war: buildWarLevel(),

  // ---- FINALE & BONUS MODES ----
  exit: buildExitFinaleLevel(),
  secretworld: buildSecretWorldLevel(),
  trickytreat: buildTrickyTreatLevel(),
};

// ============================================================================
// ALL 5 PHYSICAL WALKABLE TOWER FLOOR HUBS
// ============================================================================
function buildHubFloorRoom(
  floor: FloorId,
  name: string,
  theme: RoomThemeId,
  stages: StageId[],
  bossId: 'b_artiste' | 'b_cheddar' | 'b_static' | 'b_doppel' | 'b_megacrust',
  bossLabel: string,
  toll: number,
  bonusGates: Array<{ xTile: number; yRow: number; stageId: StageId; label: string }>,
): RoomDef {
  const floorRow = 14;
  const g = new RoomGrid(64, 18, floorRow);
  const spawns: RoomEntitySpawn[] = [];

  // Playful decorative balconies for hub parkour
  g.oneWay(8, 10, 10);
  g.oneWay(24, 9, 14);
  g.oneWay(44, 10, 10);

  // Elevator on far left
  const nextFloor = (floor < 5 ? floor + 1 : 1) as FloorId;
  spawns.push({
    kind: 'prop',
    propKind: 'hub_elevator',
    x: px(4),
    y: groundY(floorRow),
    targetFloor: nextFloor,
    label: `ELEVATOR (TO FLOOR ${nextFloor})`,
  });

  // Stage Gates spread across lobby
  const gateCols = stages.length === 4 ? [14, 23, 32, 41] : [15, 26, 37];
  stages.forEach((stageId, i) => {
    const def = LEVELS[stageId];
    spawns.push({
      kind: 'prop',
      propKind: 'hub_stage_gate',
      x: px(gateCols[i] ?? 15 + i * 9),
      y: groundY(floorRow),
      targetStageId: stageId,
      label: def.name.toUpperCase(),
    });
  });

  // Broker Buck toll desk
  spawns.push({
    kind: 'prop',
    propKind: 'hub_broker',
    x: px(49),
    y: groundY(floorRow),
    targetFloor: floor,
    label: toll > 0 ? `BROKER BUCK ($${toll})` : 'BROKER BUCK (FREE PASS)',
  });

  // Boss Gate on far right
  spawns.push({
    kind: 'prop',
    propKind: 'hub_boss_gate',
    x: px(57),
    y: groundY(floorRow),
    targetBossId: bossId,
    label: `BOSS: ${bossLabel.toUpperCase()}`,
  });

  // Optional Bonus Mode Gates (Tutorial, Candy Panic, Secrets of the Tower)
  for (const bg of bonusGates) {
    spawns.push({
      kind: 'prop',
      propKind: 'hub_bonus_gate',
      x: px(bg.xTile),
      y: groundY(bg.yRow),
      targetStageId: bg.stageId,
      label: bg.label,
    });
  }

  return {
    id: `hub_floor_${floor}`,
    name,
    theme,
    widthTiles: g.w,
    heightTiles: g.h,
    rows: g.toRows(),
    spawnX: px(9),
    spawnY: groundY(floorRow),
    doors: [],
    spawns,
  };
}

export const HUB_ROOMS: Record<FloorId, RoomDef> = {
  1: buildHubFloorRoom(
    1,
    'Floor 1 — Tower Lobby',
    'hub_lobby',
    ['entrance', 'medieval', 'ruin', 'dungeon'],
    'b_artiste',
    'Artiste Bell',
    100,
    [
      { xTile: 9, yRow: 10, stageId: 'tutorial', label: 'BOOT CAMP TUTORIAL' },
      { xTile: 49, yRow: 10, stageId: 'trickytreat', label: 'BONUS: CANDY PANIC' },
    ],
  ),
  2: buildHubFloorRoom(
    2,
    'Floor 2 — Western District',
    'hub_western',
    ['badland', 'graveyard', 'farm', 'saloon'],
    'b_cheddar',
    'Sheriff Cheddar',
    150,
    [],
  ),
  3: buildHubFloorRoom(
    3,
    'Floor 3 — Resort & Woods',
    'hub_resort',
    ['plage', 'forest', 'space', 'minigolf'],
    'b_static',
    'The Static',
    200,
    [],
  ),
  4: buildHubFloorRoom(
    4,
    'Floor 4 — Slum & Foundry',
    'hub_slum',
    ['street', 'sewer', 'industrial', 'freezer'],
    'b_doppel',
    'Doppel-Peppo',
    210,
    [],
  ),
  5: buildHubFloorRoom(
    5,
    'Floor 5 — Penthouse Summit',
    'hub_penthouse',
    ['chateau', 'kidsparty', 'war', 'exit'],
    'b_megacrust',
    'Mega-Crust & Lord Dough',
    0,
    [{ xTile: 9, yRow: 10, stageId: 'secretworld', label: 'BONUS: SECRETS OF THE TOWER' }],
  ),
};

export function getLevelDef(id: StageId): LevelDef {
  return LEVELS[id];
}
