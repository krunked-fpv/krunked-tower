// ============================================================================
// Krunked Tower — All 23 Stages + 5 Hub Floors (Declarative Room Layouts)
// Wave 1 Flagship Crucible: `tutorial`, `entrance` (Gutter Crypt), `forest`
// (Shroom Woods), plus full multi-room playable builds for all other 20 stages
// and all 5 physical walkable Tower Floor Hubs.
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// ============================================================================

import type {
  ActiveRider,
  EnemyArchetypeId,
  FloorId,
  LevelDef,
  MusicTrackId,
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

  toRows(): string[] {
    return this.cells.map((row) => row.join(''));
  }
}

function addSmallTrail(
  spawns: RoomEntitySpawn[],
  startTileX: number,
  count: number,
  tileY: number,
  step = 2,
): void {
  for (let i = 0; i < count; i++) {
    spawns.push({
      kind: 'pickup',
      pickupKind: 'small_topping',
      x: px(startTileX + i * step),
      y: groundY(tileY) - 18,
    });
  }
}

function addBigTrail(
  spawns: RoomEntitySpawn[],
  startTileX: number,
  count: number,
  tileY: number,
  step = 3,
): void {
  for (let i = 0; i < count; i++) {
    spawns.push({
      kind: 'pickup',
      pickupKind: 'big_topping',
      x: px(startTileX + i * step),
      y: groundY(tileY) - 22,
    });
  }
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
  addSmallTrail(spawns, 8, 5, floorRow, 2);
  addBigTrail(spawns, 13, 2, 15, 2);

  // Zone 2: Slopes & Marble Smash (x=22..48)
  spawns.push({
    kind: 'prop',
    propKind: 'tutorial_sign',
    x: px(22),
    y: groundY(floorRow),
    label: 'RIDE SLOPES & SMASH MARBLE AT MACH 2 OR GRAB!',
  });
  g.slope26UpRight(24, floorRow, 2); // rises to row 16 over x=24..27
  g.plateau(28, 16, 8, floorRow);
  g.fillRect(31, 13, 2, 3, 'm'); // Breakable Marble gate on plateau
  g.slope45DownRight(36, 16, 2); // descends back to floorRow 18 over x=36..37
  g.fillRect(42, 14, 2, 4, 'm'); // Second Marble wall on runway
  addSmallTrail(spawns, 25, 6, 15, 2);
  addBigTrail(spawns, 39, 3, floorRow, 2);

  // Zone 3: Wall-Climb Shaft (x=48..66)
  spawns.push({
    kind: 'prop',
    propKind: 'tutorial_sign',
    x: px(48),
    y: groundY(floorRow),
    label: 'RUN AT WALLS IN MACH 2+ TO WALL-CLIMB!',
  });
  g.plateau(54, 11, 12, floorRow); // 7-tile climbable wall at x=54
  g.oneWay(50, 15, 3); // Friendly staircase fallback
  g.oneWay(50, 12, 3);
  addBigTrail(spawns, 56, 3, 11, 2);
  g.slope45DownRight(66, 11, 7); // Huge exhilarating downhill slope to row 18 (x=66..72)
  addSmallTrail(spawns, 67, 5, 13, 2);

  // Zone 4: Metal Blocks & Superjump Chimney (x=74..94)
  spawns.push({
    kind: 'prop',
    propKind: 'tutorial_sign',
    x: px(75),
    y: groundY(floorRow),
    label: 'MACH 3 SMASHES METAL — HOLD UP + RELEASE TO SUPERJUMP!',
  });
  g.fillRect(79, 14, 2, 4, 'M'); // Metal wall on runway
  // Superjump chimney ceiling with Metal blocks overhead & bonus upper deck
  g.fillRect(83, 11, 4, 1, '#');
  g.fillRect(87, 11, 3, 1, 'M'); // Superjump straight through!
  g.fillRect(90, 11, 4, 1, '#');
  g.oneWay(87, 7, 6);
  addBigTrail(spawns, 88, 3, 7, 2);
  addSmallTrail(spawns, 84, 5, floorRow, 2);

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
  addBigTrail(spawns, 102, 3, 15, 3);

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
// Helper for Secret Rooms (44x16 punchy kinetic challenges)
// ============================================================================
function buildSecretRoom(
  id: string,
  name: string,
  theme: RoomThemeId,
  secretIndex: number,
  returnRoomIndex: number,
  returnX: number,
  returnY: number,
  style: 'marble_dash' | 'slope_jump' | 'superjump_vault',
  enemyArchetype: EnemyArchetypeId,
): RoomDef {
  const floorRow = 13;
  const g = new RoomGrid(44, 16, floorRow);
  const spawns: RoomEntitySpawn[] = [];

  if (style === 'marble_dash') {
    g.fillRect(12, 9, 2, 4, 'm');
    g.fillRect(20, 9, 2, 4, 'm');
    g.fillRect(28, 9, 2, 4, 'm');
    addSmallTrail(spawns, 7, 12, floorRow, 2);
    addBigTrail(spawns, 15, 4, 10, 4);
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(17), y: groundY(floorRow) });
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(25), y: groundY(floorRow) });
  } else if (style === 'slope_jump') {
    g.slope45UpRight(8, floorRow, 3); // rises to 10
    g.plateau(11, 10, 5, floorRow);
    g.slope45DownRight(16, 10, 3); // back to 13
    g.fillRect(22, floorRow, 4, 1, '^'); // spike pit to Mach-leap!
    g.oneWay(22, 10, 4);
    g.slope26UpRight(28, floorRow, 2);
    g.plateau(32, 11, 4, floorRow);
    g.slope26DownRight(36, 11, 2);
    addBigTrail(spawns, 12, 4, 9, 5);
    addSmallTrail(spawns, 19, 8, 9, 2);
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(33), y: groundY(11) });
  } else {
    // superjump_vault
    g.fillRect(14, 8, 4, 1, '#');
    g.fillRect(18, 8, 4, 1, 'M');
    g.fillRect(22, 8, 6, 1, '#');
    g.oneWay(12, 10, 3);
    g.oneWay(18, 5, 12);
    addBigTrail(spawns, 19, 4, 5, 3);
    addSmallTrail(spawns, 10, 10, floorRow, 2);
    spawns.push({ kind: 'enemy', archetype: enemyArchetype, x: px(26), y: groundY(floorRow) });
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
        x: px(40),
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

  // Exit Door & Lap 2 Portal side-by-side at left start!
  s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(r0Floor), label: 'EXIT GUTTER CRYPT' });
  s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(7), y: groundY(r0Floor), label: 'LAP 2 PORTAL' });

  // Gentle 26.5° ramp up into Marble smash gallery
  g0.slope26UpRight(16, r0Floor, 2); // x=16..19 rises to 16
  g0.plateau(20, 16, 14, r0Floor);
  g0.fillRect(25, 13, 2, 3, 'm');
  g0.slope45DownRight(34, 16, 2); // x=34..35 drops to 18

  // Upper Krunk Time! Express Return Deck unlocked when Pillar breaks ('P' opens!)
  g0.oneWay(20, 11, 24);
  g0.fillRect(44, 7, 2, 4, 'P'); // Opens during escape for nonstop return flight!
  g0.oneWay(46, 11, 22);

  // Mid-room marble arena + Toppin Pal #0 (Shroom)
  g0.fillRect(46, 14, 2, 4, 'm');
  g0.oneWay(52, 14, 8);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(56), y: groundY(14), label: 'SHROOM PAL' });

  // Secret Wall ('S') hiding Secret Eye #1 on upper-right alcove
  g0.fillRect(72, 11, 1, 3, 'S');
  g0.oneWay(73, 14, 7);
  s0.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index: 0,
    x: px(76),
    y: groundY(14),
    targetRoomIndex: 4,
    targetX: px(3),
    targetY: groundY(13),
    label: 'SECRET 1',
  });

  // 45° slope finish to Room 1 doorway
  g0.slope45UpRight(80, r0Floor, 2);
  g0.plateau(82, 16, 13, r0Floor);

  addSmallTrail(s0, 10, 3, r0Floor, 2);
  addSmallTrail(s0, 21, 4, 16, 2);
  addBigTrail(s0, 22, 3, 15, 4);
  addSmallTrail(s0, 38, 8, r0Floor, 2);
  addBigTrail(s0, 26, 4, 11, 6);
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

  // Entry deck at row 15 -> massive 5-tile 45° Mach 4 downhill plunge!
  g1.plateau(1, 15, 11, r1Floor);
  g1.slope45DownRight(12, 15, 5); // x=12..16 plunges down to row 20!

  // Mach 3/4 Smash Chain: 2 Marble + 2 Metal walls!
  g1.fillRect(23, 16, 2, 4, 'm');
  g1.fillRect(32, 16, 2, 4, 'M');
  g1.fillRect(42, 16, 2, 4, 'm');
  g1.fillRect(52, 16, 2, 4, 'M');

  // Escape-activated speed bridge ('O' becomes solid on escape over lower dip)
  g1.fillRect(62, 14, 10, 1, 'O');
  g1.oneWay(56, 16, 5);

  // Toppin Pal #1 (Cheese) on mid-high ledge + Toppin Pal #2 (Tomato) up wall-climb shaft
  g1.oneWay(26, 13, 8);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(30), y: groundY(13), label: 'CHEESE PAL' });

  // Janitor Gerry in a Marble-walled alcove + Treasure Chest on upper gallery
  g1.fillRect(64, 17, 1, 3, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(68), y: groundY(r1Floor), label: 'JANITOR GERRY' });

  // Climbable pillar block tower for upper gallery (Treasure + Toppin #2 + Secret #2)
  g1.plateau(74, 13, 14, r1Floor);
  g1.oneWay(70, 17, 3);
  g1.oneWay(70, 14, 3);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(78), y: groundY(13), label: 'TOMATO PAL' });
  s1.push({ kind: 'prop', propKind: 'treasure_chest', x: px(84), y: groundY(13), label: 'CRYPT TREASURE' });

  // Secret Wall #2 tucked above upper gallery
  g1.oneWay(88, 10, 8);
  g1.fillRect(91, 7, 1, 3, 'S');
  s1.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index: 1,
    x: px(94),
    y: groundY(10),
    targetRoomIndex: 5,
    targetX: px(3),
    targetY: groundY(13),
    label: 'SECRET 2',
  });

  // Sweeping downhill exit ramp from plateau to Room 2 door
  g1.slope26DownRight(88, 13, 4); // x=88..95 descends 4 tiles to 17
  g1.plateau(96, 17, 13, r1Floor);

  addSmallTrail(s1, 17, 10, r1Floor, 2);
  addBigTrail(s1, 20, 5, 18, 8);
  addBigTrail(s1, 75, 3, 12, 4);
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

  // Long runway into Superjump Metal Chimney (x=34..38)
  g2.fillRect(18, 18, 2, 4, 'm');
  g2.fillRect(28, 14, 6, 1, '#');
  g2.fillRect(34, 14, 4, 1, 'M'); // Superjump straight through!
  g2.fillRect(38, 14, 8, 1, '#');
  g2.oneWay(24, 18, 3);
  g2.oneWay(24, 15, 3);

  // Upper rafters: Toppin #3 (Sausage) + Secret Eye #3
  g2.oneWay(32, 10, 20);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(42), y: groundY(10), label: 'SAUSAGE PAL' });

  g2.oneWay(54, 8, 12);
  g2.fillRect(58, 5, 1, 3, 'S');
  s2.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index: 2,
    x: px(62),
    y: groundY(8),
    targetRoomIndex: 6,
    targetX: px(3),
    targetY: groundY(13),
    label: 'SECRET 3',
  });

  // Lower Metal smash gauntlet + escape shortcut ramp
  g2.fillRect(52, 18, 2, 4, 'M');
  g2.slope26UpRight(62, r2Floor, 3); // x=62..67 rises to 19
  g2.plateau(68, 19, 10, r2Floor);
  g2.fillRect(72, 15, 2, 4, 'P'); // Opens during escape for blazing return dash!
  g2.slope45DownRight(78, 19, 3); // x=78..80 back to 22

  addSmallTrail(s2, 8, 10, r2Floor, 2);
  addBigTrail(s2, 34, 4, 10, 4);
  addBigTrail(s2, 68, 3, 18, 3);
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
  g3.slope26UpRight(32, r3Floor, 2); // rises to 14
  g3.plateau(36, 14, 8, r3Floor);
  g3.slope26DownRight(44, 14, 2); // back to 16
  g3.fillRect(50, 12, 2, 4, 'm');

  // Pillar Chronos at the far right end!
  s3.push({
    kind: 'prop',
    propKind: 'pillar_chronos',
    x: px(63),
    y: groundY(r3Floor),
    label: 'PILLAR CHRONOS',
  });

  addSmallTrail(s3, 10, 8, r3Floor, 2);
  addBigTrail(s3, 37, 3, 13, 2);
  addBigTrail(s3, 54, 3, r3Floor, 2);
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

  // ---- Rooms 4, 5, 6: Three Distinct Secret Rooms ----
  const secret1 = buildSecretRoom(
    'entrance_s1',
    'Crypt Secret 1 — Marble Run',
    'secret',
    0,
    0,
    px(74),
    groundY(14),
    'marble_dash',
    'slime_glob',
  );
  const secret2 = buildSecretRoom(
    'entrance_s2',
    'Crypt Secret 2 — Slope Pit',
    'secret',
    1,
    1,
    px(90),
    groundY(10),
    'slope_jump',
    'swedish_ape',
  );
  const secret3 = buildSecretRoom(
    'entrance_s3',
    'Crypt Secret 3 — Superjump Attic',
    'secret',
    2,
    2,
    px(56),
    groundY(8),
    'superjump_vault',
    'fork_imp',
  );

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

  g0.slope26UpRight(16, r0Floor, 3); // rises to 15
  g0.plateau(22, 15, 14, r0Floor);
  g0.fillRect(28, 11, 2, 4, 'm');
  g0.slope45DownRight(36, 15, 3); // back to 18

  g0.oneWay(46, 14, 10);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(51), y: groundY(14), label: 'SHROOM PAL' });

  g0.oneWay(64, 12, 10);
  g0.fillRect(68, 9, 1, 3, 'S');
  s0.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index: 0,
    x: px(71),
    y: groundY(12),
    targetRoomIndex: 4,
    targetX: px(3),
    targetY: groundY(13),
    label: 'WOODS SECRET 1',
  });

  // Buddy Switch prop to introduce Gusto & Chonks!
  s0.push({
    kind: 'prop',
    propKind: 'buddy_switch',
    x: px(84),
    y: groundY(r0Floor),
    riderTarget: 'gusto_chonks',
    label: 'TAG IN GUSTO & CHONKS!',
  });

  addSmallTrail(s0, 10, 3, r0Floor, 2);
  addSmallTrail(s0, 23, 5, 15, 2);
  addBigTrail(s0, 24, 4, 14, 4);
  addBigTrail(s0, 56, 3, r0Floor, 4);
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

  // Metal barriers built for Gusto's max-speed charge & Chonks Kick!
  g1.fillRect(20, 14, 2, 4, 'M');
  g1.fillRect(36, 14, 2, 4, 'M');
  g1.slope45UpRight(44, r1Floor, 3); // rises to 15
  g1.plateau(47, 15, 16, r1Floor);
  g1.fillRect(54, 11, 2, 4, 'M');
  g1.slope26DownRight(63, 15, 3); // drops to 18

  g1.oneWay(24, 13, 9);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(28), y: groundY(13), label: 'CHEESE PAL' });
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(58), y: groundY(15), label: 'TOMATO PAL' });

  // Janitor Gerry in hollow log below metal blocks
  g1.fillRect(72, 15, 1, 3, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(76), y: groundY(r1Floor), label: 'JANITOR GERRY' });

  // Upper secret perch for Gusto Double-Jump Wall-Climb
  g1.oneWay(76, 11, 12);
  g1.fillRect(82, 8, 1, 3, 'S');
  s1.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index: 1,
    x: px(85),
    y: groundY(11),
    targetRoomIndex: 5,
    targetX: px(3),
    targetY: groundY(13),
    label: 'WOODS SECRET 2',
  });

  addSmallTrail(s1, 10, 12, r1Floor, 2);
  addBigTrail(s1, 48, 4, 14, 3);
  addBigTrail(s1, 78, 3, 10, 3);
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

  // Double-jump downsmash metal deck + Treasure vault
  g2.fillRect(36, 15, 6, 1, 'M');
  g2.oneWay(32, 16, 4);
  g2.oneWay(42, 12, 14);
  s2.push({ kind: 'prop', propKind: 'treasure_chest', x: px(49), y: groundY(12), label: 'WOODS TREASURE' });

  // Secret Eye #3 on high canopy
  g2.oneWay(60, 9, 12);
  g2.fillRect(65, 6, 1, 3, 'S');
  s2.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index: 2,
    x: px(68),
    y: groundY(9),
    targetRoomIndex: 6,
    targetX: px(3),
    targetY: groundY(13),
    label: 'WOODS SECRET 3',
  });

  // Escape speed bridge & Buddy Switch back to primary hero
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

  addSmallTrail(s2, 32, 10, r2Floor, 2);
  addBigTrail(s2, 18, 4, 13, 3);
  addBigTrail(s2, 44, 4, 11, 4);
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

  addSmallTrail(s3, 10, 8, r3Floor, 2);
  addBigTrail(s3, 37, 4, 13, 2);
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

  const secret1 = buildSecretRoom(
    'forest_s1',
    'Woods Secret 1 — Bracken Sprint',
    'secret',
    0,
    0,
    px(66),
    groundY(12),
    'marble_dash',
    'mushroom_spitter',
  );
  const secret2 = buildSecretRoom(
    'forest_s2',
    'Woods Secret 2 — Canopy Leap',
    'secret',
    1,
    1,
    px(78),
    groundY(11),
    'slope_jump',
    'giant_bee',
  );
  const secret3 = buildSecretRoom(
    'forest_s3',
    'Woods Secret 3 — Hollow Crown',
    'secret',
    2,
    2,
    px(62),
    groundY(9),
    'superjump_vault',
    'archer_goblin',
  );

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
// STANDARD MULTI-ROOM STAGE GENERATOR (All other 17 main tower stages!)
// Every stage has 3 main rooms + 3 secret rooms, 5 Toppin Pals, Gerry +
// Treasure, Pillar Chronos, Lap 2 Portal, signature terrain & transformation!
// ============================================================================
interface StandardStageSpec {
  id: StageId;
  name: string;
  subtitle: string;
  floor: FloorId;
  theme: RoomThemeId;
  music: MusicTrackId;
  sRankScore: number;
  escapeSeconds: number;
  featuredGimmick: string;
  enemies: [EnemyArchetypeId, EnemyArchetypeId, EnemyArchetypeId];
  transformation?: TransformationId;
  surfaceTile?: 'I' | '>' | '<' | '#';
  hazardTile?: 'L' | '^';
  useCheeseWall?: boolean;
  useDashButton?: boolean;
  useGolf?: boolean;
  useTaxi?: boolean;
  useAlarm?: boolean;
  allowRiderMid?: ActiveRider;
  warTimerMode?: boolean;
}

