// ============================================================================
// Krunked Tower — Room Parser, Hub/Stage/Boss Loader & Interactive Runtime
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// ============================================================================

import { ENGINE_CONSTANTS, TileType } from '../contracts/index';
import type {
  ActiveRoomState,
  BossId,
  FloorId,
  InputFrame,
  MusicTrackId,
  PickupState,
  PropState,
  RoomDef,
  RoomEntitySpawn,
  SimState,
  StageId,
  TileTypeValue,
} from '../contracts/index';
import {
  FLOOR_TOLLS,
  HUB_ROOMS,
  getBossDef,
  getLevelDef,
} from '../data/index';
import { createBossState } from './bosses';
import {
  breakTileAt,
  getPlayerBox,
  getTileAt,
  isSolidTile,
  moveAndCollideBox,
} from './collision';
import { damageEnemy } from './combat';
import { spawnRoomEnemies } from './enemies';
import { addScore, finalizeStageRank, refillCombo } from './scoring';
import { applyTransformation, clearTransformation } from './transformations';

const T = ENGINE_CONSTANTS.TILE_SIZE;

const ASCII_TO_TILE: Record<string, TileTypeValue> = {
  '.': TileType.EMPTY,
  '#': TileType.SOLID,
  '-': TileType.ONE_WAY,
  '/': TileType.SLOPE_45_UP_RIGHT,
  '\\': TileType.SLOPE_45_UP_LEFT,
  a: TileType.SLOPE_26_LOW_RIGHT,
  b: TileType.SLOPE_26_HIGH_RIGHT,
  c: TileType.SLOPE_26_HIGH_LEFT,
  d: TileType.SLOPE_26_LOW_LEFT,
  m: TileType.BREAK_MARBLE,
  M: TileType.BREAK_METAL,
  P: TileType.PILLAR_BLOCK_CLOSED,
  O: TileType.PILLAR_BLOCK_OPEN,
  I: TileType.ICE_SOLID,
  '>': TileType.CONVEYOR_RIGHT,
  '<': TileType.CONVEYOR_LEFT,
  L: TileType.LAVA_HAZARD,
  '^': TileType.SPIKE_HAZARD,
  C: TileType.CHEESE_STICK_WALL,
  G: TileType.BREAK_OUTLET_GATE,
  S: TileType.SECRET_WALL,
};

export function parseRoomDef(roomDef: RoomDef): ActiveRoomState {
  const w = roomDef.widthTiles;
  const h = roomDef.heightTiles;
  const tiles = new Uint8Array(w * h);
  const brokenMask = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = roomDef.rows[y] ?? '';
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.';
      tiles[y * w + x] = ASCII_TO_TILE[ch] ?? TileType.EMPTY;
    }
  }

  return {
    id: roomDef.id,
    name: roomDef.name,
    theme: roomDef.theme,
    widthTiles: w,
    heightTiles: h,
    tiles,
    brokenMask,
    doors: roomDef.doors.map((d) => ({ ...d })),
    isSecretRoom: Boolean(roomDef.isSecretRoom),
    secretIndex: roomDef.secretIndex ?? -1,
    outletGateTimer: 0,
    alarmActiveTicks: 0,
  };
}

function getPropDimensions(kind: PropState['kind']): { w: number; h: number } {
  switch (kind) {
    case 'pillar_chronos':
      return { w: 48, h: 80 };
    case 'toppin_cage':
      return { w: 40, h: 48 };
    case 'gerry_janitor':
      return { w: 34, h: 46 };
    case 'treasure_chest':
      return { w: 44, h: 44 };
    case 'lap2_portal':
      return { w: 52, h: 68 };
    case 'exit_door':
      return { w: 54, h: 72 };
    case 'secret_eye':
      return { w: 40, h: 48 };
    case 'hub_stage_gate':
    case 'hub_boss_gate':
    case 'hub_bonus_gate':
      return { w: 64, h: 80 };
    case 'hub_elevator':
      return { w: 68, h: 84 };
    case 'hub_broker':
      return { w: 46, h: 58 };
    case 'golf_ball':
      return { w: 32, h: 32 };
    case 'golf_goal':
      return { w: 48, h: 54 };
    case 'dash_button':
      return { w: 42, h: 36 };
    case 'taxi_warp':
      return { w: 56, h: 48 };
    case 'alarm_sensor':
      return { w: 42, h: 56 };
    case 'time_terminal':
      return { w: 44, h: 54 };
    case 'buddy_switch':
      return { w: 44, h: 48 };
    case 'transform_totem':
      return { w: 42, h: 50 };
    default:
      return { w: 40, h: 48 };
  }
}

function getHubMusic(floor: FloorId): MusicTrackId {
  return `hub_${floor}` as MusicTrackId;
}

function snapCameraToPlayer(state: SimState): void {
  const roomW = state.room.widthTiles * T;
  const roomH = state.room.heightTiles * T;
  const maxX = Math.max(0, roomW - ENGINE_CONSTANTS.VIEWPORT_W);
  const maxY = Math.max(0, roomH - ENGINE_CONSTANTS.VIEWPORT_H);
  const cx = Math.max(
    0,
    Math.min(maxX, state.player.x - ENGINE_CONSTANTS.VIEWPORT_W * 0.5),
  );
  const cy = Math.max(
    0,
    Math.min(
      maxY,
      state.player.y + ENGINE_CONSTANTS.CAMERA_OFFSET_Y - ENGINE_CONSTANTS.VIEWPORT_H * 0.5,
    ),
  );
  state.camera.x = cx;
  state.camera.y = cy;
  state.camera.prevX = cx;
  state.camera.prevY = cy;
  state.camera.targetX = cx;
  state.camera.targetY = cy;
  state.camera.lookAheadX = 0;
  state.camera.lookAheadY = 0;
}

function resetPlayerKinematics(state: SimState, x: number, y: number): void {
  const p = state.player;
  p.x = x;
  p.y = y;
  p.prevX = x;
  p.prevY = y;
  p.vx = 0;
  p.vy = 0;
  p.movespeed = 0;
  p.wallspeed = 0;
  p.state = 'normal';
  p.grounded = false;
  p.crouch = false;
  p.freefallSmash = 0;
  p.grabDashTicks = 0;
  p.tauntTimer = 0;
  p.parryTicks = 0;
  p.hurtTicks = 0;
  p.invulnTicks = 0;
  p.grabbedEnemyId = null;
}

function createPropFromSpawn(
  state: SimState,
  roomDef: RoomDef,
  sp: RoomEntitySpawn,
  spawnIndex: number,
): PropState | null {
  if (!sp.propKind) return null;
  const dims = getPropDimensions(sp.propKind);
  let active = true;
  let triggered = false;

  // Sync persistent stage progress so revisited rooms stay coherent
  if (sp.propKind === 'toppin_cage' && sp.index !== undefined) {
    if (state.stageStats.toppinsCollected[sp.index]) {
      active = false;
      triggered = true;
    }
  } else if (sp.propKind === 'gerry_janitor' && state.stageStats.gerryFound) {
    active = false;
    triggered = true;
  } else if (sp.propKind === 'treasure_chest' && state.stageStats.treasureCollected) {
    active = false;
    triggered = true;
  } else if (sp.propKind === 'pillar_chronos' && state.escape.pillarBroken) {
    active = false;
    triggered = true;
  } else if (sp.propKind === 'time_terminal') {
    const key = `term:${roomDef.id}:${spawnIndex}`;
    if (state.collectedIds.includes(key)) {
      active = false;
      triggered = true;
    }
  } else if (sp.propKind === 'golf_ball' || sp.propKind === 'golf_goal') {
    const holeKey = `golf:${roomDef.id}:${sp.index ?? 0}`;
    if (state.collectedIds.includes(holeKey)) {
      active = false;
      triggered = true;
    }
  } else if (sp.propKind === 'alarm_sensor') {
    const alarmKey = `alarm_broken:${roomDef.id}:${spawnIndex}`;
    if (state.collectedIds.includes(alarmKey)) {
      active = false;
      triggered = true;
    }
  }

  return {
    id: state.nextEntityId++,
    kind: sp.propKind,
    x: sp.x,
    y: sp.y,
    width: dims.w,
    height: dims.h,
    active,
    triggered,
    index: sp.index ?? spawnIndex,
    label: sp.label,
    targetStageId: sp.targetStageId,
    targetBossId: sp.targetBossId,
    targetFloor: sp.targetFloor,
    targetRoomIndex: sp.targetRoomIndex,
    targetX: sp.targetX,
    targetY: sp.targetY,
    transformation: sp.transformation,
    riderTarget: sp.riderTarget,
    timerTicks: 0,
    vx: 0,
    vy: 0,
    parCount: sp.propKind === 'golf_ball' ? 3 : undefined,
    strokes: sp.propKind === 'golf_ball' ? 0 : undefined,
  };
}

