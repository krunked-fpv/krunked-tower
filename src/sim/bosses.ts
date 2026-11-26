// ============================================================================
// Krunked Tower — All 5 Signature Multi-Phase Boss Encounters
// 1. Artiste Bell (10 HP)
// 2. Sheriff Cheddar (9 HP + Revolver + 1 HP High-Noon Quickdraw)
// 3. The Static / The Glitch (8 HP + Jetpack / Balloon / Minions)
// 4. Doppel-Peppo (6 HP + Phase 2 Hallway Escape Chase)
// 5. Mega-Crust & Lord Dough (8 + 8 + 6 HP 3-Stage Grand Finale)
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// ============================================================================

import { ENGINE_CONSTANTS } from '../contracts/index';
import type {
  BossDef,
  BossState,
  EnemyArchetypeId,
  PlayableCharacter,
  SimState,
} from '../contracts/index';
import { getBossDef } from '../data/index';
import { getPlayerBox, moveAndCollideBox } from './collision';
import { spawnProjectile } from './combat';
import { spawnDynamicEnemy } from './enemies';
import { hurtPlayer, triggerParrySuccess } from './player';
import { nextInt } from './prng';
import { addScore, finalizeStageRank } from './scoring';

const T = ENGINE_CONSTANTS.TILE_SIZE;
const DOPPEL_PHASE1_GATE_TILE = 30;
const MEGA_CRUST_MOON_POOL: readonly EnemyArchetypeId[] = [
  'slime_glob',
  'fork_imp',
  'pepper_goblin',
];

function getBossDimensions(id: BossDef['id'], phase = 1): { w: number; h: number } {
  switch (id) {
    case 'b_artiste':
      return { w: 64, h: 72 };
    case 'b_cheddar':
      return { w: 42, h: 48 };
    case 'b_static':
      return { w: 38, h: 48 };
    case 'b_doppel':
      return { w: 40, h: 58 };
    case 'b_megacrust':
      return phase === 1 ? { w: 72, h: 72 } : { w: 50, h: 60 };
  }
}

function getFloorY(state: SimState): number {
  return (state.room.heightTiles - 3) * T;
}

function clampFinite(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function countAliveEnemies(state: SimState, archetype?: EnemyArchetypeId): number {
  let n = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e.alive) continue;
    if (archetype && e.archetype !== archetype) continue;
    n += 1;
  }
  return n;
}

function clearBossArenaClutter(state: SimState, clearEnemies: boolean): void {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    if (state.projectiles[i].owner !== 'player') {
      state.projectiles.splice(i, 1);
    }
  }
  if (clearEnemies) {
    for (let i = 0; i < state.enemies.length; i++) {
      state.enemies[i].alive = false;
      state.enemies[i].grabbed = false;
      state.enemies[i].thrown = false;
    }
    state.player.grabbedEnemyId = null;
  }
}

function getActiveAttackName(boss: BossState, bossDef: BossDef): string {
  if (boss.id === 'b_megacrust' && boss.phase === 3) {
    if (boss.hp >= 5) return 'cameo_artiste';
    if (boss.hp >= 3) return 'cameo_cheddar';
    return 'cameo_static';
  }
  const phaseDef = bossDef.phases[Math.min(boss.phase - 1, bossDef.phases.length - 1)];
  const list = phaseDef.attacks;
  if (list.length === 0) return 'shoulder_charge';
  const idx = boss.attackIndex > 0 ? (boss.attackIndex - 1) % list.length : 0;
  return list[idx];
}

export function createBossState(
  bossDef: BossDef,
  character: PlayableCharacter = 'peppo',
): BossState {
  const { w, h } = getBossDimensions(bossDef.id, 1);
  const floorRow = bossDef.room.heightTiles - 3;

  let spawnX = (bossDef.room.widthTiles - 6) * T;
  let spawnY = floorRow * T;
  let grounded = true;
  let displayName =
    character === 'static' && bossDef.staticName ? bossDef.staticName : bossDef.name;

  if (bossDef.id === 'b_doppel') {
    // Spawn strictly inside the Phase 1 battle chamber (left of the col 30 Pillar Gate!)
    spawnX = (DOPPEL_PHASE1_GATE_TILE - 6) * T;
  } else if (bossDef.id === 'b_megacrust') {
    // Phase 1 opens as floating giant pizza moon Mega-Crust overhead!
    displayName = 'Mega-Crust';
    spawnX = Math.floor(bossDef.room.widthTiles * 0.5) * T;
    spawnY = 220;
    grounded = false;
  }

  return {
    id: bossDef.id,
    name: displayName,
    x: spawnX,
    y: spawnY,
    prevX: spawnX,
    prevY: spawnY,
    vx: 0,
    vy: 0,
    width: w,
    height: h,
    facing: -1,
    hp: bossDef.maxHp,
    maxHp: bossDef.maxHp,
    phase: 1,
    maxPhases: bossDef.phases.length,
    aiState: 'intro',
    stateTimer: 75,
    attackIndex: 0,
    invulnTicks: 0,
    flashTicks: 0,
    grounded,
    parryable: false,
    chaseProgress: 0,
  };
}

function beginDoppelEscapeChase(state: SimState, boss: BossState): void {
  const floorY = getFloorY(state);
  const exitX = (state.room.widthTiles - 4) * T;

  boss.phase = 2;
  boss.hp = 0;
  boss.aiState = 'chase_escape';
  boss.stateTimer = 0;
  boss.chaseProgress = 0;
  boss.invulnTicks = 45;
  boss.parryable = true;
  boss.facing = 1;
  boss.vx = 0;
  boss.vy = 0;

  // Position Doppel-Peppo behind the player on the left so the corridor sprint is fair & thrilling
  const startChaseX = clampFinite(
    Math.min(boss.x, state.player.x - 190),
    2 * T,
    (DOPPEL_PHASE1_GATE_TILE - 2) * T,
  );
  boss.x = startChaseX;
  boss.y = floorY;
  boss.prevX = boss.x;
  boss.prevY = boss.y;

  // Shatter the col 30 Pillar Gate ('P') so the 54-tile Hallway Escape opens up!
  state.escape.active = true;
  clearBossArenaClutter(state, true);

  // Place a real Exit Door prop at the end of the escape hallway
  const hasExitProp = state.props.some((pr) => pr.kind === 'exit_door');
  if (!hasExitProp) {
    state.props.push({
      id: state.nextEntityId++,
      kind: 'exit_door',
      x: exitX,
      y: floorY,
      width: 54,
      height: 72,
      active: true,
      triggered: false,
      label: 'ESCAPE!',
    });
  }

  state.shakeMag = Math.max(state.shakeMag, 10);
  state.shakeTimer = Math.max(state.shakeTimer, 24);
  state.events.push(
    { type: 'boss_phase', bossId: boss.id, phase: 2 },
    { type: 'sfx', sfx: 'pillar_smash' },
    { type: 'music', track: 'escape_krunk_time', forceRestart: true },
    { type: 'rumble', strong: 0.9, weak: 0.65, durationMs: 280 },
    {
      type: 'particle',
      kind: 'marble_chunk',
      x: DOPPEL_PHASE1_GATE_TILE * T,
      y: floorY - 96,
      count: 18,
      color: '#cbd5e1',
    },
    {
      type: 'callout',
      text: 'RUN FOR IT!!',
      durationTicks: 140,
    },
  );
}