function buildStandardStage(spec: StandardStageSpec): LevelDef {
  const [e0, e1, e2] = spec.enemies;
  const f0 = 18;
  const f1 = 18;
  const f2 = 16;

  // ---- Room 0: Opening Course + Exit Door + Lap 2 + Transformation Totem ----
  const g0 = new RoomGrid(92, 22, f0);
  const s0: RoomEntitySpawn[] = [];

  if (!spec.warTimerMode) {
    s0.push({ kind: 'prop', propKind: 'exit_door', x: px(3), y: groundY(f0), label: `EXIT ${spec.name.toUpperCase()}` });
    s0.push({ kind: 'prop', propKind: 'lap2_portal', x: px(7), y: groundY(f0), label: 'LAP 2 PORTAL' });
  } else {
    // In WAR mode, a Time Terminal waits right near the start too
    s0.push({ kind: 'prop', propKind: 'time_terminal', x: px(46), y: groundY(f0), label: 'TIME TERMINAL +30S' });
  }

  if (spec.transformation) {
    s0.push({
      kind: 'prop',
      propKind: 'transform_totem',
      x: px(12),
      y: groundY(f0),
      transformation: spec.transformation,
      label: spec.transformation.toUpperCase(),
    });
  }

  if (spec.surfaceTile && spec.surfaceTile !== '#') {
    g0.fillRect(16, f0, 26, 1, spec.surfaceTile);
  }

  g0.slope26UpRight(20, f0, 2);
  g0.plateau(24, 16, 12, f0);
  g0.fillRect(29, 13, 2, 3, 'm');
  g0.slope45DownRight(36, 16, 2);

  if (spec.hazardTile) {
    g0.fillRect(42, f0, 4, 1, spec.hazardTile);
    g0.oneWay(42, 15, 4);
  }

  if (spec.useCheeseWall) {
    g0.fillRect(54, 10, 1, 7, 'C');
  }

  if (spec.useDashButton) {
    s0.push({ kind: 'prop', propKind: 'dash_button', x: px(50), y: groundY(f0), label: 'OPEN OUTLET GATE' });
    g0.fillRect(60, 14, 1, 4, 'G');
  }

  if (spec.useGolf) {
    s0.push({ kind: 'prop', propKind: 'golf_ball', x: px(48), y: groundY(f0), label: 'GOLF BALL' });
    s0.push({ kind: 'prop', propKind: 'golf_goal', x: px(78), y: groundY(f0), label: 'GOLF HOLE' });
  }

  if (spec.useAlarm) {
    s0.push({ kind: 'prop', propKind: 'alarm_sensor', x: px(52), y: groundY(f0), label: 'ALARM SENSOR' });
  }

  // Toppin #0 & #1
  g0.oneWay(24, 12, 8);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 0, x: px(28), y: groundY(12), label: 'SHROOM PAL' });
  g0.oneWay(64, 14, 10);
  s0.push({ kind: 'prop', propKind: 'toppin_cage', index: 1, x: px(69), y: groundY(14), label: 'CHEESE PAL' });

  // Secret Eye #1
  g0.oneWay(74, 10, 10);
  g0.fillRect(78, 7, 1, 3, 'S');
  s0.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index: 0,
    x: px(81),
    y: groundY(10),
    targetRoomIndex: 3,
    targetX: px(3),
    targetY: groundY(13),
    label: 'SECRET 1',
  });

  g0.fillRect(58, 14, 2, 4, 'm');
  g0.fillRect(72, 11, 2, 3, 'P');

  addSmallTrail(s0, 13, 3, f0, 2);
  addSmallTrail(s0, 39, 5, f0, 2);
  addBigTrail(s0, 26, 4, 15, 3);
  addBigTrail(s0, 62, 4, f0, 4);
  s0.push({ kind: 'enemy', archetype: e0, x: px(33), y: groundY(16) });
  s0.push({ kind: 'enemy', archetype: e1, x: px(55), y: groundY(f0) });
  s0.push({ kind: 'enemy', archetype: e2, x: px(76), y: groundY(f0) });

  const room0: RoomDef = {
    id: `${spec.id}_r0`,
    name: `${spec.name} — Zone 1`,
    theme: spec.theme,
    widthTiles: g0.w,
    heightTiles: g0.h,
    rows: g0.toRows(),
    spawnX: px(5),
    spawnY: groundY(f0),
    doors: [
      {
        id: `${spec.id}_0_to_1`,
        x: px(89),
        y: groundY(f0),
        targetRoomIndex: 1,
        targetX: px(5),
        targetY: groundY(f1),
        requireUp: false,
        label: 'ZONE 2',
      },
    ],
    spawns: s0,
  };

  // ---- Room 1: Mid-Stage Action + Gerry + Treasure + Toppins #2 & #3 ----
  const g1 = new RoomGrid(96, 22, f1);
  const s1: RoomEntitySpawn[] = [];

  if (spec.surfaceTile && spec.surfaceTile !== '#') {
    g1.fillRect(14, f1, 30, 1, spec.surfaceTile);
  }
  if (spec.allowRiderMid) {
    s1.push({
      kind: 'prop',
      propKind: 'buddy_switch',
      x: px(10),
      y: groundY(f1),
      riderTarget: spec.allowRiderMid,
      label: 'GUSTO & CHONKS PAD',
    });
  }
  if (spec.useTaxi) {
    s1.push({
      kind: 'prop',
      propKind: 'taxi_warp',
      x: px(14),
      y: groundY(f1),
      targetRoomIndex: 1,
      targetX: px(78),
      targetY: groundY(14),
      label: 'EXPRESS TAXI WARP',
    });
  }
  if (spec.warTimerMode) {
    s1.push({ kind: 'prop', propKind: 'time_terminal', x: px(48), y: groundY(15), label: 'TIME TERMINAL +30S' });
  }

  g1.fillRect(20, 14, 2, 4, 'm');
  g1.fillRect(34, 14, 2, 4, 'M');
  g1.slope45UpRight(42, f1, 3); // rises to 15
  g1.plateau(45, 15, 16, f1);
  g1.slope45DownRight(61, 15, 3); // back to 18

  // Toppin #2 & #3
  g1.oneWay(24, 13, 8);
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 2, x: px(28), y: groundY(13), label: 'TOMATO PAL' });
  s1.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(53), y: groundY(15), label: 'SAUSAGE PAL' });

  // Janitor Gerry & Treasure Chest
  g1.fillRect(66, 15, 1, 3, 'm');
  s1.push({ kind: 'prop', propKind: 'gerry_janitor', x: px(70), y: groundY(f1), label: 'JANITOR GERRY' });
  g1.oneWay(72, 12, 12);
  s1.push({ kind: 'prop', propKind: 'treasure_chest', x: px(78), y: groundY(12), label: 'STAGE TREASURE' });

  // Secret Eye #2
  g1.oneWay(46, 10, 12);
  g1.fillRect(50, 7, 1, 3, 'S');
  s1.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index: 1,
    x: px(54),
    y: groundY(10),
    targetRoomIndex: 4,
    targetX: px(3),
    targetY: groundY(13),
    label: 'SECRET 2',
  });

  g1.fillRect(74, 14, 8, 1, 'O');

  addSmallTrail(s1, 12, 10, f1, 2);
  addBigTrail(s1, 46, 5, 14, 3);
  addBigTrail(s1, 74, 4, 11, 3);
  s1.push({ kind: 'enemy', archetype: e1, x: px(27), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: e2, x: px(49), y: groundY(15) });
  s1.push({ kind: 'enemy', archetype: e0, x: px(58), y: groundY(15) });
  s1.push({ kind: 'enemy', archetype: e1, x: px(82), y: groundY(f1) });
  s1.push({ kind: 'enemy', archetype: e2, x: px(86), y: groundY(f1), escapeOnly: true });

  const room1: RoomDef = {
    id: `${spec.id}_r1`,
    name: `${spec.name} — Zone 2`,
    theme: spec.theme,
    widthTiles: g1.w,
    heightTiles: g1.h,
    rows: g1.toRows(),
    spawnX: px(5),
    spawnY: groundY(f1),
    allowRider: spec.allowRiderMid,
    doors: [
      {
        id: `${spec.id}_1_to_0`,
        x: px(2),
        y: groundY(f1),
        targetRoomIndex: 0,
        targetX: px(86),
        targetY: groundY(f0),
        requireUp: false,
        label: 'TO ZONE 1',
      },
      {
        id: `${spec.id}_1_to_2`,
        x: px(93),
        y: groundY(f1),
        targetRoomIndex: 2,
        targetX: px(5),
        targetY: groundY(f2),
        requireUp: false,
        label: 'SANCTUM',
      },
    ],
    spawns: s1,
  };

  // ---- Room 2: Climax Sanctum + Toppin #4 + Secret #3 + Pillar Chronos ----
  const g2 = new RoomGrid(76, 20, f2);
  const s2: RoomEntitySpawn[] = [];

  g2.oneWay(16, 12, 10);
  s2.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(21), y: groundY(12), label: 'PINEAPPLE PAL' });

  g2.oneWay(32, 9, 12);
  g2.fillRect(36, 6, 1, 3, 'S');
  s2.push({
    kind: 'prop',
    propKind: 'secret_eye',
    index: 2,
    x: px(40),
    y: groundY(9),
    targetRoomIndex: 5,
    targetX: px(3),
    targetY: groundY(13),
    label: 'SECRET 3',
  });

  g2.slope26UpRight(28, f2, 2);
  g2.plateau(32, 14, 12, f2);
  g2.slope26DownRight(44, 14, 2);
  g2.fillRect(50, 12, 2, 4, 'M');

  if (spec.warTimerMode) {
    s2.push({ kind: 'prop', propKind: 'time_terminal', x: px(38), y: groundY(14), label: 'TIME TERMINAL +30S' });
    s2.push({ kind: 'prop', propKind: 'lap2_portal', x: px(60), y: groundY(f2), label: 'LAP 2 BLITZ!' });
    s2.push({ kind: 'prop', propKind: 'exit_door', x: px(67), y: groundY(f2), label: 'FINISH BLITZ!' });
  } else {
    s2.push({ kind: 'prop', propKind: 'pillar_chronos', x: px(66), y: groundY(f2), label: 'PILLAR CHRONOS' });
  }

  addSmallTrail(s2, 10, 8, f2, 2);
  addBigTrail(s2, 33, 4, 13, 3);
  addBigTrail(s2, 54, 3, f2, 3);
  s2.push({ kind: 'enemy', archetype: e0, x: px(18), y: groundY(f2) });
  s2.push({ kind: 'enemy', archetype: e2, x: px(38), y: groundY(14) });
  s2.push({ kind: 'enemy', archetype: e1, x: px(57), y: groundY(f2) });

  const room2: RoomDef = {
    id: `${spec.id}_r2`,
    name: `${spec.name} — Sanctum`,
    theme: spec.theme,
    widthTiles: g2.w,
    heightTiles: g2.h,
    rows: g2.toRows(),
    spawnX: px(5),
    spawnY: groundY(f2),
    doors: [
      {
        id: `${spec.id}_2_to_1`,
        x: px(2),
        y: groundY(f2),
        targetRoomIndex: 1,
        targetX: px(90),
        targetY: groundY(f1),
        requireUp: false,
        label: 'ESCAPE ROUTE',
      },
    ],
    spawns: s2,
  };

  const secret1 = buildSecretRoom(
    `${spec.id}_s1`,
    `${spec.name} — Secret 1`,
    'secret',
    0,
    0,
    px(76),
    groundY(10),
    'marble_dash',
    e0,
  );
  const secret2 = buildSecretRoom(
    `${spec.id}_s2`,
    `${spec.name} — Secret 2`,
    'secret',
    1,
    1,
    px(48),
    groundY(10),
    'slope_jump',
    e1,
  );
  const secret3 = buildSecretRoom(
    `${spec.id}_s3`,
    `${spec.name} — Secret 3`,
    'secret',
    2,
    2,
    px(34),
    groundY(9),
    'superjump_vault',
    e2,
  );

  return {
    id: spec.id,
    name: spec.name,
    subtitle: spec.subtitle,
    floor: spec.floor,
    theme: spec.theme,
    music: spec.music,
    sRankScore: spec.sRankScore,
    escapeSeconds: spec.escapeSeconds,
    hasPillar: !spec.warTimerMode,
    hasLap2: true,
    warTimerMode: spec.warTimerMode,
    featuredGimmick: spec.featuredGimmick,
    rooms: [room0, room1, room2, secret1, secret2, secret3],
  };
}