function populateRoomEntities(state: SimState, roomDef: RoomDef): void {
  state.enemies = [];
  state.projectiles = [];
  state.pickups = [];
  state.props = [];

  for (let i = 0; i < roomDef.spawns.length; i++) {
    const sp = roomDef.spawns[i];
    if (sp.kind === 'pickup' && sp.pickupKind) {
      if (sp.escapeOnly && !state.escape.active) continue;
      const key = `pickup:${roomDef.id}:${i}`;
      if (state.collectedIds.includes(key)) continue;

      // Prevent pickups from spawning overlapped inside solid/breakable/pillar/hazard geometry
      const tx = Math.floor(sp.x / ENGINE_CONSTANTS.TILE_SIZE);
      const ty = Math.floor(sp.y / ENGINE_CONSTANTS.TILE_SIZE);
      if (
        tx >= 0 &&
        ty >= 0 &&
        tx < state.room.widthTiles &&
        ty < state.room.heightTiles
      ) {
        const occ = state.room.tiles[ty * state.room.widthTiles + tx];
        if (
          occ === TileType.SOLID ||
          occ === TileType.BREAK_MARBLE ||
          occ === TileType.BREAK_METAL ||
          occ === TileType.PILLAR_BLOCK_CLOSED ||
          occ === TileType.PILLAR_BLOCK_OPEN ||
          occ === TileType.ICE_SOLID ||
          occ === TileType.CONVEYOR_RIGHT ||
          occ === TileType.CONVEYOR_LEFT ||
          occ === TileType.CHEESE_STICK_WALL ||
          occ === TileType.BREAK_OUTLET_GATE ||
          occ === TileType.LAVA_HAZARD ||
          occ === TileType.SPIKE_HAZARD
        ) {
          continue;
        }
      }

      let value: number = ENGINE_CONSTANTS.SMALL_TOPPING_PTS;
      let comboRefill: number = ENGINE_CONSTANTS.SMALL_TOPPING_COMBO;
      if (sp.pickupKind === 'big_topping') {
        value = ENGINE_CONSTANTS.BIG_TOPPING_PTS;
        comboRefill = ENGINE_CONSTANTS.BIG_TOPPING_COMBO;
      } else if (sp.pickupKind === 'pizza_slice') {
        value = 50;
        comboRefill = 15;
      } else if (sp.pickupKind === 'clock_pickup') {
        value = 50;
        comboRefill = 15;
      } else if (sp.pickupKind === 'pumpkin') {
        value = 250;
        comboRefill = 20;
      }

      const pickup: PickupState = {
        id: state.nextEntityId++,
        kind: sp.pickupKind,
        x: sp.x,
        y: sp.y,
        collected: false,
        value,
        comboRefill,
        bobOffset: (i * 11) % 60,
      };
      state.pickups.push(pickup);
    } else if (sp.kind === 'prop' && sp.propKind) {
      if (sp.escapeOnly && !state.escape.active) continue;
      const prop = createPropFromSpawn(state, roomDef, sp, i);
      if (prop) {
        state.props.push(prop);
      }
    }
  }

  spawnRoomEnemies(state, roomDef, state.escape.active);
}

export function loadHubFloor(
  state: SimState,
  floor?: FloorId,
  spawnX?: number,
  spawnY?: number,
): void {
  const targetFloor = floor ?? state.hub.floor ?? 1;
  state.screen = 'hub';
  state.floor = targetFloor;
  state.hub.floor = targetFloor;
  state.stageId = null;
  state.bossId = null;
  state.boss = null;
  state.roomIndex = 0;
  state.stageComplete = false;
  state.gameOver = false;
  state.gameOverReason = null;
  state.bossIntroTicks = 0;

  state.escape = {
    active: false,
    timerTicks: 0,
    maxTicks: 0,
    lap: 1,
    megaCrustActive: false,
    megaCrustX: 0,
    megaCrustY: 0,
    megaCrustSpeed: ENGINE_CONSTANTS.MEGA_CRUST_BASE_SPEED,
    pillarBroken: false,
    warMode: false,
    terminalsHit: 0,
  };

  clearTransformation(state);
  state.player.rider = state.character;
  state.player.hasRevolver = false;
  state.player.hasShotgun = false;
  state.player.combo = 0;
  state.player.comboTime = 0;

  const roomDef = HUB_ROOMS[targetFloor];
  state.room = parseRoomDef(roomDef);
  populateRoomEntities(state, roomDef);

  const sx = spawnX ?? roomDef.spawnX;
  const sy = spawnY ?? roomDef.spawnY;
  resetPlayerKinematics(state, sx, sy);
  snapCameraToPlayer(state);

  state.events.push({ type: 'music', track: getHubMusic(targetFloor) });
}

export function loadStageRoom(
  state: SimState,
  roomIndex: number,
  spawnX?: number,
  spawnY?: number,
): void {
  if (!state.stageId) return;
  const level = getLevelDef(state.stageId);
  const clampedIdx = Math.max(0, Math.min(level.rooms.length - 1, roomIndex));
  const roomDef = level.rooms[clampedIdx];

  state.roomIndex = clampedIdx;
  if (!state.visitedRooms.includes(clampedIdx)) {
    state.visitedRooms.push(clampedIdx);
    if (level.secretGauntletMode && clampedIdx > 0) {
      addScore(state, 1500, spawnX ?? roomDef.spawnX, (spawnY ?? roomDef.spawnY) - 48);
      refillCombo(state);
    }
  }

  state.room = parseRoomDef(roomDef);
  populateRoomEntities(state, roomDef);

  const sx = spawnX ?? roomDef.spawnX;
  const sy = spawnY ?? roomDef.spawnY;
  state.player.x = sx;
  state.player.y = sy;
  state.player.prevX = sx;
  state.player.prevY = sy;
  state.player.grabbedEnemyId = null;

  // Automatic Gusto & Chonks rider zone handling
  if (roomDef.allowRider === 'gusto_chonks') {
    if (state.player.rider !== 'gusto_chonks') {
      if (state.player.transformation !== 'none' && state.player.transformation !== 'shotgun') {
        clearTransformation(state);
      }
      state.player.rider = 'gusto_chonks';
      state.events.push({
        type: 'callout',
        text: 'TAG TEAM: GUSTO & CHONKS!',
        durationTicks: 85,
      });
    }
  } else if (state.player.rider === 'gusto_chonks' && !roomDef.isSecretRoom) {
    state.player.rider = state.character;
  }

  // Music switching for secret rooms vs stage / escape track
  if (roomDef.isSecretRoom) {
    state.events.push({ type: 'music', track: 'secret_room' });
  } else if (state.escape.active) {
    state.events.push({
      type: 'music',
      track:
        level.id === 'exit'
          ? 'escape_spire'
          : state.escape.lap >= 2
            ? 'escape_lap2'
            : level.warTimerMode
              ? 'stage_blitz'
              : level.candyPanicMode
                ? 'candy_panic'
                : 'escape_krunk_time',
    });
  } else {
    state.events.push({ type: 'music', track: level.music });
  }

  // Reposition active Mega-Crust safely behind room entry
  if (state.escape.megaCrustActive) {
    state.escape.megaCrustX = sx - state.player.facing * 320;
    state.escape.megaCrustY = sy - 100;
  }

  snapCameraToPlayer(state);
}

