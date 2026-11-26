// ============================================================================
// Krunked Tower — Combat, Projectiles, Enemy Hits & Super Taunt Clearing
// Pure 60 Hz simulation — ZERO DOM or non-deterministic RNG dependencies.
// ============================================================================

import {
  ENGINE_CONSTANTS,
  TileType,
  type EnemyState,
  type ProjectileState,
  type SimState,
} from '../contracts/index';
import { breakTileAt, getPlayerBox, getTileAt, isSolidTile } from './collision';
import { hurtPlayer, triggerParrySuccess } from './player';
import { registerKillCombo, refillCombo } from './scoring';
import { damageBoss } from './bosses';

const TS = ENGINE_CONSTANTS.TILE_SIZE;

function boxesOverlap(
  aL: number,
  aT: number,
  aR: number,
  aB: number,
  bL: number,
  bT: number,
  bR: number,
  bB: number,
): boolean {
  return aL < bR && aR > bL && aT < bB && aB > bT;
}

/**
 * Allocate and spawn a deterministic projectile into `state.projectiles`.
 */
export function spawnProjectile(
  state: SimState,
  partial: Omit<ProjectileState, 'id' | 'prevX' | 'prevY'>,
): ProjectileState {
  const proj: ProjectileState = {
    ...partial,
    id: state.nextEntityId++,
    prevX: partial.x,
    prevY: partial.y,
  };
  state.projectiles.push(proj);
  return proj;
}

/**
 * Apply kinetic damage, stun, or kill to an enemy with combo & supercharge tracking.
 */
export function damageEnemy(
  state: SimState,
  enemy: EnemyState,
  knockVx: number,
  knockVy: number,
  kill: boolean,
): void {
  if (!enemy.alive) return;

  const p = state.player;
  if (p.grabbedEnemyId === enemy.id) {
    p.grabbedEnemyId = null;
  }
  enemy.grabbed = false;
  enemy.thrown = false;

  const cx = enemy.x;
  const cy = enemy.y - enemy.height * 0.5;

  if (kill || enemy.hp <= 1) {
    enemy.alive = false;
    enemy.hp = 0;
    enemy.vx = knockVx;
    enemy.vy = knockVy;

    const wasReady = p.superTauntReady;
    registerKillCombo(state, 100, cx, cy);
    if (!wasReady && p.superTauntReady) {
      state.events.push({
        type: 'particle',
        kind: 'starburst',
        x: p.x,
        y: p.y - 24,
        count: 10,
        color: '#ffee55',
      });
    }
    state.hitstopTicks = Math.max(state.hitstopTicks, 2);
    state.shakeMag = Math.max(state.shakeMag, 3);
    state.shakeTimer = Math.max(state.shakeTimer, 5);

    state.events.push(
      { type: 'sfx', sfx: 'enemy_kill', pitchJitter: 0.1 },
      {
        type: 'particle',
        kind: 'starburst',
        x: cx,
        y: cy,
        count: 8,
        color: '#ffdd44',
      },
      { type: 'rumble', strong: 0.4, weak: 0.35, durationMs: 65 },
    );
  } else {
    enemy.hp -= 1;
    enemy.stunTicks = Math.max(enemy.stunTicks, 90);
    enemy.vx = knockVx;
    enemy.vy = knockVy;
    enemy.grounded = false;
    refillCombo(state, 15);
    state.events.push(
      { type: 'sfx', sfx: 'enemy_hit', pitchJitter: 0.08 },
      { type: 'particle', kind: 'spark', x: cx, y: cy, count: 5, color: '#ffffff' },
    );
  }
}

/**
 * Super Taunt screen-wipe: vaporizes every active enemy on screen and clears enemy projectiles.
 */
