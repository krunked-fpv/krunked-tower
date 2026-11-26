// ============================================================================
// Krunked Tower — 960x540 WebGL2 5-Shader Cartoon Renderer + Canvas2D Fallback
//   * Crisp 960x540 internal FBO presented nearest-neighbor (fit / pixel-perfect)
//   * All 5 GLSL ES 3.00 shaders: shd_pal_swapper, shd_color_afterimage,
//     shd_hit, shd_panicbg, shd_outline (+ shd_present FBO blit)
//   * Zero per-frame GL buffer, texture, or shader allocations
//   * Multi-depth parallax cartoon themes for all 28 RoomThemeIds
//   * True 45° & 26.5° slope polygons with top trim highlights
//   * Smooth interpAlpha entity/camera interpolation + nativeSnap60 mode
//   * Bouncy Toppin Pals conga line, hitboxes debug mode, CRT TV draw helper
//   * Graceful Canvas2D fallback when WebGL2 is unavailable
// ============================================================================

import {
  ENGINE_CONSTANTS,
  TileType,
  type AssetSourceMode,
  type BossId,
  type BossState,
  type CustomPackStatus,
  type EnemyArchetypeId,
  type EnemyState,
  type PerfStats,
  type PlayerState,
  type PropKind,
  type PropState,
  type RenderSettings,
  type RendererAPI,
  type RoomThemeId,
  type SimEvent,
  type SimState,
  type TileTypeValue,
  type TransformationId,
} from '../contracts/index';
import { AssetManager } from '../assets/AssetManager';
import {
  BUILTIN_PALETTE_RAMPS,
  PALETTE_ORDER,
  PEPPO_BASE_RAMP,
  STATIC_BASE_RAMP,
  fontGlyphKey,
  hexToRgba,
} from '../assets/KrunkedAtlas';
import { createKrunkedShaders, type KrunkedShaderSuite } from './shaders';
import { MAX_AFTERIMAGES, MAX_PARTICLES, ParticlesAndTrails } from './ParticlesAndTrails';

const VIEW_W = ENGINE_CONSTANTS.VIEWPORT_W; // 960
const VIEW_H = ENGINE_CONSTANTS.VIEWPORT_H; // 540
const TILE = ENGINE_CONSTANTS.TILE_SIZE; // 32

// Pre-allocated dynamic sprite batch capacity (zero per-frame heap alloc)
const MAX_BATCH_VERTS = 16384; // ~2730 quads / ~5460 triangles per flush
const FLOATS_PER_VERT = 8; // x, y, u, v, r, g, b, a
const CONGA_TRAIL_LEN = 64;

type RGBTuple = readonly [number, number, number];

function hexToFloatRgb(hex: string): RGBTuple {
  const rgba = hexToRgba(hex);
  return [rgba[0] / 255, rgba[1] / 255, rgba[2] / 255];
}

interface ThemeVisual {
  skyTop: RGBTuple;
  skyMid: RGBTuple;
  skyBot: RGBTuple;
  farTint: RGBTuple;
  midTint: RGBTuple;
  floorBand: RGBTuple;
  solidTile: string;
  slopeFill: RGBTuple;
  slopeTrim: RGBTuple;
  motifFar: string;
  motifMid: string;
  starry?: boolean;
  ceilingMid?: boolean;
  spinFar?: boolean;
  spinMid?: boolean;
}