export function loadStage(state: SimState, stageId: StageId): void {
  const level = getLevelDef(stageId);

  state.screen = 'stage';
  state.stageId = stageId;
  state.bossId = null;
  state.boss = null;
  state.stageComplete = false;
  state.gameOver = false;
  state.gameOverReason = null;
  state.lastRankSummary = null;
  state.bossIntroTicks = 0;
  state.visitedRooms = [];
  state.collectedIds = [];

  state.stageStats = {
    score: 0,
    toppinsCollected: [false, false, false, false, false],
    secretsFound: [false, false, false],
    gerryFound: false,
    treasureCollected: false,
    lap2Done: false,
    hitsTaken: 0,
    enemiesDefeated: 0,
    parriesLanded: 0,
    superTauntsUsed: 0,
    elapsedTicks: 0,
    rank: 'D',
    sRankTarget: level.sRankScore,
    pRankEligible: false,
  };

  const escapeTicks = level.escapeSeconds * ENGINE_CONSTANTS.SIM_HZ;
  state.escape = {
    active: false,
    timerTicks: escapeTicks,
    maxTicks: escapeTicks,
    lap: 1,
    megaCrustActive: false,
    megaCrustX: 0,
    megaCrustY: 0,
    megaCrustSpeed: ENGINE_CONSTANTS.MEGA_CRUST_BASE_SPEED,
    pillarBroken: false,
    warMode: Boolean(level.warTimerMode),
    terminalsHit: 0,
  };

  clearTransformation(state);
  const p = state.player;
  p.rider = state.character;
  p.hasRevolver = false;
  p.hasShotgun = Boolean(level.warTimerMode);
  p.combo = 0;
  p.comboTime = 0;
  p.comboScore = 0;
  p.comboStarted = false;
  p.comboDropped = false;
  p.maxCombo = 0;
  p.superchargeKills = 0;
  p.superTauntReady = false;
  p.escapeTauntsUsed = 0;
  p.hp = ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP;
  p.maxHp = ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP;

  if (level.warTimerMode) {
    applyTransformation(state, 'shotgun');
  }

  // Continuous-timer modes start immediately on stage load (before room spawn)
  if (level.warTimerMode || level.candyPanicMode || stageId === 'exit') {
    state.escape.active = true;
    state.events.push({
      type: 'escape_started',
      stageId,
      seconds: level.escapeSeconds,
    });
  }

  resetPlayerKinematics(state, level.rooms[0].spawnX, level.rooms[0].spawnY);
  loadStageRoom(state, 0, level.rooms[0].spawnX, level.rooms[0].spawnY);

  state.events.push({ type: 'music', track: level.music, forceRestart: true });
}

export function loadBossArena(state: SimState, bossId: BossId): void {
  const bossDef = getBossDef(bossId);

  state.screen = 'boss';
  state.bossId = bossId;
  state.stageId = null;
  state.roomIndex = 0;
  state.stageComplete = false;
  state.gameOver = false;
  state.gameOverReason = null;
  state.lastRankSummary = null;
  state.bossIntroTicks = 75;
  state.visitedRooms = [0];
  state.collectedIds = [];

  state.stageStats = {
    score: 0,
    toppinsCollected: [false, false, false, false, false],
    secretsFound: [false, false, false],
    gerryFound: false,
    treasureCollected: false,
    lap2Done: false,
    hitsTaken: 0,
    enemiesDefeated: 0,
    parriesLanded: 0,
    superTauntsUsed: 0,
    elapsedTicks: 0,
    rank: 'S',
    sRankTarget: 5000,
    pRankEligible: true,
  };

  state.escape = {
    active: false,
    timerTicks: 0,
    maxTicks: 0,
    lap: 1,
    megaCrustActive: false,
    megaCrustX: 0,
    megaCrustY: 0,
    megaCrustSpeed: ENGINE_CONSTANTS.MEGA_CRUST_BASE_SPEED,
    pillarBroken: false,
    warMode: false,
    terminalsHit: 0,
  };

  clearTransformation(state);
  const p = state.player;
  p.rider = state.character;
  p.hp = ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP;
  p.maxHp = ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP;
  p.hasShotgun = false;
  p.hasRevolver = Boolean(bossDef.givesRevolver);
  p.combo = 0;
  p.comboTime = 0;
  if (bossDef.givesRevolver) {
    applyTransformation(state, 'revolver');
  }

  state.room = parseRoomDef(bossDef.room);
  state.enemies = [];
  state.projectiles = [];
  state.pickups = [];
  state.props = [];

  resetPlayerKinematics(state, bossDef.room.spawnX, bossDef.room.spawnY);
  state.boss = createBossState(bossDef, state.character);
  snapCameraToPlayer(state);

  const bossLabel =
    state.character === 'static' && bossDef.staticName ? bossDef.staticName : bossDef.name;
  state.events.push({ type: 'music', track: bossDef.music, forceRestart: true });
  state.events.push({
    type: 'callout',
    text: `VS ${bossLabel.toUpperCase()} — ${bossDef.title.toUpperCase()}!`,
    durationTicks: 100,
  });
}

export function startEscape(state: SimState): void {
  if (!state.stageId) return;
  if (state.escape.active && state.escape.pillarBroken) return;

  const level = getLevelDef(state.stageId);
  const secs = level.escapeSeconds > 0 ? level.escapeSeconds : 155;
  state.escape.active = true;
  state.escape.pillarBroken = true;
  state.escape.maxTicks = secs * ENGINE_CONSTANTS.SIM_HZ;
  state.escape.timerTicks = state.escape.maxTicks;

  for (const prop of state.props) {
    if (prop.kind === 'pillar_chronos') {
      prop.active = false;
      prop.triggered = true;
    }
  }

  // Spawn escape-only enemies AND escape-only props (e.g. Silent Arcade Shotgun Payback Totem!)
  const roomDef = level.rooms[state.roomIndex];
  let unlockedShotgunPayback = false;
  if (roomDef) {
    spawnRoomEnemies(state, roomDef, true);
    for (let i = 0; i < roomDef.spawns.length; i++) {
      const sp = roomDef.spawns[i];
      if (sp.kind !== 'prop' || !sp.escapeOnly || !sp.propKind) continue;
      const alreadyExists = state.props.some(
        (existing) =>
          existing.kind === sp.propKind &&
          Math.abs(existing.x - sp.x) < 4 &&
          Math.abs(existing.y - sp.y) < 4,
      );
      if (alreadyExists) continue;
      const prop = createPropFromSpawn(state, roomDef, sp, i);
      if (prop) {
        state.props.push(prop);
        state.events.push({
          type: 'particle',
          kind: 'starburst',
          x: prop.x,
          y: prop.y - 24,
          count: 14,
          color: '#ffbe0b',
        });
        if (prop.kind === 'transform_totem' && prop.transformation === 'shotgun') {
          unlockedShotgunPayback = true;
        }
      }
    }
  }

  state.hitstopTicks = Math.max(state.hitstopTicks, 6);
  state.shakeMag = Math.max(state.shakeMag, 10);
  state.shakeTimer = Math.max(state.shakeTimer, 28);
  state.tv.calloutText = unlockedShotgunPayback ? 'PAYBACK SHOTGUN UNLOCKED!' : 'KRUNK TIME!';
  state.tv.calloutTimer = 120;

  state.events.push({ type: 'sfx', sfx: 'pillar_smash' });
  state.events.push({ type: 'music', track: 'escape_krunk_time', forceRestart: true });
  state.events.push({ type: 'escape_started', stageId: state.stageId, seconds: secs });
  state.events.push({ type: 'rumble', strong: 0.9, weak: 0.6, durationMs: 280 });
  state.events.push({
    type: 'callout',
    text: unlockedShotgunPayback
      ? 'KRUNK TIME! GRAB THE SHOTGUN — PAYBACK TIME!'
      : 'KRUNK TIME! RUN BACK TO THE EXIT!',
    durationTicks: 120,
  });
}

