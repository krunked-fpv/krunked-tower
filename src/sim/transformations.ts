// ============================================================================
// Krunked Tower — Transformation Framework & All 18 Slapstick Transformations
// Pure 60 Hz simulation — ZERO DOM or non-deterministic RNG dependencies.
// ============================================================================

import {
  ENGINE_CONSTANTS,
  TileType,
  type InputFrame,
  type SimState,
  type TransformationId,
} from '../contracts/index';
import {
  breakTileAt,
  canPlayerUncrouch,
  getTileAt,
  isSolidTile,
  moveAndCollidePlayer,
} from './collision';
import {
  applyGravity,
  applyHeavySlamShockwave,
  applyVariableJumpCut,
  approach,
  emitAfterimage,
  emitDust,
} from './physics';
import { damageEnemy, spawnProjectile } from './combat';

const TRANSFO_LABELS: Record<TransformationId, string> = {
  none: '',
  knight: 'KNIGHT ARMOR!',
  ball: 'CHEESE BALL!',
  bomb: 'TICKING BOMB!',
  fire_butt: 'FIRE BUTT!',
  firemouth: 'FIREMOUTH!',
  ghost: 'PHANTOM MODE!',
  beak: 'BEAK BUDDY!',
  weenie: 'WEENIE MOUNT!',
  barrel: 'BARREL ROLL!',
  rocket: 'ROCKET BLAST!',
  golf_carry: 'GOLF SWING!',
  cheese_sticky: 'STICKY CHEESE!',
  trash_roll: 'TRASH SURF!',
  boxed_flat: 'BOXED FLAT!',
  inferno_pepper: 'INFERNO PEPPER!',
  cross: 'HOLY CROSS!',
  shotgun: 'SHOTGUN EQUIPPED!',
  revolver: 'REVOLVER EQUIPPED!',
};

/**
 * Apply a slapstick transformation to the player.
 */
export function applyTransformation(state: SimState, t: TransformationId): void {
  const p = state.player;
  if (t === 'none') {
    clearTransformation(state);
    return;
  }

  p.transformation = t;
  p.transformTimer = 0;

  if (t === 'fire_butt') {
    p.transformTimer = 55;
    p.vy = -14;
    p.grounded = false;
    p.crouch = false;
    p.state = 'normal';
  } else if (t === 'bomb') {
    p.transformTimer = 180;
    p.movespeed = 11;
    p.crouch = false;
  } else if (t === 'knight') {
    p.airJumpsLeft = 1;
    p.crouch = false;
  } else if (t === 'beak') {
    p.airJumpsLeft = 2;
  } else if (t === 'shotgun') {
    p.hasShotgun = true;
  } else if (t === 'revolver') {
    p.hasRevolver = true;
  } else if (t === 'barrel' || t === 'ball') {
    p.movespeed = Math.max(p.movespeed, 10);
    p.crouch = false;
  } else if (t === 'rocket') {
    p.movespeed = 16;
    p.vy = 0;
    p.crouch = false;
  } else if (t === 'weenie') {
    p.movespeed = 13;
    p.crouch = false;
  } else if (t === 'trash_roll' || t === 'boxed_flat') {
    p.crouch = true;
    if (t === 'trash_roll') {
      p.movespeed = 13;
    }
  } else if (t === 'ghost') {
    p.vy = 0;
    p.crouch = false;
  }

  state.events.push(
    { type: 'sfx', sfx: 'transform' },
    {
      type: 'particle',
      kind: 'starburst',
      x: p.x,
      y: p.y - 24,
      count: 10,
      color: '#ffea55',
    },
  );
  const label = TRANSFO_LABELS[t];
  if (label) {
    state.events.push({ type: 'callout', text: label, durationTicks: 70 });
  }
}

/**
 * Restore the player to their normal non-transformed state.
 */
