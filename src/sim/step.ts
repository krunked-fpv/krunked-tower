// ============================================================================
// Krunked Tower — Master 60 Hz Simulation Step, Command Dispatcher, Camera & TV HUD
// Pure deterministic simulation — ZERO DOM or non-deterministic RNG dependencies.
// ============================================================================

import {
  ENGINE_CONSTANTS,
  TileType,
  type ActiveRoomState,
  type InputFrame,
  type PlayableCharacter,
  type SimCommand,
  type SimEvent,
  type SimState,
} from '../contracts/index';
import { FLOOR_TOLLS, PALETTES, getBossDef, getLevelDef } from '../data/index';
import { createRngState } from './prng';
import { createInitialPlayer, clamp } from './physics';
import { hurtPlayer, stepPlayer } from './player';
import { stepPlayerCombatHits, stepProjectiles } from './combat';
import { applyTransformation } from './transformations';
import { finalizeStageRank, stepCombo } from './scoring';
import {
  loadBossArena,
  loadHubFloor,
  loadStage,
  loadStageRoom,
  startEscape,
  stepLevelRuntime,
  triggerLap2,
} from './levelRuntime';
import { stepEnemies } from './enemies';
import { damageBoss, stepBoss } from './bosses';
import { checkModeRules } from './modes';

const TS = ENGINE_CONSTANTS.TILE_SIZE;

function createFallbackRoom(): ActiveRoomState {
  const widthTiles = 30;
  const heightTiles = 17;
  const tiles = new Uint8Array(widthTiles * heightTiles);
  const brokenMask = new Uint8Array(widthTiles * heightTiles);
  for (let x = 0; x < widthTiles; x++) {
    tiles[0 * widthTiles + x] = TileType.SOLID;
    tiles[(heightTiles - 1) * widthTiles + x] = TileType.SOLID;
    tiles[(heightTiles - 2) * widthTiles + x] = TileType.SOLID;
  }
  for (let y = 0; y < heightTiles; y++) {
    tiles[y * widthTiles + 0] = TileType.SOLID;
    tiles[y * widthTiles + (widthTiles - 1)] = TileType.SOLID;
  }
  return {
    id: 'fallback_room',
    name: 'Tower Lobby',
    theme: 'hub_lobby',
    widthTiles,
    heightTiles,
    tiles,
    brokenMask,
    doors: [],
    isSecretRoom: false,
    secretIndex: -1,
    outletGateTimer: 0,
    alarmActiveTicks: 0,
  };
}

/**
 * Create a clean, deterministic initial SimState.
 */
export function createInitialSimState(
  seed = 1337,
  character: PlayableCharacter = 'peppo',
): SimState {
  const room = createFallbackRoom();
  const spawnX = 160;
  const spawnY = (room.heightTiles - 2) * TS;

  const state: SimState = {
    tick: 0,
    rngState: createRngState(seed),
    hitstopTicks: 0,
    shakeMag: 0,
    shakeTimer: 0,
    flashTicks: 0,
    screen: 'title',
    character,
    paletteId: character === 'static' ? 'mint_static' : 'classic',
    floor: 1,
    stageId: null,
    bossId: null,
    roomIndex: 0,
    player: createInitialPlayer(character, spawnX, spawnY),
    room,
    enemies: [],
    projectiles: [],
    pickups: [],
    props: [],
    boss: null,
    escape: {
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
    },
    stageStats: {
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
      sRankTarget: 16000,
      pRankEligible: true,
    },
    hub: {
      floor: 1,
      cash: 0,
      bossesDefeated: [],
      stagesCleared: [],
      stageBestRanks: {},
      stageBestScores: {},
      toppinsByStage: {},
      unlockedPalettes: ['classic', 'mint_static'],
      completedTasks: [],
      brokerPaidFloors: [],
    },
    camera: {
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      lookAheadX: 0,
      lookAheadY: 0,
      targetX: 0,
      targetY: 0,
    },
    tv: {
      expression: character === 'static' ? 'static' : 'idle',
      animTick: 0,
      calloutText: '',
      calloutTimer: 0,
      comboBounce: 0,
    },
    events: [],
    paused: false,
    stageComplete: false,
    gameOver: false,
    gameOverReason: null,
    bossIntroTicks: 0,
    lastRankSummary: null,
    visitedRooms: [],
    collectedIds: [],
    nextEntityId: 1,
    returnHubX: 160,
    returnHubY: 448,
  };

  updateCamera(state, true);
  updateTvHud(state);
  return state;
}

/**
 * Execute an external UI / menu / debug command mutating SimState deterministically.
 */
