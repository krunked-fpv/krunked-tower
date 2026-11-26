// ============================================================================
// Krunked Tower — Kinetic Physics Helpers, Afterimages & Shockwaves
// Pure 60 Hz simulation — ZERO DOM or non-deterministic RNG dependencies.
// ============================================================================

import {
  ENGINE_CONSTANTS,
  TileType,
  type InputFrame,
  type PlayableCharacter,
  type PlayerState,
  type SimState,
  type TileTypeValue,
} from '../contracts/index';
import { breakTileAt } from './collision';

export const MACH4_TINTS: readonly string[] = [
  '#ff385c',
  '#ffd43b',
  '#38d9ff',
  '#b24cff',
  '#3dff8c',
];

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function approach(current: number, target: number, delta: number): number {
  if (current < target) {
    return Math.min(current + delta, target);
  }
  if (current > target) {
    return Math.max(current - delta, target);
  }
  return target;
}

/**
 * Create a clean initial PlayerState anchored at feet (x, y).
 */
export function createInitialPlayer(
  character: PlayableCharacter,
  x: number,
  y: number,
): PlayerState {
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    facing: 1,
    state: 'normal',
    transformation: 'none',
    rider: character,
    movespeed: 0,
    wallspeed: 0,
    coyoteTicks: 0,
    jumpBufferTicks: 0,
    stopBufferTicks: 0,
    slopeBufferTicks: 0,
    slapBufferTicks: 0,
    jumpStop: false,
    grounded: false,
    onSlope: false,
    slopeDir: 0,
    onWall: false,
    wallDir: 0,
    crouch: false,
    freefallSmash: 0,
    grabDashTicks: 0,
    tauntTimer: 0,
    tauntPose: 0,
    tauntStoredState: 'normal',
    tauntStoredSpeed: 0,
    tauntStoredVy: 0,
    parryTicks: 0,
    hurtTicks: 0,
    invulnTicks: 0,
    superchargeKills: 0,
    superTauntReady: false,
    grabbedEnemyId: null,
    hp: ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP,
    maxHp: ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP,
    transformTimer: 0,
    ammoCooldown: 0,
    shotChargeTicks: 0,
    airJumpsLeft: 1,
    gustKickBuffer: 0,
    combo: 0,
    comboTime: 0,
    comboScore: 0,
    comboStarted: false,
    comboDropped: false,
    maxCombo: 0,
    escapeTauntsUsed: 0,
    animFrame: 0,
    animTimer: 0,
    afterimageTick: 0,
    driftDir: 1,
    driftFromMach3: false,
    hasRevolver: false,
    hasShotgun: false,
  };
}

/**
 * Apply vertical gravity capped at terminal velocity.
 */
export function applyGravity(
  player: PlayerState,
  grav: number = ENGINE_CONSTANTS.GRAV,
  maxVsp: number = ENGINE_CONSTANTS.FREEFALL_VSP,
): void {
  player.vy = Math.min(maxVsp, player.vy + grav);
}

/**
 * Exact oracle variable jump height cut:
 * When jump is released while ascending (`vy < 0.5`) and `!jumpStop`, divide `vy` by 20.
 */
export function applyVariableJumpCut(player: PlayerState, input: InputFrame): void {
  if (
    !player.grounded &&
    (!input.jumpHeld || input.jumpReleased) &&
    player.vy < ENGINE_CONSTANTS.JUMP_CUT_VSP_THRESHOLD &&
    !player.jumpStop
  ) {
    player.vy /= ENGINE_CONSTANTS.JUMP_CUT_DIV;
    player.jumpStop = true;
  }
}

/**
 * Update all input forgiveness buffers (coyote, jump, slope, slap, gustKick).
 */
export function tickInputBuffers(player: PlayerState, input: InputFrame): void {
  if (player.grounded) {
    player.coyoteTicks = ENGINE_CONSTANTS.COYOTE_TICKS;
  } else if (player.coyoteTicks > 0) {
    player.coyoteTicks--;
  }

  if (input.jumpPressed) {
    player.jumpBufferTicks = ENGINE_CONSTANTS.JUMP_BUFFER_TICKS;
  } else if (player.jumpBufferTicks > 0) {
    player.jumpBufferTicks--;
  }

  if (player.onSlope) {
    player.slopeBufferTicks = ENGINE_CONSTANTS.SLOPE_BUFFER_TICKS;
  } else if (player.slopeBufferTicks > 0) {
    player.slopeBufferTicks--;
  }

  if (input.grabPressed) {
    player.slapBufferTicks = ENGINE_CONSTANTS.SLAP_BUFFER_TICKS;
  } else if (player.slapBufferTicks > 0) {
    player.slapBufferTicks--;
  }

  if (player.gustKickBuffer > 0) {
    player.gustKickBuffer--;
  }
}

/**
 * Compute Mach acceleration adjusted by downhill (+0.1) or uphill (-0.2) slope bias.
 */
export function computeSlopeMachAccel(player: PlayerState, baseAccel: number): number {
  if ((player.onSlope || player.slopeBufferTicks > 0) && player.slopeDir !== 0) {
    if (player.facing === player.slopeDir) {
      return baseAccel + ENGINE_CONSTANTS.MACH2_SLOPE_ACCEL;
    }
    if (player.facing === -player.slopeDir) {
      return baseAccel - ENGINE_CONSTANTS.MACH2_SLOPE_DECEL;
    }
  }
  return baseAccel;
}

