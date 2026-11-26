// ============================================================================
// Krunked Tower — Read-Only Local Steam Asset Extractor (`npm run extract`)
// Strictly READ-ONLY parser of retail `data.win` (IFF FORM: TXTR, TPAG, SPRT,
// STRG) and `sound/Desktop/{sfx,music}.bank` (FSB5).
//
// STRICT READ-ONLY STEAM DISCIPLINE:
//   - NEVER creates, modifies, or writes any file inside the Steam directory.
//   - Writes ONLY to gitignored `.krunked-tower-assets/`.
//   - Exits 0 gracefully when local Steam assets are absent (CI-safe).
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import type { AssetManifest, AssetManifestEntry } from '../src/contracts/index';
import {
  CUSTOM_MUSIC_MAP,
  CUSTOM_SFX_MAP,
  CUSTOM_SPRITE_MAP,
} from '../src/assets/customPackMap';
import { buildKrunkedAtlas } from '../src/assets/KrunkedAtlas';

const DEFAULT_STEAM_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Pizza Tower';
const OUTPUT_DIR = path.resolve(process.cwd(), '.krunked-tower-assets');
const ATLAS_FILENAME = 'atlas_0.png';
const MANIFEST_FILENAME = 'manifest.json';
const PACK_WIDTH = 2048;
const PACK_MAX_HEIGHT = 2048;
const PACK_PADDING = 2;

interface ChunkInfo {
  tag: string;
  offset: number;
  size: number;
}

interface TxtrEntry {
  index: number;
  scaled: number;
  generatedMips: number;
  blobSize: number;
  width: number;
  height: number;
  groupIndex: number;
  blobOffset: number;
  magic: string;
}

interface TpagEntry {
  offset: number;
  sourceX: number;
  sourceY: number;
  sourceW: number;
  sourceH: number;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  boundingW: number;
  boundingH: number;
  texturePageId: number;
}

interface SprtEntry {
  name: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  tpagOffsets: number[];
}

interface ResolvedTargetSprite {
  key: string;
  retailSprite: string;
  frame: number;
  sprt: SprtEntry;
  tpag: TpagEntry;
}

interface PackedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DecodedPage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

interface Fsb5BankSummary {
  present: boolean;
  fileBytes: number;
  version: number;
  numSamples: number;
  codec: string;
  mode: number;
  mappedCount: number;
  verifiedIndices: number;
  sampleNamesPreview: string[];
}

interface ExtendedAssetManifest extends AssetManifest {
  generatedAt: string;
  atlasImage: string;
  atlasPages: string[];
  spriteCount: number;
  audioBanks: {
    sfx: Fsb5BankSummary;
    music: Fsb5BankSummary;
  };
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

// ============================================================================
// IFF FORM Parser (`data.win`: STRG, TXTR, TPAG, SPRT)
// ============================================================================

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

function readGmString(buf: Buffer, ptr: number): string {
  if (ptr < 4 || ptr >= buf.length) return '';
  const len = buf.readUInt32LE(ptr - 4);
  if (len > 100_000 || ptr + len > buf.length) return '';
  return buf.toString('utf8', ptr, ptr + len);
}

function parseStrgCount(buf: Buffer, strg: ChunkInfo | undefined): number {
  if (!strg || strg.size < 4) return 0;
  return buf.readUInt32LE(strg.offset);
}

function parseTxtrChunk(buf: Buffer, txtr: ChunkInfo): TxtrEntry[] {
  const count = buf.readUInt32LE(txtr.offset);
  const ptrs: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    ptrs[i] = buf.readUInt32LE(txtr.offset + 4 + i * 4);
  }

  const rawEntries: Array<{
    index: number;
    scaled: number;
    generatedMips: number;
    blobSize: number;
    width: number;
    height: number;
    groupIndex: number;
    blobOffset: number;
  }> = [];

