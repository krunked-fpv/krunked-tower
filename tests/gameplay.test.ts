import { describe, expect, it } from 'vitest';
import {
  ENGINE_CONSTANTS,
  TileType,
  createNeutralInput,
  type BossId,
  type FloorId,
} from '../src/contracts/index';
import { BOSSES, HUB_ROOMS, LEVELS, STAGE_ORDER } from '../src/data/index';
import { createInitialSimState, dispatchCommand, stepSim } from '../src/sim/step';
import {
  computeRank,
  evaluatePRank,
  finalizeStageRank,
  refillCombo,
  registerKillCombo,
} from '../src/sim/scoring';
import { getTileAt, isSolidTile } from '../src/sim/collision';
import { parseRoomDef, startEscape, triggerLap2 } from '../src/sim/levelRuntime';
import { damageBoss } from '../src/sim/bosses';
import { hurtPlayer } from '../src/sim/player';
import { SaveManager, validateSaveData } from '../src/app/SaveManager';

const TS = ENGINE_CONSTANTS.TILE_SIZE;

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('Combo Gauge, Rank Grades & P-Rank Eligibility', () => {
  it('drains combo gauge at -0.15/tick from 60 max, refills on kills, and pays out score on drop', () => {
    const state = createInitialSimState(42, 'peppo');
    dispatchCommand(state, { type: 'enter_stage', stageId: 'entrance' });
    state.enemies = []; // isolate combo drain math

    registerKillCombo(state, 100);
    expect(state.player.combo).toBe(1);
    expect(state.player.comboTime).toBe(ENGINE_CONSTANTS.COMBO_TIME_MAX);
    expect(state.player.comboStarted).toBe(true);
    expect(state.player.comboDropped).toBe(false);

    // 10 ticks drain => 60 - 10 * 0.15 = 58.5
    const neutral = createNeutralInput('keyboard');
    for (let t = 0; t < 10; t++) {
      stepSim(state, neutral);
    }
    expect(state.player.comboTime).toBeCloseTo(58.5, 5);

    // Refill clamps at 60
    refillCombo(state, 20);
    expect(state.player.comboTime).toBe(ENGINE_CONSTANTS.COMBO_TIME_MAX);

    // Build 4x combo (payout formula: floor(4*4/4) + 4*10 = 44)
    registerKillCombo(state, 100);
    registerKillCombo(state, 100);
    registerKillCombo(state, 100);
    expect(state.player.combo).toBe(4);
    const scoreBeforeDrop = state.stageStats.score;

    // Drain 400 ticks (60 / 0.15) to trigger exact combo drop
    let sawDropSfx = false;
    for (let t = 0; t < 405; t++) {
      const evs = stepSim(state, neutral);
      if (evs.some((e) => e.type === 'sfx' && e.sfx === 'combo_drop')) {
        sawDropSfx = true;
      }
      if (state.player.comboDropped) break;
    }

    expect(state.player.combo).toBe(0);
    expect(state.player.comboTime).toBe(0);
    expect(state.player.comboDropped).toBe(true);
    expect(sawDropSfx).toBe(true);
    expect(state.stageStats.score).toBe(scoreBeforeDrop + 44);
  });

  it('computes exact D / C / B / A / S / P grade boundaries and enforces all P-Rank criteria', () => {
    const sTarget = 16000;
    expect(computeRank(0, sTarget, false)).toBe('D');
    expect(computeRank(3999, sTarget, false)).toBe('D');
    expect(computeRank(4000, sTarget, false)).toBe('C');
    expect(computeRank(7999, sTarget, false)).toBe('C');
    expect(computeRank(8000, sTarget, false)).toBe('B');
    expect(computeRank(11999, sTarget, false)).toBe('B');
    expect(computeRank(12000, sTarget, false)).toBe('A');
    expect(computeRank(15999, sTarget, true)).toBe('A');
    expect(computeRank(16000, sTarget, false)).toBe('S');
    expect(computeRank(16000, sTarget, true)).toBe('P');

    // Full standard stage P-Rank validation on Gutter Crypt ('entrance')
    const state = createInitialSimState(99, 'peppo');
    dispatchCommand(state, { type: 'enter_stage', stageId: 'entrance' });
    state.stageStats.score = state.stageStats.sRankTarget;
    state.stageStats.secretsFound = [true, true, true];
    state.stageStats.gerryFound = true;
    state.stageStats.treasureCollected = true;
    state.stageStats.lap2Done = true;
    registerKillCombo(state, 100);

    expect(evaluatePRank(state)).toBe(true);

    // Missing any single requirement disqualifies P-Rank
    state.stageStats.secretsFound[2] = false;
    expect(evaluatePRank(state)).toBe(false);
    state.stageStats.secretsFound[2] = true;

    state.stageStats.treasureCollected = false;
    expect(evaluatePRank(state)).toBe(false);
    state.stageStats.treasureCollected = true;

    state.stageStats.lap2Done = false;
    expect(evaluatePRank(state)).toBe(false);
    state.stageStats.lap2Done = true;

    state.player.comboDropped = true;
    expect(evaluatePRank(state)).toBe(false);
    state.player.comboDropped = false;

    state.stageStats.score = state.stageStats.sRankTarget - 1;
    expect(evaluatePRank(state)).toBe(false);
    state.stageStats.score = state.stageStats.sRankTarget;

    finalizeStageRank(state);
    expect(state.stageStats.rank).toBe('P');
    expect(state.lastRankSummary?.pRank).toBe(true);

    // Boss P-Rank requires 0 hits taken
    const bossPerfect = createInitialSimState(100, 'peppo');
    dispatchCommand(bossPerfect, { type: 'enter_boss', bossId: 'b_artiste' });
    expect(evaluatePRank(bossPerfect)).toBe(true);
    finalizeStageRank(bossPerfect);
    expect(bossPerfect.stageStats.rank).toBe('P');

    const bossHit = createInitialSimState(101, 'peppo');
    dispatchCommand(bossHit, { type: 'enter_boss', bossId: 'b_artiste' });
    bossHit.bossIntroTicks = 0;
    hurtPlayer(bossHit, bossHit.player.x + 20, 1);
    expect(evaluatePRank(bossHit)).toBe(false);
    finalizeStageRank(bossHit);
    expect(bossHit.stageStats.rank).toBe('S');
  });
});

