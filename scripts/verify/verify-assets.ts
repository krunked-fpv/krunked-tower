// ============================================================================
// Krunked Tower — Gate A Verification (`npm run verify:assets`)
// Runs headlessly in Node/tsx BOTH locally AND in GitHub Actions CI (where
// gitignored `.krunked-tower-assets/` does not exist).
//
// Enforces 5 mandatory gates:
//   1. Built-In KrunkedAtlas Completeness & Non-Empty Pixels + 16 Palettes
//   2. Conditional Custom Pack Integrity (when `.krunked-tower-assets/manifest.json` exists)
//   3. Mechanic Oracle Parity (`ENGINE_CONSTANTS`, 23 `LEVELS`, 5 `BOSSES`, optional `oracle.json`)
//   4. `TASTE_NOTES` Static Hygiene (`index.html`, `main.css`, `GamepadDriver`, `InputRouter`)
//   5. Clean-Room IP Firewall (zero retail binaries tracked/dist; zero leaked proper names)
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  ENGINE_CONSTANTS,
  type AssetManifest,
  type StageId,
  type TvExpression,
} from '../../src/contracts/index';
import {
  BUILTIN_PALETTE_RAMPS,
  PALETTE_ORDER,
  buildKrunkedAtlas,
} from '../../src/assets/KrunkedAtlas';
import { CUSTOM_SPRITE_MAP } from '../../src/assets/customPackMap';
import { BOSSES, ENEMIES, LEVELS, PALETTES } from '../../src/data/index';

const ROOT_DIR = process.cwd();
const CUSTOM_PACK_DIR = path.join(ROOT_DIR, '.krunked-tower-assets');

interface CheckResult {
  gate: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];
const failures: string[] = [];

function record(gate: string, ok: boolean, detail: string): void {
  results.push({ gate, ok, detail });
  if (!ok) failures.push(`[${gate}] ${detail}`);
}

function assertEq<T>(gate: string, label: string, actual: T, expected: T): boolean {
  if (actual !== expected) {
    failures.push(`[${gate}] ${label}: expected ${String(expected)}, got ${String(actual)}`);
    return false;
  }
  return true;
}

// ============================================================================
// 1. Built-In Atlas Completeness & 16 Palettes
// ============================================================================

