// ============================================================================
// Krunked Tower — Full 60 Hz Kinetic Movesets
// Chef Peppo, The Static, and Gusto & Chonks — oracle-verified physics.
// Pure 60 Hz simulation — ZERO DOM or non-deterministic RNG dependencies.
// ============================================================================

import {
  ENGINE_CONSTANTS,
  TileType,
  type InputFrame,
  type SimState,
  type TileTypeValue,
} from '../contracts/index';
import {
  breakTileAt,
  canPlayerUncrouch,
  getSurfaceTileUnderPlayer,
  getTileAt,
  isSolidTile,
  moveAndCollidePlayer,
  type PlayerCollisionResult,
} from './collision';
import {
  MACH4_TINTS,
  applyGravity,
  applyHeavySlamShockwave,
  applyVariableJumpCut,
  approach,
  clamp,
  computeSlopeMachAccel,
  createInitialPlayer,
  emitAfterimage,
  emitDust,
  emitSpeedLines,
  getConveyorDeltaX,
  isIceSurface,
  tickInputBuffers,
} from './physics';
import { nextInt } from './prng';
import { damageEnemy, spawnProjectile, triggerSuperTauntClear } from './combat';
import { applyTransformation, stepTransformation } from './transformations';
import { addScore, refillCombo } from './scoring';

export { createInitialPlayer };

const TS = ENGINE_CONSTANTS.TILE_SIZE;

function findGrabbedEnemy(state: SimState) {
  const id = state.player.grabbedEnemyId;
  if (id === null) return null;
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].id === id && state.enemies[i].alive) {
      return state.enemies[i];
    }
  }
  return null;
}

/**
 * Hurt the player with knockback, invulnerability, score loss (stages) or HP loss (bosses).
 */
export function hurtPlayer(state: SimState, sourceX: number, damage = 1): void {
  const p = state.player;
  if (
    p.invulnTicks > 0 ||
    p.state === 'hurt' ||
    p.state === 'door_enter' ||
    p.state === 'victory_pose' ||
    state.gameOver ||
    state.stageComplete
  ) {
    return;
  }

  // First 8t of Taunt automatically parries incoming damage!
  if (p.parryTicks > 0) {
    triggerParrySuccess(state, sourceX);
    return;
  }

  // Drop grabbed enemy cleanly
  const grabbed = findGrabbedEnemy(state);
  if (grabbed) {
    grabbed.grabbed = false;
    grabbed.stunTicks = 45;
  }
  p.grabbedEnemyId = null;

  const awayDir: 1 | -1 = p.x >= sourceX ? 1 : -1;
  p.facing = (-awayDir) as 1 | -1;
  p.state = 'hurt';
  p.hurtTicks = ENGINE_CONSTANTS.HURT_TICKS;
  p.invulnTicks = ENGINE_CONSTANTS.INVHURT_TICKS;
  p.vx = awayDir * 6.5;
  p.vy = -8;
  p.movespeed = 0;
  p.wallspeed = 0;
  p.grounded = false;
  p.onWall = false;
  p.crouch = false;
  p.parryTicks = 0;
  p.tauntTimer = 0;

  state.stageStats.hitsTaken++;

  if (state.screen === 'boss') {
    p.hp = Math.max(0, p.hp - damage);
    if (p.hp <= 0) {
      state.gameOver = true;
      state.gameOverReason = 'Knocked out in boss battle!';
    }
  } else {
    addScore(state, -ENGINE_CONSTANTS.HURT_SCORE_LOSS, p.x, p.y - 40);
  }

  state.hitstopTicks = Math.max(state.hitstopTicks, 4);
  state.shakeMag = Math.max(state.shakeMag, 6);
  state.shakeTimer = Math.max(state.shakeTimer, 10);
  state.events.push(
    { type: 'sfx', sfx: 'hurt' },
    {
      type: 'particle',
      kind: 'starburst',
      x: p.x,
      y: p.y - 24,
      count: 8,
      color: '#ff4d4d',
    },
    { type: 'rumble', strong: 0.7, weak: 0.5, durationMs: 140 },
  );
}

/**
 * Trigger a crisp Parry counter-flash!
 */
export function triggerParrySuccess(state: SimState, sourceX: number): void {
  const p = state.player;
  p.state = 'parry';
  p.tauntTimer = 14;
  p.parryTicks = 0;
  p.invulnTicks = Math.max(p.invulnTicks, 24);
  p.facing = sourceX >= p.x ? 1 : -1;

  state.stageStats.parriesLanded++;
  refillCombo(state, 30);

  state.hitstopTicks = Math.max(state.hitstopTicks, 8);
  state.flashTicks = Math.max(state.flashTicks, 6);
  state.shakeMag = Math.max(state.shakeMag, 6);
  state.shakeTimer = Math.max(state.shakeTimer, 10);

  state.events.push(
    { type: 'sfx', sfx: 'parry' },
    {
      type: 'particle',
      kind: 'parry_ring',
      x: p.x,
      y: p.y - 22,
      count: 1,
      color: '#66f3ff',
    },
    {
      type: 'particle',
      kind: 'starburst',
      x: p.x,
      y: p.y - 22,
      count: 10,
      color: '#ffffff',
    },
    { type: 'rumble', strong: 0.75, weak: 0.5, durationMs: 110 },
    { type: 'callout', text: 'PARRY!', durationTicks: 50 },
  );
}

function handleHazardContact(state: SimState, hazard: TileTypeValue | 0): void {
  if (hazard === 0) return;
  const p = state.player;
  if (hazard === TileType.LAVA_HAZARD) {
    if (p.transformation !== 'fire_butt') {
      applyTransformation(state, 'fire_butt');
    } else {
      p.vy = -12;
      p.transformTimer = Math.max(p.transformTimer, 30);
    }
    return;
  }
  if (hazard === TileType.SPIKE_HAZARD) {
    const immune =
      p.transformation === 'knight' ||
      p.transformation === 'ghost' ||
      p.transformation === 'barrel' ||
      p.transformation === 'rocket' ||
      p.transformation === 'fire_butt';
    if (!immune) {
      hurtPlayer(state, p.x - p.facing * 16, 1);
    }
  }
}

function hasWallAtSide(state: SimState, dir: 1 | -1): boolean {
  const p = state.player;
  const probeX = p.x + dir * (ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5 + 3);
  const tx = Math.floor(probeX / TS);
  const lowTy = Math.floor((p.y - 5) / TS);
  const midTy = Math.floor((p.y - 22) / TS);
  const topTy = Math.floor((p.y - 38) / TS);
  return (
    isSolidTile(getTileAt(state.room, tx, lowTy, state.escape.active)) ||
    isSolidTile(getTileAt(state.room, tx, midTy, state.escape.active)) ||
    isSolidTile(getTileAt(state.room, tx, topTy, state.escape.active))
  );
}

function isFlushWallAtSide(state: SimState, dir: 1 | -1): boolean {
  const p = state.player;
  const h = p.crouch ? ENGINE_CONSTANTS.PLAYER_CROUCH_H : ENGINE_CONSTANTS.PLAYER_STAND_H;
  const probeX = p.x + dir * (ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5 + 1.5);
  const tx = Math.floor(probeX / TS);
  const lowTy = Math.floor((p.y - 11) / TS);
  const midTy = Math.floor((p.y - h * 0.55) / TS);
  const topTy = Math.floor((p.y - h + 3) / TS);
  return (
    isSolidTile(getTileAt(state.room, tx, lowTy, state.escape.active)) ||
    isSolidTile(getTileAt(state.room, tx, midTy, state.escape.active)) ||
    isSolidTile(getTileAt(state.room, tx, topTy, state.escape.active))
  );
}