describe('Escape Lifecycle: Pillar Chronos -> Flip Blocks -> Lap 2 -> Mega-Crust', () => {
  it('flips Pillar blocks on smash, awards Lap 2 bonus/refill, and spawns wall-phasing Mega-Crust at 0', () => {
    const state = createInitialSimState(777, 'peppo');
    dispatchCommand(state, { type: 'enter_stage', stageId: 'entrance' });

    // Place explicit Pillar Closed & Open tiles in room for direct verification
    const w = state.room.widthTiles;
    const closedIdx = 5 * w + 5;
    const openIdx = 5 * w + 6;
    state.room.tiles[closedIdx] = TileType.PILLAR_BLOCK_CLOSED;
    state.room.tiles[openIdx] = TileType.PILLAR_BLOCK_OPEN;

    expect(getTileAt(state.room, 5, 5, state.escape.active)).toBe(TileType.PILLAR_BLOCK_CLOSED);
    expect(getTileAt(state.room, 6, 5, state.escape.active)).toBe(TileType.EMPTY);

    // Start active combo, then smash Pillar Chronos
    registerKillCombo(state, 100);
    state.player.comboTime = 20;

    startEscape(state);
    expect(state.escape.active).toBe(true);
    expect(state.escape.pillarBroken).toBe(true);
    expect(state.escape.timerTicks).toBe(LEVELS.entrance.escapeSeconds * ENGINE_CONSTANTS.SIM_HZ);

    // Pillar blocks invert immediately!
    expect(getTileAt(state.room, 5, 5, state.escape.active)).toBe(TileType.EMPTY);
    expect(getTileAt(state.room, 6, 5, state.escape.active)).toBe(TileType.PILLAR_BLOCK_OPEN);

    // Enter Lap 2 Portal -> +3000 score, combotime = 60, lap = 2
    const scoreBeforeLap2 = state.stageStats.score;
    triggerLap2(state);
    expect(state.escape.lap).toBe(2);
    expect(state.stageStats.lap2Done).toBe(true);
    expect(state.stageStats.score).toBe(scoreBeforeLap2 + ENGINE_CONSTANTS.LAP2_PTS);
    expect(state.player.comboTime).toBe(ENGINE_CONSTANTS.COMBO_TIME_MAX);

    // Drain escape timer down to 0 -> Mega-Crust spawns and accelerates at 8 + 0.01/t through walls!
    state.enemies = [];
    state.hitstopTicks = 0;
    state.escape.timerTicks = 1;
    const neutral = createNeutralInput('keyboard');
    const spawnEvs = stepSim(state, neutral);

    expect(state.escape.timerTicks).toBe(0);
    expect(state.escape.megaCrustActive).toBe(true);
    expect(state.escape.megaCrustSpeed).toBe(ENGINE_CONSTANTS.MEGA_CRUST_BASE_SPEED);
    expect(spawnEvs.some((e) => e.type === 'mega_crust_spawned')).toBe(true);

    // Put a solid wall between Mega-Crust and player; Mega-Crust phases straight through!
    const startDist = Math.hypot(
      state.player.x - state.escape.megaCrustX,
      state.player.y - 22 - state.escape.megaCrustY,
    );
    for (let t = 0; t < 15; t++) {
      stepSim(state, neutral);
    }
    const afterDist = Math.hypot(
      state.player.x - state.escape.megaCrustX,
      state.player.y - 22 - state.escape.megaCrustY,
    );
    expect(state.escape.megaCrustSpeed).toBeCloseTo(
      ENGINE_CONSTANTS.MEGA_CRUST_BASE_SPEED + 15 * ENGINE_CONSTANTS.MEGA_CRUST_ACCEL,
      5,
    );
    expect(afterDist).toBeLessThan(startDist - 80);

    // Let Mega-Crust finish closing the distance -> triggers Game Over cleanly
    for (let t = 0; t < 120 && !state.gameOver; t++) {
      stepSim(state, neutral);
    }
    expect(state.gameOver).toBe(true);
    expect(state.gameOverReason?.toUpperCase()).toContain('MEGA-CRUST');
  });
});