  for (let i = 0; i < count; i++) {
    const pt = ptrs[i];
    const nextPt = i + 1 < count ? ptrs[i + 1] : txtr.offset + txtr.size;
    const stride = nextPt - pt;

    if (stride >= 28) {
      // GMS 2.3+ TXTR entry (28 bytes): scaled, mips, blockSize, w, h, groupIdx, blobOffset
      const scaled = buf.readUInt32LE(pt);
      const generatedMips = buf.readUInt32LE(pt + 4);
      const blobSize = buf.readUInt32LE(pt + 8);
      const width = buf.readUInt32LE(pt + 12);
      const height = buf.readUInt32LE(pt + 16);
      const groupIndex = buf.readUInt32LE(pt + 20);
      const blobOffset = buf.readUInt32LE(pt + 24);
      rawEntries.push({
        index: i,
        scaled,
        generatedMips,
        blobSize,
        width,
        height,
        groupIndex,
        blobOffset,
      });
    } else if (stride >= 12) {
      // Older GMS 2.0–2.2 TXTR entry fallback
      const scaled = buf.readUInt32LE(pt);
      const generatedMips = buf.readUInt32LE(pt + 4);
      const blobOffset = buf.readUInt32LE(pt + 8);
      rawEntries.push({
        index: i,
        scaled,
        generatedMips,
        blobSize: 0,
        width: 0,
        height: 0,
        groupIndex: 0,
        blobOffset,
      });
    }
  }

  const chunkEnd = txtr.offset + txtr.size;
  return rawEntries.map((entry, i) => {
    let blobSize = entry.blobSize;
    if (blobSize <= 0) {
      const nextBlob = i + 1 < rawEntries.length ? rawEntries[i + 1].blobOffset : chunkEnd;
      blobSize = Math.max(0, nextBlob - entry.blobOffset);
    }
    const magic =
      entry.blobOffset + 4 <= buf.length
        ? buf.toString('ascii', entry.blobOffset, entry.blobOffset + 4)
        : '';
    return {
      ...entry,
      blobSize,
      magic,
    };
  });
}

function parseTpagChunk(buf: Buffer, tpag: ChunkInfo): Map<number, TpagEntry> {
  const count = buf.readUInt32LE(tpag.offset);
  const byOffset = new Map<number, TpagEntry>();
  for (let i = 0; i < count; i++) {
    const pt = buf.readUInt32LE(tpag.offset + 4 + i * 4);
    if (pt + 22 > buf.length) continue;
    byOffset.set(pt, {
      offset: pt,
      sourceX: buf.readUInt16LE(pt),
      sourceY: buf.readUInt16LE(pt + 2),
      sourceW: buf.readUInt16LE(pt + 4),
      sourceH: buf.readUInt16LE(pt + 6),
      targetX: buf.readUInt16LE(pt + 8),
      targetY: buf.readUInt16LE(pt + 10),
      targetW: buf.readUInt16LE(pt + 12),
      targetH: buf.readUInt16LE(pt + 14),
      boundingW: buf.readUInt16LE(pt + 16),
      boundingH: buf.readUInt16LE(pt + 18),
      texturePageId: buf.readUInt16LE(pt + 20),
    });
  }
  return byOffset;
}