export function triggerSuperTauntClear(state: SimState): void {
  const p = state.player;
  const camL = state.camera.x - 96;
  const camR = state.camera.x + ENGINE_CONSTANTS.VIEWPORT_W + 96;
  const camT = state.camera.y - 96;
  const camB = state.camera.y + ENGINE_CONSTANTS.VIEWPORT_H + 96;

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e.alive) continue;
    if (e.x >= camL && e.x <= camR && e.y >= camT && e.y <= camB) {
      const dir = e.x >= p.x ? 1 : -1;
      damageEnemy(state, e, dir * 14, -10, true);
    }
  }

  // Clear hostile projectiles on screen
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    if (
      pr.owner !== 'player' &&
      pr.x >= camL &&
      pr.x <= camR &&
      pr.y >= camT &&
      pr.y <= camB
    ) {
      state.events.push({
        type: 'particle',
        kind: 'spark',
        x: pr.x,
        y: pr.y,
        count: 5,
        color: '#ffee55',
      });
      state.projectiles.splice(i, 1);
    }
  }

  // Consume supercharge AFTER clearing so the kills don't instantly re-arm it
  p.superchargeKills = 0;
  p.superTauntReady = false;
  state.stageStats.superTauntsUsed++;
  state.shakeMag = Math.max(state.shakeMag, 8);
  state.shakeTimer = Math.max(state.shakeTimer, 14);
  state.flashTicks = Math.max(state.flashTicks, 6);

  state.events.push(
    { type: 'sfx', sfx: 'super_taunt' },
    {
      type: 'particle',
      kind: 'parry_ring',
      x: p.x,
      y: p.y - 22,
      count: 1,
      color: '#ffef55',
    },
    {
      type: 'particle',
      kind: 'starburst',
      x: p.x,
      y: p.y - 22,
      count: 14,
      color: '#fff275',
    },
    { type: 'rumble', strong: 0.9, weak: 0.8, durationMs: 220 },
    { type: 'callout', text: 'SUPER TAUNT!', durationTicks: 75 },
  );
}

function triggerBombExplosion(state: SimState, pr: ProjectileState): void {
  const radius = 72;
  const minTx = Math.floor((pr.x - radius) / TS);
  const maxTx = Math.floor((pr.x + radius) / TS);
  const minTy = Math.floor((pr.y - radius) / TS);
  const maxTy = Math.floor((pr.y + radius) / TS);

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      breakTileAt(state, tx, ty, 'metal');
    }
  }

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e.alive) continue;
    const dx = e.x - pr.x;
    const dy = e.y - e.height * 0.5 - pr.y;
    if (dx * dx + dy * dy <= radius * radius) {
      damageEnemy(state, e, dx >= 0 ? 12 : -12, -9, true);
    }
  }

  if (
    state.boss &&
    state.boss.aiState !== 'defeated' &&
    state.boss.aiState !== 'intro' &&
    (pr.owner === 'player' || pr.reflected)
  ) {
    const b = state.boss;
    const dx = b.x - pr.x;
    const dy = b.y - b.height * 0.5 - pr.y;
    if (dx * dx + dy * dy <= (radius + b.width * 0.5) * (radius + b.width * 0.5)) {
      damageBoss(state, Math.max(1, pr.damage), pr.x);
    }
  }

  if (pr.owner !== 'player' && !pr.reflected) {
    const p = state.player;
    const dx = p.x - pr.x;
    const dy = p.y - 22 - pr.y;
    if (dx * dx + dy * dy <= radius * radius) {
      hurtPlayer(state, pr.x, pr.damage);
    }
  }

  state.shakeMag = Math.max(state.shakeMag, 6);
  state.shakeTimer = Math.max(state.shakeTimer, 10);
  state.events.push(
    { type: 'sfx', sfx: 'bodyslam_heavy' },
    { type: 'particle', kind: 'flame', x: pr.x, y: pr.y, count: 12, color: '#ff7b29' },
    { type: 'particle', kind: 'smoke', x: pr.x, y: pr.y, count: 8, color: '#444444' },
    { type: 'rumble', strong: 0.7, weak: 0.5, durationMs: 130 },
  );
}

/**
 * Step all projectiles, handling tile collisions, breaking blocks, parries, and damage.
 */
