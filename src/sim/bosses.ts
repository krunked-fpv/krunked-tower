// ============================================================================
// Krunked Tower — Multi-Phase Slapstick Boss AI (Full Boss 1 Artiste Bell +
// Playable Multi-Phase Loops for Bosses 2–5)
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// ============================================================================

import { ENGINE_CONSTANTS } from '../contracts/index';
import type {
  BossDef,
  BossState,
  PlayableCharacter,
  SimState,
} from '../contracts/index';
import { getBossDef } from '../data/index';
import { getPlayerBox, moveAndCollideBox } from './collision';
import { spawnProjectile } from './combat';
import { hurtPlayer, triggerParrySuccess } from './player';
import { nextInt } from './prng';
import { addScore, finalizeStageRank } from './scoring';

const T = ENGINE_CONSTANTS.TILE_SIZE;

function getBossDimensions(id: BossDef['id']): { w: number; h: number } {
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
      return { w: 72, h: 72 };
  }
}

export function createBossState(
  bossDef: BossDef,
  character: PlayableCharacter = 'peppo',
): BossState {
  const { w, h } = getBossDimensions(bossDef.id);
  const floorRow = bossDef.room.heightTiles - 3;
  const spawnX = (bossDef.room.widthTiles - 6) * T;
  const spawnY = floorRow * T;
  const displayName =
    character === 'static' && bossDef.staticName ? bossDef.staticName : bossDef.name;

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
    grounded: true,
    parryable: false,
    chaseProgress: 0,
  };
}