export function damageBoss(
  state: SimState,
  amount = 1,
  sourceX?: number,
): boolean {
  const boss = state.boss;
  if (!boss || boss.aiState === 'defeated') return false;
  if (boss.aiState === 'chase_escape') return false;
  if (boss.invulnTicks > 0 && amount < 4) return false;

  const bossDef = getBossDef(boss.id);
  const prevHp = boss.hp;
  const dmg = Math.max(1, Math.round(amount));
  boss.hp = Math.max(0, boss.hp - dmg);
  boss.invulnTicks = 26;
  boss.flashTicks = 18;
  boss.parryable = false;

  state.hitstopTicks = Math.max(state.hitstopTicks, 5);
  state.shakeMag = Math.max(state.shakeMag, 8);
  state.shakeTimer = Math.max(state.shakeTimer, 16);

  addScore(state, 500 * dmg, boss.x, boss.y - boss.height - 10);
  state.events.push(
    { type: 'sfx', sfx: 'boss_hit' },
    { type: 'rumble', strong: 0.7, weak: 0.4, durationMs: 140 },
    {
      type: 'particle',
      kind: 'starburst',
      x: boss.x,
      y: boss.y - boss.height * 0.5,
      count: 10,
      color: '#ffbe0b',
    },
  );

  const pushDir: 1 | -1 =
    sourceX !== undefined ? (boss.x >= sourceX ? 1 : -1) : boss.facing === 1 ? -1 : 1;
  const isFloatingMoon = boss.id === 'b_megacrust' && boss.phase === 1;
  boss.vx = pushDir * (isFloatingMoon ? 4.5 : 6.0);
  boss.vy = isFloatingMoon ? -2.2 : -6.5;

  // ---- BOSS 5: 3-STAGE GRAND FINALE (Mega-Crust 8 -> Lord Dough 8 -> Boss Rush Finale 6) ----
  if (boss.id === 'b_megacrust' && boss.hp <= 0) {
    if (boss.phase === 1) {
      boss.phase = 2;
      boss.hp = bossDef.phase2Hp ?? 8;
      boss.maxHp = boss.hp;
      boss.name = 'Lord Dough';
      const dims = getBossDimensions('b_megacrust', 2);
      boss.width = dims.w;
      boss.height = dims.h;
      boss.aiState = 'phase_shift';
      boss.stateTimer = 50;
      boss.attackIndex = 0;
      clearBossArenaClutter(state, true);
      state.events.push(
        { type: 'boss_phase', bossId: boss.id, phase: 2 },
        { type: 'sfx', sfx: 'pillar_smash' },
        {
          type: 'particle',
          kind: 'confetti',
          x: boss.x,
          y: boss.y - 32,
          count: 18,
          color: '#ffbe0b',
        },
        {
          type: 'callout',
          text: 'LORD DOUGH ENTERS!',
          durationTicks: 120,
        },
      );
      return true;
    }
    if (boss.phase === 2) {
      boss.phase = 3;
      boss.hp = bossDef.phase3Hp ?? 6;
      boss.maxHp = boss.hp;
      boss.name = 'Lord Dough (Finale)';
      boss.aiState = 'phase_shift';
      boss.stateTimer = 50;
      boss.attackIndex = 0;
      clearBossArenaClutter(state, true);
      state.events.push(
        { type: 'boss_phase', bossId: boss.id, phase: 3 },
        { type: 'sfx', sfx: 'super_taunt' },
        {
          type: 'particle',
          kind: 'starburst',
          x: boss.x,
          y: boss.y - 32,
          count: 20,
          color: '#ff006e',
        },
        {
          type: 'callout',
          text: 'BOSS RUSH FINALE!',
          durationTicks: 120,
        },
      );
      return true;
    }
  }

  // ---- BOSS 4: DOPPEL-PEPPO PHASE 2 HALLWAY ESCAPE CHASE AT 0 HP ----
  if (boss.id === 'b_doppel' && boss.phase === 1 && boss.hp <= 0) {
    beginDoppelEscapeChase(state, boss);
    return true;
  }

  // ---- BOSS 2: SHERIFF CHEDDAR HIGH-NOON QUICKDRAW AT 1 HP ----
  if (boss.id === 'b_cheddar' && boss.hp === 1 && prevHp > 1) {
    if (boss.phase === 1) {
      boss.phase = 2;
      state.events.push({ type: 'boss_phase', bossId: boss.id, phase: 2 });
    }
    const roomW = state.room.widthTiles * T;
    const duelX = state.player.x < roomW * 0.5 ? roomW - 180 : 180;
    boss.aiState = 'telegraph';
    boss.stateTimer = 46;
    boss.invulnTicks = 14;
    boss.x = duelX;
    boss.y = getFloorY(state);
    boss.vx = 0;
    boss.vy = 0;
    boss.grounded = true;
    boss.facing = state.player.x >= boss.x ? 1 : -1;
    clearBossArenaClutter(state, true);
    state.events.push({
      type: 'callout',
      text: 'HIGH NOON STANDOFF...',
      durationTicks: 34,
    });
    return true;
  }

  // ---- STANDARD PHASE 2 TRANSITION AT ORACLE THRESHOLD (Artiste 5, Cheddar 4, Static 4) ----
  const phase2Threshold = bossDef.phases[1]?.hpThreshold ?? Math.ceil(boss.maxHp / 2);
  if (
    boss.id !== 'b_megacrust' &&
    boss.id !== 'b_doppel' &&
    boss.phase === 1 &&
    boss.hp > 0 &&
    boss.hp <= phase2Threshold
  ) {
    boss.phase = 2;
    boss.aiState = 'phase_shift';
    boss.stateTimer = 42;
    boss.attackIndex = 0;
    const p2Name = bossDef.phases[1]?.name ?? 'PHASE 2';
    state.events.push(
      { type: 'boss_phase', bossId: boss.id, phase: 2 },
      { type: 'sfx', sfx: 'super_taunt' },
      {
        type: 'callout',
        text: `${boss.name.toUpperCase()}: ${p2Name.toUpperCase()}!`,
        durationTicks: 105,
      },
    );
    return true;
  }

  // ---- BOSS 5 PHASE 3 CAMEO CALLOUTS EVERY 2 HP ----
  if (boss.id === 'b_megacrust' && boss.phase === 3 && boss.hp > 0) {
    if (prevHp > 4 && boss.hp <= 4 && boss.hp > 2) {
      state.events.push({
        type: 'callout',
        text: 'FINALE CAMEO: SHERIFF CHEDDAR!',
        durationTicks: 85,
      });
    } else if (prevHp > 2 && boss.hp <= 2) {
      state.events.push({
        type: 'callout',
        text: 'FINALE CAMEO: THE STATIC!',
        durationTicks: 85,
      });
    }
  }

  // ---- BOSS DEFEATED! ----
  if (boss.hp <= 0) {
    boss.aiState = 'defeated';
    boss.stateTimer = 36;
    boss.vx = pushDir * 8;
    boss.vy = -10;
    clearBossArenaClutter(state, true);

    const knockoutText =
      boss.id === 'b_cheddar'
        ? 'BULLSEYE! SHERIFF CHEDDAR OUTDRAWN!'
        : boss.id === 'b_megacrust'
          ? 'LORD DOUGH TOPPLED! KRUNKED TOWER CONQUERED!'
          : `KNOCKOUT! ${boss.name.toUpperCase()} TOPPLED!`;

    state.events.push(
      { type: 'sfx', sfx: 'boss_defeat' },
      { type: 'rumble', strong: 1.0, weak: 0.7, durationMs: 320 },
      {
        type: 'particle',
        kind: 'confetti',
        x: boss.x,
        y: boss.y - boss.height * 0.5,
        count: 28,
        color: '#ffd166',
      },
      {
        type: 'callout',
        text: knockoutText,
        durationTicks: 120,
      },
    );
    return true;
  }

  boss.aiState = 'hurt';
  boss.stateTimer = isFloatingMoon ? 18 : 22;
  return true;
}

function isPlayerAttackingBoss(state: SimState): boolean {
  const p = state.player;
  return (
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
    p.state === 'parry' ||
    p.rider === 'gusto_chonks'
  );
}

function pickNextAttack(boss: BossState, bossDef: BossDef): string {
  if (boss.id === 'b_megacrust' && boss.phase === 3) {
    boss.attackIndex += 1;
    if (boss.hp >= 5) return 'cameo_artiste';
    if (boss.hp >= 3) return 'cameo_cheddar';
    return 'cameo_static';
  }
  const phaseDef = bossDef.phases[Math.min(boss.phase - 1, bossDef.phases.length - 1)];
  const list = phaseDef.attacks;
  const attack = list[boss.attackIndex % list.length];
  boss.attackIndex += 1;
  return attack;
}

function clampBossToRoom(state: SimState, boss: BossState): void {
  const minX = T + boss.width * 0.5;
  const maxX =
    boss.id === 'b_doppel' && boss.phase === 1
      ? DOPPEL_PHASE1_GATE_TILE * T - boss.width * 0.5 - 2
      : (state.room.widthTiles - 1) * T - boss.width * 0.5;
  const minY = T + boss.height;
  const maxY = getFloorY(state);
  boss.x = clampFinite(boss.x, minX, Math.max(minX, maxX));
  boss.y = clampFinite(boss.y, minY, Math.max(minY, maxY));
  if (!Number.isFinite(boss.vx)) boss.vx = 0;
  if (!Number.isFinite(boss.vy)) boss.vy = 0;
}

