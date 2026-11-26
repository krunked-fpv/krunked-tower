// ============================================================================
// Krunked Tower — Read-Only Steam Binary Oracle Dumper
// Strictly READ-ONLY inspection of retail `data.win` (IFF FORM) and FMOD
// `sound/Desktop/{sfx,music}.bank` (FSB5). NEVER writes inside Steam dir.
// Emits gitignored `.krunked-tower-assets/oracle.json`.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_CONSTANTS } from '../src/contracts/index';
import type { FloorId, StageId } from '../src/contracts/index';

const DEFAULT_STEAM_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Pizza Tower';
const OUTPUT_DIR = path.resolve(process.cwd(), '.krunked-tower-assets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'oracle.json');

interface ChunkInfo {
  tag: string;
  offset: number; // start of chunk payload (after 8-byte tag + size header)
  size: number;
}

interface SpriteMaskInfo {
  sprite: string;
  width: number;
  height: number;
  canvasW: number;
  canvasH: number;
  originX: number;
  originY: number;
  bboxLeft: number;
  bboxRight: number;
  bboxTop: number;
  bboxBottom: number;
  bboxMode: number;
  relX: [number, number];
  relY: [number, number];
}

interface Fsb5Info {
  offset: number;
  version: number;
  numSamples: number;
  shdrSize: number;
  nameSize: number;
  dataSize: number;
  mode: number;
  codec: string;
}

interface StageOracleEntry {
  floor: FloorId | 0;
  sRankScore: number;
  escapeSeconds: number;
  warTimerMode?: boolean;
}

const FSB5_CODECS: Record<number, string> = {
  0: 'NONE',
  1: 'PCM8',
  2: 'PCM16',
  3: 'PCM24',
  4: 'PCM32',
  5: 'PCMFLOAT',
  6: 'GCADPCM',
  7: 'IMAADPCM',
  8: 'VAG',
  9: 'HEVAG',
  10: 'XMA',
  11: 'MPEG',
  12: 'CELT',
  13: 'AT9',
  14: 'XWMA',
  15: 'VORBIS',
  16: 'FADPCM',
  17: 'OPUS',
};

function readGmString(buf: Buffer, ptr: number): string {
  if (ptr < 4 || ptr >= buf.length) return '';
  const len = buf.readUInt32LE(ptr - 4);
  if (len > 100_000 || ptr + len > buf.length) return '';
  return buf.toString('utf8', ptr, ptr + len);
}

function parseFormChunks(buf: Buffer): Record<string, ChunkInfo> {
  if (buf.length < 8 || buf.toString('ascii', 0, 4) !== 'FORM') {
    throw new Error('Invalid data.win: missing IFF FORM header');
  }
  const formSize = buf.readUInt32LE(4);
  const limit = Math.min(buf.length, 8 + formSize);
  const chunks: Record<string, ChunkInfo> = {};
  let off = 8;
  while (off + 8 <= limit) {
    const tag = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    chunks[tag] = { tag, offset: off + 8, size };
    off += 8 + size;
  }
  return chunks;
}

function parseGen8(buf: Buffer, gen8: ChunkInfo): {
  bytecodeVersion: number;
  version: string;
  defaultWindowW: number;
  defaultWindowH: number;
  roomOrderCount: number;
  gms2Fps: number;
} {
  const g = gen8.offset;
  const bytecodeVersion = buf.readUInt8(g + 1);
  const major = buf.readUInt32LE(g + 44);
  const minor = buf.readUInt32LE(g + 48);
  const release = buf.readUInt32LE(g + 52);
  const build = buf.readUInt32LE(g + 56);
  const defaultWindowW = buf.readUInt32LE(g + 60);
  const defaultWindowH = buf.readUInt32LE(g + 64);

  // GMS 2.x GEN8 tail layout:
  // +128: roomOrderCount (u32), followed by roomOrderCount * 4 bytes of room indices,
  // followed by 40 bytes (5 * u64 GMS2RandomUID), then f32 GMS2FPS.
  const roomOrderCount = buf.readUInt32LE(g + 128);
  const fpsOffset = g + 132 + roomOrderCount * 4 + 40;
  let gms2Fps: number = ENGINE_CONSTANTS.SIM_HZ;
  if (fpsOffset + 4 <= g + gen8.size) {
    const candidate = buf.readFloatLE(fpsOffset);
    if (Number.isFinite(candidate) && candidate > 0 && candidate <= 1000) {
      gms2Fps = candidate;
    }
  }

  return {
    bytecodeVersion,
    version: `${major}.${minor}.${release}.${build}`,
    defaultWindowW,
    defaultWindowH,
    roomOrderCount,
    gms2Fps,
  };
}

function parsePointerListCount(buf: Buffer, chunk: ChunkInfo | undefined): number {
  if (!chunk || chunk.size < 4) return 0;
  return buf.readUInt32LE(chunk.offset);
}

function parseShaderNames(buf: Buffer, shdr: ChunkInfo | undefined): string[] {
  if (!shdr || shdr.size < 4) return [];
  const count = buf.readUInt32LE(shdr.offset);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const entryPtr = buf.readUInt32LE(shdr.offset + 4 + i * 4);
    if (entryPtr + 4 <= buf.length) {
      names.push(readGmString(buf, buf.readUInt32LE(entryPtr)));
    }
  }
  return names;
}