export function damageBoss(
  state: SimState,
  amount = 1,
  sourceX?: number,
): boolean {
  const boss = state.boss;
  if (!boss || boss.aiState === 'defeated') return false;
  if (boss.invulnTicks > 0 && amount < 4) return false;

  const bossDef = getBossDef(boss.id);
  const dmg = Math.max(1, Math.round(amount));
  boss.hp = Math.max(0, boss.hp - dmg);
  boss.invulnTicks = 28;
  boss.flashTicks = 18;
  boss.parryable = false;

  state.hitstopTicks = Math.max(state.hitstopTicks, 5);
  state.shakeMag = Math.max(state.shakeMag, 8);
  state.shakeTimer = Math.max(state.shakeTimer, 16);

  addScore(state, 500 * dmg, boss.x, boss.y - boss.height - 10);
  state.events.push({ type: 'sfx', sfx: 'boss_hit' });
  state.events.push({ type: 'rumble', strong: 0.7, weak: 0.4, durationMs: 140 });
  state.events.push({
    type: 'particle',
    kind: 'starburst',
    x: boss.x,
    y: boss.y - boss.height * 0.5,
    count: 10,
    color: '#ffbe0b',
  });

  const pushDir = sourceX !== undefined ? (boss.x >= sourceX ? 1 : -1) : -boss.facing;
  boss.vx = pushDir * 6;
  boss.vy = -6.5;

  // Multi-bar handling for Boss 5 (Mega-Crust 8 + Lord Dough 8 + Finale 6)
  if (boss.id === 'b_megacrust' && boss.hp <= 0) {
    if (boss.phase === 1) {
      boss.phase = 2;
      boss.hp = bossDef.phase2Hp ?? 8;
      boss.maxHp = bossDef.phase2Hp ?? 8;
      boss.name = 'Lord Dough';
      boss.aiState = 'phase_shift';
      boss.stateTimer = 48;
      state.events.push({ type: 'boss_phase', bossId: boss.id, phase: 2 });
      state.events.push({
        type: 'callout',
        text: 'PHASE 2 — LORD DOUGH ENTERS THE RING!',
        durationTicks: 110,
      });
      return true;
    }
    if (boss.phase === 2) {
      boss.phase = 3;
      boss.hp = bossDef.phase3Hp ?? 6;
      boss.maxHp = bossDef.phase3Hp ?? 6;
      boss.name = 'Lord Dough (Overdrive)';
      boss.aiState = 'phase_shift';
      boss.stateTimer = 48;
      state.events.push({ type: 'boss_phase', bossId: boss.id, phase: 3 });
      state.events.push({
        type: 'callout',
        text: 'FINAL PHASE — TOWER SHOWDOWN!',
        durationTicks: 110,
      });
      return true;
    }
  }

  // Standard Phase 2 transition at half HP
  if (
    boss.id !== 'b_megacrust' &&
    boss.phase === 1 &&
    boss.hp > 0 &&
    boss.hp <= Math.ceil(boss.maxHp / 2)
  ) {
    boss.phase = 2;
    boss.aiState = 'phase_shift';
    boss.stateTimer = 42;
    const p2Name = bossDef.phases[1]?.name ?? 'PHASE 2';
    state.events.push({ type: 'boss_phase', bossId: boss.id, phase: 2 });
    state.events.push({
      type: 'callout',
      text: `${boss.name.toUpperCase()}: ${p2Name.toUpperCase()}!`,
      durationTicks: 100,
    });
    return true;
  }

  // Boss defeated!
  if (boss.hp <= 0) {
    boss.aiState = 'defeated';
    boss.stateTimer = 36;
    boss.vx = pushDir * 8;
    boss.vy = -10;
    state.events.push({ type: 'sfx', sfx: 'boss_defeat' });
    state.events.push({ type: 'rumble', strong: 1.0, weak: 0.7, durationMs: 320 });
    state.events.push({
      type: 'particle',
      kind: 'confetti',
      x: boss.x,
      y: boss.y - boss.height * 0.5,
      count: 24,
      color: '#ffd166',
    });
    state.events.push({
      type: 'callout',
      text: `KNOCKOUT! ${boss.name.toUpperCase()} TOPPLED!`,
      durationTicks: 120,
    });
    return true;
  }

  boss.aiState = 'hurt';
  boss.stateTimer = 24;
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

function pickNextAttack(state: SimState, boss: BossState, bossDef: BossDef): string {
  const phaseDef = bossDef.phases[Math.min(boss.phase - 1, bossDef.phases.length - 1)];
  const list = phaseDef.attacks;
  const attack = list[boss.attackIndex % list.length];
  boss.attackIndex += 1;
  return attack;
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
  const spd = phaseDef.speedMult;
  const player = state.player;

  // Defeated celebration countdown -> finalize rank ceremony
  if (boss.aiState === 'defeated') {
    boss.vy = Math.min(ENGINE_CONSTANTS.FREEFALL_VSP, boss.vy + ENGINE_CONSTANTS.GRAV);
    boss.vx *= 0.94;
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
    if (res.hitY) boss.vy = -boss.vy * 0.35;

    boss.stateTimer -= 1;
    if (boss.stateTimer <= 0 && !state.stageComplete) {
      finalizeStageRank(state);
    }
    return;
  }

  // Intro & Phase Shift sequences
  if (boss.aiState === 'intro' || boss.aiState === 'phase_shift') {
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

    boss.stateTimer -= 1;
    if (boss.stateTimer <= 0) {
      boss.aiState = 'idle';
      boss.stateTimer = boss.phase >= 2 ? 18 : 28;
    }
    return;
  }

  // Hurt recoil
  if (boss.aiState === 'hurt') {
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

    boss.stateTimer -= 1;
    if (boss.stateTimer <= 0) {
      boss.aiState = 'idle';
      boss.stateTimer = boss.phase >= 2 ? 20 : 32;
    }
    return;
  }

  // Vulnerable dizzy stun opening (open to melee/mach/grab/bodyslam!)
  if (boss.aiState === 'vulnerable') {
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

    boss.stateTimer -= 1;
    if (boss.stateTimer <= 0) {
      boss.aiState = 'idle';
      boss.stateTimer = boss.phase >= 2 ? 16 : 26;
    }
  } else if (boss.aiState === 'idle') {
    boss.facing = player.x >= boss.x ? 1 : -1;
    boss.vx = boss.facing * 1.4 * spd;
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
    if (boss.stateTimer <= 0) {
      boss.aiState = 'telegraph';
      boss.stateTimer = boss.phase >= 2 ? 16 : 24;
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
  } else if (boss.aiState === 'telegraph') {
    boss.facing = player.x >= boss.x ? 1 : -1;
    boss.vx = 0;
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
    if (boss.stateTimer <= 0) {
      launchBossAttack(state, boss, bossDef, spd);
    }
  } else if (boss.aiState === 'charge') {
    stepBossCharge(state, boss, spd);
  } else if (boss.aiState === 'jump_slam') {
    stepBossJumpSlam(state, boss, spd);
  } else if (boss.aiState === 'projectile') {
    stepBossProjectilePhase(state, boss, spd);
  }

  // Boss <-> Player collision check
  const pBox = getPlayerBox(player);
  const bLeft = boss.x - boss.width * 0.5;
  const bRight = boss.x + boss.width * 0.5;
  const bTop = boss.y - boss.height;
  const bBottom = boss.y;

  const overlaps =
    pBox.right > bLeft && pBox.left < bRight && pBox.bottom > bTop && pBox.top < bBottom;

  if (!overlaps) return;

  // 1. Player strikes a vulnerable boss!
  if (boss.aiState === 'vulnerable') {
    const canStrike = isPlayerAttackingBoss(state) || player.vy > 1 || Math.abs(player.vx) >= 4;
    if (canStrike) {
      const hit = damageBoss(state, 1, player.x);
      if (hit) {
        // Bouncy comic rebound away from boss
        player.vx = (player.x < boss.x ? -1 : 1) * 7.5;
        player.vy = -8.5;
        player.invulnTicks = Math.max(player.invulnTicks, 20);
      }
    }
    return;
  }

  // 2. Player Parries an incoming parryable boss attack!
  if (player.state === 'taunt' && player.parryTicks > 0 && boss.parryable) {
    triggerParrySuccess(state, boss.x);
    state.stageStats.parriesLanded += 1;
    boss.parryable = false;
    boss.vx = -boss.facing * 5.5;
    boss.vy = -6;
    damageBoss(state, 1, player.x);
    return;
  }

  // 3. Boss attack hurts player!
  const bossHazardous =
    boss.aiState === 'charge' ||
    boss.aiState === 'jump_slam' ||
    (boss.aiState === 'projectile' && boss.parryable);
  if (bossHazardous && player.invulnTicks <= 0 && player.hurtTicks <= 0) {
    hurtPlayer(state, boss.x, 1);
  }
}

function launchBossAttack(
  state: SimState,
  boss: BossState,
  bossDef: BossDef,
  spd: number,
): void {
  const atk = pickNextAttack(state, boss, bossDef);
  const player = state.player;
  boss.facing = player.x >= boss.x ? 1 : -1;

  // ---- BOSS 1: ARTISTE BELL SIGNATURE MOVESET ----
  if (boss.id === 'b_artiste') {
    if (atk === 'shoulder_charge') {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 10.5 * spd;
      boss.vy = 0;
      boss.stateTimer = 110;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'mach3' });
      return;
    }
    if (atk === 'bounce_slam') {
      boss.aiState = 'jump_slam';
      boss.vx = boss.facing * 6.4 * spd;
      boss.vy = -14.2;
      boss.stateTimer = boss.phase >= 2 ? 3 : 2; // remaining bounces!
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'jump' });
      return;
    }
    if (atk === 'statue_drop') {
      boss.aiState = 'projectile';
      boss.vx = 0;
      boss.stateTimer = 46;
      boss.parryable = false;
      const count = boss.phase >= 2 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 140 + nextInt(state.rngState, -24, 24);
        const dropX = Math.max(96, Math.min(state.room.widthTiles * T - 96, player.x + offset));
        spawnProjectile(state, {
          owner: 'boss',
          kind: 'statue',
          x: dropX,
          y: 68,
          vx: 0,
          vy: 1.5,
          radius: 16,
          damage: 1,
          parryable: true,
          reflected: false,
          gravity: true,
          ttlTicks: 150,
          color: '#e5e7eb',
        });
      }
      state.events.push({ type: 'sfx', sfx: 'block_marble' });
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
        vx: boss.facing * 8.5 * spd,
        vy: 0,
        radius: 16,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: false,
        ttlTicks: 160,
        color: '#cbd5e1',
      });
      state.events.push({ type: 'sfx', sfx: 'throw' });
      return;
    }
  }

  // ---- BOSS 2: SHERIFF CHEDDAR ----
  if (boss.id === 'b_cheddar') {
    if (atk === 'boot_dash') {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 9.5 * spd;
      boss.stateTimer = 95;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'mach2' });
      return;
    }
    if (atk === 'dynamite_toss') {
      boss.aiState = 'projectile';
      boss.stateTimer = 42;
      for (let i = 0; i < (boss.phase >= 2 ? 2 : 1); i++) {
        spawnProjectile(state, {
          owner: 'boss',
          kind: 'dynamite',
          x: boss.x + boss.facing * 24,
          y: boss.y - 34,
          vx: boss.facing * (5.5 + i * 2.2),
          vy: -8.5,
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
    // quick_draw / fan_hammer / flame_sweep
    boss.aiState = 'projectile';
    boss.stateTimer = 38;
    const shots = atk === 'fan_hammer' ? 3 : 1;
    for (let i = 0; i < shots; i++) {
      spawnProjectile(state, {
        owner: 'boss',
        kind: atk === 'flame_sweep' ? 'flame' : 'bullet',
        x: boss.x + boss.facing * 28,
        y: boss.y - 26 - i * 10,
        vx: boss.facing * (8.5 + i * 1.1) * spd,
        vy: 0,
        radius: 9,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: false,
        ttlTicks: 140,
        color: atk === 'flame_sweep' ? '#ff6b35' : '#ffd166',
      });
    }
    state.events.push({ type: 'sfx', sfx: 'revolver_shot' });
    return;
  }

  // ---- BOSS 3: THE STATIC / THE GLITCH ----
  if (boss.id === 'b_static') {
    if (atk === 'skate_blitz') {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 11.2 * spd;
      boss.stateTimer = 100;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'mach3' });
      return;
    }
    if (atk === 'spring_pogo' || atk === 'air_dive') {
      boss.aiState = 'jump_slam';
      boss.vx = boss.facing * 7.2 * spd;
      boss.vy = -13.5;
      boss.stateTimer = boss.phase >= 2 ? 3 : 2;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'wall_bounce' });
      return;
    }
    boss.aiState = 'projectile';
    boss.stateTimer = 36;
    for (let i = 0; i < 2; i++) {
      spawnProjectile(state, {
        owner: 'boss',
        kind: 'bomb',
        x: boss.x + boss.facing * 20,
        y: boss.y - 34,
        vx: boss.facing * (4.8 + i * 3.0),
        vy: -8.8,
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

  // ---- BOSS 4: DOPPEL-PEPPO ----
  if (boss.id === 'b_doppel') {
    if (atk === 'copy_dash' || atk === 'double_lunge') {
      boss.aiState = 'charge';
      boss.vx = boss.facing * 11.8 * spd;
      boss.stateTimer = 95;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'mach4' });
      return;
    }
    if (atk === 'super_slam') {
      boss.aiState = 'jump_slam';
      boss.vx = boss.facing * 6.8 * spd;
      boss.vy = -15.0;
      boss.stateTimer = 2;
      boss.parryable = true;
      state.events.push({ type: 'sfx', sfx: 'sjump_launch' });
      return;
    }
    boss.aiState = 'projectile';
    boss.stateTimer = 38;
    spawnProjectile(state, {
      owner: 'boss',
      kind: 'head_toss',
      x: boss.x + boss.facing * 24,
      y: boss.y - 40,
      vx: boss.facing * 7.2 * spd,
      vy: -5.5,
      radius: 13,
      damage: 1,
      parryable: true,
      reflected: false,
      gravity: true,
      ttlTicks: 140,
      color: '#f7d6bf',
    });
    state.events.push({ type: 'sfx', sfx: 'throw' });
    return;
  }

  // ---- BOSS 5: MEGA-CRUST & LORD DOUGH ----
  if (atk === 'swoop_charge' || atk === 'spring_charge') {
    boss.aiState = 'charge';
    boss.vx = boss.facing * 10.8 * spd;
    boss.stateTimer = 100;
    boss.parryable = true;
    state.events.push({ type: 'sfx', sfx: 'mach3' });
    return;
  }
  if (atk === 'hover_slam') {
    boss.aiState = 'jump_slam';
    boss.vx = boss.facing * 7.0 * spd;
    boss.vy = -14.8;
    boss.stateTimer = boss.phase >= 3 ? 3 : 2;
    boss.parryable = true;
    state.events.push({ type: 'sfx', sfx: 'jump' });
    return;
  }
  // cog_shower / tv_toss / final_barrage
  boss.aiState = 'projectile';
  boss.stateTimer = 42;
  const count = atk === 'final_barrage' ? 3 : 2;
  const pKind = atk === 'cog_shower' ? 'cog' : 'tv_toss';
  for (let i = 0; i < count; i++) {
    spawnProjectile(state, {
      owner: 'boss',
      kind: pKind,
      x: boss.x + boss.facing * 28,
      y: boss.y - 44,
      vx: boss.facing * (5.5 + i * 2.4) * spd,
      vy: -6.5 - i * 1.4,
      radius: 14,
      damage: 1,
      parryable: true,
      reflected: false,
      gravity: true,
      ttlTicks: 150,
      color: pKind === 'cog' ? '#94a3b8' : '#38bdf8',
    });
  }
  state.events.push({ type: 'sfx', sfx: 'throw' });
}

