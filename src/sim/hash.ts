// ============================================================================
// Krunked Tower — Deterministic SimState Hash (FNV-1a 32-bit)
// Pure simulation module — produces an 8-character lowercase hex digest.
// ============================================================================

import type { SimState } from '../contracts/index';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnvByte(h: number, b: number): number {
  return Math.imul((h ^ (b & 0xff)) >>> 0, FNV_PRIME) >>> 0;
}

function mixU32(h: number, v: number): number {
  const u = v >>> 0;
  h = fnvByte(h, u & 0xff);
  h = fnvByte(h, (u >>> 8) & 0xff);
  h = fnvByte(h, (u >>> 16) & 0xff);
  h = fnvByte(h, (u >>> 24) & 0xff);
  return h;
}

function mixFloat(h: number, v: number): number {
  if (!Number.isFinite(v)) {
    return mixU32(h, 0x7fffffff);
  }
  // Quantize to 1/1000th pixel so -0/+0 normalize identically while keeping precision
  const q = Math.round(v * 1000) | 0;
  return mixU32(h, q);
}

function mixBool(h: number, b: boolean): number {
  return fnvByte(h, b ? 1 : 0);
}

function mixStr(h: number, s: string | null | undefined): number {
  if (!s) {
    return fnvByte(h, 0);
  }
  h = mixU32(h, s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    h = fnvByte(h, code & 0xff);
    if (code > 0xff) {
      h = fnvByte(h, (code >>> 8) & 0xff);
    }
  }
  return h;
}

/**
 * Compute a deterministic 8-character hex FNV-1a 32-bit digest of the simulation state.
 */