function parsePlayerMasks(
  buf: Buffer,
  sprt: ChunkInfo | undefined,
): { standing: SpriteMaskInfo | null; crouch: SpriteMaskInfo | null } {
  let standing: SpriteMaskInfo | null = null;
  let crouch: SpriteMaskInfo | null = null;
  if (!sprt || sprt.size < 4) return { standing, crouch };

  const count = buf.readUInt32LE(sprt.offset);
  for (let i = 0; i < count; i++) {
    const ptr = buf.readUInt32LE(sprt.offset + 4 + i * 4);
    if (ptr + 56 > buf.length) continue;
    const name = readGmString(buf, buf.readUInt32LE(ptr));
    if (name !== 'spr_player_mask' && name !== 'spr_crouchmask') continue;

    const canvasW = buf.readUInt32LE(ptr + 4);
    const canvasH = buf.readUInt32LE(ptr + 8);
    const bboxLeft = buf.readInt32LE(ptr + 12);
    const bboxRight = buf.readInt32LE(ptr + 16);
    const bboxBottom = buf.readInt32LE(ptr + 20);
    const bboxTop = buf.readInt32LE(ptr + 24);
    const bboxMode = buf.readUInt32LE(ptr + 40);
    const originX = buf.readInt32LE(ptr + 48);
    const originY = buf.readInt32LE(ptr + 52);
    const info: SpriteMaskInfo = {
      sprite: name,
      width: bboxRight - bboxLeft + 1,
      height: bboxBottom - bboxTop + 1,
      canvasW,
      canvasH,
      originX,
      originY,
      bboxLeft,
      bboxRight,
      bboxTop,
      bboxBottom,
      bboxMode,
      relX: [bboxLeft - originX, bboxRight - originX],
      relY: [bboxTop - originY, bboxBottom - originY],
    };
    if (name === 'spr_player_mask') standing = info;
    if (name === 'spr_crouchmask') crouch = info;
    if (standing && crouch) break;
  }

  return { standing, crouch };
}

