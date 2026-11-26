// ============================================================================
// Krunked Tower — 28 Chef Tasks & Costume Palette Rewards
// ============================================================================

import type { ChefTaskDef } from '../contracts/index';

export const CHEF_TASKS: ChefTaskDef[] = [
  // ---- Tutorial & Global Milestones ----
  {
    id: 'task_tutorial_flawless',
    stageId: 'tutorial',
    name: 'Clean Apron',
    description: 'Clear Boot Camp Kitchen without taking a single hit.',
    paletteReward: 'retro_gb',
  },
  {
    id: 'task_first_p_rank',
    stageId: 'global',
    name: 'Absolute Perfection',
    description: 'Achieve a P-Rank on any tower stage.',
    paletteReward: 'golden_p',
  },
  {
    id: 'task_combo_25',
    stageId: 'global',
    name: 'Unstoppable Heat',
    description: 'Reach a 25+ Combo Chain inside a single stage.',
    paletteReward: 'cheetah',
  },
  {
    id: 'task_lap2_daredevil',
    stageId: 'global',
    name: 'One More Lap!',
    description: 'Dive into the Lap 2 Portal and escape alive.',
    paletteReward: 'garish',
  },
  {
    id: 'task_parry_master',
    stageId: 'global',
    name: 'Taunt Counter',
    description: 'Land 5 Parries in a single stage or boss battle.',
    paletteReward: 'volt_gold',
  },
  {
    id: 'task_super_taunt_wipe',
    stageId: 'global',
    name: 'Thunder Strike',
    description: 'Unleash a charged Super Taunt (10-kill charge) to clear a room.',
  },

  // ---- Floor 1: Tower Lobby ----
  {
    id: 'task_entrance_srank',
    stageId: 'entrance',
    name: 'Crypt Crusher',
    description: 'Achieve an S-Rank or P-Rank in Gutter Crypt.',
    paletteReward: 'spicy',
  },
  {
    id: 'task_entrance_secrets',
    stageId: 'entrance',
    name: 'Wall Whisperer',
    description: 'Discover all 3 Secret Rooms in Gutter Crypt.',
    paletteReward: 'midnight',
  },
  {
    id: 'task_entrance_treasure',
    stageId: 'entrance',
    name: 'Gerry’s Vault',
    description: 'Find Janitor Gerry and unlock the Treasure Chest in Gutter Crypt.',
  },
  {
    id: 'task_medieval_knight',
    stageId: 'medieval',
    name: 'Chivalry Smash',
    description: 'Clear Crusty Keep with all 5 Toppin Pals rescued.',
    paletteReward: 'royal_crust',
  },
  {
    id: 'task_ruin_no_drop',
    stageId: 'ruin',
    name: 'Relic Runner',
    description: 'Finish Ancient Ruins with an A-Rank or higher.',
  },
  {
    id: 'task_dungeon_magma',
    stageId: 'dungeon',
    name: 'Oven Tempered',
    description: 'Clear Bloodsauce Catacombs and survive Krunk Time!',
    paletteReward: 'lava_chef',
  },
  {
    id: 'task_boss_artiste_nohit',
    stageId: 'b_artiste',
    name: 'Critic’s Choice',
    description: 'Defeat Artiste Bell without taking damage.',
    paletteReward: 'berry_blast',
  },

  // ---- Floor 2: Western District ----
  {
    id: 'task_badland_spicy',
    stageId: 'badland',
    name: 'Mesa Meltdown',
    description: 'Clear Oregano Mesa with 3 Secret Rooms found.',
  },
  {
    id: 'task_graveyard_phantom',
    stageId: 'graveyard',
    name: 'Ghoul Patrol',
    description: 'Clear Wasteyard Crypts with an A-Rank or higher.',
    paletteReward: 'ghost_mint',
  },
  {
    id: 'task_farm_feathers',
    stageId: 'farm',
    name: 'Barnyard Blitz',
    description: 'Rescue all 5 Toppin Pals in Fowl Farm.',
  },
  {
    id: 'task_saloon_speed',
    stageId: 'saloon',
    name: 'High-Noon Dash',
    description: 'Clear Fast-Food Saloon with Lap 2 completed.',
  },
  {
    id: 'task_boss_cheddar_nohit',
    stageId: 'b_cheddar',
    name: 'Quickest Draw',
    description: 'Defeat Sheriff Cheddar without taking damage.',
  },

  // ---- Floor 3: Resort & Woods ----
  {
    id: 'task_plage_barrel',
    stageId: 'plage',
    name: 'Rolling Tide',
    description: 'Clear Crusty Pier with an A-Rank or higher.',
  },
  {
    id: 'task_forest_buddies',
    stageId: 'forest',
    name: 'Tag-Team Champions',
    description: 'Rescue all 5 Toppin Pals in Shroom Woods with Gusto & Chonks.',
    paletteReward: 'sage',
  },
  {
    id: 'task_space_orbit',
    stageId: 'space',
    name: 'Starlight Mach',
    description: 'Clear Deep-Dish Orbit with an A-Rank or higher.',
    paletteReward: 'cosmic',
  },
  {
    id: 'task_minigolf_par',
    stageId: 'minigolf',
    name: 'Hole in Krunk',
    description: 'Clear Greaseball Golf with the Treasure Chest collected.',
  },
  {
    id: 'task_boss_static_clear',
    stageId: 'b_static',
    name: 'Off The Air',
    description: 'Defeat The Static (or The Glitch) on Floor 3.',
    paletteReward: 'mint_static',
  },

  // ---- Floor 4: Slum & Foundry ----
  {
    id: 'task_street_metro',
    stageId: 'street',
    name: 'Express Fare',
    description: 'Clear Hog Metro with all 5 Toppin Pals rescued.',
  },
  {
    id: 'task_industrial_clear',
    stageId: 'industrial',
    name: 'Assembly Breaker',
    description: 'Clear Peppo Foundry with an A-Rank or higher.',
  },
  {
    id: 'task_boss_doppel_nohit',
    stageId: 'b_doppel',
    name: 'Only One Original',
    description: 'Defeat Doppel-Peppo and survive the corridor sprint.',
  },

  // ---- Floor 5: Penthouse & Finale ----
  {
    id: 'task_war_survivor',
    stageId: 'war',
    name: 'Seconds To Spare',
    description: 'Clear BLITZ! without letting the countdown expire.',
  },
  {
    id: 'task_exit_finale',
    stageId: 'exit',
    name: 'Tower Toppler',
    description: 'Escape the Crumbling Spire and claim victory.',
    paletteReward: 'neon_arcade',
  },
];