export function stepProjectiles(state: SimState): void {
  const room = state.room;
  const esc = state.escape.active;
  const p = state.player;
  const pBox = getPlayerBox(p);
  const maxW = room.widthTiles * TS + 128;
  const maxH = room.heightTiles * TS + 128;

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    pr.prevX = pr.x;
    pr.prevY = pr.y;

    if (pr.gravity) {
      pr.vy = Math.min(16, pr.vy + 0.35);
    }
    pr.x += pr.vx;
    pr.y += pr.vy;
    pr.ttlTicks--;

    if (pr.ttlTicks <= 0 || pr.x < -128 || pr.x > maxW || pr.y < -128 || pr.y > maxH) {
      if (pr.ttlTicks <= 0 && (pr.kind === 'bomb' || pr.kind === 'dynamite')) {
        triggerBombExplosion(state, pr);
      }
      state.projectiles.splice(i, 1);
      continue;
    }

    // Tile collision
    const tx = Math.floor(pr.x / TS);
    const ty = Math.floor(pr.y / TS);
    const tile = getTileAt(room, tx, ty, esc);

    if (pr.owner === 'player' || pr.reflected) {
      const breakPow: 'marble' | 'metal' | null =
        pr.kind === 'shotgun_pellet' ||
        pr.kind === 'charged_shot' ||
        pr.kind === 'bomb' ||
        pr.kind === 'chonks_kick' ||
        pr.kind === 'golf_shot'
          ? 'metal'
          : pr.kind === 'bullet' || pr.kind === 'flame'
            ? 'marble'
            : null;
      if (breakPow && (tile === TileType.BREAK_MARBLE || tile === TileType.BREAK_METAL)) {
        if (breakTileAt(state, tx, ty, breakPow)) {
          if (pr.kind === 'bomb') {
            triggerBombExplosion(state, pr);
            state.projectiles.splice(i, 1);
            continue;
          }
          if (pr.kind !== 'charged_shot' && pr.kind !== 'chonks_kick') {
            state.projectiles.splice(i, 1);
            continue;
          }
        }
      }
    }

    if (isSolidTile(getTileAt(room, tx, ty, esc))) {
      if (pr.kind === 'bowling_ball' || pr.kind === 'golf_shot') {
        // Bounce off floor or walls
        const prevTx = Math.floor(pr.prevX / TS);
        const prevTy = Math.floor(pr.prevY / TS);
        if (prevTx !== tx) {
          pr.vx = -pr.vx * 0.85;
          pr.x = pr.prevX;
        }
        if (prevTy !== ty) {
          pr.vy = -Math.abs(pr.vy) * 0.65;
          pr.y = pr.prevY;
        }
      } else if (pr.kind === 'bomb' || pr.kind === 'dynamite') {
        triggerBombExplosion(state, pr);
        state.projectiles.splice(i, 1);
        continue;
      } else {
        state.events.push({
          type: 'particle',
          kind: 'spark',
          x: pr.prevX,
          y: pr.prevY,
          count: 3,
          color: pr.color,
        });
        state.projectiles.splice(i, 1);
        continue;
      }
    }

    const r = pr.radius;
    const prL = pr.x - r;
    const prR = pr.x + r;
    const prT = pr.y - r;
    const prB = pr.y + r;

    // Player-owned or reflected projectile hits enemies & boss
    if (pr.owner === 'player' || pr.reflected) {
      let consumed = false;
      const piercing = pr.kind === 'charged_shot' || pr.kind === 'chonks_kick';

      for (let j = 0; j < state.enemies.length; j++) {
        const e = state.enemies[j];
        if (!e.alive || e.grabbed) continue;
        if (
          boxesOverlap(
            prL,
            prT,
            prR,
            prB,
            e.x - e.width * 0.5,
            e.y - e.height,
            e.x + e.width * 0.5,
            e.y,
          )
        ) {
          const dir = pr.vx >= 0 ? 1 : -1;
          damageEnemy(state, e, dir * 11, -7, true);
          if (pr.kind === 'bomb') {
            triggerBombExplosion(state, pr);
            consumed = true;
            break;
          }
          if (!piercing) {
            consumed = true;
            break;
          }
        }
      }

      if (!consumed && state.boss && state.boss.aiState !== 'defeated' && state.boss.aiState !== 'intro') {
        const b = state.boss;
        if (
          boxesOverlap(
            prL,
            prT,
            prR,
            prB,
            b.x - b.width * 0.5,
            b.y - b.height,
            b.x + b.width * 0.5,
            b.y,
          )
        ) {
          damageBoss(state, Math.max(1, pr.damage), pr.x);
          if (pr.kind === 'bomb') {
            triggerBombExplosion(state, pr);
          }
          consumed = true;
        }
      }

      if (consumed) {
        state.projectiles.splice(i, 1);
        continue;
      }
    } else {
      // Hostile projectile vs Player
      if (boxesOverlap(prL, prT, prR, prB, pBox.left, pBox.top, pBox.right, pBox.bottom)) {
        if (p.parryTicks > 0 && pr.parryable) {
          pr.owner = 'player';
          pr.reflected = true;
          pr.vx = p.facing * ENGINE_CONSTANTS.PARRY_REFLECT_HSP;
          pr.vy = -1;
          pr.ttlTicks = Math.max(pr.ttlTicks, 120);
          pr.damage = Math.max(pr.damage, 2);
          triggerParrySuccess(state, pr.x);
        } else {
          const immuneTransfo =
            p.transformation === 'knight' ||
            p.transformation === 'ghost' ||
            p.transformation === 'barrel' ||
            p.transformation === 'rocket' ||
            p.transformation === 'fire_butt';
          if (!immuneTransfo) {
            hurtPlayer(state, pr.x, pr.damage);
          }
          state.projectiles.splice(i, 1);
          continue;
        }
      }
    }
  }
}

