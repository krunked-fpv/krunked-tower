// ============================================================================
// Krunked Tower — Data Catalog Barrel Exports
// ============================================================================

import type { BossId, FloorId, StageId } from '../contracts/index';

export { LEVELS, HUB_ROOMS, getLevelDef } from './levels';
export { BOSSES, getBossDef } from './bosses';
export { ENEMIES, getEnemyDef } from './enemies';
export { PALETTES, PALETTE_MAP, getPaletteDef } from './palettes';
export { CHEF_TASKS } from './tasks';
export { STRINGS } from './localization';

export const STAGE_ORDER: StageId[] = [
  'tutorial',
  'entrance',
  'medieval',
  'ruin',
  'dungeon',
  'badland',
  'graveyard',
  'farm',
  'saloon',
  'plage',
  'forest',
  'space',
  'minigolf',
  'street',
  'sewer',
  'industrial',
  'freezer',
  'chateau',
  'kidsparty',
  'war',
  'exit',
  'secretworld',
  'trickytreat',
];

export const FLOOR_STAGES: Record<FloorId, StageId[]> = {
  1: ['entrance', 'medieval', 'ruin', 'dungeon'],
  2: ['badland', 'graveyard', 'farm', 'saloon'],
  3: ['plage', 'forest', 'space', 'minigolf'],
  4: ['street', 'sewer', 'industrial', 'freezer'],
  5: ['chateau', 'kidsparty', 'war', 'exit'],
};

export const FLOOR_BOSSES: Record<FloorId, BossId> = {
  1: 'b_artiste',
  2: 'b_cheddar',
  3: 'b_static',
  4: 'b_doppel',
  5: 'b_megacrust',
};

export const FLOOR_TOLLS: Record<FloorId, number> = {
  1: 100,
  2: 150,
  3: 200,
  4: 210,
  5: 0,
};