// ============================================================================
// SPECIAL STAGES: EXIT (Crumbling Spire), SECRETWORLD, TRICKYTREAT
// ============================================================================
function buildExitFinaleLevel(): LevelDef {
  const f = 18;
  const rooms: RoomDef[] = [0, 1, 2].map((idx) => {
    const g = new RoomGrid(84, 22, f);
    const s: RoomEntitySpawn[] = [];
    g.slope45DownRight(10, 15, 3);
    g.plateau(1, 15, 9, f);
    g.fillRect(22, 14, 2, 4, 'm');
    g.fillRect(36, 14, 2, 4, 'M');
    g.slope26UpRight(44, f, 2);
    g.plateau(48, 16, 12, f);
    g.slope26DownRight(60, 16, 2);
    g.fillRect(68, 14, 2, 4, 'm');
    addSmallTrail(s, 14, 12, f, 2);
    addBigTrail(s, 49, 4, 15, 3);
    s.push({ kind: 'prop', propKind: 'toppin_cage', index: idx, x: px(54), y: groundY(16), label: `TOPPIN PAL ${idx + 1}` });
    if (idx === 1) {
      s.push({ kind: 'prop', propKind: 'toppin_cage', index: 3, x: px(30), y: groundY(f), label: 'TOPPIN PAL 4' });
    }
    if (idx === 2) {
      s.push({ kind: 'prop', propKind: 'toppin_cage', index: 4, x: px(30), y: groundY(f), label: 'TOPPIN PAL 5' });
      s.push({ kind: 'prop', propKind: 'exit_door', x: px(78), y: groundY(f), label: 'ESCAPE KRUNKED TOWER!' });
    }
    s.push({ kind: 'enemy', archetype: 'fork_imp', x: px(28), y: groundY(f) });
    s.push({ kind: 'enemy', archetype: 'blitz_trooper', x: px(64), y: groundY(f) });

    return {
      id: `exit_r${idx}`,
      name: `Crumbling Spire — Descent ${idx + 1}`,
      theme: 'spire',
      widthTiles: g.w,
      heightTiles: g.h,
      rows: g.toRows(),
      spawnX: px(4),
      spawnY: groundY(15),
      isEscapeChase: true,
      doors:
        idx < 2
          ? [
              {
                id: `exit_${idx}_to_${idx + 1}`,
                x: px(81),
                y: groundY(f),
                targetRoomIndex: idx + 1,
                targetX: px(4),
                targetY: groundY(15),
                requireUp: false,
                label: 'KEEP RUNNING!',
              },
            ]
          : [],
      spawns: s,
    };
  });

  return {
    id: 'exit',
    name: 'Crumbling Spire',
    subtitle: 'Grand Tower Escape Finale — Outrun the Collapse!',
    floor: 5,
    theme: 'spire',
    music: 'escape_spire',
    sRankScore: 5500,
    escapeSeconds: 338,
    hasPillar: false,
    hasLap2: false,
    featuredGimmick: 'Continuous All-Out Tower Collapse Escape',
    rooms,
  };
}