describe('All 5 Tower Bosses (HP Oracle, Phase Shifts, Victory & Defeat)', () => {
  const EXPECTED_HP: Array<{ id: BossId; hp: number }> = [
    { id: 'b_artiste', hp: 10 },
    { id: 'b_cheddar', hp: 9 },
    { id: 'b_static', hp: 8 },
    { id: 'b_doppel', hp: 6 },
    { id: 'b_megacrust', hp: 8 },
  ];

  it('instantiates all 5 bosses with exact oracle HP, transitions phases, and handles victory cleanly', () => {
    const neutral = createNeutralInput('keyboard');

    for (const { id, hp } of EXPECTED_HP) {
      const state = createInitialSimState(500, 'peppo');
      dispatchCommand(state, { type: 'enter_boss', bossId: id });
      expect(state.boss).not.toBeNull();
      expect(state.boss?.hp).toBe(hp);
      expect(state.boss?.maxHp).toBe(hp);
      expect(state.player.hp).toBe(ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP);
      if (id === 'b_cheddar') {
        expect(state.player.hasRevolver).toBe(true);
      }

      // Skip intro freeze
      state.bossIntroTicks = 0;
      if (state.boss) {
        state.boss.aiState = 'idle';
        state.boss.stateTimer = 20;
      }

      let sawPhase2 = false;
      let sawPhase3 = false;

      // Deal lethal hits respecting invuln ticks & Phase 2 Hallway Chase until defeated
      let safety = 0;
      let sawDoppelChase = false;
      while (state.boss && state.boss.aiState !== 'defeated' && safety < 300) {
        if (state.boss.aiState === 'phase_shift') {
          state.hitstopTicks = 0;
          stepSim(state, neutral);
          safety++;
          continue;
        }
        if (state.boss.aiState === 'chase_escape') {
          sawDoppelChase = true;
          sawPhase2 = true;
          // Sprint right down the 84-tile Escape Hallway (jumping over hurdles) to reach the Exit Door!
          for (let t = 0; t < 480 && state.boss && state.boss.aiState === 'chase_escape'; t++) {
            state.player.invulnTicks = 10;
            const jumpNow = t % 45 === 10;
            stepSim(state, {
              ...neutral,
              moveX: 1,
              machHeld: true,
              jumpPressed: jumpNow,
              jumpHeld: jumpNow,
            });
          }
          break;
        }
        state.boss.invulnTicks = 0;
        state.hitstopTicks = 0;
        state.events = [];
        const hit = damageBoss(state, 1, state.player.x);
        expect(hit).toBe(true);
        if (state.boss.phase === 2) sawPhase2 = true;
        if (state.boss.phase === 3) sawPhase3 = true;
        safety++;
      }

      expect(sawPhase2).toBe(true);
      if (id === 'b_doppel') {
        expect(sawDoppelChase).toBe(true);
      }
      if (id === 'b_megacrust') {
        expect(sawPhase3).toBe(true);
      }
      expect(state.boss?.aiState).toBe('defeated');

      // Step celebration countdown -> finalizes rank & records boss victory
      state.hitstopTicks = 0;
      for (let t = 0; t < 45 && !state.stageComplete; t++) {
        stepSim(state, neutral);
      }
      expect(state.stageComplete).toBe(true);
      expect(state.screen === 'rank' || state.screen === 'victory').toBe(true);
      expect(state.hub.bossesDefeated).toContain(id);
    }

    // Also verify Boss 3 static mirror name
    const staticBoss = createInitialSimState(501, 'static');
    dispatchCommand(staticBoss, { type: 'enter_boss', bossId: 'b_static' });
    expect(staticBoss.boss?.name).toBe('The Glitch');
  });

  it('handles Boss defeat cleanly when player loses all 6 HP', () => {
    const state = createInitialSimState(502, 'peppo');
    dispatchCommand(state, { type: 'enter_boss', bossId: 'b_artiste' });
    state.bossIntroTicks = 0;

    for (let h = 0; h < ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP; h++) {
      state.player.invulnTicks = 0;
      state.player.hurtTicks = 0;
      state.player.state = 'normal';
      hurtPlayer(state, state.player.x + 30, 1);
    }

    expect(state.player.hp).toBe(0);
    expect(state.gameOver).toBe(true);
    expect(state.gameOverReason).toBeTruthy();
  });
});