function enterWallClimb(state: SimState, dir: 1 | -1, minSpeed = 8): void {
  const p = state.player;
  p.state = 'climb_wall';
  p.wallspeed = clamp(Math.max(minSpeed, p.movespeed), minSpeed, ENGINE_CONSTANTS.WALL_CLIMB_MAX);
  p.wallDir = dir;
  p.facing = dir;
  p.onWall = true;
  p.grounded = false;
  p.coyoteTicks = 0;
  p.vy = -p.wallspeed;
  state.events.push({ type: 'sfx', sfx: 'wall_climb' });
}

function performJump(state: SimState, vsp: number = ENGINE_CONSTANTS.JUMP_SPEED): void {
  const p = state.player;
  p.vy = vsp;
  p.grounded = false;
  p.onSlope = false;
  p.coyoteTicks = 0;
  p.jumpBufferTicks = 0;
  p.jumpStop = false;
  state.events.push({ type: 'sfx', sfx: 'jump', pitchJitter: 0.06 });
  emitDust(state, p.x, p.y, 4);
}

function syncCollisionFlags(p: SimState['player'], res: PlayerCollisionResult): void {
  p.grounded = res.hitY && res.hitDirY === 1;
  p.onSlope = res.onSlope;
  p.slopeDir = res.slopeDir;
  p.onWall = res.hitX;
  p.wallDir = res.hitDirX;
  if (p.grounded) {
    p.airJumpsLeft = p.transformation === 'beak' ? 2 : 1;
  }
}

// ============================================================================
// Chef Peppo Moveset
// ============================================================================

