// ============================================================================
// Krunked Tower — Deterministic Enemy Spawning & Tactical Archetype AI Runtime
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// ============================================================================

import { ENGINE_CONSTANTS, TileType } from '../contracts/index';
import type { EnemyArchetypeId, EnemyState, RoomDef, SimState } from '../contracts/index';
import { getEnemyDef } from '../data/index';
import { damageBoss } from './bosses';
import { breakTileAt, getPlayerBox, moveAndCollideBox } from './collision';
import { damageEnemy, spawnProjectile } from './combat';
import { hurtPlayer, triggerParrySuccess } from './player';
import { nextInt } from './prng';

const T = ENGINE_CONSTANTS.TILE_SIZE;

function isFloorSolidBelow(state: SimState, worldX: number, worldY: number): boolean {
  const tx = Math.floor(worldX / T);
  const ty = Math.floor((worldY + 4) / T);
  const r = state.room;
  if (tx < 0 || tx >= r.widthTiles || ty < 0 || ty >= r.heightTiles) return false;
  const idx = ty * r.widthTiles + tx;
  if (r.brokenMask[idx]) return false;
  const tile = r.tiles[idx];
  if (tile === TileType.EMPTY || tile === TileType.SECRET_WALL) return false;
  if (tile === TileType.PILLAR_BLOCK_CLOSED) return !state.escape.active;
  if (tile === TileType.PILLAR_BLOCK_OPEN) return state.escape.active;
  if (tile === TileType.BREAK_OUTLET_GATE) return r.outletGateTimer <= 0;
  if (tile === TileType.LAVA_HAZARD || tile === TileType.SPIKE_HAZARD) return false;
  return true;
}

function isPlayerOffensive(state: SimState): boolean {
  const p = state.player;
  if (
    p.state === 'mach2' ||
    p.state === 'mach3' ||
    p.state === 'mach4' ||
    p.state === 'mach_roll' ||
    p.state === 'grab_dash' ||
    p.state === 'piledriver' ||
    p.state === 'uppercut' ||
    p.state === 'sjump' ||
    p.state === 'sjump_cancel' ||
    p.state === 'freefall' ||
    p.state === 'wall_bounce' ||
    p.state === 'super_taunt' ||
    p.state === 'parry'
  ) {
    return true;
  }
  if (
    p.transformation === 'knight' ||
    p.transformation === 'ball' ||
    p.transformation === 'barrel' ||
    p.transformation === 'rocket' ||
    p.transformation === 'firemouth' ||
    p.transformation === 'inferno_pepper' ||
    p.transformation === 'cross' ||
    p.transformation === 'ghost'
  ) {
    return true;
  }
  if (p.rider === 'gusto_chonks' && p.movespeed >= ENGINE_CONSTANTS.GUSTO_BASE_SPEED) {
    return true;
  }
  return false;
}

/**
 * Dynamically spawn a deterministic enemy (used by boss minions, Mega-Crust drops,
 * and Frosty Impostor helper gifts).
 */
export function spawnDynamicEnemy(
  state: SimState,
  archetype: EnemyArchetypeId,
  x: number,
  y: number,
  options?: {
    facing?: 1 | -1;
    vx?: number;
    vy?: number;
    stunTicks?: number;
    attackCooldown?: number;
  },
): EnemyState {
  const def = getEnemyDef(archetype);
  const facing: 1 | -1 = options?.facing ?? (state.player.x >= x ? 1 : -1);
  const enemy: EnemyState = {
    id: state.nextEntityId++,
    archetype,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: options?.vx ?? facing * def.speed,
    vy: options?.vy ?? 0,
    width: def.width,
    height: def.height,
    facing,
    hp: def.hp,
    alive: true,
    stunTicks: options?.stunTicks ?? 0,
    scared: false,
    grabbed: false,
    thrown: false,
    attackCooldown: options?.attackCooldown ?? 36,
    aiTimer: 0,
    grounded: false,
    originX: x,
    originY: y,
  };
  state.enemies.push(enemy);
  return enemy;
}