function stepBossCharge(state: SimState, boss: BossState, _spd: number): void {
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
    boss.stateTimer = boss.phase >= 2 ? 85 : 115;
    boss.vx = -boss.facing * 4.2;
    boss.vy = -7.2;
    state.shakeMag = Math.max(state.shakeMag, 9);
    state.shakeTimer = Math.max(state.shakeTimer, 18);
    state.events.push({ type: 'sfx', sfx: 'bodyslam_heavy' });
    state.events.push({ type: 'rumble', strong: 0.6, weak: 0.3, durationMs: 120 });
    state.events.push({
      type: 'particle',
      kind: 'slam_wave',
      x: boss.x,
      y: boss.y - 20,
      count: 8,
      color: '#f4a261',
    });
  }
}

function stepBossJumpSlam(state: SimState, boss: BossState, spd: number): void {
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
    state.events.push({ type: 'sfx', sfx: 'bodyslam_heavy' });
    state.events.push({
      type: 'particle',
      kind: 'slam_wave',
      x: boss.x,
      y: boss.y,
      count: 10,
      color: '#ffd166',
    });

    boss.stateTimer -= 1; // remaining bounces
    if (boss.stateTimer > 0) {
      boss.facing = state.player.x >= boss.x ? 1 : -1;
      boss.vx = boss.facing * 6.5 * spd;
      boss.vy = -13.2;
      boss.grounded = false;
    } else {
      boss.aiState = 'vulnerable';
      boss.parryable = false;
      boss.vx = 0;
      boss.vy = 0;
      boss.stateTimer = boss.phase >= 2 ? 75 : 100;
    }
  }
}

function stepBossProjectilePhase(state: SimState, boss: BossState, _spd: number): void {
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

  boss.stateTimer -= 1;
  if (boss.stateTimer <= 0) {
    // Brief vulnerable beat after projectile showcase so player can punish!
    boss.aiState = 'vulnerable';
    boss.stateTimer = boss.phase >= 2 ? 48 : 65;
  }
}