export function triggerLap2(state: SimState): void {
  if (!state.stageId) return;
  const level = getLevelDef(state.stageId);

  state.escape.active = true;
  state.escape.pillarBroken = true;
  state.escape.lap = 2;
  state.stageStats.lap2Done = true;

  // Ensure escape timer is running if triggered via debug before Pillar smash
  if (state.escape.timerTicks <= 0 && !state.escape.megaCrustActive) {
    const secs = level.escapeSeconds > 0 ? level.escapeSeconds : 155;
    state.escape.maxTicks = secs * ENGINE_CONSTANTS.SIM_HZ;
    state.escape.timerTicks = state.escape.maxTicks;
  }

  addScore(state, ENGINE_CONSTANTS.LAP2_PTS, state.player.x, state.player.y - 54);
  refillCombo(state);

  // Respawn enemies (and Time Terminals in WAR mode) for Lap 2 carnage!
  state.collectedIds = state.collectedIds.filter(
    (k) => !k.startsWith('enemy:') && !(level.warTimerMode && k.startsWith('term:')),
  );

  state.events.push({ type: 'sfx', sfx: 'lap2_enter' });
  state.events.push({ type: 'music', track: 'escape_lap2', forceRestart: true });
  state.events.push({ type: 'lap2_started', stageId: state.stageId });
  state.events.push({
    type: 'particle',
    kind: 'confetti',
    x: state.player.x,
    y: state.player.y - 24,
    count: 20,
    color: '#ff006e',
  });
  state.events.push({
    type: 'callout',
    text: 'LAP 2! DOUBLE THE CHAOS! +3000!',
    durationTicks: 120,
  });

  // Warp player safely to the Pillar room (or Room 0 in WAR mode)
  let targetRoomIdx = 0;
  if (!level.warTimerMode) {
    const pillarRoomIdx = level.rooms.findIndex((r) =>
      r.spawns.some((s) => s.propKind === 'pillar_chronos'),
    );
    targetRoomIdx = pillarRoomIdx >= 0 ? pillarRoomIdx : Math.max(0, level.rooms.length - 1);
  }
  const destRoom = level.rooms[targetRoomIdx];
  const pillarSpawn = destRoom.spawns.find((s) => s.propKind === 'pillar_chronos');
  let warpX = destRoom.spawnX;
  let warpY = destRoom.spawnY;

  if (pillarSpawn) {
    const candidateX = Math.max(128, pillarSpawn.x - 160);
    const candidateY = pillarSpawn.y;
    const tempParsed = parseRoomDef(destRoom);
    const tx = Math.floor(candidateX / T);
    const bodyTy = Math.floor((candidateY - 22) / T);
    const floorTy = Math.floor((candidateY + 2) / T);
    const bodyTile = getTileAt(tempParsed, tx, bodyTy, true);
    const floorTile = getTileAt(tempParsed, tx, floorTy, true);
    if (!isSolidTile(bodyTile) && (isSolidTile(floorTile) || floorTile === TileType.ONE_WAY)) {
      warpX = candidateX;
      warpY = candidateY;
    }
  }

  loadStageRoom(state, targetRoomIdx, warpX, warpY);
}

function overlapsBox(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
): boolean {
  return ax2 > bx1 && ax1 < bx2 && ay2 > by1 && ay1 < by2;
}

function meltIceTileAt(state: SimState, tx: number, ty: number): boolean {
  const room = state.room;
  if (tx <= 0 || tx >= room.widthTiles - 1 || ty <= 0 || ty >= room.heightTiles - 1) {
    return false;
  }
  const idx = ty * room.widthTiles + tx;
  if (room.brokenMask[idx] === 1) return false;
  if (room.tiles[idx] !== TileType.ICE_SOLID) return false;

  room.brokenMask[idx] = 1;
  const cx = tx * T + T * 0.5;
  const cy = ty * T + T * 0.5;
  addScore(state, 15, cx, cy);
  state.shakeMag = Math.max(state.shakeMag, 2.2);
  state.shakeTimer = Math.max(state.shakeTimer, 4);
  state.events.push(
    { type: 'sfx', sfx: 'block_marble', pitchJitter: 0.14 },
    { type: 'particle', kind: 'flame', x: cx, y: cy, count: 5, color: '#ff6b2b' },
    { type: 'particle', kind: 'smoke', x: cx, y: cy, count: 4, color: '#c8f0ff' },
  );
  return true;
}

/**
 * Allows Firemouth Pepper and Inferno Pepper (plus Firemouth flame jets)
 * to melt vertical/overhead `ICE_SOLID` barriers without ever dissolving icy floors underfoot!
 */
function stepIceBarrierMelt(state: SimState, input: InputFrame): void {
  const p = state.player;
  const tr = p.transformation;
  const footTy = Math.floor((p.y - 1) / T);

  if (tr === 'firemouth' || tr === 'inferno_pepper' || tr === 'fire_butt') {
    const frontTx = Math.floor((p.x + p.facing * 20) / T);
    const minTy = Math.floor((p.y - 44) / T);
    for (let ty = minTy; ty <= footTy; ty++) {
      // Only melt wall tiles strictly above ground floor row so ice floors remain solid underfoot
      if (ty < Math.floor((p.y + 2) / T)) {
        meltIceTileAt(state, frontTx, ty);
      }
    }

    // Firemouth active breath cone melts ice barriers up to 4 tiles ahead!
    if (tr === 'firemouth' && (input.grabPressed || input.shootPressed)) {
      for (let dist = 1; dist <= 4; dist++) {
        const tx = Math.floor(p.x / T) + p.facing * dist;
        let hitNonIceSolid = false;
        for (let ty = minTy; ty <= footTy; ty++) {
          const tile = getTileAt(state.room, tx, ty, state.escape.active);
          if (tile === TileType.ICE_SOLID) {
            meltIceTileAt(state, tx, ty);
          } else if (isSolidTile(tile)) {
            hitNonIceSolid = true;
          }
        }
        if (hitNonIceSolid) break;
      }
    }

    // Inferno Pepper & Fire Butt rocket upward through overhead ice ceilings!
    if ((tr === 'inferno_pepper' || tr === 'fire_butt') && p.vy < -1.5) {
      const headTy = Math.floor((p.y - 50) / T);
      const minTx = Math.floor((p.x - 14) / T);
      const maxTx = Math.floor((p.x + 14) / T);
      for (let tx = minTx; tx <= maxTx; tx++) {
        meltIceTileAt(state, tx, headTy);
      }
    }
  }

  // Player flame projectiles melt ICE_SOLID barriers right ahead of impact
  for (let i = 0; i < state.projectiles.length; i++) {
    const pr = state.projectiles[i];
    if (pr.owner !== 'player' || pr.kind !== 'flame') continue;
    const lookTx = Math.floor((pr.x + pr.vx) / T);
    const lookTy = Math.floor(pr.y / T);
    meltIceTileAt(state, lookTx, lookTy);
    meltIceTileAt(state, lookTx, lookTy - 1);
  }
}