export function spawnRoomEnemies(
  state: SimState,
  roomDef: RoomDef,
  includeEscapeOnly = false,
): void {
  for (let i = 0; i < roomDef.spawns.length; i++) {
    const sp = roomDef.spawns[i];
    if (sp.kind !== 'enemy' || !sp.archetype) continue;
    if (sp.escapeOnly && !includeEscapeOnly) continue;

    // Avoid respawning already-collected enemies on revisit during same lap
    const persistKey = `enemy:${roomDef.id}:${i}:${state.escape.lap}`;
    if (state.collectedIds.includes(persistKey)) continue;

    // Avoid duplicating an already-present escapeOnly enemy at same origin
    if (
      sp.escapeOnly &&
      state.enemies.some((e) => e.escapeOnly && e.originX === sp.x && e.originY === sp.y)
    ) {
      continue;
    }

    const def = getEnemyDef(sp.archetype);
    const enemy: EnemyState = {
      id: state.nextEntityId++,
      archetype: sp.archetype,
      x: sp.x,
      y: sp.y,
      prevX: sp.x,
      prevY: sp.y,
      vx: -def.speed,
      vy: 0,
      width: def.width,
      height: def.height,
      facing: -1,
      hp: def.hp,
      alive: true,
      stunTicks: 0,
      scared: false,
      grabbed: false,
      thrown: false,
      attackCooldown: 45 + (i % 4) * 15,
      aiTimer: (i * 19) % 60,
      grounded: false,
      originX: sp.x,
      originY: sp.y,
      escapeOnly: sp.escapeOnly,
    };
    state.enemies.push(enemy);
  }
}