function buildSecretWorldLevel(): LevelDef {
  const f = 14;
  const archetypes: EnemyArchetypeId[] = ['slime_glob', 'fork_imp', 'ninja_slice', 'ufo_olive'];
  const rooms: RoomDef[] = [0, 1, 2, 3].map((idx) => {
    const g = new RoomGrid(64, 18, f);
    const s: RoomEntitySpawn[] = [];
    g.fillRect(16, 10, 2, 4, 'm');
    g.slope45UpRight(24, f, 3);
    g.plateau(27, 11, 12, f);
    g.fillRect(32, 7, 2, 4, 'M');
    g.slope45DownRight(39, 11, 3);
    g.oneWay(46, 10, 10);
    addBigTrail(s, 8, 6, f, 3);
    addBigTrail(s, 28, 4, 10, 3);
    addBigTrail(s, 47, 4, 9, 2);
    s.push({ kind: 'enemy', archetype: archetypes[idx], x: px(21), y: groundY(f) });
    s.push({ kind: 'enemy', archetype: archetypes[(idx + 1) % 4], x: px(36), y: groundY(11) });
    s.push({ kind: 'enemy', archetype: archetypes[(idx + 2) % 4], x: px(50), y: groundY(f) });

    if (idx === 3) {
      s.push({ kind: 'prop', propKind: 'exit_door', x: px(59), y: groundY(f), label: 'COMPLETE GAUNTLET' });
    }
    return {
      id: `secretworld_r${idx}`,
      name: `Secrets of the Spire — Trial ${idx + 1}`,
      theme: 'secret',
      widthTiles: g.w,
      heightTiles: g.h,
      rows: g.toRows(),
      spawnX: px(4),
      spawnY: groundY(f),
      isSecretRoom: true,
      secretIndex: idx % 3,
      doors:
        idx < 3
          ? [
              {
                id: `sw_${idx}_to_${idx + 1}`,
                x: px(61),
                y: groundY(f),
                targetRoomIndex: idx + 1,
                targetX: px(4),
                targetY: groundY(f),
                requireUp: false,
                label: `TRIAL ${idx + 2}`,
              },
            ]
          : [],
      spawns: s,
    };
  });

  return {
    id: 'secretworld',
    name: 'Secrets of the Spire',
    subtitle: 'Bonus Mode — Pure Secret Room Speed Gauntlet',
    floor: 0,
    theme: 'secret',
    music: 'secret_room',
    sRankScore: 38000,
    escapeSeconds: 0,
    hasPillar: false,
    hasLap2: false,
    secretGauntletMode: true,
    featuredGimmick: 'Nonstop Secret Gauntlet',
    rooms,
  };
}