describe('All 23 Stages + 5 Hubs + 5 Boss Arenas Data Integrity', () => {
  it('validates room tile uniformity, valid non-solid spawn coordinates, and valid door targets across every room', () => {
    expect(STAGE_ORDER.length).toBe(23);

    const validateRoom = (label: string, room: (typeof HUB_ROOMS)[FloorId], roomCount: number) => {
      expect(room.widthTiles, `${label} widthTiles`).toBeGreaterThanOrEqual(20);
      expect(room.heightTiles, `${label} heightTiles`).toBeGreaterThanOrEqual(12);
      expect(room.rows.length, `${label} rows.length`).toBe(room.heightTiles);

      for (let y = 0; y < room.heightTiles; y++) {
        expect(room.rows[y].length, `${label} row ${y} length`).toBe(room.widthTiles);
      }

      const active = parseRoomDef(room);
      expect(room.spawnX, `${label} spawnX`).toBeGreaterThan(TS);
      expect(room.spawnX, `${label} spawnX`).toBeLessThan((room.widthTiles - 1) * TS);
      expect(room.spawnY, `${label} spawnY`).toBeGreaterThan(TS);
      expect(room.spawnY, `${label} spawnY`).toBeLessThan(room.heightTiles * TS);

      // Standing body at spawn must not overlap a solid tile
      const spawnTx = Math.floor(room.spawnX / TS);
      const bodyMidTy = Math.floor((room.spawnY - 22) / TS);
      const bodyHeadTy = Math.floor((room.spawnY - 40) / TS);
      expect(isSolidTile(getTileAt(active, spawnTx, bodyMidTy, false)), `${label} spawn body mid`).toBe(false);
      expect(isSolidTile(getTileAt(active, spawnTx, bodyHeadTy, false)), `${label} spawn body head`).toBe(false);

      for (const door of room.doors) {
        expect(door.targetRoomIndex, `${label} door ${door.id} targetRoomIndex`).toBeGreaterThanOrEqual(0);
        expect(door.targetRoomIndex, `${label} door ${door.id} targetRoomIndex`).toBeLessThan(roomCount);
        expect(door.x, `${label} door ${door.id} x`).toBeGreaterThan(0);
        expect(door.x, `${label} door ${door.id} x`).toBeLessThan(room.widthTiles * TS);
      }
    };

    // 23 Stages
    for (const stageId of STAGE_ORDER) {
      const level = LEVELS[stageId];
      expect(level, `missing stage ${stageId}`).toBeDefined();
      expect(level.rooms.length, `${stageId} rooms`).toBeGreaterThan(0);
      for (let rIdx = 0; rIdx < level.rooms.length; rIdx++) {
        const room = level.rooms[rIdx];
        validateRoom(`stage:${stageId}[${rIdx}]`, room, level.rooms.length);
        for (const door of room.doors) {
          const targetRoom = level.rooms[door.targetRoomIndex];
          expect(door.targetX).toBeGreaterThan(0);
          expect(door.targetX).toBeLessThan(targetRoom.widthTiles * TS);
          expect(door.targetY).toBeGreaterThan(0);
          expect(door.targetY).toBeLessThan(targetRoom.heightTiles * TS);
        }
      }
    }

    // 5 Hubs
    for (const floor of [1, 2, 3, 4, 5] as FloorId[]) {
      const hub = HUB_ROOMS[floor];
      expect(hub, `missing hub ${floor}`).toBeDefined();
      validateRoom(`hub:${floor}`, hub, 1);
    }

    // 5 Boss Arenas
    for (const bossId of Object.keys(BOSSES) as BossId[]) {
      validateRoom(`boss:${bossId}`, BOSSES[bossId].room, 1);
    }
  });
});