function parseSprtChunk(buf: Buffer, sprt: ChunkInfo): Map<string, SprtEntry> {
  const count = buf.readUInt32LE(sprt.offset);
  const byName = new Map<string, SprtEntry>();

  for (let i = 0; i < count; i++) {
    const pt = buf.readUInt32LE(sprt.offset + 4 + i * 4);
    if (pt + 64 > buf.length) continue;

    const name = readGmString(buf, buf.readUInt32LE(pt));
    if (!name) continue;

    const width = buf.readUInt32LE(pt + 4);
    const height = buf.readUInt32LE(pt + 8);
    const originX = buf.readInt32LE(pt + 48);
    const originY = buf.readInt32LE(pt + 52);
    const marker = buf.readInt32LE(pt + 56);

    const tpagOffsets: number[] = [];
    if (marker === -1) {
      // GMS 2.x special sprite header
      const sVersion = buf.readUInt32LE(pt + 60);
      const spriteType = buf.readUInt32LE(pt + 64);
      if (spriteType === 0) {
        let tpagListOff = pt + 76;
        if (sVersion >= 3) tpagListOff = pt + 84;
        else if (sVersion === 2) tpagListOff = pt + 80;

        if (tpagListOff + 4 <= buf.length) {
          const tCount = buf.readUInt32LE(tpagListOff);
          if (tCount < 10_000 && tpagListOff + 4 + tCount * 4 <= buf.length) {
            for (let j = 0; j < tCount; j++) {
              tpagOffsets.push(buf.readUInt32LE(tpagListOff + 4 + j * 4));
            }
          }
        }
      }
    } else if (marker >= 0 && marker < 10_000 && pt + 60 + marker * 4 <= buf.length) {
      // GMS 1.x sprite header
      for (let j = 0; j < marker; j++) {
        tpagOffsets.push(buf.readUInt32LE(pt + 60 + j * 4));
      }
    }

    byName.set(name, { name, width, height, originX, originY, tpagOffsets });
  }

  return byName;
}

// ============================================================================
// Batched Read-Only Python BZip2 Helper for `2zoq` Texture Pages
// (Pure stdlib `bz2` + `struct` + `json` — zero temp files, zero Steam writes)
// ============================================================================

const PYTHON_BZ2_BATCH_SCRIPT = `
import sys, json, struct, bz2

req = json.loads(sys.stdin.read())
data_win_path = req["dataWinPath"]
pages = req["pages"]
out = sys.stdout.buffer

with open(data_win_path, "rb") as f:
    for item in pages:
        page_id = int(item["pageId"])
        offset = int(item["offset"])
        size = int(item["size"])
        f.seek(offset)
        blob = f.read(size)
        if blob[:4] == b"2zoq":
            bzh = blob.find(b"BZh", 8, 32)
            if bzh == -1:
                raise RuntimeError(f"TXTR page {page_id}: missing BZh marker in 2zoq header")
            raw = bz2.decompress(blob[bzh:])
        else:
            raw = blob
        out.write(struct.pack("<II", page_id, len(raw)))
        out.write(raw)
out.flush()
`;

function resolvePythonCommand(): { cmd: string; prefixArgs: string[] } | null {
  const candidates: Array<{ cmd: string; prefixArgs: string[] }> = [
    { cmd: 'python', prefixArgs: [] },
    { cmd: 'python3', prefixArgs: [] },
    { cmd: 'py', prefixArgs: ['-3'] },
  ];
  for (const cand of candidates) {
    const probe = spawnSync(cand.cmd, [...cand.prefixArgs, '--version'], {
      stdio: 'pipe',
      windowsHide: true,
    });
    if (probe.status === 0) return cand;
  }
  return null;
}

function decompress2zoqPagesBatch(
  dataWinPath: string,
  entries: TxtrEntry[],
): Map<number, Buffer> {
  const results = new Map<number, Buffer>();
  if (entries.length === 0) return results;

  const py = resolvePythonCommand();
  if (!py) {
    throw new Error(
      'Python 3 with stdlib bz2 is required to decompress GameMaker 2zoq (QOI-BZ2) TXTR pages.',
    );
  }

  const payload = JSON.stringify({
    dataWinPath,
    pages: entries.map((e) => ({
      pageId: e.index,
      offset: e.blobOffset,
      size: e.blobSize,
    })),
  });

  const proc = spawnSync(py.cmd, [...py.prefixArgs, '-c', PYTHON_BZ2_BATCH_SCRIPT], {
    input: payload,
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true,
  });

  if (proc.status !== 0) {
    const stderr = proc.stderr ? proc.stderr.toString('utf8').trim() : 'unknown error';
    throw new Error(`BZip2 batch helper failed (exit ${proc.status}): ${stderr}`);
  }

  const outBuf = proc.stdout as Buffer;
  let pos = 0;
  while (pos + 8 <= outBuf.length) {
    const pageId = outBuf.readUInt32LE(pos);
    const len = outBuf.readUInt32LE(pos + 4);
    pos += 8;
    if (pos + len > outBuf.length) {
      throw new Error(`Truncated BZip2 stream for TXTR page ${pageId}`);
    }
    results.set(pageId, outBuf.subarray(pos, pos + len));
    pos += len;
  }

  if (results.size !== entries.length) {
    throw new Error(
      `Expected ${entries.length} decompressed TXTR pages, received ${results.size}`,
    );
  }
  return results;
}

