// ============================================================================
// Krunked Tower — Deterministic Scoring, Combo Drain & Rank System
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// ============================================================================

import { ENGINE_CONSTANTS } from '../contracts/index';
import type { BossId, RankGrade, SimState, StageId } from '../contracts/index';
import { getBossDef, getLevelDef } from '../data/index';
import { evaluateChefTasks } from './modes';

const RANK_ORDER: Record<RankGrade, number> = {
  D: 0,
  C: 1,
  B: 2,
  A: 3,
  S: 4,
  P: 5,
};

export function computeRank(
  score: number,
  sRankTarget: number,
  pRankEligible = false,
): RankGrade {
  const target = Math.max(1, sRankTarget);
  if (pRankEligible && score >= target) return 'P';
  if (score >= target) return 'S';
  if (score >= target * 0.75) return 'A';
  if (score >= target * 0.5) return 'B';
  if (score >= target * 0.25) return 'C';
  return 'D';
}

export function evaluatePRank(state: SimState): boolean {
  if (state.bossId) {
    return state.stageStats.hitsTaken === 0 && state.player.hp >= state.player.maxHp;
  }
  if (!state.stageId) return false;
  const level = getLevelDef(state.stageId);
  if (state.stageStats.score < state.stageStats.sRankTarget) return false;

  if (level.hasPillar && level.hasLap2) {
    const allSecrets = state.stageStats.secretsFound.every(Boolean);
    const hasTreasure = state.stageStats.treasureCollected;
    const didLap2 = state.stageStats.lap2Done;
    const unbrokenCombo =
      state.player.comboStarted && !state.player.comboDropped && state.player.combo > 0;
    return allSecrets && hasTreasure && didLap2 && unbrokenCombo;
  }

  // Tutorial, Crumbling Spire, Secret Gauntlet, Candy Panic
  return state.stageStats.hitsTaken === 0 && !state.player.comboDropped;
}

export function addScore(
  state: SimState,
  delta: number,
  popupX?: number,
  popupY?: number,
): void {
  const rounded = Math.round(delta);
  state.stageStats.score = Math.max(0, state.stageStats.score + rounded);
  state.stageStats.pRankEligible = evaluatePRank(state);
  state.stageStats.rank = computeRank(
    state.stageStats.score,
    state.stageStats.sRankTarget,
    state.stageStats.pRankEligible,
  );

  if (popupX !== undefined && popupY !== undefined && rounded !== 0) {
    state.events.push({
      type: 'particle',
      kind: 'score_pop',
      x: popupX,
      y: popupY,
      vy: -1.4,
      color: rounded > 0 ? '#ffd166' : '#ef476f',
      text: rounded > 0 ? `+${rounded}` : `${rounded}`,
    });
  }
}

export function refillCombo(state: SimState, amount?: number): void {
  if (state.player.combo <= 0) return;
  if (amount === undefined) {
    state.player.comboTime = ENGINE_CONSTANTS.COMBO_TIME_MAX;
  } else {
    state.player.comboTime = Math.min(
      ENGINE_CONSTANTS.COMBO_TIME_MAX,
      state.player.comboTime + amount,
    );
  }
}

export function registerKillCombo(
  state: SimState,
  baseScore = 100,
  popupX?: number,
  popupY?: number,
): void {
  const p = state.player;
  p.combo += 1;
  p.comboStarted = true;
  p.comboTime = ENGINE_CONSTANTS.COMBO_TIME_MAX;
  if (p.combo > p.maxCombo) {
    p.maxCombo = p.combo;
  }
  p.comboScore = Math.floor((p.combo * p.combo) / 4) + p.combo * 10;

  state.stageStats.enemiesDefeated += 1;
  p.superchargeKills += 1;
  if (p.superchargeKills >= ENGINE_CONSTANTS.SUPER_TAUNT_KILLS && !p.superTauntReady) {
    p.superTauntReady = true;
    state.tv.calloutText = 'SUPER TAUNT READY!';
    state.tv.calloutTimer = 90;
    state.events.push({ type: 'callout', text: 'SUPER TAUNT READY!', durationTicks: 90 });
  }

  state.tv.comboBounce = 14;
  addScore(state, baseScore, popupX ?? p.x, (popupY ?? p.y) - 34);
  state.events.push({
    type: 'particle',
    kind: 'combo_pop',
    x: popupX ?? p.x,
    y: (popupY ?? p.y) - 52,
    vy: -1.2,
    color: p.combo >= 20 ? '#ff006e' : '#ffbe0b',
    text: `${p.combo}x`,
  });
}

export function stepCombo(state: SimState): void {
  if (state.tv.comboBounce > 0) {
    state.tv.comboBounce -= 1;
  }
  if (state.screen !== 'stage') return;

  const p = state.player;
  if (p.combo > 0) {
    p.comboTime -= ENGINE_CONSTANTS.COMBO_DRAIN_PER_TICK;
    if (p.comboTime <= 0) {
      const cashIn = Math.floor((p.combo * p.combo) / 4) + p.combo * 10;
      p.combo = 0;
      p.comboTime = 0;
      p.comboScore = 0;
      p.comboDropped = true;
      addScore(state, cashIn, p.x, p.y - 54);
      state.events.push({ type: 'sfx', sfx: 'combo_drop' });
    }
  }

  state.stageStats.pRankEligible = evaluatePRank(state);
  state.stageStats.rank = computeRank(
    state.stageStats.score,
    state.stageStats.sRankTarget,
    state.stageStats.pRankEligible,
  );
}