export function getConveyorDeltaX(surfaceTile: TileTypeValue): number {
  if (surfaceTile === TileType.CONVEYOR_RIGHT) return 2.5;
  if (surfaceTile === TileType.CONVEYOR_LEFT) return -2.5;
  return 0;
}

export function isIceSurface(surfaceTile: TileTypeValue): boolean {
  return surfaceTile === TileType.ICE_SOLID;
}

/**
 * Map current player rider/transformation/action to canonical sprite key for afterimages.
 */
export function getPlayerSpriteKey(state: SimState): string {
  const p = state.player;
  if (p.transformation !== 'none') {
    return `peppo_transfo_${p.transformation}`;
  }
  if (p.rider === 'gusto_chonks') {
    if (p.state === 'climb_wall') return 'gusto_climb_wall';
    if (p.state === 'hurt') return 'gusto_hurt';
    if (p.state === 'taunt' || p.state === 'super_taunt') return 'gusto_taunt';
    if (!p.grounded) return p.vy < 0 ? 'gusto_jump' : 'gusto_fall';
    if (p.movespeed >= ENGINE_CONSTANTS.GUSTO_BASE_SPEED) return 'gusto_mach';
    return p.movespeed > 0.5 ? 'gusto_walk' : 'gusto_idle';
  }

  const prefix = state.character === 'static' ? 'static' : 'peppo';
  switch (p.state) {
    case 'mach1':
      return `${prefix}_mach1`;
    case 'mach2':
      return `${prefix}_mach2`;
    case 'mach3':
      return `${prefix}_mach3`;
    case 'mach4':
      return `${prefix}_mach4`;
    case 'mach_slide':
      return `${prefix}_mach_slide`;
    case 'mach_roll':
      return `${prefix}_mach_roll`;
    case 'wall_bounce':
      return 'static_wall_bounce';
    case 'climb_wall':
      return `${prefix === 'static' ? 'static_wall_bounce' : 'peppo_climb_wall'}`;
    case 'grab_dash':
      return `${prefix}_grab_dash`;
    case 'grab_hold':
      return 'peppo_grab_hold';
    case 'piledriver':
      return 'peppo_piledriver';
    case 'uppercut':
      return 'peppo_uppercut';
    case 'sjump_prep':
      return `${prefix}_sjump_prep`;
    case 'sjump':
    case 'sjump_land':
      return `${prefix}_sjump`;
    case 'sjump_cancel':
      return 'peppo_sjump_cancel';
    case 'freefall_prep':
    case 'freefall':
    case 'freefall_land':
      return `${prefix}_freefall`;
    case 'taunt':
      return `${prefix}_taunt`;
    case 'super_taunt':
      return 'peppo_super_taunt';
    case 'parry':
      return 'peppo_parry';
    case 'hurt':
      return `${prefix}_hurt`;
    case 'crouch':
      return `${prefix}_crouch`;
    case 'crouch_slide':
      return 'peppo_crouch_slide';
    default:
      if (!p.grounded) return p.vy < 0 ? `${prefix}_jump` : `${prefix}_fall`;
      return p.movespeed > 0.5 ? `${prefix}_walk` : `${prefix}_idle`;
  }
}

export function emitAfterimage(state: SimState, tint: string, alpha = 0.72): void {
  const p = state.player;
  state.events.push({
    type: 'afterimage',
    x: p.x,
    y: p.y,
    facing: p.facing,
    spriteKey: getPlayerSpriteKey(state),
    tint,
    alpha,
  });
}

export function emitDust(state: SimState, x: number, y: number, count = 3): void {
  state.events.push({
    type: 'particle',
    kind: 'dust',
    x,
    y,
    count,
    color: '#efe7d8',
  });
}

export function emitSpeedLines(state: SimState): void {
  const p = state.player;
  state.events.push({
    type: 'particle',
    kind: 'speed_line',
    x: p.x - p.facing * 20,
    y: p.y - 24,
    vx: -p.facing * 12,
    vy: 0,
    count: 2,
    color: '#ffffff',
  });
}

/**
 * Heavy Bodyslam / Piledriver impact: breaks Metal/Marble underneath and
 * launches nearby enemies into the air with screen shake & shockwave!
 */
export function applyHeavySlamShockwave(state: SimState): void {
  const p = state.player;
  const ts = ENGINE_CONSTANTS.TILE_SIZE;

  // Break destructible floor directly beneath player's landing footprint
  const footTy = Math.floor((p.y + 2) / ts);
  const minTx = Math.floor((p.x - 20) / ts);
  const maxTx = Math.floor((p.x + 20) / ts);
  for (let tx = minTx; tx <= maxTx; tx++) {
    breakTileAt(state, tx, footTy, 'metal');
  }

  // Launch nearby enemies into stunned airborne juggle state
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e.alive || e.grabbed) continue;
    const dx = Math.abs(e.x - p.x);
    const dy = Math.abs(e.y - p.y);
    if (dx <= 180 && dy <= 96) {
      e.vy = -9.5;
      e.vx = (e.x >= p.x ? 1 : -1) * 3.5;
      e.grounded = false;
      e.stunTicks = Math.max(e.stunTicks, 120);
      e.scared = true;
    }
  }

  state.shakeMag = Math.max(state.shakeMag, 7.5);
  state.shakeTimer = Math.max(state.shakeTimer, 14);
  state.events.push(
    { type: 'sfx', sfx: 'bodyslam_heavy' },
    {
      type: 'particle',
      kind: 'slam_wave',
      x: p.x,
      y: p.y - 4,
      count: 10,
      color: '#ffdf6b',
    },
    { type: 'rumble', strong: 0.85, weak: 0.6, durationMs: 160 },
  );
}
