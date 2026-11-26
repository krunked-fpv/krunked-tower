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
  type BossState,
  type CustomPackStatus,
  type EnemyState,
  type PerfStats,
  type PlayerState,
  type PropState,
  type RenderSettings,
  type RendererAPI,
  type RoomThemeId,
  type SimEvent,
  type SimState,
  type TileTypeValue,
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
}

const THEME_VISUALS: Record<RoomThemeId, ThemeVisual> = {
  hub_lobby: {
    skyTop: hexToFloatRgb('#3d2c54'),
    skyMid: hexToFloatRgb('#5c4278'),
    skyBot: hexToFloatRgb('#7d5e8a'),
    farTint: hexToFloatRgb('#4a3566'),
    midTint: hexToFloatRgb('#6b4f85'),
    floorBand: hexToFloatRgb('#302342'),
    solidTile: 'tile_solid_brick',
    slopeFill: hexToFloatRgb('#9e4b3a'),
    slopeTrim: hexToFloatRgb('#f2b86b'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_window_glow',
  },
  hub_western: {
    skyTop: hexToFloatRgb('#87462d'),
    skyMid: hexToFloatRgb('#c46c3b'),
    skyBot: hexToFloatRgb('#e6a863'),
    farTint: hexToFloatRgb('#9c5230'),
    midTint: hexToFloatRgb('#7d442b'),
    floorBand: hexToFloatRgb('#542e1e'),
    solidTile: 'tile_solid_wood',
    slopeFill: hexToFloatRgb('#9e6034'),
    slopeTrim: hexToFloatRgb('#ffe08c'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_cactus',
  },
  hub_resort: {
    skyTop: hexToFloatRgb('#327ba8'),
    skyMid: hexToFloatRgb('#58a8cc'),
    skyBot: hexToFloatRgb('#9cd8d6'),
    farTint: hexToFloatRgb('#d9eef2'),
    midTint: hexToFloatRgb('#498a64'),
    floorBand: hexToFloatRgb('#30666e'),
    solidTile: 'tile_solid_cheese',
    slopeFill: hexToFloatRgb('#d9a84e'),
    slopeTrim: hexToFloatRgb('#fff2a6'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_tree',
  },
  hub_slum: {
    skyTop: hexToFloatRgb('#25293b'),
    skyMid: hexToFloatRgb('#384059'),
    skyBot: hexToFloatRgb('#4e596e'),
    farTint: hexToFloatRgb('#2d3347'),
    midTint: hexToFloatRgb('#475366'),
    floorBand: hexToFloatRgb('#1e2230'),
    solidTile: 'tile_solid_metal',
    slopeFill: hexToFloatRgb('#68788c'),
    slopeTrim: hexToFloatRgb('#c4d6e8'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_gear',
  },
  hub_penthouse: {
    skyTop: hexToFloatRgb('#221738'),
    skyMid: hexToFloatRgb('#47245e'),
    skyBot: hexToFloatRgb('#7d355e'),
    farTint: hexToFloatRgb('#f2d06b'),
    midTint: hexToFloatRgb('#592d6e'),
    floorBand: hexToFloatRgb('#291438'),
    solidTile: 'tile_solid_neon',
    slopeFill: hexToFloatRgb('#4a2d73'),
    slopeTrim: hexToFloatRgb('#ff66c4'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_pillar_arch',
  },
  crypt: {
    skyTop: hexToFloatRgb('#2e253d'),
    skyMid: hexToFloatRgb('#4a3c5e'),
    skyBot: hexToFloatRgb('#69587a'),
    farTint: hexToFloatRgb('#3d304f'),
    midTint: hexToFloatRgb('#59496e'),
    floorBand: hexToFloatRgb('#261e33'),
    solidTile: 'tile_solid_stone',
    slopeFill: hexToFloatRgb('#91887d'),
    slopeTrim: hexToFloatRgb('#e0d8cc'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_pillar_arch',
  },
  keep: {
    skyTop: hexToFloatRgb('#382b47'),
    skyMid: hexToFloatRgb('#614569'),
    skyBot: hexToFloatRgb('#916375'),
    farTint: hexToFloatRgb('#4a3454'),
    midTint: hexToFloatRgb('#70506e'),
    floorBand: hexToFloatRgb('#2f2238'),
    solidTile: 'tile_solid_stone',
    slopeFill: hexToFloatRgb('#8f847c'),
    slopeTrim: hexToFloatRgb('#ffd166'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_window_glow',
  },
  ruins: {
    skyTop: hexToFloatRgb('#784c2b'),
    skyMid: hexToFloatRgb('#ad733d'),
    skyBot: hexToFloatRgb('#deb068'),
    farTint: hexToFloatRgb('#8c5e34'),
    midTint: hexToFloatRgb('#a3713c'),
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
    skyBot: hexToFloatRgb('#823531'),
    farTint: hexToFloatRgb('#401a22'),
    midTint: hexToFloatRgb('#63292d'),
    floorBand: hexToFloatRgb('#241015'),
    solidTile: 'tile_solid_brick',
    slopeFill: hexToFloatRgb('#8f3f32'),
    slopeTrim: hexToFloatRgb('#ff9e5e'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_pillar_arch',
  },
  mesa: {
    skyTop: hexToFloatRgb('#6e3226'),
    skyMid: hexToFloatRgb('#b55936'),
    skyBot: hexToFloatRgb('#e39c59'),
    farTint: hexToFloatRgb('#8a4129'),
    midTint: hexToFloatRgb('#6e3a23'),
    floorBand: hexToFloatRgb('#4d2619'),
    solidTile: 'tile_solid_brick',
    slopeFill: hexToFloatRgb('#a85438'),
    slopeTrim: hexToFloatRgb('#ffd280'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_cactus',
  },
  graveyard: {
    skyTop: hexToFloatRgb('#1b1a30'),
    skyMid: hexToFloatRgb('#302f52'),
    skyBot: hexToFloatRgb('#4c5273'),
    farTint: hexToFloatRgb('#f2e299'),
    midTint: hexToFloatRgb('#272942'),
    floorBand: hexToFloatRgb('#171729'),
    solidTile: 'tile_solid_stone',
    slopeFill: hexToFloatRgb('#707587'),
    slopeTrim: hexToFloatRgb('#c4d4e6'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_tree',
  },
  farm: {
    skyTop: hexToFloatRgb('#4278b0'),
    skyMid: hexToFloatRgb('#6da4cf'),
    skyBot: hexToFloatRgb('#b5d9c9'),
    farTint: hexToFloatRgb('#ebf5f7'),
    midTint: hexToFloatRgb('#4d8549'),
    floorBand: hexToFloatRgb('#3b6339'),
    solidTile: 'tile_solid_wood',
    slopeFill: hexToFloatRgb('#9c6334'),
    slopeTrim: hexToFloatRgb('#a6e36b'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_tree',
  },
  saloon: {
    skyTop: hexToFloatRgb('#542921'),
    skyMid: hexToFloatRgb('#8a432c'),
    skyBot: hexToFloatRgb('#c47747'),
    farTint: hexToFloatRgb('#733827'),
    midTint: hexToFloatRgb('#5e2f20'),
    floorBand: hexToFloatRgb('#3d1f16'),
    solidTile: 'tile_solid_wood',
    slopeFill: hexToFloatRgb('#94562c'),
    slopeTrim: hexToFloatRgb('#ffd166'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_window_glow',
  },
  pier: {
    skyTop: hexToFloatRgb('#28649e'),
    skyMid: hexToFloatRgb('#4d94c4'),
    skyBot: hexToFloatRgb('#8fd1d9'),
    farTint: hexToFloatRgb('#e6f7fa'),
    midTint: hexToFloatRgb('#38749c'),
    floorBand: hexToFloatRgb('#255175'),
    solidTile: 'tile_solid_wood',
    slopeFill: hexToFloatRgb('#96633b'),
    slopeTrim: hexToFloatRgb('#ffe899'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_pillar_arch',
  },
  woods: {
    skyTop: hexToFloatRgb('#1e3d35'),
    skyMid: hexToFloatRgb('#326150'),
    skyBot: hexToFloatRgb('#598c6b'),
    farTint: hexToFloatRgb('#2a5244'),
    midTint: hexToFloatRgb('#224536'),
    floorBand: hexToFloatRgb('#193328'),
    solidTile: 'tile_solid_wood',
    slopeFill: hexToFloatRgb('#7a5333'),
    slopeTrim: hexToFloatRgb('#8fe374'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_tree',
  },
  orbit: {
    skyTop: hexToFloatRgb('#101129'),
    skyMid: hexToFloatRgb('#1d1e4a'),
    skyBot: hexToFloatRgb('#332c6b'),
    farTint: hexToFloatRgb('#ffe080'),
    midTint: hexToFloatRgb('#3d3878'),
    floorBand: hexToFloatRgb('#161636'),
    solidTile: 'tile_solid_neon',
    slopeFill: hexToFloatRgb('#3b3373'),
    slopeTrim: hexToFloatRgb('#4ff5ff'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_gear',
  },
  golf: {
    skyTop: hexToFloatRgb('#3d85c4'),
    skyMid: hexToFloatRgb('#6cb5de'),
    skyBot: hexToFloatRgb('#b8e6b8'),
    farTint: hexToFloatRgb('#f2fbff'),
    midTint: hexToFloatRgb('#4fa358'),
    floorBand: hexToFloatRgb('#36783e'),
    solidTile: 'tile_solid_cheese',
    slopeFill: hexToFloatRgb('#5cb559'),
    slopeTrim: hexToFloatRgb('#d6ff8a'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_tree',
  },
  metro: {
    skyTop: hexToFloatRgb('#201d38'),
    skyMid: hexToFloatRgb('#3c2e5c'),
    skyBot: hexToFloatRgb('#6e4873'),
    farTint: hexToFloatRgb('#2d2547'),
    midTint: hexToFloatRgb('#4f3c6e'),
    floorBand: hexToFloatRgb('#1a172e'),
    solidTile: 'tile_solid_brick',
    slopeFill: hexToFloatRgb('#685c78'),
    slopeTrim: hexToFloatRgb('#ff9e5e'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_window_glow',
  },
  drain: {
    skyTop: hexToFloatRgb('#1a2b29'),
    skyMid: hexToFloatRgb('#2a453f'),
    skyBot: hexToFloatRgb('#3f6152'),
    farTint: hexToFloatRgb('#243835'),
    midTint: hexToFloatRgb('#335249'),
    floorBand: hexToFloatRgb('#152422'),
    solidTile: 'tile_solid_stone',
    slopeFill: hexToFloatRgb('#5c7369'),
    slopeTrim: hexToFloatRgb('#9ee68c'),
    motifFar: 'bg_gear',
    motifMid: 'bg_pillar_arch',
  },
  foundry: {
    skyTop: hexToFloatRgb('#2e1c1a'),
    skyMid: hexToFloatRgb('#573026'),
    skyBot: hexToFloatRgb('#8c492b'),
    farTint: hexToFloatRgb('#422520'),
    midTint: hexToFloatRgb('#663c2c'),
    floorBand: hexToFloatRgb('#241614'),
    solidTile: 'tile_solid_metal',
    slopeFill: hexToFloatRgb('#66717d'),
    slopeTrim: hexToFloatRgb('#ffaa47'),
    motifFar: 'bg_gear',
    motifMid: 'bg_gear',
  },
  freezer: {
    skyTop: hexToFloatRgb('#284b73'),
    skyMid: hexToFloatRgb('#4c7ea8'),
    skyBot: hexToFloatRgb('#90c4de'),
    farTint: hexToFloatRgb('#d9f2ff'),
    midTint: hexToFloatRgb('#6394bd'),
    floorBand: hexToFloatRgb('#233e5e'),
    solidTile: 'tile_solid_snow',
    slopeFill: hexToFloatRgb('#78a4c7'),
    slopeTrim: hexToFloatRgb('#ffffff'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_pillar_arch',
  },
  manor: {
    skyTop: hexToFloatRgb('#21172b'),
    skyMid: hexToFloatRgb('#3d284d'),
    skyBot: hexToFloatRgb('#5c3d69'),
    farTint: hexToFloatRgb('#ebd88a'),
    midTint: hexToFloatRgb('#322040'),
    floorBand: hexToFloatRgb('#1a1224'),
    solidTile: 'tile_solid_stone',
    slopeFill: hexToFloatRgb('#665678'),
    slopeTrim: hexToFloatRgb('#d6b8ff'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_window_glow',
  },
  arcade: {
    skyTop: hexToFloatRgb('#17112e'),
    skyMid: hexToFloatRgb('#2f1c59'),
    skyBot: hexToFloatRgb('#592578'),
    farTint: hexToFloatRgb('#ff5ca8'),
    midTint: hexToFloatRgb('#3d246e'),
    floorBand: hexToFloatRgb('#140d26'),
    solidTile: 'tile_solid_neon',
    slopeFill: hexToFloatRgb('#392466'),
    slopeTrim: hexToFloatRgb('#4ff5ff'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_window_glow',
  },
  blitz: {
    skyTop: hexToFloatRgb('#2e3322'),
    skyMid: hexToFloatRgb('#4d5235'),
    skyBot: hexToFloatRgb('#786c43'),
    farTint: hexToFloatRgb('#3b402c'),
    midTint: hexToFloatRgb('#57593b'),
    floorBand: hexToFloatRgb('#24291b'),
    solidTile: 'tile_solid_war',
    slopeFill: hexToFloatRgb('#596346'),
    slopeTrim: hexToFloatRgb('#d6d98c'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_gear',
  },
  spire: {
    skyTop: hexToFloatRgb('#2b1024'),
    skyMid: hexToFloatRgb('#5e1c38'),
    skyBot: hexToFloatRgb('#9e3338'),
    farTint: hexToFloatRgb('#ffd166'),
    midTint: hexToFloatRgb('#4d1930'),
    floorBand: hexToFloatRgb('#210c1c'),
    solidTile: 'tile_solid_brick',
    slopeFill: hexToFloatRgb('#8c3535'),
    slopeTrim: hexToFloatRgb('#ffe066'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_pillar_arch',
  },
  secret: {
    skyTop: hexToFloatRgb('#201138'),
    skyMid: hexToFloatRgb('#462273'),
    skyBot: hexToFloatRgb('#7c369c'),
    farTint: hexToFloatRgb('#59f2ff'),
    midTint: hexToFloatRgb('#572a8a'),
    floorBand: hexToFloatRgb('#190d2e'),
    solidTile: 'tile_solid_neon',
    slopeFill: hexToFloatRgb('#5a308c'),
    slopeTrim: hexToFloatRgb('#ff8ce6'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_pillar_arch',
  },
  candy: {
    skyTop: hexToFloatRgb('#471d4f'),
    skyMid: hexToFloatRgb('#7a2e78'),
    skyBot: hexToFloatRgb('#b84f8c'),
    farTint: hexToFloatRgb('#ffe070'),
    midTint: hexToFloatRgb('#632466'),
    floorBand: hexToFloatRgb('#381540'),
    solidTile: 'tile_solid_cheese',
    slopeFill: hexToFloatRgb('#d97736'),
    slopeTrim: hexToFloatRgb('#fff080'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_tree',
  },
  boss_gallery: {
    skyTop: hexToFloatRgb('#421d2b'),
    skyMid: hexToFloatRgb('#6e2f42'),
    skyBot: hexToFloatRgb('#9e4e59'),
    farTint: hexToFloatRgb('#592536'),
    midTint: hexToFloatRgb('#853d4f'),
    floorBand: hexToFloatRgb('#331521'),
    solidTile: 'tile_solid_stone',
    slopeFill: hexToFloatRgb('#8c535b'),
    slopeTrim: hexToFloatRgb('#ffd478'),
    motifFar: 'bg_pillar_arch',
    motifMid: 'bg_window_glow',
  },
  boss_canyon: {
    skyTop: hexToFloatRgb('#69281d'),
    skyMid: hexToFloatRgb('#a84829'),
    skyBot: hexToFloatRgb('#de8947'),
    farTint: hexToFloatRgb('#823522'),
    midTint: hexToFloatRgb('#5e2b1d'),
    floorBand: hexToFloatRgb('#471d14'),
    solidTile: 'tile_solid_wood',
    slopeFill: hexToFloatRgb('#9c5a32'),
    slopeTrim: hexToFloatRgb('#ffd97d'),
    motifFar: 'bg_cloud',
    motifMid: 'bg_cactus',
  },
  boss_studio: {
    skyTop: hexToFloatRgb('#1f1538'),
    skyMid: hexToFloatRgb('#452269'),
    skyBot: hexToFloatRgb('#852e73'),
    farTint: hexToFloatRgb('#ffde4a'),
    midTint: hexToFloatRgb('#381d59'),
    floorBand: hexToFloatRgb('#170f2b'),
    solidTile: 'tile_solid_neon',
    slopeFill: hexToFloatRgb('#542d82'),
    slopeTrim: hexToFloatRgb('#4ff5ff'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_window_glow',
  },
  boss_doppel: {
    skyTop: hexToFloatRgb('#191721'),
    skyMid: hexToFloatRgb('#312b3d'),
    skyBot: hexToFloatRgb('#4d4259'),
    farTint: hexToFloatRgb('#262230'),
    midTint: hexToFloatRgb('#3d354a'),
    floorBand: hexToFloatRgb('#14121a'),
    solidTile: 'tile_solid_brick',
    slopeFill: hexToFloatRgb('#594c63'),
    slopeTrim: hexToFloatRgb('#c9bfd1'),
    motifFar: 'bg_tower_silhouette',
    motifMid: 'bg_pillar_arch',
  },
  boss_summit: {
    skyTop: hexToFloatRgb('#1c0c24'),
    skyMid: hexToFloatRgb('#4a1436'),
    skyBot: hexToFloatRgb('#8c2638'),
    farTint: hexToFloatRgb('#ffe066'),
    midTint: hexToFloatRgb('#3b122b'),
    floorBand: hexToFloatRgb('#17091f'),
    solidTile: 'tile_solid_stone',
    slopeFill: hexToFloatRgb('#703647'),
    slopeTrim: hexToFloatRgb('#ffe066'),
    motifFar: 'bg_pizza_moon',
    motifMid: 'bg_tower_silhouette',
  },
};

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
    const transfoKey = `peppo_transfo_${player.transformation}`;
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
      return `peppo_taunt_${Math.abs(player.tauntPose | 0) % ENGINE_CONSTANTS.TAUNT_POSE_COUNT}`;
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
  return `prop_${prop.kind}`;
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

    // Subtle animated comic horizon rays / clouds (0.12x parallax)
    const farSpan = 220;
    const farOff = -(((camX * 0.12) % farSpan) + farSpan) % farSpan;
    const farY = 175 - ((camY * 0.05) % 40);
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
        0.72,
        true
      );
    }

    // Mid-depth landmarks (0.28x parallax)
    const midSpan = 160;
    const midOff = -(((camX * 0.28) % midSpan) + midSpan) % midSpan;
    const midY = 390 - ((camY * 0.1) % 50);
    for (let x = midOff - midSpan; x < VIEW_W + midSpan; x += midSpan) {
      this.pushSprite(
        theme.motifMid,
        x + 60,
        midY,
        false,
        1.35,
        1.35,
        theme.midTint[0],
        theme.midTint[1],
        theme.midTint[2],
        0.58,
        true
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
        this.pushSprite(`toppin_${tIdx}`, sx, sy - 6 - hop, false, 1, 1);
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
        const bannerY = prop.kind === 'tutorial_sign' ? sy - 70 : sy - 112;
        this.pushColoredRect(sx - bannerW * 0.5, bannerY - 4, bannerW, 20, 0.1, 0.07, 0.14, 0.92);
        this.pushRectOutline(sx - bannerW * 0.5, bannerY - 4, bannerW, 20, 2, 1, 0.84, 0.28, 1);
        this.pushBitmapText(cleanLabel, sx, bannerY, 1, 1, 0.96, 0.75, 1);
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
      this.pushSprite(`toppin_${t}`, tx, ty, flip, 1, 1);
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
      const key = `enemy_${e.archetype}`;
      this.pushSprite(
        key,
        ex + jitterX,
        ey - wobY,
        e.facing < 0,
        1,
        1,
        e.stunTicks > 0 ? 1 : 1,
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
    const by = lerp(boss.prevY, boss.y, alpha) - camY;
    const key = `boss_${boss.id}`;
    const res = this.assetManager.resolveSprite(key);
    const pack = res.useCustom ? this.assetManager.getCustomPack() : null;
    const texW = pack ? pack.width : this.assetManager.builtinAtlas.width;
    const texH = pack ? pack.height : this.assetManager.builtinAtlas.height;

    const stretchX = boss.aiState === 'charge' ? 1.15 : boss.aiState === 'jump_slam' ? 0.9 : 1;
    const stretchY = boss.aiState === 'charge' ? 0.9 : boss.aiState === 'jump_slam' ? 1.15 : 1;
    const isHitFlash = boss.flashTicks > 0 || boss.aiState === 'hurt';
    const isTelegraph = boss.aiState === 'telegraph' || boss.aiState === 'vulnerable' || boss.parryable;

    if (isHitFlash) {
      gl.useProgram(sh.shd_hit.program);
      gl.uniform2f(sh.shd_hit.uniforms.u_resolution, VIEW_W, VIEW_H);
      gl.uniform1i(sh.shd_hit.uniforms.u_tex, 0);
      gl.uniform1f(sh.shd_hit.uniforms.u_flashStrength, 0.92);
      gl.uniform1f(sh.shd_hit.uniforms.u_invertMode, 0.0);
    } else if (isTelegraph) {
      gl.useProgram(sh.shd_outline.program);
      gl.uniform2f(sh.shd_outline.uniforms.u_resolution, VIEW_W, VIEW_H);
      gl.uniform1i(sh.shd_outline.uniforms.u_tex, 0);
      gl.uniform2f(sh.shd_outline.uniforms.u_texelSize, 1 / texW, 1 / texH);
      if (boss.parryable) {
        gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 1.0, 0.9, 0.2, 1.0);
      } else if (boss.aiState === 'vulnerable') {
        gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 0.28, 0.95, 1.0, 1.0);
      } else {
        gl.uniform4f(sh.shd_outline.uniforms.u_outlineColor, 1.0, 0.18, 0.28, 1.0);
      }
      gl.uniform1f(sh.shd_outline.uniforms.u_thickness, 2.0);
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

    this.pushSprite(key, bx, by, boss.facing < 0, stretchX, stretchY);
    this.flushBatch(gl);
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
        this.pushSprite('fx_flame', px, py, p.vx < 0, scale * 1.1, scale * 1.1, 1, 1, 1, 1);
      } else if (p.kind === 'golf_shot' || p.kind === 'bowling_ball') {
        this.pushSprite('prop_golf_ball', px, py, false, scale * 0.85, scale * 0.85, cr, cg, cb, 1, true, this.animTime * 10);
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

    // Super Taunt ready electric crown sparkles!
    if (player.superTauntReady) {
      this.useStandardSpriteShader(gl, sh);
      const orbitA = this.animTime * 9;
      this.pushSprite('fx_spark', px + Math.cos(orbitA) * 20, py - 48 + Math.sin(orbitA) * 7, false, 0.9, 0.9, 0.24, 0.95, 1, 0.95);
      this.pushSprite('fx_spark', px - Math.cos(orbitA) * 20, py - 48 - Math.sin(orbitA) * 7, false, 0.9, 0.9, 1, 0.92, 0.25, 0.95);
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
    usePivot = true
  ): void {
    const res = this.assetManager.resolveSprite(key);
    const src = res.useCustom && this.customAtlasCanvas ? this.customAtlasCanvas : this.builtinAtlasCanvas;
    if (!src) return;
    const r = res.rect;
    const prevAlpha = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (flipX || scaleX !== 1 || scaleY !== 1) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
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

    // Parallax silhouettes
    const farSpan = 220;
    const farOff = -(((camX * 0.12) % farSpan) + farSpan) % farSpan;
    for (let x = farOff - farSpan; x < VIEW_W + farSpan; x += farSpan) {
      this.drawSprite2D(ctx, theme.motifFar, x + 80, 175, false, 1.4, 1.4, 0.55);
    }

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
            raw === TileType.PILLAR_BLOCK_CLOSED ? (state.escape.active ? 'tile_pillar_open' : 'tile_pillar_closed') :
            raw === TileType.PILLAR_BLOCK_OPEN ? (state.escape.active ? 'tile_pillar_closed' : 'tile_pillar_open') :
            theme.solidTile;
          this.drawSprite2D(ctx, tileKey, sx, sy, false, 1, 1, 1, false);
        }
      }
    }

    // Props, Pickups, Enemies, Boss, Player
    for (let i = 0; i < state.props.length; i++) {
      const pr = state.props[i];
      if (pr.active) this.drawSprite2D(ctx, propToSpriteKey(pr), pr.x - camX, pr.y - camY);
    }
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i];
      if (!pk.collected) {
        this.drawSprite2D(ctx, pk.kind === 'big_topping' ? 'pickup_big_topping' : 'pickup_small_topping', pk.x - camX, pk.y - camY);
      }
    }
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.alive) this.drawSprite2D(ctx, `enemy_${e.archetype}`, lerp(e.prevX, e.x, alpha) - camX, lerp(e.prevY, e.y, alpha) - camY, e.facing < 0);
    }
    if (state.boss && state.boss.aiState !== 'defeated') {
      const b = state.boss;
      this.drawSprite2D(ctx, `boss_${b.id}`, lerp(b.prevX, b.x, alpha) - camX, lerp(b.prevY, b.y, alpha) - camY, b.facing < 0);
    }
    if (state.escape.megaCrustActive) {
      this.drawSprite2D(ctx, 'mega_crust_chaser', state.escape.megaCrustX - camX, state.escape.megaCrustY - camY + 44);
    }
    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      const a = this.particles.afterimages[i];
      if (a.active) this.drawSprite2D(ctx, a.spriteKey, a.x - camX, a.y - camY, a.facing < 0, 1, 1, a.alpha * (1 - a.age / a.maxAge));
    }

    const pl = state.player;
    this.drawSprite2D(ctx, resolvePlayerSpriteKey(pl), lerp(pl.prevX, pl.x, alpha) - camX, lerp(pl.prevY, pl.y, alpha) - camY, pl.facing < 0);

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