export function dispatchCommand(state: SimState, cmd: SimCommand): void {
  switch (cmd.type) {
    case 'start_campaign': {
      state.character = cmd.character;
      state.player.rider = cmd.character;
      state.paused = false;
      state.gameOver = false;
      state.gameOverReason = null;
      state.stageComplete = false;
      loadHubFloor(state, state.hub.floor || 1);
      updateCamera(state, true);
      updateTvHud(state);
      break;
    }

    case 'enter_hub': {
      const targetFloor = cmd.floor ?? state.hub.floor ?? 1;
      state.floor = targetFloor;
      state.hub.floor = targetFloor;
      state.paused = false;
      state.gameOver = false;
      state.gameOverReason = null;
      state.stageComplete = false;
      loadHubFloor(state, targetFloor);
      updateCamera(state, true);
      updateTvHud(state);
      break;
    }

    case 'enter_stage': {
      // Ensure stage exists in catalog before loading
      getLevelDef(cmd.stageId);
      state.paused = false;
      state.gameOver = false;
      state.gameOverReason = null;
      state.stageComplete = false;
      loadStage(state, cmd.stageId);
      updateCamera(state, true);
      updateTvHud(state);
      break;
    }

    case 'enter_boss': {
      getBossDef(cmd.bossId);
      state.paused = false;
      state.gameOver = false;
      state.gameOverReason = null;
      state.stageComplete = false;
      loadBossArena(state, cmd.bossId);
      updateCamera(state, true);
      updateTvHud(state);
      break;
    }

    case 'return_to_hub': {
      state.paused = false;
      state.gameOver = false;
      state.gameOverReason = null;
      state.stageComplete = false;
      loadHubFloor(
        state,
        state.hub.floor || 1,
        state.returnHubX > 0 ? state.returnHubX : undefined,
        state.returnHubY > 0 ? state.returnHubY : undefined,
      );
      updateCamera(state, true);
      updateTvHud(state);
      break;
    }

    case 'restart_stage': {
      state.paused = false;
      state.gameOver = false;
      state.gameOverReason = null;
      state.stageComplete = false;
      if (state.stageId) {
        loadStage(state, state.stageId);
      } else if (state.bossId) {
        loadBossArena(state, state.bossId);
      } else {
        loadHubFloor(state, state.floor);
      }
      updateCamera(state, true);
      updateTvHud(state);
      break;
    }

    case 'set_character': {
      state.character = cmd.character;
      if (state.player.rider !== 'gusto_chonks') {
        state.player.rider = cmd.character;
      }
      updateTvHud(state);
      state.events.push({ type: 'save_dirty' });
      break;
    }

    case 'set_palette': {
      state.paletteId = cmd.paletteId;
      state.events.push({ type: 'save_dirty' });
      break;
    }

    case 'pay_broker': {
      const toll = FLOOR_TOLLS[cmd.floor] ?? 0;
      if (state.hub.brokerPaidFloors.includes(cmd.floor)) {
        break;
      }
      if (state.hub.cash >= toll) {
        state.hub.cash -= toll;
        state.hub.brokerPaidFloors.push(cmd.floor);
        state.events.push(
          { type: 'sfx', sfx: 'treasure_get' },
          { type: 'callout', text: `FLOOR ${cmd.floor} BOSS UNLOCKED!`, durationTicks: 90 },
          { type: 'save_dirty' },
        );
      } else {
        state.events.push(
          { type: 'sfx', sfx: 'ui_back' },
          { type: 'callout', text: `NEED $${toll} CASH!`, durationTicks: 75 },
        );
      }
      break;
    }

    case 'set_paused': {
      state.paused = cmd.paused;
      break;
    }

    case 'change_floor': {
      state.floor = cmd.floor;
      state.hub.floor = cmd.floor;
      state.paused = false;
      loadHubFloor(state, cmd.floor);
      updateCamera(state, true);
      updateTvHud(state);
      break;
    }

    case 'debug_warp_room': {
      if (state.stageId) {
        loadStageRoom(state, cmd.roomIndex);
        updateCamera(state, true);
      }
      break;
    }

    case 'debug_trigger_escape': {
      if (state.stageId) {
        startEscape(state);
      }
      break;
    }

    case 'debug_trigger_lap2': {
      if (state.stageId) {
        triggerLap2(state);
      }
      break;
    }

    case 'debug_set_transformation': {
      applyTransformation(state, cmd.transformation);
      updateTvHud(state);
      break;
    }

    case 'debug_unlock_all': {
      const allFloors: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];
      for (const fl of allFloors) {
        if (!state.hub.brokerPaidFloors.includes(fl)) {
          state.hub.brokerPaidFloors.push(fl);
        }
      }
      for (const pal of PALETTES) {
        if (!state.hub.unlockedPalettes.includes(pal.id)) {
          state.hub.unlockedPalettes.push(pal.id);
        }
      }
      state.hub.cash = Math.max(state.hub.cash, 1000);
      state.events.push(
        { type: 'sfx', sfx: 'treasure_get' },
        { type: 'callout', text: 'ALL FLOORS & PALETTES UNLOCKED!', durationTicks: 90 },
        { type: 'save_dirty' },
      );
      break;
    }

    case 'debug_damage_boss': {
      if (state.boss) {
        damageBoss(state, cmd.amount, state.player.x);
      }
      break;
    }

    case 'debug_force_rank': {
      finalizeStageRank(state, cmd.rank);
      break;
    }
  }
}