function verifyBuiltinAtlas(): void {
  const gate = '1. Built-In Atlas';
  const atlas = buildKrunkedAtlas();

  if (atlas.width <= 0 || atlas.height <= 0) {
    record(gate, false, `Invalid atlas dimensions ${atlas.width}x${atlas.height}`);
    return;
  }
  if (atlas.pixels.byteLength !== atlas.width * atlas.height * 4) {
    record(
      gate,
      false,
      `Atlas buffer size mismatch: got ${atlas.pixels.byteLength}, expected ${atlas.width * atlas.height * 4}`,
    );
    return;
  }

  const tvExpressions: readonly TvExpression[] = [
    'idle',
    'mach2',
    'mach3',
    'mach4',
    'panic',
    'hurt',
    'taunt',
    'combo',
    'happy',
    'boss',
    'gusto',
    'static',
    'knight',
    'ghost',
    'shotgun',
    'fire',
  ];
  const rankGrades = ['D', 'C', 'B', 'A', 'S', 'P'] as const;

  const requiredKeys = new Set<string>();
  for (const key of Object.keys(CUSTOM_SPRITE_MAP)) requiredKeys.add(key);
  for (const id of Object.keys(ENEMIES)) requiredKeys.add(`enemy_${id}`);
  for (const id of Object.keys(BOSSES)) requiredKeys.add(`boss_${id}`);
  requiredKeys.add('tv_frame');
  for (const expr of tvExpressions) requiredKeys.add(`tv_${expr}`);
  for (const r of rankGrades) requiredKeys.add(`rank_${r}`);
  for (let i = 0; i < ENGINE_CONSTANTS.TAUNT_POSE_COUNT; i++) {
    requiredKeys.add(`peppo_taunt_${i}`);
  }

  const missingKeys: string[] = [];
  const invalidRects: string[] = [];
  const emptySprites: string[] = [];

  for (const key of requiredKeys) {
    const rect = atlas.rects[key];
    if (!rect) {
      missingKeys.push(key);
      continue;
    }
    if (
      rect.w <= 0 ||
      rect.h <= 0 ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.w > atlas.width ||
      rect.y + rect.h > atlas.height
    ) {
      invalidRects.push(`${key} (${rect.x},${rect.y},${rect.w}x${rect.h})`);
      continue;
    }

    let hasOpaquePixel = false;
    for (let py = rect.y; py < rect.y + rect.h && !hasOpaquePixel; py++) {
      const rowOff = py * atlas.width * 4;
      for (let px = rect.x; px < rect.x + rect.w; px++) {
        if (atlas.pixels[rowOff + px * 4 + 3] > 0) {
          hasOpaquePixel = true;
          break;
        }
      }
    }
    if (!hasOpaquePixel) {
      emptySprites.push(key);
    }
  }

  const paletteIssues: string[] = [];
  if (PALETTES.length !== 16) {
    paletteIssues.push(`Expected 16 PALETTES entries, got ${PALETTES.length}`);
  }
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  for (const pal of PALETTES) {
    const atlasRamp = BUILTIN_PALETTE_RAMPS[pal.id];
    if (!atlasRamp) {
      paletteIssues.push(`Palette "${pal.id}" missing from BUILTIN_PALETTE_RAMPS`);
      continue;
    }
    if (!PALETTE_ORDER.includes(pal.id)) {
      paletteIssues.push(`Palette "${pal.id}" missing from PALETTE_ORDER`);
    }
    if (atlasRamp.length !== 6 || !atlasRamp.every((c) => hexRe.test(c))) {
      paletteIssues.push(`Palette "${pal.id}" has invalid 6-color hex ramp in KrunkedAtlas`);
    }
    if (pal.ramp.length !== 6 || !pal.ramp.every((c) => hexRe.test(c))) {
      paletteIssues.push(`Palette "${pal.id}" has invalid 6-color hex ramp in src/data/palettes.ts`);
    }
  }

  const ok =
    missingKeys.length === 0 &&
    invalidRects.length === 0 &&
    emptySprites.length === 0 &&
    paletteIssues.length === 0;

  if (!ok) {
    if (missingKeys.length > 0) failures.push(`[${gate}] Missing keys: ${missingKeys.join(', ')}`);
    if (invalidRects.length > 0) failures.push(`[${gate}] Out-of-bounds rects: ${invalidRects.join(', ')}`);
    if (emptySprites.length > 0) failures.push(`[${gate}] Empty/transparent sprites: ${emptySprites.join(', ')}`);
    for (const issue of paletteIssues) failures.push(`[${gate}] ${issue}`);
  }

  results.push({
    gate,
    ok,
    detail: ok
      ? `${requiredKeys.size} required sprites verified non-empty (${atlas.keys.length} total in ${atlas.width}x${atlas.height} atlas), ${PALETTES.length}/16 palettes matched`
      : `Missing=${missingKeys.length}, InvalidRects=${invalidRects.length}, Empty=${emptySprites.length}, PaletteIssues=${paletteIssues.length}`,
  });
}

// ============================================================================
// 2. Conditional Custom Pack Integrity
// ============================================================================