export function stepBoss(state: SimState): void {
  const boss = state.boss;
  if (!boss || state.screen !== 'boss') return;

  boss.prevX = boss.x;
  boss.prevY = boss.y;

  if (boss.invulnTicks > 0) boss.invulnTicks -= 1;
  if (boss.flashTicks > 0) boss.flashTicks -= 1;

  const bossDef = getBossDef(boss.id);
  const phaseDef = bossDef.phases[Math.min(boss.phase - 1, bossDef.phases.length - 1)];
  const lowHpBoost = boss.id === 'b_doppel' && boss.phase === 1 && boss.hp <= 3 ? 1.2 : 1.0;
  const spd = phaseDef.speedMult * lowHpBoost;
  const player = state.player;
  const isFloatingMoon = boss.id === 'b_megacrust' && boss.phase === 1;

  // 1. Defeated celebration countdown -> Rank / Grand Finale Victory!
  if (boss.aiState === 'defeated') {
    boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
    boss.vx *= 0.94;
    const res = moveAndCollideBox(
      state.room,
      state.escape.active,
      boss.x,
      boss.y,
      boss.width,
      boss.height,
      boss.vx,
      boss.vy,
    );
    boss.x = res.x;
    boss.y = res.y;
    boss.grounded = res.grounded;
    if (res.hitY) boss.vy = -boss.vy * 0.35;
    clampBossToRoom(state, boss);

    boss.stateTimer -= 1;
    if (boss.stateTimer <= 0 && !state.stageComplete) {
      finalizeStageRank(state);
      if (boss.id === 'b_megacrust') {
        state.screen = 'victory';
      }
    }
    return;
  }

  // 2. Boss 4 Phase 2 — Hallway Escape Chase!
  if (boss.aiState === 'chase_escape') {
    stepDoppelChaseEscape(state, boss, spd);
    return;
  }

  // 3. Intro & Phase Shift sequences
  if (boss.aiState === 'intro' || boss.aiState === 'phase_shift') {
    if (isFloatingMoon) {
      const targetY = 215 + Math.sin(state.tick * 0.08) * 14;
      boss.vx *= 0.85;
      boss.vy = (targetY - boss.y) * 0.14;
      boss.x += boss.vx;
      boss.y += boss.vy;
      boss.grounded = false;
    } else {
      boss.vx *= 0.85;
      boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
      const res = moveAndCollideBox(
        state.room,
        false,
        boss.x,
        boss.y,
        boss.width,
        boss.height,
        boss.vx,
        boss.vy,
      );
      boss.x = res.x;
      boss.y = res.y;
      boss.grounded = res.grounded;
      if (res.hitY) boss.vy = 0;
    }
    clampBossToRoom(state, boss);

    boss.stateTimer -= 1;
    if (boss.stateTimer <= 0) {
      boss.aiState = 'idle';
      boss.stateTimer = boss.phase >= 2 ? 18 : 26;
    }
    return;
  }

  // 4. Hurt recoil
  if (boss.aiState === 'hurt') {
    if (isFloatingMoon) {
      boss.vx *= 0.88;
      boss.vy = (212 - boss.y) * 0.09;
      boss.x += boss.vx;
      boss.y += boss.vy;
      boss.grounded = false;
    } else {
      boss.vx *= 0.9;
      boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
      const res = moveAndCollideBox(
        state.room,
        false,
        boss.x,
        boss.y,
        boss.width,
        boss.height,
        boss.vx,
        boss.vy,
      );
      boss.x = res.x;
      boss.y = res.y;
      boss.grounded = res.grounded;
      if (res.hitY) boss.vy = 0;
    }
    clampBossToRoom(state, boss);

    boss.stateTimer -= 1;
    if (boss.stateTimer <= 0) {
      boss.aiState = 'idle';
      boss.stateTimer = boss.phase >= 2 ? 18 : 28;
    }
    return;
  }

  // 5. Active AI state machine
  const activeAtk = getActiveAttackName(boss, bossDef);

  if (boss.aiState === 'vulnerable') {
    stepBossVulnerable(state, boss, isFloatingMoon);
  } else if (boss.aiState === 'idle') {
    stepBossIdle(state, boss, spd, isFloatingMoon);
  } else if (boss.aiState === 'telegraph') {
    stepBossTelegraph(state, boss, bossDef, spd, isFloatingMoon);
  } else if (boss.aiState === 'charge') {
    stepBossCharge(state, boss, activeAtk, spd, isFloatingMoon);
  } else if (boss.aiState === 'jump_slam') {
    stepBossJumpSlam(state, boss, activeAtk, spd);
  } else if (boss.aiState === 'projectile') {
    stepBossProjectilePhase(state, boss, activeAtk, spd, isFloatingMoon);
  }

  clampBossToRoom(state, boss);

  // 6. Boss <-> Player direct collision check
  const pBox = getPlayerBox(player);
  const bLeft = boss.x - boss.width * 0.5;
  const bRight = boss.x + boss.width * 0.5;
  const bTop = boss.y - boss.height;
  const bBottom = boss.y;

  const overlaps =
    pBox.right > bLeft && pBox.left < bRight && pBox.bottom > bTop && pBox.top < bBottom;

  if (!overlaps) return;

  // 6a. Player strikes a vulnerable boss!
  if (boss.aiState === 'vulnerable' && player.state !== 'hurt') {
    const canStrike = isPlayerAttackingBoss(state) || player.vy > 1 || Math.abs(player.vx) >= 4;
    if (canStrike) {
      const hit = damageBoss(state, 1, player.x);
      if (hit) {
        player.vx = (player.x < boss.x ? -1 : 1) * 7.5;
        player.vy = -8.5;
        player.invulnTicks = Math.max(player.invulnTicks, 20);
      }
    }
    return;
  }

  // 6b. Player Parries an incoming parryable boss attack!
  if (player.parryTicks > 0 && boss.parryable) {
    triggerParrySuccess(state, boss.x);
    boss.parryable = false;
    boss.vx = -boss.facing * 5.5;
    boss.vy = isFloatingMoon ? -2 : -6;
    damageBoss(state, 1, player.x);
    return;
  }

  // 6c. Player smacks floating Mega-Crust directly with Uppercut / Superjump!
  if (
    isFloatingMoon &&
    (player.state === 'uppercut' || player.state === 'sjump' || player.state === 'sjump_cancel')
  ) {
    const hit = damageBoss(state, 1, player.x);
    if (hit) {
      player.vy = -5;
      player.invulnTicks = Math.max(player.invulnTicks, 20);
    }
    return;
  }

  // 6d. Boss active attack hurts player!
  const bossHazardous =
    boss.aiState === 'charge' ||
    boss.aiState === 'jump_slam' ||
    (boss.aiState === 'projectile' && boss.parryable);
  if (bossHazardous && player.invulnTicks <= 0 && player.hurtTicks <= 0) {
    hurtPlayer(state, boss.x, 1);
  }
}

function stepBossVulnerable(
  state: SimState,
  boss: BossState,
  isFloatingMoon: boolean,
): void {
  if (isFloatingMoon) {
    const hoverY = 235 + Math.sin(state.tick * 0.14) * 10;
    boss.vx *= 0.86;
    boss.vy = (hoverY - boss.y) * 0.12;
    boss.x += boss.vx;
    boss.y += boss.vy;
    boss.grounded = false;
  } else {
    boss.vx *= 0.86;
    boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
    const res = moveAndCollideBox(
      state.room,
      false,
      boss.x,
      boss.y,
      boss.width,
      boss.height,
      boss.vx,
      boss.vy,
    );
    boss.x = res.x;
    boss.y = res.y;
    boss.grounded = res.grounded;
    if (res.hitY) boss.vy = 0;
  }

  // Dizzy spin flourish for The Static & Lord Dough dizzy laugh recovery!
  if (boss.id === 'b_static' && boss.stateTimer % 8 === 0) {
    boss.facing = boss.facing === 1 ? -1 : 1;
    state.events.push({
      type: 'particle',
      kind: 'spark',
      x: boss.x,
      y: boss.y - boss.height - 6,
      count: 2,
      color: '#ffbe0b',
    });
  } else if (boss.id === 'b_megacrust' && boss.phase >= 2 && boss.stateTimer % 12 === 0) {
    state.events.push({
      type: 'particle',
      kind: 'confetti',
      x: boss.x,
      y: boss.y - boss.height - 4,
      count: 2,
      color: '#ff006e',
    });
  }

  boss.stateTimer -= 1;
  if (boss.stateTimer <= 0) {
    boss.aiState = 'idle';
    boss.stateTimer = boss.phase >= 2 ? 15 : 24;
  }
}