/**
 * Smooth 960x540 camera centered on (x, y - 50) with dynamic Mach velocity look-ahead.
 */
export function updateCamera(state: SimState, snap = false): void {
  const cam = state.camera;
  const p = state.player;

  cam.prevX = cam.x;
  cam.prevY = cam.y;

  const isMach3Plus =
    p.state === 'mach3' ||
    p.state === 'mach4' ||
    p.state === 'sjump_cancel';
  const lookFactor = isMach3Plus
    ? ENGINE_CONSTANTS.CAMERA_LOOKAHEAD_MACH3_FACTOR
    : ENGINE_CONSTANTS.CAMERA_LOOKAHEAD_FACTOR;

  const speedScalar = Math.max(p.movespeed, Math.abs(p.vx));
  const desiredLookX = clamp(p.facing * (speedScalar / 4) * lookFactor, -240, 240);
  const desiredLookY =
    p.state === 'sjump' ? -80 : p.state === 'freefall' || p.state === 'piledriver' ? 60 : 0;

  if (snap) {
    cam.lookAheadX = desiredLookX;
    cam.lookAheadY = desiredLookY;
  } else {
    cam.lookAheadX += (desiredLookX - cam.lookAheadX) * 0.12;
    cam.lookAheadY += (desiredLookY - cam.lookAheadY) * 0.12;
  }

  const roomPxW = state.room.widthTiles * TS;
  const roomPxH = state.room.heightTiles * TS;
  const maxCamX = Math.max(0, roomPxW - ENGINE_CONSTANTS.VIEWPORT_W);
  const maxCamY = Math.max(0, roomPxH - ENGINE_CONSTANTS.VIEWPORT_H);

  cam.targetX = clamp(
    p.x + cam.lookAheadX - ENGINE_CONSTANTS.VIEWPORT_W * 0.5,
    0,
    maxCamX,
  );
  cam.targetY = clamp(
    p.y + ENGINE_CONSTANTS.CAMERA_OFFSET_Y + cam.lookAheadY - ENGINE_CONSTANTS.VIEWPORT_H * 0.5,
    0,
    maxCamY,
  );

  if (snap) {
    cam.x = cam.targetX;
    cam.y = cam.targetY;
    cam.prevX = cam.x;
    cam.prevY = cam.y;
  } else {
    cam.x += (cam.targetX - cam.x) * 0.22;
    cam.y += (cam.targetY - cam.y) * 0.18;
  }
}

/**
 * Update the expressive Corner CRT TV HUD state from player & world state.
 */
export function updateTvHud(state: SimState): void {
  const tv = state.tv;
  const p = state.player;
  tv.animTick++;

  if (p.state === 'hurt') {
    tv.expression = 'hurt';
  } else if (p.state === 'taunt' || p.state === 'super_taunt' || p.state === 'parry') {
    tv.expression = 'taunt';
  } else if (p.transformation === 'knight') {
    tv.expression = 'knight';
  } else if (p.transformation === 'ghost') {
    tv.expression = 'ghost';
  } else if (p.transformation === 'shotgun' || p.transformation === 'revolver') {
    tv.expression = 'shotgun';
  } else if (
    p.transformation === 'fire_butt' ||
    p.transformation === 'firemouth' ||
    p.transformation === 'inferno_pepper'
  ) {
    tv.expression = 'fire';
  } else if (p.state === 'mach4') {
    tv.expression = 'mach4';
  } else if (
    p.state === 'mach3' ||
    p.state === 'sjump' ||
    p.state === 'sjump_cancel'
  ) {
    tv.expression = 'mach3';
  } else if (
    p.state === 'mach2' ||
    p.state === 'mach_roll' ||
    p.state === 'climb_wall' ||
    p.state === 'wall_bounce'
  ) {
    tv.expression = 'mach2';
  } else if (state.escape.active) {
    tv.expression = 'panic';
  } else if (state.screen === 'boss') {
    tv.expression = 'boss';
  } else if (p.combo >= 5) {
    tv.expression = 'combo';
  } else if (p.state === 'victory_pose' || state.stageComplete) {
    tv.expression = 'happy';
  } else if (p.rider === 'gusto_chonks') {
    tv.expression = 'gusto';
  } else if (state.character === 'static') {
    tv.expression = 'static';
  } else {
    tv.expression = 'idle';
  }
}

