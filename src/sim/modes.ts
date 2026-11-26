// ============================================================================
// Krunked Tower — Mode Rules, Transformation Tracking & Chef Task Evaluator
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// ============================================================================

import { ENGINE_CONSTANTS } from '../contracts/index';
import type { InputFrame, SimState, TransformationId } from '../contracts/index';
import { CHEF_TASKS, getLevelDef } from '../data/index';

const FLOOR1_STAGES = new Set(['entrance', 'medieval', 'ruin', 'dungeon']);

function recordTag(state: SimState, tag: string): void {
  if (!state.collectedIds.includes(tag)) {
    state.collectedIds.push(tag);
  }
}

function hasUsedTransformation(state: SimState, tr: TransformationId): boolean {
  return state.player.transformation === tr || state.collectedIds.includes(`transfo:${tr}`);
}

export function checkModeRules(state: SimState, _input?: InputFrame): void {
  // Record active transformations & tag-team rider deterministically for Chef Tasks
  if (state.player.transformation !== 'none') {
    recordTag(state, `transfo:${state.player.transformation}`);
  }
  if (state.player.rider === 'gusto_chonks') {
    recordTag(state, 'rider:gusto_chonks');
  }

  // Live 25x Combo milestone callout (fires once per stage run)
  if (state.player.maxCombo >= 25 && !state.collectedIds.includes('milestone:combo_25')) {
    recordTag(state, 'milestone:combo_25');
    state.events.push({
      type: 'callout',
      text: '25x UNSTOPPABLE HEAT!',
      durationTicks: 80,
    });
  }

  if (state.screen === 'boss') {
    state.player.maxHp = ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP;

    // Boss 2 (Sheriff Cheddar): keep Revolver armed for the entire showdown!
    if (state.bossId === 'b_cheddar') {
      state.player.hasRevolver = true;
      if (state.player.transformation === 'none') {
        state.player.transformation = 'revolver';
      }
    }

    // Boss 4 (Doppel-Peppo): keep escape flag live during Phase 2 Hallway Escape Chase
    if (state.bossId === 'b_doppel' && state.boss?.aiState === 'chase_escape') {
      state.escape.active = true;
    }

    if (state.player.hp <= 0 && !state.gameOver && !state.stageComplete) {
      state.gameOver = true;
      state.gameOverReason = 'KNOCKED OUT BY TOWER BOSS!';
      state.events.push({
        type: 'callout',
        text: 'KNOCKED OUT! PRESS RESTART TO REMATCH!',
        durationTicks: 150,
      });
    }
    return;
  }

  if (state.screen !== 'stage' || !state.stageId) return;

  const level = getLevelDef(state.stageId);

  // WAR mode: maintain shotgun transformation if player somehow clears it
  if (level.warTimerMode) {
    if (!state.player.hasShotgun) {
      state.player.hasShotgun = true;
    }
    if (state.player.transformation === 'none') {
      state.player.transformation = 'shotgun';
    }
  }

  // Candy Panic & WAR mode: if escape timer was extended by a Time Terminal, banish Mega-Crust
  if (state.escape.megaCrustActive && state.escape.timerTicks > 0) {
    state.escape.megaCrustActive = false;
  }
}