function stepBossIdle(
  state: SimState,
  boss: BossState,
  spd: number,
  isFloatingMoon: boolean,
): void {
  const player = state.player;
  boss.facing = player.x >= boss.x ? 1 : -1;

  if (isFloatingMoon) {
    // Floating Mega-Crust moon patrols smoothly overhead across the summit
    const roomW = state.room.widthTiles * T;
    const desiredX = clampFinite(
      player.x + Math.sin(state.tick * 0.04) * 180,
      128,
      roomW - 128,
    );
    const desiredY = 205 + Math.sin(state.tick * 0.065) * 24;
    boss.vx = clampFinite((desiredX - boss.x) * 0.06, -5.2, 5.2);
    boss.vy = (desiredY - boss.y) * 0.1;
    boss.x += boss.vx;
    boss.y += boss.vy;
    boss.grounded = false;
  } else {
    boss.vx = boss.facing * 1.45 * spd;
    boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
    const res = moveAndCollideBox(
      state.room,
      false,
      boss.x,
      boss.y,
      boss.width,
      boss.height,
      boss.vx,
      boss.vy,
    );
    boss.x = res.x;
    boss.y = res.y;
    boss.grounded = res.grounded;
    if (res.hitY) boss.vy = 0;
  }

  boss.stateTimer -= 1;
  if (boss.stateTimer <= 0) {
    // Sheriff Cheddar at 1 HP always cycles straight into High-Noon Quickdraw!
    if (boss.id === 'b_cheddar' && boss.hp === 1) {
      boss.aiState = 'telegraph';
      boss.stateTimer = 46;
      boss.vx = 0;
      boss.parryable = false;
      state.events.push({
        type: 'callout',
        text: 'HIGH NOON STANDOFF...',
        durationTicks: 30,
      });
      return;
    }

    boss.aiState = 'telegraph';
    boss.stateTimer = boss.phase >= 2 ? 16 : 22;
    boss.vx = 0;
    boss.parryable = false;
    state.events.push({
      type: 'particle',
      kind: 'dust',
      x: boss.x,
      y: boss.y,
      count: 5,
      color: '#ffffff',
    });
  }
}

function stepBossTelegraph(
  state: SimState,
  boss: BossState,
  bossDef: BossDef,
  spd: number,
  isFloatingMoon: boolean,
): void {
  const player = state.player;
  boss.facing = player.x >= boss.x ? 1 : -1;
  boss.vx = 0;

  if (isFloatingMoon) {
    const hoverY = 198 + Math.sin(state.tick * 0.2) * 8;
    boss.vy = (hoverY - boss.y) * 0.14;
    boss.y += boss.vy;
    boss.grounded = false;
  } else {
    boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
    const res = moveAndCollideBox(
      state.room,
      false,
      boss.x,
      boss.y,
      boss.width,
      boss.height,
      0,
      boss.vy,
    );
    boss.x = res.x;
    boss.y = res.y;
    boss.grounded = res.grounded;
    if (res.hitY) boss.vy = 0;
  }

  // ---- BOSS 2 SPECIAL: HIGH-NOON QUICKDRAW AT 1 HP! ----
  if (boss.id === 'b_cheddar' && boss.hp === 1) {
    if (boss.stateTimer === 28) {
      boss.parryable = true;
      boss.invulnTicks = 0;
      state.events.push(
        { type: 'sfx', sfx: 'taunt' },
        { type: 'callout', text: 'DRAW!', durationTicks: 65 },
        {
          type: 'particle',
          kind: 'starburst',
          x: boss.x,
          y: boss.y - boss.height - 8,
          count: 10,
          color: '#ffd166',
        },
      );
    }
    boss.stateTimer -= 1;
    if (boss.stateTimer <= 0) {
      // Player didn't shoot in time — Sheriff Cheddar fires a blistering parryable Quickdraw bullet!
      boss.parryable = false;
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'bullet',
        x: boss.x + boss.facing * 26,
        y: boss.y - 24,
        vx: boss.facing * 14.5,
        vy: 0,
        radius: 10,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: false,
        ttlTicks: 100,
        color: '#ffd166',
      });
      state.events.push({ type: 'sfx', sfx: 'revolver_shot' });
      boss.aiState = 'vulnerable';
      boss.stateTimer = 42;
    }
    return;
  }

  boss.stateTimer -= 1;
  if (boss.stateTimer <= 0) {
    launchBossAttack(state, boss, bossDef, spd);
  }
}