export function stepEnemies(state: SimState): void {
  const player = state.player;
  const pBox = getPlayerBox(player);
  const playerOffense = isPlayerOffensive(state);
  const aliveCount = state.enemies.reduce((acc, item) => acc + (item.alive ? 1 : 0), 0);
  let spawnedThisTick = 0;

  // Iterate using snapshot length so freshly spawned helper minions step cleanly next tick
  const initialCount = state.enemies.length;
  for (let i = 0; i < initialCount; i++) {
    const e = state.enemies[i];
    if (!e.alive) continue;

    e.prevX = e.x;
    e.prevY = e.y;

    const def = getEnemyDef(e.archetype);

    // 1. Grabbed by player
    if (e.grabbed) {
      e.x = player.x + player.facing * 18;
      e.y = player.y - 22;
      e.vx = 0;
      e.vy = 0;
      e.scared = true;
      continue;
    }

    // 2. Thrown projectile-enemy physics (including upward Mega-Crust throws!)
    if (e.thrown) {
      e.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, e.vy + ENGINE_CONSTANTS.GRAV);
      const res = moveAndCollideBox(
        state.room,
        state.escape.active,
        e.x,
        e.y,
        e.width,
        e.height,
        e.vx,
        e.vy,
      );
      e.x = res.x;
      e.y = res.y;
      e.grounded = res.grounded;

      // Bowl over other alive enemies in flight!
      for (let j = 0; j < initialCount; j++) {
        if (j === i) continue;
        const other = state.enemies[j];
        if (!other.alive || other.grabbed || other.thrown) continue;
        if (
          Math.abs(e.x - other.x) < (e.width + other.width) * 0.5 &&
          Math.abs(e.y - e.height * 0.5 - (other.y - other.height * 0.5)) <
            (e.height + other.height) * 0.5
        ) {
          damageEnemy(state, other, Math.sign(e.vx || 1) * 10, -8, true);
        }
      }

      // Check thrown enemy smacking an active boss BEFORE wall/ceiling impact kills it
      if (
        state.boss &&
        state.boss.aiState !== 'defeated' &&
        state.boss.aiState !== 'intro' &&
        state.boss.aiState !== 'chase_escape'
      ) {
        const b = state.boss;
        const eL = e.x - e.width * 0.5;
        const eR = e.x + e.width * 0.5;
        const eT = e.y - e.height;
        const eB = e.y;
        const bL = b.x - b.width * 0.5;
        const bR = b.x + b.width * 0.5;
        const bT = b.y - b.height;
        const bB = b.y;
        if (eR > bL && eL < bR && eB > bT && eT < bB) {
          damageBoss(state, 1, e.x);
          damageEnemy(state, e, -Math.sign(e.vx || 1) * 8, -8, true);
          continue;
        }
      }

      if (res.hitX || res.hitY) {
        const impactTx = Math.floor((e.x + Math.sign(e.vx) * (e.width * 0.5 + 4)) / T);
        const impactTy = Math.floor((e.y - e.height * 0.5) / T);
        breakTileAt(state, impactTx, impactTy, 'marble');
        damageEnemy(state, e, -e.vx * 0.3, -6, true);
      }
      continue;
    }

    // 3. Stunned recovery physics
    if (e.stunTicks > 0) {
      e.stunTicks -= 1;
      e.vx *= 0.88;
      e.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, e.vy + ENGINE_CONSTANTS.GRAV);
      const res = moveAndCollideBox(
        state.room,
        state.escape.active,
        e.x,
        e.y,
        e.width,
        e.height,
        e.vx,
        e.vy,
      );
      e.x = res.x;
      e.y = res.y;
      e.grounded = res.grounded;
      if (res.hitY) e.vy = 0;
      continue;
    }

    // 4. Scared check when Chef Peppo / The Static screams by at Mach 3/4!
    const dxToPlayer = player.x - e.x;
    const dyToPlayer = player.y - e.y;
    const distX = Math.abs(dxToPlayer);
    const distY = Math.abs(dyToPlayer);

    const playerMachTerror =
      (player.state === 'mach3' || player.state === 'mach4') &&
      distX < 210 &&
      distY < 96 &&
      Math.sign(dxToPlayer) !== player.facing;
    e.scared = playerMachTerror;

    e.aiTimer += 1;
    if (e.attackCooldown > 0) e.attackCooldown -= 1;

    // 5. Archetype-specific tactical AI & base behavior movement
    let activeHazardBurst = false;
    let skipLedgeFlip = false;

    if (def.behavior === 'flier') {
      // Smooth sine-wave flight without gravity
      const hoverY = e.originY + Math.sin(e.aiTimer * 0.08) * 26;
      if (distX < 340 && distY < 200 && !e.scared) {
        e.facing = dxToPlayer >= 0 ? 1 : -1;
        e.vx = e.facing * def.speed;
      } else {
        if (Math.abs(e.x - e.originX) > 160) {
          e.facing = e.x > e.originX ? -1 : 1;
        }
        e.vx = e.facing * (def.speed * 0.65);
      }
      e.vy = (hoverY - e.y) * 0.14;
      const res = moveAndCollideBox(
        state.room,
        state.escape.active,
        e.x,
        e.y,
        e.width,
        e.height,
        e.vx,
        e.vy,
      );
      e.x = res.x;
      e.y = res.y;
      if (res.hitX) e.facing = e.facing === 1 ? -1 : 1;
    } else {
      if (e.scared) {
        e.vx *= 0.8;
      } else if (e.archetype === 'ninja_slice') {
        // ---- SHADOW SLICE: Telegraphed parryable dash slice! ----
        // Cooldown cycle 110 -> 0:
        //   110..86 = poised glint telegraph
        //    85..70 = blazing parryable dash slice across the lane
        //    69..0  = recovery patrol
        if (e.attackCooldown === 0 && distX < 300 && distY < 96 && e.grounded) {
          e.facing = dxToPlayer >= 0 ? 1 : -1;
          e.attackCooldown = 110;
          e.vx = 0;
          state.events.push({
            type: 'particle',
            kind: 'spark',
            x: e.x + e.facing * 12,
            y: e.y - e.height * 0.65,
            count: 5,
            color: '#ffee55',
          });
        } else if (e.attackCooldown > 85) {
          // Telegraph windup glint
          e.facing = dxToPlayer >= 0 ? 1 : -1;
          e.vx = 0;
          if (e.attackCooldown === 96 || e.attackCooldown === 88) {
            state.events.push({
              type: 'particle',
              kind: 'spark',
              x: e.x + e.facing * 14,
              y: e.y - e.height * 0.6,
              count: 4,
              color: '#a78bfa',
            });
          }
        } else if (e.attackCooldown > 69) {
          // Blazing parryable dash slice!
          activeHazardBurst = true;
          skipLedgeFlip = true;
          e.vx = e.facing * 10.6;
          if (e.attackCooldown === 85) {
            state.events.push({ type: 'sfx', sfx: 'grab_dash', pitchJitter: 0.12 });
          }
          if (e.attackCooldown % 3 === 0) {
            state.events.push({
              type: 'particle',
              kind: 'speed_line',
              x: e.x - e.facing * 10,
              y: e.y - e.height * 0.5,
              vx: -e.facing * 4,
              color: '#6c63ff',
              count: 2,
            });
          }
        } else {
          // Cautious ninja stalk between slashes
          e.vx = e.facing * (distX < 280 ? def.speed * 0.9 : def.speed * 0.65);
        }
      } else if (e.archetype === 'clone_bot') {
        // ---- FOUNDRY CLANKER: Charging laser/bullet burst! ----
        // Cooldown cycle 140 -> 0:
        //   140..116 = lock-on charge telegraph (cyan sparks)
        //   115, 108, 101 = rapid 3-round parryable laser burst
        //   100..0 = patrol reload
        if (e.attackCooldown === 0 && distX < 380 && distY < 115) {
          e.facing = dxToPlayer >= 0 ? 1 : -1;
          e.attackCooldown = 140;
          e.vx = 0;
        } else if (e.attackCooldown > 115) {
          e.facing = dxToPlayer >= 0 ? 1 : -1;
          e.vx = 0;
          if (e.attackCooldown % 6 === 0) {
            state.events.push({
              type: 'particle',
              kind: 'spark',
              x: e.x + e.facing * (e.width * 0.5 + 4),
              y: e.y - e.height * 0.6,
              count: 3,
              color: '#38bdf8',
            });
          }
        } else if (e.attackCooldown >= 101) {
          e.vx = 0;
          if (
            e.attackCooldown === 115 ||
            e.attackCooldown === 108 ||
            e.attackCooldown === 101
          ) {
            spawnProjectile(state, {
              owner: 'enemy',
              kind: 'bullet',
              x: e.x + e.facing * (e.width * 0.5 + 8),
              y: e.y - e.height * 0.58,
              vx: e.facing * 9.0,
              vy: 0,
              radius: 7,
              damage: 1,
              parryable: true,
              reflected: false,
              gravity: false,
              ttlTicks: 110,
              color: '#38bdf8',
            });
            state.events.push({ type: 'sfx', sfx: 'revolver_shot', pitchJitter: 0.14 });
          }
        } else {
          e.vx = e.facing * def.speed;
        }
      } else if (e.archetype === 'animatronic_bot') {
        // ---- ARCADE MASCOT: Calm patrol until alarmActiveTicks > 0, then aggressive charge! ----
        if (state.room.alarmActiveTicks > 0) {
          activeHazardBurst = true;
          skipLedgeFlip = true;
          if (distX < 480) {
            e.facing = dxToPlayer >= 0 ? 1 : -1;
          }
          e.vx = e.facing * def.speed * 2.25;
          // Aggressive hop when player is elevated or closing in
          if (e.grounded && e.attackCooldown <= 0 && (dyToPlayer < -32 || distX < 140)) {
            e.vy = -8.5;
            e.grounded = false;
            e.attackCooldown = 55;
            state.events.push({ type: 'sfx', sfx: 'jump', pitchJitter: -0.15 });
          }
          if (e.aiTimer % 8 === 0) {
            state.events.push({
              type: 'particle',
              kind: 'spark',
              x: e.x,
              y: e.y - e.height * 0.8,
              count: 2,
              color: '#ff006e',
            });
          }
        } else {
          // Calm, rhythmic patrol while alarm is quiet
          e.vx = e.facing * def.speed * 0.65;
        }
      } else if (e.archetype === 'blitz_trooper') {
        // ---- BLITZ TROOPER: Timed 3-round rifle volleys! ----
        if (e.attackCooldown === 0 && distX < 440 && distY < 130) {
          e.facing = dxToPlayer >= 0 ? 1 : -1;
          e.attackCooldown = 132;
          e.vx = 0;
        } else if (e.attackCooldown > 112) {
          // Aiming windup
          e.facing = dxToPlayer >= 0 ? 1 : -1;
          e.vx = 0;
          if (e.attackCooldown === 120) {
            state.events.push({
              type: 'particle',
              kind: 'spark',
              x: e.x + e.facing * 18,
              y: e.y - e.height * 0.56,
              count: 3,
              color: '#ffd166',
            });
          }
        } else if (e.attackCooldown >= 96) {
          // Timed 3-shot rifle burst (112, 104, 96)
          e.vx = 0;
          if (
            e.attackCooldown === 112 ||
            e.attackCooldown === 104 ||
            e.attackCooldown === 96
          ) {
            spawnProjectile(state, {
              owner: 'enemy',
              kind: 'bullet',
              x: e.x + e.facing * (e.width * 0.5 + 8),
              y: e.y - e.height * 0.56,
              vx: e.facing * 8.6,
              vy: 0,
              radius: 7,
              damage: 1,
              parryable: true,
              reflected: false,
              gravity: false,
              ttlTicks: 130,
              color: '#ffd166',
            });
            state.events.push({ type: 'sfx', sfx: 'revolver_shot', pitchJitter: 0.06 });
          }
        } else {
          e.vx = e.facing * def.speed * 0.75;
        }
      } else if (e.archetype === 'fake_santa') {
        // ---- FROSTY IMPOSTOR: Drops helper gifts/minions & festive bombs! ----
        if (distX < 380 && distY < 150) {
          e.facing = dxToPlayer >= 0 ? 1 : -1;
          e.vx = e.facing * def.speed * 0.5;
          if (e.attackCooldown <= 0) {
            e.attackCooldown = 145;
            const shouldDropHelper =
              aliveCount + spawnedThisTick < 12 && (Math.floor(e.aiTimer / 60) % 2 === 0);
            if (shouldDropHelper) {
              const helperType: EnemyArchetypeId =
                nextInt(state.rngState, 0, 1) === 0 ? 'slime_glob' : 'bomb_imp';
              spawnDynamicEnemy(
                state,
                helperType,
                e.x + e.facing * 18,
                e.y - 12,
                {
                  facing: e.facing,
                  vx: e.facing * 3.2,
                  vy: -6.8,
                  attackCooldown: 60,
                },
              );
              spawnedThisTick += 1;
              state.events.push(
                { type: 'sfx', sfx: 'throw' },
                {
                  type: 'particle',
                  kind: 'confetti',
                  x: e.x + e.facing * 16,
                  y: e.y - e.height * 0.6,
                  count: 8,
                  color: '#ef476f',
                },
              );
            } else {
              spawnProjectile(state, {
                owner: 'enemy',
                kind: 'bomb',
                x: e.x + e.facing * 14,
                y: e.y - e.height * 0.72,
                vx: e.facing * 5.6,
                vy: -7.8,
                radius: 10,
                damage: 1,
                parryable: true,
                reflected: false,
                gravity: true,
                ttlTicks: 120,
                color: '#ef476f',
              });
              state.events.push({ type: 'sfx', sfx: 'throw' });
            }
          }
        } else {
          e.vx = e.facing * def.speed;
        }
      } else if (e.archetype === 'cow_charger') {
        // ---- STAMPEDE BOVINE: High-speed stampede & bucking kick! ----
        const inBossArena = state.screen === 'boss';
        if (inBossArena || (distX < 340 && distY < 96)) {
          activeHazardBurst = true;
          skipLedgeFlip = inBossArena;
          if (!inBossArena && e.attackCooldown <= 0) {
            e.facing = dxToPlayer >= 0 ? 1 : -1;
          }
          // High-speed stampede rush
          e.vx = e.facing * 7.8;
          if (e.grounded && e.aiTimer % 5 === 0) {
            state.events.push({
              type: 'particle',
              kind: 'dust',
              x: e.x - e.facing * 18,
              y: e.y,
              count: 2,
              color: '#e8e4d8',
            });
          }
          // Close-range bucking stampede kick!
          if (e.grounded && distX < 96 && distY < 64 && e.attackCooldown <= 0) {
            e.vy = -6.2;
            e.vx = e.facing * 9.8;
            e.grounded = false;
            e.attackCooldown = 68;
            state.events.push(
              { type: 'sfx', sfx: 'bodyslam_heavy', pitchJitter: 0.15 },
              {
                type: 'particle',
                kind: 'slam_wave',
                x: e.x,
                y: e.y,
                count: 5,
                color: '#f4a261',
              },
            );
          }
        } else {
          e.vx = e.facing * def.speed * 0.7;
        }
      } else {
        // Standard 9-behavior fallback for remaining archetypes
        switch (def.behavior) {
          case 'patrol':
          case 'shielded': {
            e.vx = e.facing * def.speed;
            break;
          }
          case 'patrol_alarm': {
            const mult = state.room.alarmActiveTicks > 0 ? 1.85 : 1.0;
            if (state.room.alarmActiveTicks > 0 && distX < 400) {
              e.facing = dxToPlayer >= 0 ? 1 : -1;
            }
            e.vx = e.facing * def.speed * mult;
            break;
          }
          case 'charger': {
            if (distX < 280 && distY < 72) {
              e.facing = dxToPlayer >= 0 ? 1 : -1;
              e.vx = e.facing * def.speed * 1.85;
            } else {
              e.vx = e.facing * def.speed * 0.75;
            }
            break;
          }
          case 'jumper': {
            e.vx = e.facing * def.speed;
            if (e.grounded && e.aiTimer % 85 === 0) {
              e.vy = -9.5;
              e.grounded = false;
            }
            break;
          }
          case 'duelist': {
            if (distX < 240 && distY < 80) {
              e.facing = dxToPlayer >= 0 ? 1 : -1;
              if (e.attackCooldown <= 0 && e.grounded) {
                e.vx = e.facing * def.speed * 2.1;
                e.vy = -7.5;
                e.attackCooldown = 75;
              } else {
                e.vx = e.facing * def.speed;
              }
            } else {
              e.vx = e.facing * def.speed * 0.8;
            }
            break;
          }
          case 'shooter': {
            if (distX < 380 && distY < 110) {
              e.facing = dxToPlayer >= 0 ? 1 : -1;
              e.vx = 0;
              if (e.attackCooldown <= 0) {
                e.attackCooldown = 115;
                const projKind =
                  e.archetype === 'archer_goblin'
                    ? 'arrow'
                    : e.archetype === 'cannon_goblin'
                      ? 'bowling_ball'
                      : 'bullet';
                spawnProjectile(state, {
                  owner: 'enemy',
                  kind: projKind,
                  x: e.x + e.facing * (e.width * 0.5 + 8),
                  y: e.y - e.height * 0.55,
                  vx: e.facing * 6.5,
                  vy: 0,
                  radius: 8,
                  damage: 1,
                  parryable: true,
                  reflected: false,
                  gravity: false,
                  ttlTicks: 140,
                  color: def.accentColor,
                });
              }
            } else {
              e.vx = e.facing * def.speed * 0.7;
            }
            break;
          }
          case 'bomber': {
            if (distX < 340 && distY < 130) {
              e.facing = dxToPlayer >= 0 ? 1 : -1;
              e.vx = e.facing * def.speed * 0.4;
              if (e.attackCooldown <= 0) {
                e.attackCooldown = 135;
                spawnProjectile(state, {
                  owner: 'enemy',
                  kind: 'bomb',
                  x: e.x + e.facing * 12,
                  y: e.y - e.height * 0.7,
                  vx: e.facing * 5.2,
                  vy: -7.2,
                  radius: 9,
                  damage: 1,
                  parryable: true,
                  reflected: false,
                  gravity: true,
                  ttlTicks: 120,
                  color: '#ff6b35',
                });
              }
            } else {
              e.vx = e.facing * def.speed;
            }
            break;
          }
        }
      }

      e.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, e.vy + ENGINE_CONSTANTS.GRAV);
      const res = moveAndCollideBox(
        state.room,
        state.escape.active,
        e.x,
        e.y,
        e.width,
        e.height,
        e.vx,
        e.vy,
      );
      e.x = res.x;
      e.y = res.y;
      e.grounded = res.grounded;
      if (res.hitY) e.vy = 0;

      // Turn around at walls or ledges
      if (res.hitX) {
        if (e.archetype === 'cow_charger' && state.screen === 'boss' && e.aiTimer > 160) {
          // Stampede cow exits cleanly after crossing Sheriff Cheddar's canyon!
          e.alive = false;
          state.events.push({
            type: 'particle',
            kind: 'dust',
            x: e.x,
            y: e.y - 16,
            count: 6,
            color: '#e8e4d8',
          });
          continue;
        }
        e.facing = e.facing === 1 ? -1 : 1;
      } else if (e.grounded && !skipLedgeFlip) {
        const probeX = e.x + e.facing * (e.width * 0.5 + 8);
        if (!isFloorSolidBelow(state, probeX, e.y)) {
          e.facing = e.facing === 1 ? -1 : 1;
        }
      }
    }

    // 6. Enemy hazard contact against unprotected player (or active Parry frames!)
    if (e.scared) continue;
    const eLeft = e.x - e.width * 0.5;
    const eRight = e.x + e.width * 0.5;
    const eTop = e.y - e.height;
    const eBottom = e.y;

    const overlapsPlayer =
      pBox.right > eLeft &&
      pBox.left < eRight &&
      pBox.bottom > eTop &&
      pBox.top < eBottom;

    if (!overlapsPlayer) continue;

    // Parry beats ANY enemy contact cleanly! (triggerParrySuccess already counts parriesLanded)
    if (player.parryTicks > 0) {
      triggerParrySuccess(state, e.x);
      damageEnemy(state, e, -e.facing * 14, -9, true);
      continue;
    }

    // Shielded frontal poke stops Mach 2 unless Mach 3/4 or behind!
    const hitFromFront = Math.sign(player.x - e.x) === e.facing;
    if (
      def.immuneToMach2 &&
      hitFromFront &&
      player.state === 'mach2' &&
      player.invulnTicks <= 0
    ) {
      hurtPlayer(state, e.x, 1);
      continue;
    }

    // Ninja Slice active dash-slice cuts through non-parry / non-Mach3+ player!
    if (
      e.archetype === 'ninja_slice' &&
      activeHazardBurst &&
      player.state !== 'mach3' &&
      player.state !== 'mach4' &&
      player.invulnTicks <= 0 &&
      player.hurtTicks <= 0
    ) {
      hurtPlayer(state, e.x, 1);
      continue;
    }

    // Cow Charger stampede kick launches non-Mach3+ player with extra knockback!
    if (
      e.archetype === 'cow_charger' &&
      activeHazardBurst &&
      player.state !== 'mach3' &&
      player.state !== 'mach4' &&
      player.invulnTicks <= 0 &&
      player.hurtTicks <= 0
    ) {
      hurtPlayer(state, e.x, 1);
      player.vx = e.facing * 10.5;
      player.vy = -10.5;
      continue;
    }

    // Aggressive enemies hurt an idle/walking non-offensive player
    const isAggressiveContact =
      activeHazardBurst ||
      def.behavior === 'shielded' ||
      def.behavior === 'charger' ||
      def.behavior === 'duelist' ||
      def.behavior === 'flier' ||
      (def.behavior === 'patrol_alarm' && state.room.alarmActiveTicks > 0);

    if (
      isAggressiveContact &&
      !playerOffense &&
      player.invulnTicks <= 0 &&
      player.hurtTicks <= 0
    ) {
      hurtPlayer(state, e.x, 1);
    }
  }
}