function stepChefPeppo(state: SimState, input: InputFrame): void {
  const p = state.player;
  const surface = p.grounded ? getSurfaceTileUnderPlayer(state) : TileType.EMPTY;
  const conveyorDx = getConveyorDeltaX(surface);
  const icy = isIceSurface(surface);

  switch (p.state) {
    // ------------------------------------------------------------------
    // NORMAL WALK / IDLE / AIR
    // ------------------------------------------------------------------
    case 'normal': {
      if (p.crouch && canPlayerUncrouch(state)) {
        p.crouch = false;
      }

      // Immediate Mach 1 entry when holding Mach (skip strobing when flush against a wall!)
      if (input.machHeld && (p.grounded || p.coyoteTicks > 0)) {
        const targetDir: 1 | -1 = input.moveX !== 0 ? input.moveX : p.facing;
        if (!isFlushWallAtSide(state, targetDir)) {
          p.facing = targetDir;
          p.state = 'mach1';
          p.movespeed = Math.max(p.movespeed, ENGINE_CONSTANTS.MACH1_START);
          p.vx = p.facing * p.movespeed + conveyorDx;
          p.stopBufferTicks = ENGINE_CONSTANTS.STOP_BUFFER_TICKS;
          if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
            performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
          }
          state.events.push({ type: 'sfx', sfx: 'mach1' });
          emitDust(state, p.x, p.y, 3);
          break;
        }
      }

      // Crouch on ground
      if (p.grounded && input.moveY === 1) {
        p.crouch = true;
        p.state = 'crouch';
        p.vx = p.facing * Math.min(p.movespeed, ENGINE_CONSTANTS.CROUCH_SPEED) + conveyorDx;
        break;
      }

      // Flying Uppercut (Up + Grab)
      if (input.moveY === -1 && p.slapBufferTicks > 0) {
        p.state = 'uppercut';
        p.vy = ENGINE_CONSTANTS.UPPERCUT_VSP;
        p.movespeed = Math.min(p.movespeed, ENGINE_CONSTANTS.UPPERCUT_MAX_HSP);
        p.vx = p.facing * p.movespeed;
        p.grounded = false;
        p.coyoteTicks = 0;
        p.slapBufferTicks = 0;
        p.jumpStop = true;
        state.events.push(
          { type: 'sfx', sfx: 'uppercut' },
          { type: 'particle', kind: 'spark', x: p.x, y: p.y - 24, count: 6, color: '#ffee55' },
        );
        break;
      }

      // Grab Dash
      if (p.slapBufferTicks > 0) {
        if (input.moveX !== 0) p.facing = input.moveX;
        p.state = 'grab_dash';
        p.grabDashTicks = ENGINE_CONSTANTS.GRAB_DASH_TICKS;
        p.movespeed = ENGINE_CONSTANTS.GRAB_DASH_SPEED;
        p.vx = p.facing * p.movespeed + conveyorDx;
        p.slapBufferTicks = 0;
        state.events.push({ type: 'sfx', sfx: 'grab_dash' });
        emitDust(state, p.x, p.y, 4);
        break;
      }

      // Bodyslam in air
      if (!p.grounded && input.moveY === 1) {
        p.state = 'freefall';
        p.vy = Math.max(p.vy, 6);
        p.freefallSmash = 0;
        p.crouch = false;
        break;
      }

      // Horizontal walk / air drift
      const accel = icy ? 0.25 : p.grounded ? 0.85 : 0.65;
      const decel = icy ? 0.14 : p.grounded ? 0.9 : 0.35;
      if (input.moveX !== 0) {
        p.facing = input.moveX;
        const walkTarget = p.movespeed >= ENGINE_CONSTANTS.WALK_CRUISE ? ENGINE_CONSTANTS.WALK_MAX : ENGINE_CONSTANTS.WALK_CRUISE;
        p.movespeed = approach(p.movespeed, walkTarget, accel);
      } else {
        p.movespeed = approach(p.movespeed, 0, decel);
      }
      p.vx = p.facing * p.movespeed + conveyorDx;

      // Jump
      if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
        performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
      }
      applyVariableJumpCut(p, input);
      applyGravity(p);

      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      if (
        res.hitX &&
        res.hitDirX === p.facing &&
        input.machHeld &&
        !p.grounded &&
        p.vy <= 2
      ) {
        enterWallClimb(state, p.facing, 8);
        handleHazardContact(state, res.touchedHazard);
        return;
      }
      if (res.hitX) p.movespeed = 0;
      if (res.hitY) p.vy = 0;
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // CROUCH & CROUCH SLIDE
    // ------------------------------------------------------------------
    case 'crouch':
    case 'crouch_slide': {
      p.crouch = true;
      if (p.state === 'crouch_slide') {
        p.movespeed = approach(p.movespeed, 0, ENGINE_CONSTANTS.CROUCH_SLIDE_DECEL);
        if (p.movespeed <= ENGINE_CONSTANTS.CROUCH_SPEED) {
          p.state = 'crouch';
        }
      } else {
        if (input.moveX !== 0) {
          p.facing = input.moveX;
          p.movespeed = approach(p.movespeed, ENGINE_CONSTANTS.CROUCH_SPEED, 0.7);
        } else {
          p.movespeed = approach(p.movespeed, 0, 0.8);
        }
      }

      if (input.moveY !== 1 && canPlayerUncrouch(state)) {
        p.crouch = false;
        p.state = input.machHeld && p.movespeed >= 6 ? 'mach1' : 'normal';
      }

      if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
        performJump(state, ENGINE_CONSTANTS.CROUCH_JUMP_VSP);
      }

      p.vx = p.facing * p.movespeed + conveyorDx;
      applyVariableJumpCut(p, input);
      applyGravity(p);
      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      if (res.hitX) p.movespeed = 0;
      if (res.hitY) p.vy = 0;
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // MACH 1 (6 -> 8 px/t, +0.075/t)
    // ------------------------------------------------------------------
    case 'mach1': {
      p.crouch = false;
      if (input.moveX !== 0 && input.moveX !== p.facing && p.grounded) {
        p.facing = input.moveX;
      }

      // Uppercut / Grab
      if (input.moveY === -1 && p.slapBufferTicks > 0) {
        p.state = 'uppercut';
        p.vy = ENGINE_CONSTANTS.UPPERCUT_VSP;
        p.movespeed = Math.min(p.movespeed, ENGINE_CONSTANTS.UPPERCUT_MAX_HSP);
        p.grounded = false;
        p.slapBufferTicks = 0;
        p.jumpStop = true;
        state.events.push({ type: 'sfx', sfx: 'uppercut' });
        break;
      }
      if (p.slapBufferTicks > 0) {
        p.state = 'grab_dash';
        p.grabDashTicks = ENGINE_CONSTANTS.GRAB_DASH_TICKS;
        p.movespeed = ENGINE_CONSTANTS.GRAB_DASH_SPEED;
        p.slapBufferTicks = 0;
        state.events.push({ type: 'sfx', sfx: 'grab_dash' });
        break;
      }

      if (input.moveY === 1) {
        if (p.grounded) {
          p.state = 'crouch_slide';
          p.crouch = true;
          break;
        } else {
          p.state = 'freefall';
          p.vy = Math.max(p.vy, 6);
          p.freefallSmash = 0;
          break;
        }
      }

      if (input.machHeld) {
        p.stopBufferTicks = ENGINE_CONSTANTS.STOP_BUFFER_TICKS;
        p.movespeed = Math.max(p.movespeed, ENGINE_CONSTANTS.MACH1_START);
        p.movespeed += ENGINE_CONSTANTS.MACH1_ACCEL;
        if (p.movespeed >= ENGINE_CONSTANTS.MACH1_TO_2) {
          p.movespeed = ENGINE_CONSTANTS.MACH1_TO_2;
          p.state = 'mach2';
          state.events.push({ type: 'sfx', sfx: 'mach2' });
          emitDust(state, p.x, p.y, 5);
        }
      } else if (p.grounded) {
        p.stopBufferTicks--;
        if (p.stopBufferTicks <= 0) {
          p.state = 'normal';
        }
      }

      if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
        performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
      }

      p.vx = p.facing * p.movespeed + conveyorDx;
      applyVariableJumpCut(p, input);
      applyGravity(p);
      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      if (res.hitX) {
        if (
          res.hitDirX === p.facing &&
          input.machHeld &&
          (!p.grounded ? p.vy <= 2 : p.movespeed > ENGINE_CONSTANTS.MACH1_START + 0.15)
        ) {
          enterWallClimb(state, p.facing, 8);
          handleHazardContact(state, res.touchedHazard);
          return;
        }
        p.movespeed = 0;
        p.state = 'normal';
      }
      if (res.hitY) p.vy = 0;
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // MACH 2 (8 -> 12 -> 16 px/t ramp)
    // ------------------------------------------------------------------
    case 'mach2': {
      p.crouch = false;

      // Mach Drift on opposite direction while grounded
      if (p.grounded && input.moveX === -p.facing) {
        p.state = 'mach_slide';
        p.driftDir = (-p.facing) as 1 | -1;
        p.driftFromMach3 = false;
        p.vx = p.facing * p.movespeed + conveyorDx;
        state.events.push({ type: 'sfx', sfx: 'mach_drift' });
        emitDust(state, p.x, p.y, 6);
        break;
      }

      // Mach Roll (Down on ground) or Bodyslam (Down in air)
      if (input.moveY === 1) {
        if (p.grounded) {
          p.state = 'mach_roll';
          p.crouch = true;
          p.movespeed = Math.max(p.movespeed, ENGINE_CONSTANTS.MACH_ROLL_VSP);
          emitDust(state, p.x, p.y, 4);
          break;
        } else {
          p.state = 'freefall';
          p.vy = Math.max(p.vy, 7);
          p.freefallSmash = 0;
          break;
        }
      }

      // Uppercut / Grab
      if (input.moveY === -1 && p.slapBufferTicks > 0) {
        p.state = 'uppercut';
        p.vy = ENGINE_CONSTANTS.UPPERCUT_VSP;
        p.movespeed = Math.min(p.movespeed, ENGINE_CONSTANTS.UPPERCUT_MAX_HSP);
        p.grounded = false;
        p.slapBufferTicks = 0;
        p.jumpStop = true;
        state.events.push({ type: 'sfx', sfx: 'uppercut' });
        break;
      }
      if (p.slapBufferTicks > 0) {
        p.state = 'grab_dash';
        p.grabDashTicks = ENGINE_CONSTANTS.GRAB_DASH_TICKS;
        p.movespeed = Math.max(p.movespeed, ENGINE_CONSTANTS.GRAB_DASH_SPEED);
        p.slapBufferTicks = 0;
        state.events.push({ type: 'sfx', sfx: 'grab_dash' });
        break;
      }

      if (input.machHeld) {
        p.stopBufferTicks = ENGINE_CONSTANTS.STOP_BUFFER_TICKS;
        if (p.movespeed < ENGINE_CONSTANTS.MACH2_MAX) {
          const acc = computeSlopeMachAccel(p, ENGINE_CONSTANTS.MACH2_ACCEL);
          p.movespeed = clamp(p.movespeed + acc, ENGINE_CONSTANTS.MACH1_TO_2, ENGINE_CONSTANTS.MACH2_MAX);
        } else {
          // Mach 2 -> Mach 3 surge ramp (+0.4/t)
          const ramp = computeSlopeMachAccel(p, ENGINE_CONSTANTS.MACH2_TO_3_ACCEL);
          p.movespeed += Math.max(0.15, ramp);
          if (p.movespeed >= ENGINE_CONSTANTS.MACH3_SPEED) {
            p.movespeed = ENGINE_CONSTANTS.MACH3_SPEED;
            p.state = 'mach3';
            state.events.push(
              { type: 'sfx', sfx: 'mach3' },
              { type: 'rumble', strong: 0.35, weak: 0.25, durationMs: 60 },
            );
            emitSpeedLines(state);
          }
        }
      } else if (p.grounded) {
        p.stopBufferTicks--;
        if (p.stopBufferTicks <= 0) {
          p.state = 'mach_slide';
          p.driftDir = p.facing;
          p.driftFromMach3 = false;
          state.events.push({ type: 'sfx', sfx: 'mach_drift' });
        }
      }

      if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
        performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
      }

      if (state.tick % 4 === 0) {
        emitAfterimage(state, '#38d9ff', 0.55);
      }

      p.vx = p.facing * p.movespeed + conveyorDx;
      applyVariableJumpCut(p, input);
      applyGravity(p);
      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);

      // Wall Climb!
      if (res.hitX && res.hitDirX === p.facing) {
        if (input.machHeld || !p.grounded) {
          enterWallClimb(state, p.facing, 7);
          return;
        } else {
          p.movespeed = 0;
          p.state = 'normal';
        }
      }
      if (res.hitY) p.vy = 0;
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // MACH 3 (16 -> 20 px/t) & MACH 4 (20 px/t multi-hue afterimages!)
    // ------------------------------------------------------------------
    case 'mach3':
    case 'mach4': {
      p.crouch = false;
      const isMach4 = p.state === 'mach4';

      // Superjump Prep (Up held on ground at Mach 3/4!)
      if (p.grounded && input.moveY === -1) {
        p.state = 'sjump_prep';
        p.movespeed = ENGINE_CONSTANTS.SJUMP_SHUFFLE;
        p.vx = 0;
        state.events.push({ type: 'sfx', sfx: 'sjump_charge' });
        emitDust(state, p.x, p.y, 6);
        break;
      }

      // Mach Drift (opposite dir on ground)
      if (p.grounded && input.moveX === -p.facing) {
        p.state = 'mach_slide';
        p.driftDir = (-p.facing) as 1 | -1;
        p.driftFromMach3 = true;
        p.vx = p.facing * p.movespeed + conveyorDx;
        state.events.push({ type: 'sfx', sfx: 'mach_drift' });
        emitDust(state, p.x, p.y, 7);
        break;
      }

      // Mach Roll (Down on ground) or Bodyslam (Down in air)
      if (input.moveY === 1) {
        if (p.grounded) {
          p.state = 'mach_roll';
          p.crouch = true;
          p.movespeed = Math.max(p.movespeed, ENGINE_CONSTANTS.MACH_ROLL_MAX);
          emitDust(state, p.x, p.y, 5);
          break;
        } else {
          p.state = 'freefall';
          p.vy = Math.max(p.vy, 8);
          p.freefallSmash = 0;
          break;
        }
      }

      // Uppercut / Grab
      if (input.moveY === -1 && p.slapBufferTicks > 0) {
        p.state = 'uppercut';
        p.vy = ENGINE_CONSTANTS.UPPERCUT_VSP;
        p.movespeed = ENGINE_CONSTANTS.UPPERCUT_MAX_HSP;
        p.grounded = false;
        p.slapBufferTicks = 0;
        p.jumpStop = true;
        state.events.push({ type: 'sfx', sfx: 'uppercut' });
        break;
      }
      if (p.slapBufferTicks > 0) {
        p.state = 'grab_dash';
        p.grabDashTicks = ENGINE_CONSTANTS.GRAB_DASH_TICKS;
        p.movespeed = Math.max(p.movespeed, ENGINE_CONSTANTS.GRAB_DASH_SPEED);
        p.slapBufferTicks = 0;
        state.events.push({ type: 'sfx', sfx: 'grab_dash' });
        break;
      }

      if (input.machHeld) {
        p.stopBufferTicks = ENGINE_CONSTANTS.STOP_BUFFER_TICKS;
        if (!isMach4) {
          const baseAcc =
            p.movespeed >= 17
              ? ENGINE_CONSTANTS.MACH3_TO_4_ACCEL
              : ENGINE_CONSTANTS.MACH3_ACCEL;
          const acc = computeSlopeMachAccel(p, baseAcc);
          p.movespeed = clamp(p.movespeed + Math.max(0.01, acc), ENGINE_CONSTANTS.MACH3_SPEED, ENGINE_CONSTANTS.MACH4_SPEED);
          if (p.movespeed >= ENGINE_CONSTANTS.MACH4_SPEED) {
            p.state = 'mach4';
            p.movespeed = ENGINE_CONSTANTS.MACH4_SPEED;
            state.events.push(
              { type: 'sfx', sfx: 'mach4' },
              { type: 'rumble', strong: 0.45, weak: 0.35, durationMs: 80 },
            );
            emitSpeedLines(state);
          }
        } else {
          p.movespeed = ENGINE_CONSTANTS.MACH4_SPEED;
        }
      } else if (p.grounded) {
        p.stopBufferTicks--;
        if (p.stopBufferTicks <= 0) {
          p.state = 'mach_slide';
          p.driftDir = p.facing;
          p.driftFromMach3 = true;
          state.events.push({ type: 'sfx', sfx: 'mach_drift' });
        }
      }

      if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
        performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
      }

      // Afterimages & Speed lines
      if (isMach4) {
        if (state.tick % 2 === 0) {
          const tint = MACH4_TINTS[p.afterimageTick % MACH4_TINTS.length];
          p.afterimageTick++;
          emitAfterimage(state, tint, 0.78);
        }
        if (state.tick % 4 === 0) emitSpeedLines(state);
      } else if (state.tick % 3 === 0) {
        emitAfterimage(state, '#ff5938', 0.65);
      }

      p.vx = p.facing * p.movespeed + conveyorDx;
      applyVariableJumpCut(p, input);
      applyGravity(p);
      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);

      if (res.hitX && res.hitDirX === p.facing) {
        if (input.machHeld || !p.grounded) {
          enterWallClimb(state, p.facing, 12);
          return;
        } else {
          // Wall bonk!
          p.state = 'bump';
          p.grabDashTicks = 14;
          p.vx = -p.facing * 5;
          p.vy = -5.5;
          p.movespeed = 0;
          p.grounded = false;
          state.shakeMag = Math.max(state.shakeMag, 5);
          state.shakeTimer = Math.max(state.shakeTimer, 8);
          state.events.push({ type: 'sfx', sfx: 'bodyslam_heavy' });
          return;
        }
      }
      if (res.hitY) p.vy = 0;
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // MACH DRIFT (`mach_slide`)
    // ------------------------------------------------------------------
    case 'mach_slide': {
      p.movespeed = approach(p.movespeed, 0, 0.8);
      if (state.tick % 3 === 0) {
        emitDust(state, p.x, p.y, 2);
      }

      if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
        p.facing = p.driftDir;
        p.movespeed = p.driftFromMach3
          ? ENGINE_CONSTANTS.MACH_DRIFT_BOOST_3
          : ENGINE_CONSTANTS.MACH_DRIFT_BOOST_2;
        p.state = p.driftFromMach3 ? 'mach3' : 'mach2';
        performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
        break;
      }

      if (p.movespeed <= 2) {
        p.facing = p.driftDir;
        if (input.machHeld) {
          if (p.driftFromMach3) {
            p.movespeed = ENGINE_CONSTANTS.MACH_DRIFT_BOOST_3;
            p.state = 'mach3';
            state.events.push({ type: 'sfx', sfx: 'mach3' });
          } else {
            p.movespeed = ENGINE_CONSTANTS.MACH_DRIFT_BOOST_2;
            p.state = 'mach2';
            state.events.push({ type: 'sfx', sfx: 'mach2' });
          }
          emitDust(state, p.x, p.y, 6);
        } else {
          p.movespeed = 0;
          p.state = 'normal';
        }
      }

      p.vx = p.facing * p.movespeed + conveyorDx;
      applyGravity(p);
      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      if (res.hitX) {
        p.movespeed = 0;
        p.state = 'normal';
      }
      if (res.hitY) p.vy = 0;
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // MACH ROLL (`mach_roll`)
    // ------------------------------------------------------------------
    case 'mach_roll': {
      p.crouch = true;

      // Jump in air cancels straight into Bodyslam!
      if (!p.grounded && input.jumpPressed) {
        if (canPlayerUncrouch(state)) p.crouch = false;
        p.state = 'freefall';
        p.vy = Math.max(p.vy, 9);
        p.freefallSmash = 4;
        state.events.push({ type: 'sfx', sfx: 'grab_dash' });
        break;
      }

      // Slope downhill boost (+0.5/t) vs flat acceleration (+0.1/t up to 12)
      if ((p.onSlope || p.slopeBufferTicks > 0) && p.facing === p.slopeDir) {
        p.movespeed = Math.min(ENGINE_CONSTANTS.MACH3_SPEED, p.movespeed + ENGINE_CONSTANTS.MACH_ROLL_SLOPE_ACCEL);
      } else if (p.movespeed < ENGINE_CONSTANTS.MACH_ROLL_MAX) {
        p.movespeed = approach(p.movespeed, ENGINE_CONSTANTS.MACH_ROLL_MAX, ENGINE_CONSTANTS.MACH_ROLL_ACCEL);
      }

      // Release Down when clear of low ceiling
      if (input.moveY !== 1 && canPlayerUncrouch(state)) {
        p.crouch = false;
        if (input.machHeld) {
          p.state = p.movespeed >= ENGINE_CONSTANTS.MACH3_SPEED ? 'mach3' : 'mach2';
        } else {
          p.state = 'normal';
        }
      }

      if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
        performJump(state, -9.5);
      }

      if (state.tick % 3 === 0) {
        emitAfterimage(state, '#ffbe3d', 0.55);
      }

      p.vx = p.facing * p.movespeed + conveyorDx;
      applyGravity(p);
      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      if (res.hitX) {
        p.movespeed = 0;
        p.state = canPlayerUncrouch(state) ? 'normal' : 'crouch';
        if (p.state === 'normal') p.crouch = false;
      }
      if (res.hitY) p.vy = 0;
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // WALL CLIMB (`climb_wall`)
    // ------------------------------------------------------------------
    case 'climb_wall': {
      p.crouch = false;
      const wallSide: 1 | -1 = p.wallDir !== 0 ? p.wallDir : p.facing;
      p.wallspeed = Math.min(
        ENGINE_CONSTANTS.WALL_CLIMB_MAX,
        p.wallspeed + ENGINE_CONSTANTS.WALL_CLIMB_ACCEL,
      );

      // Wall kick jump maintaining Mach speed!
      if (p.jumpBufferTicks > 0) {
        const kickDir = (-wallSide) as 1 | -1;
        p.facing = kickDir;
        p.movespeed = clamp(p.wallspeed, 10, ENGINE_CONSTANTS.MACH4_SPEED);
        p.state = p.movespeed >= ENGINE_CONSTANTS.MACH3_SPEED ? 'mach3' : 'mach2';
        p.onWall = false;
        performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
        break;
      }

      // Pressing away from wall cleanly detaches!
      if (input.moveX === -wallSide) {
        p.facing = (-wallSide) as 1 | -1;
        p.state = 'normal';
        p.onWall = false;
        p.movespeed = ENGINE_CONSTANTS.WALK_CRUISE;
        p.vx = p.facing * p.movespeed;
        p.vy = -2;
        break;
      }

      // Release Mach -> drop off wall
      if (!input.machHeld) {
        p.state = 'normal';
        p.onWall = false;
        p.vy = -3;
        break;
      }

      p.vx = 0;
      p.vy = -p.wallspeed;
      if (state.tick % 3 === 0) {
        emitAfterimage(state, '#38d9ff', 0.6);
      }

      const res = moveAndCollidePlayer(state, 0, p.vy);
      handleHazardContact(state, res.touchedHazard);

      // Hit ceiling while climbing -> drop cleanly without re-grabbing wall
      if (res.hitY && res.hitDirY === -1) {
        p.state = 'normal';
        p.onWall = false;
        p.movespeed = 0;
        p.vy = 2.5;
        return;
      }

      // Check if we cleared the top of the wall -> vault smoothly onto ledge!
      if (!hasWallAtSide(state, wallSide)) {
        p.facing = wallSide;
        p.movespeed = clamp(p.wallspeed, 10, ENGINE_CONSTANTS.MACH4_SPEED);
        p.state = p.movespeed >= ENGINE_CONSTANTS.MACH3_SPEED ? 'mach3' : 'mach2';
        p.vy = -3.5;
        p.onWall = false;
        moveAndCollidePlayer(state, wallSide * 8, 0);
      }
      return;
    }

    // ------------------------------------------------------------------
    // GRAB DASH (`grab_dash`)
    // ------------------------------------------------------------------
    case 'grab_dash': {
      p.crouch = false;
      p.grabDashTicks--;

      // Grab + Jump Long Jump!
      if (p.jumpBufferTicks > 0 && (p.grounded || p.coyoteTicks > 0)) {
        p.movespeed = 13.5;
        performJump(state, ENGINE_CONSTANTS.JUMP_SPEED * 0.95);
      }

      if (state.tick % 3 === 0) {
        emitAfterimage(state, '#ff9f43', 0.6);
      }

      p.vx = p.facing * p.movespeed + conveyorDx;
      applyVariableJumpCut(p, input);
      applyGravity(p);
      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      if (res.hitY) p.vy = 0;

      if (res.hitX && res.hitDirX === p.facing) {
        if (input.machHeld) {
          enterWallClimb(state, p.facing, 10);
        } else {
          p.state = 'normal';
          p.movespeed = 0;
        }
      } else if (p.grabDashTicks <= 0) {
        // Chains seamlessly into instant Mach 2 when Mach is held!
        if (input.machHeld) {
          p.state = 'mach2';
          p.movespeed = Math.max(p.movespeed, ENGINE_CONSTANTS.MACH2_MAX);
          state.events.push({ type: 'sfx', sfx: 'mach2' });
        } else {
          p.state = 'normal';
          p.movespeed = Math.min(p.movespeed, ENGINE_CONSTANTS.WALK_CRUISE);
        }
      }
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // GRAB HOLD (`grab_hold`) & AIRBORNE PILEDRIVER (`piledriver`)
    // ------------------------------------------------------------------
    case 'grab_hold': {
      const grabbed = findGrabbedEnemy(state);
      if (!grabbed) {
        p.grabbedEnemyId = null;
        p.state = 'normal';
        break;
      }

      // Airborne Piledriver (Down in air!)
      if (!p.grounded && input.moveY === 1) {
        p.state = 'piledriver';
        p.vy = 14;
        p.freefallSmash = 12;
        state.events.push({ type: 'sfx', sfx: 'uppercut' });
        break;
      }

      // Throw enemy (Up Throw or Forward Throw — buffered so quick taps always fire!)
      if (input.grabPressed || p.slapBufferTicks > 0) {
        p.slapBufferTicks = 0;
        grabbed.grabbed = false;
        grabbed.thrown = true;
        grabbed.stunTicks = 120;
        if (input.moveY === -1) {
          grabbed.vx = p.facing * 2.5;
          grabbed.vy = -16;
        } else {
          grabbed.vx = p.facing * 16;
          grabbed.vy = -4.5;
        }
        p.grabbedEnemyId = null;
        p.state = input.machHeld ? 'mach2' : 'normal';
        if (p.state === 'mach2') p.movespeed = ENGINE_CONSTANTS.MACH2_MAX;
        state.events.push({ type: 'sfx', sfx: 'throw' });
        break;
      }

      if (input.moveX !== 0) {
        p.facing = input.moveX;
        p.movespeed = approach(p.movespeed, ENGINE_CONSTANTS.WALK_MAX, 0.8);
      } else {
        p.movespeed = approach(p.movespeed, 0, 0.85);
      }
      if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
        performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
      }

      p.vx = p.facing * p.movespeed + conveyorDx;
      applyVariableJumpCut(p, input);
      applyGravity(p);
      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      if (res.hitX) p.movespeed = 0;
      if (res.hitY) p.vy = 0;

      // Sync carried enemy position above hands
      grabbed.prevX = grabbed.x;
      grabbed.prevY = grabbed.y;
      grabbed.x = p.x + p.facing * 10;
      grabbed.y = p.y - 34;
      grabbed.vx = 0;
      grabbed.vy = 0;
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    case 'piledriver': {
      p.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, p.vy + 0.8);
      p.vx = input.moveX * 4;
      p.freefallSmash++;
      if (state.tick % 2 === 0) emitAfterimage(state, '#ff5938', 0.7);

      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      const grabbed = findGrabbedEnemy(state);
      if (grabbed) {
        grabbed.x = p.x;
        grabbed.y = p.y + 2;
      }

      if (res.hitY && res.hitDirY === 1) {
        if (grabbed) {
          damageEnemy(state, grabbed, p.facing * 12, -12, true);
        }
        p.grabbedEnemyId = null;
        applyHeavySlamShockwave(state);
        p.vy = -6.5;
        p.grounded = false;
        p.state = 'normal';
        p.freefallSmash = 0;
      }
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // FLYING UPPERCUT (`uppercut`)
    // ------------------------------------------------------------------
    case 'uppercut': {
      if (input.moveX !== 0) {
        p.facing = input.moveX;
        p.vx = approach(p.vx, input.moveX * ENGINE_CONSTANTS.UPPERCUT_MAX_HSP, 0.75);
      } else {
        p.vx = approach(p.vx, 0, 0.35);
      }
      p.movespeed = Math.abs(p.vx);
      applyGravity(p);
      if (state.tick % 2 === 0) {
        emitAfterimage(state, '#ffd43b', 0.7);
      }

      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      if (res.hitY) {
        p.vy = 0;
        if (res.hitDirY === 1) {
          p.state = input.machHeld ? 'mach2' : 'normal';
        }
      } else if (p.vy >= 1) {
        p.state = 'normal';
      }
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // SUPERJUMP (`sjump_prep` -> `sjump` -> `sjump_land` / `sjump_cancel`)
    // ------------------------------------------------------------------
    case 'sjump_prep': {
      p.vx = input.moveX * ENGINE_CONSTANTS.SJUMP_SHUFFLE + conveyorDx;
      if (input.moveX !== 0) p.facing = input.moveX;
      if (state.tick % 4 === 0) {
        state.events.push({
          type: 'particle',
          kind: 'spark',
          x: p.x,
          y: p.y - 6,
          count: 2,
          color: '#ffee55',
        });
      }

      // Release Up (or tap Jump) to BLAST OFF!
      if (input.moveY !== -1 || input.jumpPressed) {
        p.state = 'sjump';
        p.vy = ENGINE_CONSTANTS.SJUMP_VSP;
        p.vx = 0;
        p.movespeed = 0;
        p.grounded = false;
        p.coyoteTicks = 0;
        p.jumpBufferTicks = 0;
        state.events.push(
          { type: 'sfx', sfx: 'sjump_launch' },
          { type: 'particle', kind: 'slam_wave', x: p.x, y: p.y, count: 8, color: '#ffee55' },
          { type: 'rumble', strong: 0.7, weak: 0.5, durationMs: 120 },
        );
        return;
      }

      applyGravity(p);
      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);
      if (res.hitY) p.vy = 0;
      if (!p.grounded) {
        p.state = 'normal';
      }
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    case 'sjump': {
      // Shoulder-bash horizontal cancel!
      if (input.grabPressed) {
        if (input.moveX !== 0) p.facing = input.moveX;
        p.state = 'sjump_cancel';
        p.movespeed = ENGINE_CONSTANTS.SJUMP_CANCEL_SPEED;
        p.vy = 0;
        p.grabDashTicks = 18;
        state.hitstopTicks = Math.max(state.hitstopTicks, 3);
        state.events.push(
          { type: 'sfx', sfx: 'sjump_cancel' },
          { type: 'particle', kind: 'starburst', x: p.x, y: p.y - 22, count: 8, color: '#38e8ff' },
        );
        return;
      }

      p.vy = Math.max(-22, p.vy + ENGINE_CONSTANTS.SJUMP_ACCEL);
      p.vx = 0;
      if (state.tick % 2 === 0) {
        const tint = MACH4_TINTS[p.afterimageTick % MACH4_TINTS.length];
        p.afterimageTick++;
        emitAfterimage(state, tint, 0.8);
      }

      const res = moveAndCollidePlayer(state, 0, p.vy);
      p.grounded = false;
      if (res.hitY && res.hitDirY === -1) {
        p.state = 'sjump_land';
        p.vy = 0;
        p.grabDashTicks = 14;
        state.shakeMag = Math.max(state.shakeMag, 6);
        state.shakeTimer = Math.max(state.shakeTimer, 10);
        state.events.push(
          { type: 'sfx', sfx: 'bodyslam_heavy' },
          { type: 'particle', kind: 'dust', x: p.x, y: p.y - 44, count: 8, color: '#ffffff' },
        );
      }
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    case 'sjump_land': {
      p.grabDashTicks--;
      p.vx = 0;
      p.vy = 0;
      if (p.grabDashTicks <= 0 || input.jumpPressed) {
        p.state = 'normal';
        p.vy = 1;
      }
      return;
    }

    case 'sjump_cancel': {
      p.grabDashTicks--;
      p.vx = p.facing * ENGINE_CONSTANTS.SJUMP_CANCEL_SPEED;
      p.vy = 0;
      if (state.tick % 2 === 0) {
        emitAfterimage(state, '#38e8ff', 0.78);
      }

      const res = moveAndCollidePlayer(state, p.vx, 0);
      syncCollisionFlags(p, res);
      if (res.hitX) {
        if (input.machHeld) {
          enterWallClimb(state, p.facing, ENGINE_CONSTANTS.SJUMP_CANCEL_SPEED);
        } else {
          p.state = 'normal';
          p.movespeed = 0;
        }
      } else if (p.grabDashTicks <= 0) {
        p.movespeed = input.machHeld ? ENGINE_CONSTANTS.MACH3_SPEED : ENGINE_CONSTANTS.SJUMP_CANCEL_SPEED;
        p.state = input.machHeld ? 'mach3' : 'mach2';
      }
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    // ------------------------------------------------------------------
    // BODYSLAM (`freefall_prep` / `freefall` / `freefall_land`)
    // ------------------------------------------------------------------
    case 'freefall_prep':
    case 'freefall': {
      p.crouch = false;
      p.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, p.vy + ENGINE_CONSTANTS.GRAV);
      p.freefallSmash++;
      p.vx = input.moveX * 4;

      if (p.freefallSmash >= ENGINE_CONSTANTS.HEAVY_SLAM_SMASH_THRESHOLD && state.tick % 2 === 0) {
        emitAfterimage(state, '#ff4d24', 0.75);
      }

      const res = moveAndCollidePlayer(state, p.vx, p.vy);
      syncCollisionFlags(p, res);

      if (res.hitY && res.hitDirY === 1) {
        const footTy = Math.floor((p.y + 2) / TS);
        const minTx = Math.floor((p.x - 13) / TS);
        const maxTx = Math.floor((p.x + 13) / TS);
        const heavy =
          p.freefallSmash >= ENGINE_CONSTANTS.HEAVY_SLAM_SMASH_THRESHOLD ||
          state.character === 'static' ||
          p.rider === 'gusto_chonks';

        let brokeFloor = false;
        for (let tx = minTx; tx <= maxTx; tx++) {
          if (breakTileAt(state, tx, footTy, heavy ? 'metal' : 'marble')) {
            brokeFloor = true;
          }
        }

        if (brokeFloor) {
          // Keep plummeting straight through broken floors!
          p.grounded = false;
          p.vy = Math.max(p.vy, 10);
        } else if (heavy) {
          applyHeavySlamShockwave(state);
          p.vy = 0;
          p.vx = 0;
          p.state = 'freefall_land';
          p.grabDashTicks = 10;
          p.freefallSmash = 0;
        } else {
          p.vy = 0;
          p.freefallSmash = 0;
          emitDust(state, p.x, p.y, 6);
          state.events.push({ type: 'sfx', sfx: 'block_marble' });
          p.state = input.machHeld && p.movespeed >= 8 ? 'mach2' : 'normal';
        }
      }
      handleHazardContact(state, res.touchedHazard);
      return;
    }

    case 'freefall_land': {
      p.grabDashTicks--;
      p.vx = 0;
      p.vy = 0;
      if (p.grabDashTicks <= 0 || input.jumpPressed || input.grabPressed) {
        p.state = 'normal';
        if (input.jumpPressed) {
          performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
        }
      }
      return;
    }

    default: {
      p.state = 'normal';
      return;
    }
  }

  // If a state transition broke out of switch to apply motion this tick, apply light gravity step
  applyGravity(p);
  const fallbackRes = moveAndCollidePlayer(state, p.vx, p.vy);
  syncCollisionFlags(p, fallbackRes);
  if (fallbackRes.hitY) p.vy = 0;
  handleHazardContact(state, fallbackRes.touchedHazard);
}

// ============================================================================
// The Static Moveset (Skateboard Mach 20, Wall Bounce, Tornado DJ, Drill, Instant Superjump, Bomb)
// ============================================================================

function stepStatic(state: SimState, input: InputFrame): void {
  const p = state.player;

  // Bomb special (Shoot button when not holding Shotgun/Revolver)
  if (
    input.shootPressed &&
    !p.hasShotgun &&
    !p.hasRevolver &&
    p.ammoCooldown <= 0
  ) {
    p.ammoCooldown = 28;
    spawnProjectile(state, {
      owner: 'player',
      kind: 'bomb',
      x: p.x + p.facing * 14,
      y: p.y - 24,
      vx: p.facing * 10,
      vy: -6.5,
      radius: 10,
      damage: 2,
      parryable: false,
      reflected: false,
      gravity: true,
      ttlTicks: 85,
      color: '#ffdd33',
    });
    state.events.push({ type: 'sfx', sfx: 'throw' });
  }

  // Instant Superjump on ground (Up + Jump without needing Mach 3!)
  if (
    p.grounded &&
    input.moveY === -1 &&
    input.jumpPressed &&
    p.state !== 'sjump' &&
    p.state !== 'sjump_cancel'
  ) {
    p.state = 'sjump';
    p.vy = ENGINE_CONSTANTS.SJUMP_VSP;
    p.vx = 0;
    p.movespeed = 0;
    p.grounded = false;
    p.coyoteTicks = 0;
    p.jumpBufferTicks = 0;
    state.events.push(
      { type: 'sfx', sfx: 'sjump_launch' },
      { type: 'particle', kind: 'slam_wave', x: p.x, y: p.y, count: 8, color: '#ffee33' },
      { type: 'rumble', strong: 0.7, weak: 0.5, durationMs: 110 },
    );
    return;
  }

  // Wall Bounce state (Grab chains right back into the wall!)
  if (p.state === 'wall_bounce') {
    if (input.grabPressed) {
      p.facing = (-p.facing) as 1 | -1;
      p.state = 'grab_dash';
      p.grabDashTicks = 16;
      p.movespeed = ENGINE_CONSTANTS.GRAB_DASH_SPEED;
      state.events.push({ type: 'sfx', sfx: 'grab_dash' });
      return;
    }
    if (input.moveX !== 0) {
      p.vx = approach(p.vx, input.moveX * ENGINE_CONSTANTS.STATIC_WALL_BOUNCE_HSP, 0.75);
      p.facing = input.moveX;
    }
    p.movespeed = Math.abs(p.vx);
    applyGravity(p);
    if (state.tick % 2 === 0) emitAfterimage(state, '#ffee33', 0.7);
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    syncCollisionFlags(p, res);
    if (res.hitX && res.hitDirX === p.facing && !p.grounded) {
      // Chain bounce off opposite wall!
      p.facing = (-p.facing) as 1 | -1;
      p.vx = p.facing * ENGINE_CONSTANTS.STATIC_WALL_BOUNCE_HSP;
      p.vy = ENGINE_CONSTANTS.STATIC_WALL_BOUNCE_VSP;
      p.airJumpsLeft = 1;
      state.events.push({ type: 'sfx', sfx: 'wall_bounce' });
      return;
    }
    if (res.hitY) {
      p.vy = 0;
      if (res.hitDirY === 1) {
        p.state = input.machHeld ? 'mach2' : 'normal';
      }
    }
    handleHazardContact(state, res.touchedHazard);
    return;
  }

  // Midair Tornado Double-Jump!
  if (
    !p.grounded &&
    p.coyoteTicks <= 0 &&
    input.jumpPressed &&
    p.airJumpsLeft > 0 &&
    p.state !== 'sjump' &&
    p.state !== 'freefall'
  ) {
    p.airJumpsLeft--;
    p.vy = -10.8;
    p.jumpStop = false;
    p.jumpBufferTicks = 0;
    state.events.push(
      { type: 'sfx', sfx: 'jump', pitchJitter: 0.14 },
      { type: 'particle', kind: 'spark', x: p.x, y: p.y - 10, count: 6, color: '#fff04d' },
    );
  }

  // Reuse Peppo's ultra-crisp Skateboard Mach core, then convert `climb_wall` -> `wall_bounce`!
  stepChefPeppo(state, input);

  if (p.state === 'climb_wall') {
    const bounceDir = (-p.wallDir || -p.facing) as 1 | -1;
    p.state = 'wall_bounce';
    p.facing = bounceDir;
    p.vx = bounceDir * ENGINE_CONSTANTS.STATIC_WALL_BOUNCE_HSP;
    p.vy = ENGINE_CONSTANTS.STATIC_WALL_BOUNCE_VSP;
    p.movespeed = ENGINE_CONSTANTS.STATIC_WALL_BOUNCE_HSP;
    p.grounded = false;
    p.onWall = false;
    p.airJumpsLeft = 1;
    state.events.push(
      { type: 'sfx', sfx: 'wall_bounce' },
      { type: 'particle', kind: 'starburst', x: p.x, y: p.y - 20, count: 6, color: '#ffee33' },
    );
  }
}

// ============================================================================
// Gusto & Chonks Buddy Rider Moveset
// ============================================================================

function stepGustoChonks(state: SimState, input: InputFrame): void {
  const p = state.player;
  const surface = p.grounded ? getSurfaceTileUnderPlayer(state) : TileType.EMPTY;
  const conveyorDx = getConveyorDeltaX(surface);

  // Groundpound (`freefall`)
  if (p.state === 'freefall') {
    p.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, p.vy + 0.65);
    p.freefallSmash = Math.max(p.freefallSmash + 1, ENGINE_CONSTANTS.HEAVY_SLAM_SMASH_THRESHOLD);
    p.vx = input.moveX * 4;
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    syncCollisionFlags(p, res);
    if (res.hitY && res.hitDirY === 1) {
      applyHeavySlamShockwave(state);
      p.vy = 0;
      p.state = 'normal';
      p.freefallSmash = 0;
    }
    handleHazardContact(state, res.touchedHazard);
    return;
  }

  // Wall climb for Gusto & Chonks
  if (p.state === 'climb_wall') {
    const wallSide: 1 | -1 = p.wallDir !== 0 ? p.wallDir : p.facing;
    p.wallspeed = 11;
    if (p.jumpBufferTicks > 0) {
      p.facing = (-wallSide) as 1 | -1;
      p.state = 'normal';
      p.movespeed = ENGINE_CONSTANTS.GUSTO_BASE_SPEED;
      performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
      return;
    }
    if (input.moveX === -wallSide) {
      p.facing = (-wallSide) as 1 | -1;
      p.state = 'normal';
      p.onWall = false;
      p.movespeed = ENGINE_CONSTANTS.GUSTO_BASE_SPEED;
      p.vy = -2;
      return;
    }
    if (!input.machHeld) {
      p.state = 'normal';
      p.onWall = false;
      return;
    }
    const res = moveAndCollidePlayer(state, 0, -p.wallspeed);
    handleHazardContact(state, res.touchedHazard);
    if (res.hitY && res.hitDirY === -1) {
      p.state = 'normal';
      p.onWall = false;
      p.movespeed = 0;
      p.vy = 2.5;
      return;
    }
    if (!hasWallAtSide(state, wallSide)) {
      p.state = 'normal';
      p.onWall = false;
      p.vy = -4;
      p.movespeed = ENGINE_CONSTANTS.GUSTO_BASE_SPEED;
      moveAndCollidePlayer(state, wallSide * 8, 0);
    }
    return;
  }

  // Buddy Kick (Up + Grab, or Grab with 30t buffer) -> launches `chonks_kick` projectile!
  if (p.slapBufferTicks > 0 && p.gustKickBuffer <= 0) {
    p.slapBufferTicks = 0;
    p.gustKickBuffer = ENGINE_CONSTANTS.GUSTO_KICK_BUFFER;
    spawnProjectile(state, {
      owner: 'player',
      kind: 'chonks_kick',
      x: p.x + p.facing * 20,
      y: p.y - 22,
      vx: p.facing * 15,
      vy: 0,
      radius: 20,
      damage: 2,
      parryable: false,
      reflected: false,
      gravity: false,
      ttlTicks: 50,
      color: '#ff96b4',
    });
    state.events.push(
      { type: 'sfx', sfx: 'throw' },
      { type: 'particle', kind: 'starburst', x: p.x + p.facing * 18, y: p.y - 22, count: 8, color: '#ff96b4' },
    );
  }

  // Groundpound in air (Down)
  if (!p.grounded && input.moveY === 1) {
    p.state = 'freefall';
    p.vy = Math.max(p.vy, 9);
    p.freefallSmash = ENGINE_CONSTANTS.HEAVY_SLAM_SMASH_THRESHOLD;
    return;
  }

  // Sprint 8 -> 12 px/t (+0.15/t, breaks Metal at 12!)
  if (input.machHeld || input.moveX !== 0) {
    if (input.moveX !== 0) p.facing = input.moveX;
    if (input.machHeld) {
      p.movespeed = Math.max(p.movespeed, ENGINE_CONSTANTS.GUSTO_BASE_SPEED);
      p.movespeed = approach(p.movespeed, ENGINE_CONSTANTS.GUSTO_MAX_SPEED, ENGINE_CONSTANTS.GUSTO_ACCEL);
      p.state = p.movespeed >= ENGINE_CONSTANTS.GUSTO_MAX_SPEED ? 'mach3' : 'mach2';
    } else {
      p.movespeed = approach(p.movespeed, ENGINE_CONSTANTS.GUSTO_BASE_SPEED, 0.7);
      p.state = 'normal';
    }
  } else {
    p.movespeed = approach(p.movespeed, 0, 0.85);
    p.state = 'normal';
  }

  // Jump & Midair Double Jump (breaks Metal underneath!)
  if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
    performJump(state, ENGINE_CONSTANTS.JUMP_SPEED);
  } else if (!p.grounded && input.jumpPressed && p.airJumpsLeft > 0) {
    p.airJumpsLeft--;
    p.vy = -11.5;
    p.jumpStop = false;
    p.jumpBufferTicks = 0;

    // Break Metal/Marble directly underneath Chonks double-jump!
    const footTy = Math.floor((p.y + 8) / TS);
    const minTx = Math.floor((p.x - 20) / TS);
    const maxTx = Math.floor((p.x + 20) / TS);
    for (let tx = minTx; tx <= maxTx; tx++) {
      breakTileAt(state, tx, footTy, 'metal');
      breakTileAt(state, tx, footTy + 1, 'metal');
    }

    state.events.push(
      { type: 'sfx', sfx: 'jump', pitchJitter: 0.1 },
      { type: 'particle', kind: 'slam_wave', x: p.x, y: p.y, count: 8, color: '#ff96b4' },
    );
  }

  if (p.movespeed >= ENGINE_CONSTANTS.GUSTO_MAX_SPEED && state.tick % 3 === 0) {
    emitAfterimage(state, '#ff96b4', 0.65);
  }

  p.vx = p.facing * p.movespeed + conveyorDx;
  applyVariableJumpCut(p, input);
  applyGravity(p);
  const res = moveAndCollidePlayer(state, p.vx, p.vy);
  syncCollisionFlags(p, res);

  if (
    res.hitX &&
    res.hitDirX === p.facing &&
    (input.machHeld || !p.grounded) &&
    (p.grounded || p.vy <= 2)
  ) {
    p.state = 'climb_wall';
    p.wallDir = p.facing;
    p.wallspeed = 11;
    p.onWall = true;
    p.coyoteTicks = 0;
    state.events.push({ type: 'sfx', sfx: 'wall_climb' });
    return;
  }
  if (res.hitY) p.vy = 0;
  handleHazardContact(state, res.touchedHazard);
}