function launchBossAttack(
  state: SimState,
  boss: BossState,
  bossDef: BossDef,
  spd: number,
): void {
  const atk = pickNextAttack(boss, bossDef);
  const player = state.player;
  boss.facing = player.x >= boss.x ? 1 : -1;

  // ==========================================================================
  // BOSS 1: ARTISTE BELL (10 HP)
  // ==========================================================================
  if (boss.id === 'b_artiste') {
    if (atk === 'shoulder_charge') {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 10.6 * spd;
      boss.vy = 0;
      boss.stateTimer = 108;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'mach3' });
      return;
    }
    if (atk === 'bowling_marble') {
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 42;
      boss.parryable = false;
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'bowling_ball',
        x: boss.x + boss.facing * 38,
        y: boss.y - 18,
        vx: boss.facing * 9.0 * spd,
        vy: 0,
        radius: 17,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: false,
        ttlTicks: 165,
        color: '#cbd5e1',
      });
      state.events.push({ type: 'sfx', sfx: 'throw' });
      return;
    }
    if (atk === 'bounce_slam' || atk === 'double_bounce_slam') {
      boss.aiState = 'jump_slam';
      boss.vx = boss.facing * 6.4 * spd;
      boss.vy = -14.4;
      boss.stateTimer = atk === 'double_bounce_slam' ? 3 : 2;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'jump' });
      return;
    }
    if (atk === 'statue_drop') {
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 50;
      boss.parryable = false;
      const count = boss.phase >= 2 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 145 + nextInt(state.rngState, -20, 20);
        const dropX = clampFinite(player.x + offset, 96, state.room.widthTiles * T - 96);
        spawnProjectile(state, {
          owner: 'boss',
          kind: 'statue',
          x: dropX,
          y: 66,
          vx: 0,
          vy: 1.6,
          radius: 18,
          damage: 1,
          parryable: true,
          reflected: false,
          gravity: true,
          ttlTicks: 155,
          color: '#e5e7eb',
        });
        state.events.push({
          type: 'particle',
          kind: 'marble_chunk',
          x: dropX,
          y: 56,
          count: 4,
          color: '#f8fafc',
        });
      }
      state.events.push({ type: 'sfx', sfx: 'block_marble' });
      return;
    }
    // smug_pose: Smug pose taunt before a juicy vulnerable punish window!
    boss.aiState = 'projectile';
    boss.vx = 0;
    boss.stateTimer = 44;
    boss.parryable = false;
    state.events.push(
      { type: 'sfx', sfx: 'taunt' },
      { type: 'callout', text: 'BEHOLD MY GENIUS!', durationTicks: 60 },
      {
        type: 'particle',
        kind: 'starburst',
        x: boss.x,
        y: boss.y - boss.height - 6,
        count: 10,
        color: '#ffd166',
      },
    );
    return;
  }

  // ==========================================================================
  // BOSS 2: SHERIFF CHEDDAR (9 HP + Revolver Duel)
  // ==========================================================================
  if (boss.id === 'b_cheddar') {
    if (atk === 'flame_dash') {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 9.8 * spd;
      boss.vy = 0;
      boss.stateTimer = 96;
      boss.parryable = true;
      state.events.push(
        { type: 'sfx', sfx: 'mach2' },
        {
          type: 'particle',
          kind: 'flame',
          x: boss.x + boss.facing * 20,
          y: boss.y - 24,
          count: 8,
          color: '#ff6b35',
        },
      );
      return;
    }
    if (atk === 'bazooka_shot') {
      boss.aiState = 'projectile';
      boss.vx = -boss.facing * 3.5; // Bazooka recoil kick!
      boss.stateTimer = 42;
      boss.parryable = false;
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'bomb',
        x: boss.x + boss.facing * 30,
        y: boss.y - 28,
        vx: boss.facing * 9.8 * spd,
        vy: 0,
        radius: 13,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: false,
        ttlTicks: 130,
        color: '#ff9f1c',
      });
      state.events.push(
        { type: 'sfx', sfx: 'shotgun_blast' },
        {
          type: 'particle',
          kind: 'flame',
          x: boss.x + boss.facing * 28,
          y: boss.y - 28,
          count: 7,
          color: '#ff9f1c',
        },
      );
      return;
    }
    if (atk === 'dynamite_toss') {
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 44;
      for (let i = 0; i < 2; i++) {
        spawnProjectile(state, {
          owner: 'boss',
          kind: 'dynamite',
          x: boss.x + boss.facing * 22,
          y: boss.y - 34,
          vx: boss.facing * (4.8 + i * 2.8) * spd,
          vy: -9.2 - i * 1.1,
          radius: 11,
          damage: 1,
          parryable: true,
          reflected: false,
          gravity: true,
          ttlTicks: 130,
          color: '#ef233c',
        });
      }
      state.events.push({ type: 'sfx', sfx: 'throw' });
      return;
    }
    if (atk === 'dynamite_volley') {
      // Rapid 3-stick staggered dynamite volley executed in stepBossProjectilePhase!
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 54;
      state.events.push({ type: 'sfx', sfx: 'throw' });
      return;
    }
    if (atk === 'cow_stampede') {
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 50;
      const existingCows = countAliveEnemies(state, 'cow_charger');
      const toSpawn = Math.max(0, Math.min(2 - existingCows, 2));
      const roomW = state.room.widthTiles * T;
      for (let i = 0; i < toSpawn; i++) {
        const dropX = i === 0 ? 96 : roomW - 96;
        const cowFacing: 1 | -1 = i === 0 ? 1 : -1;
        spawnDynamicEnemy(state, 'cow_charger', dropX, 110 + i * 24, {
          facing: cowFacing,
          vx: cowFacing * 6.8,
          vy: 1.5,
          attackCooldown: 40,
        });
      }
      state.events.push(
        { type: 'sfx', sfx: 'alarm_siren' },
        { type: 'callout', text: 'STAMPEDE!', durationTicks: 70 },
      );
      return;
    }
  }

  // ==========================================================================
  // BOSS 3: THE STATIC / THE GLITCH (8 HP)
  // ==========================================================================
  if (boss.id === 'b_static') {
    if (atk === 'skate_blitz') {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 11.6 * spd;
      boss.vy = 0;
      boss.stateTimer = 100;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'mach3' });
      return;
    }
    if (atk === 'spring_pogo') {
      boss.aiState = 'jump_slam';
      boss.vx = boss.facing * 7.2 * spd;
      boss.vy = -14.0;
      boss.stateTimer = boss.phase >= 2 ? 4 : 3;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'wall_bounce' });
      return;
    }
    if (atk === 'jetpack_dive') {
      // Launches high on jetpack, then diagonal dive-bombs in stepBossJumpSlam!
      boss.aiState = 'jump_slam';
      boss.vx = boss.facing * 3.5;
      boss.vy = -15.5;
      boss.stateTimer = 2; // 2 = ascending/apex -> dive; 1 = dive impact
      boss.parryable = true;
      state.events.push(
        { type: 'sfx', sfx: 'sjump_launch' },
        {
          type: 'particle',
          kind: 'flame',
          x: boss.x,
          y: boss.y,
          count: 10,
          color: '#ffbe0b',
        },
      );
      return;
    }
    if (atk === 'balloon_barrage') {
      // Rises into a floating hot-air balloon bomb barrage handled in stepBossProjectilePhase!
      boss.aiState = 'projectile';
      boss.vx = boss.facing * 4.2;
      boss.vy = -6.5;
      boss.grounded = false;
      boss.stateTimer = 92;
      boss.parryable = false;
      state.events.push(
        { type: 'sfx', sfx: 'jump' },
        { type: 'callout', text: 'BALLOON BOMB BARRAGE!', durationTicks: 70 },
      );
      return;
    }
    if (atk === 'minion_spawn') {
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 44;
      const existing = countAliveEnemies(state, 'static_minion');
      const toSpawn = Math.max(0, Math.min(2 - existing, 2));
      for (let i = 0; i < toSpawn; i++) {
        const dir: 1 | -1 = i === 0 ? boss.facing : (boss.facing === 1 ? -1 : 1);
        spawnDynamicEnemy(state, 'static_minion', boss.x + dir * 28, boss.y - 20, {
          facing: dir,
          vx: dir * 4.2,
          vy: -7.5,
        });
      }
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'bomb',
        x: boss.x + boss.facing * 20,
        y: boss.y - 34,
        vx: boss.facing * 6.2,
        vy: -8.6,
        radius: 11,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: true,
        ttlTicks: 125,
        color: '#ffbe0b',
      });
      state.events.push(
        { type: 'sfx', sfx: 'throw' },
        {
          type: 'particle',
          kind: 'confetti',
          x: boss.x,
          y: boss.y - 36,
          count: 12,
          color: '#ffd166',
        },
      );
      return;
    }
    // bomb_toss
    boss.aiState = 'projectile';
    boss.vx = 0;
    boss.stateTimer = 38;
    for (let i = 0; i < 2; i++) {
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'bomb',
        x: boss.x + boss.facing * 20,
        y: boss.y - 34,
        vx: boss.facing * (4.6 + i * 3.1) * spd,
        vy: -8.8 - i * 0.9,
        radius: 11,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: true,
        ttlTicks: 130,
        color: '#ffbe0b',
      });
    }
    state.events.push({ type: 'sfx', sfx: 'throw' });
    return;
  }

  // ==========================================================================
  // BOSS 4: DOPPEL-PEPPO (6 HP Phase 1 Mirror Moveset)
  // ==========================================================================
  if (boss.id === 'b_doppel') {
    if (atk === 'copy_dash') {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 12.2 * spd;
      boss.vy = 0;
      boss.stateTimer = 95;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'mach4' });
      return;
    }
    if (atk === 'super_slam') {
      // Soaring Superjump ceiling slam -> drops debris -> crashes down -> stunned!
      boss.aiState = 'jump_slam';
      boss.vx = 0;
      boss.vy = -17.0;
      boss.stateTimer = 2; // 2 = soaring upward to ceiling; 1 = diving down onto player
      boss.parryable = true;
      state.events.push(
        { type: 'sfx', sfx: 'sjump_launch' },
        {
          type: 'particle',
          kind: 'slam_wave',
          x: boss.x,
          y: boss.y,
          count: 8,
          color: '#ff006e',
        },
      );
      return;
    }
    if (atk === 'clone_surge') {
      const existing = countAliveEnemies(state, 'clone_bot');
      const toSpawn = Math.max(0, Math.min(2 - existing, boss.hp <= 3 ? 2 : 1));
      for (let i = 0; i < toSpawn; i++) {
        const dir: 1 | -1 = i === 0 ? boss.facing : (boss.facing === 1 ? -1 : 1);
        spawnDynamicEnemy(state, 'clone_bot', boss.x + dir * 32, boss.y - 16, {
          facing: dir,
          vx: dir * 3.8,
          vy: -6.0,
          attackCooldown: 50 + i * 25,
        });
      }
      // Follow clone surge with a frantic mirror lunge into stunned recovery!
      boss.aiState = 'charge';
      boss.vx = boss.facing * 11.4 * spd;
      boss.vy = 0;
      boss.stateTimer = 85;
      boss.parryable = true;
      state.events.push(
        { type: 'sfx', sfx: 'mach3' },
        {
          type: 'particle',
          kind: 'smoke',
          x: boss.x,
          y: boss.y - 30,
          count: 10,
          color: '#94a3b8',
        },
      );
      return;
    }
    // head_toss
    boss.aiState = 'projectile';
    boss.vx = 0;
    boss.stateTimer = 40;
    const heads = boss.hp <= 3 ? 2 : 1;
    for (let i = 0; i < heads; i++) {
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'head_toss',
        x: boss.x + boss.facing * 24,
        y: boss.y - 42,
        vx: boss.facing * (7.0 + i * 2.2) * spd,
        vy: -5.8 - i * 1.5,
        radius: 14,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: true,
        ttlTicks: 145,
        color: '#f7d6bf',
      });
    }
    state.events.push({ type: 'sfx', sfx: 'throw' });
    return;
  }

  // ==========================================================================
  // BOSS 5: MEGA-CRUST & LORD DOUGH (3-Stage Grand Finale)
  // ==========================================================================
  // ---- Phase 1: Mega-Crust (Floating Pizza Moon dropping stunned enemies!) ----
  if (boss.phase === 1) {
    if (atk === 'moon_swoop') {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 8.2 * spd;
      boss.vy = 3.6;
      boss.stateTimer = 64;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'mach2' });
      return;
    }
    if (atk === 'moon_cog') {
      boss.aiState = 'projectile';
      boss.vx = boss.facing * 2.4;
      boss.stateTimer = 44;
      for (let i = 0; i < 2; i++) {
        spawnProjectile(state, {
          owner: 'boss',
          kind: 'cog',
          x: boss.x + (i === 0 ? -24 : 24),
          y: boss.y - 10,
          vx: (player.x >= boss.x ? 1 : -1) * (3.2 + i * 1.8),
          vy: 3.4,
          radius: 13,
          damage: 1,
          parryable: true,
          reflected: false,
          gravity: false,
          ttlTicks: 135,
          color: '#94a3b8',
        });
      }
      state.events.push({ type: 'sfx', sfx: 'throw' });
      return;
    }
    // moon_drop: Drops stunned grab-and-throw enemies (slime_glob, fork_imp, pepper_goblin)!
    boss.aiState = 'projectile';
    boss.vx = boss.facing * 2.8;
    boss.stateTimer = 48;
    const activeMinions = countAliveEnemies(state);
    const toDrop = Math.max(0, Math.min(3 - activeMinions, 2));
    for (let i = 0; i < toDrop; i++) {
      const arch = MEGA_CRUST_MOON_POOL[nextInt(state.rngState, 0, MEGA_CRUST_MOON_POOL.length - 1)];
      const dropX = clampFinite(
        boss.x + (i === 0 ? -36 : 36),
        96,
        state.room.widthTiles * T - 96,
      );
      spawnDynamicEnemy(state, arch, dropX, boss.y + 8, {
        facing: player.x >= dropX ? 1 : -1,
        vx: (i === 0 ? -1.4 : 1.4),
        vy: 2.0,
        stunTicks: 260, // Stunned on impact so player can Grab & Throw upward into Mega-Crust!
      });
    }
    state.events.push(
      { type: 'sfx', sfx: 'throw' },
      {
        type: 'particle',
        kind: 'starburst',
        x: boss.x,
        y: boss.y,
        count: 8,
        color: '#ffd166',
      },
    );
    return;
  }

  // ---- Phase 2: Lord Dough (TVs, Cogs, Gatling Pellets, Boot Stomps!) ----
  if (boss.phase === 2) {
    if (atk === 'boot_stomp') {
      boss.aiState = 'jump_slam';
      boss.vx = boss.facing * 7.2 * spd;
      boss.vy = -15.2;
      boss.stateTimer = 3;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'jump' });
      return;
    }
    if (atk === 'gatling_pellet') {
      // 4-shot staggered rapid gatling burst executed in stepBossProjectilePhase!
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 50;
      state.events.push({ type: 'sfx', sfx: 'revolver_shot' });
      return;
    }
    if (atk === 'cog_shower') {
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 44;
      for (let i = 0; i < 3; i++) {
        spawnProjectile(state, {
          owner: 'boss',
          kind: 'cog',
          x: boss.x + boss.facing * 26,
          y: boss.y - 36 - i * 8,
          vx: boss.facing * (6.5 + i * 1.8) * spd,
          vy: -2.5 + i * 1.4,
          radius: 13,
          damage: 1,
          parryable: true,
          reflected: false,
          gravity: false,
          ttlTicks: 145,
          color: '#94a3b8',
        });
      }
      state.events.push({ type: 'sfx', sfx: 'throw' });
      return;
    }
    // tv_toss
    boss.aiState = 'projectile';
    boss.vx = 0;
    boss.stateTimer = 46;
    for (let i = 0; i < 2; i++) {
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'tv_toss',
        x: boss.x + boss.facing * 28,
        y: boss.y - 46,
        vx: boss.facing * (5.6 + i * 2.6) * spd,
        vy: -7.5 - i * 1.4,
        radius: 15,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: true,
        ttlTicks: 150,
        color: '#38bdf8',
      });
    }
    state.events.push({ type: 'sfx', sfx: 'throw' });
    return;
  }

  // ---- Phase 3: Boss Rush Finale (Artiste -> Cheddar -> Static cameos every 2 HP!) ----
  if (atk === 'cameo_artiste') {
    if (boss.attackIndex % 2 === 1) {
      // Artiste Bell bowling marble + falling marble statue!
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 42;
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'bowling_ball',
        x: boss.x + boss.facing * 36,
        y: boss.y - 18,
        vx: boss.facing * 9.6 * spd,
        vy: 0,
        radius: 17,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: false,
        ttlTicks: 155,
        color: '#cbd5e1',
      });
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'statue',
        x: clampFinite(player.x, 96, state.room.widthTiles * T - 96),
        y: 66,
        vx: 0,
        vy: 2.2,
        radius: 17,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: true,
        ttlTicks: 140,
        color: '#e5e7eb',
      });
      state.events.push({ type: 'sfx', sfx: 'block_marble' });
    } else {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 12.2 * spd;
      boss.vy = 0;
      boss.stateTimer = 90;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'mach3' });
    }
    return;
  }

  if (atk === 'cameo_cheddar') {
    boss.aiState = 'projectile';
    boss.vx = 0;
    boss.stateTimer = 46;
    for (let i = 0; i < 2; i++) {
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'dynamite',
        x: boss.x + boss.facing * 24,
        y: boss.y - 36,
        vx: boss.facing * (5.2 + i * 2.8) * spd,
        vy: -9.0 - i * 1.2,
        radius: 11,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: true,
        ttlTicks: 130,
        color: '#ef233c',
      });
    }
    spawnProjectile(state, {
      owner: 'boss',
      kind: 'bullet',
      x: boss.x + boss.facing * 28,
      y: boss.y - 26,
      vx: boss.facing * 10.5 * spd,
      vy: 0,
      radius: 9,
      damage: 1,
      parryable: true,
      reflected: false,
      gravity: false,
      ttlTicks: 120,
      color: '#ffd166',
    });
    state.events.push({ type: 'sfx', sfx: 'revolver_shot' });
    return;
  }

  // cameo_static: Pogo bombs!
  boss.aiState = 'jump_slam';
  boss.vx = boss.facing * 7.8 * spd;
  boss.vy = -14.4;
  boss.stateTimer = 3;
  boss.parryable = true;
  spawnProjectile(state, {
    owner: 'boss',
    kind: 'bomb',
    x: boss.x + boss.facing * 18,
    y: boss.y - 34,
    vx: boss.facing * 6.0,
    vy: -8.2,
    radius: 11,
    damage: 1,
    parryable: true,
    reflected: false,
    gravity: true,
    ttlTicks: 125,
    color: '#ffbe0b',
  });
  state.events.push({ type: 'sfx', sfx: 'wall_bounce' });
}