function verifyCustomPack(): void {
  const gate = '2. Custom Pack';
  const manifestPath = path.join(CUSTOM_PACK_DIR, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    record(
      gate,
      true,
      'Skipped cleanly (.krunked-tower-assets/manifest.json absent — CI/Built-In mode)',
    );
    return;
  }

  const issues: string[] = [];
  let manifest: (AssetManifest & { atlasImage?: string; atlasPages?: string[] }) | null = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AssetManifest & {
      atlasImage?: string;
      atlasPages?: string[];
    };
  } catch (err) {
    record(gate, false, `Failed to parse manifest.json: ${String(err)}`);
    return;
  }

  if (!manifest || typeof manifest !== 'object') {
    record(gate, false, 'manifest.json root is not an object');
    return;
  }
  if (manifest.version !== 1) issues.push(`Expected manifest.version === 1, got ${String(manifest.version)}`);
  if (manifest.source !== 'custom') issues.push(`Expected manifest.source === 'custom', got ${String(manifest.source)}`);
  if (typeof manifest.atlasWidth !== 'number' || manifest.atlasWidth <= 0) {
    issues.push(`Invalid atlasWidth: ${String(manifest.atlasWidth)}`);
  }
  if (typeof manifest.atlasHeight !== 'number' || manifest.atlasHeight <= 0) {
    issues.push(`Invalid atlasHeight: ${String(manifest.atlasHeight)}`);
  }

  const atlasRel = manifest.atlasImage ?? manifest.atlasPages?.[0] ?? 'atlas_0.png';
  const atlasPath = path.join(CUSTOM_PACK_DIR, atlasRel);
  if (!fs.existsSync(atlasPath)) {
    issues.push(`Atlas image missing on disk: ${atlasRel}`);
  } else {
    const pngBuf = fs.readFileSync(atlasPath);
    const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (pngBuf.length < 24 || !pngBuf.subarray(0, 8).equals(pngSig)) {
      issues.push(`Atlas image ${atlasRel} is not a valid PNG file`);
    } else {
      const ihdrW = pngBuf.readUInt32BE(16);
      const ihdrH = pngBuf.readUInt32BE(20);
      if (ihdrW !== manifest.atlasWidth || ihdrH !== manifest.atlasHeight) {
        issues.push(
          `PNG IHDR dimensions (${ihdrW}x${ihdrH}) do not match manifest (${manifest.atlasWidth}x${manifest.atlasHeight})`,
        );
      }
    }
  }

  const spriteEntries = manifest.sprites && typeof manifest.sprites === 'object'
    ? Object.entries(manifest.sprites)
    : [];
  if (spriteEntries.length === 0) {
    issues.push('manifest.sprites is empty');
  }

  let outOfBounds = 0;
  for (const [key, entry] of spriteEntries) {
    if (
      !entry ||
      typeof entry.x !== 'number' ||
      typeof entry.y !== 'number' ||
      typeof entry.w !== 'number' ||
      typeof entry.h !== 'number' ||
      entry.w <= 0 ||
      entry.h <= 0 ||
      entry.x < 0 ||
      entry.y < 0 ||
      entry.x + entry.w > manifest.atlasWidth ||
      entry.y + entry.h > manifest.atlasHeight
    ) {
      outOfBounds++;
      if (outOfBounds <= 5) {
        issues.push(`Sprite "${key}" rect out of atlas bounds (${entry?.x},${entry?.y},${entry?.w}x${entry?.h})`);
      }
    }
  }

  if (issues.length > 0) {
    for (const issue of issues) failures.push(`[${gate}] ${issue}`);
  }
  results.push({
    gate,
    ok: issues.length === 0,
    detail:
      issues.length === 0
        ? `Valid custom pack: ${spriteEntries.length} sprites in ${atlasRel} (${manifest.atlasWidth}x${manifest.atlasHeight})`
        : `${issues.length} validation error(s) in .krunked-tower-assets/manifest.json`,
  });
}

// ============================================================================
// 3. Mechanic Oracle Parity Checks
// ============================================================================

const CANONICAL_STAGE_ORACLE: Record<StageId, { sRankScore: number; escapeSeconds: number }> = {
  tutorial: { sRankScore: 4000, escapeSeconds: 0 },
  entrance: { sRankScore: 16000, escapeSeconds: 155 },
  medieval: { sRankScore: 20000, escapeSeconds: 170 },
  ruin: { sRankScore: 17000, escapeSeconds: 180 },
  dungeon: { sRankScore: 18500, escapeSeconds: 205 },
  badland: { sRankScore: 19500, escapeSeconds: 213 },
  graveyard: { sRankScore: 20500, escapeSeconds: 220 },
  farm: { sRankScore: 19000, escapeSeconds: 160 },
  saloon: { sRankScore: 20000, escapeSeconds: 175 },
  plage: { sRankScore: 23000, escapeSeconds: 185 },
  forest: { sRankScore: 19000, escapeSeconds: 210 },
  space: { sRankScore: 20000, escapeSeconds: 185 },
  minigolf: { sRankScore: 23000, escapeSeconds: 270 },
  street: { sRankScore: 20000, escapeSeconds: 190 },
  sewer: { sRankScore: 20000, escapeSeconds: 275 },
  industrial: { sRankScore: 20000, escapeSeconds: 230 },
  freezer: { sRankScore: 18200, escapeSeconds: 220 },
  chateau: { sRankScore: 18000, escapeSeconds: 210 },
  kidsparty: { sRankScore: 22000, escapeSeconds: 205 },
  war: { sRankScore: 21500, escapeSeconds: 60 },
  exit: { sRankScore: 5500, escapeSeconds: 338 },
  secretworld: { sRankScore: 38000, escapeSeconds: 0 },
  // Candy Panic bonus mode uses a 120s continuous pumpkin-rush timer (`candyPanicMode: true`)
  trickytreat: { sRankScore: 12000, escapeSeconds: 120 },
};