// ============================================================================
// GameMaker `fioq` (QOI) RGBA Decoder (Pure TypeScript, Two's Complement Deltas)
// ============================================================================

function decodeGmFioq(buf: Buffer): DecodedPage {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'fioq') {
    throw new Error(
      `Expected GameMaker 'fioq' QOI header, got '${buf.toString('ascii', 0, 4)}'`,
    );
  }

  const width = buf.readUInt16LE(4);
  const height = buf.readUInt16LE(6);
  const dataLen = buf.readUInt32LE(8);
  const end = 12 + dataLen;
  if (end > buf.length) {
    throw new Error(`fioq payload truncated: expected ${end} bytes, got ${buf.length}`);
  }

  const totalBytes = width * height * 4;
  const rgba = new Uint8Array(totalBytes);

  // 64-entry running pixel hash cache (r, g, b, a interleaved)
  const index = new Uint8Array(64 * 4);

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  let run = 0;
  let pos = 12;
  let o = 0;

  while (o < totalBytes) {
    if (run > 0) {
      run--;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
      o += 4;
      continue;
    }

    if (pos >= end) {
      throw new Error(`fioq stream ended early at byte ${pos}/${end}, pixel ${o / 4}/${width * height}`);
    }

    const b1 = buf[pos++];
    if ((b1 & 0xc0) === 0x00) {
      // QOI_INDEX (6-bit index)
      const idx4 = (b1 & 0x3f) << 2;
      r = index[idx4];
      g = index[idx4 + 1];
      b = index[idx4 + 2];
      a = index[idx4 + 3];
    } else if ((b1 & 0xe0) === 0x40) {
      // QOI_RUN_8 (5-bit repeat count)
      run = b1 & 0x1f;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
      o += 4;
      continue;
    } else if ((b1 & 0xe0) === 0x60) {
      // QOI_RUN_16 (13-bit repeat count + 32)
      const b2 = buf[pos++];
      run = (((b1 & 0x1f) << 8) | b2) + 32;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
      o += 4;
      continue;
    } else if ((b1 & 0xc0) === 0x80) {
      // QOI_DIFF_8 (2-bit signed deltas for R, G, B)
      r = (r + ((((b1 >> 4) & 3) << 30) >> 30)) & 0xff;
      g = (g + ((((b1 >> 2) & 3) << 30) >> 30)) & 0xff;
      b = (b + (((b1 & 3) << 30) >> 30)) & 0xff;
    } else if ((b1 & 0xe0) === 0xc0) {
      // QOI_DIFF_16 (5-bit R, 4-bit G, 4-bit B signed deltas)
      const b2 = buf[pos++];
      r = (r + (((b1 & 0x1f) << 27) >> 27)) & 0xff;
      g = (g + ((((b2 >> 4) & 0x0f) << 28) >> 28)) & 0xff;
      b = (b + (((b2 & 0x0f) << 28) >> 28)) & 0xff;
    } else if ((b1 & 0xf0) === 0xe0) {
      // QOI_DIFF_24 (5-bit signed deltas for R, G, B, A)
      const b2 = buf[pos++];
      const b3 = buf[pos++];
      const dr = (((b1 & 0x0f) << 1) | (b2 >> 7));
      const dg = (b2 & 0x7c) >> 2;
      const db = ((b2 & 0x03) << 3) | ((b3 & 0xe0) >> 5);
      const da = b3 & 0x1f;
      r = (r + ((dr << 27) >> 27)) & 0xff;
      g = (g + ((dg << 27) >> 27)) & 0xff;
      b = (b + ((db << 27) >> 27)) & 0xff;
      a = (a + ((da << 27) >> 27)) & 0xff;
    } else {
      // QOI_COLOR (0xF0..0xFF channel bitmask: R=8, G=4, B=2, A=1)
      if (b1 & 8) r = buf[pos++];
      if (b1 & 4) g = buf[pos++];
      if (b1 & 2) b = buf[pos++];
      if (b1 & 1) a = buf[pos++];
    }

    const hash4 = ((r ^ g ^ b ^ a) & 63) << 2;
    index[hash4] = r;
    index[hash4 + 1] = g;
    index[hash4 + 2] = b;
    index[hash4 + 3] = a;

    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = a;
    o += 4;
  }

  if (pos !== end || run !== 0) {
    throw new Error(`fioq decode mismatch: pos=${pos}/${end}, remainingRun=${run}`);
  }

  return { width, height, rgba };
}