function triggerTimeTerminal(
  state: SimState,
  prop: PropState,
  roomId: string,
  spawnKeyIdx: number,
): void {
  if (!prop.active) return;
  prop.active = false;
  prop.triggered = true;
  state.collectedIds.push(`term:${roomId}:${spawnKeyIdx}`);
  state.escape.terminalsHit += 1;
  state.escape.timerTicks += 30 * ENGINE_CONSTANTS.SIM_HZ;
  state.escape.maxTicks = Math.max(state.escape.maxTicks, state.escape.timerTicks);
  state.escape.megaCrustActive = false;
  addScore(state, 500, prop.x, prop.y - 44);
  refillCombo(state);
  state.hitstopTicks = Math.max(state.hitstopTicks, 3);
  state.shakeMag = Math.max(state.shakeMag, 5);
  state.shakeTimer = Math.max(state.shakeTimer, 10);
  state.events.push(
    { type: 'sfx', sfx: 'time_extend' },
    { type: 'rumble', strong: 0.55, weak: 0.45, durationMs: 120 },
    {
      type: 'particle',
      kind: 'starburst',
      x: prop.x,
      y: prop.y - 26,
      count: 14,
      color: '#52ff9b',
    },
    {
      type: 'particle',
      kind: 'confetti',
      x: prop.x,
      y: prop.y - 26,
      count: 10,
      color: '#ffd166',
    },
    {
      type: 'callout',
      text: 'TIME TERMINAL HIT! +30 SECONDS!',
      durationTicks: 85,
    },
  );
}

function sinkGolfHole(
  state: SimState,
  goal: PropState,
  ball: PropState | null,
  strokesUsed: number,
  parTarget: number,
): void {
  if (!goal.active) return;
  goal.active = false;
  goal.triggered = true;
  if (ball) {
    ball.active = false;
    ball.triggered = true;
  }
  const holeIndex = goal.index ?? ball?.index ?? 0;
  state.collectedIds.push(`golf:${state.room.id}:${holeIndex}`);

  let bonus = 750;
  let label = 'SUNKEN PUTT!';
  if (strokesUsed <= 1) {
    bonus = 2500;
    label = 'HOLE IN ONE!';
  } else if (strokesUsed < parTarget) {
    bonus = 2000;
    label = 'BIRDIE!';
  } else if (strokesUsed === parTarget) {
    bonus = 1500;
    label = 'ON PAR!';
  }

  addScore(state, bonus, goal.x, goal.y - 48);
  refillCombo(state);
  state.hitstopTicks = Math.max(state.hitstopTicks, 4);
  state.shakeMag = Math.max(state.shakeMag, 5);
  state.shakeTimer = Math.max(state.shakeTimer, 12);
  state.flashTicks = Math.max(state.flashTicks, 4);
  state.events.push(
    { type: 'sfx', sfx: 'treasure_get' },
    { type: 'rumble', strong: 0.65, weak: 0.5, durationMs: 150 },
    {
      type: 'particle',
      kind: 'confetti',
      x: goal.x,
      y: goal.y - 24,
      count: 20,
      color: '#74c69d',
    },
    {
      type: 'particle',
      kind: 'starburst',
      x: goal.x,
      y: goal.y - 24,
      count: 12,
      color: '#ffd166',
    },
    {
      type: 'callout',
      text: `${label} +${bonus}!`,
      durationTicks: 100,
    },
  );
}