function verifyMechanicOracleParity(): void {
  const gate = '3. Oracle Parity';
  const beforeFails = failures.length;

  // Core ENGINE_CONSTANTS
  assertEq(gate, 'SIM_HZ', ENGINE_CONSTANTS.SIM_HZ, 60);
  assertEq(gate, 'VIEWPORT_W', ENGINE_CONSTANTS.VIEWPORT_W, 960);
  assertEq(gate, 'VIEWPORT_H', ENGINE_CONSTANTS.VIEWPORT_H, 540);
  assertEq(gate, 'TILE_SIZE', ENGINE_CONSTANTS.TILE_SIZE, 32);

  assertEq(gate, 'PLAYER_STAND_W', ENGINE_CONSTANTS.PLAYER_STAND_W, 26);
  assertEq(gate, 'PLAYER_STAND_H', ENGINE_CONSTANTS.PLAYER_STAND_H, 45);
  assertEq(gate, 'PLAYER_CROUCH_W', ENGINE_CONSTANTS.PLAYER_CROUCH_W, 26);
  assertEq(gate, 'PLAYER_CROUCH_H', ENGINE_CONSTANTS.PLAYER_CROUCH_H, 32);

  assertEq(gate, 'GRAV', ENGINE_CONSTANTS.GRAV, 0.5);
  assertEq(gate, 'FREEFALL_VSP', ENGINE_CONSTANTS.FREEFALL_VSP, 20);
  assertEq(gate, 'JUMP_SPEED', ENGINE_CONSTANTS.JUMP_SPEED, -11);
  assertEq(gate, 'COYOTE_TICKS', ENGINE_CONSTANTS.COYOTE_TICKS, 8);
  assertEq(gate, 'JUMP_BUFFER_TICKS', ENGINE_CONSTANTS.JUMP_BUFFER_TICKS, 15);

  assertEq(gate, 'MACH1_START', ENGINE_CONSTANTS.MACH1_START, 6);
  assertEq(gate, 'MACH2_MAX', ENGINE_CONSTANTS.MACH2_MAX, 12);
  assertEq(gate, 'MACH3_SPEED', ENGINE_CONSTANTS.MACH3_SPEED, 16);
  assertEq(gate, 'MACH4_SPEED', ENGINE_CONSTANTS.MACH4_SPEED, 20);

  assertEq(gate, 'TAUNT_TICKS', ENGINE_CONSTANTS.TAUNT_TICKS, 20);
  assertEq(gate, 'PARRY_WINDOW_TICKS', ENGINE_CONSTANTS.PARRY_WINDOW_TICKS, 8);
  assertEq(gate, 'SUPER_TAUNT_KILLS', ENGINE_CONSTANTS.SUPER_TAUNT_KILLS, 10);
  assertEq(gate, 'COMBO_TIME_MAX', ENGINE_CONSTANTS.COMBO_TIME_MAX, 60);
  assertEq(gate, 'COMBO_DRAIN_PER_TICK', ENGINE_CONSTANTS.COMBO_DRAIN_PER_TICK, 0.15);

  // All 23 stages sRankScore & escapeSeconds
  const expectedStageIds = Object.keys(CANONICAL_STAGE_ORACLE) as StageId[];
  assertEq(gate, 'LEVELS count', Object.keys(LEVELS).length, 23);
  for (const id of expectedStageIds) {
    const lv = LEVELS[id];
    const exp = CANONICAL_STAGE_ORACLE[id];
    if (!lv) {
      failures.push(`[${gate}] Missing stage definition in LEVELS: ${id}`);
      continue;
    }
    assertEq(gate, `LEVELS.${id}.sRankScore`, lv.sRankScore, exp.sRankScore);
    assertEq(gate, `LEVELS.${id}.escapeSeconds`, lv.escapeSeconds, exp.escapeSeconds);
  }

  // Exact Boss HP counts & Player Boss HP
  assertEq(gate, 'BOSSES.b_artiste.maxHp', BOSSES.b_artiste.maxHp, 10);
  assertEq(gate, 'BOSSES.b_cheddar.maxHp', BOSSES.b_cheddar.maxHp, 9);
  assertEq(gate, 'BOSSES.b_static.maxHp', BOSSES.b_static.maxHp, 8);
  assertEq(gate, 'BOSSES.b_doppel.maxHp', BOSSES.b_doppel.maxHp, 6);
  assertEq(gate, 'BOSSES.b_megacrust.maxHp (phase 1)', BOSSES.b_megacrust.maxHp, 8);
  assertEq(gate, 'BOSSES.b_megacrust.phase2Hp', BOSSES.b_megacrust.phase2Hp, 8);
  assertEq(gate, 'BOSSES.b_megacrust.phase3Hp', BOSSES.b_megacrust.phase3Hp, 6);
  assertEq(gate, 'BOSS_PLAYER_MAX_HP', ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP, 6);

  // Optional cross-check against local `.krunked-tower-assets/oracle.json`
  const oraclePath = path.join(CUSTOM_PACK_DIR, 'oracle.json');
  let oracleNote = 'canonical constants verified';
  if (fs.existsSync(oraclePath)) {
    try {
      const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8')) as {
        extracted?: {
          cadence?: { simHz?: number; viewportW?: number; viewportH?: number };
          masks?: {
            standing?: { width?: number; height?: number } | null;
            crouch?: { width?: number; height?: number } | null;
          };
        };
        measured?: {
          stages?: Record<string, { sRankScore?: number; escapeSeconds?: number }>;
          bosses?: {
            b_artiste?: number;
            b_cheddar?: number;
            b_static?: number;
            b_doppel?: number;
            b_megacrust?: number[];
            playerBossHp?: number;
          };
        };
      };

      const extCad = oracle.extracted?.cadence;
      if (extCad) {
        if (extCad.simHz !== undefined) assertEq(gate, 'oracle.extracted.simHz', ENGINE_CONSTANTS.SIM_HZ, extCad.simHz);
        if (extCad.viewportW !== undefined) assertEq(gate, 'oracle.extracted.viewportW', ENGINE_CONSTANTS.VIEWPORT_W, extCad.viewportW);
        if (extCad.viewportH !== undefined) assertEq(gate, 'oracle.extracted.viewportH', ENGINE_CONSTANTS.VIEWPORT_H, extCad.viewportH);
      }
      const extMasks = oracle.extracted?.masks;
      if (extMasks?.standing) {
        assertEq(gate, 'oracle.extracted.masks.standing.width', ENGINE_CONSTANTS.PLAYER_STAND_W, extMasks.standing.width);
        assertEq(gate, 'oracle.extracted.masks.standing.height', ENGINE_CONSTANTS.PLAYER_STAND_H, extMasks.standing.height);
      }
      if (extMasks?.crouch) {
        assertEq(gate, 'oracle.extracted.masks.crouch.width', ENGINE_CONSTANTS.PLAYER_CROUCH_W, extMasks.crouch.width);
        assertEq(gate, 'oracle.extracted.masks.crouch.height', ENGINE_CONSTANTS.PLAYER_CROUCH_H, extMasks.crouch.height);
      }
      if (oracle.measured?.stages) {
        for (const id of expectedStageIds) {
          const entry = oracle.measured.stages[id];
          if (entry && typeof entry.sRankScore === 'number') {
            assertEq(gate, `oracle.measured.stages.${id}.sRankScore`, LEVELS[id].sRankScore, entry.sRankScore);
          }
          if (entry && typeof entry.escapeSeconds === 'number') {
            // Bonus `candyPanicMode` stages use their dedicated rush timer instead of 0 (no pillar escape)
            if (!LEVELS[id].candyPanicMode || entry.escapeSeconds > 0) {
              assertEq(gate, `oracle.measured.stages.${id}.escapeSeconds`, LEVELS[id].escapeSeconds, entry.escapeSeconds);
            }
          }
        }
      }
      if (oracle.measured?.bosses) {
        const b = oracle.measured.bosses;
        if (b.b_artiste !== undefined) assertEq(gate, 'oracle.boss.b_artiste', BOSSES.b_artiste.maxHp, b.b_artiste);
        if (b.b_cheddar !== undefined) assertEq(gate, 'oracle.boss.b_cheddar', BOSSES.b_cheddar.maxHp, b.b_cheddar);
        if (b.b_static !== undefined) assertEq(gate, 'oracle.boss.b_static', BOSSES.b_static.maxHp, b.b_static);
        if (b.b_doppel !== undefined) assertEq(gate, 'oracle.boss.b_doppel', BOSSES.b_doppel.maxHp, b.b_doppel);
        if (Array.isArray(b.b_megacrust) && b.b_megacrust.length === 3) {
          assertEq(gate, 'oracle.boss.b_megacrust[0]', BOSSES.b_megacrust.maxHp, b.b_megacrust[0]);
          assertEq(gate, 'oracle.boss.b_megacrust[1]', BOSSES.b_megacrust.phase2Hp, b.b_megacrust[1]);
          assertEq(gate, 'oracle.boss.b_megacrust[2]', BOSSES.b_megacrust.phase3Hp, b.b_megacrust[2]);
        }
        if (b.playerBossHp !== undefined) {
          assertEq(gate, 'oracle.boss.playerBossHp', ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP, b.playerBossHp);
        }
      }
      oracleNote = 'canonical + .krunked-tower-assets/oracle.json verified';
    } catch (err) {
      failures.push(`[${gate}] Failed to parse .krunked-tower-assets/oracle.json: ${String(err)}`);
    }
  }

  const ok = failures.length === beforeFails;
  results.push({
    gate,
    ok,
    detail: ok
      ? `22 ENGINE_CONSTANTS, 23/23 stages, 5/5 bosses (${oracleNote})`
      : `${failures.length - beforeFails} parity mismatch(es) detected`,
  });
}