// ============================================================================
// Pure-TypeScript RGBA -> PNG Encoder (node:zlib deflateSync + IEEE CRC32)
// ============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodeRgbaToPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none

  const stride = width * 4;
  const rawScanlines = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const dstOff = y * (stride + 1);
    rawScanlines[dstOff] = 0; // filter type 0 (None)
    rawScanlines.set(rgba.subarray(y * stride, (y + 1) * stride), dstOff + 1);
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 6 });

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ============================================================================
// Read-Only FMOD FSB5 Bank Scanner (`sfx.bank` / `music.bank`)
// ============================================================================

function scanFsb5Bank(
  bankPath: string,
  mappedIndices: number[],
): Fsb5BankSummary {
  if (!fs.existsSync(bankPath)) {
    return {
      present: false,
      fileBytes: 0,
      version: 0,
      numSamples: 0,
      codec: 'MISSING',
      mode: 0,
      mappedCount: mappedIndices.length,
      verifiedIndices: 0,
      sampleNamesPreview: [],
    };
  }

  const buf = fs.readFileSync(bankPath);
  const idx = buf.indexOf('FSB5', 0, 'ascii');
  if (idx === -1 || idx + 28 > buf.length) {
    throw new Error(`FSB5 header not found in ${bankPath}`);
  }

  const version = buf.readUInt32LE(idx + 4);
  const numSamples = buf.readUInt32LE(idx + 8);
  const shdrSize = buf.readUInt32LE(idx + 12);
  const nameSize = buf.readUInt32LE(idx + 16);
  const mode = buf.readUInt32LE(idx + 24);
  const codec = FSB5_CODECS[mode] ?? `UNKNOWN_${mode}`;

  const verifiedIndices = mappedIndices.filter((n) => n >= 0 && n < numSamples).length;
  const sampleNamesPreview: string[] = [];

  if (nameSize > 0) {
    const headerLen = version === 1 ? 60 : 64;
    const nameTableOff = idx + headerLen + shdrSize;
    const previewCount = Math.min(8, numSamples);
    for (let i = 0; i < previewCount; i++) {
      const ptrOff = nameTableOff + i * 4;
      if (ptrOff + 4 > buf.length) break;
      const rel = buf.readUInt32LE(ptrOff);
      const strStart = nameTableOff + rel;
      if (strStart >= buf.length) break;
      let strEnd = buf.indexOf(0, strStart);
      if (strEnd === -1 || strEnd > nameTableOff + nameSize) {
        strEnd = Math.min(buf.length, nameTableOff + nameSize);
      }
      sampleNamesPreview.push(buf.toString('utf8', strStart, strEnd));
    }
  }

  return {
    present: true,
    fileBytes: buf.length,
    version,
    numSamples,
    codec,
    mode,
    mappedCount: mappedIndices.length,
    verifiedIndices,
    sampleNamesPreview,
  };
}

// ============================================================================
// Main Extractor Entrypoint
// ============================================================================

function nextPow2(v: number): number {
  let p = 64;
  while (p < v) p <<= 1;
  return p;
}