export function stepLevelRuntime(state: SimState, input: InputFrame): void {
  if (state.stageComplete || state.gameOver) return;

  if (state.screen === 'stage' || state.screen === 'boss') {
    state.stageStats.elapsedTicks += 1;
  }

  if (state.bossIntroTicks > 0) {
    state.bossIntroTicks -= 1;
  }

  // Melt ICE_SOLID barriers for Firemouth / Inferno Pepper / Flames
  stepIceBarrierMelt(state, input);

  const p = state.player;
  const pBox = getPlayerBox(p);

  // ---- 1. Pickups ----
  for (let i = 0; i < state.pickups.length; i++) {
    const pk = state.pickups[i];
    if (pk.collected) continue;
    if (
      overlapsBox(
        pBox.left,
        pBox.top,
        pBox.right,
        pBox.bottom,
        pk.x - 16,
        pk.y - 16,
        pk.x + 16,
        pk.y + 16,
      )
    ) {
      pk.collected = true;
      state.collectedIds.push(`pickup:${state.room.id}:${i}`);
      addScore(state, pk.value, pk.x, pk.y - 14);
      refillCombo(state, pk.comboRefill);

      if (pk.kind === 'clock_pickup' && state.escape.active) {
        state.escape.timerTicks += 5 * ENGINE_CONSTANTS.SIM_HZ;
        state.escape.maxTicks = Math.max(state.escape.maxTicks, state.escape.timerTicks);
        state.events.push({ type: 'sfx', sfx: 'time_extend' });
      } else {
        state.events.push({
          type: 'sfx',
          sfx:
            pk.kind === 'big_topping' || pk.kind === 'pumpkin'
              ? 'pickup_big'
              : 'pickup_small',
        });
      }
      state.events.push({
        type: 'particle',
        kind: 'spark',
        x: pk.x,
        y: pk.y,
        count: 4,
        color: '#ffd166',
      });
    }
  }

  // ---- 2. Interactive Props ----
  const levelDef = state.stageId ? getLevelDef(state.stageId) : null;
  const golfGoals: PropState[] = [];
  for (const pr of state.props) {
    if (pr.kind === 'golf_goal' && pr.active) {
      golfGoals.push(pr);
    }
  }

  // Allow player projectiles (Shotgun, Golf Shot, Flame, etc.) to trigger Time Terminals,
  // Dash Buttons, Alarm Sensors (Shotgun payback!), and Golf Goals!
  for (let pi = state.projectiles.length - 1; pi >= 0; pi--) {
    const pr = state.projectiles[pi];
    if (pr.owner !== 'player') continue;
    const prL = pr.x - pr.radius;
    const prR = pr.x + pr.radius;
    const prT = pr.y - pr.radius;
    const prB = pr.y + pr.radius;

    for (let k = 0; k < state.props.length; k++) {
      const prop = state.props[k];
      if (!prop.active) continue;
      if (
        !overlapsBox(
          prL,
          prT,
          prR,
          prB,
          prop.x - prop.width * 0.5,
          prop.y - prop.height,
          prop.x + prop.width * 0.5,
          prop.y,
        )
      ) {
        continue;
      }

      if (prop.kind === 'time_terminal') {
        triggerTimeTerminal(state, prop, state.room.id, prop.index ?? k);
        state.projectiles.splice(pi, 1);
        break;
      } else if (prop.kind === 'dash_button' && !prop.timerTicks) {
        prop.timerTicks = 15;
        prop.triggered = true;
        const wasClosed = state.room.outletGateTimer <= 0;
        state.room.outletGateTimer = 720;
        state.events.push(
          { type: 'sfx', sfx: 'ui_confirm' },
          { type: 'particle', kind: 'spark', x: prop.x, y: prop.y - 18, count: 8, color: '#ffe066' },
        );
        if (wasClosed) {
          state.events.push({
            type: 'callout',
            text: 'OUTLET GATE OPEN! FLOOR IT!',
            durationTicks: 70,
          });
        }
        state.projectiles.splice(pi, 1);
        break;
      } else if (
        prop.kind === 'alarm_sensor' &&
        (pr.kind === 'shotgun_pellet' || pr.kind === 'charged_shot')
      ) {
        prop.active = false;
        prop.triggered = true;
        state.collectedIds.push(`alarm_broken:${state.room.id}:${prop.index ?? k}`);
        addScore(state, 150, prop.x, prop.y - 32);
        refillCombo(state, 20);
        state.events.push(
          { type: 'sfx', sfx: 'block_metal' },
          { type: 'particle', kind: 'metal_chunk', x: prop.x, y: prop.y - 26, count: 8, color: '#ff4d6d' },
          { type: 'callout', text: 'ALARM BLASTED! +150!', durationTicks: 55 },
        );
        state.projectiles.splice(pi, 1);
        break;
      } else if (prop.kind === 'golf_goal' && pr.kind === 'golf_shot') {
        sinkGolfHole(state, prop, null, 1, 3);
        state.projectiles.splice(pi, 1);
        break;
      }
    }
  }

  for (let i = 0; i < state.props.length; i++) {
    const prop = state.props[i];
    if (prop.timerTicks && prop.timerTicks > 0) {
      prop.timerTicks -= 1;
    }

    // Step kinetic Golf Ball physics
    if (prop.kind === 'golf_ball' && prop.active) {
      const bvx = prop.vx ?? 0;
      const bvy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, (prop.vy ?? 0) + ENGINE_CONSTANTS.GRAV);

      // Fast-rolling golf ball smashes Marble blocks in front of it!
      if (Math.abs(bvx) >= 6.5) {
        const edgeX = prop.x + Math.sign(bvx) * (prop.width * 0.5 + 4);
        const edgeTx = Math.floor(edgeX / T);
        const midTy = Math.floor((prop.y - prop.height * 0.5) / T);
        breakTileAt(state, edgeTx, midTy, 'marble');
      }

      const res = moveAndCollideBox(
        state.room,
        state.escape.active,
        prop.x,
        prop.y,
        prop.width,
        prop.height,
        bvx,
        bvy,
      );
      prop.x = res.x;
      prop.y = res.y;
      prop.vx = res.hitX ? -bvx * 0.72 : bvx * (res.grounded ? 0.94 : 0.992);
      if (Math.abs(prop.vx) < 0.08) prop.vx = 0;
      prop.vy = res.hitY ? (Math.abs(bvy) > 3 ? -bvy * 0.48 : 0) : bvy;

      // Fast-moving golf ball bowls over enemies for juicy combo kills!
      if (Math.abs(prop.vx) >= 6 || Math.abs(prop.vy) >= 6) {
        for (let ei = 0; ei < state.enemies.length; ei++) {
          const e = state.enemies[ei];
          if (!e.alive || e.grabbed) continue;
          if (
            overlapsBox(
              prop.x - prop.width * 0.5,
              prop.y - prop.height,
              prop.x + prop.width * 0.5,
              prop.y,
              e.x - e.width * 0.5,
              e.y - e.height,
              e.x + e.width * 0.5,
              e.y,
            )
          ) {
            damageEnemy(state, e, (prop.vx >= 0 ? 1 : -1) * 12, -8, true);
          }
        }
      }

      // Pit safety: bounce golf ball safely back up if it somehow enters room bottom
      const roomH = state.room.heightTiles * T;
      if (prop.y > roomH - 16) {
        prop.y = roomH - 64;
        prop.vy = -8;
      }

      // Check Golf Goal sink (match by index first, then nearest active goal)!
      let matchedGoal: PropState | null = null;
      for (let gi = 0; gi < golfGoals.length; gi++) {
        const g = golfGoals[gi];
        if (!g.active) continue;
        if (
          Math.abs(prop.x - g.x) < 40 &&
          Math.abs(prop.y - g.y) < 46 &&
          (prop.index === undefined || g.index === undefined || prop.index === g.index)
        ) {
          matchedGoal = g;
          break;
        }
      }
      if (!matchedGoal) {
        for (let gi = 0; gi < golfGoals.length; gi++) {
          const g = golfGoals[gi];
          if (!g.active) continue;
          if (Math.abs(prop.x - g.x) < 40 && Math.abs(prop.y - g.y) < 46) {
            matchedGoal = g;
            break;
          }
        }
      }
      if (matchedGoal) {
        sinkGolfHole(
          state,
          matchedGoal,
          prop,
          Math.max(1, prop.strokes ?? 1),
          prop.parCount ?? 3,
        );
        continue;
      }
    }

    if (!prop.active) continue;

    const hitProp = overlapsBox(
      pBox.left,
      pBox.top,
      pBox.right,
      pBox.bottom,
      prop.x - prop.width * 0.5,
      prop.y - prop.height,
      prop.x + prop.width * 0.5,
      prop.y,
    );
    if (!hitProp) continue;

    switch (prop.kind) {
      case 'toppin_cage': {
        const idx = prop.index ?? 0;
        prop.active = false;
        prop.triggered = true;
        if (idx >= 0 && idx < 5 && !state.stageStats.toppinsCollected[idx]) {
          state.stageStats.toppinsCollected[idx] = true;
          const prevHub = state.stageId ? state.hub.toppinsByStage[state.stageId] : undefined;
          if (!prevHub || !prevHub[idx]) {
            state.hub.cash += ENGINE_CONSTANTS.TOPPIN_PAL_CASH;
          }
          addScore(state, ENGINE_CONSTANTS.TOPPIN_PAL_PTS, prop.x, prop.y - 48);
          refillCombo(state, 30);
          state.events.push({ type: 'sfx', sfx: 'toppin_free' });
          state.events.push({
            type: 'particle',
            kind: 'confetti',
            x: prop.x,
            y: prop.y - 24,
            count: 14,
            color: '#ffd166',
          });
          state.events.push({
            type: 'callout',
            text: `TOPPIN PAL RESCUED! +$${ENGINE_CONSTANTS.TOPPIN_PAL_CASH}`,
            durationTicks: 85,
          });
          state.events.push({ type: 'save_dirty' });
        }
        break;
      }

      case 'gerry_janitor': {
        prop.active = false;
        prop.triggered = true;
        state.stageStats.gerryFound = true;
        addScore(state, 250, prop.x, prop.y - 46);
        refillCombo(state, 25);
        state.events.push({ type: 'sfx', sfx: 'secret_found' });
        state.events.push({
          type: 'callout',
          text: 'JANITOR GERRY JOINED YOU!',
          durationTicks: 95,
        });
        break;
      }

      case 'treasure_chest': {
        if (state.stageStats.gerryFound) {
          prop.active = false;
          prop.triggered = true;
          state.stageStats.treasureCollected = true;
          addScore(state, ENGINE_CONSTANTS.TREASURE_PTS, prop.x, prop.y - 48);
          refillCombo(state);
          state.events.push({ type: 'sfx', sfx: 'treasure_get' });
          state.events.push({
            type: 'particle',
            kind: 'confetti',
            x: prop.x,
            y: prop.y - 24,
            count: 20,
            color: '#ffd166',
          });
          state.events.push({
            type: 'callout',
            text: 'TOWER TREASURE CLAIMED! +3000!',
            durationTicks: 100,
          });
        } else if (!prop.timerTicks) {
          prop.timerTicks = 90;
          state.events.push({ type: 'sfx', sfx: 'ui_back' });
          state.events.push({
            type: 'callout',
            text: 'FIND JANITOR GERRY TO UNLOCK!',
            durationTicks: 80,
          });
        }
        break;
      }

      case 'secret_eye': {
        const sIdx = prop.index ?? 0;
        if (sIdx >= 0 && sIdx < 3 && !state.stageStats.secretsFound[sIdx]) {
          state.stageStats.secretsFound[sIdx] = true;
          addScore(state, ENGINE_CONSTANTS.SECRET_PTS, prop.x, prop.y - 46);
          refillCombo(state);
          state.events.push({ type: 'sfx', sfx: 'secret_found' });
          state.events.push({
            type: 'callout',
            text: `SECRET ${sIdx + 1} DISCOVERED! +500!`,
            durationTicks: 90,
          });
        }
        if (prop.targetRoomIndex !== undefined) {
          state.events.push({ type: 'sfx', sfx: 'door_enter' });
          loadStageRoom(state, prop.targetRoomIndex, prop.targetX, prop.targetY);
          return;
        }
        break;
      }

      case 'pillar_chronos': {
        prop.active = false;
        prop.triggered = true;
        addScore(state, 500, prop.x, prop.y - 64);
        refillCombo(state);
        state.events.push({
          type: 'particle',
          kind: 'marble_chunk',
          x: prop.x,
          y: prop.y - 40,
          count: 16,
          color: '#cbd5e1',
        });
        startEscape(state);
        break;
      }

      case 'lap2_portal': {
        const lap2Ready =
          state.escape.active && state.escape.lap < 2 && Boolean(levelDef?.hasLap2);
        if (lap2Ready && !prop.timerTicks) {
          prop.timerTicks = 45;
          triggerLap2(state);
          return;
        }
        break;
      }

      case 'exit_door': {
        const canExit = !levelDef?.hasPillar || state.escape.active;
        if (canExit) {
          // Require Up press only if standing right on top at Room 0 spawn on tick < 20
          if (state.stageStats.elapsedTicks > 20 || input.moveY < 0) {
            state.events.push({ type: 'sfx', sfx: 'door_enter' });
            finalizeStageRank(state);
            return;
          }
        } else if (!prop.timerTicks && input.moveY < 0) {
          prop.timerTicks = 75;
          state.events.push({ type: 'sfx', sfx: 'ui_back' });
          state.events.push({
            type: 'callout',
            text: 'SMASH PILLAR CHRONOS FIRST!',
            durationTicks: 75,
          });
        }
        break;
      }

      case 'transform_totem': {
        if (prop.transformation && !prop.timerTicks) {
          prop.timerTicks = 25;
          if (prop.transformation === 'none') {
            if (p.transformation !== 'none') {
              clearTransformation(state);
              state.events.push(
                { type: 'sfx', sfx: 'transform' },
                { type: 'callout', text: 'BACK TO NORMAL!', durationTicks: 55 },
              );
            }
          } else if (p.transformation !== prop.transformation) {
            applyTransformation(state, prop.transformation);
            state.events.push({ type: 'rumble', strong: 0.4, weak: 0.3, durationMs: 75 });
          } else if (prop.transformation === 'bomb') {
            p.transformTimer = 180;
            state.events.push({
              type: 'particle',
              kind: 'spark',
              x: p.x,
              y: p.y - 36,
              count: 6,
              color: '#ffbb33',
            });
          } else if (prop.transformation === 'fire_butt') {
            p.vy = -14;
            p.transformTimer = 55;
            p.grounded = false;
            state.events.push({ type: 'sfx', sfx: 'jump' });
          }
        }
        break;
      }

      case 'buddy_switch': {
        if (prop.riderTarget && !prop.timerTicks) {
          prop.timerTicks = 25;
          const desired =
            prop.riderTarget === 'gusto_chonks' ? 'gusto_chonks' : state.character;
          if (p.rider !== desired) {
            if (desired === 'gusto_chonks' && p.transformation !== 'none') {
              clearTransformation(state);
            }
            p.rider = desired;
            state.events.push(
              { type: 'sfx', sfx: 'transform' },
              { type: 'rumble', strong: 0.45, weak: 0.35, durationMs: 80 },
              {
                type: 'particle',
                kind: 'starburst',
                x: prop.x,
                y: prop.y - 24,
                count: 10,
                color: '#72efdd',
              },
              {
                type: 'callout',
                text:
                  desired === 'gusto_chonks'
                    ? 'TAG TEAM: GUSTO & CHONKS!'
                    : 'SOLO SPRINT ENGAGED!',
                durationTicks: 80,
              },
            );
          }
        }
        break;
      }

      case 'time_terminal': {
        triggerTimeTerminal(state, prop, state.room.id, prop.index ?? i);
        break;
      }

      case 'dash_button': {
        if (!prop.timerTicks) {
          prop.timerTicks = 15;
          prop.triggered = true;
          const wasClosed = state.room.outletGateTimer <= 0;
          // Both step.ts and modes.ts tick outletGateTimer down by 1 -> 720 gives 6 full seconds!
          state.room.outletGateTimer = 720;
          state.events.push(
            { type: 'sfx', sfx: 'ui_confirm' },
            { type: 'rumble', strong: 0.35, weak: 0.25, durationMs: 65 },
            {
              type: 'particle',
              kind: 'spark',
              x: prop.x,
              y: prop.y - 18,
              count: 8,
              color: '#ffe066',
            },
          );
          if (wasClosed) {
            state.events.push({
              type: 'callout',
              text: 'OUTLET GATE OPEN! FLOOR IT!',
              durationTicks: 70,
            });
          }
        }
        break;
      }

      case 'taxi_warp': {
        if (input.moveY < 0 && !prop.timerTicks && prop.targetRoomIndex !== undefined) {
          prop.timerTicks = 30;
          state.flashTicks = Math.max(state.flashTicks, 4);
          state.events.push(
            { type: 'sfx', sfx: 'door_enter' },
            {
              type: 'particle',
              kind: 'smoke',
              x: prop.x,
              y: prop.y - 22,
              count: 8,
              color: '#ffe066',
            },
          );
          if (prop.targetRoomIndex === state.roomIndex) {
            const tx = prop.targetX ?? p.x;
            const ty = prop.targetY ?? p.y;
            p.x = tx;
            p.y = ty;
            p.prevX = tx;
            p.prevY = ty;
            p.vx = 0;
            p.vy = 0;
            p.movespeed = Math.min(p.movespeed, 6);
            snapCameraToPlayer(state);
            state.events.push(
              {
                type: 'particle',
                kind: 'starburst',
                x: tx,
                y: ty - 24,
                count: 10,
                color: '#ffd166',
              },
              {
                type: 'callout',
                text: 'EXPRESS TAXI DROP-OFF!',
                durationTicks: 65,
              },
            );
          } else {
            state.events.push({
              type: 'callout',
              text: 'NEXT STOP — EXPRESS METRO!',
              durationTicks: 70,
            });
            loadStageRoom(state, prop.targetRoomIndex, prop.targetX, prop.targetY);
            return;
          }
        } else if (!prop.timerTicks && input.moveY >= 0) {
          prop.timerTicks = 90;
          state.tv.calloutText = 'PRESS UP FOR EXPRESS TAXI!';
          state.tv.calloutTimer = 55;
        }
        break;
      }

      case 'alarm_sensor': {
        if (!prop.timerTicks) {
          const freshTrigger = state.room.alarmActiveTicks <= 120;
          prop.timerTicks = 45;
          prop.triggered = true;
          // 600 ticks -> 5 full seconds of frenzied bot pursuit!
          state.room.alarmActiveTicks = 600;
          if (freshTrigger) {
            state.shakeMag = Math.max(state.shakeMag, 4.5);
            state.shakeTimer = Math.max(state.shakeTimer, 10);
            state.events.push(
              { type: 'sfx', sfx: 'alarm_siren' },
              { type: 'rumble', strong: 0.65, weak: 0.5, durationMs: 140 },
              {
                type: 'particle',
                kind: 'spark',
                x: prop.x,
                y: prop.y - 28,
                count: 10,
                color: '#ff2e63',
              },
              {
                type: 'callout',
                text: 'ALARM TRIPPED! WATCH OUT FOR BOTS!',
                durationTicks: 85,
              },
            );
          }
        }
        break;
      }

      case 'golf_ball': {
        if (!prop.timerTicks) {
          prop.timerTicks = 12;
          prop.strokes = (prop.strokes ?? 0) + 1;
          const par = prop.parCount ?? 3;
          const isLob = input.moveY < 0;
          const isPower =
            input.grabPressed ||
            p.state === 'mach2' ||
            p.state === 'mach3' ||
            p.state === 'mach4' ||
            p.state === 'grab_dash';
          const kickPower = isLob
            ? Math.max(8.5, Math.abs(p.vx) + 4.5)
            : isPower
              ? Math.max(13.5, Math.abs(p.vx) + 6.5)
              : Math.max(10.5, Math.abs(p.vx) + 5.5);
          prop.vx = p.facing * kickPower;
          prop.vy = isLob ? -9.2 : isPower ? -4.5 : -5.5;
          state.events.push(
            { type: 'sfx', sfx: 'throw' },
            { type: 'rumble', strong: 0.4, weak: 0.3, durationMs: 60 },
            {
              type: 'particle',
              kind: 'starburst',
              x: prop.x,
              y: prop.y - 16,
              count: 6,
              color: '#ffffff',
            },
            {
              type: 'callout',
              text: isLob
                ? `LOB SHOT! STROKE ${prop.strokes} / PAR ${par}`
                : `FORE! STROKE ${prop.strokes} / PAR ${par}`,
              durationTicks: 55,
            },
          );
        }
        break;
      }

      // ---- HUB INTERACTIVE GATES & NPCs (press Up) ----
      case 'hub_stage_gate':
      case 'hub_bonus_gate': {
        if (input.moveY < 0 && prop.targetStageId && !prop.timerTicks) {
          prop.timerTicks = 25;
          state.returnHubX = prop.x;
          state.returnHubY = prop.y;
          state.events.push({ type: 'sfx', sfx: 'door_enter' });
          loadStage(state, prop.targetStageId);
          return;
        }
        break;
      }

      case 'hub_broker': {
        if (input.moveY < 0 && !prop.timerTicks) {
          prop.timerTicks = 35;
          const fl = prop.targetFloor ?? state.floor;
          const toll = FLOOR_TOLLS[fl];
          if (toll <= 0 || state.hub.brokerPaidFloors.includes(fl)) {
            state.events.push({ type: 'sfx', sfx: 'ui_confirm' });
            state.events.push({
              type: 'callout',
              text: 'BOSS GATE IS ALREADY OPEN!',
              durationTicks: 75,
            });
          } else if (state.hub.cash >= toll) {
            state.hub.cash -= toll;
            state.hub.brokerPaidFloors.push(fl);
            state.events.push({ type: 'sfx', sfx: 'treasure_get' });
            state.events.push({ type: 'save_dirty' });
            state.events.push({
              type: 'callout',
              text: 'BROKER BUCK PAID! BOSS GATE OPEN!',
              durationTicks: 100,
            });
          } else {
            const need = toll - state.hub.cash;
            state.events.push({ type: 'sfx', sfx: 'ui_back' });
            state.events.push({
              type: 'callout',
              text: `NEED $${need} MORE — RESCUE TOPPIN PALS!`,
              durationTicks: 90,
            });
          }
        }
        break;
      }

      case 'hub_boss_gate': {
        if (input.moveY < 0 && prop.targetBossId && !prop.timerTicks) {
          prop.timerTicks = 35;
          const toll = FLOOR_TOLLS[state.floor];
          const unlocked = toll <= 0 || state.hub.brokerPaidFloors.includes(state.floor);
          if (unlocked) {
            state.returnHubX = prop.x;
            state.returnHubY = prop.y;
            state.events.push({ type: 'sfx', sfx: 'door_enter' });
            loadBossArena(state, prop.targetBossId);
            return;
          } else {
            state.events.push({ type: 'sfx', sfx: 'ui_back' });
            state.events.push({
              type: 'callout',
              text: `PAY BROKER BUCK ($${toll}) FIRST!`,
              durationTicks: 90,
            });
          }
        }
        break;
      }

      case 'hub_elevator': {
        if (input.moveY < 0 && prop.targetFloor && !prop.timerTicks) {
          prop.timerTicks = 35;
          state.events.push({ type: 'sfx', sfx: 'door_enter' });
          loadHubFloor(state, prop.targetFloor);
          return;
        }
        break;
      }

      case 'tutorial_sign': {
        if (prop.label && !prop.timerTicks) {
          prop.timerTicks = 120;
          state.tv.calloutText = prop.label;
          state.tv.calloutTimer = 90;
        }
        break;
      }
    }
  }

  // ---- 3. Room Transition Doors ----
  for (const door of state.room.doors) {
    if (door.escapeLocked && state.escape.active) continue;
    const hitDoor = overlapsBox(
      pBox.left,
      pBox.top,
      pBox.right,
      pBox.bottom,
      door.x - 24,
      door.y - 64,
      door.x + 24,
      door.y,
    );
    if (!hitDoor) continue;
    if (door.requireUp && input.moveY >= 0) continue;

    state.events.push({ type: 'sfx', sfx: 'door_enter' });
    loadStageRoom(state, door.targetRoomIndex, door.targetX, door.targetY);
    return;
  }

  // ---- 4. Krunk Time! Countdown & Mega-Crust Wall-Phasing Chaser ----
  if (state.screen === 'stage' && state.escape.active) {
    if (state.escape.timerTicks > 0) {
      state.escape.timerTicks -= 1;
      if (state.escape.timerTicks === 0 && !state.escape.megaCrustActive) {
        state.escape.megaCrustActive = true;
        state.escape.megaCrustSpeed = ENGINE_CONSTANTS.MEGA_CRUST_BASE_SPEED;
        state.escape.megaCrustX = p.x - p.facing * 420;
        state.escape.megaCrustY = p.y - 120;
        state.events.push({ type: 'mega_crust_spawned' });
        state.events.push({ type: 'sfx', sfx: 'alarm_siren' });
        state.events.push({ type: 'rumble', strong: 0.9, weak: 0.5, durationMs: 300 });
        state.events.push({
          type: 'callout',
          text: 'TIME UP! MEGA-CRUST IS HUNTING YOU!',
          durationTicks: 140,
        });
      }
    } else if (state.escape.megaCrustActive) {
      // Accelerating homing chaser phasing straight through walls!
      state.escape.megaCrustSpeed = Math.min(
        18,
        state.escape.megaCrustSpeed + ENGINE_CONSTANTS.MEGA_CRUST_ACCEL,
      );
      const dx = p.x - state.escape.megaCrustX;
      const dy = p.y - 22 - state.escape.megaCrustY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        state.escape.megaCrustX += (dx / dist) * state.escape.megaCrustSpeed;
        state.escape.megaCrustY += (dy / dist) * state.escape.megaCrustSpeed;
      }

      if (dist < 28) {
        state.gameOver = true;
        state.gameOverReason = 'CAUGHT BY MEGA-CRUST!';
        state.events.push({ type: 'sfx', sfx: 'hurt' });
        state.events.push({ type: 'rumble', strong: 1.0, weak: 0.8, durationMs: 360 });
        state.events.push({
          type: 'callout',
          text: 'CAUGHT BY MEGA-CRUST! PRESS RESTART!',
          durationTicks: 160,
        });
      }
    }
  }
}