function computeBossRank(hitsTaken: number): RankGrade {
  if (hitsTaken === 0) return 'P';
  if (hitsTaken === 1) return 'S';
  if (hitsTaken === 2) return 'A';
  if (hitsTaken === 3) return 'B';
  if (hitsTaken === 4) return 'C';
  return 'D';
}

export function finalizeStageRank(state: SimState, forcedRank?: RankGrade): void {
  // Cash in any active combo bonus WITHOUT dropping P-Rank eligibility!
  const p = state.player;
  if (p.combo > 0) {
    const cashIn = Math.floor((p.combo * p.combo) / 4) + p.combo * 10;
    state.stageStats.score = Math.max(0, state.stageStats.score + cashIn);
  }

  let id: StageId | BossId = 'entrance';
  let name = 'Stage';
  let rank: RankGrade = 'D';
  let pRank = false;
  let cashEarned = 0;

  if (state.bossId) {
    id = state.bossId;
    const bossDef = getBossDef(state.bossId);
    name =
      state.character === 'static' && bossDef.staticName ? bossDef.staticName : bossDef.name;
    rank = forcedRank ?? computeBossRank(state.stageStats.hitsTaken);
    pRank = rank === 'P';

    if (!state.hub.bossesDefeated.includes(state.bossId)) {
      state.hub.bossesDefeated.push(state.bossId);
      cashEarned = 50;
      state.hub.cash += cashEarned;
    }
    if (bossDef.floor < 5 && state.hub.floor <= bossDef.floor) {
      state.hub.floor = (bossDef.floor + 1) as typeof state.hub.floor;
      state.floor = state.hub.floor;
    }
  } else if (state.stageId) {
    id = state.stageId;
    const levelDef = getLevelDef(state.stageId);
    name = levelDef.name;
    if (forcedRank) {
      rank = forcedRank;
      pRank = forcedRank === 'P';
    } else {
      pRank = evaluatePRank(state);
      rank = computeRank(state.stageStats.score, state.stageStats.sRankTarget, pRank);
    }

    if (!state.hub.stagesCleared.includes(state.stageId)) {
      state.hub.stagesCleared.push(state.stageId);
    }

    // Persist newly rescued Toppins & summarize cash earned
    const prevToppins = state.hub.toppinsByStage[state.stageId] ?? [
      false,
      false,
      false,
      false,
      false,
    ];
    const nextToppins = [...prevToppins];
    for (let i = 0; i < 5; i++) {
      if (state.stageStats.toppinsCollected[i]) {
        cashEarned += ENGINE_CONSTANTS.TOPPIN_PAL_CASH;
        nextToppins[i] = true;
      }
    }
    state.hub.toppinsByStage[state.stageId] = nextToppins;
  }

  state.stageStats.rank = rank;
  state.stageStats.pRankEligible = pRank;

  const prevBestRank = state.hub.stageBestRanks[id];
  if (!prevBestRank || RANK_ORDER[rank] > RANK_ORDER[prevBestRank]) {
    state.hub.stageBestRanks[id] = rank;
  }
  const prevBestScore = state.hub.stageBestScores[id] ?? 0;
  if (state.stageStats.score > prevBestScore) {
    state.hub.stageBestScores[id] = state.stageStats.score;
  }

  const { newlyCompletedTasks, newlyUnlockedPalettes } = evaluateChefTasks(state);

  const toppinsCount = state.stageStats.toppinsCollected.filter(Boolean).length;
  const secretsCount = state.stageStats.secretsFound.filter(Boolean).length;

  state.lastRankSummary = {
    id,
    name,
    rank,
    score: state.stageStats.score,
    sRankTarget: state.stageStats.sRankTarget,
    pRank,
    toppinsCount,
    secretsCount,
    treasureCollected: state.stageStats.treasureCollected,
    lap2Done: state.stageStats.lap2Done,
    maxCombo: state.player.maxCombo,
    elapsedTicks: state.stageStats.elapsedTicks,
    cashEarned,
    newlyUnlockedPalettes,
    newlyCompletedTasks,
  };

  state.stageComplete = true;
  state.escape.active = false;
  state.escape.megaCrustActive = false;
  state.player.state = 'victory_pose';
  state.player.vx = 0;
  state.player.vy = 0;

  const isGrandVictory =
    state.stageId === 'exit' ||
    (state.bossId === 'b_megacrust' && state.hub.stagesCleared.includes('exit'));
  state.screen = isGrandVictory ? 'victory' : 'rank';

  state.events.push({
    type: 'rank_achieved',
    id,
    rank,
    score: state.stageStats.score,
    pRank,
  });
  state.events.push({
    type: 'music',
    track: RANK_ORDER[rank] >= RANK_ORDER.A ? 'rank_high' : 'rank_low',
    forceRestart: true,
  });
  state.events.push({ type: 'save_dirty' });
}