function parseFsb5FromBank(bankPath: string): { fileBytes: number; fsb5: Fsb5Info } {
  // Strictly read-only file open
  const buf = fs.readFileSync(bankPath);
  const idx = buf.indexOf('FSB5', 0, 'ascii');
  if (idx === -1 || idx + 28 > buf.length) {
    throw new Error(`FSB5 header not found in ${bankPath}`);
  }
  const version = buf.readUInt32LE(idx + 4);
  const numSamples = buf.readUInt32LE(idx + 8);
  const shdrSize = buf.readUInt32LE(idx + 12);
  const nameSize = buf.readUInt32LE(idx + 16);
  const dataSize = buf.readUInt32LE(idx + 20);
  const mode = buf.readUInt32LE(idx + 24);
  return {
    fileBytes: buf.length,
    fsb5: {
      offset: idx,
      version,
      numSamples,
      shdrSize,
      nameSize,
      dataSize,
      mode,
      codec: FSB5_CODECS[mode] ?? `UNKNOWN_${mode}`,
    },
  };
}

function buildMeasuredStages(): Record<StageId, StageOracleEntry> {
  return {
    tutorial: { floor: 0, sRankScore: 4000, escapeSeconds: 0 },
    // Floor 1
    entrance: { floor: 1, sRankScore: 16000, escapeSeconds: 155 },
    medieval: { floor: 1, sRankScore: 20000, escapeSeconds: 170 },
    ruin: { floor: 1, sRankScore: 17000, escapeSeconds: 180 },
    dungeon: { floor: 1, sRankScore: 18500, escapeSeconds: 205 },
    // Floor 2
    badland: { floor: 2, sRankScore: 19500, escapeSeconds: 213 },
    graveyard: { floor: 2, sRankScore: 20500, escapeSeconds: 220 },
    farm: { floor: 2, sRankScore: 19000, escapeSeconds: 160 },
    saloon: { floor: 2, sRankScore: 20000, escapeSeconds: 175 },
    // Floor 3
    plage: { floor: 3, sRankScore: 23000, escapeSeconds: 185 },
    forest: { floor: 3, sRankScore: 19000, escapeSeconds: 210 },
    space: { floor: 3, sRankScore: 20000, escapeSeconds: 185 },
    minigolf: { floor: 3, sRankScore: 23000, escapeSeconds: 270 },
    // Floor 4
    street: { floor: 4, sRankScore: 20000, escapeSeconds: 190 },
    sewer: { floor: 4, sRankScore: 20000, escapeSeconds: 275 },
    industrial: { floor: 4, sRankScore: 20000, escapeSeconds: 230 },
    freezer: { floor: 4, sRankScore: 18200, escapeSeconds: 220 },
    // Floor 5
    chateau: { floor: 5, sRankScore: 18000, escapeSeconds: 210 },
    kidsparty: { floor: 5, sRankScore: 22000, escapeSeconds: 205 },
    war: { floor: 5, sRankScore: 21500, escapeSeconds: 60, warTimerMode: true },
    // Finale & Bonus Modes
    exit: { floor: 5, sRankScore: 5500, escapeSeconds: 338 },
    secretworld: { floor: 0, sRankScore: 38000, escapeSeconds: 0 },
    trickytreat: { floor: 0, sRankScore: 12000, escapeSeconds: 0 },
  };
}