// ============================================================================
// 4. TASTE_NOTES Static Hygiene Checks
// ============================================================================

function verifyTasteNotesHygiene(): void {
  const gate = '4. TASTE_NOTES Hygiene';
  const beforeFails = failures.length;

  const checkFileContains = (relPath: string, patterns: Array<{ label: string; test: RegExp | string }>) => {
    const abs = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(abs)) {
      failures.push(`[${gate}] Missing required file: ${relPath}`);
      return;
    }
    const content = fs.readFileSync(abs, 'utf8');
    for (const p of patterns) {
      const matched = typeof p.test === 'string' ? content.includes(p.test) : p.test.test(content);
      if (!matched) {
        failures.push(`[${gate}] ${relPath} missing required directive: ${p.label}`);
      }
    }
  };

  checkFileContains('index.html', [
    { label: 'viewport-fit=cover', test: 'viewport-fit=cover' },
    { label: 'user-scalable=no', test: 'user-scalable=no' },
    { label: '<title>Krunked Tower</title>', test: '<title>Krunked Tower</title>' },
  ]);

  checkFileContains('src/styles/main.css', [
    { label: 'touch-action: none', test: /touch-action\s*:\s*none/ },
    { label: 'overscroll-behavior: none', test: /overscroll-behavior\s*:\s*none/ },
    { label: '100dvh', test: '100dvh' },
    {
      label: "data-touch-visible='false' hidden rule",
      test: /\[data-touch-visible=['"]false['"]\][^{]*\{[^}]*display\s*:\s*none/s,
    },
  ]);

  checkFileContains('src/input/GamepadDriver.ts', [
    { label: 'getGamepads', test: 'getGamepads' },
    { label: 'dual-rumble', test: 'dual-rumble' },
    { label: 'deadzone.general', test: /\bgeneral\b/ },
    { label: 'deadzone.horizontal', test: /\bhorizontal\b/ },
    { label: 'deadzone.vertical', test: /\bvertical\b/ },
    { label: 'deadzone.crouchWalk', test: /\bcrouchWalk\b/ },
    { label: 'deadzone.superjump', test: /\bsuperjump\b/ },
  ]);

  checkFileContains('src/input/InputRouter.ts', [
    { label: 'touchActive = false default', test: /\btouchActive\s*=\s*false\b/ },
  ]);

  const ok = failures.length === beforeFails;
  results.push({
    gate,
    ok,
    detail: ok
      ? 'index.html, main.css, GamepadDriver.ts, and InputRouter.ts passed all mobile/gamepad/touch-default checks'
      : `${failures.length - beforeFails} static hygiene check(s) failed`,
  });
}

// ============================================================================
// 5. Clean-Room IP Firewall
// ============================================================================

function walkFiles(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
}

function verifyIpFirewall(): void {
  const gate = '5. IP Firewall';
  const beforeFails = failures.length;

  // 5a. Check git ls-files + dist/ for retail binaries or `.krunked-tower-assets/`
  const forbiddenExtRe = /\.(win|bank|exe|dll)$/i;
  const forbiddenAssetDirRe = /(^|\/)\.krunked-tower-assets(\/|$)/i;

  let trackedFiles: string[] = [];
  try {
    const stdout = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    trackedFiles = stdout
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  } catch (err) {
    failures.push(`[${gate}] Failed to execute 'git ls-files': ${String(err)}`);
  }

  for (const file of trackedFiles) {
    if (forbiddenExtRe.test(file) || forbiddenAssetDirRe.test(file)) {
      failures.push(`[${gate}] Forbidden retail binary/asset path tracked in git: ${file}`);
    }
  }

  const distDir = path.join(ROOT_DIR, 'dist');
  const distFiles: string[] = [];
  if (fs.existsSync(distDir)) {
    walkFiles(distDir, distFiles);
    for (const abs of distFiles) {
      const rel = path.relative(ROOT_DIR, abs).replace(/\\/g, '/');
      if (forbiddenExtRe.test(rel) || forbiddenAssetDirRe.test(rel)) {
        failures.push(`[${gate}] Forbidden retail binary/asset path found in dist/: ${rel}`);
      }
    }
  }

  // 5b. Scan src/data/**, src/ui/**, index.html, README.md for leaked proper names
  const forbiddenTerms = [
    'Peppino',
    'Spaghetti',
    'Pizza Tower',
    'Pizzahead',
    'Pizzaface',
    'Pepperman',
    'Vigilante',
    'The Noise',
    'Gustavo',
    'Mr. Stick',
    'Tour De Pizza',
    'McPig',
  ];
  const escaped = forbiddenTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const ipRegex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  const textScanPaths: string[] = [];
  walkFiles(path.join(ROOT_DIR, 'src', 'data'), textScanPaths);
  walkFiles(path.join(ROOT_DIR, 'src', 'ui'), textScanPaths);
  for (const single of ['index.html', 'README.md']) {
    const abs = path.join(ROOT_DIR, single);
    if (fs.existsSync(abs)) textScanPaths.push(abs);
  }

  for (const abs of textScanPaths) {
    const rel = path.relative(ROOT_DIR, abs).replace(/\\/g, '/');
    const content = fs.readFileSync(abs, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      ipRegex.lastIndex = 0;
      const match = ipRegex.exec(lines[i]);
      if (match) {
        failures.push(`[${gate}] Leaked proper name "${match[0]}" in ${rel}:${i + 1}`);
      }
    }
  }

  const ok = failures.length === beforeFails;
  results.push({
    gate,
    ok,
    detail: ok
      ? `0 retail binaries (${trackedFiles.length} git-tracked + ${distFiles.length} dist files), 0 leaked proper names (${textScanPaths.length} clean-room files scanned)`
      : `${failures.length - beforeFails} IP firewall violation(s) detected`,
  });
}

// ============================================================================
// Runner
// ============================================================================

function main(): void {
  console.log('=== Krunked Tower — Gate A Verification (verify:assets) ===');
  verifyBuiltinAtlas();
  verifyCustomPack();
  verifyMechanicOracleParity();
  verifyTasteNotesHygiene();
  verifyIpFirewall();

  for (const r of results) {
    const badge = r.ok ? 'PASS' : 'FAIL';
    console.log(`  [${badge}] ${r.gate}: ${r.detail}`);
  }

  if (failures.length > 0) {
    console.error('\nGate A FAILED:');
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }

  console.log('\nGate A PASSED (all 5 checks green).');
}

main();