function absorbCalloutEvents(state: SimState): void {
  for (let i = 0; i < state.events.length; i++) {
    const ev = state.events[i];
    if (ev.type === 'callout') {
      state.tv.calloutText = ev.text;
      state.tv.calloutTimer = ev.durationTicks ?? 75;
    }
  }
}

/**
 * Advance the entire game world by exactly 1 deterministic 60 Hz simulation tick.
 */
export function stepSim(state: SimState, input: InputFrame): SimEvent[] {
  state.events = [];

  // Playable screen Pause toggle
  if (
    input.pausePressed &&
    (state.screen === 'hub' || state.screen === 'stage' || state.screen === 'boss')
  ) {
    state.paused = !state.paused;
    state.events.push({ type: 'sfx', sfx: 'ui_confirm' });
    return state.events;
  }

  // Quick Restart
  if (
    input.restartPressed &&
    !state.paused &&
    (state.screen === 'stage' || state.screen === 'boss')
  ) {
    dispatchCommand(state, { type: 'restart_stage' });
    absorbCalloutEvents(state);
    return state.events;
  }

  // Non-active screens or paused
  if (
    state.paused ||
    state.screen === 'title' ||
    state.screen === 'rank' ||
    state.screen === 'victory'
  ) {
    return state.events;
  }

  state.tick++;

  // Screen juice decay
  if (state.shakeTimer > 0) {
    state.shakeTimer--;
    if (state.shakeTimer <= 0) state.shakeMag = 0;
  }
  if (state.flashTicks > 0) state.flashTicks--;
  if (state.tv.calloutTimer > 0) {
    state.tv.calloutTimer--;
    if (state.tv.calloutTimer <= 0) state.tv.calloutText = '';
  }
  if (state.tv.comboBounce > 0) state.tv.comboBounce--;

  // Hitstop freeze frame (preserves prev positions for crisp rendering & buffers fresh presses)
  if (state.hitstopTicks > 0) {
    state.hitstopTicks--;
    if (input.jumpPressed) {
      state.player.jumpBufferTicks = ENGINE_CONSTANTS.JUMP_BUFFER_TICKS;
    }
    if (input.grabPressed) {
      state.player.slapBufferTicks = ENGINE_CONSTANTS.SLAP_BUFFER_TICKS;
    }
    state.player.prevX = state.player.x;
    state.player.prevY = state.player.y;
    state.camera.prevX = state.camera.x;
    state.camera.prevY = state.camera.y;
    state.tv.animTick++;
    return state.events;
  }

  // Boss VS Intro Banner freeze
  if (state.bossIntroTicks > 0) {
    state.bossIntroTicks--;
    state.player.prevX = state.player.x;
    state.player.prevY = state.player.y;
    updateCamera(state);
    updateTvHud(state);
    return state.events;
  }

  if (state.gameOver || state.stageComplete) {
    updateCamera(state);
    updateTvHud(state);
    return state.events;
  }

  // Room gate / alarm timers
  if (state.room.outletGateTimer > 0) state.room.outletGateTimer--;
  if (state.room.alarmActiveTicks > 0) state.room.alarmActiveTicks--;

  const prevCombo = state.player.combo;

  // 1. Player physics & moveset
  stepPlayer(state, input);

  // 2. Projectiles
  stepProjectiles(state);

  // 3. Enemies & Boss AI
  stepEnemies(state);
  if (state.boss) {
    stepBoss(state);
  }

  // 4. Combat hit resolution
  stepPlayerCombatHits(state);

  // 5. Level doors, pickups, props, Pillar Chronos, Escape, Lap 2, Hub gates
  stepLevelRuntime(state, input);

  // 6. Combo fuse timer
  stepCombo(state);
  if (state.player.combo > prevCombo) {
    state.tv.comboBounce = 14;
  }

  // 7. Special stage mode rules (WAR timer, Tricky Treat, Secret World, Tasks)
  checkModeRules(state, input);

  // 8. Pit safety rescue (prevent falling infinitely below open room bottom)
  const pitLimitY = state.room.heightTiles * TS + 96;
  if (state.player.y > pitLimitY) {
    state.player.x = Math.max(64, Math.min(state.room.widthTiles * TS - 64, state.player.x));
    state.player.y = Math.max(96, (state.room.heightTiles - 3) * TS);
    state.player.vy = -8;
    state.player.vx = 0;
    state.player.movespeed = 0;
    hurtPlayer(state, state.player.x, 1);
  }

  // 9. Camera & Corner CRT TV HUD
  updateCamera(state);
  updateTvHud(state);
  absorbCalloutEvents(state);

  return state.events;
}