export function hashSimState(state: SimState): string {
  let h = FNV_OFFSET_BASIS;

  // Core clock, RNG, routing & meta
  h = mixU32(h, state.tick);
  h = mixU32(h, state.rngState[0]);
  h = mixU32(h, state.rngState[1]);
  h = mixU32(h, state.rngState[2]);
  h = mixU32(h, state.rngState[3]);
  h = mixU32(h, state.hitstopTicks);
  h = mixStr(h, state.screen);
  h = mixStr(h, state.character);
  h = mixStr(h, state.paletteId);
  h = mixU32(h, state.floor);
  h = mixStr(h, state.stageId);
  h = mixStr(h, state.bossId);
  h = mixU32(h, state.roomIndex);
  h = mixBool(h, state.paused);
  h = mixBool(h, state.stageComplete);
  h = mixBool(h, state.gameOver);

  // Player state
  const p = state.player;
  h = mixFloat(h, p.x);
  h = mixFloat(h, p.y);
  h = mixFloat(h, p.vx);
  h = mixFloat(h, p.vy);
  h = mixU32(h, p.facing);
  h = mixStr(h, p.state);
  h = mixStr(h, p.transformation);
  h = mixStr(h, p.rider);
  h = mixFloat(h, p.movespeed);
  h = mixFloat(h, p.wallspeed);
  h = mixU32(h, p.coyoteTicks);
  h = mixU32(h, p.jumpBufferTicks);
  h = mixU32(h, p.stopBufferTicks);
  h = mixU32(h, p.slopeBufferTicks);
  h = mixU32(h, p.slapBufferTicks);
  h = mixBool(h, p.jumpStop);
  h = mixBool(h, p.grounded);
  h = mixBool(h, p.onSlope);
  h = mixU32(h, p.slopeDir);
  h = mixBool(h, p.onWall);
  h = mixU32(h, p.wallDir);
  h = mixBool(h, p.crouch);
  h = mixU32(h, p.freefallSmash);
  h = mixU32(h, p.grabDashTicks);
  h = mixU32(h, p.tauntTimer);
  h = mixU32(h, p.tauntPose);
  h = mixU32(h, p.parryTicks);
  h = mixU32(h, p.hurtTicks);
  h = mixU32(h, p.invulnTicks);
  h = mixU32(h, p.superchargeKills);
  h = mixBool(h, p.superTauntReady);
  h = mixU32(h, p.grabbedEnemyId ?? -1);
  h = mixU32(h, p.hp);
  h = mixU32(h, p.maxHp);
  h = mixU32(h, p.transformTimer);
  h = mixU32(h, p.ammoCooldown);
  h = mixU32(h, p.airJumpsLeft);
  h = mixU32(h, p.combo);
  h = mixFloat(h, p.comboTime);
  h = mixU32(h, p.comboScore);
  h = mixBool(h, p.comboStarted);
  h = mixBool(h, p.comboDropped);
  h = mixU32(h, p.maxCombo);
  h = mixU32(h, p.escapeTauntsUsed);
  h = mixBool(h, p.hasRevolver);
  h = mixBool(h, p.hasShotgun);

  // Enemies
  h = mixU32(h, state.enemies.length);
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    h = mixU32(h, e.id);
    h = mixStr(h, e.archetype);
    h = mixFloat(h, e.x);
    h = mixFloat(h, e.y);
    h = mixFloat(h, e.vx);
    h = mixFloat(h, e.vy);
    h = mixU32(h, e.facing);
    h = mixU32(h, e.hp);
    h = mixBool(h, e.alive);
    h = mixU32(h, e.stunTicks);
    h = mixBool(h, e.scared);
    h = mixBool(h, e.grabbed);
    h = mixBool(h, e.thrown);
  }

  // Projectiles
  h = mixU32(h, state.projectiles.length);
  for (let i = 0; i < state.projectiles.length; i++) {
    const pr = state.projectiles[i];
    h = mixU32(h, pr.id);
    h = mixStr(h, pr.owner);
    h = mixStr(h, pr.kind);
    h = mixFloat(h, pr.x);
    h = mixFloat(h, pr.y);
    h = mixFloat(h, pr.vx);
    h = mixFloat(h, pr.vy);
    h = mixBool(h, pr.reflected);
    h = mixU32(h, pr.ttlTicks);
  }

  // Boss
  if (state.boss) {
    const b = state.boss;
    h = fnvByte(h, 1);
    h = mixStr(h, b.id);
    h = mixFloat(h, b.x);
    h = mixFloat(h, b.y);
    h = mixFloat(h, b.vx);
    h = mixFloat(h, b.vy);
    h = mixU32(h, b.facing);
    h = mixU32(h, b.hp);
    h = mixU32(h, b.maxHp);
    h = mixU32(h, b.phase);
    h = mixStr(h, b.aiState);
    h = mixU32(h, b.stateTimer);
    h = mixU32(h, b.invulnTicks);
    h = mixBool(h, b.parryable);
    h = mixFloat(h, b.chaseProgress);
  } else {
    h = fnvByte(h, 0);
  }

  // Pickups
  h = mixU32(h, state.pickups.length);
  for (let i = 0; i < state.pickups.length; i++) {
    const pk = state.pickups[i];
    h = mixU32(h, pk.id);
    h = mixStr(h, pk.kind);
    h = mixBool(h, pk.collected);
  }

  // Props
  h = mixU32(h, state.props.length);
  for (let i = 0; i < state.props.length; i++) {
    const pr = state.props[i];
    h = mixU32(h, pr.id);
    h = mixStr(h, pr.kind);
    h = mixBool(h, pr.active);
    h = mixBool(h, pr.triggered);
    h = mixFloat(h, pr.x);
    h = mixFloat(h, pr.y);
    h = mixU32(h, pr.timerTicks ?? 0);
    h = mixU32(h, pr.strokes ?? 0);
  }

  // Escape state
  const esc = state.escape;
  h = mixBool(h, esc.active);
  h = mixU32(h, esc.timerTicks);
  h = mixU32(h, esc.lap);
  h = mixBool(h, esc.megaCrustActive);
  h = mixFloat(h, esc.megaCrustX);
  h = mixFloat(h, esc.megaCrustY);
  h = mixFloat(h, esc.megaCrustSpeed);
  h = mixBool(h, esc.pillarBroken);
  h = mixBool(h, esc.warMode);
  h = mixU32(h, esc.terminalsHit);

  // Stage run stats
  const st = state.stageStats;
  h = mixU32(h, st.score);
  for (let i = 0; i < 5; i++) {
    h = mixBool(h, st.toppinsCollected[i]);
  }
  for (let i = 0; i < 3; i++) {
    h = mixBool(h, st.secretsFound[i]);
  }
  h = mixBool(h, st.gerryFound);
  h = mixBool(h, st.treasureCollected);
  h = mixBool(h, st.lap2Done);
  h = mixU32(h, st.hitsTaken);
  h = mixU32(h, st.enemiesDefeated);
  h = mixU32(h, st.parriesLanded);
  h = mixU32(h, st.superTauntsUsed);
  h = mixU32(h, st.elapsedTicks);
  h = mixStr(h, st.rank);
  h = mixBool(h, st.pRankEligible);

  // Room state & brokenMask
  const r = state.room;
  h = mixStr(h, r.id);
  h = mixU32(h, r.widthTiles);
  h = mixU32(h, r.heightTiles);
  h = mixU32(h, r.outletGateTimer);
  h = mixU32(h, r.alarmActiveTicks);
  const mask = r.brokenMask;
  h = mixU32(h, mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      h = mixU32(h, i);
    }
  }

  return (h >>> 0).toString(16).padStart(8, '0');
}