function stepBossCharge(
  state: SimState,
  boss: BossState,
  activeAtk: string,
  spd: number,
  isFloatingMoon: boolean,
): void {
  // Floating Mega-Crust swoop dive across the catwalks
  if (isFloatingMoon) {
    boss.stateTimer -= 1;
    const progress = 1 - boss.stateTimer / 64;
    const targetY = 205 + Math.sin(progress * Math.PI) * 135;
    boss.vy = (targetY - boss.y) * 0.25;
    boss.x += boss.vx;
    boss.y += boss.vy;
    boss.grounded = false;

    const minX = T + boss.width * 0.5;
    const maxX = (state.room.widthTiles - 1) * T - boss.width * 0.5;
    if (boss.x <= minX || boss.x >= maxX || boss.stateTimer <= 0) {
      boss.aiState = 'vulnerable';
      boss.parryable = false;
      boss.stateTimer = 55;
      boss.vx = 0;
    }
    return;
  }

  // Sheriff Cheddar's Flamethrower Dash belches parryable flame tongues while rushing!
  if (boss.id === 'b_cheddar' && activeAtk === 'flame_dash' && boss.stateTimer % 12 === 0) {
    spawnProjectile(state, {
      owner: 'boss',
      kind: 'flame',
      x: boss.x + boss.facing * 24,
      y: boss.y - 20,
      vx: boss.facing * 4.5 * spd,
      vy: 0,
      radius: 10,
      damage: 1,
      parryable: true,
      reflected: false,
      gravity: false,
      ttlTicks: 38,
      color: '#ff6b35',
    });
  }

  // Doppel-Peppo & The Static emit speed trails while charging!
  if ((boss.id === 'b_doppel' || boss.id === 'b_static') && boss.stateTimer % 4 === 0) {
    state.events.push({
      type: 'particle',
      kind: 'speed_line',
      x: boss.x - boss.facing * 18,
      y: boss.y - boss.height * 0.5,
      vx: -boss.facing * 5,
      count: 2,
      color: boss.id === 'b_doppel' ? '#ff006e' : '#ffbe0b',
    });
  }

  boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
  const res = moveAndCollideBox(
    state.room,
    false,
    boss.x,
    boss.y,
    boss.width,
    boss.height,
    boss.vx,
    boss.vy,
  );
  boss.x = res.x;
  boss.y = res.y;
  boss.grounded = res.grounded;
  if (res.hitY) boss.vy = 0;

  boss.stateTimer -= 1;

  // Slamming into the arena wall stuns the boss into a juicy vulnerable opening!
  if (res.hitX || boss.stateTimer <= 0) {
    boss.aiState = 'vulnerable';
    boss.parryable = false;
    boss.stateTimer = boss.phase >= 2 ? 82 : 112;
    boss.vx = -boss.facing * 4.2;
    boss.vy = -7.2;
    state.shakeMag = Math.max(state.shakeMag, 9);
    state.shakeTimer = Math.max(state.shakeTimer, 18);
    state.events.push(
      { type: 'sfx', sfx: 'bodyslam_heavy' },
      { type: 'rumble', strong: 0.6, weak: 0.3, durationMs: 120 },
      {
        type: 'particle',
        kind: 'slam_wave',
        x: boss.x,
        y: boss.y - 20,
        count: 8,
        color: '#f4a261',
      },
    );
  }
}