const THEME_VISUALS: Record<RoomThemeId, ThemeVisual> = {
  // ---- FLOOR 1: TOWER LOBBY (Purple Bricks, Gothic Castles & Torches) ----
  hub_lobby: {
    skyTop: hexToFloatRgb('#382452'),
    skyMid: hexToFloatRgb('#573b78'),
    skyBot: hexToFloatRgb('#7d568f'),
    farTint: hexToFloatRgb('#7c5fa3'),
    midTint: hexToFloatRgb('#ffe08c'),
    floorBand: hexToFloatRgb('#2c1d40'),
    solidTile: 'tile_solid_lobby_brick',
    slopeFill: hexToFloatRgb('#69428a'),
    slopeTrim: hexToFloatRgb('#ffd166'),
    motifFar: 'bg_castle_keep',
    motifMid: 'bg_window_glow',
  },
  crypt: {
    skyTop: hexToFloatRgb('#2e253d'),
    skyMid: hexToFloatRgb('#4a3c5e'),
    skyBot: hexToFloatRgb('#69587a'),
    farTint: hexToFloatRgb('#685485'),
    midTint: hexToFloatRgb('#7a6594'),
    floorBand: hexToFloatRgb('#261e33'),
    solidTile: 'tile_solid_stone',
    slopeFill: hexToFloatRgb('#91887d'),
    slopeTrim: hexToFloatRgb('#e0d8cc'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_pillar_arch',
  },
  keep: {
    skyTop: hexToFloatRgb('#38274a'),
    skyMid: hexToFloatRgb('#61426e'),
    skyBot: hexToFloatRgb('#915f78'),
    farTint: hexToFloatRgb('#876399'),
    midTint: hexToFloatRgb('#ffe294'),
    floorBand: hexToFloatRgb('#2f203b'),
    solidTile: 'tile_solid_stone',
    slopeFill: hexToFloatRgb('#8f847c'),
    slopeTrim: hexToFloatRgb('#ffd166'),
    motifFar: 'bg_castle_keep',
    motifMid: 'bg_window_glow',
  },
  ruins: {
    skyTop: hexToFloatRgb('#784c2b'),
    skyMid: hexToFloatRgb('#ad733d'),
    skyBot: hexToFloatRgb('#deb068'),
    farTint: hexToFloatRgb('#ffe9bf'),
    midTint: hexToFloatRgb('#c4904b'),
    floorBand: hexToFloatRgb('#5e3d21'),
    solidTile: 'tile_solid_cheese',
    slopeFill: hexToFloatRgb('#d9a336'),
    slopeTrim: hexToFloatRgb('#fff0a6'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_pillar_arch',
  },
  catacombs: {
    skyTop: hexToFloatRgb('#2b151e'),
    skyMid: hexToFloatRgb('#52202b'),
    skyBot: hexToFloatRgb('#873531'),
    farTint: hexToFloatRgb('#6b2834'),
    midTint: hexToFloatRgb('#85383e'),
    floorBand: hexToFloatRgb('#241015'),
    solidTile: 'tile_solid_catacomb',
    slopeFill: hexToFloatRgb('#8f3f32'),
    slopeTrim: hexToFloatRgb('#ff9e5e'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_pillar_arch',
  },
  // ---- FLOOR 2: WESTERN DISTRICT (Red-Rock Canyons, Saloons & Cacti) ----
  hub_western: {
    skyTop: hexToFloatRgb('#873e26'),
    skyMid: hexToFloatRgb('#c96838'),
    skyBot: hexToFloatRgb('#eba85e'),
    farTint: hexToFloatRgb('#e08a58'),
    midTint: hexToFloatRgb('#cfa074'),
    floorBand: hexToFloatRgb('#542c1c'),
    solidTile: 'tile_solid_mesa',
    slopeFill: hexToFloatRgb('#b85735'),
    slopeTrim: hexToFloatRgb('#ffe08c'),
    motifFar: 'bg_mesa_canyon',
    motifMid: 'bg_saloon_front',
  },
  mesa: {
    skyTop: hexToFloatRgb('#732f22'),
    skyMid: hexToFloatRgb('#bd5935'),
    skyBot: hexToFloatRgb('#eb9e57'),
    farTint: hexToFloatRgb('#db784d'),
    midTint: hexToFloatRgb('#87c27c'),
    floorBand: hexToFloatRgb('#4d2418'),
    solidTile: 'tile_solid_mesa',
    slopeFill: hexToFloatRgb('#c45835'),
    slopeTrim: hexToFloatRgb('#ffd280'),
    motifFar: 'bg_mesa_canyon',
    motifMid: 'bg_cactus',
  },
  graveyard: {
    skyTop: hexToFloatRgb('#18172e'),
    skyMid: hexToFloatRgb('#2e2d52'),
    skyBot: hexToFloatRgb('#4a5073'),
    farTint: hexToFloatRgb('#f7e89e'),
    midTint: hexToFloatRgb('#7b82a6'),
    floorBand: hexToFloatRgb('#151526'),
    solidTile: 'tile_solid_graveyard',
    slopeFill: hexToFloatRgb('#5c617d'),
    slopeTrim: hexToFloatRgb('#c4d4e6'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_gravestone',
    starry: true,
  },
  farm: {
    skyTop: hexToFloatRgb('#4278b0'),
    skyMid: hexToFloatRgb('#6da4cf'),
    skyBot: hexToFloatRgb('#b5d9c9'),
    farTint: hexToFloatRgb('#f5fcff'),
    midTint: hexToFloatRgb('#7ac274'),
    floorBand: hexToFloatRgb('#3b6339'),
    solidTile: 'tile_solid_wood',
    slopeFill: hexToFloatRgb('#9c6334'),
    slopeTrim: hexToFloatRgb('#a6e36b'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_tree',
  },
  saloon: {
    skyTop: hexToFloatRgb('#54261f'),
    skyMid: hexToFloatRgb('#8f4229'),
    skyBot: hexToFloatRgb('#cc7845'),
    farTint: hexToFloatRgb('#c76b44'),
    midTint: hexToFloatRgb('#deb283'),
    floorBand: hexToFloatRgb('#3d1f16'),
    solidTile: 'tile_solid_wood',
    slopeFill: hexToFloatRgb('#94562c'),
    slopeTrim: hexToFloatRgb('#ffd166'),
    motifFar: 'bg_mesa_canyon',
    motifMid: 'bg_saloon_front',
  },
  // ---- FLOOR 3: VACATION RESORT (Palm Piers, Woodland, Starry Space Domes & Golf) ----
  hub_resort: {
    skyTop: hexToFloatRgb('#2978ab'),
    skyMid: hexToFloatRgb('#52add1'),
    skyBot: hexToFloatRgb('#9ce0db'),
    farTint: hexToFloatRgb('#f2fcff'),
    midTint: hexToFloatRgb('#d6f5d6'),
    floorBand: hexToFloatRgb('#256673'),
    solidTile: 'tile_solid_resort',
    slopeFill: hexToFloatRgb('#2da8a4'),
    slopeTrim: hexToFloatRgb('#fff2a6'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_palm_pier',
  },
  pier: {
    skyTop: hexToFloatRgb('#2463a3'),
    skyMid: hexToFloatRgb('#4a98cc'),
    skyBot: hexToFloatRgb('#8cd9de'),
    farTint: hexToFloatRgb('#f0fbff'),
    midTint: hexToFloatRgb('#d9f2dc'),
    floorBand: hexToFloatRgb('#215278'),
    solidTile: 'tile_solid_resort',
    slopeFill: hexToFloatRgb('#96633b'),
    slopeTrim: hexToFloatRgb('#ffe899'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_palm_pier',
  },
  woods: {
    skyTop: hexToFloatRgb('#1e3d35'),
    skyMid: hexToFloatRgb('#326150'),
    skyBot: hexToFloatRgb('#598c6b'),
    farTint: hexToFloatRgb('#d4f0dc'),
    midTint: hexToFloatRgb('#63a378'),
    floorBand: hexToFloatRgb('#193328'),
    solidTile: 'tile_solid_wood',
    slopeFill: hexToFloatRgb('#7a5333'),
    slopeTrim: hexToFloatRgb('#8fe374'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_tree',
  },
  orbit: {
    skyTop: hexToFloatRgb('#0d0f29'),
    skyMid: hexToFloatRgb('#1b1b4a'),
    skyBot: hexToFloatRgb('#32296e'),
    farTint: hexToFloatRgb('#c9e6ff'),
    midTint: hexToFloatRgb('#7887cc'),
    floorBand: hexToFloatRgb('#141436'),
    solidTile: 'tile_solid_orbit',
    slopeFill: hexToFloatRgb('#342e73'),
    slopeTrim: hexToFloatRgb('#4ff5ff'),
    motifFar: 'bg_space_dome',
    motifMid: 'bg_gear',
    starry: true,
    spinMid: true,
  },
  golf: {
    skyTop: hexToFloatRgb('#3887cc'),
    skyMid: hexToFloatRgb('#6bb8e3'),
    skyBot: hexToFloatRgb('#baebb8'),
    farTint: hexToFloatRgb('#f5fcff'),
    midTint: hexToFloatRgb('#7ad484'),
    floorBand: hexToFloatRgb('#32753b'),
    solidTile: 'tile_solid_golf',
    slopeFill: hexToFloatRgb('#5cb559'),
    slopeTrim: hexToFloatRgb('#d6ff8a'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_tree',
  },
  // ---- FLOOR 4: NEON SLUM (Wet-Brick Subway, Sewer Pipes, Foundry Gears & Ice Crystals) ----
  hub_slum: {
    skyTop: hexToFloatRgb('#1f2138'),
    skyMid: hexToFloatRgb('#333659'),
    skyBot: hexToFloatRgb('#4c4f73'),
    farTint: hexToFloatRgb('#656b99'),
    midTint: hexToFloatRgb('#a3a8db'),
    floorBand: hexToFloatRgb('#1a1b2e'),
    solidTile: 'tile_solid_slum_brick',
    slopeFill: hexToFloatRgb('#4b476e'),
    slopeTrim: hexToFloatRgb('#52f2ff'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_subway_arch',
  },
  metro: {
    skyTop: hexToFloatRgb('#1d1936'),
    skyMid: hexToFloatRgb('#392b59'),
    skyBot: hexToFloatRgb('#6b4470'),
    farTint: hexToFloatRgb('#6a5894'),
    midTint: hexToFloatRgb('#b8a4db'),
    floorBand: hexToFloatRgb('#17142b'),
    solidTile: 'tile_solid_slum_brick',
    slopeFill: hexToFloatRgb('#544873'),
    slopeTrim: hexToFloatRgb('#ff66c4'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_subway_arch',
  },
  drain: {
    skyTop: hexToFloatRgb('#162926'),
    skyMid: hexToFloatRgb('#26453e'),
    skyBot: hexToFloatRgb('#3b6150'),
    farTint: hexToFloatRgb('#73b096'),
    midTint: hexToFloatRgb('#5e8a7c'),
    floorBand: hexToFloatRgb('#132421'),
    solidTile: 'tile_solid_sewer',
    slopeFill: hexToFloatRgb('#3c6658'),
    slopeTrim: hexToFloatRgb('#a8f542'),
    motifFar: 'bg_sewer_pipes',
    motifMid: 'bg_pillar_arch',
  },
  foundry: {
    skyTop: hexToFloatRgb('#2e1a18'),
    skyMid: hexToFloatRgb('#592e24'),
    skyBot: hexToFloatRgb('#914929'),
    farTint: hexToFloatRgb('#a87966'),
    midTint: hexToFloatRgb('#c49078'),
    floorBand: hexToFloatRgb('#241513'),
    solidTile: 'tile_solid_metal',
    slopeFill: hexToFloatRgb('#66717d'),
    slopeTrim: hexToFloatRgb('#ffaa47'),
    motifFar: 'bg_gear',
    motifMid: 'bg_gear',
    spinFar: true,
    spinMid: true,
  },
  freezer: {
    skyTop: hexToFloatRgb('#244a75'),
    skyMid: hexToFloatRgb('#487fad'),
    skyBot: hexToFloatRgb('#8cc7e3'),
    farTint: hexToFloatRgb('#e6f8ff'),
    midTint: hexToFloatRgb('#c9f2ff'),
    floorBand: hexToFloatRgb('#1f3d5e'),
    solidTile: 'tile_solid_snow',
    slopeFill: hexToFloatRgb('#78a4c7'),
    slopeTrim: hexToFloatRgb('#ffffff'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_ice_crystal',
  },
  // ---- FLOOR 5: TOWER PENTHOUSE (Haunted Chandeliers, Neon Arcades, War Trenches & Crumbling Spire) ----
  hub_penthouse: {
    skyTop: hexToFloatRgb('#1d1336'),
    skyMid: hexToFloatRgb('#44215e'),
    skyBot: hexToFloatRgb('#7d325e'),
    farTint: hexToFloatRgb('#ffe080'),
    midTint: hexToFloatRgb('#ebd2ff'),
    floorBand: hexToFloatRgb('#241136'),
    solidTile: 'tile_solid_neon',
    slopeFill: hexToFloatRgb('#4a2d73'),
    slopeTrim: hexToFloatRgb('#ff66c4'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_chandelier',
    starry: true,
    ceilingMid: true,
  },
  manor: {
    skyTop: hexToFloatRgb('#1d1429'),
    skyMid: hexToFloatRgb('#38234a'),
    skyBot: hexToFloatRgb('#593866'),
    farTint: hexToFloatRgb('#f2e096'),
    midTint: hexToFloatRgb('#e8d6ff'),
    floorBand: hexToFloatRgb('#171021'),
    solidTile: 'tile_solid_manor',
    slopeFill: hexToFloatRgb('#543a69'),
    slopeTrim: hexToFloatRgb('#d6b8ff'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_chandelier',
    starry: true,
    ceilingMid: true,
  },
  arcade: {
    skyTop: hexToFloatRgb('#150f2e'),
    skyMid: hexToFloatRgb('#2d1a59'),
    skyBot: hexToFloatRgb('#59227a'),
    farTint: hexToFloatRgb('#b852b0'),
    midTint: hexToFloatRgb('#e0d1ff'),
    floorBand: hexToFloatRgb('#120c26'),
    solidTile: 'tile_solid_neon',
    slopeFill: hexToFloatRgb('#392466'),
    slopeTrim: hexToFloatRgb('#4ff5ff'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_arcade_cabinet',
    starry: true,
  },
  blitz: {
    skyTop: hexToFloatRgb('#2b301f'),
    skyMid: hexToFloatRgb('#4a5033'),
    skyBot: hexToFloatRgb('#786a40'),
    farTint: hexToFloatRgb('#666b4c'),
    midTint: hexToFloatRgb('#c9c79e'),
    floorBand: hexToFloatRgb('#222618'),
    solidTile: 'tile_solid_war',
    slopeFill: hexToFloatRgb('#596346'),
    slopeTrim: hexToFloatRgb('#d6d98c'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_war_trench',
  },
  spire: {
    skyTop: hexToFloatRgb('#260d21'),
    skyMid: hexToFloatRgb('#5c1936'),
    skyBot: hexToFloatRgb('#9e3036'),
    farTint: hexToFloatRgb('#ffe070'),
    midTint: hexToFloatRgb('#ffb899'),
    floorBand: hexToFloatRgb('#1f0a1a'),
    solidTile: 'tile_solid_spire',
    slopeFill: hexToFloatRgb('#732635'),
    slopeTrim: hexToFloatRgb('#ffe066'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_spire_cracks',
    starry: true,
  },
  secret: {
    skyTop: hexToFloatRgb('#1c0e36'),
    skyMid: hexToFloatRgb('#421f70'),
    skyBot: hexToFloatRgb('#7a329c'),
    farTint: hexToFloatRgb('#9ef7ff'),
    midTint: hexToFloatRgb('#9c70d4'),
    floorBand: hexToFloatRgb('#170b2b'),
    solidTile: 'tile_solid_orbit',
    slopeFill: hexToFloatRgb('#5a308c'),
    slopeTrim: hexToFloatRgb('#ff8ce6'),
    motifFar: 'bg_space_dome',
    motifMid: 'bg_pillar_arch',
    starry: true,
  },
  candy: {
    skyTop: hexToFloatRgb('#471d4f'),
    skyMid: hexToFloatRgb('#7a2e78'),
    skyBot: hexToFloatRgb('#b84f8c'),
    farTint: hexToFloatRgb('#ffe47a'),
    midTint: hexToFloatRgb('#ffd1f0'),
    floorBand: hexToFloatRgb('#381540'),
    solidTile: 'tile_solid_cheese',
    slopeFill: hexToFloatRgb('#d97736'),
    slopeTrim: hexToFloatRgb('#fff080'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_chandelier',
    starry: true,
    ceilingMid: true,
  },
  // ---- BOSS ARENAS (1-5) ----
  boss_gallery: {
    skyTop: hexToFloatRgb('#421d2b'),
    skyMid: hexToFloatRgb('#6e2f42'),
    skyBot: hexToFloatRgb('#9e4e59'),
    farTint: hexToFloatRgb('#a35c70'),
    midTint: hexToFloatRgb('#ffe094'),
    floorBand: hexToFloatRgb('#331521'),
    solidTile: 'tile_solid_lobby_brick',
    slopeFill: hexToFloatRgb('#8c535b'),
    slopeTrim: hexToFloatRgb('#ffd478'),
    motifFar: 'bg_castle_keep',
    motifMid: 'bg_window_glow',
  },
  boss_canyon: {
    skyTop: hexToFloatRgb('#69261b'),
    skyMid: hexToFloatRgb('#ad4728'),
    skyBot: hexToFloatRgb('#e38a46'),
    farTint: hexToFloatRgb('#db774a'),
    midTint: hexToFloatRgb('#84c278'),
    floorBand: hexToFloatRgb('#471d14'),
    solidTile: 'tile_solid_mesa',
    slopeFill: hexToFloatRgb('#a85032'),
    slopeTrim: hexToFloatRgb('#ffd97d'),
    motifFar: 'bg_mesa_canyon',
    motifMid: 'bg_cactus',
  },
  boss_studio: {
    skyTop: hexToFloatRgb('#1b1236'),
    skyMid: hexToFloatRgb('#421f66'),
    skyBot: hexToFloatRgb('#852c73'),
    farTint: hexToFloatRgb('#b8d4ff'),
    midTint: hexToFloatRgb('#e3ccff'),
    floorBand: hexToFloatRgb('#150d29'),
    solidTile: 'tile_solid_neon',
    slopeFill: hexToFloatRgb('#542d82'),
    slopeTrim: hexToFloatRgb('#4ff5ff'),
    motifFar: 'bg_space_dome',
    motifMid: 'bg_arcade_cabinet',
    starry: true,
  },
  boss_doppel: {
    skyTop: hexToFloatRgb('#171521'),
    skyMid: hexToFloatRgb('#2e283b'),
    skyBot: hexToFloatRgb('#4a3f57'),
    farTint: hexToFloatRgb('#7c7299'),
    midTint: hexToFloatRgb('#706587'),
    floorBand: hexToFloatRgb('#12101a'),
    solidTile: 'tile_solid_slum_brick',
    slopeFill: hexToFloatRgb('#594c63'),
    slopeTrim: hexToFloatRgb('#c9bfd1'),
    motifFar: 'bg_subway_arch',
    motifMid: 'bg_pillar_arch',
  },
  boss_summit: {
    skyTop: hexToFloatRgb('#1a0a24'),
    skyMid: hexToFloatRgb('#4a1236'),
    skyBot: hexToFloatRgb('#8f2438'),
    farTint: hexToFloatRgb('#ffe066'),
    midTint: hexToFloatRgb('#ffad8a'),
    floorBand: hexToFloatRgb('#15081d'),
    solidTile: 'tile_solid_spire',
    slopeFill: hexToFloatRgb('#702e42'),
    slopeTrim: hexToFloatRgb('#ffe066'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_spire_cracks',
    starry: true,
  },
};

// Pre-allocated zero-GC sprite key lookup tables (zero per-frame string allocation!)
const TAUNT_SPRITE_KEYS: readonly string[] = [
  'peppo_taunt_0',
  'peppo_taunt_1',
  'peppo_taunt_2',
  'peppo_taunt_3',
  'peppo_taunt_4',
  'peppo_taunt_5',
  'peppo_taunt_6',
  'peppo_taunt_7',
  'peppo_taunt_8',
  'peppo_taunt_9',
  'peppo_taunt_10',
];

const TOPPIN_SPRITE_KEYS: readonly string[] = [
  'toppin_0',
  'toppin_1',
  'toppin_2',
  'toppin_3',
  'toppin_4',
];

const TRANSFO_SPRITE_KEYS: Record<TransformationId, string> = {
  none: 'peppo_idle',
  knight: 'peppo_transfo_knight',
  ball: 'peppo_transfo_ball',
  bomb: 'peppo_transfo_bomb',
  fire_butt: 'peppo_transfo_fire_butt',
  firemouth: 'peppo_transfo_firemouth',
  ghost: 'peppo_transfo_ghost',
  beak: 'peppo_transfo_beak',
  weenie: 'peppo_transfo_weenie',
  barrel: 'peppo_transfo_barrel',
  rocket: 'peppo_transfo_rocket',
  golf_carry: 'peppo_transfo_golf_carry',
  cheese_sticky: 'peppo_transfo_cheese_sticky',
  trash_roll: 'peppo_transfo_trash_roll',
  boxed_flat: 'peppo_transfo_boxed_flat',
  inferno_pepper: 'peppo_transfo_inferno_pepper',
  cross: 'peppo_transfo_cross',
  shotgun: 'peppo_transfo_shotgun',
  revolver: 'peppo_transfo_revolver',
};

const PROP_SPRITE_KEYS: Record<PropKind, string> = {
  pillar_chronos: 'prop_pillar_chronos',
  toppin_cage: 'prop_toppin_cage',
  gerry_janitor: 'prop_gerry_janitor',
  treasure_chest: 'prop_treasure_chest',
  lap2_portal: 'prop_lap2_portal',
  exit_door: 'prop_exit_door',
  secret_eye: 'prop_secret_eye',
  transform_totem: 'prop_transform_totem',
  buddy_switch: 'prop_buddy_switch',
  time_terminal: 'prop_time_terminal',
  golf_ball: 'prop_golf_ball',
  golf_goal: 'prop_golf_goal',
  dash_button: 'prop_dash_button',
  taxi_warp: 'prop_taxi_warp',
  alarm_sensor: 'prop_alarm_sensor',
  hub_stage_gate: 'prop_hub_stage_gate',
  hub_boss_gate: 'prop_hub_boss_gate',
  hub_elevator: 'prop_hub_elevator',
  hub_broker: 'prop_hub_broker',
  hub_bonus_gate: 'prop_hub_bonus_gate',
  tutorial_sign: 'prop_tutorial_sign',
};

const ENEMY_SPRITE_KEYS: Record<EnemyArchetypeId, string> = {
  slime_glob: 'enemy_slime_glob',
  fork_imp: 'enemy_fork_imp',
  swedish_ape: 'enemy_swedish_ape',
  pepper_goblin: 'enemy_pepper_goblin',
  knight_squire: 'enemy_knight_squire',
  bomb_imp: 'enemy_bomb_imp',
  tribal_cheese: 'enemy_tribal_cheese',
  cow_charger: 'enemy_cow_charger',
  ghost_ghoul: 'enemy_ghost_ghoul',
  mushroom_spitter: 'enemy_mushroom_spitter',
  cannon_goblin: 'enemy_cannon_goblin',
  giant_bee: 'enemy_giant_bee',
  archer_goblin: 'enemy_archer_goblin',
  ufo_olive: 'enemy_ufo_olive',
  burger_golfer: 'enemy_burger_golfer',
  ninja_slice: 'enemy_ninja_slice',
  clone_bot: 'enemy_clone_bot',
  fake_santa: 'enemy_fake_santa',
  animatronic_bot: 'enemy_animatronic_bot',
  blitz_trooper: 'enemy_blitz_trooper',
  pickle_brawler: 'enemy_pickle_brawler',
  static_minion: 'enemy_static_minion',
};

const BOSS_SPRITE_KEYS: Record<BossId, string> = {
  b_artiste: 'boss_b_artiste',
  b_cheddar: 'boss_b_cheddar',
  b_static: 'boss_b_static',
  b_doppel: 'boss_b_doppel',
  b_megacrust: 'boss_b_megacrust',
};

const GOLF_STROKE_LABELS: readonly string[] = [
  'PAR 0',
  'SHOT 1',
  'SHOT 2',
  'SHOT 3',
  'SHOT 4',
  'SHOT 5',
  'SHOT 6',
  'SHOT 7',
  'SHOT 8',
  'SHOT 9+',
];

// Static deterministic starfield coordinates (zero per-frame alloc)
const STAR_POS_X: readonly number[] = [
  42, 118, 195, 274, 348, 412, 496, 578, 650, 732, 814, 886, 932, 74, 240, 455, 688, 860,
];
const STAR_POS_Y: readonly number[] = [
  26, 74, 38, 108, 52, 134, 28, 92, 46, 122, 34, 86, 58, 148, 160, 82, 144, 152,
];

function resolveBossSpriteKey(boss: BossState): string {
  // Phase 1 of Boss 5 (b_megacrust) renders the giant floating grinning Mega-Crust moon;
  // Phase 2 and Phase 3 shift to Lord Dough!
  if (boss.id === 'b_megacrust' && boss.phase === 1) {
    return 'mega_crust_chaser';
  }
  return BOSS_SPRITE_KEYS[boss.id];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function getPaletteRow(paletteId: string): number {
  const idx = PALETTE_ORDER.indexOf(paletteId);
  const count = PALETTE_ORDER.length;
  return ((idx >= 0 ? idx : 0) + 0.5) / count;
}

function isSlopeTile(t: TileTypeValue): boolean {
  return t >= TileType.SLOPE_45_UP_RIGHT && t <= TileType.SLOPE_26_LOW_LEFT;
}

function resolvePlayerSpriteKey(player: PlayerState): string {
  if (player.rider === 'gusto_chonks') {
    switch (player.state) {
      case 'mach1':
      case 'mach2':
      case 'mach3':
      case 'mach4':
      case 'mach_roll':
        return 'gusto_mach';
      case 'climb_wall':
        return 'gusto_climb_wall';
      case 'grab_dash':
      case 'uppercut':
        return 'gusto_kick';
      case 'taunt':
      case 'super_taunt':
      case 'parry':
        return 'gusto_taunt';
      case 'hurt':
      case 'bump':
        return 'gusto_hurt';
      default:
        if (!player.grounded) return player.vy < 0 ? 'gusto_jump' : 'gusto_fall';
        return Math.abs(player.vx) > 0.4 ? 'gusto_walk' : 'gusto_idle';
    }
  }

  if (player.rider === 'static') {
    switch (player.state) {
      case 'crouch':
      case 'crouch_slide':
        return 'static_crouch';
      case 'mach1':
        return 'static_mach1';
      case 'mach2':
        return 'static_mach2';
      case 'mach3':
        return 'static_mach3';
      case 'mach4':
        return 'static_mach4';
      case 'mach_slide':
        return 'static_mach_slide';
      case 'mach_roll':
        return 'static_mach_roll';
      case 'wall_bounce':
      case 'climb_wall':
        return 'static_wall_bounce';
      case 'grab_dash':
      case 'grab_hold':
      case 'uppercut':
        return 'static_grab_dash';
      case 'sjump_prep':
        return 'static_sjump_prep';
      case 'sjump':
      case 'sjump_cancel':
        return 'static_sjump';
      case 'freefall_prep':
      case 'freefall':
      case 'freefall_land':
      case 'piledriver':
        return 'static_freefall';
      case 'taunt':
      case 'super_taunt':
      case 'parry':
        return 'static_taunt';
      case 'hurt':
      case 'bump':
        return 'static_hurt';
      default:
        if (player.transformation === 'bomb') return 'static_bomb';
        if (!player.grounded) return player.vy < 0 ? 'static_jump' : 'static_fall';
        return Math.abs(player.vx) > 0.4 ? 'static_walk' : 'static_idle';
    }
  }

  // Chef Peppo transformations override base idle/walk/run states cleanly
  if (player.transformation !== 'none') {
    const transfoKey = TRANSFO_SPRITE_KEYS[player.transformation];
    if (
      player.state === 'normal' ||
      player.state === 'mach1' ||
      player.state === 'mach2' ||
      player.state === 'mach3' ||
      player.state === 'mach4' ||
      player.state === 'crouch' ||
      player.state === 'crouch_slide'
    ) {
      return transfoKey;
    }
  }

  switch (player.state) {
    case 'crouch':
      return 'peppo_crouch';
    case 'crouch_slide':
      return 'peppo_crouch_slide';
    case 'mach1':
      return 'peppo_mach1';
    case 'mach2':
      return 'peppo_mach2';
    case 'mach3':
      return 'peppo_mach3';
    case 'mach4':
      return 'peppo_mach4';
    case 'mach_slide':
      return 'peppo_mach_slide';
    case 'mach_roll':
      return 'peppo_mach_roll';
    case 'climb_wall':
    case 'wall_bounce':
      return 'peppo_climb_wall';
    case 'grab_dash':
      return 'peppo_grab_dash';
    case 'grab_hold':
      return 'peppo_grab_hold';
    case 'piledriver':
      return 'peppo_piledriver';
    case 'uppercut':
      return 'peppo_uppercut';
    case 'sjump_prep':
      return 'peppo_sjump_prep';
    case 'sjump':
      return 'peppo_sjump';
    case 'sjump_land':
      return 'peppo_sjump_land';
    case 'sjump_cancel':
      return 'peppo_sjump_cancel';
    case 'freefall_prep':
      return 'peppo_freefall_prep';
    case 'freefall':
      return 'peppo_freefall';
    case 'freefall_land':
      return 'peppo_freefall_land';
    case 'taunt':
      return TAUNT_SPRITE_KEYS[Math.abs(player.tauntPose | 0) % TAUNT_SPRITE_KEYS.length];
    case 'super_taunt':
      return 'peppo_super_taunt';
    case 'parry':
      return 'peppo_parry';
    case 'hurt':
      return 'peppo_hurt';
    case 'bump':
      return 'peppo_bump';
    case 'door_enter':
      return 'peppo_door_enter';
    case 'victory_pose':
      return 'peppo_victory_pose';
    default:
      if (!player.grounded) return player.vy < 0 ? 'peppo_jump' : 'peppo_fall';
      return Math.abs(player.vx) > 0.4 ? 'peppo_walk' : 'peppo_idle';
  }
}

function propToSpriteKey(prop: PropState): string {
  return PROP_SPRITE_KEYS[prop.kind];
}

export class WebGL2Renderer implements RendererAPI {
  private readonly assetManager = new AssetManager();
  private readonly particles = new ParticlesAndTrails();

  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private shaders: KrunkedShaderSuite | null = null;

  // WebGL2 persistent resources (allocated once in init)
  private fbo: WebGLFramebuffer | null = null;
  private fboColorTex: WebGLTexture | null = null;
  private builtinTex: WebGLTexture | null = null;
  private customTex: WebGLTexture | null = null;
  private palLutTex: WebGLTexture | null = null;
  private spriteVao: WebGLVertexArrayObject | null = null;
  private spriteVbo: WebGLBuffer | null = null;
  private fullscreenVao: WebGLVertexArrayObject | null = null;
  private uploadedCustomVersion = -1;

  // Pre-allocated CPU vertex batch buffer (ZERO per-frame allocations)
  private readonly batchData = new Float32Array(MAX_BATCH_VERTS * FLOATS_PER_VERT);
  private batchVertCount = 0;
  private batchUseCustom = false;

  // Pre-allocated palette source-color uniform arrays & zero-GC scratch buffers
  private readonly peppoSrcFloats = new Float32Array(18);
  private readonly staticSrcFloats = new Float32Array(18);
  private readonly vpScratch = new Int32Array(4);
  private readonly tmpColor = new Float32Array(3);
  private whiteU = 0;
  private whiteV = 0;

  // Canvas2D fallback & CRT TV helper backing canvases
  private ctx2d: CanvasRenderingContext2D | null = null;
  private fallbackBuf: HTMLCanvasElement | null = null;
  private fallbackCtx: CanvasRenderingContext2D | null = null;
  private builtinAtlasCanvas: HTMLCanvasElement | null = null;
  private customAtlasCanvas: HTMLCanvasElement | null = null;
  private customCanvasVersion = -1;

  // Viewport & timing state
  private displayW: number = VIEW_W;
  private displayH: number = VIEW_H;
  private dpr = 1;
  private lastFrameMs = 0;
  private animTime = 0;
  private smoothedFps = 60;
  private drawCalls = 0;
  private lastRenderMs = 0;
  private lastTargetFps: 30 | 60 | 120 = 120;

  // Pre-allocated Conga Line trail ring buffer (64 slots, zero alloc)
  private readonly trailX = new Float32Array(CONGA_TRAIL_LEN);
  private readonly trailY = new Float32Array(CONGA_TRAIL_LEN);
  private readonly trailFacing = new Int8Array(CONGA_TRAIL_LEN);
  private trailHead = 0;
  private trailLastTick = -1;
  private trailSeeded = false;

  // Zero-GC muzzle flash timers (shotgun / revolver / Sheriff Cheddar quick-draw)
  private muzzleFlashTimer = 0;
  private muzzleFlashKind: 0 | 1 | 2 = 0; // 1 = revolver, 2 = shotgun/charged
  private bossMuzzleFlashTimer = 0;
  private lastAmmoCooldown = 0;
  private lastBossAiState = '';

  // Pre-allocated PerfStats return object
  private readonly perfStats: PerfStats = {
    fps: 60,
    simMs: 0,
    renderMs: 0,
    drawCalls: 0,
    activeParticles: 0,
    activeAfterimages: 0,
    targetFps: 120,
  };

  constructor() {
    for (let i = 0; i < 6; i++) {
      const pr = hexToRgba(PEPPO_BASE_RAMP[i]);
      this.peppoSrcFloats[i * 3] = pr[0] / 255;
      this.peppoSrcFloats[i * 3 + 1] = pr[1] / 255;
      this.peppoSrcFloats[i * 3 + 2] = pr[2] / 255;
      const sr = hexToRgba(STATIC_BASE_RAMP[i]);
      this.staticSrcFloats[i * 3] = sr[0] / 255;
      this.staticSrcFloats[i * 3 + 1] = sr[1] / 255;
      this.staticSrcFloats[i * 3 + 2] = sr[2] / 255;
    }
    const wr = this.assetManager.builtinAtlas.rects.fx_white_px;
    const inv = 1 / this.assetManager.builtinAtlas.width;
    this.whiteU = (wr.x + 2) * inv;
    this.whiteV = (wr.y + 2) * inv;
  }

  getAssetManager(): AssetManager {
    return this.assetManager;
  }

  getCustomAudioMap(): Map<string, string> {
    return this.assetManager.getCustomAudioMap();
  }

  init(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    this.lastFrameMs = typeof performance !== 'undefined' ? performance.now() : 0;
    this.displayW = canvas.clientWidth || canvas.width || VIEW_W;
    this.displayH = canvas.clientHeight || canvas.height || VIEW_H;
    this.dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    // Kick off non-blocking custom pack probe (Vite dev middleware / IndexedDB)
    void this.assetManager.probeCustomPack();

    // Attempt full WebGL2 5-shader pipeline
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      });
      if (gl && this.initWebGL2(gl)) {
        this.gl = gl;
        this.resize(this.displayW, this.displayH, this.dpr);
        return true;
      }
    } catch {
      // Fall through cleanly to Canvas2D fallback
    }

    // Graceful Canvas2D fallback
    const ctx2d = canvas.getContext('2d');
    if (ctx2d) {
      this.ctx2d = ctx2d;
      if (typeof document !== 'undefined') {
        this.fallbackBuf = document.createElement('canvas');
        this.fallbackBuf.width = VIEW_W;
        this.fallbackBuf.height = VIEW_H;
        this.fallbackCtx = this.fallbackBuf.getContext('2d');
      }
      this.ensureAtlasCanvases();
      this.resize(this.displayW, this.displayH, this.dpr);
      return true;
    }

    return false;
  }

  private initWebGL2(gl: WebGL2RenderingContext): boolean {
    this.shaders = createKrunkedShaders(gl);

    // 1. Internal 960x540 crisp FBO
    const fboTex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!fboTex || !fbo) return false;

    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, VIEW_W, VIEW_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fbo = fbo;
    this.fboColorTex = fboTex;

    // 2. Upload Built-In 2048x2048 Hand-Inked KrunkedAtlas texture ONCE
    const builtin = this.assetManager.builtinAtlas;
    const bTex = gl.createTexture();
    if (!bTex) return false;
    gl.bindTexture(gl.TEXTURE_2D, bTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      builtin.width,
      builtin.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      builtin.pixels
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.builtinTex = bTex;

    // 3. Allocate custom atlas texture handle (populated on-demand when custom pack loads)
    this.customTex = gl.createTexture();
    if (this.customTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.customTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    // 4. Bake 6 x 16 RGBA 1D-per-row Palette LUT Texture for shd_pal_swapper
    const numPalettes = PALETTE_ORDER.length;
    const lutData = new Uint8Array(6 * numPalettes * 4);
    for (let row = 0; row < numPalettes; row++) {
      const ramp = BUILTIN_PALETTE_RAMPS[PALETTE_ORDER[row]];
      for (let col = 0; col < 6; col++) {
        const rgba = hexToRgba(ramp[col]);
        const o = (row * 6 + col) * 4;
        lutData[o] = rgba[0];
        lutData[o + 1] = rgba[1];
        lutData[o + 2] = rgba[2];
        lutData[o + 3] = 255;
      }
    }
    const lutTex = gl.createTexture();
    if (!lutTex) return false;
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 6, numPalettes, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.palLutTex = lutTex;

    // 5. Pre-allocate Dynamic Sprite Batch VAO + VBO (ZERO per-frame buffer allocs)
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const fsVao = gl.createVertexArray();
    if (!vao || !vbo || !fsVao) return false;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.batchData.byteLength, gl.STREAM_DRAW);

    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);

    gl.bindVertexArray(null);
    this.spriteVao = vao;
    this.spriteVbo = vbo;
    this.fullscreenVao = fsVao;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return true;
  }

  resize(width: number, height: number, dpr: number): void {
    this.displayW = Math.max(1, width);
    this.displayH = Math.max(1, height);
    this.dpr = Math.max(1, dpr || 1);
    if (!this.canvas) return;
    const physW = Math.max(1, Math.round(this.displayW * this.dpr));
    const physH = Math.max(1, Math.round(this.displayH * this.dpr));
    if (this.canvas.width !== physW) this.canvas.width = physW;
    if (this.canvas.height !== physH) this.canvas.height = physH;
  }

  consumeEvents(events: readonly SimEvent[]): void {
    this.particles.consumeEvents(events);
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'sfx') {
        if (ev.sfx === 'shotgun_blast') {
          this.muzzleFlashTimer = 0.13;
          this.muzzleFlashKind = 2;
        } else if (ev.sfx === 'revolver_shot') {
          if (this.muzzleFlashTimer < 0.09) {
            this.muzzleFlashTimer = 0.1;
            this.muzzleFlashKind = 1;
          }
        }
      }
    }
  }

  setAssetMode(mode: AssetSourceMode): void {
    this.assetManager.setAssetMode(mode);
  }

  getCustomPackStatus(): CustomPackStatus {
    return this.assetManager.getCustomPackStatus();
  }

  async loadCustomPackFiles(files: FileList | File[]): Promise<CustomPackStatus> {
    return this.assetManager.loadCustomPackFiles(files);
  }

  getPerfStats(): PerfStats {
    this.perfStats.fps = Math.round(this.smoothedFps);
    this.perfStats.renderMs = Number(this.lastRenderMs.toFixed(2));
    this.perfStats.drawCalls = this.drawCalls;
    this.perfStats.activeParticles = this.particles.activeParticleCount;
    this.perfStats.activeAfterimages = this.particles.activeAfterimageCount;
    this.perfStats.targetFps = this.lastTargetFps;
    return this.perfStats;
  }

  dispose(): void {
    const gl = this.gl;
    if (gl) {
      if (this.fbo) gl.deleteFramebuffer(this.fbo);
      if (this.fboColorTex) gl.deleteTexture(this.fboColorTex);
      if (this.builtinTex) gl.deleteTexture(this.builtinTex);
      if (this.customTex) gl.deleteTexture(this.customTex);
      if (this.palLutTex) gl.deleteTexture(this.palLutTex);
      if (this.spriteVao) gl.deleteVertexArray(this.spriteVao);
      if (this.spriteVbo) gl.deleteBuffer(this.spriteVbo);
      if (this.fullscreenVao) gl.deleteVertexArray(this.fullscreenVao);
      this.shaders?.dispose();
    }
    this.gl = null;
    this.shaders = null;
    this.ctx2d = null;
    this.fallbackBuf = null;
    this.fallbackCtx = null;
    this.builtinAtlasCanvas = null;
    this.customAtlasCanvas = null;
    this.assetManager.dispose();
  }

  // ==========================================================================
  // Public Helper for HUD Overlay: Draws Live Expressive CRT TV Sprite to 2D Canvas
  // ==========================================================================

  drawTvSpriteToCanvas(ctx: CanvasRenderingContext2D, state: SimState): boolean {
    this.ensureAtlasCanvases();
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);

    const exprKey = `tv_${state.tv.expression}`;
    const screenRes = this.assetManager.resolveSprite(exprKey);
    const screenSrc = screenRes.useCustom && this.customAtlasCanvas ? this.customAtlasCanvas : this.builtinAtlasCanvas;
    const frameRes = this.assetManager.resolveSprite('tv_frame');
    const frameSrc = frameRes.useCustom && this.customAtlasCanvas ? this.customAtlasCanvas : this.builtinAtlasCanvas;
    if (!screenSrc || !frameSrc) return false;

    const bounce =
      state.tv.comboBounce > 0
        ? Math.sin(state.tv.comboBounce * 0.9) * 3
        : Math.sin(this.animTime * (state.escape.active ? 14 : 4)) * 1.2;

    // Draw cartoon face inside CRT glass window
    const sr = screenRes.rect;
    ctx.drawImage(
      screenSrc,
      sr.x,
      sr.y,
      sr.w,
      sr.h,
      Math.round(w * 0.13),
      Math.round(h * 0.25 + bounce),
      Math.round(w * 0.62),
      Math.round(h * 0.57)
    );

    // Draw chunky retro CRT bezel frame over edges
    const fr = frameRes.rect;
    ctx.drawImage(frameSrc, fr.x, fr.y, fr.w, fr.h, 0, 0, w, h);
    return true;
  }

  // ==========================================================================
  // Main Frame Render Entry Point
  // ==========================================================================

  render(state: SimState, interpAlpha: number, settings: RenderSettings): void {
    const startMs = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = this.lastFrameMs > 0 ? Math.min(0.05, Math.max(0.001, (startMs - this.lastFrameMs) / 1000)) : 1 / 60;
    this.lastFrameMs = startMs;
    this.animTime += dt;
    this.smoothedFps = this.smoothedFps * 0.9 + (1 / dt) * 0.1;
    this.lastTargetFps = settings.targetFps;
    this.drawCalls = 0;

    // Update fixed particle & afterimage pools
    this.particles.update(dt);
    this.recordCongaTrail(state);

    // Update zero-GC muzzle flash timers & detect rising edges on ammoCooldown / Cheddar shots
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
    }
    if (this.bossMuzzleFlashTimer > 0) {
      this.bossMuzzleFlashTimer = Math.max(0, this.bossMuzzleFlashTimer - dt);
    }
    const cd = state.player.ammoCooldown;
    if (cd > this.lastAmmoCooldown) {
      if (cd >= 20) {
        this.muzzleFlashTimer = 0.13;
        this.muzzleFlashKind = 2;
      } else if (cd >= 12) {
        this.muzzleFlashTimer = 0.1;
        this.muzzleFlashKind = 1;
      }
    }
    this.lastAmmoCooldown = cd;
    const boss = state.boss;
    const curBossState = boss ? boss.aiState : '';
    if (boss && boss.id === 'b_cheddar' && curBossState === 'projectile' && this.lastBossAiState !== 'projectile') {
      this.bossMuzzleFlashTimer = 0.14;
    }
    this.lastBossAiState = curBossState;

    const alpha = settings.nativeSnap60 ? 1 : Math.max(0, Math.min(1, interpAlpha));

    // Compute interpolated camera + optional deterministic screen shake
    let camX = lerp(state.camera.prevX, state.camera.x, alpha);
    let camY = lerp(state.camera.prevY, state.camera.y, alpha);
    if (settings.screenShake && state.shakeTimer > 0 && state.shakeMag > 0) {
      const mag = Math.min(18, state.shakeMag);
      const phase = state.tick * 1.73 + this.animTime * 42;
      camX += Math.sin(phase * 13.1) * mag;
      camY += Math.cos(phase * 17.7) * mag;
    }
    camX = Math.round(camX);
    camY = Math.round(camY);

    if (this.gl && this.shaders) {
      this.syncCustomTextureWebGL(this.gl);
      this.renderWebGL2(state, alpha, settings, camX, camY);
    } else if (this.ctx2d && this.fallbackCtx && this.fallbackBuf) {
      this.ensureAtlasCanvases();
      this.renderCanvas2D(state, alpha, settings, camX, camY);
    }

    const endMs = typeof performance !== 'undefined' ? performance.now() : startMs;
    this.lastRenderMs = endMs - startMs;
  }

  private recordCongaTrail(state: SimState): void {
    if (!this.trailSeeded || Math.abs(state.tick - this.trailLastTick) > 20) {
      for (let i = 0; i < CONGA_TRAIL_LEN; i++) {
        this.trailX[i] = state.player.x;
        this.trailY[i] = state.player.y;
        this.trailFacing[i] = state.player.facing;
      }
      this.trailSeeded = true;
      this.trailLastTick = state.tick;
      return;
    }
    if (state.tick !== this.trailLastTick) {
      this.trailLastTick = state.tick;
      const lastX = this.trailX[this.trailHead];
      const lastY = this.trailY[this.trailHead];
      const dist2 = (state.player.x - lastX) ** 2 + (state.player.y - lastY) ** 2;
      if (dist2 >= 4) {
        this.trailHead = (this.trailHead + 1) % CONGA_TRAIL_LEN;
        this.trailX[this.trailHead] = state.player.x;
        this.trailY[this.trailHead] = state.player.y;
        this.trailFacing[this.trailHead] = state.player.facing;
      }
    }
  }

  private computeViewport(scalingMode: RenderSettings['scalingMode'], physW: number, physH: number): void {
    if (scalingMode === 'pixel-perfect' && physW >= VIEW_W && physH >= VIEW_H) {
      const intScale = Math.max(1, Math.floor(Math.min(physW / VIEW_W, physH / VIEW_H)));
      const w = VIEW_W * intScale;
      const h = VIEW_H * intScale;
      this.vpScratch[0] = Math.floor((physW - w) * 0.5);
      this.vpScratch[1] = Math.floor((physH - h) * 0.5);
      this.vpScratch[2] = w;
      this.vpScratch[3] = h;
      return;
    }
    const scale = Math.min(physW / VIEW_W, physH / VIEW_H);
    const w = Math.max(1, Math.round(VIEW_W * scale));
    const h = Math.max(1, Math.round(VIEW_H * scale));
    this.vpScratch[0] = Math.floor((physW - w) * 0.5);
    this.vpScratch[1] = Math.floor((physH - h) * 0.5);
    this.vpScratch[2] = w;
    this.vpScratch[3] = h;
  }

  private parseColorIntoScratch(hex: string | undefined): void {
    if (!hex || hex.length < 7) {
      this.tmpColor[0] = 1.0;
      this.tmpColor[1] = 0.88;
      this.tmpColor[2] = 0.23;
      return;
    }
    const clean = hex.charCodeAt(0) === 35 ? hex.slice(1, 7) : hex.slice(0, 6);
    const n = parseInt(clean, 16);
    if (Number.isNaN(n)) {
      this.tmpColor[0] = 1.0;
      this.tmpColor[1] = 0.88;
      this.tmpColor[2] = 0.23;
      return;
    }
    this.tmpColor[0] = ((n >> 16) & 255) / 255;
    this.tmpColor[1] = ((n >> 8) & 255) / 255;
    this.tmpColor[2] = (n & 255) / 255;
  }

  // ==========================================================================
  // WebGL2 5-Shader Render Pipeline
  // ==========================================================================

  private syncCustomTextureWebGL(gl: WebGL2RenderingContext): void {
    const ver = this.assetManager.getCustomAtlasVersion();
    if (ver === this.uploadedCustomVersion) return;
    const pack = this.assetManager.getCustomPack();
    if (!pack || !this.customTex) return;

    gl.bindTexture(gl.TEXTURE_2D, this.customTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, pack.width, pack.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pack.pixels);
    this.uploadedCustomVersion = ver;
  }

  private renderWebGL2(
    state: SimState,
    alpha: number,
    settings: RenderSettings,
    camX: number,
    camY: number
  ): void {
    const gl = this.gl!;
    const sh = this.shaders!;
    const theme = THEME_VISUALS[state.room.theme] ?? THEME_VISUALS.crypt;

    // 1. Bind crisp internal 960x540 FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, VIEW_W, VIEW_H);
    gl.clearColor(theme.skyTop[0], theme.skyTop[1], theme.skyTop[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Prepare default sprite shader (shd_pal_swapper with u_enableSwap = 0)
    this.useStandardSpriteShader(gl, sh);

    // 2. Layered multi-depth parallax cartoon backgrounds
    this.drawParallaxWebGL(theme, camX, camY, state);

    // 3. World Tiles & Diagonal 45° / 26.5° Slope Polygons
    this.drawTilesWebGL(state, theme, camX, camY);

    // 4. Doors, Props & Painted Hub Gate Signs
    this.drawDoorsAndPropsWebGL(state, camX, camY);

    // 5. Pickups & Rescued Toppin Pals Conga Line
    this.drawPickupsAndCongaWebGL(state, camX, camY);

    // 6. Enemies (non-flashing in main batch, stunned/flashing with shd_hit)
    this.drawEnemiesWebGL(state, alpha, camX, camY);

    // Flush main world geometry before specialized shader passes
    this.flushBatch(gl);

    // 7. Mach / Superjump Afterimages -> shd_color_afterimage!
    this.drawAfterimagesWebGL(gl, sh, camX, camY);

    // 8. Boss & Mega-Crust Chaser -> shd_outline (telegraph/vulnerable) + shd_hit!
    this.drawBossAndChaserWebGL(gl, sh, state, alpha, camX, camY);

    // 9. Projectiles (parryable projectiles emphasized via shd_outline!)
    this.drawProjectilesWebGL(gl, sh, state, alpha, camX, camY);

    // 10. Player -> shd_pal_swapper (6-color LUT costume!) OR shd_hit (parry/hitstop!)
    this.drawPlayerWebGL(gl, sh, state, alpha, camX, camY);

    // 11. Particles & Floating Bitmap-Font Score Pops
    this.useStandardSpriteShader(gl, sh);
    this.drawParticlesWebGL(camX, camY);

    // 12. Hitbox Debug Overlay (when settings.showHitboxes === true)
    if (settings.showHitboxes) {
      this.drawHitboxesWebGL(state, alpha, camX, camY);
    }
    this.flushBatch(gl);

    // 13. Krunk Time! Escape Atmosphere -> shd_panicbg!
    if (state.escape.active || state.room.alarmActiveTicks > 0) {
      this.drawPanicOverlayWebGL(gl, sh, state);
    }

    // 14. Present 960x540 FBO onto physical display canvas (fit / pixel-perfect nearest-neighbor)
    const physW = this.canvas!.width;
    const physH = this.canvas!.height;
    this.computeViewport(settings.scalingMode, physW, physH);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, physW, physH);
    gl.clearColor(0.06, 0.04, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.viewport(this.vpScratch[0], this.vpScratch[1], this.vpScratch[2], this.vpScratch[3]);
    gl.useProgram(sh.shd_present.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboColorTex);
    gl.uniform1i(sh.shd_present.uniforms.u_sceneTex, 0);

    const flashAlpha =
      state.flashTicks > 0 ? Math.min(0.65, state.flashTicks * 0.12) : state.player.state === 'parry' ? 0.25 : 0;
    gl.uniform4f(sh.shd_present.uniforms.u_screenFlash, 1.0, 0.98, 0.9, flashAlpha);

    gl.bindVertexArray(this.fullscreenVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.drawCalls++;
  }

  private useStandardSpriteShader(gl: WebGL2RenderingContext, sh: KrunkedShaderSuite): void {
    gl.useProgram(sh.shd_pal_swapper.program);
    gl.uniform2f(sh.shd_pal_swapper.uniforms.u_resolution, VIEW_W, VIEW_H);
    gl.uniform1i(sh.shd_pal_swapper.uniforms.u_tex, 0);
    gl.uniform1i(sh.shd_pal_swapper.uniforms.u_palLut, 1);
    gl.uniform1f(sh.shd_pal_swapper.uniforms.u_enableSwap, 0.0);
    gl.uniform1f(sh.shd_pal_swapper.uniforms.u_palRow, 0.0);
  }

  private flushBatch(gl: WebGL2RenderingContext): void {
    if (this.batchVertCount === 0) return;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.batchUseCustom && this.customTex ? this.customTex : this.builtinTex);

    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVbo);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.batchData.subarray(0, this.batchVertCount * FLOATS_PER_VERT)
    );
    gl.drawArrays(gl.TRIANGLES, 0, this.batchVertCount);
    gl.bindVertexArray(null);

    this.batchVertCount = 0;
    this.drawCalls++;
  }

  private ensureBatchCapacity(vertsNeeded: number, useCustom: boolean): void {
    if (
      (this.batchVertCount > 0 && useCustom !== this.batchUseCustom) ||
      this.batchVertCount + vertsNeeded > MAX_BATCH_VERTS
    ) {
      if (this.gl) this.flushBatch(this.gl);
    }
    this.batchUseCustom = useCustom;
  }

  private pushVert(x: number, y: number, u: number, v: number, r: number, g: number, b: number, a: number): void {
    const o = this.batchVertCount * FLOATS_PER_VERT;
    this.batchData[o] = x;
    this.batchData[o + 1] = y;
    this.batchData[o + 2] = u;
    this.batchData[o + 3] = v;
    this.batchData[o + 4] = r;
    this.batchData[o + 5] = g;
    this.batchData[o + 6] = b;
    this.batchData[o + 7] = a;
    this.batchVertCount++;
  }

  private pushColoredRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 1): void {
    this.ensureBatchCapacity(6, false);
    const u = this.whiteU;
    const v = this.whiteV;
    const x1 = x + w;
    const y1 = y + h;
    this.pushVert(x, y, u, v, r, g, b, a);
    this.pushVert(x1, y, u, v, r, g, b, a);
    this.pushVert(x1, y1, u, v, r, g, b, a);
    this.pushVert(x, y, u, v, r, g, b, a);
    this.pushVert(x1, y1, u, v, r, g, b, a);
    this.pushVert(x, y1, u, v, r, g, b, a);
  }

  private pushColoredTri(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: number,
    g: number,
    b: number,
    a = 1
  ): void {
    this.ensureBatchCapacity(3, false);
    const u = this.whiteU;
    const v = this.whiteV;
    this.pushVert(x0, y0, u, v, r, g, b, a);
    this.pushVert(x1, y1, u, v, r, g, b, a);
    this.pushVert(x2, y2, u, v, r, g, b, a);
  }

  private pushColoredLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    r: number,
    g: number,
    b: number,
    a = 1
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    const nx = (-dy / len) * (thickness * 0.5);
    const ny = (dx / len) * (thickness * 0.5);
    this.ensureBatchCapacity(6, false);
    const u = this.whiteU;
    const v = this.whiteV;
    this.pushVert(x0 + nx, y0 + ny, u, v, r, g, b, a);
    this.pushVert(x1 + nx, y1 + ny, u, v, r, g, b, a);
    this.pushVert(x1 - nx, y1 - ny, u, v, r, g, b, a);
    this.pushVert(x0 + nx, y0 + ny, u, v, r, g, b, a);
    this.pushVert(x1 - nx, y1 - ny, u, v, r, g, b, a);
    this.pushVert(x0 - nx, y0 - ny, u, v, r, g, b, a);
  }

  private pushRectOutline(x: number, y: number, w: number, h: number, t: number, r: number, g: number, b: number, a = 1): void {
    this.pushColoredRect(x, y, w, t, r, g, b, a);
    this.pushColoredRect(x, y + h - t, w, t, r, g, b, a);
    this.pushColoredRect(x, y, t, h, r, g, b, a);
    this.pushColoredRect(x + w - t, y, t, h, r, g, b, a);
  }

  private pushSprite(
    key: string,
    x: number,
    y: number,
    flipX = false,
    scaleX = 1,
    scaleY = 1,
    r = 1,
    g = 1,
    b = 1,
    a = 1,
    usePivot = true,
    rotation = 0
  ): void {
    const res = this.assetManager.resolveSprite(key);
    const rect = res.rect;
    const pack = res.useCustom ? this.assetManager.getCustomPack() : null;
    const texW = pack ? pack.width : this.assetManager.builtinAtlas.width;
    const texH = pack ? pack.height : this.assetManager.builtinAtlas.height;

    const u0 = rect.x / texW;
    const v0 = rect.y / texH;
    const u1 = (rect.x + rect.w) / texW;
    const v1 = (rect.y + rect.h) / texH;

    const ul = flipX ? u1 : u0;
    const ur = flipX ? u0 : u1;

    const w = rect.w * scaleX;
    const h = rect.h * scaleY;
    const ox = usePivot ? (flipX ? (rect.w - rect.pivotX) * scaleX : rect.pivotX * scaleX) : 0;
    const oy = usePivot ? rect.pivotY * scaleY : 0;

    this.ensureBatchCapacity(6, res.useCustom);

    if (rotation === 0) {
      const x0 = x - ox;
      const y0 = y - oy;
      const x1 = x0 + w;
      const y1 = y0 + h;
      this.pushVert(x0, y0, ul, v0, r, g, b, a);
      this.pushVert(x1, y0, ur, v0, r, g, b, a);
      this.pushVert(x1, y1, ur, v1, r, g, b, a);
      this.pushVert(x0, y0, ul, v0, r, g, b, a);
      this.pushVert(x1, y1, ur, v1, r, g, b, a);
      this.pushVert(x0, y1, ul, v1, r, g, b, a);
    } else {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const lx0 = -ox;
      const ly0 = -oy;
      const lx1 = w - ox;
      const ly1 = h - oy;
      const ax = x + lx0 * cos - ly0 * sin;
      const ay = y + lx0 * sin + ly0 * cos;
      const bx = x + lx1 * cos - ly0 * sin;
      const by = y + lx1 * sin + ly0 * cos;
      const cx = x + lx1 * cos - ly1 * sin;
      const cy = y + lx1 * sin + ly1 * cos;
      const dx = x + lx0 * cos - ly1 * sin;
      const dy = y + lx0 * sin + ly1 * cos;
      this.pushVert(ax, ay, ul, v0, r, g, b, a);
      this.pushVert(bx, by, ur, v0, r, g, b, a);
      this.pushVert(cx, cy, ur, v1, r, g, b, a);
      this.pushVert(ax, ay, ul, v0, r, g, b, a);
      this.pushVert(cx, cy, ur, v1, r, g, b, a);
      this.pushVert(dx, dy, ul, v1, r, g, b, a);
    }
  }

  private pushBitmapText(
    text: string,
    cx: number,
    y: number,
    scale: number,
    r: number,
    g: number,
    b: number,
    a = 1
  ): void {
    const snappedScale = scale >= 0.9 ? Math.round(scale) : 1;
    const step = 9 * snappedScale;
    let x = Math.round(cx - (text.length * step) * 0.5);
    const py = Math.round(y);
    for (let i = 0; i < text.length; i++) {
      const gk = fontGlyphKey(text[i]);
      if (gk) {
        this.pushSprite(gk, x, py, false, snappedScale, snappedScale, r, g, b, a, false);
      }
      x += step;
    }
  }

  private drawParallaxWebGL(theme: ThemeVisual, camX: number, camY: number, state: SimState): void {
    // 3-band sky gradient backdrop
    this.pushColoredRect(0, 0, VIEW_W, 180, theme.skyTop[0], theme.skyTop[1], theme.skyTop[2], 1);
    this.pushColoredRect(0, 180, VIEW_W, 190, theme.skyMid[0], theme.skyMid[1], theme.skyMid[2], 1);
    this.pushColoredRect(0, 370, VIEW_W, 170, theme.skyBot[0], theme.skyBot[1], theme.skyBot[2], 1);

    // Twinkling starfield on cosmic / night / penthouse themes (0.04x parallax, zero alloc)
    if (theme.starry) {
      const starShift = -(((camX * 0.04) % VIEW_W) + VIEW_W) % VIEW_W;
      for (let i = 0; i < STAR_POS_X.length; i++) {
        let sx = STAR_POS_X[i] + starShift;
        if (sx < 0) sx += VIEW_W;
        else if (sx >= VIEW_W) sx -= VIEW_W;
        const tw = 0.45 + 0.55 * Math.sin(this.animTime * 3.4 + i * 1.9);
        const sz = (i & 1) === 0 ? 3 : 2;
        this.pushColoredRect(sx, STAR_POS_Y[i], sz, sz, 1, 0.96, 0.78, tw);
      }
    }

    // Subtle animated comic horizon landmarks / clouds / domes / castles (0.12x parallax)
    const farSpan = 220;
    const cloudDrift = theme.motifFar === 'bg_cloud' ? this.animTime * 10 : 0;
    const farOff = -((((camX * 0.12) + cloudDrift) % farSpan) + farSpan) % farSpan;
    const farY = theme.motifFar === 'bg_cloud' || theme.motifFar === 'bg_pizza_moon'
      ? 148 - ((camY * 0.05) % 36)
      : 285 - ((camY * 0.06) % 40);
    const farRot = theme.spinFar ? this.animTime * 0.45 : 0;
    for (let x = farOff - farSpan; x < VIEW_W + farSpan; x += farSpan) {
      this.pushSprite(
        theme.motifFar,
        x + 80,
        farY,
        false,
        1.5,
        1.5,
        theme.farTint[0],
        theme.farTint[1],
        theme.farTint[2],
        0.76,
        true,
        farRot
      );
    }

    // Mid-depth thematic floor landmarks (0.28x parallax): saloons, cacti, palm piers,
    // subway arches, ice crystals, swaying haunted chandeliers, arcade cabinets, war trenches, spire cracks!
    const midSpan = theme.ceilingMid ? 210 : 176;
    const midOff = -(((camX * 0.28) % midSpan) + midSpan) % midSpan;
    const midY = theme.ceilingMid ? 44 - ((camY * 0.08) % 24) : 418 - ((camY * 0.1) % 48);
    const midRot = theme.spinMid
      ? -this.animTime * 0.75
      : theme.ceilingMid
        ? Math.sin(this.animTime * 1.8) * 0.06
        : 0;
    for (let x = midOff - midSpan; x < VIEW_W + midSpan; x += midSpan) {
      this.pushSprite(
        theme.motifMid,
        x + 70,
        midY,
        false,
        1.35,
        1.35,
        theme.midTint[0],
        theme.midTint[1],
        theme.midTint[2],
        0.68,
        true,
        midRot
      );
    }

    // Subtle lower wainscoting band for crisp foreground contrast (0.45x parallax)
    const checkerSpan = 64;
    const chkOff = -(((camX * 0.45) % checkerSpan) + checkerSpan) % checkerSpan;
    this.pushColoredRect(0, 420, VIEW_W, 120, theme.floorBand[0], theme.floorBand[1], theme.floorBand[2], 0.48);
    for (let x = chkOff - checkerSpan; x < VIEW_W + checkerSpan; x += checkerSpan) {
      this.pushColoredRect(
        x,
        420,
        32,
        12,
        theme.slopeTrim[0],
        theme.slopeTrim[1],
        theme.slopeTrim[2],
        state.escape.active ? 0.28 : 0.14
      );
    }
  }

  private drawTilesWebGL(state: SimState, theme: ThemeVisual, camX: number, camY: number): void {
    const room = state.room;
    if (room.widthTiles <= 0 || room.heightTiles <= 0) return;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const tx1 = Math.min(room.widthTiles - 1, Math.ceil((camX + VIEW_W) / TILE) + 1);
    const ty1 = Math.min(room.heightTiles - 1, Math.ceil((camY + VIEW_H) / TILE) + 1);

    const escapeActive = state.escape.active;
    const outletOpen = room.outletGateTimer > 0;
    const pulse = 0.72 + 0.28 * Math.sin(this.animTime * 8);

    for (let ty = ty0; ty <= ty1; ty++) {
      const rowOff = ty * room.widthTiles;
      const sy = ty * TILE - camY;
      for (let tx = tx0; tx <= tx1; tx++) {
        const idx = rowOff + tx;
        const raw = room.tiles[idx] as TileTypeValue;
        if (raw === TileType.EMPTY) continue;
        if (room.brokenMask[idx] !== 0) continue;

        const sx = tx * TILE - camX;

        if (isSlopeTile(raw)) {
          this.drawSlopePolygonWebGL(raw, sx, sy, theme);
          continue;
        }

        switch (raw) {
          case TileType.SOLID: {
            this.pushSprite(theme.solidTile, sx, sy, false, 1, 1, 1, 1, 1, 1, false);
            // Highlight crisp top trim if air above
            if (ty === 0 || room.tiles[(ty - 1) * room.widthTiles + tx] === TileType.EMPTY) {
              this.pushColoredRect(sx, sy, TILE, 3, theme.slopeTrim[0], theme.slopeTrim[1], theme.slopeTrim[2], 0.9);
              this.pushColoredRect(sx, sy, TILE, 1.5, 0.07, 0.05, 0.08, 1);
            }
            break;
          }
          case TileType.ONE_WAY:
            this.pushSprite('tile_one_way', sx, sy, false, 1, 1, 1, 1, 1, 1, false);
            break;
          case TileType.BREAK_MARBLE:
            this.pushSprite('tile_break_marble', sx, sy, false, 1, 1, 1, 1, 1, 1, false);
            break;
          case TileType.BREAK_METAL:
            this.pushSprite('tile_break_metal', sx, sy, false, 1, 1, 1, 1, 1, 1, false);
            break;
          case TileType.PILLAR_BLOCK_CLOSED:
            this.pushSprite(
              escapeActive ? 'tile_pillar_open' : 'tile_pillar_closed',
              sx,
              sy,
              false,
              1,
              1,
              1,
              1,
              1,
              escapeActive ? 0.55 : 1,
              false
            );
            break;
          case TileType.PILLAR_BLOCK_OPEN:
            this.pushSprite(
              escapeActive ? 'tile_pillar_closed' : 'tile_pillar_open',
              sx,
              sy,
              false,
              1,
              1,
              1,
              1,
              1,
              escapeActive ? 1 : 0.45,
              false
            );
            break;
          case TileType.ICE_SOLID:
            this.pushSprite('tile_ice_solid', sx, sy, false, 1, 1, 1, 1, 1, 1, false);
            break;
          case TileType.CONVEYOR_RIGHT:
            this.pushSprite('tile_conveyor_r', sx, sy, false, 1, 1, 1, 1, 1, 1, false);
            break;
          case TileType.CONVEYOR_LEFT:
            this.pushSprite('tile_conveyor_l', sx, sy, false, 1, 1, 1, 1, 1, 1, false);
            break;
          case TileType.LAVA_HAZARD:
            this.pushSprite(
              'tile_lava',
              sx,
              sy + Math.sin(this.animTime * 6 + tx) * 1.5,
              false,
              1,
              1,
              1,
              pulse,
              0.9,
              1,
              false
            );
            break;
          case TileType.SPIKE_HAZARD:
            this.pushSprite('tile_spike', sx, sy, false, 1, 1, 1, 1, 1, 1, false);
            break;
          case TileType.CHEESE_STICK_WALL:
            this.pushSprite('tile_cheese_wall', sx, sy, false, 1, 1, 1, 1, 1, 1, false);
            break;
          case TileType.BREAK_OUTLET_GATE:
            this.pushSprite('tile_outlet_gate', sx, sy, false, 1, 1, 1, 1, 1, outletOpen ? 0.25 : 1, false);
            break;
          case TileType.SECRET_WALL:
            this.pushSprite(theme.solidTile, sx, sy, false, 1, 1, 1, 1, 1, 0.88, false);
            this.pushSprite('tile_secret_wall', sx, sy, false, 1, 1, 1, 1, 1, 0.35 + 0.15 * pulse, false);
            break;
        }
      }
    }
  }

  private drawSlopePolygonWebGL(t: TileTypeValue, sx: number, sy: number, theme: ThemeVisual): void {
    const x0 = sx;
    const x1 = sx + TILE;
    const y0 = sy;
    const ym = sy + TILE * 0.5;
    const y1 = sy + TILE;
    const [fr, fg, fb] = theme.slopeFill;
    const [tr, tg, tb] = theme.slopeTrim;

    let ax = x0;
    let ay = y1;
    let bx = x1;
    let by = y0;

    switch (t) {
      case TileType.SLOPE_45_UP_RIGHT:
        this.pushColoredTri(x0, y1, x1, y0, x1, y1, fr, fg, fb, 1);
        ax = x0; ay = y1; bx = x1; by = y0;
        break;
      case TileType.SLOPE_45_UP_LEFT:
        this.pushColoredTri(x0, y0, x1, y1, x0, y1, fr, fg, fb, 1);
        ax = x0; ay = y0; bx = x1; by = y1;
        break;
      case TileType.SLOPE_26_LOW_RIGHT:
        this.pushColoredTri(x0, y1, x1, ym, x1, y1, fr, fg, fb, 1);
        ax = x0; ay = y1; bx = x1; by = ym;
        break;
      case TileType.SLOPE_26_HIGH_RIGHT:
        this.pushColoredTri(x0, ym, x1, y0, x1, y1, fr, fg, fb, 1);
        this.pushColoredTri(x0, ym, x1, y1, x0, y1, fr * 0.9, fg * 0.9, fb * 0.9, 1);
        ax = x0; ay = ym; bx = x1; by = y0;
        break;
      case TileType.SLOPE_26_HIGH_LEFT:
        this.pushColoredTri(x0, y0, x1, ym, x1, y1, fr, fg, fb, 1);
        this.pushColoredTri(x0, y0, x1, y1, x0, y1, fr * 0.9, fg * 0.9, fb * 0.9, 1);
        ax = x0; ay = y0; bx = x1; by = ym;
        break;
      case TileType.SLOPE_26_LOW_LEFT:
        this.pushColoredTri(x0, ym, x1, y1, x0, y1, fr, fg, fb, 1);
        ax = x0; ay = ym; bx = x1; by = y1;
        break;
    }

    // Crisp bright top trim highlight + hand-inked dark edge on diagonal surface!
    this.pushColoredLine(ax, ay + 2, bx, by + 2, 4.5, tr, tg, tb, 1);
    this.pushColoredLine(ax, ay, bx, by, 2.0, 0.07, 0.05, 0.08, 1);
  }

  private drawDoorsAndPropsWebGL(state: SimState, camX: number, camY: number): void {
    // Room Doors
    const doors = state.room.doors;
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i];
      const sx = d.x - camX;
      const sy = d.y - camY;
      if (sx < -120 || sx > VIEW_W + 120 || sy < -120 || sy > VIEW_H + 120) continue;
      const locked = Boolean(d.escapeLocked && state.escape.active);
      this.pushSprite('prop_exit_door', sx, sy, false, 0.9, 0.9, locked ? 0.55 : 1, locked ? 0.45 : 1, locked ? 0.5 : 1, 1);
      if (d.label) {
        this.pushBitmapText(d.label.slice(0, 14), sx, sy - 82, 0.72, 1, 0.93, 0.55, 1);
      }
    }

    // World Props
    const props = state.props;
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (!prop.active) continue;
      const sx = prop.x - camX;
      const sy = prop.y - camY;
      if (sx < -140 || sx > VIEW_W + 140 || sy < -140 || sy > VIEW_H + 140) continue;

      if (prop.kind === 'toppin_cage' && !prop.triggered) {
        // Draw adorable trapped Toppin Pal hopping inside the cage!
        const tIdx = (prop.index ?? 0) % 5;
        const hop = Math.abs(Math.sin(this.animTime * 6 + prop.id)) * 4;
        this.pushSprite(TOPPIN_SPRITE_KEYS[tIdx], sx, sy - 6 - hop, false, 1, 1);
        this.pushSprite('prop_toppin_cage', sx, sy, false, 1, 1);
      } else if (prop.kind === 'lap2_portal') {
        const sc = 1 + Math.sin(this.animTime * 7) * 0.08;
        this.pushSprite('prop_lap2_portal', sx, sy - 32, false, sc, sc, 1, 1, 1, 1, true, this.animTime * 2.2);
        this.pushBitmapText('LAP 2!', sx, sy - 76, 0.85, 1, 0.85, 0.25, 1);
      } else if (prop.kind === 'secret_eye') {
        const bob = Math.sin(this.animTime * 5 + prop.id) * 4;
        this.pushSprite('prop_secret_eye', sx, sy - 24 + bob, false, 1, 1);
      } else if (prop.kind === 'pillar_chronos') {
        const shake = prop.triggered ? 0 : Math.sin(this.animTime * 3) * 0.5;
        this.pushSprite('prop_pillar_chronos', sx + shake, sy, false, 1, 1, prop.triggered ? 0.5 : 1, 1, 1, prop.triggered ? 0.35 : 1);
      } else if (prop.kind === 'golf_ball') {
        // Rolling dimpled Golf Ball resting cleanly on ground with dynamic spin & stroke tag!
        const vy = prop.vy ?? 0;
        const squashX = Math.abs(vy) > 2.5 ? 0.9 : 1.04;
        const squashY = Math.abs(vy) > 2.5 ? 1.12 : 0.96;
        this.pushSprite('prop_golf_ball', sx, sy - 14, false, squashX, squashY, 1, 1, 1, 1, true, prop.x * 0.09);
        const strokes = Math.max(0, Math.min(GOLF_STROKE_LABELS.length - 1, prop.strokes ?? 0));
        const overPar = strokes > (prop.parCount ?? 3);
        this.pushBitmapText(
          GOLF_STROKE_LABELS[strokes],
          sx,
          sy - 46,
          0.75,
          overPar ? 1 : 0.68,
          overPar ? 0.55 : 1,
          overPar ? 0.45 : 0.55,
          0.95
        );
      } else if (prop.kind === 'golf_goal') {
        // Golf Goal Cup with animated waving pennant flag & glowing victory star!
        this.pushSprite('prop_golf_goal', sx, sy, false, 1, 1);
        const wave = Math.sin(this.animTime * 7 + prop.id) * 2.5;
        this.pushColoredTri(sx, sy - 50, sx + 22, sy - 42 + wave, sx, sy - 34, 1.0, 0.24, 0.28, 0.95);
        this.pushColoredRect(sx - 12, sy - 6, 24, 3, 0.48, 0.96, 0.48, 0.65);
        if (prop.triggered) {
          this.pushSprite('fx_starburst', sx, sy - 56, false, 0.72, 0.72, 1, 0.92, 0.3, 0.95, true, this.animTime * 3);
          this.pushBitmapText('PAR!', sx, sy - 78, 0.85, 1, 0.95, 0.35, 1);
        }
      } else if (prop.kind === 'time_terminal') {
        // WAR Time Terminal with animated ticking radar clock & CRT scanline sweep!
        this.pushSprite('prop_time_terminal', sx, sy, false, 1, 1);
        const screenX = sx - 12;
        const screenY = sy - 42;
        const scanY = screenY + ((this.animTime * 22) % 16);
        this.pushColoredRect(screenX + 1, scanY, 22, 2, 0.66, 1.0, 0.32, 0.65);
        // Ticking second hand stepping crisply at 4 ticks/sec
        const tickAngle = Math.floor(this.animTime * 4) * (Math.PI / 6) - Math.PI * 0.5;
        const cx0 = sx;
        const cy0 = screenY + 9;
        this.pushColoredLine(cx0, cy0, cx0 + Math.cos(tickAngle) * 7, cy0 + Math.sin(tickAngle) * 7, 2, 0.75, 1.0, 0.4, 1);
        // Blinking alert LED + "+30S" callout
        const ledOn = Math.sin(this.animTime * 10 + prop.id) > 0;
        this.pushSprite('fx_circle', sx + 10, sy - 16, false, 0.42, 0.42, ledOn ? 1 : 0.4, ledOn ? 0.35 : 0.95, 0.25, 0.9);
        this.pushBitmapText('+30S', sx, sy - 74, 0.8, 0.66, 1.0, 0.38, 0.95);
      } else if (prop.kind === 'taxi_warp') {
        // Yellow checkered Taxi Warp cab with idling engine bounce & headlight beam!
        const rumble = Math.sin(this.animTime * 18 + prop.id) * 1.1;
        this.pushSprite('fx_beacon_cone', sx + 26, sy - 16 + rumble, false, 1.15, 0.72, 1.0, 0.94, 0.45, 0.55);
        this.pushSprite('prop_taxi_warp', sx, sy + rumble, false, 1, 1);
        const signGlow = 0.75 + 0.25 * Math.sin(this.animTime * 8);
        this.pushBitmapText('TAXI', sx, sy - 58, 0.8, 1.0, 0.92, 0.28, signGlow);
      } else if (prop.kind === 'alarm_sensor') {
        // Rotating crimson Alarm Sensor beacon with dual sweeping warning light cones!
        const alarmHot = state.room.alarmActiveTicks > 0;
        const sweepA = this.animTime * (alarmHot ? 9.5 : 2.6) + prop.id;
        const coneAlpha = alarmHot ? 0.72 : 0.42;
        const coneScale = alarmHot ? 1.5 : 1.15;
        const by = sy - 24;
        this.pushSprite('fx_beacon_cone', sx, by, false, coneScale, 0.9, 1.0, alarmHot ? 0.14 : 0.26, 0.18, coneAlpha, true, sweepA);
        this.pushSprite('fx_beacon_cone', sx, by, false, coneScale, 0.9, 1.0, alarmHot ? 0.14 : 0.26, 0.18, coneAlpha, true, sweepA + Math.PI);
        this.pushSprite('prop_alarm_sensor', sx, by, false, 1, 1);
        if (alarmHot && Math.sin(this.animTime * 22) > 0) {
          this.pushSprite('fx_parry_ring', sx, by, false, 0.85, 0.85, 1.0, 0.22, 0.22, 0.85);
          this.pushBitmapText('ALERT!', sx, by - 32, 0.78, 1.0, 0.28, 0.3, 1);
        }
      } else if (prop.kind === 'dash_button') {
        // Glowing floor Dash Button switch! Depresses & shines electric lime while outlet gate is open!
        const gateOpen = state.room.outletGateTimer > 0;
        const pulse = 0.65 + 0.35 * Math.sin(this.animTime * (gateOpen ? 16 : 6));
        const haloR = gateOpen ? 0.32 : 1.0;
        const haloG = gateOpen ? 1.0 : 0.28;
        const haloB = gateOpen ? 0.55 : 0.25;
        // Glowing base floor aura
        this.pushSprite('fx_circle', sx, sy - 10, false, 1.85, 0.65, haloR, haloG, haloB, 0.35 + 0.2 * pulse);
        this.pushSprite('prop_dash_button', sx, sy, false, 1, gateOpen ? 0.78 : 1, gateOpen ? 0.75 : 1, gateOpen ? 1 : 0.95, gateOpen ? 0.8 : 0.95, 1);
        // Illuminated top dome indicator bar
        this.pushColoredRect(sx - 10, sy - (gateOpen ? 16 : 21), 20, 4, haloR, haloG, haloB, 0.92);
        if (gateOpen) {
          const pct = Math.min(1, state.room.outletGateTimer / 360);
          this.pushColoredRect(sx - 16, sy - 30, 32, 4, 0.1, 0.08, 0.14, 0.85);
          this.pushColoredRect(sx - 15, sy - 29, 30 * pct, 2, 0.35, 1.0, 0.6, 1);
        }
      } else {
        const key = propToSpriteKey(prop);
        const dim = prop.triggered && prop.kind === 'treasure_chest' ? 0.55 : 1;
        this.pushSprite(key, sx, sy, false, 1, 1, dim, dim, dim, 1);
      }

      // Clear painted sign banners above Hub gates, elevators & tutorial signs
      if (
        prop.label &&
        (prop.kind === 'hub_stage_gate' ||
          prop.kind === 'hub_boss_gate' ||
          prop.kind === 'hub_elevator' ||
          prop.kind === 'hub_bonus_gate' ||
          prop.kind === 'tutorial_sign')
      ) {
        const cleanLabel = prop.label.slice(0, 24);
        const bannerW = Math.max(88, cleanLabel.length * 9 + 18);
        const bannerY = prop.kind === 'tutorial_sign' ? sy - 72 : sy - 114;
        this.pushColoredRect(sx - bannerW * 0.5, bannerY - 6, bannerW, 24, 0.1, 0.07, 0.14, 0.92);
        this.pushRectOutline(sx - bannerW * 0.5, bannerY - 6, bannerW, 24, 2, 1, 0.84, 0.28, 1);
        this.pushBitmapText(cleanLabel, sx, bannerY - 1, 1, 1, 0.96, 0.75, 1);
      }
    }
  }

  private drawPickupsAndCongaWebGL(state: SimState, camX: number, camY: number): void {
    // Pickups
    const pickups = state.pickups;
    for (let i = 0; i < pickups.length; i++) {
      const pk = pickups[i];
      if (pk.collected) continue;
      const sx = pk.x - camX;
      const sy = pk.y - camY + Math.sin(this.animTime * 6 + pk.bobOffset) * 3.5;
      if (sx < -48 || sx > VIEW_W + 48 || sy < -48 || sy > VIEW_H + 48) continue;

      const key =
        pk.kind === 'big_topping'
          ? 'pickup_big_topping'
          : pk.kind === 'pizza_slice'
            ? 'pickup_pizza_slice'
            : pk.kind === 'clock_pickup'
              ? 'pickup_clock'
              : pk.kind === 'pumpkin'
                ? 'pickup_pumpkin'
                : 'pickup_small_topping';
      this.pushSprite(key, sx, sy, false, 1, 1);
    }

    // Rescued Toppin Pals trailing behind the player in a bouncy conga line!
    let congaRank = 0;
    const collected = state.stageStats.toppinsCollected;
    for (let t = 0; t < 5; t++) {
      if (!collected[t]) continue;
      congaRank++;
      const lag = Math.min(CONGA_TRAIL_LEN - 1, congaRank * 9);
      const slot = (this.trailHead - lag + CONGA_TRAIL_LEN) % CONGA_TRAIL_LEN;
      const hop = Math.abs(Math.sin(this.animTime * 10 + t * 1.1)) * 7;
      const tx = this.trailX[slot] - camX;
      const ty = this.trailY[slot] - camY - hop;
      const flip = this.trailFacing[slot] < 0;
      this.pushSprite(TOPPIN_SPRITE_KEYS[t], tx, ty, flip, 1, 1);
    }
  }

  private drawEnemiesWebGL(state: SimState, alpha: number, camX: number, camY: number): void {
    const enemies = state.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      const ex = lerp(e.prevX, e.x, alpha) - camX;
      const ey = lerp(e.prevY, e.y, alpha) - camY;
      if (ex < -96 || ex > VIEW_W + 96 || ey < -96 || ey > VIEW_H + 96) continue;

      const jitterX = e.scared ? Math.sin(this.animTime * 48 + e.id) * 2.5 : 0;
      const wobY = e.grounded && Math.abs(e.vx) > 0.2 ? Math.abs(Math.sin(this.animTime * 12 + e.id)) * 3 : 0;
      const rot = e.stunTicks > 0 ? Math.sin(this.animTime * 18 + e.id) * 0.22 : 0;
      const key = ENEMY_SPRITE_KEYS[e.archetype];
      this.pushSprite(
        key,
        ex + jitterX,
        ey - wobY,
        e.facing < 0,
        1,
        1,
        1,
        e.stunTicks > 0 ? 0.78 : 1,
        e.stunTicks > 0 ? 0.78 : 1,
        1,
        true,
        rot
      );
      if (e.scared) {
        this.pushBitmapText('!', ex, ey - e.height - 14, 0.85, 1, 0.9, 0.2, 1);
      }
    }
  }

  private drawAfterimagesWebGL(
    gl: WebGL2RenderingContext,
    sh: KrunkedShaderSuite,
    camX: number,
    camY: number
  ): void {
    if (this.particles.activeAfterimageCount === 0) return;

    gl.useProgram(sh.shd_color_afterimage.program);
    gl.uniform2f(sh.shd_color_afterimage.uniforms.u_resolution, VIEW_W, VIEW_H);
    gl.uniform1i(sh.shd_color_afterimage.uniforms.u_tex, 0);
    gl.uniform1f(sh.shd_color_afterimage.uniforms.u_time, this.animTime);

    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      const slot = this.particles.afterimages[i];
      if (!slot.active) continue;
      const life = 1 - slot.age / slot.maxAge;
      this.pushSprite(
        slot.spriteKey,
        slot.x - camX,
        slot.y - camY,
        slot.facing < 0,
        1,
        1,
        slot.r,
        slot.g,
        slot.b,
        slot.alpha * life
      );
    }
    this.flushBatch(gl);
  }

  private drawBossAndChaserWebGL(
    gl: WebGL2RenderingContext,
    sh: KrunkedShaderSuite,
    state: SimState,
    alpha: number,
    camX: number,
    camY: number
  ): void {
    const boss = state.boss;
    if (boss && boss.aiState !== 'defeated') {
      this.drawSingleBossWebGL(gl, sh, boss, alpha, camX, camY);
    }

    if (state.escape.megaCrustActive) {
      const mx = state.escape.megaCrustX - camX;
      const my = state.escape.megaCrustY - camY + Math.sin(this.animTime * 5) * 8;
      const pulse = 1.05 + Math.sin(this.animTime * 11) * 0.06;
      const res = this.assetManager.resolveSprite('mega_crust_chaser');
      const pack = res.useCustom ? this.assetManager.getCustomPack() : null;
      const texW = pack ? pack.width : this.assetManager.builtinAtlas.width;
      const texH = pack ? pack.height : this.assetManager.builtinAtlas.height;

      // Render Mega-Crust with dramatic crimson shd_outline!
      gl.useProgram(sh.shd_outline.program);
      gl.uniform2f(sh.shd_outline.uniforms.u_resolution, VIEW_W, VIEW_H);
      gl.uniform1i(sh.shd_outline.uniforms.u_tex, 0);
      gl.uniform2f(sh.shd_outline.uniforms.u_texelSize, 1 / texW, 1 / texH);
      gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 1.0, 0.16, 0.25, 1.0);
      gl.uniform1f(sh.shd_outline.uniforms.u_thickness, 2.0);
      gl.uniform4f(
        sh.shd_outline.uniforms.u_uvBounds,
        res.rect.x / texW,
        res.rect.y / texH,
        (res.rect.x + res.rect.w) / texW,
        (res.rect.y + res.rect.h) / texH
      );
      this.pushSprite(
        'mega_crust_chaser',
        mx,
        my + 44,
        false,
        pulse,
        pulse,
        1,
        1,
        1,
        1,
        true,
        Math.sin(this.animTime * 4) * 0.12
      );
      this.flushBatch(gl);
    }
  }

  private drawSingleBossWebGL(
    gl: WebGL2RenderingContext,
    sh: KrunkedShaderSuite,
    boss: BossState,
    alpha: number,
    camX: number,
    camY: number
  ): void {
    const bx = lerp(boss.prevX, boss.x, alpha) - camX;
    const isMegaMoonPhase1 = boss.id === 'b_megacrust' && boss.phase === 1;
    const hoverY = isMegaMoonPhase1 ? -10 + Math.sin(this.animTime * 4.5) * 6 : 0;
    const by = lerp(boss.prevY, boss.y, alpha) - camY + hoverY;
    const key = resolveBossSpriteKey(boss);
    const res = this.assetManager.resolveSprite(key);
    const pack = res.useCustom ? this.assetManager.getCustomPack() : null;
    const texW = pack ? pack.width : this.assetManager.builtinAtlas.width;
    const texH = pack ? pack.height : this.assetManager.builtinAtlas.height;

    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 14);
    const centerY = by - boss.height * 0.52;

    // 1. Distinct Phase 1 / Phase 2 / Phase 3 visual aura rendered behind Boss!
    if (boss.phase >= 2 || isMegaMoonPhase1 || boss.aiState === 'phase_shift') {
      this.useStandardSpriteShader(gl, sh);
      if (isMegaMoonPhase1) {
        // Phase 1 Mega-Crust: eerie crimson-violet floating moon corona!
        const moonScale = 2.05 + pulse * 0.22;
        this.pushSprite('fx_parry_ring', bx, centerY, false, moonScale, moonScale, 0.82, 0.2, 0.92, 0.42);
      } else if (boss.id === 'b_megacrust' && boss.phase >= 3) {
        // Phase 3 Lord Dough Overdrive: blazing dual counter-spinning golden/crimson starbursts + sparks!
        this.pushSprite('fx_starburst', bx, centerY, false, 2.3 + pulse * 0.25, 2.3 + pulse * 0.25, 1.0, 0.2, 0.25, 0.62, true, this.animTime * 2.8);
        this.pushSprite('fx_starburst', bx, centerY, false, 1.75 + pulse * 0.2, 1.75 + pulse * 0.2, 1.0, 0.88, 0.2, 0.58, true, -this.animTime * 3.6);
        const a0 = this.animTime * 6;
        this.pushSprite('fx_spark', bx + Math.cos(a0) * 44, centerY + Math.sin(a0) * 32, false, 1.15, 1.15, 0.3, 0.95, 1.0, 0.95);
        this.pushSprite('fx_spark', bx - Math.cos(a0) * 44, centerY - Math.sin(a0) * 32, false, 1.15, 1.15, 1.0, 0.9, 0.25, 0.95);
      } else if (boss.phase >= 2) {
        // Phase 2 (Lord Dough royal violet/gold aura or Boss 1-4 fiery rage aura!)
        const isLordDoughP2 = boss.id === 'b_megacrust';
        const auraR = isLordDoughP2 ? 0.72 : 1.0;
        const auraG = isLordDoughP2 ? 0.28 : 0.45;
        const auraB = isLordDoughP2 ? 0.96 : 0.16;
        const ringSc = 1.9 + pulse * 0.22;
        this.pushSprite('fx_parry_ring', bx, centerY, false, ringSc, ringSc, auraR, auraG, auraB, 0.52);
        const orbA = this.animTime * 5;
        this.pushSprite('fx_spark', bx + Math.cos(orbA) * 38, centerY + Math.sin(orbA) * 26, false, 0.95, 0.95, 1.0, 0.88, 0.28, 0.9);
      }
      if (boss.aiState === 'phase_shift') {
        const waveSc = 2.4 + pulse * 0.6;
        this.pushSprite('fx_parry_ring', bx, centerY, false, waveSc, waveSc, 1.0, 0.85, 0.25, 0.82);
      }
      this.flushBatch(gl);
    }

    // 2. Boss body with squash/stretch + crisp shd_hit / shd_outline glow!
    let stretchX = boss.aiState === 'charge' ? 1.15 : boss.aiState === 'jump_slam' ? 0.9 : 1;
    let stretchY = boss.aiState === 'charge' ? 0.9 : boss.aiState === 'jump_slam' ? 1.15 : 1;
    if (boss.aiState === 'phase_shift') {
      stretchX = 1 + Math.sin(this.animTime * 28) * 0.12;
      stretchY = 1 - Math.sin(this.animTime * 28) * 0.1;
    }
    const rot = isMegaMoonPhase1
      ? Math.sin(this.animTime * 3.5) * 0.09
      : boss.aiState === 'vulnerable'
        ? Math.sin(this.animTime * 16) * 0.1
        : 0;

    const isHitFlash = boss.flashTicks > 0 || boss.aiState === 'hurt';
    const isHighNoonWindow =
      boss.id === 'b_cheddar' && (boss.aiState === 'telegraph' || boss.aiState === 'projectile');
    const isOverdriveRim = boss.id === 'b_megacrust' && boss.phase >= 3;
    const isTelegraphOutline =
      boss.aiState === 'telegraph' ||
      boss.aiState === 'vulnerable' ||
      boss.aiState === 'phase_shift' ||
      boss.parryable ||
      isHighNoonWindow ||
      isOverdriveRim;

    if (isHitFlash) {
      gl.useProgram(sh.shd_hit.program);
      gl.uniform2f(sh.shd_hit.uniforms.u_resolution, VIEW_W, VIEW_H);
      gl.uniform1i(sh.shd_hit.uniforms.u_tex, 0);
      gl.uniform1f(sh.shd_hit.uniforms.u_flashStrength, 0.92);
      gl.uniform1f(sh.shd_hit.uniforms.u_invertMode, 0.0);
    } else if (isTelegraphOutline) {
      gl.useProgram(sh.shd_outline.program);
      gl.uniform2f(sh.shd_outline.uniforms.u_resolution, VIEW_W, VIEW_H);
      gl.uniform1i(sh.shd_outline.uniforms.u_tex, 0);
      gl.uniform2f(sh.shd_outline.uniforms.u_texelSize, 1 / texW, 1 / texH);
      let thick = 2.0;
      if (boss.parryable) {
        // Blazing parryable window gold outline!
        gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 1.0, 0.92, 0.18, 1.0);
        thick = 2.3 + 0.7 * pulse;
      } else if (isHighNoonWindow) {
        // High-Noon showdown bright sunset-gold/white telegraph glow!
        gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 1.0, 0.78 + 0.2 * pulse, 0.22 + 0.4 * pulse, 1.0);
        thick = 2.5 + 0.6 * pulse;
      } else if (boss.aiState === 'vulnerable') {
        // Dizzy punish window electric cyan outline!
        gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 0.25, 0.96, 1.0, 1.0);
        thick = 2.2;
      } else if (boss.aiState === 'phase_shift') {
        gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 1.0, 0.35, 0.95, 1.0);
        thick = 2.8;
      } else if (boss.aiState === 'telegraph') {
        gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 1.0, 0.18, 0.26, 1.0);
        thick = 2.4;
      } else {
        // Phase 3 Overdrive blazing rim!
        gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 1.0, 0.42 + 0.45 * pulse, 0.16, 1.0);
        thick = 2.0 + 0.5 * pulse;
      }
      gl.uniform1f(sh.shd_outline.uniforms.u_thickness, thick);
      gl.uniform4f(
        sh.shd_outline.uniforms.u_uvBounds,
        res.rect.x / texW,
        res.rect.y / texH,
        (res.rect.x + res.rect.w) / texW,
        (res.rect.y + res.rect.h) / texH
      );
    } else {
      this.useStandardSpriteShader(gl, sh);
    }

    this.pushSprite(key, bx, by, boss.facing < 0, stretchX, stretchY, 1, 1, 1, 1, true, rot);
    this.flushBatch(gl);

    // 3. Boss crisp foreground telegraph cues, High-Noon glint, Cheddar muzzle flash & dizzy stars!
    const needForegroundCue =
      boss.parryable ||
      isHighNoonWindow ||
      boss.aiState === 'telegraph' ||
      boss.aiState === 'vulnerable' ||
      (boss.id === 'b_cheddar' && this.bossMuzzleFlashTimer > 0);
    if (needForegroundCue) {
      this.useStandardSpriteShader(gl, sh);
      if (isHighNoonWindow && boss.aiState === 'telegraph') {
        // Dramatic western High-Noon sun glint right on Sheriff Cheddar's six-shooter + "DRAW!"
        const gx = bx + boss.facing * 36;
        const gy = by - 34;
        this.pushSprite('fx_starburst', gx, gy, false, 0.72 + pulse * 0.28, 0.72 + pulse * 0.28, 1, 0.94, 0.35, 0.95, true, this.animTime * 8);
        this.pushBitmapText('DRAW!', bx, by - boss.height - 26, 0.92, 1, 0.9, 0.22, 1);
      } else if (boss.parryable) {
        this.pushSprite('fx_spark', bx + boss.facing * 26, centerY - 14, false, 1.2 + pulse * 0.35, 1.2 + pulse * 0.35, 1, 0.95, 0.28, 0.95, true, this.animTime * 9);
      } else if (boss.aiState === 'telegraph') {
        this.pushBitmapText('!', bx, by - boss.height - 24, 1.0, 1, 0.28, 0.3, 1);
      } else if (boss.aiState === 'vulnerable') {
        // Orbiting cartoon dizzy stars above stunned boss!
        const da = this.animTime * 8;
        this.pushSprite('fx_spark', bx + Math.cos(da) * 24, by - boss.height - 10 + Math.sin(da) * 6, false, 0.95, 0.95, 1, 0.92, 0.25, 0.95);
        this.pushSprite('fx_spark', bx - Math.cos(da) * 24, by - boss.height - 10 - Math.sin(da) * 6, false, 0.95, 0.95, 0.35, 0.95, 1, 0.95);
      }
      if (boss.id === 'b_cheddar' && this.bossMuzzleFlashTimer > 0) {
        const mfSc = 0.9 + (this.bossMuzzleFlashTimer / 0.14) * 0.45;
        this.pushSprite('fx_muzzle_flash', bx + boss.facing * 42, by - 31, boss.facing < 0, mfSc, mfSc, 1, 1, 1, 1);
      }
      this.flushBatch(gl);
    }
  }

  private drawProjectilesWebGL(
    gl: WebGL2RenderingContext,
    sh: KrunkedShaderSuite,
    state: SimState,
    alpha: number,
    camX: number,
    camY: number
  ): void {
    const projs = state.projectiles;
    if (projs.length === 0) return;

    this.useStandardSpriteShader(gl, sh);
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      const px = lerp(p.prevX, p.x, alpha) - camX;
      const py = lerp(p.prevY, p.y, alpha) - camY;
      if (px < -64 || px > VIEW_W + 64 || py < -64 || py > VIEW_H + 64) continue;

      this.parseColorIntoScratch(p.color);
      const cr = this.tmpColor[0];
      const cg = this.tmpColor[1];
      const cb = this.tmpColor[2];
      const rad = Math.max(5, p.radius);
      const scale = (rad * 2) / 20;

      if (p.parryable) {
        // Glowing golden parryable indicator halo around parryable projectiles
        const ringScale = (rad * 3.1) / 48;
        this.pushSprite('fx_parry_ring', px, py, false, ringScale, ringScale, 1, 0.92, 0.25, 0.9);
      }

      if (p.kind === 'flame') {
        this.pushSprite('fx_flame', px, py, p.vx < 0, scale * 1.15, scale * 1.15, 1, 1, 1, 1);
      } else if (p.kind === 'golf_shot' || p.kind === 'bowling_ball') {
        this.pushSprite('prop_golf_ball', px, py, false, scale * 0.85, scale * 0.85, cr, cg, cb, 1, true, this.animTime * 10);
      } else if (p.kind === 'shotgun_pellet' || p.kind === 'bullet') {
        // Crisp directional tracer streak + glowing brass round!
        this.pushSprite('fx_speed_line', px - Math.sign(p.vx || 1) * 10, py, p.vx > 0, 0.75, 0.7, 1, 0.82, 0.25, 0.85);
        this.pushSprite('fx_circle', px, py, false, scale * 1.2, scale * 0.95, 0.07, 0.05, 0.08, 1);
        this.pushSprite('fx_circle', px, py, false, scale * 0.95, scale * 0.72, 1, 0.92, 0.35, 1);
      } else if (p.kind === 'charged_shot') {
        // Piercing electric cyan Revolver Charged Shot with crackling halo!
        this.pushSprite('fx_parry_ring', px, py, false, 0.72, 0.72, 0.25, 0.95, 1, 0.88);
        this.pushSprite('fx_starburst', px, py, false, 0.65, 0.65, 0.3, 0.95, 1, 1, true, this.animTime * 14);
        this.pushSprite('fx_circle', px, py, false, scale * 0.75, scale * 0.75, 1, 1, 1, 1);
      } else if (p.kind === 'dynamite') {
        this.pushColoredRect(px - 6, py - 3, 12, 6, 0.92, 0.16, 0.22, 1);
        this.pushSprite('fx_spark', px + 7, py - 5, false, 0.7, 0.7, 1, 0.9, 0.25, 1, true, this.animTime * 16);
      } else if (p.kind === 'cog') {
        this.pushSprite('bg_gear', px, py, false, 0.48, 0.48, 0.92, 0.96, 1, 1, true, this.animTime * 8);
      } else if (p.kind === 'tv_toss') {
        this.pushSprite('tv_frame', px, py, false, 0.38, 0.38, 1, 1, 1, 1, true, this.animTime * 7);
      } else {
        // Ink rim + bright core circle
        this.pushSprite('fx_circle', px, py, false, scale * 1.25, scale * 1.25, 0.07, 0.05, 0.08, 1);
        this.pushSprite('fx_circle', px, py, false, scale, scale, cr, cg, cb, 1);
      }
    }
    this.flushBatch(gl);
  }

  private drawPlayerWebGL(
    gl: WebGL2RenderingContext,
    sh: KrunkedShaderSuite,
    state: SimState,
    alpha: number,
    camX: number,
    camY: number
  ): void {
    const player = state.player;
    const px = lerp(player.prevX, player.x, alpha) - camX;
    const py = lerp(player.prevY, player.y, alpha) - camY;

    // Hurt invulnerability blink
    if (player.invulnTicks > 0 && (state.tick & 3) === 0 && player.state !== 'parry') {
      return;
    }

    const spriteKey = resolvePlayerSpriteKey(player);
    let sx = 1;
    let sy = 1;
    if (player.state === 'mach3' || player.state === 'mach4') {
      sx = 1.08 + Math.sin(this.animTime * 34) * 0.05;
      sy = 0.94 - Math.sin(this.animTime * 34) * 0.04;
    } else if (player.state === 'sjump') {
      sx = 0.86;
      sy = 1.18;
    } else if (player.state === 'freefall_land' || player.state === 'sjump_land') {
      sx = 1.24;
      sy = 0.78;
    } else if (player.state === 'taunt' || player.state === 'super_taunt') {
      sx = 1.1;
      sy = 1.1;
    }

    const isParryFlash = player.state === 'parry' || (state.hitstopTicks > 0 && player.state === 'super_taunt');
    const isHitFlash = player.state === 'hurt' && (state.tick & 2) !== 0;

    if (isParryFlash || isHitFlash) {
      gl.useProgram(sh.shd_hit.program);
      gl.uniform2f(sh.shd_hit.uniforms.u_resolution, VIEW_W, VIEW_H);
      gl.uniform1i(sh.shd_hit.uniforms.u_tex, 0);
      gl.uniform1f(sh.shd_hit.uniforms.u_flashStrength, isParryFlash ? 0.95 : 0.75);
      gl.uniform1f(sh.shd_hit.uniforms.u_invertMode, isParryFlash ? 1.0 : 0.0);
    } else {
      // shd_pal_swapper: sample 1D 6-color palette LUT ramp for active costume!
      const enableSwap =
        player.rider !== 'gusto_chonks' &&
        player.transformation === 'none' &&
        state.paletteId !== 'classic' &&
        state.paletteId in BUILTIN_PALETTE_RAMPS;

      gl.useProgram(sh.shd_pal_swapper.program);
      gl.uniform2f(sh.shd_pal_swapper.uniforms.u_resolution, VIEW_W, VIEW_H);
      gl.uniform1i(sh.shd_pal_swapper.uniforms.u_tex, 0);
      gl.uniform1i(sh.shd_pal_swapper.uniforms.u_palLut, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.palLutTex);
      gl.uniform3fv(
        sh.shd_pal_swapper.uniforms['u_srcColors[0]'],
        player.rider === 'static' ? this.staticSrcFloats : this.peppoSrcFloats
      );
      gl.uniform1f(sh.shd_pal_swapper.uniforms.u_palRow, getPaletteRow(state.paletteId));
      gl.uniform1f(sh.shd_pal_swapper.uniforms.u_enableSwap, enableSwap ? 1.0 : 0.0);
    }

    this.pushSprite(spriteKey, px, py, player.facing < 0, sx, sy);
    this.flushBatch(gl);

    // Foreground overlays: Shotgun / Revolver muzzle flash, Revolver charge orb & Super Taunt crown!
    const hasGun =
      player.transformation === 'shotgun' ||
      player.transformation === 'revolver' ||
      player.hasShotgun ||
      player.hasRevolver;
    const showMuzzle = this.muzzleFlashTimer > 0 && hasGun;
    const showCharge = player.shotChargeTicks > 4 && (player.transformation === 'revolver' || player.hasRevolver);

    if (showMuzzle || showCharge || player.superTauntReady) {
      this.useStandardSpriteShader(gl, sh);

      if (showMuzzle) {
        const isShotgun = this.muzzleFlashKind === 2 || player.transformation === 'shotgun' || player.hasShotgun;
        const maxDur = isShotgun ? 0.13 : 0.1;
        const life = Math.min(1, this.muzzleFlashTimer / maxDur);
        const mx = px + player.facing * (isShotgun ? 29 : 27);
        const my = py - (isShotgun ? 24 : 29);
        const mfScale = (isShotgun ? 0.95 : 0.72) + life * (isShotgun ? 0.55 : 0.35);
        this.pushSprite('fx_muzzle_flash', mx, my, player.facing < 0, mfScale, mfScale, 1, 1, 1, 0.98);
        this.pushSprite('fx_spark', mx + player.facing * 8, my, false, 0.8 + life * 0.5, 0.8 + life * 0.5, 1, 0.96, 0.5, life);
      }

      if (showCharge) {
        const ready = player.shotChargeTicks >= 30;
        const chargePct = Math.min(1, player.shotChargeTicks / 30);
        const cx0 = px + player.facing * 27;
        const cy0 = py - 29;
        this.pushSprite(
          'fx_spark',
          cx0,
          cy0,
          false,
          0.55 + chargePct * 0.75,
          0.55 + chargePct * 0.75,
          ready ? 0.28 : 1.0,
          ready ? 0.95 : 0.9,
          ready ? 1.0 : 0.35,
          0.95,
          true,
          this.animTime * 14
        );
        if (ready) {
          this.pushSprite('fx_parry_ring', cx0, cy0, false, 0.55, 0.55, 0.28, 0.96, 1.0, 0.85);
        }
      }

      if (player.superTauntReady) {
        const orbitA = this.animTime * 9;
        this.pushSprite('fx_spark', px + Math.cos(orbitA) * 20, py - 48 + Math.sin(orbitA) * 7, false, 0.9, 0.9, 0.24, 0.95, 1, 0.95);
        this.pushSprite('fx_spark', px - Math.cos(orbitA) * 20, py - 48 - Math.sin(orbitA) * 7, false, 0.9, 0.9, 1, 0.92, 0.25, 0.95);
      }

      this.flushBatch(gl);
    }
  }

  private drawParticlesWebGL(camX: number, camY: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles.particles[i];
      if (!p.active) continue;
      const sx = p.x - camX;
      const sy = p.y - camY;
      if (sx < -80 || sx > VIEW_W + 80 || sy < -80 || sy > VIEW_H + 80) continue;

      const t = p.age / p.maxAge;
      const sz = lerp(p.size, p.endSize, t);
      const alpha = p.alpha * (1 - t);

      if ((p.kind === 'score_pop' || p.kind === 'combo_pop') && p.text) {
        this.pushBitmapText(p.text, sx, sy, p.kind === 'combo_pop' ? 1.05 : 0.85, p.r, p.g, p.b, alpha);
      } else if (p.kind === 'starburst') {
        this.pushSprite('fx_starburst', sx, sy, false, sz / 48, sz / 48, p.r, p.g, p.b, alpha, true, p.rotation);
      } else if (p.kind === 'parry_ring') {
        this.pushSprite('fx_parry_ring', sx, sy, false, sz / 48, sz / 48, p.r, p.g, p.b, alpha);
      } else if (p.kind === 'flame') {
        this.pushSprite('fx_flame', sx, sy, false, sz / 24, sz / 24, p.r, p.g, p.b, alpha);
      } else if (p.kind === 'dust' || p.kind === 'smoke' || p.kind === 'slam_wave') {
        this.pushSprite('fx_dust', sx, sy, false, sz / 24, sz / 24, p.r, p.g, p.b, alpha);
      } else if (p.kind === 'spark') {
        this.pushSprite('fx_spark', sx, sy, false, sz / 20, sz / 20, p.r, p.g, p.b, alpha, true, p.rotation);
      } else if (p.kind === 'speed_line') {
        this.pushSprite('fx_speed_line', sx, sy, p.vx > 0, sz / 32, 0.9, p.r, p.g, p.b, alpha);
      } else if (p.kind === 'marble_chunk') {
        this.pushSprite('tile_break_marble', sx, sy, false, sz / 32, sz / 32, p.r, p.g, p.b, alpha, true, p.rotation);
      } else if (p.kind === 'metal_chunk') {
        this.pushSprite('tile_break_metal', sx, sy, false, sz / 32, sz / 32, p.r, p.g, p.b, alpha, true, p.rotation);
      } else {
        // Confetti & generic chunky square sparks
        this.pushColoredRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz * 0.7, p.r, p.g, p.b, alpha);
      }
    }
  }

  private drawHitboxesWebGL(state: SimState, alpha: number, camX: number, camY: number): void {
    const pl = state.player;
    const px = lerp(pl.prevX, pl.x, alpha) - camX;
    const py = lerp(pl.prevY, pl.y, alpha) - camY;
    const pw = pl.crouch ? ENGINE_CONSTANTS.PLAYER_CROUCH_W : ENGINE_CONSTANTS.PLAYER_STAND_W;
    const ph = pl.crouch ? ENGINE_CONSTANTS.PLAYER_CROUCH_H : ENGINE_CONSTANTS.PLAYER_STAND_H;
    this.pushRectOutline(px - pw * 0.5, py - ph, pw, ph, 2, 0.25, 1.0, 0.4, 0.95);

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (!e.alive) continue;
      const ex = lerp(e.prevX, e.x, alpha) - camX;
      const ey = lerp(e.prevY, e.y, alpha) - camY;
      this.pushRectOutline(ex - e.width * 0.5, ey - e.height, e.width, e.height, 1.5, 1.0, 0.25, 0.3, 0.9);
    }

    if (state.boss && state.boss.aiState !== 'defeated') {
      const b = state.boss;
      const bx = lerp(b.prevX, b.x, alpha) - camX;
      const by = lerp(b.prevY, b.y, alpha) - camY;
      this.pushRectOutline(bx - b.width * 0.5, by - b.height, b.width, b.height, 2, 1.0, 0.85, 0.2, 0.95);
    }

    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i];
      const rx = lerp(p.prevX, p.x, alpha) - camX;
      const ry = lerp(p.prevY, p.y, alpha) - camY;
      this.pushRectOutline(rx - p.radius, ry - p.radius, p.radius * 2, p.radius * 2, 1.5, 0.25, 0.9, 1.0, 0.9);
    }
  }

  private drawPanicOverlayWebGL(gl: WebGL2RenderingContext, sh: KrunkedShaderSuite, state: SimState): void {
    const isLap2 = state.escape.lap >= 2 ? 1.0 : 0.0;
    let intensity = state.escape.active ? 0.65 : 0.45;
    if (state.escape.megaCrustActive) intensity = 1.0;
    else if (state.escape.active && state.escape.timerTicks < 60 * 25) intensity = 0.9;

    gl.useProgram(sh.shd_panicbg.program);
    gl.uniform1f(sh.shd_panicbg.uniforms.u_time, this.animTime);
    gl.uniform1f(sh.shd_panicbg.uniforms.u_intensity, intensity);
    gl.uniform1f(sh.shd_panicbg.uniforms.u_lap2, isLap2);
    gl.uniform2f(sh.shd_panicbg.uniforms.u_resolution, VIEW_W, VIEW_H);

    gl.bindVertexArray(this.fullscreenVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.drawCalls++;
  }

  // ==========================================================================
  // Graceful Canvas2D Fallback (Pixel-Crisp 960x540 Offscreen Blit)
  // ==========================================================================

  private pixelsToCanvas(w: number, h: number, pixels: Uint8Array): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const imgData = ctx.createImageData(w, h);
    imgData.data.set(pixels);
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  private ensureAtlasCanvases(): void {
    if (!this.builtinAtlasCanvas) {
      const b = this.assetManager.builtinAtlas;
      this.builtinAtlasCanvas = this.pixelsToCanvas(b.width, b.height, b.pixels);
    }
    const ver = this.assetManager.getCustomAtlasVersion();
    if (ver !== this.customCanvasVersion) {
      const pack = this.assetManager.getCustomPack();
      this.customAtlasCanvas = pack ? this.pixelsToCanvas(pack.width, pack.height, pack.pixels) : null;
      this.customCanvasVersion = ver;
    }
  }

  private drawSprite2D(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    flipX = false,
    scaleX = 1,
    scaleY = 1,
    alpha = 1,
    usePivot = true,
    rotation = 0
  ): void {
    const res = this.assetManager.resolveSprite(key);
    const src = res.useCustom && this.customAtlasCanvas ? this.customAtlasCanvas : this.builtinAtlasCanvas;
    if (!src) return;
    const r = res.rect;
    const prevAlpha = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (flipX || scaleX !== 1 || scaleY !== 1 || rotation !== 0) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (rotation !== 0) ctx.rotate(rotation);
      ctx.scale(flipX ? -scaleX : scaleX, scaleY);
      const dx = usePivot ? -r.pivotX : 0;
      const dy = usePivot ? -r.pivotY : 0;
      ctx.drawImage(src, r.x, r.y, r.w, r.h, dx, dy, r.w, r.h);
      ctx.restore();
    } else {
      const dx = Math.round(x - (usePivot ? r.pivotX : 0));
      const dy = Math.round(y - (usePivot ? r.pivotY : 0));
      ctx.drawImage(src, r.x, r.y, r.w, r.h, dx, dy, r.w, r.h);
    }
    if (alpha !== 1) ctx.globalAlpha = prevAlpha;
  }

  private drawBitmapText2D(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    y: number,
    scale = 1
  ): void {
    const snappedScale = scale >= 0.9 ? Math.round(scale) : 1;
    const step = 9 * snappedScale;
    let x = Math.round(cx - text.length * step * 0.5);
    const py = Math.round(y);
    for (let i = 0; i < text.length; i++) {
      const gk = fontGlyphKey(text[i]);
      if (gk) {
        this.drawSprite2D(ctx, gk, x, py, false, snappedScale, snappedScale, 1, false);
      }
      x += step;
    }
  }

  private rgbCss(c: RGBTuple, a = 1): string {
    return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  }

  private renderCanvas2D(
    state: SimState,
    alpha: number,
    settings: RenderSettings,
    camX: number,
    camY: number
  ): void {
    const ctx = this.fallbackCtx!;
    const out = this.ctx2d!;
    const theme = THEME_VISUALS[state.room.theme] ?? THEME_VISUALS.crypt;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.rgbCss(theme.skyTop);
    ctx.fillRect(0, 0, VIEW_W, 180);
    ctx.fillStyle = this.rgbCss(theme.skyMid);
    ctx.fillRect(0, 180, VIEW_W, 190);
    ctx.fillStyle = this.rgbCss(theme.skyBot);
    ctx.fillRect(0, 370, VIEW_W, 170);

    // Starry sky on cosmic / night / penthouse themes
    if (theme.starry) {
      const starShift = -(((camX * 0.04) % VIEW_W) + VIEW_W) % VIEW_W;
      ctx.fillStyle = '#fff5c4';
      for (let i = 0; i < STAR_POS_X.length; i++) {
        let sx = STAR_POS_X[i] + starShift;
        if (sx < 0) sx += VIEW_W;
        else if (sx >= VIEW_W) sx -= VIEW_W;
        ctx.fillRect(Math.round(sx), STAR_POS_Y[i], 2, 2);
      }
    }

    // Layered 5-floor far & mid parallax silhouettes
    const farSpan = 220;
    const cloudDrift = theme.motifFar === 'bg_cloud' ? this.animTime * 10 : 0;
    const farOff = -((((camX * 0.12) + cloudDrift) % farSpan) + farSpan) % farSpan;
    const farY = theme.motifFar === 'bg_cloud' || theme.motifFar === 'bg_pizza_moon'
      ? 148 - ((camY * 0.05) % 36)
      : 285 - ((camY * 0.06) % 40);
    const farRot = theme.spinFar ? this.animTime * 0.45 : 0;
    for (let x = farOff - farSpan; x < VIEW_W + farSpan; x += farSpan) {
      this.drawSprite2D(ctx, theme.motifFar, x + 80, farY, false, 1.4, 1.4, 0.65, true, farRot);
    }

    const midSpan = theme.ceilingMid ? 210 : 176;
    const midOff = -(((camX * 0.28) % midSpan) + midSpan) % midSpan;
    const midY = theme.ceilingMid ? 44 - ((camY * 0.08) % 24) : 418 - ((camY * 0.1) % 48);
    const midRot = theme.spinMid
      ? -this.animTime * 0.75
      : theme.ceilingMid
        ? Math.sin(this.animTime * 1.8) * 0.06
        : 0;
    for (let x = midOff - midSpan; x < VIEW_W + midSpan; x += midSpan) {
      this.drawSprite2D(ctx, theme.motifMid, x + 70, midY, false, 1.3, 1.3, 0.6, true, midRot);
    }

    ctx.fillStyle = this.rgbCss(theme.floorBand, 0.48);
    ctx.fillRect(0, 420, VIEW_W, 120);

    // Tiles + slopes
    const room = state.room;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const tx1 = Math.min(room.widthTiles - 1, Math.ceil((camX + VIEW_W) / TILE) + 1);
    const ty1 = Math.min(room.heightTiles - 1, Math.ceil((camY + VIEW_H) / TILE) + 1);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const idx = ty * room.widthTiles + tx;
        const raw = room.tiles[idx] as TileTypeValue;
        if (raw === TileType.EMPTY || room.brokenMask[idx] !== 0) continue;
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        if (isSlopeTile(raw)) {
          ctx.fillStyle = this.rgbCss(theme.slopeFill);
          ctx.beginPath();
          if (raw === TileType.SLOPE_45_UP_RIGHT) {
            ctx.moveTo(sx, sy + TILE); ctx.lineTo(sx + TILE, sy); ctx.lineTo(sx + TILE, sy + TILE);
          } else if (raw === TileType.SLOPE_45_UP_LEFT) {
            ctx.moveTo(sx, sy); ctx.lineTo(sx + TILE, sy + TILE); ctx.lineTo(sx, sy + TILE);
          } else if (raw === TileType.SLOPE_26_LOW_RIGHT) {
            ctx.moveTo(sx, sy + TILE); ctx.lineTo(sx + TILE, sy + 16); ctx.lineTo(sx + TILE, sy + TILE);
          } else if (raw === TileType.SLOPE_26_HIGH_RIGHT) {
            ctx.moveTo(sx, sy + 16); ctx.lineTo(sx + TILE, sy); ctx.lineTo(sx + TILE, sy + TILE); ctx.lineTo(sx, sy + TILE);
          } else if (raw === TileType.SLOPE_26_HIGH_LEFT) {
            ctx.moveTo(sx, sy); ctx.lineTo(sx + TILE, sy + 16); ctx.lineTo(sx + TILE, sy + TILE); ctx.lineTo(sx, sy + TILE);
          } else {
            ctx.moveTo(sx, sy + 16); ctx.lineTo(sx + TILE, sy + TILE); ctx.lineTo(sx, sy + TILE);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          const tileKey =
            raw === TileType.SOLID ? theme.solidTile :
            raw === TileType.ONE_WAY ? 'tile_one_way' :
            raw === TileType.BREAK_MARBLE ? 'tile_break_marble' :
            raw === TileType.BREAK_METAL ? 'tile_break_metal' :
            raw === TileType.ICE_SOLID ? 'tile_ice_solid' :
            raw === TileType.SPIKE_HAZARD ? 'tile_spike' :
            raw === TileType.LAVA_HAZARD ? 'tile_lava' :
            raw === TileType.CONVEYOR_RIGHT ? 'tile_conveyor_r' :
            raw === TileType.CONVEYOR_LEFT ? 'tile_conveyor_l' :
            raw === TileType.CHEESE_STICK_WALL ? 'tile_cheese_wall' :
            raw === TileType.BREAK_OUTLET_GATE ? 'tile_outlet_gate' :
            raw === TileType.SECRET_WALL ? 'tile_secret_wall' :
            raw === TileType.PILLAR_BLOCK_CLOSED ? (state.escape.active ? 'tile_pillar_open' : 'tile_pillar_closed') :
            raw === TileType.PILLAR_BLOCK_OPEN ? (state.escape.active ? 'tile_pillar_closed' : 'tile_pillar_open') :
            theme.solidTile;
          const tileAlpha = raw === TileType.BREAK_OUTLET_GATE && room.outletGateTimer > 0 ? 0.25 : 1;
          this.drawSprite2D(ctx, tileKey, sx, sy, false, 1, 1, tileAlpha, false);
        }
      }
    }

    // Room doors
    for (let i = 0; i < state.room.doors.length; i++) {
      const d = state.room.doors[i];
      const dx = d.x - camX;
      const dy = d.y - camY;
      if (dx < -120 || dx > VIEW_W + 120 || dy < -120 || dy > VIEW_H + 120) continue;
      this.drawSprite2D(ctx, 'prop_exit_door', dx, dy, false, 0.9, 0.9, d.escapeLocked && state.escape.active ? 0.5 : 1);
      if (d.label) {
        this.drawBitmapText2D(ctx, d.label.slice(0, 14), dx, dy - 82, 1);
      }
    }

    // Props + Specialized Gimmick Visuals + Widened Non-Clipping Portal Sign Banners
    for (let i = 0; i < state.props.length; i++) {
      const pr = state.props[i];
      if (!pr.active) continue;
      const sx = pr.x - camX;
      const sy = pr.y - camY;
      if (sx < -140 || sx > VIEW_W + 140 || sy < -140 || sy > VIEW_H + 140) continue;

      if (pr.kind === 'toppin_cage' && !pr.triggered) {
        const hop = Math.abs(Math.sin(this.animTime * 6 + pr.id)) * 4;
        this.drawSprite2D(ctx, TOPPIN_SPRITE_KEYS[(pr.index ?? 0) % 5], sx, sy - 6 - hop);
        this.drawSprite2D(ctx, 'prop_toppin_cage', sx, sy);
      } else if (pr.kind === 'lap2_portal') {
        this.drawSprite2D(ctx, 'prop_lap2_portal', sx, sy - 32, false, 1, 1, 1, true, this.animTime * 2.2);
        this.drawBitmapText2D(ctx, 'LAP 2!', sx, sy - 76, 1);
      } else if (pr.kind === 'golf_ball') {
        this.drawSprite2D(ctx, 'prop_golf_ball', sx, sy - 14, false, 1, 1, 1, true, pr.x * 0.09);
        const strokes = Math.max(0, Math.min(GOLF_STROKE_LABELS.length - 1, pr.strokes ?? 0));
        this.drawBitmapText2D(ctx, GOLF_STROKE_LABELS[strokes], sx, sy - 46, 1);
      } else if (pr.kind === 'golf_goal') {
        this.drawSprite2D(ctx, 'prop_golf_goal', sx, sy);
        if (pr.triggered) {
          this.drawSprite2D(ctx, 'fx_starburst', sx, sy - 56, false, 0.72, 0.72, 0.95, true, this.animTime * 3);
          this.drawBitmapText2D(ctx, 'PAR!', sx, sy - 78, 1);
        }
      } else if (pr.kind === 'time_terminal') {
        this.drawSprite2D(ctx, 'prop_time_terminal', sx, sy);
        const tickA = Math.floor(this.animTime * 4) * (Math.PI / 6) - Math.PI * 0.5;
        ctx.strokeStyle = '#a8f542';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 33);
        ctx.lineTo(sx + Math.cos(tickA) * 7, sy - 33 + Math.sin(tickA) * 7);
        ctx.stroke();
        this.drawBitmapText2D(ctx, '+30S', sx, sy - 74, 1);
      } else if (pr.kind === 'taxi_warp') {
        const rumble = Math.sin(this.animTime * 18 + pr.id) * 1.1;
        this.drawSprite2D(ctx, 'fx_beacon_cone', sx + 26, sy - 16 + rumble, false, 1.1, 0.7, 0.45);
        this.drawSprite2D(ctx, 'prop_taxi_warp', sx, sy + rumble);
        this.drawBitmapText2D(ctx, 'TAXI', sx, sy - 58, 1);
      } else if (pr.kind === 'alarm_sensor') {
        const alarmHot = state.room.alarmActiveTicks > 0;
        const sweepA = this.animTime * (alarmHot ? 9.5 : 2.6) + pr.id;
        this.drawSprite2D(ctx, 'fx_beacon_cone', sx, sy - 24, false, alarmHot ? 1.45 : 1.1, 0.9, alarmHot ? 0.65 : 0.35, true, sweepA);
        this.drawSprite2D(ctx, 'fx_beacon_cone', sx, sy - 24, false, alarmHot ? 1.45 : 1.1, 0.9, alarmHot ? 0.65 : 0.35, true, sweepA + Math.PI);
        this.drawSprite2D(ctx, 'prop_alarm_sensor', sx, sy - 24);
      } else if (pr.kind === 'dash_button') {
        const gateOpen = state.room.outletGateTimer > 0;
        this.drawSprite2D(ctx, 'prop_dash_button', sx, sy, false, 1, gateOpen ? 0.78 : 1);
        ctx.fillStyle = gateOpen ? '#52ff99' : '#ff4747';
        ctx.fillRect(Math.round(sx - 10), Math.round(sy - (gateOpen ? 16 : 21)), 20, 4);
      } else {
        this.drawSprite2D(ctx, propToSpriteKey(pr), sx, sy);
      }

      // Widened non-clipping portal sign banners matching WebGL2 (cleanLabel = prop.label.slice(0, 24))
      if (
        pr.label &&
        (pr.kind === 'hub_stage_gate' ||
          pr.kind === 'hub_boss_gate' ||
          pr.kind === 'hub_elevator' ||
          pr.kind === 'hub_bonus_gate' ||
          pr.kind === 'tutorial_sign')
      ) {
        const cleanLabel = pr.label.slice(0, 24);
        const bannerW = Math.max(88, cleanLabel.length * 9 + 18);
        const bannerY = pr.kind === 'tutorial_sign' ? sy - 72 : sy - 114;
        const bx0 = Math.round(sx - bannerW * 0.5);
        const by0 = Math.round(bannerY - 6);
        ctx.fillStyle = 'rgba(26, 18, 36, 0.92)';
        ctx.fillRect(bx0, by0, bannerW, 24);
        ctx.strokeStyle = '#ffd647';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx0, by0, bannerW, 24);
        this.drawBitmapText2D(ctx, cleanLabel, sx, bannerY, 1);
      }
    }

    // Pickups & Conga Toppins
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i];
      if (!pk.collected) {
        const pkKey =
          pk.kind === 'big_topping'
            ? 'pickup_big_topping'
            : pk.kind === 'pizza_slice'
              ? 'pickup_pizza_slice'
              : pk.kind === 'clock_pickup'
                ? 'pickup_clock'
                : pk.kind === 'pumpkin'
                  ? 'pickup_pumpkin'
                  : 'pickup_small_topping';
        this.drawSprite2D(ctx, pkKey, pk.x - camX, pk.y - camY + Math.sin(this.animTime * 6 + pk.bobOffset) * 3.5);
      }
    }
    let congaRank = 0;
    const collected = state.stageStats.toppinsCollected;
    for (let t = 0; t < 5; t++) {
      if (!collected[t]) continue;
      congaRank++;
      const lag = Math.min(CONGA_TRAIL_LEN - 1, congaRank * 9);
      const slot = (this.trailHead - lag + CONGA_TRAIL_LEN) % CONGA_TRAIL_LEN;
      const hop = Math.abs(Math.sin(this.animTime * 10 + t * 1.1)) * 7;
      this.drawSprite2D(ctx, TOPPIN_SPRITE_KEYS[t], this.trailX[slot] - camX, this.trailY[slot] - camY - hop, this.trailFacing[slot] < 0);
    }

    // Enemies
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.alive) {
        this.drawSprite2D(ctx, ENEMY_SPRITE_KEYS[e.archetype], lerp(e.prevX, e.x, alpha) - camX, lerp(e.prevY, e.y, alpha) - camY, e.facing < 0);
      }
    }

    // Boss (with Phase 1 Mega-Crust -> Phase 2/3 Lord Dough swap + aura & High-Noon cues!)
    if (state.boss && state.boss.aiState !== 'defeated') {
      const b = state.boss;
      const bx = lerp(b.prevX, b.x, alpha) - camX;
      const hoverY = b.id === 'b_megacrust' && b.phase === 1 ? -10 + Math.sin(this.animTime * 4.5) * 6 : 0;
      const by = lerp(b.prevY, b.y, alpha) - camY + hoverY;
      if (b.id === 'b_megacrust' && b.phase >= 3) {
        this.drawSprite2D(ctx, 'fx_starburst', bx, by - b.height * 0.5, false, 2.2, 2.2, 0.55, true, this.animTime * 3);
      } else if (b.phase >= 2) {
        this.drawSprite2D(ctx, 'fx_parry_ring', bx, by - b.height * 0.5, false, 1.9, 1.9, 0.48);
      }
      this.drawSprite2D(ctx, resolveBossSpriteKey(b), bx, by, b.facing < 0);
      if (b.id === 'b_cheddar' && b.aiState === 'telegraph') {
        this.drawBitmapText2D(ctx, 'DRAW!', bx, by - b.height - 26, 1);
      }
      if (b.id === 'b_cheddar' && this.bossMuzzleFlashTimer > 0) {
        this.drawSprite2D(ctx, 'fx_muzzle_flash', bx + b.facing * 42, by - 31, b.facing < 0);
      }
    }
    if (state.escape.megaCrustActive) {
      this.drawSprite2D(ctx, 'mega_crust_chaser', state.escape.megaCrustX - camX, state.escape.megaCrustY - camY + 44);
    }

    // Projectiles
    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i];
      const px = lerp(p.prevX, p.x, alpha) - camX;
      const py = lerp(p.prevY, p.y, alpha) - camY;
      if (p.parryable) {
        this.drawSprite2D(ctx, 'fx_parry_ring', px, py, false, 0.65, 0.65, 0.85);
      }
      ctx.fillStyle = p.color || '#ffe066';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(4, p.radius), 0, Math.PI * 2);
      ctx.fill();
    }

    // Afterimages
    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      const a = this.particles.afterimages[i];
      if (a.active) this.drawSprite2D(ctx, a.spriteKey, a.x - camX, a.y - camY, a.facing < 0, 1, 1, a.alpha * (1 - a.age / a.maxAge));
    }

    // Player + Shotgun / Revolver Muzzle Flash
    const pl = state.player;
    const plx = lerp(pl.prevX, pl.x, alpha) - camX;
    const ply = lerp(pl.prevY, pl.y, alpha) - camY;
    this.drawSprite2D(ctx, resolvePlayerSpriteKey(pl), plx, ply, pl.facing < 0);
    if (
      this.muzzleFlashTimer > 0 &&
      (pl.transformation === 'shotgun' || pl.transformation === 'revolver' || pl.hasShotgun || pl.hasRevolver)
    ) {
      const isShotgun = this.muzzleFlashKind === 2 || pl.transformation === 'shotgun' || pl.hasShotgun;
      this.drawSprite2D(
        ctx,
        'fx_muzzle_flash',
        plx + pl.facing * (isShotgun ? 29 : 27),
        ply - (isShotgun ? 24 : 29),
        pl.facing < 0,
        isShotgun ? 1.2 : 0.9,
        isShotgun ? 1.2 : 0.9
      );
    }

    // Panic escape vignette in Canvas2D
    if (state.escape.active) {
      ctx.strokeStyle = state.escape.lap >= 2 ? 'rgba(180, 40, 240, 0.55)' : 'rgba(235, 30, 55, 0.55)';
      ctx.lineWidth = 18;
      ctx.strokeRect(0, 0, VIEW_W, VIEW_H);
    }

    // Blit crisp 960x540 buffer onto physical canvas
    const physW = this.canvas!.width;
    const physH = this.canvas!.height;
    this.computeViewport(settings.scalingMode, physW, physH);
    out.imageSmoothingEnabled = false;
    out.fillStyle = '#100b16';
    out.fillRect(0, 0, physW, physH);
    out.drawImage(this.fallbackBuf!, 0, 0, VIEW_W, VIEW_H, this.vpScratch[0], this.vpScratch[1], this.vpScratch[2], this.vpScratch[3]);
    this.drawCalls = 1;
  }
}