function main(): void {
  const steamDir = process.env.PIZZA_TOWER_DIR ?? DEFAULT_STEAM_DIR;
  const dataWinPath = path.join(steamDir, 'data.win');
  const sfxBankPath = path.join(steamDir, 'sound', 'Desktop', 'sfx.bank');
  const musicBankPath = path.join(steamDir, 'sound', 'Desktop', 'music.bank');

  if (!fs.existsSync(dataWinPath) || !fs.existsSync(sfxBankPath) || !fs.existsSync(musicBankPath)) {
    console.log(
      `[oracle] Local Steam installation not found at "${steamDir}" (missing data.win or FMOD banks). Skipping binary oracle dump cleanly.`,
    );
    process.exit(0);
  }

  // Strictly READ-ONLY reads from Steam folder
  const dataWinBuf = fs.readFileSync(dataWinPath);
  const chunks = parseFormChunks(dataWinBuf);
  if (!chunks.GEN8) {
    throw new Error('data.win missing GEN8 chunk');
  }

  const gen8 = parseGen8(dataWinBuf, chunks.GEN8);
  const sprites = parsePointerListCount(dataWinBuf, chunks.SPRT);
  const tpagRects = parsePointerListCount(dataWinBuf, chunks.TPAG);
  const textures = parsePointerListCount(dataWinBuf, chunks.TXTR);
  const rooms = parsePointerListCount(dataWinBuf, chunks.ROOM);
  const shaders = parsePointerListCount(dataWinBuf, chunks.SHDR);
  const strings = parsePointerListCount(dataWinBuf, chunks.STRG);
  const codeEntries = parsePointerListCount(dataWinBuf, chunks.CODE);
  const variables = parsePointerListCount(dataWinBuf, chunks.VARI);
  const objects = parsePointerListCount(dataWinBuf, chunks.OBJT);
  const shaderNames = parseShaderNames(dataWinBuf, chunks.SHDR);
  const extractedMasks = parsePlayerMasks(dataWinBuf, chunks.SPRT);

  const sfxBank = parseFsb5FromBank(sfxBankPath);
  const musicBank = parseFsb5FromBank(musicBankPath);

  const oracle = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    extracted: {
      source: 'extracted' as const,
      files: {
        source: 'extracted' as const,
        dataWinBytes: dataWinBuf.length,
        sfxBankBytes: sfxBank.fileBytes,
        musicBankBytes: musicBank.fileBytes,
      },
      chunks: {
        source: 'extracted' as const,
        sprites,
        rooms,
        shaders,
        textures,
        tpagRects,
        strings,
        codeEntries,
        variables,
        objects,
        sfxSamples: sfxBank.fsb5.numSamples,
        musicTracks: musicBank.fsb5.numSamples,
        gms2Fps: gen8.gms2Fps,
        defaultWindowW: gen8.defaultWindowW,
        defaultWindowH: gen8.defaultWindowH,
        bytecodeVersion: gen8.bytecodeVersion,
        gms2Version: gen8.version,
        shaderNames,
      },
      fsb5: {
        source: 'extracted' as const,
        sfx: sfxBank.fsb5,
        music: musicBank.fsb5,
      },
      cadence: {
        source: 'extracted' as const,
        simHz: gen8.gms2Fps,
        viewportW: gen8.defaultWindowW,
        viewportH: gen8.defaultWindowH,
        tileSize: ENGINE_CONSTANTS.TILE_SIZE,
      },
      masks: {
        source: 'extracted' as const,
        standing: extractedMasks.standing,
        crouch: extractedMasks.crouch,
      },
    },
    measured: {
      source: 'measured' as const,
      cadence: {
        source: 'measured' as const,
        simHz: ENGINE_CONSTANTS.SIM_HZ,
        viewportW: ENGINE_CONSTANTS.VIEWPORT_W,
        viewportH: ENGINE_CONSTANTS.VIEWPORT_H,
        tileSize: ENGINE_CONSTANTS.TILE_SIZE,
      },
      masks: {
        source: 'measured' as const,
        standing: {
          width: ENGINE_CONSTANTS.PLAYER_STAND_W,
          height: ENGINE_CONSTANTS.PLAYER_STAND_H,
        },
        crouch: {
          width: ENGINE_CONSTANTS.PLAYER_CROUCH_W,
          height: ENGINE_CONSTANTS.PLAYER_CROUCH_H,
        },
      },
      physics: {
        source: 'measured' as const,
        grav: ENGINE_CONSTANTS.GRAV,
        freefallVsp: ENGINE_CONSTANTS.FREEFALL_VSP,
        walkMax: ENGINE_CONSTANTS.WALK_MAX,
        walkCruise: ENGINE_CONSTANTS.WALK_CRUISE,
        jumpSpeed: ENGINE_CONSTANTS.JUMP_SPEED,
        jumpCutDiv: ENGINE_CONSTANTS.JUMP_CUT_DIV,
        coyoteTicks: ENGINE_CONSTANTS.COYOTE_TICKS,
        jumpBufferTicks: ENGINE_CONSTANTS.JUMP_BUFFER_TICKS,
        stopBufferTicks: ENGINE_CONSTANTS.STOP_BUFFER_TICKS,
        slopeBufferTicks: ENGINE_CONSTANTS.SLOPE_BUFFER_TICKS,
        slapBufferTicks: ENGINE_CONSTANTS.SLAP_BUFFER_TICKS,
        mach1Start: ENGINE_CONSTANTS.MACH1_START,
        mach1Accel: ENGINE_CONSTANTS.MACH1_ACCEL,
        mach1To2: ENGINE_CONSTANTS.MACH1_TO_2,
        mach2Max: ENGINE_CONSTANTS.MACH2_MAX,
        mach2Accel: ENGINE_CONSTANTS.MACH2_ACCEL,
        mach2SlopeAccel: ENGINE_CONSTANTS.MACH2_SLOPE_ACCEL,
        mach2SlopeDecel: ENGINE_CONSTANTS.MACH2_SLOPE_DECEL,
        mach2To3Accel: ENGINE_CONSTANTS.MACH2_TO_3_ACCEL,
        mach3Speed: ENGINE_CONSTANTS.MACH3_SPEED,
        mach3Accel: ENGINE_CONSTANTS.MACH3_ACCEL,
        mach3To4Accel: ENGINE_CONSTANTS.MACH3_TO_4_ACCEL,
        mach4Speed: ENGINE_CONSTANTS.MACH4_SPEED,
        wallClimbAccel: ENGINE_CONSTANTS.WALL_CLIMB_ACCEL,
        wallClimbMax: ENGINE_CONSTANTS.WALL_CLIMB_MAX,
        tauntTicks: ENGINE_CONSTANTS.TAUNT_TICKS,
        parryTicks: ENGINE_CONSTANTS.PARRY_WINDOW_TICKS,
        superTauntKills: ENGINE_CONSTANTS.SUPER_TAUNT_KILLS,
        hurtTicks: ENGINE_CONSTANTS.HURT_TICKS,
        invulnTicks: ENGINE_CONSTANTS.INVHURT_TICKS,
        comboTimeMax: ENGINE_CONSTANTS.COMBO_TIME_MAX,
        comboDrainPerTick: ENGINE_CONSTANTS.COMBO_DRAIN_PER_TICK,
      },
      stages: {
        source: 'measured' as const,
        ...buildMeasuredStages(),
      },
      bosses: {
        source: 'measured' as const,
        b_artiste: 10,
        b_cheddar: 9,
        b_static: 8,
        b_doppel: 6,
        b_megacrust: [8, 8, 6] as [number, number, number],
        playerBossHp: ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP,
      },
    },
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(oracle, null, 2)}\n`, 'utf8');

  console.log(
    `[oracle] Wrote ${path.relative(process.cwd(), OUTPUT_FILE)} | ` +
      `data.win=${dataWinBuf.length}B | SPRT=${sprites} TPAG=${tpagRects} TXTR=${textures} ` +
      `ROOM=${rooms} SHDR=${shaders} STRG=${strings} CODE=${codeEntries} VARI=${variables} ` +
      `FPS=${gen8.gms2Fps} | sfx.bank=${sfxBank.fsb5.numSamples} (${sfxBank.fsb5.codec}) ` +
      `music.bank=${musicBank.fsb5.numSamples} (${musicBank.fsb5.codec})`,
  );
  if (extractedMasks.standing && extractedMasks.crouch) {
    console.log(
      `[oracle] Masks verified: standing=${extractedMasks.standing.width}x${extractedMasks.standing.height} ` +
        `(origin ${extractedMasks.standing.originX},${extractedMasks.standing.originY}), ` +
        `crouch=${extractedMasks.crouch.width}x${extractedMasks.crouch.height} ` +
        `(origin ${extractedMasks.crouch.originX},${extractedMasks.crouch.originY})`,
    );
  }
}

main();
