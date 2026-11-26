// ============================================================================
// Krunked Tower — Gate B Headless Deterministic Soak Harness (`npm run verify:sim`)
// Steps all 23 stages + all 5 bosses across BOTH Chef Peppo & The Static,
// validates Escape/Lap 2/Mega-Crust/P-Rank, and proves FNV-1a replay determinism.
// ============================================================================

import {
  ENGINE_CONSTANTS,
  createNeutralInput,
  type BossId,
  type InputFrame,
  type PlayableCharacter,
  type SimState,
  type StageId,
} from '../../src/contracts/index';
import { BOSSES, STAGE_ORDER } from '../../src/data/index';
import { createInitialSimState, dispatchCommand, stepSim } from '../../src/sim/step';
import { hashSimState } from '../../src/sim/hash';
import { startEscape, triggerLap2 } from '../../src/sim/levelRuntime';
import { evaluatePRank, finalizeStageRank, registerKillCombo } from '../../src/sim/scoring';
import { spawnProjectile } from '../../src/sim/combat';

const TS = ENGINE_CONSTANTS.TILE_SIZE;
const CHARACTERS: PlayableCharacter[] = ['peppo', 'static'];
const BOSS_IDS = Object.keys(BOSSES) as BossId[];

function fail(message: string): never {
  console.error(`[GATE B FAIL] ${message}`);
  process.exit(1);
}

function assertFinite(val: number, label: string): void {
  if (!Number.isFinite(val)) {
    fail(`Non-finite numeric value (${String(val)}) at ${label}`);
  }
}

function assertInvariants(state: SimState, context: string): void {
  const p = state.player;
  assertFinite(p.x, `${context} player.x`);
  assertFinite(p.y, `${context} player.y`);
  assertFinite(p.vx, `${context} player.vx`);
  assertFinite(p.vy, `${context} player.vy`);
  assertFinite(p.movespeed, `${context} player.movespeed`);
  assertFinite(state.camera.x, `${context} camera.x`);
  assertFinite(state.camera.y, `${context} camera.y`);

  const maxX = state.room.widthTiles * TS + 64;
  const maxY = state.room.heightTiles * TS + 160;
  if (p.x < -64 || p.x > maxX || p.y < -128 || p.y > maxY) {
    fail(
      `Player out-of-bounds (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) outside room ${state.room.id} (${state.room.widthTiles}x${state.room.heightTiles}) at ${context}`,
    );
  }

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    assertFinite(e.x, `${context} enemy[${i}].x`);
    assertFinite(e.y, `${context} enemy[${i}].y`);
    assertFinite(e.vx, `${context} enemy[${i}].vx`);
    assertFinite(e.vy, `${context} enemy[${i}].vy`);
  }

  for (let i = 0; i < state.projectiles.length; i++) {
    const pr = state.projectiles[i];
    assertFinite(pr.x, `${context} proj[${i}].x`);
    assertFinite(pr.y, `${context} proj[${i}].y`);
    assertFinite(pr.vx, `${context} proj[${i}].vx`);
    assertFinite(pr.vy, `${context} proj[${i}].vy`);
  }

  if (state.boss) {
    assertFinite(state.boss.x, `${context} boss.x`);
    assertFinite(state.boss.y, `${context} boss.y`);
    assertFinite(state.boss.vx, `${context} boss.vx`);
    assertFinite(state.boss.vy, `${context} boss.vy`);
  }

  if (state.escape.megaCrustActive) {
    assertFinite(state.escape.megaCrustX, `${context} megaCrustX`);
    assertFinite(state.escape.megaCrustY, `${context} megaCrustY`);
    assertFinite(state.escape.megaCrustSpeed, `${context} megaCrustSpeed`);
  }
}

/**
 * Autonomous kinetic pilot driving Mach 1->4, jumps, grabs, wall actions,
 * bodyslams, taunts, and directional reversals across any stage or arena.
 */
