// ============================================================================
// Krunked Tower — 16 Unlockable 6-Color Cartoon Costume Palettes
// IDs match BUILTIN_PALETTE_RAMPS in src/assets/KrunkedAtlas.ts 1:1.
// ============================================================================

import type { PaletteDef } from '../contracts/index';

export const PALETTES: PaletteDef[] = [
  {
    id: 'classic',
    name: 'Classic White',
    unlockHint: 'Default kitchen uniform — ready out of the oven.',
    character: 'both',
    ramp: ['#141118', '#332b3a', '#f7f4ec', '#ffd6b0', '#e63946', '#ffbe0b'],
  },
  {
    id: 'spicy',
    name: 'Spicy Marinara',
    unlockHint: 'Clear Gutter Crypt with an S-Rank or higher.',
    character: 'both',
    ramp: ['#1c0b0e', '#591620', '#e63946', '#ffbe98', '#ff9f1c', '#fff3b0'],
  },
  {
    id: 'sage',
    name: 'Sage Herb',
    unlockHint: 'Rescue all 5 Toppin Pals in Shroom Woods.',
    character: 'both',
    ramp: ['#101f16', '#284b36', '#74c69d', '#f1d3b3', '#d9ed92', '#f7f4ec'],
  },
  {
    id: 'midnight',
    name: 'Midnight Oven',
    unlockHint: 'Find all 3 Secret Rooms in any Floor 1 stage.',
    character: 'both',
    ramp: ['#0a0d1c', '#1e2749', '#4a6fa5', '#d9c5b2', '#38bdf8', '#f8fafc'],
  },
  {
    id: 'golden_p',
    name: 'Golden P-Rank',
    unlockHint: 'Earn a pristine P-Rank on any tower stage.',
    character: 'both',
    ramp: ['#241604', '#7a4b09', '#ffd166', '#fff1c1', '#ff9f1c', '#ffffff'],
  },
  {
    id: 'cheetah',
    name: 'Cheetah Sprint',
    unlockHint: 'Reach a 25+ Combo Chain in a single stage.',
    character: 'both',
    ramp: ['#1f1207', '#6b3b10', '#f4a261', '#fde4cf', '#e76f51', '#ffe66d'],
  },
  {
    id: 'garish',
    name: 'Garish Arcade',
    unlockHint: 'Complete Lap 2 in any tower stage.',
    character: 'both',
    ramp: ['#180b29', '#4c1d95', '#f72585', '#ffdfba', '#4cc9f0', '#b5e48c'],
  },
  {
    id: 'cosmic',
    name: 'Cosmic Orbit',
    unlockHint: 'Clear Deep-Dish Orbit or defeat 3 Tower Bosses.',
    character: 'both',
    ramp: ['#0d0821', '#2c1654', '#7b2cbf', '#e0d4fc', '#00f5d4', '#ff70a6'],
  },
  {
    id: 'mint_static',
    name: 'Mint Static',
    unlockHint: 'Defeat The Static on Floor 3 (or start a Static campaign).',
    character: 'static',
    ramp: ['#0d1f1e', '#1b4d4a', '#52e5c5', '#ffe0bd', '#ff5d8f', '#f1faee'],
  },
  {
    id: 'volt_gold',
    name: 'Volt Gold',
    unlockHint: 'Land 5 Parries in a single stage or boss battle.',
    character: 'static',
    ramp: ['#1a1400', '#4d3b00', '#ffd60a', '#fff3c4', '#ef233c', '#00bbf9'],
  },
  {
    id: 'retro_gb',
    name: 'Pocket Matrix',
    unlockHint: 'Clear Boot Camp Kitchen without taking a single hit.',
    character: 'both',
    ramp: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#c8e06c', '#e6f5a8'],
  },
  {
    id: 'berry_blast',
    name: 'Berry Blast',
    unlockHint: 'Defeat Artiste Bell without losing a single HP.',
    character: 'both',
    ramp: ['#1f091d', '#5e1742', '#d81159', '#ffd6e0', '#8f2d56', '#72efdd'],
  },
  {
    id: 'royal_crust',
    name: 'Royal Crust',
    unlockHint: 'Clear Crusty Keep and defeat Sheriff Cheddar.',
    character: 'both',
    ramp: ['#190b14', '#4d1935', '#9e2a2b', '#f4d8c1', '#e09f3e', '#fff3b0'],
  },
  {
    id: 'lava_chef',
    name: 'Magma Broil',
    unlockHint: 'Clear Bloodsauce Catacombs or Peppo Foundry.',
    character: 'both',
    ramp: ['#1a0805', '#52150c', '#d00000', '#ffba08', '#ff5400', '#fff0c2'],
  },
  {
    id: 'ghost_mint',
    name: 'Phantom Glaze',
    unlockHint: 'Clear Wasteyard Crypts or Candy Panic.',
    character: 'both',
    ramp: ['#0c171a', '#233d4d', '#80ed99', '#e2ece9', '#56cfe1', '#f8f9fa'],
  },
  {
    id: 'neon_arcade',
    name: 'Neon Cabinet',
    unlockHint: 'Clear Crumbling Spire and topple Lord Dough.',
    character: 'both',
    ramp: ['#09061a', '#241459', '#00f5d4', '#ffcee6', '#ff007f', '#fee440'],
  },
];

export const PALETTE_MAP: Record<string, PaletteDef> = Object.fromEntries(
  PALETTES.map((p) => [p.id, p]),
);

export function getPaletteDef(id: string): PaletteDef {
  return PALETTE_MAP[id] ?? PALETTES[0];
}