/**
 * Evaluate player-vs-enemy, thrown-enemy-bowling, player-vs-boss, and Mega-Crust hits.
 */
export function stepPlayerCombatHits(state: SimState): void {
  const p = state.player;
  const pBox = getPlayerBox(p);
  const tr = p.transformation;

  const isLethalKinetic =
    p.state === 'mach3' ||
    p.state === 'mach4' ||
    p.state === 'sjump' ||
    p.state === 'sjump_cancel' ||
    p.state === 'freefall' ||
    p.state === 'piledriver' ||
    p.state === 'uppercut' ||
    p.state === 'wall_bounce' ||
    p.state === 'mach_roll' ||
    (p.rider === 'gusto_chonks' && (p.movespeed >= ENGINE_CONSTANTS.GUSTO_BASE_SPEED || !p.grounded)) ||
    tr === 'knight' ||
    tr === 'fire_butt' ||
    tr === 'firemouth' ||
    tr === 'barrel' ||
    tr === 'rocket' ||
    tr === 'ball' ||
    tr === 'weenie' ||
    tr === 'trash_roll' ||
    tr === 'inferno_pepper' ||
    tr === 'bomb';

  const isMach2Attack = p.state === 'mach2';
  const expandX = p.state === 'grab_dash' || isLethalKinetic || isMach2Attack ? 6 : 0;
  const atkL = pBox.left - expandX;
  const atkR = pBox.right + expandX;
  const atkT = pBox.top - (p.state === 'uppercut' || p.state === 'sjump' ? 8 : 0);
  const atkB = pBox.bottom + (p.state === 'freefall' || p.state === 'piledriver' ? 6 : 0);

  // 1. Thrown enemies bowl through other enemies!
  for (let i = 0; i < state.enemies.length; i++) {
    const t = state.enemies[i];
    if (!t.alive || !t.thrown) continue;
    for (let j = 0; j < state.enemies.length; j++) {
      if (i === j) continue;
      const other = state.enemies[j];
      if (!other.alive || other.grabbed || other.thrown) continue;
      if (
        boxesOverlap(
          t.x - t.width * 0.5,
          t.y - t.height,
          t.x + t.width * 0.5,
          t.y,
          other.x - other.width * 0.5,
          other.y - other.height,
          other.x + other.width * 0.5,
          other.y,
        )
      ) {
        damageEnemy(state, other, Math.sign(t.vx || 1) * 12, -8, true);
      }
    }
    // Thrown enemy hitting boss!
    if (state.boss && state.boss.aiState !== 'defeated' && state.boss.aiState !== 'intro') {
      const b = state.boss;
      if (
        boxesOverlap(
          t.x - t.width * 0.5,
          t.y - t.height,
          t.x + t.width * 0.5,
          t.y,
          b.x - b.width * 0.5,
          b.y - b.height,
          b.x + b.width * 0.5,
          b.y,
        )
      ) {
        damageBoss(state, 1, t.x);
        damageEnemy(state, t, -Math.sign(t.vx || 1) * 8, -8, true);
      }
    }
  }

  // 2. Player vs Enemies
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e.alive || e.grabbed || e.thrown) continue;

    // Mach 3/4 intimidation scare!
    if (
      (p.state === 'mach3' || p.state === 'mach4') &&
      Math.abs(e.x - p.x) < 170 &&
      Math.abs(e.y - p.y) < 72
    ) {
      e.scared = true;
    }

    // Cross transformation vaporizes ghosts on wide aura!
    if (tr === 'cross' && e.archetype === 'ghost_ghoul') {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy <= 96 * 96) {
        damageEnemy(state, e, dx >= 0 ? 10 : -10, -8, true);
        continue;
      }
    }

    const eL = e.x - e.width * 0.5;
    const eR = e.x + e.width * 0.5;
    const eT = e.y - e.height;
    const eB = e.y;

    if (!boxesOverlap(atkL, atkT, atkR, atkB, eL, eT, eR, eB)) {
      continue;
    }

    // Parry window wins against everything
    if (p.parryTicks > 0) {
      triggerParrySuccess(state, e.x);
      damageEnemy(state, e, p.facing * 16, -9, true);
      continue;
    }

    // Grab Dash scoops enemy into Grab Hold!
    if (p.state === 'grab_dash' && p.grabbedEnemyId === null) {
      p.grabbedEnemyId = e.id;
      e.grabbed = true;
      e.stunTicks = 0;
      p.state = 'grab_hold';
      p.grabDashTicks = 0;
      p.slapBufferTicks = 0;
      p.movespeed = Math.min(p.movespeed, ENGINE_CONSTANTS.WALK_MAX);
      refillCombo(state, 15);
      state.events.push(
        { type: 'sfx', sfx: 'enemy_hit' },
        { type: 'particle', kind: 'spark', x: e.x, y: e.y - e.height * 0.5, count: 5, color: '#ffffff' },
      );
      continue;
    }

    // Lethal kinetic collision
    if (isLethalKinetic) {
      const dir = p.vx !== 0 ? (p.vx > 0 ? 1 : -1) : p.facing;
      damageEnemy(state, e, dir * 13, -8, true);
      continue;
    }

    // Mach 2 collision
    if (isMach2Attack) {
      if (e.archetype === 'knight_squire' && e.stunTicks <= 0) {
        // Armored squire gets knocked & stunned by Mach 2 (killed by Mach 3+ / grab)
        damageEnemy(state, e, p.facing * 9, -6, false);
        p.vx = -p.facing * 4;
      } else {
        damageEnemy(state, e, p.facing * 11, -7, true);
      }
      continue;
    }

    // Kicking already-stunned enemy kills it cleanly
    if (e.stunTicks > 0) {
      damageEnemy(state, e, p.facing * 10, -7, true);
      continue;
    }

    // Stomp from above
    if (!p.grounded && p.vy > 0 && p.prevY <= eT + 14) {
      e.stunTicks = 120;
      e.vy = -4;
      p.vy = -9.5;
      p.jumpStop = false;
      refillCombo(state, 15);
      state.events.push(
        { type: 'sfx', sfx: 'enemy_hit' },
        { type: 'particle', kind: 'spark', x: e.x, y: eT, count: 5, color: '#ffee66' },
      );
      continue;
    }

    // Ghost / Cross immunity
    if (tr === 'ghost') {
      continue;
    }

    // Standard contact hurts player
    hurtPlayer(state, e.x, 1);
  }

  // 3. Player vs Boss
  if (state.boss && state.boss.aiState !== 'defeated' && state.boss.aiState !== 'intro') {
    const b = state.boss;
    const bL = b.x - b.width * 0.5;
    const bR = b.x + b.width * 0.5;
    const bT = b.y - b.height;
    const bB = b.y;

    if (boxesOverlap(atkL, atkT, atkR, atkB, bL, bT, bR, bB)) {
      if (p.parryTicks > 0 && b.parryable) {
        triggerParrySuccess(state, b.x);
        damageBoss(state, 1, p.x);
      } else if (
        b.aiState === 'vulnerable' ||
        (b.invulnTicks <= 0 &&
          b.aiState !== 'charge' &&
          b.aiState !== 'jump_slam' &&
          (p.state === 'grab_dash' ||
            p.state === 'uppercut' ||
            p.state === 'freefall' ||
            p.state === 'piledriver' ||
            p.state === 'mach3' ||
            p.state === 'mach4' ||
            p.state === 'sjump' ||
            p.state === 'sjump_cancel'))
      ) {
        damageBoss(state, 1, p.x);
        const bounceDir: 1 | -1 = p.x < b.x ? -1 : 1;
        p.vx = bounceDir * 7;
        p.vy = -7.5;
        p.movespeed = 5;
        p.grounded = false;
        p.state = 'normal';
        p.invulnTicks = Math.max(p.invulnTicks, 18);
      } else if (b.aiState === 'charge' || b.aiState === 'jump_slam') {
        if (p.parryTicks > 0) {
          triggerParrySuccess(state, b.x);
          damageBoss(state, 1, p.x);
        } else {
          hurtPlayer(state, b.x, 1);
        }
      } else if (b.invulnTicks <= 0 && p.invulnTicks <= 0 && p.state !== 'hurt') {
        hurtPlayer(state, b.x, 1);
      }
    }
  }

  // 4. Player vs Mega-Crust Escape Chaser
  if (state.escape.active && state.escape.megaCrustActive && !state.gameOver && !state.stageComplete) {
    const cx = state.escape.megaCrustX;
    const cy = state.escape.megaCrustY;
    const dx = p.x - cx;
    const dy = p.y - 22 - cy;
    if (dx * dx + dy * dy <= 42 * 42) {
      state.gameOver = true;
      state.gameOverReason = 'Caught by Mega-Crust!';
      state.shakeMag = 10;
      state.shakeTimer = 20;
      state.events.push(
        { type: 'sfx', sfx: 'hurt' },
        { type: 'callout', text: 'CAUGHT BY MEGA-CRUST!', durationTicks: 120 },
        { type: 'rumble', strong: 1, weak: 1, durationMs: 300 },
      );
    }
  }
}