function stepBossJumpSlam(
  state: SimState,
  boss: BossState,
  activeAtk: string,
  spd: number,
): void {
  const player = state.player;

  // ---- SPECIAL: The Static Jetpack Diagonal Dive-Bomb ----
  if (boss.id === 'b_static' && activeAtk === 'jetpack_dive') {
    if (boss.stateTimer === 2) {
      boss.vy = Math.min(14, boss.vy + ENGINE_CONSTANTS.GRAV * 0.9);
      if (state.tick % 2 === 0) {
        state.events.push({
          type: 'particle',
          kind: 'flame',
          x: boss.x,
          y: boss.y,
          count: 3,
          color: '#ff9f1c',
        });
      }
      // At apex, lock onto player and diagonal dive-bomb!
      if (boss.vy >= -1 || boss.y <= T + boss.height + 24) {
        boss.stateTimer = 1;
        boss.facing = player.x >= boss.x ? 1 : -1;
        const dx = player.x - boss.x;
        const dy = Math.max(80, player.y - boss.y);
        const len = Math.hypot(dx, dy) || 1;
        const diveSpeed = 13.5 * spd;
        boss.vx = (dx / len) * diveSpeed;
        boss.vy = Math.max(8.5, (dy / len) * diveSpeed);
        state.events.push({ type: 'sfx', sfx: 'mach4' });
      }
    } else {
      boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + 0.35);
      if (state.tick % 2 === 0) {
        state.events.push({
          type: 'particle',
          kind: 'flame',
          x: boss.x,
          y: boss.y - 20,
          count: 2,
          color: '#ffbe0b',
        });
      }
    }

    const res = moveAndCollideBox(
      state.room,
      false,
      boss.x,
      boss.y,
      boss.width,
      boss.height,
      boss.vx,
      boss.vy,
    );
    boss.x = res.x;
    boss.y = res.y;
    boss.grounded = res.grounded;

    if (res.hitX) {
      boss.vx = -boss.vx * 0.6;
      boss.facing = boss.facing === 1 ? -1 : 1;
    }

    if (res.grounded && boss.vy > 0 && boss.stateTimer === 1) {
      state.shakeMag = Math.max(state.shakeMag, 9);
      state.shakeTimer = Math.max(state.shakeTimer, 16);
      state.events.push(
        { type: 'sfx', sfx: 'bodyslam_heavy' },
        {
          type: 'particle',
          kind: 'slam_wave',
          x: boss.x,
          y: boss.y,
          count: 12,
          color: '#ffbe0b',
        },
      );
      boss.aiState = 'vulnerable';
      boss.parryable = false;
      boss.vx = 0;
      boss.vy = 0;
      boss.stateTimer = 78;
    }
    return;
  }

  // ---- SPECIAL: Doppel-Peppo Soaring Superjump Ceiling Slam ----
  if (boss.id === 'b_doppel' && activeAtk === 'super_slam') {
    if (boss.stateTimer === 2) {
      boss.vy = Math.min(12, boss.vy + 0.35);
      boss.vx = clampFinite((player.x - boss.x) * 0.08, -7, 7);
      const res = moveAndCollideBox(
        state.room,
        false,
        boss.x,
        boss.y,
        boss.width,
        boss.height,
        boss.vx,
        boss.vy,
      );
      boss.x = res.x;
      boss.y = res.y;
      boss.grounded = res.grounded;

      // Ceiling impact or apex -> drop ceiling rubble and crash straight down!
      if ((res.hitY && boss.vy < 0) || boss.vy >= 0) {
        boss.stateTimer = 1;
        boss.vx = 0;
        boss.vy = 14.5;
        state.shakeMag = Math.max(state.shakeMag, 7);
        state.shakeTimer = Math.max(state.shakeTimer, 12);
        state.events.push({ type: 'sfx', sfx: 'block_marble' });
        for (const offset of [-110, 110]) {
          const rx = clampFinite(boss.x + offset, 80, DOPPEL_PHASE1_GATE_TILE * T - 80);
          spawnProjectile(state, {
            owner: 'boss',
            kind: 'statue',
            x: rx,
            y: 66,
            vx: 0,
            vy: 2.0,
            radius: 13,
            damage: 1,
            parryable: true,
            reflected: false,
            gravity: true,
            ttlTicks: 125,
            color: '#cbd5e1',
          });
        }
      }
      return;
    }

    boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
    const res = moveAndCollideBox(
      state.room,
      false,
      boss.x,
      boss.y,
      boss.width,
      boss.height,
      0,
      boss.vy,
    );
    boss.x = res.x;
    boss.y = res.y;
    boss.grounded = res.grounded;
    if (res.grounded && boss.vy > 0) {
      state.shakeMag = Math.max(state.shakeMag, 9);
      state.shakeTimer = Math.max(state.shakeTimer, 16);
      state.events.push(
        { type: 'sfx', sfx: 'bodyslam_heavy' },
        {
          type: 'particle',
          kind: 'slam_wave',
          x: boss.x,
          y: boss.y,
          count: 12,
          color: '#ff006e',
        },
      );
      boss.aiState = 'vulnerable';
      boss.parryable = false;
      boss.vx = 0;
      boss.vy = 0;
      boss.stateTimer = 85;
    }
    return;
  }

  // ---- STANDARD MULTI-BOUNCE SLAM (Artiste Bounce Slam, Static Pogo, Lord Dough Boot Stomp) ----
  boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV * 1.05);
  const res = moveAndCollideBox(
    state.room,
    false,
    boss.x,
    boss.y,
    boss.width,
    boss.height,
    boss.vx,
    boss.vy,
  );
  boss.x = res.x;
  boss.y = res.y;
  boss.grounded = res.grounded;

  if (res.hitX) {
    boss.facing = boss.facing === 1 ? -1 : 1;
    boss.vx = -boss.vx;
  }

  if (res.grounded && boss.vy > 0) {
    state.shakeMag = Math.max(state.shakeMag, 7);
    state.shakeTimer = Math.max(state.shakeTimer, 14);
    state.events.push(
      { type: 'sfx', sfx: 'bodyslam_heavy' },
      {
        type: 'particle',
        kind: 'slam_wave',
        x: boss.x,
        y: boss.y,
        count: 10,
        color: '#ffd166',
      },
    );

    // Artiste Bell's bounce-slam releases low shockwave sparks!
    if (boss.id === 'b_artiste') {
      for (const dir of [-1, 1] as const) {
        spawnProjectile(state, {
          owner: 'boss',
          kind: 'flame',
          x: boss.x + dir * 24,
          y: boss.y - 10,
          vx: dir * (boss.phase >= 2 ? 7.4 : 5.8),
          vy: 0,
          radius: 9,
          damage: 1,
          parryable: true,
          reflected: false,
          gravity: false,
          ttlTicks: 34,
          color: '#f4a261',
        });
      }
    }

    // Lord Dough Phase 3 Static cameo drops pogo bombs on bounce!
    if (boss.id === 'b_megacrust' && activeAtk === 'cameo_static') {
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'bomb',
        x: boss.x,
        y: boss.y - 26,
        vx: (player.x >= boss.x ? 1 : -1) * 5.2,
        vy: -7.5,
        radius: 10,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: true,
        ttlTicks: 115,
        color: '#ffbe0b',
      });
    }

    boss.stateTimer -= 1;
    if (boss.stateTimer > 0) {
      boss.facing = player.x >= boss.x ? 1 : -1;
      boss.vx = boss.facing * (boss.id === 'b_static' ? 7.4 : 6.5) * spd;
      boss.vy = boss.id === 'b_static' ? -13.8 : -13.4;
      boss.grounded = false;
      state.events.push({
        type: 'sfx',
        sfx: boss.id === 'b_static' ? 'wall_bounce' : 'jump',
      });
    } else {
      boss.aiState = 'vulnerable';
      boss.parryable = false;
      boss.vx = 0;
      boss.vy = 0;
      boss.stateTimer = boss.phase >= 2 ? 76 : 100;
    }
  }
}