describe('SaveManager Persistence, Clamping & Corrupted JSON Recovery', () => {
  it('persists and reloads all 3 save slots cleanly across instances', () => {
    const storage = new MemoryStorage();
    const mgr1 = new SaveManager('test_save_key', storage);

    // Slot 0: Peppo Floor 2 with Entrance P-Rank
    mgr1.setActiveSlot(0);
    const sim0 = createInitialSimState(1, 'peppo');
    sim0.floor = 2;
    sim0.hub.floor = 2;
    sim0.hub.cash = 180;
    sim0.hub.stagesCleared = ['tutorial', 'entrance'];
    sim0.hub.stageBestRanks = { entrance: 'P' };
    mgr1.updateSlotFromSim(sim0, 3600);

    // Slot 1: Static Floor 3
    mgr1.setActiveSlot(1);
    mgr1.setSlotCharacter(1, 'static');
    const sim1 = createInitialSimState(2, 'static');
    sim1.floor = 3;
    sim1.hub.floor = 3;
    sim1.hub.cash = 350;
    sim1.hub.bossesDefeated = ['b_artiste', 'b_cheddar'];
    mgr1.updateSlotFromSim(sim1, 7200);

    // Slot 2: Fresh default slot
    mgr1.setActiveSlot(2);
    mgr1.resetSlot(2);
    mgr1.setActiveSlot(1);

    // Reload from same storage into fresh SaveManager
    const mgr2 = new SaveManager('test_save_key', storage);
    const loaded = mgr2.getData();

    expect(loaded.activeSlot).toBe(1);
    expect(loaded.slots[0].character).toBe('peppo');
    expect(loaded.slots[0].hub.cash).toBe(180);
    expect(loaded.slots[0].hub.stageBestRanks.entrance).toBe('P');
    expect(loaded.slots[0].totalPlayTicks).toBe(3600);

    expect(loaded.slots[1].character).toBe('static');
    expect(loaded.slots[1].hub.floor).toBe(3);
    expect(loaded.slots[1].hub.bossesDefeated).toEqual(['b_artiste', 'b_cheddar']);
    expect(loaded.slots[1].totalPlayTicks).toBe(7200);

    expect(loaded.slots[2].hub.cash).toBe(0);
    expect(loaded.slots[2].hub.stagesCleared).toEqual([]);
  });

  it('validates schema and clamps out-of-range audio, render, deadzone, and hub values', () => {
    const sanitized = validateSaveData({
      schemaVersion: 1,
      activeSlot: 99,
      slots: [
        {
          slotIndex: 0,
          character: 'unknown_char',
          paletteId: '',
          totalPlayTicks: -500,
          hub: {
            floor: 99,
            cash: -100,
            stageBestRanks: { entrance: 'P', medieval: 'INVALID_RANK' },
            stageBestScores: { entrance: 25000.9, medieval: -50 },
            brokerPaidFloors: [1, 99, 2],
          },
        },
      ],
      renderSettings: {
        targetFps: 999,
        touchOpacity: 4.5,
        scalingMode: 'stretched',
      },
      audioSettings: {
        masterVolume: -2.0,
        musicVolume: 5.0,
        sfxVolume: Number.NaN,
        muted: 'yes',
      },
      deadzones: {
        general: 0.001,
        horizontal: 3.0,
        vertical: -1.0,
        crouchWalk: 0.01,
        superjump: 2.5,
      },
    });

    expect(sanitized.activeSlot).toBe(0);
    expect(sanitized.slots.length).toBe(3);
    expect(sanitized.slots[0].character).toBe('peppo');
    expect(sanitized.slots[0].hub.floor).toBe(1);
    expect(sanitized.slots[0].hub.cash).toBe(0);
    expect(sanitized.slots[0].hub.stageBestRanks).toEqual({ entrance: 'P' });
    expect(sanitized.slots[0].hub.stageBestScores).toEqual({ entrance: 25000 });
    expect(sanitized.slots[0].hub.brokerPaidFloors).toEqual([1, 2]);

    expect(sanitized.renderSettings.targetFps).toBe(120);
    expect(sanitized.renderSettings.touchOpacity).toBe(0.6);
    expect(sanitized.renderSettings.scalingMode).toBe('fit');

    expect(sanitized.audioSettings.masterVolume).toBe(0);
    expect(sanitized.audioSettings.musicVolume).toBe(1);
    expect(sanitized.audioSettings.sfxVolume).toBeCloseTo(0.88, 5);
    expect(sanitized.audioSettings.muted).toBe(false);

    expect(sanitized.deadzones.general).toBe(0.05);
    expect(sanitized.deadzones.horizontal).toBe(0.85);
    expect(sanitized.deadzones.vertical).toBe(0.05);
    expect(sanitized.deadzones.crouchWalk).toBe(0.1);
    expect(sanitized.deadzones.superjump).toBe(0.95);
  });

  it('recovers gracefully from corrupted JSON or unsupported schemaVersion without throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem('corrupt_key', '{not valid json [[[!!');

    let mgr: SaveManager | null = null;
    expect(() => {
      mgr = new SaveManager('corrupt_key', storage);
    }).not.toThrow();

    const recovered = mgr!.getData();
    expect(recovered.schemaVersion).toBe(1);
    expect(recovered.slots.length).toBe(3);
    expect(recovered.activeSlot).toBe(0);

    // Unsupported schema version also falls back cleanly to defaults
    const badVersion = validateSaveData({ schemaVersion: 999, activeSlot: 2 });
    expect(badVersion.schemaVersion).toBe(1);
    expect(badVersion.activeSlot).toBe(0);
  });
});
