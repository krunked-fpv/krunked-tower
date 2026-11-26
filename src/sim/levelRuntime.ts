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
import { getPlayerBox, moveAndCollideBox } from './collision';
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

function populateRoomEntities(state: SimState, roomDef: RoomDef): void {
  state.enemies = [];
  state.projectiles = [];
  state.pickups = [];
  state.props = [];

  for (let i = 0; i < roomDef.spawns.length; i++) {
    const sp = roomDef.spawns[i];
    if (sp.kind === 'pickup' && sp.pickupKind) {
      const key = `pickup:${roomDef.id}:${i}`;
      if (state.collectedIds.includes(key)) continue;

      // Prevent pickups from spawning overlapped inside solid/breakable/pillar geometry
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
          occ === TileType.ICE_SOLID
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
        const key = `term:${roomDef.id}:${i}`;
        if (state.collectedIds.includes(key)) {
          active = false;
          triggered = true;
        }
      }

      const prop: PropState = {
        id: state.nextEntityId++,
        kind: sp.propKind,
        x: sp.x,
        y: sp.y,
        width: dims.w,
        height: dims.h,
        active,
        triggered,
        index: sp.index,
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
      state.props.push(prop);
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
      addScore(state, 500, spawnX ?? roomDef.spawnX, (spawnY ?? roomDef.spawnY) - 48);
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

  // Spawn escape-only enemies in current room
  const roomDef = level.rooms[state.roomIndex];
  if (roomDef) {
    spawnRoomEnemies(state, roomDef, true);
  }

  state.hitstopTicks = Math.max(state.hitstopTicks, 6);
  state.shakeMag = Math.max(state.shakeMag, 10);
  state.shakeTimer = Math.max(state.shakeTimer, 28);
  state.tv.calloutText = 'KRUNK TIME!';
  state.tv.calloutTimer = 120;

  state.events.push({ type: 'sfx', sfx: 'pillar_smash' });
  state.events.push({ type: 'music', track: 'escape_krunk_time', forceRestart: true });
  state.events.push({ type: 'escape_started', stageId: state.stageId, seconds: secs });
  state.events.push({ type: 'rumble', strong: 0.9, weak: 0.6, durationMs: 280 });
  state.events.push({
    type: 'callout',
    text: 'KRUNK TIME! RUN BACK TO THE EXIT!',
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

  // Respawn enemies for Lap 2 carnage!
  state.collectedIds = state.collectedIds.filter((k) => !k.startsWith('enemy:'));

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

  // Warp player to the Pillar room (or Room 0 in WAR mode)
  let targetRoomIdx = 0;
  if (!level.warTimerMode) {
    const pillarRoomIdx = level.rooms.findIndex((r) =>
      r.spawns.some((s) => s.propKind === 'pillar_chronos'),
    );
    targetRoomIdx = pillarRoomIdx >= 0 ? pillarRoomIdx : Math.max(0, level.rooms.length - 1);
  }
  const destRoom = level.rooms[targetRoomIdx];
  const pillarSpawn = destRoom.spawns.find((s) => s.propKind === 'pillar_chronos');
  const warpX = pillarSpawn ? Math.max(128, pillarSpawn.x - 160) : destRoom.spawnX;
  const warpY = pillarSpawn ? pillarSpawn.y : destRoom.spawnY;

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

export function stepLevelRuntime(state: SimState, input: InputFrame): void {
  if (state.stageComplete || state.gameOver) return;

  if (state.screen === 'stage' || state.screen === 'boss') {
    state.stageStats.elapsedTicks += 1;
  }

  if (state.bossIntroTicks > 0) {
    state.bossIntroTicks -= 1;
  }

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
  let golfGoal: PropState | null = null;
  for (const pr of state.props) {
    if (pr.kind === 'golf_goal') golfGoal = pr;
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
      prop.vx = res.hitX ? -bvx * 0.7 : bvx * (res.grounded ? 0.94 : 0.99);
      prop.vy = res.hitY ? (Math.abs(bvy) > 3 ? -bvy * 0.45 : 0) : bvy;

      // Check Golf Goal sink!
      if (
        golfGoal &&
        golfGoal.active &&
        Math.abs(prop.x - golfGoal.x) < 36 &&
        Math.abs(prop.y - golfGoal.y) < 42
      ) {
        prop.active = false;
        prop.triggered = true;
        golfGoal.triggered = true;
        const underParBonus = (prop.strokes ?? 1) <= (prop.parCount ?? 3) ? 1500 : 750;
        addScore(state, underParBonus, golfGoal.x, golfGoal.y - 48);
        refillCombo(state);
        state.events.push({ type: 'sfx', sfx: 'treasure_get' });
        state.events.push({
          type: 'particle',
          kind: 'confetti',
          x: golfGoal.x,
          y: golfGoal.y - 24,
          count: 16,
          color: '#74c69d',
        });
        state.events.push({
          type: 'callout',
          text: `HOLE IN KRUNK! +${underParBonus}!`,
          durationTicks: 100,
        });
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
          prop.timerTicks = 60;
          if (p.transformation !== prop.transformation) {
            applyTransformation(state, prop.transformation);
            state.events.push({ type: 'sfx', sfx: 'transform' });
          }
        }
        break;
      }

      case 'buddy_switch': {
        if (prop.riderTarget && !prop.timerTicks) {
          prop.timerTicks = 50;
          const desired =
            prop.riderTarget === 'gusto_chonks' ? 'gusto_chonks' : state.character;
          if (p.rider !== desired) {
            p.rider = desired;
            state.events.push({ type: 'sfx', sfx: 'transform' });
            state.events.push({
              type: 'callout',
              text:
                desired === 'gusto_chonks'
                  ? 'TAG TEAM: GUSTO & CHONKS!'
                  : 'SOLO SPRINT ENGAGED!',
              durationTicks: 80,
            });
          }
        }
        break;
      }

      case 'time_terminal': {
        prop.active = false;
        prop.triggered = true;
        state.collectedIds.push(`term:${state.room.id}:${i}`);
        state.escape.terminalsHit += 1;
        state.escape.timerTicks += 30 * ENGINE_CONSTANTS.SIM_HZ;
        state.escape.megaCrustActive = false;
        addScore(state, 500, prop.x, prop.y - 44);
        refillCombo(state);
        state.events.push({ type: 'sfx', sfx: 'time_extend' });
        state.events.push({
          type: 'callout',
          text: 'TIME TERMINAL HIT! +30 SECONDS!',
          durationTicks: 85,
        });
        break;
      }

      case 'dash_button': {
        if (!prop.timerTicks) {
          prop.timerTicks = 30;
          prop.triggered = true;
          state.room.outletGateTimer = 360;
          state.events.push({ type: 'sfx', sfx: 'ui_confirm' });
          state.events.push({
            type: 'callout',
            text: 'OUTLET GATE OPEN! GO GO GO!',
            durationTicks: 70,
          });
        }
        break;
      }

      case 'taxi_warp': {
        if (input.moveY < 0 && !prop.timerTicks && prop.targetRoomIndex !== undefined) {
          prop.timerTicks = 30;
          state.events.push({ type: 'sfx', sfx: 'door_enter' });
          loadStageRoom(state, prop.targetRoomIndex, prop.targetX, prop.targetY);
          return;
        }
        break;
      }

      case 'alarm_sensor': {
        if (state.room.alarmActiveTicks <= 0) {
          state.room.alarmActiveTicks = 300;
          state.events.push({ type: 'sfx', sfx: 'alarm_siren' });
          state.events.push({
            type: 'callout',
            text: 'ALARM TRIPPED! WATCH OUT FOR BOTS!',
            durationTicks: 85,
          });
        }
        break;
      }

      case 'golf_ball': {
        if (!prop.timerTicks) {
          prop.timerTicks = 16;
          prop.strokes = (prop.strokes ?? 0) + 1;
          const kickPower = Math.max(9.5, Math.abs(p.vx) + 6);
          prop.vx = p.facing * kickPower;
          prop.vy = -5.5;
          state.events.push({ type: 'sfx', sfx: 'throw' });
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