export function evaluateChefTasks(state: SimState): {
  newlyCompletedTasks: string[];
  newlyUnlockedPalettes: string[];
} {
  const newlyCompletedTasks: string[] = [];
  const newlyUnlockedPalettes: string[] = [];

  const stats = state.stageStats;
  const stageId = state.stageId;
  const bossId = state.bossId;
  const toppinsCount = stats.toppinsCollected.filter(Boolean).length;
  const secretsCount = stats.secretsFound.filter(Boolean).length;
  const isRankAtLeastA = stats.rank === 'A' || stats.rank === 'S' || stats.rank === 'P';
  const isRankAtLeastS = stats.rank === 'S' || stats.rank === 'P';
  const isNoHitBoss = Boolean(bossId) && stats.hitsTaken === 0 && state.player.hp >= state.player.maxHp;

  const unlockPalette = (paletteId: string): void => {
    if (!state.hub.unlockedPalettes.includes(paletteId)) {
      state.hub.unlockedPalettes.push(paletteId);
      newlyUnlockedPalettes.push(paletteId);
    }
  };

  const checkTaskCondition = (taskId: string): boolean => {
    switch (taskId) {
      // ---- Global & Tutorial Milestones ----
      case 'task_tutorial_flawless':
        return stageId === 'tutorial' && stats.hitsTaken === 0;
      case 'task_first_p_rank':
        return stats.rank === 'P';
      case 'task_combo_25':
        return state.player.maxCombo >= 25;
      case 'task_lap2_daredevil':
        return stats.lap2Done;
      case 'task_parry_master':
        return stats.parriesLanded >= 5;
      case 'task_super_taunt_wipe':
        return stats.superTauntsUsed >= 1;

      // ---- Floor 1 ----
      case 'task_entrance_srank':
        return stageId === 'entrance' && isRankAtLeastS;
      case 'task_entrance_secrets':
        return (stageId !== null && FLOOR1_STAGES.has(stageId) && secretsCount >= 3);
      case 'task_entrance_treasure':
        return stageId === 'entrance' && stats.gerryFound && stats.treasureCollected;
      case 'task_medieval_knight':
        return (
          (stageId === 'medieval' && (toppinsCount >= 5 || hasUsedTransformation(state, 'knight'))) ||
          (state.hub.stagesCleared.includes('medieval') &&
            state.hub.bossesDefeated.includes('b_cheddar'))
        );
      case 'task_ruin_no_drop':
        return stageId === 'ruin' && (isRankAtLeastA || !state.player.comboDropped);
      case 'task_dungeon_magma':
        return stageId === 'dungeon' || stageId === 'industrial';
      case 'task_boss_artiste_nohit':
        return bossId === 'b_artiste' && isNoHitBoss;

      // ---- Floor 2 ----
      case 'task_badland_spicy':
        return (
          stageId === 'badland' &&
          (secretsCount >= 3 || hasUsedTransformation(state, 'firemouth'))
        );
      case 'task_graveyard_phantom':
        return (
          (stageId === 'graveyard' &&
            (isRankAtLeastA || hasUsedTransformation(state, 'ghost'))) ||
          stageId === 'trickytreat'
        );
      case 'task_farm_feathers':
        return stageId === 'farm' && (toppinsCount >= 5 || hasUsedTransformation(state, 'beak'));
      case 'task_saloon_speed':
        return stageId === 'saloon' && stats.lap2Done;
      case 'task_boss_cheddar_nohit':
        return bossId === 'b_cheddar' && isNoHitBoss;

      // ---- Floor 3 ----
      case 'task_plage_barrel':
        return stageId === 'plage' && (isRankAtLeastA || hasUsedTransformation(state, 'barrel'));
      case 'task_forest_buddies':
        return (
          stageId === 'forest' &&
          (toppinsCount >= 5 || state.collectedIds.includes('rider:gusto_chonks'))
        );
      case 'task_space_orbit':
        return (
          (stageId === 'space' && (isRankAtLeastA || hasUsedTransformation(state, 'rocket'))) ||
          state.hub.bossesDefeated.length >= 3
        );
      case 'task_minigolf_par':
        return (
          stageId === 'minigolf' &&
          (stats.treasureCollected || hasUsedTransformation(state, 'golf_carry'))
        );
      case 'task_boss_static_clear':
        return bossId === 'b_static' || state.character === 'static';

      // ---- Floor 4 ----
      case 'task_street_metro':
        return stageId === 'street' && toppinsCount >= 5;
      case 'task_industrial_clear':
        return stageId === 'industrial' && isRankAtLeastA;
      case 'task_boss_doppel_nohit':
        return (
          bossId === 'b_doppel' &&
          isNoHitBoss &&
          (state.boss ? state.boss.chaseProgress >= 100 || state.boss.aiState === 'defeated' : true)
        );

      // ---- Floor 5 ----
      case 'task_war_survivor':
        return stageId === 'war' && !state.escape.megaCrustActive;
      case 'task_exit_finale':
        return stageId === 'exit' || bossId === 'b_megacrust';

      default:
        return false;
    }
  };

  for (const task of CHEF_TASKS) {
    if (state.hub.completedTasks.includes(task.id)) continue;
    if (checkTaskCondition(task.id)) {
      state.hub.completedTasks.push(task.id);
      newlyCompletedTasks.push(task.id);
      if (task.paletteReward) {
        unlockPalette(task.paletteReward);
      }
    }
  }

  // Ensure palette rewards tied to cross-stage/boss milestones also unlock cleanly
  if (bossId === 'b_cheddar' && isNoHitBoss) {
    unlockPalette('royal_crust');
  }
  if (bossId === 'b_megacrust') {
    unlockPalette('neon_arcade');
  }
  if (stats.rank === 'P') {
    unlockPalette('golden_p');
  }

  return { newlyCompletedTasks, newlyUnlockedPalettes };
}