export function clearTransformation(state: SimState): void {
  const p = state.player;
  const prev = p.transformation;
  if (prev === 'none') return;
  p.transformation = 'none';
  p.transformTimer = 0;
  p.shotChargeTicks = 0;
  if (p.crouch && canPlayerUncrouch(state)) {
    p.crouch = false;
  }
  if (p.state !== 'hurt') {
    p.state = 'normal';
  }
  state.events.push({
    type: 'particle',
    kind: 'smoke',
    x: p.x,
    y: p.y - 20,
    count: 6,
    color: '#e8e8e8',
  });
}

function handleWeaponOverlays(state: SimState, input: InputFrame): void {
  const p = state.player;
  const tr = p.transformation;

  // Shotgun blast (either via transformation or `hasShotgun`)
  if ((tr === 'shotgun' || p.hasShotgun) && (input.shootPressed || (tr === 'shotgun' && input.grabPressed))) {
    if (p.ammoCooldown <= 0) {
      p.ammoCooldown = 22;
      const spreads = [-2.4, -1.2, 0, 1.2, 2.4];
      for (let i = 0; i < spreads.length; i++) {
        spawnProjectile(state, {
          owner: 'player',
          kind: 'shotgun_pellet',
          x: p.x + p.facing * 18,
          y: p.y - 22,
          vx: p.facing * 17,
          vy: spreads[i],
          radius: 7,
          damage: 1,
          parryable: false,
          reflected: false,
          gravity: false,
          ttlTicks: 18,
          color: '#ffdd55',
        });
      }
      state.shakeMag = Math.max(state.shakeMag, 4);
      state.shakeTimer = Math.max(state.shakeTimer, 6);
      state.events.push(
        { type: 'sfx', sfx: 'shotgun_blast' },
        { type: 'particle', kind: 'flame', x: p.x + p.facing * 20, y: p.y - 22, count: 6, color: '#ffae33' },
        { type: 'rumble', strong: 0.6, weak: 0.4, durationMs: 85 },
      );
    }
    return;
  }

  // Revolver rapid shot + charged piercing shot
  if (tr === 'revolver' || p.hasRevolver) {
    if (input.shootPressed || (tr === 'revolver' && input.grabPressed)) {
      if (p.ammoCooldown <= 0) {
        p.ammoCooldown = 14;
        spawnProjectile(state, {
          owner: 'player',
          kind: 'bullet',
          x: p.x + p.facing * 16,
          y: p.y - 22,
          vx: p.facing * 18,
          vy: 0,
          radius: 6,
          damage: 1,
          parryable: false,
          reflected: false,
          gravity: false,
          ttlTicks: 48,
          color: '#ffe066',
        });
        state.events.push({ type: 'sfx', sfx: 'revolver_shot' });
      }
    }
    if (input.grabHeld && tr === 'revolver') {
      p.shotChargeTicks++;
    } else if (input.shootReleased || (p.shotChargeTicks >= 30 && !input.grabHeld)) {
      if (p.shotChargeTicks >= 30) {
        spawnProjectile(state, {
          owner: 'player',
          kind: 'charged_shot',
          x: p.x + p.facing * 18,
          y: p.y - 22,
          vx: p.facing * 20,
          vy: 0,
          radius: 12,
          damage: 2,
          parryable: false,
          reflected: false,
          gravity: false,
          ttlTicks: 60,
          color: '#38e8ff',
        });
        state.events.push({ type: 'sfx', sfx: 'shotgun_blast' });
      }
      p.shotChargeTicks = 0;
    }
  }
}

/**
 * Step active transformation logic.
 * Returns `true` if the transformation drove movement/collision directly this tick;
 * returns `false` for overlays/weapons that let normal `stepPlayer` movement run too.
 */
