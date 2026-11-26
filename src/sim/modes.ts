// ============================================================================
// Krunked Tower — Mode Rules & Chef Task Evaluator
// STRICTLY PURE — ZERO browser globals or non-deterministic RNG.
// ============================================================================

import { ENGINE_CONSTANTS } from '../contracts/index';
import type { InputFrame, SimState } from '../contracts/index';
import { CHEF_TASKS, getLevelDef } from '../data/index';

export function checkModeRules(state: SimState, _input?: InputFrame): void {
  if (state.screen === 'boss') {
    state.player.maxHp = ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP;
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

  // Decrement timed outlet gates (Fast-Food Saloon) & alarm sensors (Don't Wake The Bots)
  if (state.room.outletGateTimer > 0) {
    state.room.outletGateTimer -= 1;
  }
  if (state.room.alarmActiveTicks > 0) {
    state.room.alarmActiveTicks -= 1;
  }

  // WAR mode: maintain shotgun transformation if player somehow clears it
  if (level.warTimerMode && !state.player.hasShotgun) {
    state.player.hasShotgun = true;
  }

  // Candy Panic & WAR mode: if escape timer was cleared by a Time Terminal, banish Mega-Crust
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

  const checkTaskCondition = (taskId: string): boolean => {
    switch (taskId) {
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

      // Floor 1
      case 'task_entrance_srank':
        return stageId === 'entrance' && isRankAtLeastS;
      case 'task_entrance_secrets':
        return stageId === 'entrance' && secretsCount >= 3;
      case 'task_entrance_treasure':
        return stageId === 'entrance' && stats.gerryFound && stats.treasureCollected;
      case 'task_medieval_knight':
        return stageId === 'medieval' && toppinsCount >= 5;
      case 'task_ruin_no_drop':
        return stageId === 'ruin' && isRankAtLeastA;
      case 'task_dungeon_magma':
        return stageId === 'dungeon';
      case 'task_boss_artiste_nohit':
        return bossId === 'b_artiste' && stats.hitsTaken === 0;

      // Floor 2
      case 'task_badland_spicy':
        return stageId === 'badland' && secretsCount >= 3;
      case 'task_graveyard_phantom':
        return (stageId === 'graveyard' && isRankAtLeastA) || stageId === 'trickytreat';
      case 'task_farm_feathers':
        return stageId === 'farm' && toppinsCount >= 5;
      case 'task_saloon_speed':
        return stageId === 'saloon' && stats.lap2Done;
      case 'task_boss_cheddar_nohit':
        return bossId === 'b_cheddar' && stats.hitsTaken === 0;

      // Floor 3
      case 'task_plage_barrel':
        return stageId === 'plage' && isRankAtLeastA;
      case 'task_forest_buddies':
        return stageId === 'forest' && toppinsCount >= 5;
      case 'task_space_orbit':
        return (
          (stageId === 'space' && isRankAtLeastA) || state.hub.bossesDefeated.length >= 3
        );
      case 'task_minigolf_par':
        return stageId === 'minigolf' && stats.treasureCollected;
      case 'task_boss_static_clear':
        return bossId === 'b_static' || state.character === 'static';

      // Floor 4
      case 'task_street_metro':
        return stageId === 'street' && toppinsCount >= 5;
      case 'task_industrial_clear':
        return stageId === 'industrial' && isRankAtLeastA;
      case 'task_boss_doppel_nohit':
        return bossId === 'b_doppel';

      // Floor 5
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
      if (
        task.paletteReward &&
        !state.hub.unlockedPalettes.includes(task.paletteReward)
      ) {
        state.hub.unlockedPalettes.push(task.paletteReward);
        newlyUnlockedPalettes.push(task.paletteReward);
      }
    }
  }

  return { newlyCompletedTasks, newlyUnlockedPalettes };
}
