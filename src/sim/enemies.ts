// ============================================================================
// Krunked Tower — Deterministic Enemy Spawning & 9-Behavior AI Runtime
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// ============================================================================

import { ENGINE_CONSTANTS, TileType } from '../contracts/index';
import type { EnemyState, RoomDef, SimState } from '../contracts/index';
import { getEnemyDef } from '../data/index';
import { breakTileAt, getPlayerBox, moveAndCollideBox } from './collision';
import { damageEnemy, spawnProjectile } from './combat';
import { hurtPlayer, triggerParrySuccess } from './player';

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

  for (let i = 0; i < state.enemies.length; i++) {
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

    // 2. Thrown projectile-enemy physics
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
      for (let j = 0; j < state.enemies.length; j++) {
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

      if (res.hitX || res.hitY) {
        // Attempt to shatter marble wall at impact point
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

    // 5. Behavior-specific AI movement & attacks
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
      // Grounded behaviors
      if (e.scared) {
        e.vx *= 0.8;
      } else {
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
        e.facing = e.facing === 1 ? -1 : 1;
      } else if (e.grounded) {
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

    // Parry beats ANY enemy contact cleanly!
    if (player.state === 'taunt' && player.parryTicks > 0) {
      triggerParrySuccess(state, e.x);
      state.stageStats.parriesLanded += 1;
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

    // Aggressive enemies hurt an idle/walking non-offensive player
    const isAggressiveContact =
      def.behavior === 'shielded' ||
      def.behavior === 'charger' ||
      def.behavior === 'duelist' ||
      def.behavior === 'flier' ||
      def.behavior === 'patrol_alarm';

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