function buildAutonomousPilotInput(state: SimState, tick: number): InputFrame {
  const inp = createNeutralInput('keyboard');
  const p = state.player;
  const roomW = state.room.widthTiles * TS;

  // Choose travel direction: reverse cleanly near edges or flip on periodic sweep
  let dir: -1 | 1 = (Math.floor(tick / 150) % 2 === 0 ? 1 : -1) as -1 | 1;
  if (state.boss && state.screen === 'boss') {
    dir = state.boss.x >= p.x ? 1 : -1;
  } else {
    if (p.x > roomW - 96) dir = -1;
    if (p.x < 96) dir = 1;
  }

  inp.moveX = dir;
  inp.machHeld = true;
  inp.machPressed = tick === 0;

  // Periodic jumps, grab dashes, rolls, slams, and taunts
  const phase = tick % 90;
  if (phase === 20 || phase === 55) {
    inp.jumpPressed = true;
    inp.jumpHeld = true;
  } else if ((phase > 20 && phase < 32) || (phase > 55 && phase < 65)) {
    inp.jumpHeld = true;
  }

  if (phase === 38) {
    inp.grabPressed = true;
    inp.grabHeld = true;
    inp.shootPressed = true;
  }

  if (phase >= 70 && phase <= 76) {
    inp.moveY = 1; // Mach Roll on ground / Bodyslam in air
  }

  if (phase === 84) {
    inp.tauntPressed = true;
  }

  // Interact with doors/props when close
  if (phase === 45) {
    inp.moveY = -1;
  }

  return inp;
}

function soakAllStages(): number {
  let totalTicks = 0;
  const TICKS_PER_STAGE = 240;

  for (const character of CHARACTERS) {
    for (let sIdx = 0; sIdx < STAGE_ORDER.length; sIdx++) {
      const stageId: StageId = STAGE_ORDER[sIdx];
      const state = createInitialSimState(1000 + sIdx * 31 + (character === 'static' ? 7 : 0), character);
      dispatchCommand(state, { type: 'enter_stage', stageId });

      for (let t = 0; t < TICKS_PER_STAGE; t++) {
        const inp = buildAutonomousPilotInput(state, t);
        stepSim(state, inp);
        totalTicks++;
        assertInvariants(state, `stage:${stageId}:${character}:t=${t}`);
        if (state.stageComplete || state.gameOver) break;
      }
    }
  }

  return totalTicks;
}

function soakAllBosses(): number {
  let totalTicks = 0;
  const TICKS_PER_BOSS = 300;

  for (const character of CHARACTERS) {
    for (let bIdx = 0; bIdx < BOSS_IDS.length; bIdx++) {
      const bossId = BOSS_IDS[bIdx];
      const state = createInitialSimState(2000 + bIdx * 17 + (character === 'static' ? 3 : 0), character);
      dispatchCommand(state, { type: 'enter_boss', bossId });

      for (let t = 0; t < TICKS_PER_BOSS; t++) {
        const inp = buildAutonomousPilotInput(state, t);
        stepSim(state, inp);
        totalTicks++;
        assertInvariants(state, `boss:${bossId}:${character}:t=${t}`);
        if (state.stageComplete || state.gameOver) break;
      }
    }
  }

  return totalTicks;
}