function main(): void {
  const startedAt = Date.now();
  const steamDir = process.env.PIZZA_TOWER_DIR ?? DEFAULT_STEAM_DIR;
  const dataWinPath = path.join(steamDir, 'data.win');
  const sfxBankPath = path.join(steamDir, 'sound', 'Desktop', 'sfx.bank');
  const musicBankPath = path.join(steamDir, 'sound', 'Desktop', 'music.bank');

  if (!fs.existsSync(dataWinPath)) {
    console.log(
      `[extract] Local Steam installation not found at "${steamDir}" (missing data.win). ` +
        'Skipping local Custom Pack extraction cleanly (Built-In KrunkedAtlas remains active).',
    );
    process.exit(0);
  }

  // Strictly READ-ONLY open of Steam data.win
  const dataWinBuf = fs.readFileSync(dataWinPath);
  const chunks = parseFormChunks(dataWinBuf);
  for (const required of ['TXTR', 'TPAG', 'SPRT', 'STRG'] as const) {
    if (!chunks[required]) {
      throw new Error(`data.win missing required IFF chunk: ${required}`);
    }
  }

  const strgCount = parseStrgCount(dataWinBuf, chunks.STRG);
  const txtrEntries = parseTxtrChunk(dataWinBuf, chunks.TXTR);
  const tpagMap = parseTpagChunk(dataWinBuf, chunks.TPAG);
  const sprtMap = parseSprtChunk(dataWinBuf, chunks.SPRT);

  // Build target sprite extraction list:
  //   1. All 149 canonical bindings from CUSTOM_SPRITE_MAP
  //   2. All 11 taunt frames (`peppo_taunt_0..10`) from `spr_player_taunt`
  const bindingList: Array<{ key: string; retailSprite: string; frame: number }> = [];
  for (const [key, binding] of Object.entries(CUSTOM_SPRITE_MAP)) {
    bindingList.push({ key, retailSprite: binding.retailSprite, frame: binding.frame ?? 0 });
  }
  const tauntSprt = sprtMap.get('spr_player_taunt');
  if (tauntSprt && tauntSprt.tpagOffsets.length >= 11) {
    for (let i = 0; i < 11; i++) {
      bindingList.push({ key: `peppo_taunt_${i}`, retailSprite: 'spr_player_taunt', frame: i });
    }
  }

  const resolvedTargets: ResolvedTargetSprite[] = [];
  const missingTargets: string[] = [];
  const neededPageIds = new Set<number>();

  for (const item of bindingList) {
    const sprt = sprtMap.get(item.retailSprite);
    if (!sprt || sprt.tpagOffsets.length === 0) {
      missingTargets.push(`${item.key} (${item.retailSprite})`);
      continue;
    }
    const frameIdx = Math.min(item.frame, sprt.tpagOffsets.length - 1);
    const tpagOff = sprt.tpagOffsets[frameIdx];
    const tpag = tpagMap.get(tpagOff);
    if (!tpag || tpag.sourceW <= 0 || tpag.sourceH <= 0) {
      missingTargets.push(`${item.key} (${item.retailSprite}[${frameIdx}] invalid TPAG)`);
      continue;
    }
    if (tpag.texturePageId >= txtrEntries.length) {
      missingTargets.push(`${item.key} (TXTR page ${tpag.texturePageId} out of bounds)`);
      continue;
    }
    neededPageIds.add(tpag.texturePageId);
    resolvedTargets.push({
      key: item.key,
      retailSprite: item.retailSprite,
      frame: frameIdx,
      sprt,
      tpag,
    });
  }

  if (resolvedTargets.length === 0) {
    throw new Error('No sprites resolved from data.win against CUSTOM_SPRITE_MAP.');
  }

  // Decode only the needed TXTR pages (typically ~34 / 287)
  const pagesToBz2: TxtrEntry[] = [];
  const rawFioqPages: Array<{ pageId: number; buf: Buffer }> = [];

  for (const pageId of Array.from(neededPageIds).sort((a, b) => a - b)) {
    const entry = txtrEntries[pageId];
    if (entry.magic === '2zoq') {
      pagesToBz2.push(entry);
    } else if (entry.magic === 'fioq') {
      rawFioqPages.push({
        pageId,
        buf: dataWinBuf.subarray(entry.blobOffset, entry.blobOffset + entry.blobSize),
      });
    } else {
      throw new Error(`Unsupported TXTR[${pageId}] texture format magic: '${entry.magic}'`);
    }
  }

  const decompressedByPage = decompress2zoqPagesBatch(dataWinPath, pagesToBz2);
  for (const raw of rawFioqPages) {
    decompressedByPage.set(raw.pageId, raw.buf);
  }

  const decodedPages = new Map<number, DecodedPage>();
  for (const [pageId, fioqBuf] of decompressedByPage.entries()) {
    decodedPages.set(pageId, decodeGmFioq(fioqBuf));
  }

  // Deduplicate identical TPAG source rects so shared bindings pack once cleanly
  const uniqueTpags = new Map<number, TpagEntry>();
  for (const target of resolvedTargets) {
    if (!uniqueTpags.has(target.tpag.offset)) {
      uniqueTpags.set(target.tpag.offset, target.tpag);
    }
  }

  // Sort unique TPAG rects by descending height for tight shelf packing
  const sortedTpags = Array.from(uniqueTpags.values()).sort(
    (a, b) => b.sourceH - a.sourceH || b.sourceW - a.sourceW,
  );

  let cursorX = PACK_PADDING;
  let cursorY = PACK_PADDING;
  let rowH = 0;
  const packedByTpag = new Map<number, PackedRect>();

  for (const tpag of sortedTpags) {
    const w = tpag.sourceW;
    const h = tpag.sourceH;
    if (cursorX + w + PACK_PADDING > PACK_WIDTH) {
      cursorX = PACK_PADDING;
      cursorY += rowH + PACK_PADDING;
      rowH = 0;
    }
    if (cursorY + h + PACK_PADDING > PACK_MAX_HEIGHT) {
      throw new Error(
        `Custom atlas overflow (${PACK_WIDTH}x${PACK_MAX_HEIGHT}) while packing TPAG @${tpag.offset} (${w}x${h})`,
      );
    }
    packedByTpag.set(tpag.offset, { x: cursorX, y: cursorY, w, h });
    cursorX += w + PACK_PADDING;
    if (h > rowH) rowH = h;
  }

  const usedHeight = cursorY + rowH + PACK_PADDING;
  const atlasWidth = PACK_WIDTH;
  const atlasHeight = Math.min(PACK_MAX_HEIGHT, nextPow2(usedHeight));
  const atlasPixels = new Uint8Array(atlasWidth * atlasHeight * 4);

  // Blit each unique TPAG rect from decoded TXTR page into the packed RGBA atlas
  for (const tpag of sortedTpags) {
    const page = decodedPages.get(tpag.texturePageId);
    const dst = packedByTpag.get(tpag.offset);
    if (!page || !dst) continue;

    if (
      tpag.sourceX + tpag.sourceW > page.width ||
      tpag.sourceY + tpag.sourceH > page.height
    ) {
      throw new Error(
        `TPAG @${tpag.offset} rect (${tpag.sourceX},${tpag.sourceY},${tpag.sourceW}x${tpag.sourceH}) ` +
          `exceeds TXTR[${tpag.texturePageId}] bounds (${page.width}x${page.height})`,
      );
    }

    const rowBytes = tpag.sourceW * 4;
    for (let y = 0; y < tpag.sourceH; y++) {
      const srcOff = ((tpag.sourceY + y) * page.width + tpag.sourceX) * 4;
      const dstOff = ((dst.y + y) * atlasWidth + dst.x) * 4;
      atlasPixels.set(page.rgba.subarray(srcOff, srcOff + rowBytes), dstOff);
    }
  }

  // Build manifest entries aligned with Built-In KrunkedAtlas pivot convention
  const builtinAtlas = buildKrunkedAtlas();
  const manifestSprites: Record<string, AssetManifestEntry> = {};

  for (const target of resolvedTargets) {
    const packed = packedByTpag.get(target.tpag.offset);
    if (!packed) continue;

    const builtinRect = builtinAtlas.rects[target.key];
    let pivotX: number;
    let pivotY: number;

    if (target.key.startsWith('tile_')) {
      pivotX = 0;
      pivotY = 0;
    } else if (builtinRect && builtinRect.w > 0 && builtinRect.h > 0) {
      pivotX = Math.round((builtinRect.pivotX / builtinRect.w) * packed.w);
      pivotY = Math.round((builtinRect.pivotY / builtinRect.h) * packed.h);
    } else {
      pivotX = Math.max(
        0,
        Math.min(packed.w, target.sprt.originX - target.tpag.targetX),
      );
      pivotY = Math.max(
        0,
        Math.min(packed.h, target.sprt.originY - target.tpag.targetY),
      );
    }

    manifestSprites[target.key] = {
      key: target.key,
      atlasPage: 0,
      x: packed.x,
      y: packed.y,
      w: packed.w,
      h: packed.h,
      pivotX,
      pivotY,
    };
  }

  // Strictly read-only scan of FMOD FSB5 audio banks (metadata + index verification)
  // Note: FSB5 mode 15 (FMOD headerless Vorbis) requires external FMOD codec tables,
  // so `audio` stays empty cleanly and Built-In Web Audio synth plays seamlessly.
  const sfxMappedIndices = Object.values(CUSTOM_SFX_MAP)
    .filter((v): v is NonNullable<typeof v> => v !== undefined)
    .map((v) => v.index);
  const musicMappedIndices = Object.values(CUSTOM_MUSIC_MAP)
    .filter((v): v is NonNullable<typeof v> => v !== undefined)
    .map((v) => v.index);

  const sfxBank = scanFsb5Bank(sfxBankPath, sfxMappedIndices);
  const musicBank = scanFsb5Bank(musicBankPath, musicMappedIndices);

  const manifest: ExtendedAssetManifest = {
    version: 1,
    source: 'custom',
    generatedAt: new Date().toISOString(),
    atlasImage: ATLAS_FILENAME,
    atlasPages: [ATLAS_FILENAME],
    atlasWidth,
    atlasHeight,
    spriteCount: Object.keys(manifestSprites).length,
    sprites: manifestSprites,
    audio: {},
    audioBanks: {
      sfx: sfxBank,
      music: musicBank,
    },
  };

  // Write ONLY into gitignored `.krunked-tower-assets/`
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const atlasPath = path.join(OUTPUT_DIR, ATLAS_FILENAME);
  const manifestPath = path.join(OUTPUT_DIR, MANIFEST_FILENAME);

  const pngBuf = encodeRgbaToPng(atlasWidth, atlasHeight, atlasPixels);
  fs.writeFileSync(atlasPath, pngBuf);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[extract] Extracted ${manifest.spriteCount} sprites (${uniqueTpags.size} unique rects from ` +
      `${neededPageIds.size}/${txtrEntries.length} TXTR pages; SPRT=${sprtMap.size}, TPAG=${tpagMap.size}, STRG=${strgCount}) ` +
      `into ${path.relative(process.cwd(), atlasPath)} (${atlasWidth}x${atlasHeight}, ${(pngBuf.length / 1024).toFixed(1)} KB) ` +
      `in ${elapsedMs}ms.`,
  );
  console.log(
    `[extract] FSB5 banks scanned: sfx=${sfxBank.numSamples} (${sfxBank.codec}, ` +
      `${sfxBank.verifiedIndices}/${sfxBank.mappedCount} mapped valid), ` +
      `music=${musicBank.numSamples} (${musicBank.codec}, ` +
      `${musicBank.verifiedIndices}/${musicBank.mappedCount} mapped valid) — Built-In synth fallback active for Vorbis banks.`,
  );
  if (missingTargets.length > 0) {
    console.warn(`[extract] Unmatched bindings (${missingTargets.length}): ${missingTargets.join(', ')}`);
  }
}

main();