function stepBossProjectilePhase(
  state: SimState,
  boss: BossState,
  activeAtk: string,
  spd: number,
  isFloatingMoon: boolean,
): void {
  const player = state.player;

  // ---- SPECIAL: The Static Floating Hot-Air Balloon Bomb Barrage ----
  if (boss.id === 'b_static' && activeAtk === 'balloon_barrage') {
    const targetY = 160 + Math.sin(state.tick * 0.1) * 14;
    boss.vy = (targetY - boss.y) * 0.14;
    if (boss.x < 120) boss.facing = 1;
    if (boss.x > state.room.widthTiles * T - 120) boss.facing = -1;
    boss.vx = boss.facing * 4.8 * spd;
    boss.x += boss.vx;
    boss.y += boss.vy;
    boss.grounded = false;

    if (boss.stateTimer % 18 === 0 && boss.stateTimer > 12) {
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'bomb',
        x: boss.x,
        y: boss.y - 4,
        vx: clampFinite((player.x - boss.x) * 0.02, -3.2, 3.2),
        vy: 1.4,
        radius: 11,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: true,
        ttlTicks: 130,
        color: '#ffbe0b',
      });
      state.events.push({ type: 'sfx', sfx: 'throw' });
    }

    boss.stateTimer -= 1;
    if (boss.stateTimer <= 0) {
      state.events.push({
        type: 'particle',
        kind: 'smoke',
        x: boss.x,
        y: boss.y - boss.height,
        count: 10,
        color: '#f8fafc',
      });
      boss.aiState = 'vulnerable';
      boss.vx = 0;
      boss.vy = 1;
      boss.stateTimer = 76;
    }
    return;
  }

  // ---- SPECIAL: Sheriff Cheddar Rapid Dynamite Volley (3 staggered throws) ----
  if (
    boss.id === 'b_cheddar' &&
    activeAtk === 'dynamite_volley' &&
    (boss.stateTimer === 46 || boss.stateTimer === 32 || boss.stateTimer === 18)
  ) {
    boss.facing = player.x >= boss.x ? 1 : -1;
    const idx = boss.stateTimer === 46 ? 0 : boss.stateTimer === 32 ? 1 : 2;
    spawnProjectile(state, {
      owner: 'boss',
      kind: 'dynamite',
      x: boss.x + boss.facing * 24,
      y: boss.y - 34,
      vx: boss.facing * (4.4 + idx * 2.2) * spd,
      vy: -8.6 - idx * 1.0,
      radius: 11,
      damage: 1,
      parryable: true,
      reflected: false,
      gravity: true,
      ttlTicks: 130,
      color: '#ef233c',
    });
    state.events.push({ type: 'sfx', sfx: 'throw' });
  }

  // ---- SPECIAL: Lord Dough Rapid Gatling Pellet Burst (4 staggered shots) ----
  if (
    boss.id === 'b_megacrust' &&
    activeAtk === 'gatling_pellet' &&
    (boss.stateTimer === 44 ||
      boss.stateTimer === 36 ||
      boss.stateTimer === 28 ||
      boss.stateTimer === 20)
  ) {
    boss.facing = player.x >= boss.x ? 1 : -1;
    const spreadY = ((boss.stateTimer / 8) % 2 === 0 ? -1 : 1) * 1.1;
    spawnProjectile(state, {
      owner: 'boss',
      kind: 'bullet',
      x: boss.x + boss.facing * 28,
      y: boss.y - 26,
      vx: boss.facing * 10.2 * spd,
      vy: spreadY,
      radius: 8,
      damage: 1,
      parryable: true,
      reflected: false,
      gravity: false,
      ttlTicks: 120,
      color: '#ffd166',
    });
    state.events.push({ type: 'sfx', sfx: 'revolver_shot', pitchJitter: 0.1 });
  }

  if (isFloatingMoon) {
    const hoverY = 202 + Math.sin(state.tick * 0.08) * 18;
    boss.vy = (hoverY - boss.y) * 0.12;
    boss.x += boss.vx;
    boss.y += boss.vy;
    boss.grounded = false;
  } else {
    boss.vx *= 0.85;
    boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
    const res = moveAndCollideBox(
      state.room,
      false,
      boss.x,
      boss.y,
      boss.width,
      boss.height,
      boss.vx,
      boss.vy,
    );
    boss.x = res.x;
    boss.y = res.y;
    boss.grounded = res.grounded;
    if (res.hitY) boss.vy = 0;
  }

  boss.stateTimer -= 1;
  if (boss.stateTimer <= 0) {
    boss.aiState = 'vulnerable';
    // Artiste Bell's smug pose opens an extra-generous punish window!
    if (boss.id === 'b_artiste' && activeAtk === 'smug_pose') {
      boss.stateTimer = 95;
    } else if (isFloatingMoon) {
      boss.stateTimer = 42;
    } else {
      boss.stateTimer = boss.phase >= 2 ? 52 : 66;
    }
  }
}

function stepDoppelChaseEscape(
  state: SimState,
  boss: BossState,
  _spd: number,
): void {
  const player = state.player;
  const floorY = getFloorY(state);
  const exitX = (state.room.widthTiles - 4) * T;

  // Keep invulnTicks active so combat.ts lets stepBoss own chase contact & parry pushback
  boss.invulnTicks = Math.max(boss.invulnTicks, 2);
  boss.parryable = true;
  state.escape.active = true;

  // Compute chase progress (0..100%) across the escape hallway
  const pct = clampFinite(((player.x - 160) / Math.max(1, exitX - 160)) * 100, 0, 100);
  boss.chaseProgress = Math.max(boss.chaseProgress, pct);

  // Victory when player reaches the right escape door / 100% chaseProgress!
  if (boss.chaseProgress >= 98 || player.x >= exitX - 56) {
    boss.chaseProgress = 100;
    boss.aiState = 'defeated';
    boss.stateTimer = 34;
    boss.parryable = false;
    boss.vx = -6;
    boss.vy = -8;
    state.escape.active = false;

    for (let i = 0; i < state.props.length; i++) {
      if (state.props[i].kind === 'exit_door') {
        state.props[i].active = false;
        state.props[i].triggered = true;
      }
    }

    state.events.push(
      { type: 'sfx', sfx: 'boss_defeat' },
      { type: 'rumble', strong: 1.0, weak: 0.7, durationMs: 320 },
      {
        type: 'particle',
        kind: 'confetti',
        x: player.x,
        y: player.y - 32,
        count: 26,
        color: '#ffd166',
      },
      {
        type: 'callout',
        text: 'ESCAPED DOPPEL-PEPPO! KNOCKOUT!',
        durationTicks: 120,
      },
    );
    return;
  }

  // Relentless hallway pursuit toward the player!
  if (boss.stateTimer > 0) {
    // Brief shove-back stagger after being parried
    boss.stateTimer -= 1;
    boss.vx *= 0.88;
  } else {
    const chaseSpeed = Math.min(12.8, 8.2 + boss.chaseProgress * 0.045);
    const dx = player.x - boss.x;
    boss.facing = dx >= 0 ? 1 : -1;
    boss.vx = boss.facing * chaseSpeed;

    // Leap smoothly toward elevated player or over hurdles
    if (boss.grounded && (player.y < boss.y - 40 || state.tick % 48 === 0)) {
      boss.vy = -10.5;
      boss.grounded = false;
    }
  }

  boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
  // Move through breakable obstacles seamlessly during meltdown chase, staying inside outer walls
  boss.x = clampFinite(boss.x + boss.vx, T + boss.width * 0.5, (state.room.widthTiles - 1) * T - boss.width * 0.5);
  boss.y += boss.vy;
  if (boss.y >= floorY) {
    boss.y = floorY;
    boss.vy = 0;
    boss.grounded = true;
  }

  if (state.tick % 4 === 0) {
    state.events.push({
      type: 'particle',
      kind: 'speed_line',
      x: boss.x - boss.facing * 18,
      y: boss.y - 28,
      vx: -boss.facing * 5,
      count: 2,
      color: '#ff006e',
    });
  }

  // Contact check during hallway chase
  const pBox = getPlayerBox(player);
  const overlaps =
    pBox.right > boss.x - boss.width * 0.5 &&
    pBox.left < boss.x + boss.width * 0.5 &&
    pBox.bottom > boss.y - boss.height &&
    pBox.top < boss.y;

  if (!overlaps) return;

  if (player.parryTicks > 0) {
    triggerParrySuccess(state, boss.x);
    boss.vx = -13;
    boss.x = Math.max(2 * T, boss.x - 96);
    boss.stateTimer = 28;
    state.events.push({ type: 'callout', text: 'SHOVED BACK! KEEP RUNNING!', durationTicks: 50 });
  } else if (player.invulnTicks <= 0 && player.hurtTicks <= 0) {
    hurtPlayer(state, boss.x, 1);
    // Propel player forward toward exit so they never get corner-locked!
    player.vx = 9.0;
    player.vy = -7.5;
    boss.x = Math.max(2 * T, boss.x - 72);
    boss.stateTimer = 18;
  }
}