function verifyEscapeLap2MegaCrustAndPRank(): void {
  const state = createInitialSimState(4242, 'peppo');
  dispatchCommand(state, { type: 'enter_stage', stageId: 'entrance' });
  state.enemies = [];

  // Build combo + P-Rank collectibles
  registerKillCombo(state, 100);
  state.stageStats.score = state.stageStats.sRankTarget;
  state.stageStats.secretsFound = [true, true, true];
  state.stageStats.gerryFound = true;
  state.stageStats.treasureCollected = true;

  // Start Escape countdown
  startEscape(state);
  if (!state.escape.active || !state.escape.pillarBroken || state.escape.timerTicks <= 0) {
    fail('Escape failed to activate after Pillar Chronos smash');
  }
  const ticksBefore = state.escape.timerTicks;
  state.hitstopTicks = 0;
  stepSim(state, createNeutralInput('keyboard'));
  if (state.escape.timerTicks !== ticksBefore - 1) {
    fail(`Escape countdown did not decrement cleanly (${ticksBefore} -> ${state.escape.timerTicks})`);
  }

  // Trigger Lap 2
  const scoreBeforeLap2 = state.stageStats.score;
  triggerLap2(state);
  if (
    state.escape.lap !== 2 ||
    !state.stageStats.lap2Done ||
    state.stageStats.score !== scoreBeforeLap2 + ENGINE_CONSTANTS.LAP2_PTS ||
    state.player.comboTime !== ENGINE_CONSTANTS.COMBO_TIME_MAX
  ) {
    fail('Lap 2 portal failed bonus/refill/lap verification');
  }

  // Verify P-Rank evaluation BEFORE letting Mega-Crust kill us
  if (!evaluatePRank(state)) {
    fail('P-Rank evaluation returned false despite meeting every P-Rank requirement');
  }

  // Verify Mega-Crust spawn & acceleration on timer expiry on a cloned fresh run
  const mcState = createInitialSimState(4243, 'peppo');
  dispatchCommand(mcState, { type: 'enter_stage', stageId: 'entrance' });
  mcState.enemies = [];
  startEscape(mcState);
  mcState.hitstopTicks = 0;
  mcState.escape.timerTicks = 1;
  stepSim(mcState, createNeutralInput('keyboard'));
  if (!mcState.escape.megaCrustActive || mcState.escape.megaCrustSpeed !== ENGINE_CONSTANTS.MEGA_CRUST_BASE_SPEED) {
    fail('Mega-Crust failed to spawn at base speed 8 when escape timer reached 0');
  }
  for (let t = 0; t < 10; t++) {
    stepSim(mcState, createNeutralInput('keyboard'));
    assertInvariants(mcState, `megacrust:t=${t}`);
  }
  if (mcState.escape.megaCrustSpeed <= ENGINE_CONSTANTS.MEGA_CRUST_BASE_SPEED) {
    fail('Mega-Crust failed to accelerate during chase');
  }

  // Finalize P-Rank on primary state
  finalizeStageRank(state);
  if (state.stageStats.rank !== 'P' || !state.lastRankSummary?.pRank) {
    fail(`Expected finalized rank P, got ${state.stageStats.rank}`);
  }
}

function runReplayProof(character: PlayableCharacter, seed: number): string {
  const exec = (): string => {
    const state = createInitialSimState(seed, character);
    dispatchCommand(state, { type: 'enter_stage', stageId: 'entrance' });

    for (let t = 0; t < 600; t++) {
      if (t === 180) {
        state.player.facing = 1;
        spawnProjectile(state, {
          owner: 'enemy',
          kind: 'bullet',
          x: state.player.x + 18,
          y: state.player.y - 22,
          vx: -7,
          vy: 0,
          radius: 10,
          damage: 1,
          parryable: true,
          reflected: false,
          gravity: false,
          ttlTicks: 60,
          color: '#ff595e',
        });
      }
      if (t === 320) {
        dispatchCommand(state, { type: 'debug_trigger_escape' });
      }
      const inp = buildAutonomousPilotInput(state, t);
      if (t === 180) {
        inp.tauntPressed = true;
      }
      stepSim(state, inp);
      assertInvariants(state, `replay:${character}:t=${t}`);
    }
    return hashSimState(state);
  };

  const hashA = exec();
  const hashB = exec();
  if (hashA !== hashB || !/^[0-9a-f]{8}$/.test(hashA)) {
    fail(`Replay determinism mismatch for ${character}: ${hashA} !== ${hashB}`);
  }
  return hashA;
}

function main(): void {
  const startMs = Date.now();
  const stageTicks = soakAllStages();
  const bossTicks = soakAllBosses();
  verifyEscapeLap2MegaCrustAndPRank();
  const peppoHash = runReplayProof('peppo', 20260420);
  const staticHash = runReplayProof('static', 987654321);
  const elapsedMs = Date.now() - startMs;

  console.log('======================================================================');
  console.log(' KRUNKED TOWER — GATE B HEADLESS DETERMINISTIC SOAK PASSED');
  console.log('======================================================================');
  console.log(` Stages soaked : ${STAGE_ORDER.length} stages x 2 chars (${stageTicks} ticks)`);
  console.log(` Bosses soaked : ${BOSS_IDS.length} bosses x 2 chars (${bossTicks} ticks)`);
  console.log(' Lifecycle     : Escape countdown + Lap 2 + Mega-Crust + P-Rank OK');
  console.log(` Replay hash   : peppo=${peppoHash} | static=${staticHash} (FNV-1a matched)`);
  console.log(` Elapsed       : ${elapsedMs} ms (0 NaN/Inf, 0 OOB, 0 exceptions)`);
  console.log('======================================================================');
}

main();