// ============================================================================
// Main Player Tick Entrypoint
// ============================================================================

export function stepPlayer(state: SimState, input: InputFrame): void {
  const p = state.player;
  p.prevX = p.x;
  p.prevY = p.y;
  p.animTimer++;

  // Timers
  if (p.ammoCooldown > 0) p.ammoCooldown--;
  if (p.parryTicks > 0) p.parryTicks--;
  if (p.hurtTicks > 0) p.hurtTicks--;
  if (p.invulnTicks > 0 && p.state !== 'hurt') p.invulnTicks--;

  tickInputBuffers(p, input);

  // Frozen / scripted states
  if (p.state === 'door_enter' || p.state === 'victory_pose') {
    p.vx = 0;
    p.vy = 0;
    return;
  }

  if (p.state === 'taunt' || p.state === 'super_taunt' || p.state === 'parry') {
    p.vx = 0;
    p.vy = 0;
    p.tauntTimer--;
    if (p.tauntTimer <= 0) {
      const restore = p.tauntStoredState;
      p.state =
        restore === 'taunt' || restore === 'super_taunt' || restore === 'parry'
          ? 'normal'
          : restore;
      p.movespeed = p.tauntStoredSpeed;
      p.vy = p.tauntStoredVy;
      p.vx = p.facing * p.movespeed;
      p.parryTicks = 0;
    }
    return;
  }

  if (p.state === 'hurt') {
    p.invulnTicks = ENGINE_CONSTANTS.INVHURT_TICKS;
    applyGravity(p);
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    syncCollisionFlags(p, res);
    if (res.hitX) p.vx = -p.vx * 0.4;
    if (res.hitY) p.vy = 0;
    const elapsedHurt = ENGINE_CONSTANTS.HURT_TICKS - p.hurtTicks;
    if ((p.grounded && elapsedHurt >= 18) || elapsedHurt >= 36) {
      p.state = 'normal';
      p.vx = 0;
      p.movespeed = 0;
    }
    return;
  }

  if (p.state === 'bump') {
    p.grabDashTicks--;
    applyGravity(p);
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    syncCollisionFlags(p, res);
    if (res.hitY) p.vy = 0;
    if (p.grabDashTicks <= 0 || (p.grounded && p.grabDashTicks <= 8)) {
      p.state = 'normal';
      p.vx = 0;
    }
    return;
  }

  // Universal Super Taunt & Taunt / Parry trigger
  const wantSuperTaunt =
    p.superTauntReady &&
    (input.superTauntPressed || (input.tauntPressed && input.moveY === -1));

  if (wantSuperTaunt) {
    p.tauntStoredState = p.state;
    p.tauntStoredSpeed = p.movespeed;
    p.tauntStoredVy = p.vy;
    p.state = 'super_taunt';
    p.tauntTimer = ENGINE_CONSTANTS.TAUNT_TICKS;
    p.parryTicks = ENGINE_CONSTANTS.PARRY_WINDOW_TICKS;
    p.vx = 0;
    p.vy = 0;
    triggerSuperTauntClear(state);
    return;
  }

  if (input.tauntPressed) {
    p.tauntStoredState = p.state;
    p.tauntStoredSpeed = p.movespeed;
    p.tauntStoredVy = p.vy;
    p.state = 'taunt';
    p.tauntTimer = ENGINE_CONSTANTS.TAUNT_TICKS;
    p.parryTicks = ENGINE_CONSTANTS.PARRY_WINDOW_TICKS;
    p.tauntPose = nextInt(state.rngState, 0, ENGINE_CONSTANTS.TAUNT_POSE_COUNT - 1);
    p.vx = 0;
    p.vy = 0;

    state.events.push(
      { type: 'sfx', sfx: 'taunt', pitchJitter: 0.08 },
      {
        type: 'particle',
        kind: 'starburst',
        x: p.x,
        y: p.y - 24,
        count: 8,
        color: '#ffee55',
      },
    );

    if (
      state.escape.active &&
      p.escapeTauntsUsed < ENGINE_CONSTANTS.TAUNT_ESCAPE_MAX
    ) {
      p.escapeTauntsUsed++;
      addScore(state, ENGINE_CONSTANTS.TAUNT_ESCAPE_PTS, p.x, p.y - 48);
    }
    return;
  }

  // Active Transformation Step
  if (p.transformation !== 'none') {
    const tookOver = stepTransformation(state, input);
    if (tookOver) {
      return;
    }
  } else if (p.hasShotgun || p.hasRevolver) {
    // Allow weapon firing even when not in a dedicated transformation state
    stepTransformation(state, input);
  }

  // Dispatch to active rider/character kinetic moveset
  if (p.rider === 'gusto_chonks') {
    stepGustoChonks(state, input);
  } else if (state.character === 'static') {
    stepStatic(state, input);
  } else {
    stepChefPeppo(state, input);
  }
}