function buildTrickyTreatLevel(): LevelDef {
  const f = 16;
  const rooms: RoomDef[] = [0, 1, 2].map((idx) => {
    const g = new RoomGrid(68, 20, f);
    const s: RoomEntitySpawn[] = [];
    g.slope26UpRight(14, f, 2);
    g.plateau(18, 14, 14, f);
    g.fillRect(24, 11, 2, 3, 'm');
    g.slope26DownRight(32, 14, 2);
    g.oneWay(40, 12, 12);
    // Pumpkin candy haul!
    for (let p = 0; p < 8; p++) {
      const tx = 10 + p * 6;
      const pyRow = tx >= 18 && tx < 32 ? 14 : p % 2 === 0 ? f : 12;
      s.push({
        kind: 'pickup',
        pickupKind: 'pumpkin',
        x: px(tx),
        y: groundY(pyRow) - 20,
      });
    }
    addBigTrail(s, 20, 4, 13, 3);
    s.push({ kind: 'enemy', archetype: 'ghost_ghoul', x: px(28), y: groundY(12) });
    s.push({ kind: 'enemy', archetype: 'static_minion', x: px(48), y: groundY(f) });

    if (idx === 0) {
      s.push({
        kind: 'prop',
        propKind: 'transform_totem',
        x: px(9),
        y: groundY(f),
        transformation: 'ghost',
        label: 'PHANTOM TOTEM',
      });
    }
    if (idx === 2) {
      s.push({ kind: 'prop', propKind: 'exit_door', x: px(63), y: groundY(f), label: 'CASH IN CANDY!' });
    }
    return {
      id: `trickytreat_r${idx}`,
      name: `Candy Panic — Wing ${idx + 1}`,
      theme: 'candy',
      widthTiles: g.w,
      heightTiles: g.h,
      rows: g.toRows(),
      spawnX: px(4),
      spawnY: groundY(f),
      doors:
        idx < 2
          ? [
              {
                id: `tt_${idx}_to_${idx + 1}`,
                x: px(65),
                y: groundY(f),
                targetRoomIndex: idx + 1,
                targetX: px(4),
                targetY: groundY(f),
                requireUp: false,
                label: `WING ${idx + 2}`,
              },
            ]
          : [],
      spawns: s,
    };
  });

  return {
    id: 'trickytreat',
    name: 'Candy Panic',
    subtitle: 'Bonus Mode — Spooky Pumpkin Rush',
    floor: 0,
    theme: 'candy',
    music: 'candy_panic',
    sRankScore: 12000,
    escapeSeconds: 120,
    hasPillar: false,
    hasLap2: false,
    candyPanicMode: true,
    featuredGimmick: 'Spooky Pumpkin Rush & Phantom Totem',
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
  medieval: buildStandardStage({
    id: 'medieval',
    name: 'Crusty Keep',
    subtitle: 'Armored Knight Slides & Castle Battlements',
    floor: 1,
    theme: 'keep',
    music: 'stage_keep',
    sRankScore: 20000,
    escapeSeconds: 170,
    featuredGimmick: 'Knight Armor Slope Slide',
    enemies: ['fork_imp', 'knight_squire', 'pepper_goblin'],
    transformation: 'knight',
  }),
  ruin: buildStandardStage({
    id: 'ruin',
    name: 'Ancient Ruins',
    subtitle: 'Cheese-Ball Rolls & Sunken Marble Temples',
    floor: 1,
    theme: 'ruins',
    music: 'stage_ruins',
    sRankScore: 17000,
    escapeSeconds: 180,
    featuredGimmick: 'Rolling Ball & Fire Butt Launch',
    enemies: ['tribal_cheese', 'bomb_imp', 'slime_glob'],
    transformation: 'ball',
    hazardTile: '^',
  }),
  dungeon: buildStandardStage({
    id: 'dungeon',
    name: 'Bloodsauce Catacombs',
    subtitle: 'Simmering Lava Pits & Scorching Chimney Jumps',
    floor: 1,
    theme: 'catacombs',
    music: 'stage_catacombs',
    sRankScore: 18500,
    escapeSeconds: 205,
    featuredGimmick: 'Lava Super-Boost & Fire Butt',
    enemies: ['pepper_goblin', 'fork_imp', 'bomb_imp'],
    transformation: 'fire_butt',
    hazardTile: 'L',
  }),

  // ---- FLOOR 2 ----
  badland: buildStandardStage({
    id: 'badland',
    name: 'Oregano Mesa',
    subtitle: 'Fiery Pepper Dashes Across Red-Rock Canyons',
    floor: 2,
    theme: 'mesa',
    music: 'stage_mesa',
    sRankScore: 19500,
    escapeSeconds: 213,
    featuredGimmick: 'Firemouth Flame Dash',
    enemies: ['tribal_cheese', 'cow_charger', 'pepper_goblin'],
    transformation: 'firemouth',
  }),
  graveyard: buildStandardStage({
    id: 'graveyard',
    name: 'Wasteyard Crypts',
    subtitle: 'Haunted Ghost Flight & Spectral Catacombs',
    floor: 2,
    theme: 'graveyard',
    music: 'stage_graveyard',
    sRankScore: 20500,
    escapeSeconds: 220,
    featuredGimmick: 'Phantom Free-Flight',
    enemies: ['ghost_ghoul', 'knight_squire', 'mushroom_spitter'],
    transformation: 'ghost',
  }),
  farm: buildStandardStage({
    id: 'farm',
    name: 'Fowl Farm',
    subtitle: 'Double-Jump Feathers & Barnyard Stampedes',
    floor: 2,
    theme: 'farm',
    music: 'stage_farm',
    sRankScore: 19000,
    escapeSeconds: 160,
    featuredGimmick: 'Beak Buddy Double-Jump & Glide',
    enemies: ['cow_charger', 'mushroom_spitter', 'slime_glob'],
    transformation: 'beak',
  }),
  saloon: buildStandardStage({
    id: 'saloon',
    name: 'Fast-Food Saloon',
    subtitle: 'Timed Outlet Gates & Turbo Weenie Mounts',
    floor: 2,
    theme: 'saloon',
    music: 'stage_saloon',
    sRankScore: 20000,
    escapeSeconds: 175,
    featuredGimmick: 'Weenie Mount & Timed Outlet Gates',
    enemies: ['tribal_cheese', 'bomb_imp', 'cow_charger'],
    transformation: 'weenie',
    useDashButton: true,
  }),

  // ---- FLOOR 3 ----
  plage: buildStandardStage({
    id: 'plage',
    name: 'Crusty Pier',
    subtitle: 'Boardwalk Barrels & Cannonball Broadsides',
    floor: 3,
    theme: 'pier',
    music: 'stage_pier',
    sRankScore: 23000,
    escapeSeconds: 185,
    featuredGimmick: 'Barrel Roll Through Metal',
    enemies: ['cannon_goblin', 'swedish_ape', 'pickle_brawler'],
    transformation: 'barrel',
  }),
  forest: buildForestLevel(),
  space: buildStandardStage({
    id: 'space',
    name: 'Deep-Dish Orbit',
    subtitle: 'Low-G Rocket Thrusters & Saucer Swarms',
    floor: 3,
    theme: 'orbit',
    music: 'stage_orbit',
    sRankScore: 20000,
    escapeSeconds: 185,
    featuredGimmick: 'Rocket Flight Steering',
    enemies: ['ufo_olive', 'static_minion', 'cannon_goblin'],
    transformation: 'rocket',
  }),
  minigolf: buildStandardStage({
    id: 'minigolf',
    name: 'Greaseball Golf',
    subtitle: 'Kick the Giant Dough-Ball Under Par!',
    floor: 3,
    theme: 'golf',
    music: 'stage_golf',
    sRankScore: 23000,
    escapeSeconds: 270,
    featuredGimmick: 'Kinetic Golf Ball & Hole-In-One Bonus',
    enemies: ['burger_golfer', 'slime_glob', 'archer_goblin'],
    useGolf: true,
  }),

  // ---- FLOOR 4 ----
  street: buildStandardStage({
    id: 'street',
    name: 'Hog Metro',
    subtitle: 'Neon Express Taxis & Tag-Team Back-Alleys',
    floor: 4,
    theme: 'metro',
    music: 'stage_metro',
    sRankScore: 20000,
    escapeSeconds: 190,
    featuredGimmick: 'Express Taxi Warps & Gusto Tag-Team',
    enemies: ['ninja_slice', 'pickle_brawler', 'static_minion'],
    useTaxi: true,
    allowRiderMid: 'gusto_chonks',
  }),
  sewer: buildStandardStage({
    id: 'sewer',
    name: 'Oh Grime Drain',
    subtitle: 'Sticky Cheese Wall-Sticks & Pipe Slides',
    floor: 4,
    theme: 'drain',
    music: 'stage_drain',
    sRankScore: 20000,
    escapeSeconds: 275,
    featuredGimmick: 'Sticky Cheese Wall Cling',
    enemies: ['ninja_slice', 'slime_glob', 'mushroom_spitter'],
    transformation: 'cheese_sticky',
    useCheeseWall: true,
  }),
  industrial: buildStandardStage({
    id: 'industrial',
    name: 'Peppo Foundry',
    subtitle: 'Conveyor Lines & Flat-Pack Presses',
    floor: 4,
    theme: 'foundry',
    music: 'stage_foundry',
    sRankScore: 20000,
    escapeSeconds: 230,
    featuredGimmick: 'Conveyor Belts & Boxed Flat Glide',
    enemies: ['clone_bot', 'bomb_imp', 'cannon_goblin'],
    transformation: 'boxed_flat',
    surfaceTile: '>',
  }),
  freezer: buildStandardStage({
    id: 'freezer',
    name: 'Frosty Freezer',
    subtitle: 'Glacial Ice Runs & Inferno Pepper Flight',
    floor: 4,
    theme: 'freezer',
    music: 'stage_freezer',
    sRankScore: 18200,
    escapeSeconds: 220,
    featuredGimmick: 'Slick Ice Momentum & Inferno Pepper',
    enemies: ['fake_santa', 'swedish_ape', 'clone_bot'],
    transformation: 'inferno_pepper',
    surfaceTile: 'I',
  }),

  // ---- FLOOR 5 ----
  chateau: buildStandardStage({
    id: 'chateau',
    name: 'Krunk Manor',
    subtitle: 'Spectral Halls, Cross Aura & Heavy Blasters',
    floor: 5,
    theme: 'manor',
    music: 'stage_manor',
    sRankScore: 18000,
    escapeSeconds: 210,
    featuredGimmick: 'Cross Aura & Shotgun Rampage',
    enemies: ['ghost_ghoul', 'knight_squire', 'ninja_slice'],
    transformation: 'cross',
  }),
  kidsparty: buildStandardStage({
    id: 'kidsparty',
    name: "Don't Wake The Bots",
    subtitle: 'Stealth Sensors, Shotgun Counters & Arcade Chaos',
    floor: 5,
    theme: 'arcade',
    music: 'stage_arcade',
    sRankScore: 22000,
    escapeSeconds: 205,
    featuredGimmick: 'Alarm Sensors & Shotgun Counter-Strike',
    enemies: ['animatronic_bot', 'static_minion', 'clone_bot'],
    transformation: 'shotgun',
    useAlarm: true,
  }),
  war: buildStandardStage({
    id: 'war',
    name: 'BLITZ!',
    subtitle: '60-Second Live Countdown — Smash Terminals to Survive!',
    floor: 5,
    theme: 'blitz',
    music: 'stage_blitz',
    sRankScore: 21500,
    escapeSeconds: 60,
    featuredGimmick: 'Live 60s Blitz Timer + Time Terminals + Shotgun',
    enemies: ['blitz_trooper', 'cannon_goblin', 'clone_bot'],
    transformation: 'shotgun',
    warTimerMode: true,
  }),

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

  // Optional Bonus Mode Gates (Tutorial, Candy Panic, Secret World, Exit)
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
    [{ xTile: 9, yRow: 10, stageId: 'secretworld', label: 'BONUS: SECRETS OF THE SPIRE' }],
  ),
};

export function getLevelDef(id: StageId): LevelDef {
  return LEVELS[id];
}