export function stepTransformation(state: SimState, input: InputFrame): boolean {
  const p = state.player;
  const tr = p.transformation;

  // Always allow shotgun/revolver weapon firing even if armed via boss/stage pickup
  handleWeaponOverlays(state, input);

  if (tr === 'none' || tr === 'shotgun' || tr === 'revolver' || tr === 'cross') {
    if (tr === 'cross' && state.tick % 10 === 0) {
      state.events.push({
        type: 'particle',
        kind: 'spark',
        x: p.x,
        y: p.y - 24,
        count: 2,
        color: '#fff4a3',
      });
    }
    return false;
  }

  // ---- Overlay transformations (keep full Peppo movement + extra powers) ----
  if (tr === 'beak') {
    if (p.grounded) {
      p.airJumpsLeft = 2;
    } else if (input.jumpPressed && p.airJumpsLeft > 0) {
      p.vy = -9.5;
      p.airJumpsLeft--;
      p.jumpStop = false;
      state.events.push(
        { type: 'sfx', sfx: 'jump', pitchJitter: 0.15 },
        { type: 'particle', kind: 'dust', x: p.x, y: p.y - 8, count: 4, color: '#ffffff' },
      );
    } else if (input.jumpHeld && p.vy > 4.5) {
      p.vy = 4.5;
    }
    return false;
  }

  if (tr === 'firemouth') {
    if (state.tick % 4 === 0) {
      state.events.push({
        type: 'particle',
        kind: 'flame',
        x: p.x + p.facing * 10,
        y: p.y - 26,
        count: 1,
        color: '#ff6b2b',
      });
    }
    if ((input.grabPressed || input.shootPressed) && p.ammoCooldown <= 0) {
      p.ammoCooldown = 18;
      p.movespeed = Math.max(p.movespeed, 13);
      spawnProjectile(state, {
        owner: 'player',
        kind: 'flame',
        x: p.x + p.facing * 18,
        y: p.y - 24,
        vx: p.facing * 14,
        vy: 0,
        radius: 12,
        damage: 1,
        parryable: false,
        reflected: false,
        gravity: false,
        ttlTicks: 24,
        color: '#ff5522',
      });
      state.events.push({ type: 'sfx', sfx: 'grab_dash' });
    }
    return false;
  }

  if (tr === 'golf_carry') {
    if (input.grabPressed || input.shootPressed) {
      spawnProjectile(state, {
        owner: 'player',
        kind: 'golf_shot',
        x: p.x + p.facing * 16,
        y: p.y - 22,
        vx: p.facing * 13,
        vy: -6.5,
        radius: 10,
        damage: 2,
        parryable: false,
        reflected: false,
        gravity: true,
        ttlTicks: 90,
        color: '#ffffff',
      });
      state.events.push({ type: 'sfx', sfx: 'throw' });
      clearTransformation(state);
    }
    return false;
  }

  if (tr === 'inferno_pepper') {
    if (input.jumpHeld) {
      p.vy = Math.max(-9, p.vy - 1.1);
      p.grounded = false;
      if (state.tick % 3 === 0) {
        state.events.push({
          type: 'particle',
          kind: 'flame',
          x: p.x,
          y: p.y - 4,
          count: 2,
          color: '#ff4d24',
        });
      }
    }
    return false;
  }

  // ---- Full-control transformations ----
  if (tr === 'fire_butt') {
    p.transformTimer--;
    if (input.moveX !== 0) {
      p.facing = input.moveX;
      p.vx = approach(p.vx, input.moveX * 7.5, 0.7);
    } else {
      p.vx = approach(p.vx, 0, 0.25);
    }
    applyGravity(p, 0.38, 12);
    if (state.tick % 2 === 0) {
      state.events.push({
        type: 'particle',
        kind: 'flame',
        x: p.x,
        y: p.y - 8,
        count: 2,
        color: '#ff5c1a',
      });
    }
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = res.hitY && res.hitDirY === 1;
    p.onSlope = res.onSlope;
    p.slopeDir = res.slopeDir;
    if (res.hitY && res.hitDirY === -1) p.vy = 1;
    if (p.transformTimer <= 0 || (p.grounded && p.vy >= 0 && p.transformTimer < 40)) {
      p.vy = 0;
      clearTransformation(state);
    }
    return true;
  }

  if (tr === 'ghost') {
    p.vx = approach(p.vx, input.moveX * 6.5, 0.65);
    p.vy = approach(p.vy, input.moveY * 6.5, 0.65);
    if (input.moveX !== 0) p.facing = input.moveX;
    if (input.grabPressed || input.machPressed) {
      p.vx = (input.moveX || p.facing) * 12;
      p.vy = input.moveY * 9;
      emitAfterimage(state, '#9be8ff', 0.65);
      state.events.push({ type: 'sfx', sfx: 'grab_dash' });
    }
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = false;
    p.onSlope = false;
    if (res.hitX) p.vx = 0;
    if (res.hitY) p.vy = 0;
    return true;
  }

  if (tr === 'knight') {
    if (p.state === 'freefall') {
      p.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, p.vy + 0.7);
      p.freefallSmash++;
      p.vx = input.moveX * 3.5;
    } else {
      if (input.moveX !== 0) {
        p.facing = input.moveX;
        const target = p.onSlope && p.facing === p.slopeDir ? 14 : 9.5;
        p.movespeed = approach(p.movespeed, target, 0.35);
      } else {
        p.movespeed = approach(p.movespeed, 0, 0.45);
      }
      p.vx = p.facing * p.movespeed;

      if (p.grounded) {
        p.airJumpsLeft = 1;
      }
      if (p.jumpBufferTicks > 0 && (p.grounded || p.coyoteTicks > 0)) {
        p.vy = -11;
        p.grounded = false;
        p.coyoteTicks = 0;
        p.jumpBufferTicks = 0;
        p.jumpStop = false;
        state.events.push({ type: 'sfx', sfx: 'jump' });
      } else if (!p.grounded && input.jumpPressed && p.airJumpsLeft > 0) {
        p.vy = -10.5;
        p.airJumpsLeft--;
        p.jumpStop = false;
        state.events.push({ type: 'sfx', sfx: 'jump' });
      }
      if (!p.grounded && input.moveY === 1) {
        p.state = 'freefall';
        p.vy = 10;
        p.freefallSmash = 10;
      }
      applyVariableJumpCut(p, input);
      applyGravity(p);
    }

    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = res.hitY && res.hitDirY === 1;
    p.onSlope = res.onSlope;
    p.slopeDir = res.slopeDir;
    if (res.hitX) {
      p.movespeed = 0;
      p.vx = 0;
    }
    if (res.hitY) {
      if (res.hitDirY === 1 && p.state === 'freefall') {
        applyHeavySlamShockwave(state);
        p.state = 'normal';
        p.freefallSmash = 0;
      }
      p.vy = 0;
    }
    if (p.movespeed >= 11 && state.tick % 3 === 0) {
      emitAfterimage(state, '#c8d6e5');
    }
    return true;
  }

  if (tr === 'barrel' || tr === 'ball') {
    if (input.moveX !== 0 && p.grounded && tr === 'barrel') {
      p.facing = input.moveX;
    }
    const maxSpd = tr === 'ball' ? 15 : 14;
    const accel = p.onSlope && p.facing === p.slopeDir ? 0.35 : 0.14;
    p.movespeed = approach(p.movespeed, maxSpd, accel);
    p.vx = p.facing * p.movespeed;

    if (p.jumpBufferTicks > 0 && (p.grounded || p.coyoteTicks > 0)) {
      p.vy = tr === 'ball' ? -11.5 : -10;
      p.grounded = false;
      p.coyoteTicks = 0;
      p.jumpBufferTicks = 0;
      state.events.push({ type: 'sfx', sfx: 'jump' });
    }
    applyGravity(p);
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = res.hitY && res.hitDirY === 1;
    p.onSlope = res.onSlope;
    p.slopeDir = res.slopeDir;
    if (res.hitX) {
      p.facing = (-p.facing) as 1 | -1;
      state.events.push({ type: 'sfx', sfx: 'wall_bounce' });
      emitDust(state, p.x, p.y - 16, 4);
    }
    if (res.hitY) {
      p.vy = 0;
    }
    if (state.tick % 3 === 0) {
      emitAfterimage(state, tr === 'ball' ? '#ffd43b' : '#b87333');
    }
    return true;
  }

  if (tr === 'rocket') {
    p.movespeed = 16;
    if (input.jumpPressed) {
      p.facing = (-p.facing) as 1 | -1;
      state.events.push({ type: 'sfx', sfx: 'mach_drift' });
    }
    p.vx = p.facing * p.movespeed;
    p.vy = approach(p.vy, input.moveY * 6.5, 0.7);
    if (state.tick % 2 === 0) {
      state.events.push({
        type: 'particle',
        kind: 'flame',
        x: p.x - p.facing * 16,
        y: p.y - 20,
        count: 2,
        color: '#ff6622',
      });
      emitAfterimage(state, '#ff5522');
    }
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = false;
    if (res.hitX) {
      // Rocket detonates cleanly on solid wall
      state.shakeMag = Math.max(state.shakeMag, 6);
      state.shakeTimer = Math.max(state.shakeTimer, 10);
      state.events.push(
        { type: 'sfx', sfx: 'bodyslam_heavy' },
        { type: 'particle', kind: 'flame', x: p.x, y: p.y - 20, count: 10, color: '#ff7722' },
      );
      p.vx = -p.facing * 5;
      p.vy = -6;
      clearTransformation(state);
    }
    return true;
  }

  if (tr === 'weenie') {
    p.movespeed = 13;
    p.vx = p.facing * p.movespeed;
    if (p.jumpBufferTicks > 0 && (p.grounded || p.coyoteTicks > 0)) {
      p.vy = -11.5;
      p.grounded = false;
      p.coyoteTicks = 0;
      p.jumpBufferTicks = 0;
      state.events.push({ type: 'sfx', sfx: 'jump' });
    }
    applyGravity(p);
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = res.hitY && res.hitDirY === 1;
    p.onSlope = res.onSlope;
    p.slopeDir = res.slopeDir;
    if (res.hitX) {
      p.facing = (-p.facing) as 1 | -1;
      state.events.push({ type: 'sfx', sfx: 'wall_bounce' });
    }
    if (res.hitY) p.vy = 0;
    return true;
  }

  if (tr === 'bomb') {
    p.transformTimer--;
    if (input.moveX !== 0) p.facing = input.moveX;
    p.movespeed = 11;
    p.vx = p.facing * p.movespeed;
    if (p.jumpBufferTicks > 0 && (p.grounded || p.coyoteTicks > 0)) {
      p.vy = -11;
      p.grounded = false;
      p.coyoteTicks = 0;
      p.jumpBufferTicks = 0;
      state.events.push({ type: 'sfx', sfx: 'jump' });
    }
    applyGravity(p);
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = res.hitY && res.hitDirY === 1;
    p.onSlope = res.onSlope;
    p.slopeDir = res.slopeDir;
    if (res.hitY) p.vy = 0;
    if (state.tick % 4 === 0) {
      state.events.push({ type: 'particle', kind: 'spark', x: p.x, y: p.y - 44, count: 2, color: '#ffbb33' });
    }
    if (p.transformTimer <= 0 || input.grabPressed || input.shootPressed) {
      // Explode breaking surrounding metal/marble + nearby enemies
      const ts = ENGINE_CONSTANTS.TILE_SIZE;
      const cx = Math.floor(p.x / ts);
      const cy = Math.floor((p.y - 20) / ts);
      for (let ty = cy - 2; ty <= cy + 2; ty++) {
        for (let tx = cx - 2; tx <= cx + 2; tx++) {
          breakTileAt(state, tx, ty, 'metal');
        }
      }
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (!e.alive) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy <= 96 * 96) {
          damageEnemy(state, e, dx >= 0 ? 12 : -12, -9, true);
        }
      }
      state.shakeMag = Math.max(state.shakeMag, 8);
      state.shakeTimer = Math.max(state.shakeTimer, 14);
      state.events.push(
        { type: 'sfx', sfx: 'bodyslam_heavy' },
        { type: 'particle', kind: 'flame', x: p.x, y: p.y - 20, count: 14, color: '#ff6622' },
      );
      clearTransformation(state);
    }
    return true;
  }

  if (tr === 'cheese_sticky') {
    const ts = ENGINE_CONSTANTS.TILE_SIZE;
    const leftWall = isSolidTile(getTileAt(state.room, Math.floor((p.x - 16) / ts), Math.floor((p.y - 20) / ts), state.escape.active));
    const rightWall = isSolidTile(getTileAt(state.room, Math.floor((p.x + 16) / ts), Math.floor((p.y - 20) / ts), state.escape.active));
    const sticking = leftWall || rightWall;
    p.onWall = sticking;
    p.wallDir = rightWall ? 1 : leftWall ? -1 : 0;

    if (sticking && !p.grounded) {
      p.vx = input.moveX * 4;
      p.vy = input.moveY * 4.5;
      if (input.jumpPressed) {
        p.vx = -p.wallDir * 9;
        p.vy = -10.5;
        p.facing = (-p.wallDir) as 1 | -1;
        state.events.push({ type: 'sfx', sfx: 'jump' });
      }
    } else {
      if (input.moveX !== 0) p.facing = input.moveX;
      p.vx = approach(p.vx, input.moveX * 6, 0.7);
      if (p.jumpBufferTicks > 0 && (p.grounded || p.coyoteTicks > 0)) {
        p.vy = -10.5;
        p.grounded = false;
        p.coyoteTicks = 0;
        p.jumpBufferTicks = 0;
        state.events.push({ type: 'sfx', sfx: 'jump' });
      }
      applyGravity(p, 0.42);
    }
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = res.hitY && res.hitDirY === 1;
    p.onSlope = res.onSlope;
    p.slopeDir = res.slopeDir;
    if (res.hitY) p.vy = 0;
    return true;
  }

  if (tr === 'trash_roll') {
    p.crouch = true;
    p.movespeed = 13;
    p.vx = p.facing * p.movespeed;
    if (p.jumpBufferTicks > 0 && (p.grounded || p.coyoteTicks > 0)) {
      p.vy = -9.5;
      p.grounded = false;
      p.coyoteTicks = 0;
      p.jumpBufferTicks = 0;
      state.events.push({ type: 'sfx', sfx: 'jump' });
    }
    applyGravity(p);
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = res.hitY && res.hitDirY === 1;
    p.onSlope = res.onSlope;
    p.slopeDir = res.slopeDir;
    if (res.hitY) p.vy = 0;
    if (res.hitX) {
      p.vx = -p.facing * 4;
      clearTransformation(state);
    }
    return true;
  }

  if (tr === 'boxed_flat') {
    p.crouch = true;
    if (input.moveX !== 0) p.facing = input.moveX;
    p.vx = approach(p.vx, input.moveX * 4.5, 0.6);
    if (p.jumpBufferTicks > 0 && (p.grounded || p.coyoteTicks > 0)) {
      p.vy = -8.5;
      p.grounded = false;
      p.coyoteTicks = 0;
      p.jumpBufferTicks = 0;
      state.events.push({ type: 'sfx', sfx: 'jump' });
    }
    if (!p.grounded && input.grabPressed) {
      p.vy = -7;
      state.events.push({ type: 'sfx', sfx: 'jump', pitchJitter: 0.15 });
    }
    applyGravity(p, input.jumpHeld && p.vy > 0 ? 0.12 : 0.4, input.jumpHeld ? 2.5 : 14);
    const res = moveAndCollidePlayer(state, p.vx, p.vy);
    p.grounded = res.hitY && res.hitDirY === 1;
    p.onSlope = res.onSlope;
    p.slopeDir = res.slopeDir;
    if (res.hitY) p.vy = 0;
    return true;
  }

  return false;
}
