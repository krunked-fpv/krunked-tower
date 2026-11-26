// ============================================================================
// Krunked Tower — Procedural Web Audio Cartoon Synth & Step Sequencer
// 90s chunky brass/funk step-sequencer for all 38 playable MusicTrackIds
// plus expressive kinetic cartoon SFX synthesis for all 42 SfxIds.
// Imports ONLY `../contracts/index` and `./soundManifest` (ZERO DOM globals).
// ============================================================================

import type { AudioSettings, MusicTrackId, SfxId } from '../contracts/index';
import {
  DEFAULT_AUDIO_SETTINGS,
} from '../contracts/index';
import {
  GLOBAL_MAX_SFX_POLYPHONY,
  MUSIC_MANIFEST,
  SFX_MANIFEST,
  midiToFreq,
  scaleDegreeToMidi,
  type BassStyle,
  type ChordStyle,
  type LeadStyle,
  type MusicTrackMeta,
  type PercussionStyle,
  type SfxPriority,
} from './soundManifest';

export interface SfxPlayOptions {
  pan?: number;
  pitchJitter?: number;
  volume?: number;
}

interface NoteEvent {
  /** Scale degree relative to track root (can be negative or > scale length) */
  deg: number;
  /** Duration in 16th-note steps */
  len: number;
  /** Velocity 0..1 */
  vel?: number;
  /** Optional chromatic semitone offset (e.g. +1 or -1 for funky passing tones) */
  semi?: number;
}

interface ChordEvent {
  /** Base scale degree for the triad */
  deg: number;
  /** Duration in 16th-note steps */
  len: number;
  /** Velocity 0..1 */
  vel?: number;
}

type DrumHit = 'K' | 'S' | 'H' | 'O' | 'C' | 'T' | 'B' | 'R' | 'A';

interface TrackArrangement {
  /** Total 16th-note steps in the arrangement loop (typically 64 = 4 bars) */
  steps: number;
  bass: ReadonlyArray<NoteEvent | null>;
  lead: ReadonlyArray<NoteEvent | null>;
  chords: ReadonlyArray<ChordEvent | null>;
  drums: ReadonlyArray<string>; // e.g. 'KH' = kick + closed hat on that 16th step
}

interface ActiveSfxVoice {
  id: SfxId;
  endTimeMs: number;
  priorityRank: number;
  stop: () => void;
}

const PRIORITY_RANK: Record<SfxPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
};

/** Compact pattern builder turning sparse step-index maps into dense arrays. */
function makeNoteTrack(
  steps: number,
  entries: ReadonlyArray<[number, number, number?, number?, number?]>,
): Array<NoteEvent | null> {
  const arr: Array<NoteEvent | null> = new Array(steps).fill(null);
  for (const [step, deg, len = 1, vel = 0.85, semi = 0] of entries) {
    const idx = ((step % steps) + steps) % steps;
    arr[idx] = { deg, len, vel, semi };
  }
  return arr;
}

function makeChordTrack(
  steps: number,
  entries: ReadonlyArray<[number, number, number?, number?]>,
): Array<ChordEvent | null> {
  const arr: Array<ChordEvent | null> = new Array(steps).fill(null);
  for (const [step, deg, len = 2, vel = 0.7] of entries) {
    const idx = ((step % steps) + steps) % steps;
    arr[idx] = { deg, len, vel };
  }
  return arr;
}

function makeDrumPattern(style: PercussionStyle, steps: number): string[] {
  const out: string[] = new Array(steps).fill('');
  for (let i = 0; i < steps; i++) {
    const bar = Math.floor(i / 16);
    const s = i % 16;
    const isLastBar = bar === Math.floor(steps / 16) - 1;
    let hits = '';

    switch (style) {
      case 'none':
        break;
      case 'funk_break':
        if (s === 0 || s === 6 || s === 10 || (bar % 2 === 1 && s === 14)) hits += 'K';
        if (s === 4 || s === 12) hits += 'SC';
        if (s % 2 === 0) hits += s === 14 ? 'O' : 'H';
        else if (s === 7 || s === 15) hits += 'H';
        if (isLastBar && (s === 13 || s === 14 || s === 15)) hits += s === 15 ? 'ST' : 'T';
        if (bar % 2 === 1 && s === 3) hits += 'B';
        break;
      case 'cartoon_march':
        if (s === 0 || s === 8 || (bar % 2 === 1 && s === 14)) hits += 'K';
        if (s === 4 || s === 12) hits += 'S';
        if (s === 2 || s === 6 || s === 10 || s === 14) hits += 'H';
        if (s === 7 || s === 15) hits += 'R';
        if (isLastBar && s >= 12) hits += s % 2 === 0 ? 'S' : 'T';
        break;
      case 'hyper_dnb':
        if (s === 0 || s === 3 || s === 8 || s === 10) hits += 'K';
        if (s === 4 || s === 12 || (bar % 2 === 1 && s === 15)) hits += 'S';
        hits += s % 2 === 0 ? 'H' : s === 7 || s === 15 ? 'O' : 'H';
        if (s === 6 || s === 14) hits += 'C';
        if (isLastBar && (s === 11 || s === 13 || s === 14)) hits += 'ST';
        break;
      case 'western_gallop':
        if (s === 0 || s === 3 || s === 4 || s === 8 || s === 11 || s === 12) hits += 'K';
        if (s === 4 || s === 12) hits += 'S';
        if (s === 2 || s === 6 || s === 10 || s === 14) hits += 'R';
        if (s % 4 === 0) hits += 'H';
        if (isLastBar && (s === 14 || s === 15)) hits += 'TS';
        break;
      case 'spooky_rim':
        if (s === 0 || s === 10) hits += 'K';
        if (s === 4 || s === 12) hits += 'R';
        if (s === 2 || s === 7 || s === 14) hits += 'H';
        if (bar % 2 === 1 && s === 15) hits += 'T';
        break;
      case 'industrial_clang':
        if (s === 0 || s === 6 || s === 8 || s === 14) hits += 'K';
        if (s === 4 || s === 12) hits += 'SA';
        if (s === 2 || s === 10) hits += 'H';
        if (bar % 2 === 1 && (s === 7 || s === 15)) hits += 'A';
        break;
      case 'swing_brush':
        if (s === 0 || s === 8) hits += 'K';
        if (s === 4 || s === 12) hits += 'R';
        if (s === 0 || s === 4 || s === 7 || s === 8 || s === 12 || s === 15) hits += 'H';
        if (isLastBar && s === 14) hits += 'T';
        break;
      case 'boss_thrash':
        if (s === 0 || s === 2 || s === 8 || s === 10 || s === 14) hits += 'K';
        if (s === 4 || s === 12) hits += 'SC';
        if (s % 2 === 0) hits += 'H';
        if (s === 6 || s === 14) hits += 'O';
        if (isLastBar && s >= 12) hits += 'ST';
        break;
      case 'minimal_tick':
        if (s === 0 || s === 8) hits += 'R';
        if (s === 4 || s === 12) hits += 'H';
        if (bar % 2 === 1 && s === 14) hits += 'B';
        break;
    }
    out[i] = hits;
  }
  return out;
}

// ============================================================================
// Hand-Crafted Flagship Wave 1 Musical Arrangements (64 steps = 4 bars)
// ============================================================================

const FLAGSHIP_ARRANGEMENTS: Partial<Record<MusicTrackId, TrackArrangement>> = {
  // 1. TITLE — "Krunked Tower Overture" (C Mixolydian, 138 BPM)
  title: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.95], [3, 0, 1, 0.75], [4, 7, 2, 0.9], [6, 6, 2, 0.85],
      [8, 4, 2, 0.9], [10, 2, 2, 0.85], [12, 3, 2, 0.9], [14, 4, 2, 0.85],
      [16, 0, 2, 0.95], [19, 0, 1, 0.75], [20, 7, 2, 0.9], [22, 5, 2, 0.85],
      [24, 4, 2, 0.9], [26, 3, 2, 0.85], [28, 2, 2, 0.9], [30, 6, 2, 0.9],
      [32, 3, 2, 0.95], [35, 3, 1, 0.75], [36, 5, 2, 0.9], [38, 6, 2, 0.85],
      [40, 4, 2, 0.95], [43, 4, 1, 0.75], [44, 6, 2, 0.9], [46, 7, 2, 0.85],
      [48, 0, 2, 0.95], [50, 4, 2, 0.9], [52, 6, 2, 0.9], [54, 4, 2, 0.85],
      [56, 3, 2, 0.95], [58, 4, 2, 0.95], [60, 0, 2, 1.0], [62, 6, 2, 0.9],
    ]),
    lead: makeNoteTrack(64, [
      [0, 7, 2, 0.95], [2, 9, 2, 0.9], [4, 11, 3, 1.0], [8, 10, 2, 0.9], [10, 9, 2, 0.85], [12, 7, 3, 0.95],
      [16, 7, 2, 0.9], [18, 11, 2, 0.95], [20, 14, 3, 1.0], [24, 13, 2, 0.9], [26, 11, 2, 0.9], [28, 10, 2, 0.85], [30, 9, 2, 0.85],
      [32, 10, 2, 0.95], [34, 12, 2, 0.95], [36, 14, 3, 1.0], [40, 11, 2, 0.95], [42, 13, 2, 0.95], [44, 14, 3, 1.0],
      [48, 14, 2, 1.0], [50, 13, 1, 0.85], [51, 14, 1, 0.9], [52, 16, 3, 1.0], [56, 14, 2, 0.95], [58, 11, 2, 0.95], [60, 14, 3, 1.0],
    ]),
    chords: makeChordTrack(64, [
      [0, 0, 2, 0.8], [6, 0, 2, 0.65], [12, 4, 2, 0.75],
      [16, 0, 2, 0.8], [22, 6, 2, 0.7], [28, 4, 2, 0.75],
      [32, 3, 3, 0.85], [40, 4, 3, 0.85],
      [48, 0, 2, 0.85], [54, 6, 2, 0.8], [60, 0, 3, 0.9],
    ]),
    drums: makeDrumPattern('funk_break', 64),
  },

  // 2. HUB 1 — "Lobby Shuffle" (F Mixolydian, 118 BPM)
  hub_1: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 3, 0.85], [4, 2, 3, 0.8], [8, 4, 3, 0.85], [12, 6, 3, 0.8],
      [16, 7, 3, 0.85], [20, 6, 3, 0.8], [24, 4, 3, 0.85], [28, 2, 3, 0.8],
      [32, 3, 3, 0.85], [36, 4, 3, 0.8], [40, 5, 3, 0.85], [44, 4, 3, 0.8],
      [48, 0, 3, 0.85], [52, 4, 3, 0.8], [56, 6, 2, 0.85], [58, 4, 2, 0.8], [60, 2, 2, 0.8], [62, 1, 2, 0.75],
    ]),
    lead: makeNoteTrack(64, [
      [2, 7, 2, 0.85], [4, 9, 2, 0.85], [7, 11, 3, 0.9], [12, 9, 2, 0.8], [14, 7, 2, 0.8],
      [18, 10, 2, 0.85], [20, 9, 2, 0.8], [22, 7, 3, 0.85], [28, 6, 2, 0.8], [30, 7, 2, 0.85],
      [34, 10, 2, 0.85], [36, 12, 2, 0.9], [39, 11, 3, 0.85], [44, 9, 2, 0.8], [46, 10, 2, 0.85],
      [50, 11, 2, 0.9], [52, 9, 2, 0.85], [54, 7, 2, 0.85], [58, 6, 2, 0.8], [60, 7, 3, 0.9],
    ]),
    chords: makeChordTrack(64, [
      [4, 0, 2, 0.65], [12, 0, 2, 0.6], [20, 6, 2, 0.65], [28, 4, 2, 0.6],
      [36, 3, 2, 0.65], [44, 4, 2, 0.65], [52, 0, 2, 0.65], [60, 4, 2, 0.7],
    ]),
    drums: makeDrumPattern('swing_brush', 64),
  },

  // 3. HUB 2 — "Dusty Saloon Mezzanine" (D Blues, 124 BPM)
  hub_2: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 3, 0.85], [4, 1, 3, 0.8], [8, 2, 3, 0.85], [12, 4, 3, 0.85],
      [16, 0, 3, 0.85], [20, 4, 3, 0.8], [24, 5, 3, 0.85], [28, 4, 3, 0.8],
      [32, 2, 3, 0.85], [36, 4, 3, 0.8], [40, 2, 3, 0.85], [44, 1, 3, 0.8],
      [48, 0, 3, 0.85], [52, 5, 3, 0.85], [56, 4, 2, 0.85], [58, 2, 2, 0.8], [60, 1, 2, 0.8], [62, 0, 2, 0.85],
    ]),
    lead: makeNoteTrack(64, [
      [0, 6, 2, 0.85], [3, 7, 2, 0.85], [6, 8, 2, 0.9], [8, 9, 2, 0.9], [10, 8, 2, 0.85], [12, 6, 3, 0.85],
      [18, 10, 2, 0.9], [20, 9, 2, 0.85], [22, 8, 2, 0.85], [24, 7, 3, 0.85], [28, 6, 3, 0.85],
      [32, 8, 2, 0.9], [35, 10, 2, 0.9], [38, 11, 2, 0.95], [40, 10, 2, 0.9], [42, 8, 2, 0.85], [44, 7, 3, 0.85],
      [48, 6, 2, 0.85], [51, 8, 2, 0.9], [54, 10, 2, 0.9], [56, 9, 2, 0.85], [58, 7, 2, 0.8], [60, 6, 3, 0.9],
    ]),
    chords: makeChordTrack(64, [
      [4, 0, 2, 0.6], [12, 0, 2, 0.6], [20, 0, 2, 0.6], [28, 4, 2, 0.65],
      [36, 2, 2, 0.65], [44, 2, 2, 0.6], [52, 4, 2, 0.65], [60, 0, 2, 0.7],
    ]),
    drums: makeDrumPattern('western_gallop', 64),
  },

  // 4. HUB 3 — "Resort Promenade" (G Lydian, 122 BPM)
  hub_3: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.85], [3, 0, 2, 0.8], [6, 4, 2, 0.85], [10, 2, 2, 0.8], [12, 4, 2, 0.85], [14, 5, 2, 0.8],
      [16, 1, 2, 0.85], [19, 1, 2, 0.8], [22, 4, 2, 0.85], [26, 3, 2, 0.8], [28, 2, 2, 0.85], [30, 4, 2, 0.8],
      [32, 0, 2, 0.85], [35, 2, 2, 0.8], [38, 4, 2, 0.85], [42, 6, 2, 0.85], [44, 5, 2, 0.8], [46, 4, 2, 0.8],
      [48, 3, 2, 0.85], [51, 3, 2, 0.8], [54, 4, 2, 0.85], [58, 2, 2, 0.8], [60, 0, 3, 0.9],
    ]),
    lead: makeNoteTrack(64, [
      [0, 7, 2, 0.85], [2, 9, 2, 0.85], [4, 11, 2, 0.9], [7, 13, 3, 0.9], [12, 11, 2, 0.85], [14, 9, 2, 0.8],
      [16, 10, 2, 0.85], [18, 11, 2, 0.85], [20, 14, 3, 0.92], [24, 13, 2, 0.85], [26, 11, 2, 0.85], [28, 9, 3, 0.85],
      [32, 11, 2, 0.9], [34, 13, 2, 0.9], [36, 14, 2, 0.92], [38, 16, 3, 0.95], [42, 14, 2, 0.88], [44, 13, 2, 0.85], [46, 11, 2, 0.85],
      [48, 10, 2, 0.88], [50, 11, 2, 0.88], [52, 9, 2, 0.85], [54, 7, 2, 0.85], [58, 9, 2, 0.85], [60, 7, 3, 0.9],
    ]),
    chords: makeChordTrack(64, [
      [0, 0, 3, 0.65], [8, 4, 3, 0.6], [16, 1, 3, 0.65], [24, 4, 3, 0.6],
      [32, 0, 3, 0.65], [40, 5, 3, 0.65], [48, 3, 3, 0.65], [56, 4, 3, 0.65],
    ]),
    drums: makeDrumPattern('funk_break', 64),
  },

  // 5. HUB 4 — "Back-Alley Boiler Room" (E Dorian, 114 BPM)
  hub_4: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.9], [3, 0, 1, 0.8], [6, 2, 2, 0.85], [8, 3, 2, 0.85], [10, 4, 2, 0.9], [14, 6, 2, 0.85],
      [16, 0, 2, 0.9], [19, 0, 1, 0.8], [22, 6, 2, 0.85], [24, 5, 2, 0.85], [26, 4, 2, 0.85], [30, 2, 2, 0.85],
      [32, 3, 2, 0.9], [35, 3, 1, 0.8], [38, 4, 2, 0.85], [40, 5, 2, 0.85], [42, 6, 2, 0.9], [46, 4, 2, 0.85],
      [48, 0, 2, 0.9], [52, 2, 2, 0.85], [54, 3, 2, 0.85], [56, 4, 2, 0.9], [60, 6, 2, 0.85], [62, 5, 2, 0.85],
    ]),
    lead: makeNoteTrack(64, [
      [2, 7, 2, 0.85], [4, 9, 3, 0.88], [10, 11, 2, 0.9], [12, 10, 2, 0.85], [14, 9, 2, 0.8],
      [18, 12, 2, 0.9], [20, 11, 2, 0.85], [22, 9, 3, 0.85], [28, 7, 2, 0.8], [30, 6, 2, 0.8],
      [34, 10, 2, 0.88], [36, 12, 2, 0.9], [38, 13, 3, 0.92], [44, 11, 2, 0.85], [46, 9, 2, 0.85],
      [50, 7, 2, 0.88], [52, 9, 2, 0.88], [54, 11, 2, 0.9], [58, 9, 2, 0.85], [60, 7, 3, 0.9],
    ]),
    chords: makeChordTrack(64, [
      [2, 0, 2, 0.65], [6, 0, 2, 0.6], [12, 3, 2, 0.65], [18, 0, 2, 0.65],
      [26, 5, 2, 0.65], [34, 3, 2, 0.7], [42, 4, 2, 0.65], [50, 0, 2, 0.65], [58, 6, 2, 0.65],
    ]),
    drums: makeDrumPattern('funk_break', 64),
  },

  // 6. HUB 5 — "Penthouse Overture" (C Harmonic Minor, 128 BPM)
  hub_5: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.9], [2, 7, 2, 0.8], [4, 0, 2, 0.9], [6, 7, 2, 0.8],
      [8, 5, 2, 0.9], [10, 12, 2, 0.8], [12, 4, 2, 0.9], [14, 11, 2, 0.8],
      [16, 0, 2, 0.9], [18, 7, 2, 0.8], [20, 2, 2, 0.85], [22, 9, 2, 0.8],
      [24, 3, 2, 0.9], [26, 10, 2, 0.8], [28, 4, 2, 0.9], [30, 6, 2, 0.85],
      [32, 5, 2, 0.9], [34, 12, 2, 0.8], [36, 4, 2, 0.9], [38, 11, 2, 0.8],
      [40, 3, 2, 0.9], [42, 10, 2, 0.8], [44, 2, 2, 0.85], [46, 4, 2, 0.85],
      [48, 0, 2, 0.9], [50, 7, 2, 0.8], [52, 5, 2, 0.9], [54, 4, 2, 0.9],
      [56, 3, 2, 0.9], [58, 4, 2, 0.9], [60, 6, 2, 0.95], [62, 4, 2, 0.9],
    ]),
    lead: makeNoteTrack(64, [
      [0, 14, 3, 0.9], [4, 13, 2, 0.85], [6, 11, 2, 0.85], [8, 12, 3, 0.9], [12, 11, 3, 0.9],
      [16, 14, 2, 0.9], [18, 16, 2, 0.92], [20, 15, 3, 0.92], [24, 14, 2, 0.88], [26, 13, 2, 0.88], [28, 11, 3, 0.9],
      [32, 12, 3, 0.9], [36, 11, 2, 0.88], [38, 10, 2, 0.85], [40, 9, 3, 0.88], [44, 11, 3, 0.9],
      [48, 14, 2, 0.92], [50, 13, 2, 0.88], [52, 12, 2, 0.9], [54, 11, 2, 0.9], [56, 10, 2, 0.88], [58, 11, 2, 0.9], [60, 13, 3, 0.95],
    ]),
    chords: makeChordTrack(64, [
      [0, 0, 6, 0.65], [8, 5, 4, 0.65], [12, 4, 4, 0.7],
      [16, 0, 6, 0.65], [24, 3, 4, 0.65], [28, 4, 4, 0.7],
      [32, 5, 4, 0.7], [36, 4, 4, 0.7], [40, 3, 4, 0.65], [44, 4, 4, 0.7],
      [48, 0, 4, 0.7], [52, 5, 4, 0.7], [56, 4, 6, 0.75],
    ]),
    drums: makeDrumPattern('cartoon_march', 64),
  },

  // 7. TUTORIAL — "Chef Warmup Course" (C Major, 132 BPM)
  tutorial: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.9], [4, 4, 2, 0.85], [8, 0, 2, 0.9], [12, 4, 2, 0.85],
      [16, 3, 2, 0.9], [20, 0, 2, 0.85], [24, 4, 2, 0.9], [28, 1, 2, 0.85],
      [32, 0, 2, 0.9], [36, 2, 2, 0.85], [40, 3, 2, 0.9], [44, 4, 2, 0.9],
      [48, 5, 2, 0.9], [52, 3, 2, 0.85], [56, 4, 2, 0.9], [60, 0, 2, 0.95], [62, 4, 2, 0.85],
    ]),
    lead: makeNoteTrack(64, [
      [0, 7, 2, 0.88], [2, 9, 2, 0.88], [4, 11, 2, 0.92], [6, 9, 2, 0.85], [8, 7, 2, 0.88], [10, 11, 2, 0.9], [12, 14, 3, 0.95],
      [16, 12, 2, 0.9], [18, 10, 2, 0.88], [20, 9, 2, 0.88], [22, 7, 2, 0.85], [24, 11, 2, 0.9], [26, 9, 2, 0.88], [28, 8, 3, 0.9],
      [32, 7, 2, 0.88], [34, 8, 2, 0.88], [36, 9, 2, 0.9], [38, 11, 2, 0.9], [40, 12, 2, 0.92], [42, 11, 2, 0.9], [44, 14, 3, 0.95],
      [48, 12, 2, 0.92], [50, 11, 2, 0.9], [52, 10, 2, 0.88], [54, 9, 2, 0.88], [56, 11, 2, 0.9], [58, 13, 2, 0.9], [60, 14, 3, 0.95],
    ]),
    chords: makeChordTrack(64, [
      [2, 0, 2, 0.65], [6, 0, 2, 0.65], [10, 0, 2, 0.65], [14, 4, 2, 0.7],
      [18, 3, 2, 0.65], [22, 3, 2, 0.65], [26, 4, 2, 0.7], [30, 4, 2, 0.65],
      [34, 0, 2, 0.65], [42, 3, 2, 0.7], [50, 5, 2, 0.65], [58, 4, 2, 0.7],
    ]),
    drums: makeDrumPattern('cartoon_march', 64),
  },

  // 8. STAGE CRYPT — "Gutter Crypt Strut" (D Dorian, 148 BPM) — Flagship Stage 1!
  stage_crypt: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.95], [3, 0, 1, 0.8], [4, 2, 2, 0.9], [6, 3, 2, 0.9],
      [8, 4, 2, 0.95], [10, 6, 2, 0.9], [12, 7, 2, 0.95], [14, 6, 1, 0.85], [15, 4, 1, 0.85],
      [16, 0, 2, 0.95], [19, 0, 1, 0.8], [20, 2, 2, 0.9], [22, 3, 2, 0.9],
      [24, 5, 2, 0.95], [26, 4, 2, 0.9], [28, 3, 2, 0.9], [30, 2, 2, 0.9],
      [32, 3, 2, 0.95], [35, 3, 1, 0.8], [36, 5, 2, 0.9], [38, 6, 2, 0.9],
      [40, 4, 2, 0.95], [43, 4, 1, 0.8], [44, 6, 2, 0.9], [46, 7, 2, 0.9],
      [48, 0, 2, 0.95], [50, 7, 2, 0.9], [52, 6, 2, 0.9], [54, 4, 2, 0.9],
      [56, 3, 2, 0.95], [58, 2, 2, 0.9], [60, 0, 2, 1.0], [62, 6, 2, 0.95],
    ]),
    lead: makeNoteTrack(64, [
      [0, 7, 2, 0.95], [2, 9, 1, 0.85], [3, 10, 1, 0.9], [4, 11, 2, 0.98], [6, 9, 2, 0.9],
      [8, 11, 2, 0.95], [10, 13, 2, 0.98], [12, 14, 3, 1.0],
      [16, 13, 2, 0.92], [18, 11, 2, 0.9], [20, 10, 2, 0.9], [22, 9, 2, 0.88],
      [24, 11, 2, 0.95], [26, 9, 2, 0.9], [28, 7, 3, 0.95], [31, 6, 1, 0.85],
      [32, 10, 2, 0.95], [34, 12, 2, 0.95], [36, 13, 2, 0.98], [38, 12, 2, 0.92],
      [40, 11, 2, 0.95], [42, 13, 2, 0.95], [44, 14, 2, 1.0], [46, 16, 2, 1.0],
      [48, 14, 2, 0.98], [50, 13, 2, 0.92], [52, 11, 2, 0.95], [54, 10, 2, 0.9, 1],
      [56, 11, 2, 0.95], [58, 9, 2, 0.92], [60, 7, 3, 1.0],
    ]),
    chords: makeChordTrack(64, [
      [0, 0, 2, 0.78], [6, 0, 2, 0.7], [12, 4, 2, 0.78],
      [16, 0, 2, 0.78], [24, 5, 2, 0.75], [28, 3, 2, 0.75],
      [32, 3, 2, 0.8], [38, 3, 2, 0.72], [40, 4, 2, 0.8], [46, 4, 2, 0.75],
      [48, 0, 2, 0.82], [54, 6, 2, 0.78], [60, 0, 3, 0.85],
    ]),
    drums: makeDrumPattern('funk_break', 64),
  },

  // 9. STAGE WOODS — "Shroom Woods Boogie" (G Mixolydian, 138 BPM) — Flagship Gusto & Chonks!
  stage_woods: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.92], [4, 4, 2, 0.88], [8, 0, 2, 0.92], [12, 2, 2, 0.88], [14, 4, 2, 0.88],
      [16, 3, 2, 0.92], [20, 0, 2, 0.88], [24, 4, 2, 0.92], [28, 6, 2, 0.88], [30, 4, 2, 0.88],
      [32, 0, 2, 0.92], [36, 4, 2, 0.88], [40, 5, 2, 0.92], [44, 4, 2, 0.88], [46, 2, 2, 0.88],
      [48, 3, 2, 0.92], [52, 4, 2, 0.92], [56, 6, 2, 0.92], [58, 4, 2, 0.9], [60, 0, 3, 0.95],
    ]),
    lead: makeNoteTrack(64, [
      [0, 7, 2, 0.9], [2, 11, 2, 0.92], [4, 9, 2, 0.9], [6, 11, 2, 0.92], [8, 14, 3, 0.96], [12, 11, 2, 0.9], [14, 9, 2, 0.88],
      [16, 10, 2, 0.92], [18, 12, 2, 0.94], [20, 10, 2, 0.9], [22, 9, 2, 0.88], [24, 11, 3, 0.94], [28, 9, 2, 0.88], [30, 7, 2, 0.88],
      [32, 7, 2, 0.9], [34, 9, 2, 0.9], [36, 11, 2, 0.94], [38, 13, 2, 0.94], [40, 14, 2, 0.96], [42, 12, 2, 0.92], [44, 11, 2, 0.9], [46, 9, 2, 0.88],
      [48, 10, 2, 0.92], [50, 11, 2, 0.92], [52, 12, 2, 0.94], [54, 13, 2, 0.94], [56, 14, 2, 0.96], [58, 11, 2, 0.92], [60, 14, 3, 0.98],
    ]),
    chords: makeChordTrack(64, [
      [2, 0, 2, 0.7], [6, 0, 2, 0.7], [10, 0, 2, 0.7], [14, 4, 2, 0.7],
      [18, 3, 2, 0.7], [22, 3, 2, 0.7], [26, 4, 2, 0.7], [30, 6, 2, 0.7],
      [34, 0, 2, 0.7], [42, 5, 2, 0.7], [50, 3, 2, 0.7], [54, 4, 2, 0.75], [60, 0, 3, 0.8],
    ]),
    drums: makeDrumPattern('cartoon_march', 64),
  },

  // 10. SECRET ROOM — "Sneaky Crawlspace" (A Dorian, 126 BPM)
  secret_room: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.8], [4, 2, 2, 0.75], [8, 4, 2, 0.8], [12, 3, 2, 0.75],
      [16, 0, 2, 0.8], [20, 6, 2, 0.75], [24, 5, 2, 0.8], [28, 4, 2, 0.75],
      [32, 3, 2, 0.8], [36, 4, 2, 0.75], [40, 2, 2, 0.8], [44, 0, 2, 0.75],
      [48, 5, 2, 0.8], [52, 4, 2, 0.75], [56, 2, 2, 0.8], [60, 0, 3, 0.82],
    ]),
    lead: makeNoteTrack(64, [
      [0, 14, 2, 0.8], [3, 13, 1, 0.75], [4, 11, 2, 0.82], [8, 9, 2, 0.8], [11, 10, 1, 0.78], [12, 11, 2, 0.82],
      [16, 14, 2, 0.8], [19, 16, 1, 0.82], [20, 15, 2, 0.84], [24, 13, 2, 0.8], [28, 11, 3, 0.82],
      [32, 10, 2, 0.8], [34, 12, 2, 0.82], [36, 14, 2, 0.84], [40, 12, 2, 0.8], [42, 11, 2, 0.8], [44, 9, 3, 0.8],
      [48, 12, 2, 0.82], [50, 11, 2, 0.8], [52, 10, 2, 0.8], [54, 9, 2, 0.78], [56, 7, 2, 0.8], [60, 14, 3, 0.85],
    ]),
    chords: makeChordTrack(64, [
      [2, 0, 2, 0.55], [10, 3, 2, 0.55], [18, 0, 2, 0.55], [26, 5, 2, 0.55],
      [34, 3, 2, 0.55], [42, 2, 2, 0.55], [50, 5, 2, 0.55], [58, 4, 2, 0.6],
    ]),
    drums: makeDrumPattern('minimal_tick', 64),
  },

  // 11. ESCAPE KRUNK TIME — "It's Krunk Time!" (E Minor, 174 BPM)
  escape_krunk_time: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 1, 0.98], [2, 7, 1, 0.9], [4, 0, 1, 0.98], [6, 7, 1, 0.9],
      [8, 0, 1, 0.98], [10, 7, 1, 0.9], [12, 6, 2, 0.95], [14, 5, 2, 0.95],
      [16, 3, 1, 0.98], [18, 10, 1, 0.9], [20, 3, 1, 0.98], [22, 10, 1, 0.9],
      [24, 4, 1, 0.98], [26, 11, 1, 0.9], [28, 4, 2, 0.95], [30, 6, 2, 0.95],
      [32, 0, 1, 0.98], [34, 7, 1, 0.9], [36, 0, 1, 0.98], [38, 7, 1, 0.9],
      [40, 2, 1, 0.98], [42, 9, 1, 0.9], [44, 3, 2, 0.95], [46, 4, 2, 0.95],
      [48, 5, 1, 0.98], [50, 12, 1, 0.9], [52, 4, 1, 0.98], [54, 11, 1, 0.9],
      [56, 3, 2, 0.98], [58, 4, 2, 0.98], [60, 6, 2, 1.0], [62, 4, 2, 0.98],
    ]),
    lead: makeNoteTrack(64, [
      [0, 7, 2, 0.98], [2, 9, 2, 0.95], [4, 10, 2, 0.98], [6, 11, 2, 1.0],
      [8, 14, 2, 1.0], [10, 13, 2, 0.95], [12, 11, 2, 0.98], [14, 10, 2, 0.95],
      [16, 10, 2, 0.98], [18, 12, 2, 0.98], [20, 14, 2, 1.0], [22, 13, 2, 0.95],
      [24, 11, 2, 0.98], [26, 14, 2, 1.0], [28, 13, 2, 0.98], [30, 11, 2, 0.95],
      [32, 14, 2, 1.0], [34, 14, 1, 0.9], [35, 16, 1, 0.95], [36, 17, 2, 1.0], [38, 16, 2, 0.98],
      [40, 14, 2, 0.98], [42, 16, 2, 1.0], [44, 18, 3, 1.0],
      [48, 19, 2, 1.0], [50, 18, 2, 0.98], [52, 17, 2, 0.98], [54, 16, 2, 0.98],
      [56, 14, 2, 1.0], [58, 16, 2, 1.0], [60, 18, 2, 1.0], [62, 17, 2, 0.98],
    ]),
    chords: makeChordTrack(64, [
      [0, 0, 2, 0.85], [4, 0, 2, 0.8], [8, 0, 2, 0.85], [12, 6, 2, 0.85],
      [16, 3, 2, 0.85], [20, 3, 2, 0.8], [24, 4, 2, 0.85], [28, 4, 2, 0.85],
      [32, 0, 2, 0.88], [38, 2, 2, 0.85], [44, 3, 2, 0.88],
      [48, 5, 2, 0.9], [52, 4, 2, 0.9], [56, 3, 2, 0.9], [60, 6, 3, 0.95],
    ]),
    drums: makeDrumPattern('hyper_dnb', 64),
  },

  // 12. ESCAPE LAP 2 — "Lap 2 Hyperdrive" (F# Harmonic Minor, 190 BPM)
  escape_lap2: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 1, 1.0], [1, 7, 1, 0.85], [2, 0, 1, 0.95], [3, 7, 1, 0.85],
      [4, 0, 1, 1.0], [5, 7, 1, 0.85], [6, 6, 1, 0.95], [7, 4, 1, 0.9],
      [8, 5, 1, 1.0], [9, 12, 1, 0.85], [10, 5, 1, 0.95], [11, 12, 1, 0.85],
      [12, 4, 2, 1.0], [14, 6, 2, 0.95],
      [16, 3, 1, 1.0], [17, 10, 1, 0.85], [18, 3, 1, 0.95], [19, 10, 1, 0.85],
      [20, 2, 1, 1.0], [21, 9, 1, 0.85], [22, 3, 1, 0.95], [23, 4, 1, 0.95],
      [24, 5, 2, 1.0], [26, 4, 2, 0.98], [28, 6, 2, 1.0], [30, 4, 2, 0.98],
      [32, 0, 1, 1.0], [33, 7, 1, 0.85], [34, 2, 1, 0.95], [35, 9, 1, 0.85],
      [36, 3, 1, 1.0], [37, 10, 1, 0.85], [38, 4, 1, 0.98], [39, 11, 1, 0.88],
      [40, 5, 1, 1.0], [41, 12, 1, 0.85], [42, 6, 1, 0.98], [43, 13, 1, 0.88],
      [44, 7, 2, 1.0], [46, 6, 2, 0.98],
      [48, 5, 2, 1.0], [50, 4, 2, 1.0], [52, 3, 2, 1.0], [54, 2, 2, 0.98],
      [56, 4, 2, 1.0], [58, 6, 2, 1.0], [60, 7, 2, 1.0], [62, 6, 2, 1.0],
    ]),
    lead: makeNoteTrack(64, [
      [0, 14, 1, 1.0], [1, 16, 1, 0.95], [2, 18, 2, 1.0], [4, 20, 1, 1.0], [5, 18, 1, 0.95], [6, 16, 2, 0.98],
      [8, 19, 2, 1.0], [10, 18, 2, 0.98], [12, 16, 2, 0.98], [14, 13, 2, 0.95],
      [16, 14, 1, 1.0], [17, 15, 1, 0.95], [18, 17, 2, 1.0], [20, 16, 2, 0.98], [22, 14, 2, 0.98],
      [24, 19, 2, 1.0], [26, 18, 2, 1.0], [28, 20, 2, 1.0], [30, 18, 2, 0.98],
      [32, 14, 1, 1.0], [33, 16, 1, 0.95], [34, 18, 1, 0.98], [35, 20, 1, 1.0],
      [36, 21, 2, 1.0], [38, 20, 2, 0.98], [40, 19, 2, 1.0], [42, 20, 2, 1.0], [44, 21, 3, 1.0],
      [48, 23, 2, 1.0], [50, 21, 2, 1.0], [52, 20, 2, 1.0], [54, 18, 2, 0.98],
      [56, 16, 2, 1.0], [58, 18, 2, 1.0], [60, 20, 2, 1.0], [62, 21, 2, 1.0],
    ]),
    chords: makeChordTrack(64, [
      [0, 0, 2, 0.88], [4, 0, 2, 0.85], [8, 5, 2, 0.88], [12, 4, 2, 0.88],
      [16, 3, 2, 0.88], [20, 2, 2, 0.85], [24, 5, 2, 0.9], [28, 6, 2, 0.9],
      [32, 0, 2, 0.9], [36, 3, 2, 0.9], [40, 5, 2, 0.9], [44, 7, 2, 0.92],
      [48, 5, 2, 0.92], [52, 3, 2, 0.9], [56, 4, 2, 0.92], [60, 6, 3, 0.95],
    ]),
    drums: makeDrumPattern('hyper_dnb', 64),
  },

  // 13. BOSS ARTISTE — "Artiste Bell's Magnum Opus" (G Hungarian Minor, 156 BPM)
  boss_artiste: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.98], [2, 4, 2, 0.9], [4, 0, 2, 0.98], [6, 3, 2, 0.92],
      [8, 4, 2, 0.98], [10, 6, 2, 0.95], [12, 4, 2, 0.98], [14, 2, 2, 0.92],
      [16, 0, 2, 0.98], [18, 4, 2, 0.9], [20, 5, 2, 0.95], [22, 4, 2, 0.92],
      [24, 3, 2, 0.98], [26, 2, 2, 0.92], [28, 1, 2, 0.95], [30, 4, 2, 0.95],
      [32, 5, 2, 0.98], [34, 7, 2, 0.92], [36, 4, 2, 0.98], [38, 6, 2, 0.92],
      [40, 3, 2, 0.98], [42, 5, 2, 0.92], [44, 4, 2, 0.98], [46, 6, 2, 0.95],
      [48, 0, 2, 1.0], [50, 3, 2, 0.95], [52, 4, 2, 0.98], [54, 6, 2, 0.98],
      [56, 7, 2, 1.0], [58, 6, 2, 0.95], [60, 4, 2, 1.0], [62, 6, 2, 0.98],
    ]),
    lead: makeNoteTrack(64, [
      [0, 14, 2, 0.98], [2, 11, 2, 0.92], [4, 14, 2, 0.98], [6, 13, 2, 0.95],
      [8, 11, 2, 0.98], [10, 10, 2, 0.95], [12, 9, 2, 0.95], [14, 7, 2, 0.92],
      [16, 14, 2, 0.98], [18, 16, 2, 0.98], [20, 17, 2, 1.0], [22, 16, 2, 0.95],
      [24, 14, 2, 0.98], [26, 13, 2, 0.95], [28, 11, 3, 0.98],
      [32, 12, 2, 0.98], [34, 14, 2, 0.98], [36, 16, 2, 1.0], [38, 14, 2, 0.95],
      [40, 13, 2, 0.98], [42, 11, 2, 0.95], [44, 13, 2, 0.98], [46, 14, 2, 0.98],
      [48, 14, 1, 1.0], [49, 16, 1, 0.95], [50, 17, 2, 1.0], [52, 18, 2, 1.0], [54, 17, 2, 0.98],
      [56, 16, 2, 1.0], [58, 14, 2, 0.98], [60, 13, 2, 1.0], [62, 14, 2, 1.0],
    ]),
    chords: makeChordTrack(64, [
      [0, 0, 2, 0.85], [4, 0, 2, 0.82], [8, 4, 2, 0.88], [12, 4, 2, 0.85],
      [16, 0, 2, 0.85], [20, 5, 2, 0.88], [24, 3, 2, 0.88], [28, 4, 3, 0.9],
      [32, 5, 2, 0.88], [36, 4, 2, 0.88], [40, 3, 2, 0.88], [44, 4, 2, 0.9],
      [48, 0, 2, 0.92], [52, 4, 2, 0.92], [56, 6, 2, 0.92], [60, 4, 3, 0.95],
    ]),
    drums: makeDrumPattern('boss_thrash', 64),
  },

  // 14. RANK HIGH — "Chef Supreme Fanfare" (Bb Major, 146 BPM)
  rank_high: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 2, 0.95], [3, 0, 1, 0.8], [4, 2, 2, 0.9], [6, 4, 2, 0.92],
      [8, 5, 2, 0.92], [10, 4, 2, 0.9], [12, 2, 2, 0.9], [14, 4, 2, 0.9],
      [16, 3, 2, 0.95], [19, 3, 1, 0.8], [20, 4, 2, 0.92], [22, 5, 2, 0.92],
      [24, 4, 2, 0.95], [26, 2, 2, 0.9], [28, 1, 2, 0.9], [30, 4, 2, 0.92],
      [32, 0, 2, 0.95], [35, 0, 1, 0.8], [36, 4, 2, 0.92], [38, 7, 2, 0.95],
      [40, 5, 2, 0.95], [42, 4, 2, 0.92], [44, 3, 2, 0.92], [46, 2, 2, 0.9],
      [48, 3, 2, 0.95], [50, 4, 2, 0.95], [52, 5, 2, 0.95], [54, 6, 2, 0.95],
      [56, 7, 2, 0.98], [58, 4, 2, 0.95], [60, 0, 3, 1.0],
    ]),
    lead: makeNoteTrack(64, [
      [0, 7, 2, 0.95], [2, 9, 2, 0.95], [4, 11, 2, 0.98], [6, 14, 2, 1.0],
      [8, 16, 3, 1.0], [12, 14, 2, 0.95], [14, 11, 2, 0.92],
      [16, 12, 2, 0.95], [18, 14, 2, 0.95], [20, 15, 2, 0.98], [22, 14, 2, 0.95],
      [24, 11, 3, 0.95], [28, 13, 2, 0.95], [30, 14, 2, 0.98],
      [32, 16, 2, 1.0], [34, 14, 2, 0.95], [36, 16, 2, 1.0], [38, 18, 2, 1.0],
      [40, 19, 3, 1.0], [44, 18, 2, 0.98], [46, 16, 2, 0.95],
      [48, 17, 2, 0.98], [50, 16, 2, 0.95], [52, 14, 2, 0.95], [54, 13, 2, 0.95],
      [56, 14, 2, 1.0], [58, 16, 2, 1.0], [60, 14, 3, 1.0],
    ]),
    chords: makeChordTrack(64, [
      [0, 0, 3, 0.82], [6, 4, 2, 0.78], [12, 0, 2, 0.8],
      [16, 3, 3, 0.82], [24, 4, 3, 0.85],
      [32, 0, 3, 0.85], [40, 5, 3, 0.85],
      [48, 3, 2, 0.85], [52, 4, 2, 0.88], [56, 4, 2, 0.88], [60, 0, 3, 0.92],
    ]),
    drums: makeDrumPattern('funk_break', 64),
  },

  // 15. RANK LOW — "Soggy Dough Blues" (D Blues, 96 BPM)
  rank_low: {
    steps: 64,
    bass: makeNoteTrack(64, [
      [0, 0, 3, 0.82], [4, 1, 3, 0.78], [8, 2, 3, 0.82], [12, 3, 3, 0.8],
      [16, 4, 3, 0.82], [20, 3, 3, 0.78], [24, 2, 3, 0.8], [28, 1, 3, 0.78],
      [32, 2, 3, 0.82], [36, 4, 3, 0.8], [40, 5, 3, 0.82], [44, 4, 3, 0.78],
      [48, 0, 3, 0.82], [52, 5, 3, 0.8], [56, 4, 3, 0.8], [60, 0, 3, 0.85],
    ]),
    lead: makeNoteTrack(64, [
      [0, 9, 3, 0.85], [4, 8, 3, 0.82], [8, 7, 3, 0.82], [12, 6, 4, 0.85],
      [18, 8, 2, 0.82], [20, 7, 2, 0.8], [22, 6, 3, 0.82], [28, 5, 3, 0.78],
      [32, 10, 3, 0.86], [36, 9, 3, 0.84], [40, 8, 3, 0.82], [44, 7, 3, 0.8],
      [48, 6, 2, 0.82], [51, 7, 2, 0.82], [54, 8, 2, 0.84], [56, 7, 2, 0.8], [58, 6, 2, 0.8], [60, 5, 4, 0.85],
    ]),
    chords: makeChordTrack(64, [
      [4, 0, 3, 0.58], [12, 0, 3, 0.55], [20, 4, 3, 0.58], [28, 2, 3, 0.55],
      [36, 2, 3, 0.58], [44, 4, 3, 0.58], [52, 4, 3, 0.6], [60, 0, 3, 0.62],
    ]),
    drums: makeDrumPattern('swing_brush', 64),
  },
};

// ============================================================================
// Deterministic Motif Composer for ALL Remaining MusicTrackIds
// Guarantees every single track has a unique, punchy, catchy 4-bar arrangement!
// ============================================================================

function hashTrackId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function makeLcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildArrangementForTrack(meta: MusicTrackMeta): TrackArrangement {
  const flagship = FLAGSHIP_ARRANGEMENTS[meta.id];
  if (flagship) return flagship;

  const steps = Math.max(16, meta.loopBars * 16);
  const rand = makeLcg(hashTrackId(meta.id) ^ (meta.bpm * 2654435761));
  const bass: Array<NoteEvent | null> = new Array(steps).fill(null);
  const lead: Array<NoteEvent | null> = new Array(steps).fill(null);
  const chords: Array<ChordEvent | null> = new Array(steps).fill(null);
  const drums = makeDrumPattern(meta.percussionStyle, steps);

  // Pick a musical 4-bar chord progression tailored to track vibe
  const progressions: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 3, 4, 0],
    [0, 5, 3, 4],
    [0, 6, 5, 4],
    [0, 2, 3, 4],
    [0, 4, 5, 3],
    [0, 3, 6, 4],
  ];
  const prog = progressions[Math.floor(rand() * progressions.length)];

  // Build 1-bar rhythmic motif for the lead, then vary across bars (A - A' - B - C turnaround)
  const motifSteps: number[] = [];
  for (let s = 0; s < 16; s += 2) {
    if (s === 0 || rand() > 0.28) {
      motifSteps.push(s);
    } else if (s + 1 < 16 && rand() > 0.5) {
      motifSteps.push(s + 1);
    }
  }
  const motifOffsets = motifSteps.map(() => Math.floor(rand() * 7) - 1);

  const numBars = Math.floor(steps / 16);
  for (let bar = 0; bar < numBars; bar++) {
    const rootDeg = prog[bar % prog.length];
    const barStart = bar * 16;

    // ---- Bassline by style ----
    for (let s = 0; s < 16; s++) {
      const idx = barStart + s;
      switch (meta.bassStyle) {
        case 'octave_pump':
          if (s % 2 === 0) {
            bass[idx] = { deg: s % 4 === 0 ? rootDeg : rootDeg + 7, len: 1, vel: s % 4 === 0 ? 0.96 : 0.85 };
          }
          break;
        case 'slap_funk':
          if (s === 0 || s === 3 || s === 6 || s === 10 || s === 12 || s === 14) {
            const offset = s === 6 ? 4 : s === 10 ? 6 : s === 14 ? 2 : 0;
            bass[idx] = { deg: rootDeg + offset, len: s === 3 ? 1 : 2, vel: s === 0 ? 0.95 : 0.86 };
          }
          break;
        case 'tuba_oompah':
          if (s === 0 || s === 8) bass[idx] = { deg: rootDeg, len: 2, vel: 0.94 };
          else if (s === 4 || s === 12) bass[idx] = { deg: rootDeg + 4, len: 2, vel: 0.86 };
          else if (bar === numBars - 1 && s === 14) bass[idx] = { deg: rootDeg + 6, len: 2, vel: 0.9 };
          break;
        case 'gallop_rock':
          if (s === 0 || s === 3 || s === 4 || s === 8 || s === 11 || s === 12 || s === 14) {
            const offset = s >= 12 ? (s === 14 ? 4 : 2) : 0;
            bass[idx] = { deg: rootDeg + offset, len: 1, vel: s % 4 === 0 ? 0.96 : 0.86 };
          }
          break;
        case 'acid_bounce':
          if (s === 0 || s === 2 || s === 5 || s === 8 || s === 10 || s === 13 || s === 14) {
            const offset = s === 5 ? 7 : s === 10 ? 3 : s === 13 ? 6 : 0;
            bass[idx] = { deg: rootDeg + offset, len: 1, vel: 0.9 };
          }
          break;
        case 'sub_stomp':
          if (s === 0 || s === 6 || s === 8 || s === 14) {
            bass[idx] = { deg: rootDeg + (s === 14 ? 4 : 0), len: 2, vel: 0.98 };
          }
          break;
        case 'spooky_creep':
          if (s === 0 || s === 4 || s === 8 || s === 12) {
            const stepWalk = [0, 2, 4, 3][s / 4];
            bass[idx] = { deg: rootDeg + stepWalk, len: 3, vel: 0.86 };
          }
          break;
        case 'walking_swing':
          if (s % 4 === 0) {
            const walk = [0, 2, 4, 5][s / 4];
            bass[idx] = { deg: rootDeg + walk, len: 3, vel: 0.85 };
          }
          break;
        case 'none':
          break;
      }
    }

    // ---- Chords by style ----
    if (meta.chordStyle !== 'none') {
      if (meta.chordStyle === 'organ_swell') {
        chords[barStart] = { deg: rootDeg, len: 8, vel: 0.68 };
        chords[barStart + 8] = { deg: rootDeg + (bar % 2 === 0 ? 0 : 2), len: 6, vel: 0.65 };
      } else if (meta.chordStyle === 'funk_clav' || meta.chordStyle === 'jazz_comp') {
        chords[barStart + 2] = { deg: rootDeg, len: 2, vel: 0.68 };
        chords[barStart + 6] = { deg: rootDeg, len: 2, vel: 0.62 };
        chords[barStart + 12] = { deg: rootDeg + (bar === numBars - 1 ? 4 : 0), len: 2, vel: 0.72 };
      } else {
        chords[barStart] = { deg: rootDeg, len: 2, vel: 0.8 };
        chords[barStart + 6] = { deg: rootDeg, len: 2, vel: 0.72 };
        chords[barStart + 12] = { deg: rootDeg + (bar === numBars - 1 ? 4 : 2), len: 2, vel: 0.8 };
      }
    }

    // ---- Lead Melody (A - A' - B - Turnaround) ----
    const barLift = bar === 2 ? 2 : bar === 3 ? 3 : 0;
    for (let m = 0; m < motifSteps.length; m++) {
      const s = motifSteps[m];
      const nextS = m + 1 < motifSteps.length ? motifSteps[m + 1] : 16;
      const len = Math.max(1, Math.min(3, nextS - s));
      let deg = 7 + rootDeg + motifOffsets[m] + barLift;
      if (bar === numBars - 1 && m === motifSteps.length - 1) {
        deg = 14; // strong resolution toward upper tonic
      }
      // Slight chromatic spice on passing tones for boss/spooky tracks
      const semi =
        bar === 3 && m === motifSteps.length - 2 && meta.id.startsWith('boss_') ? 1 : 0;
      lead[barStart + s] = {
        deg,
        len,
        vel: s === 0 || s === 8 ? 0.96 : 0.88,
        semi,
      };
    }
  }

  return { steps, bass, lead, chords, drums };
}

// ============================================================================
// ProceduralSynth Implementation
// ============================================================================

export class ProceduralSynth {
  private readonly ctx: AudioContext;
  private readonly masterGain: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly musicBus: GainNode;
  private readonly musicSequencerGain: GainNode;
  private readonly sfxBus: GainNode;

  private readonly whiteNoise: AudioBuffer;
  private readonly pinkNoise: AudioBuffer;
  private readonly softClipCurve: Float32Array<ArrayBuffer>;

  private readonly arrangementCache = new Map<MusicTrackId, TrackArrangement>();
  private readonly lastSfxTimeMs = new Map<SfxId, number>();
  private readonly activeSfxVoices: ActiveSfxVoice[] = [];
  private readonly cleanupTimers = new Set<ReturnType<typeof setTimeout>>();

  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private jitterState = 0x9e3779b9;

  // Step sequencer runtime state
  private activeTrack: MusicTrackId = 'none';
  private activeArrangement: TrackArrangement | null = null;
  private seqTimer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private currentStep = 0;
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-12, ctx.currentTime);
    this.compressor.knee.setValueAtTime(16, ctx.currentTime);
    this.compressor.ratio.setValueAtTime(6, ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.004, ctx.currentTime);
    this.compressor.release.setValueAtTime(0.14, ctx.currentTime);

    this.masterGain = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicSequencerGain = ctx.createGain();
    this.sfxBus = ctx.createGain();

    this.musicSequencerGain.connect(this.musicBus);
    this.musicBus.connect(this.compressor);
    this.sfxBus.connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.whiteNoise = this.buildNoiseBuffer(false);
    this.pinkNoise = this.buildNoiseBuffer(true);
    this.softClipCurve = this.buildSoftClipCurve(2.4);

    this.applySettings(this.settings);
  }

  public getMusicBus(): GainNode {
    return this.musicBus;
  }

  public getSfxBus(): GainNode {
    return this.sfxBus;
  }

  public getActiveMusicTrack(): MusicTrackId {
    return this.activeTrack;
  }

  public isMusicPlaying(): boolean {
    return this.seqTimer !== null && this.activeTrack !== 'none';
  }

  public applySettings(settings: AudioSettings): void {
    this.settings = {
      masterVolume: clamp01(settings.masterVolume),
      musicVolume: clamp01(settings.musicVolume),
      sfxVolume: clamp01(settings.sfxVolume),
      muted: Boolean(settings.muted),
    };
    if (this.disposed) return;

    const now = this.ctx.currentTime;
    const master = this.settings.muted ? 0 : this.settings.masterVolume;
    this.masterGain.gain.setTargetAtTime(master, now, 0.015);
    this.musicBus.gain.setTargetAtTime(this.settings.musicVolume * 0.56, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfxVolume * 0.92, now, 0.015);
  }

  // ---- Music Sequencer Control ----

  public startMusic(track: MusicTrackId): void {
    if (this.disposed) return;
    if (track === 'none') {
      this.stopMusic(40);
      return;
    }

    const meta = MUSIC_MANIFEST[track];
    if (!meta || meta.bpm <= 0) {
      this.stopMusic(40);
      return;
    }

    this.stopMusic(25);
    this.activeTrack = track;

    let arr = this.arrangementCache.get(track);
    if (!arr) {
      arr = buildArrangementForTrack(meta);
      this.arrangementCache.set(track, arr);
    }
    this.activeArrangement = arr;

    const now = this.ctx.currentTime;
    this.musicSequencerGain.gain.cancelScheduledValues(now);
    this.musicSequencerGain.gain.setValueAtTime(0.0001, now);
    this.musicSequencerGain.gain.linearRampToValueAtTime(meta.gain, now + 0.045);

    this.currentStep = 0;
    this.nextStepTime = now + 0.03;

    this.scheduleMusicAhead();
    this.seqTimer = globalThis.setInterval(() => {
      this.scheduleMusicAhead();
    }, 25);
  }

  public stopMusic(fadeMs = 45): void {
    if (this.seqTimer !== null) {
      globalThis.clearInterval(this.seqTimer);
      this.seqTimer = null;
    }
    this.activeTrack = 'none';
    this.activeArrangement = null;

    if (!this.disposed) {
      const now = this.ctx.currentTime;
      const fadeSec = Math.max(0.01, fadeMs / 1000);
      this.musicSequencerGain.gain.cancelScheduledValues(now);
      this.musicSequencerGain.gain.setValueAtTime(
        Math.max(0.0001, this.musicSequencerGain.gain.value),
        now,
      );
      this.musicSequencerGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    }
  }

  private scheduleMusicAhead(): void {
    if (this.disposed || !this.activeArrangement || this.activeTrack === 'none') return;
    if (this.ctx.state !== 'running') {
      // Keep nextStepTime synced near currentTime so resuming doesn't burst-fire old steps
      this.nextStepTime = this.ctx.currentTime + 0.04;
      return;
    }

    const meta = MUSIC_MANIFEST[this.activeTrack];
    const stepDur = 60 / meta.bpm / 4; // 16th-note duration
    const lookAheadSec = 0.13;
    const now = this.ctx.currentTime;

    // Recover gracefully if tab was backgrounded
    if (this.nextStepTime < now - 0.15) {
      this.nextStepTime = now + 0.02;
    }

    while (this.nextStepTime < now + lookAheadSec) {
      const isOdd = (this.currentStep & 1) === 1;
      const swingOffset = isOdd ? meta.swing * stepDur : 0;
      const stepTime = Math.max(now + 0.004, this.nextStepTime + swingOffset);

      this.triggerMusicStep(meta, this.activeArrangement, this.currentStep, stepTime, stepDur);

      this.currentStep = (this.currentStep + 1) % this.activeArrangement.steps;
      this.nextStepTime += stepDur;
    }
  }

  private triggerMusicStep(
    meta: MusicTrackMeta,
    arr: TrackArrangement,
    step: number,
    time: number,
    stepDur: number,
  ): void {
    const bassNote = arr.bass[step];
    if (bassNote && meta.bassStyle !== 'none') {
      const midi =
        scaleDegreeToMidi(meta.rootMidi - 12, meta.scale, bassNote.deg) + (bassNote.semi ?? 0);
      this.playBassVoice(
        meta.bassStyle,
        midiToFreq(midi),
        time,
        bassNote.len * stepDur * 0.92,
        bassNote.vel ?? 0.85,
      );
    }

    const chord = arr.chords[step];
    if (chord && meta.chordStyle !== 'none') {
      this.playChordVoice(
        meta.chordStyle,
        meta,
        chord.deg,
        time,
        chord.len * stepDur * 0.9,
        chord.vel ?? 0.7,
      );
    }

    const leadNote = arr.lead[step];
    if (leadNote && meta.leadStyle !== 'none') {
      const midi =
        scaleDegreeToMidi(meta.rootMidi + 12, meta.scale, leadNote.deg) + (leadNote.semi ?? 0);
      this.playLeadVoice(
        meta.leadStyle,
        midiToFreq(midi),
        time,
        leadNote.len * stepDur * 0.9,
        leadNote.vel ?? 0.88,
      );
    }

    const drumStr = arr.drums[step];
    if (drumStr && drumStr.length > 0) {
      for (let i = 0; i < drumStr.length; i++) {
        this.playDrumVoice(drumStr[i] as DrumHit, time, meta.percussionStyle);
      }
    }
  }

  // ---- Sequencer Musical Instrument Voices ----

  private playBassVoice(
    style: BassStyle,
    freq: number,
    t: number,
    dur: number,
    vel: number,
  ): void {
    const safeFreq = Math.max(32, Math.min(440, freq));
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    filter.type = 'lowpass';
    let peak = 0.3 * vel;
    let attack = 0.008;

    switch (style) {
      case 'slap_funk':
        osc.type = 'sawtooth';
        filter.frequency.setValueAtTime(safeFreq * 7.5, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(120, safeFreq * 2.1), t + Math.min(0.12, dur));
        filter.Q.setValueAtTime(4.2, t);
        peak = 0.28 * vel;
        break;
      case 'octave_pump':
        osc.type = 'sawtooth';
        filter.frequency.setValueAtTime(safeFreq * 5.2, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(130, safeFreq * 2.0), t + dur);
        filter.Q.setValueAtTime(2.5, t);
        peak = 0.29 * vel;
        break;
      case 'tuba_oompah':
        osc.type = 'triangle';
        filter.frequency.setValueAtTime(safeFreq * 4.0, t);
        filter.Q.setValueAtTime(1.5, t);
        attack = 0.014;
        peak = 0.38 * vel;
        break;
      case 'acid_bounce':
        osc.type = 'sawtooth';
        filter.frequency.setValueAtTime(safeFreq * 9.5, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(110, safeFreq * 1.6), t + dur);
        filter.Q.setValueAtTime(8.0, t);
        peak = 0.24 * vel;
        break;
      case 'gallop_rock':
        osc.type = 'sawtooth';
        filter.frequency.setValueAtTime(safeFreq * 6.0, t);
        filter.Q.setValueAtTime(2.0, t);
        peak = 0.28 * vel;
        break;
      case 'sub_stomp':
        osc.type = 'triangle';
        filter.frequency.setValueAtTime(safeFreq * 3.2, t);
        peak = 0.4 * vel;
        break;
      case 'spooky_creep':
        osc.type = 'triangle';
        filter.frequency.setValueAtTime(safeFreq * 3.6, t);
        attack = 0.018;
        peak = 0.34 * vel;
        break;
      case 'walking_swing':
      default:
        osc.type = 'triangle';
        filter.frequency.setValueAtTime(safeFreq * 4.2, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(95, safeFreq * 1.8), t + dur);
        peak = 0.35 * vel;
        break;
    }

    osc.frequency.setValueAtTime(safeFreq, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.35), t + dur * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.musicSequencerGain);

    osc.start(t);
    osc.stop(t + dur + 0.03);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private playLeadVoice(
    style: LeadStyle,
    freq: number,
    t: number,
    dur: number,
    vel: number,
  ): void {
    const safeFreq = Math.max(80, Math.min(3500, freq));
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    let osc2: OscillatorNode | null = null;
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    let peak = 0.17 * vel;
    let attack = 0.012;

    switch (style) {
      case 'brass_punch':
        osc1.type = 'sawtooth';
        osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(safeFreq * 0.988, t);
        osc1.frequency.exponentialRampToValueAtTime(safeFreq, t + 0.022);
        osc2.frequency.setValueAtTime(safeFreq * 1.006, t);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(safeFreq * 1.6, t);
        filter.frequency.linearRampToValueAtTime(Math.min(7200, safeFreq * 5.2), t + 0.028);
        filter.frequency.exponentialRampToValueAtTime(Math.max(400, safeFreq * 2.4), t + dur);
        filter.Q.setValueAtTime(2.4, t);
        peak = 0.14 * vel;
        break;

      case 'square_cartoon':
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(safeFreq, t);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(5400, safeFreq * 4.5), t);
        filter.Q.setValueAtTime(1.5, t);
        peak = 0.15 * vel;
        attack = 0.007;
        break;

      case 'sax_honk':
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(safeFreq * 0.96, t);
        osc1.frequency.exponentialRampToValueAtTime(safeFreq, t + 0.025);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(Math.min(3200, safeFreq * 2.2), t);
        filter.Q.setValueAtTime(2.6, t);
        peak = 0.24 * vel;
        attack = 0.016;
        break;

      case 'organ_spooky':
        osc1.type = 'triangle';
        osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(safeFreq, t);
        osc2.frequency.setValueAtTime(safeFreq * 2, t);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(4200, t);
        peak = 0.17 * vel;
        attack = 0.014;
        break;

      case 'twang_banjo':
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(safeFreq * 1.015, t);
        osc1.frequency.exponentialRampToValueAtTime(safeFreq, t + 0.02);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(Math.min(4000, safeFreq * 2.8), t);
        filter.Q.setValueAtTime(3.2, t);
        peak = 0.23 * vel;
        attack = 0.005;
        break;

      case 'synth_bell':
        osc1.type = 'sine';
        osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(safeFreq, t);
        osc2.frequency.setValueAtTime(safeFreq * 3, t);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(6500, t);
        peak = 0.16 * vel;
        attack = 0.005;
        break;

      case 'screech_lead':
        osc1.type = 'sawtooth';
        osc2 = ctx.createOscillator();
        osc2.type = 'square';
        osc1.frequency.setValueAtTime(safeFreq, t);
        osc2.frequency.setValueAtTime(safeFreq * 1.007, t);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(7600, safeFreq * 6.0), t);
        filter.Q.setValueAtTime(3.4, t);
        peak = 0.13 * vel;
        attack = 0.006;
        break;

      case 'whistle_flute':
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(safeFreq * 0.94, t);
        osc1.frequency.exponentialRampToValueAtTime(safeFreq, t + 0.02);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(5000, t);
        peak = 0.21 * vel;
        attack = 0.012;
        break;

      case 'accordion_bouncy':
      default:
        osc1.type = 'square';
        osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(safeFreq * 0.996, t);
        osc2.frequency.setValueAtTime(safeFreq * 1.004, t);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(Math.min(3600, safeFreq * 2.4), t);
        filter.Q.setValueAtTime(1.5, t);
        peak = 0.18 * vel;
        attack = 0.012;
        break;
    }

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.55), t + dur * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.025);

    osc1.connect(filter);
    if (osc2) osc2.connect(filter);
    filter.connect(env);
    env.connect(this.musicSequencerGain);

    osc1.start(t);
    osc1.stop(t + dur + 0.035);
    if (osc2) {
      osc2.start(t);
      osc2.stop(t + dur + 0.035);
    }

    osc1.onended = () => {
      osc1.disconnect();
      if (osc2) osc2.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private playChordVoice(
    style: ChordStyle,
    meta: MusicTrackMeta,
    deg: number,
    t: number,
    dur: number,
    vel: number,
  ): void {
    const ctx = this.ctx;
    const intervals = style === 'power_fifth' ? [0, 4] : [0, 2, 4];
    const oscType: OscillatorType =
      style === 'marimba_arp'
        ? 'triangle'
        : style === 'organ_swell'
          ? 'triangle'
          : style === 'funk_clav'
            ? 'square'
            : 'sawtooth';

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(style === 'funk_clav' ? 2800 : 2100, t);
    filter.frequency.exponentialRampToValueAtTime(750, t + dur);

    const env = ctx.createGain();
    const peak = (style === 'power_fifth' ? 0.095 : 0.07) * vel;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);

    filter.connect(env);
    env.connect(this.musicSequencerGain);

    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < intervals.length; i++) {
      const midi = scaleDegreeToMidi(meta.rootMidi, meta.scale, deg + intervals[i]);
      const osc = ctx.createOscillator();
      osc.type = oscType;
      const offset = style === 'marimba_arp' ? i * 0.022 : 0;
      osc.frequency.setValueAtTime(midiToFreq(midi), t + offset);
      osc.connect(filter);
      osc.start(t + offset);
      osc.stop(t + dur + 0.035);
      oscs.push(osc);
    }

    oscs[oscs.length - 1].onended = () => {
      for (const o of oscs) o.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private playDrumVoice(hit: DrumHit, t: number, style: PercussionStyle): void {
    const ctx = this.ctx;
    const dest = this.musicSequencerGain;

    switch (hit) {
      case 'K': {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        const punch = style === 'hyper_dnb' || style === 'boss_thrash' ? 165 : 138;
        osc.frequency.setValueAtTime(punch, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.065);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(0.42, t + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        osc.connect(env);
        env.connect(dest);
        osc.start(t);
        osc.stop(t + 0.15);
        osc.onended = () => {
          osc.disconnect();
          env.disconnect();
        };
        break;
      }

      case 'S': {
        // Snare body + crisp noise burst
        const osc = ctx.createOscillator();
        const oscEnv = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(215, t);
        osc.frequency.exponentialRampToValueAtTime(115, t + 0.055);
        oscEnv.gain.setValueAtTime(0.0001, t);
        oscEnv.gain.linearRampToValueAtTime(0.2, t + 0.003);
        oscEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
        osc.connect(oscEnv);
        oscEnv.connect(dest);
        osc.start(t);
        osc.stop(t + 0.095);

        const src = ctx.createBufferSource();
        src.buffer = this.whiteNoise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.setValueAtTime(2100, t);
        hp.Q.setValueAtTime(0.85, t);
        const nEnv = ctx.createGain();
        nEnv.gain.setValueAtTime(0.0001, t);
        nEnv.gain.linearRampToValueAtTime(0.24, t + 0.003);
        nEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        src.connect(hp);
        hp.connect(nEnv);
        nEnv.connect(dest);
        src.start(t, (t * 7) % 1.4, 0.14);
        src.onended = () => {
          osc.disconnect();
          oscEnv.disconnect();
          src.disconnect();
          hp.disconnect();
          nEnv.disconnect();
        };
        break;
      }

      case 'H':
      case 'O': {
        const isOpen = hit === 'O';
        const dur = isOpen ? 0.13 : 0.038;
        const src = ctx.createBufferSource();
        src.buffer = this.whiteNoise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(7600, t);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(isOpen ? 0.12 : 0.09, t + 0.002);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(hp);
        hp.connect(env);
        env.connect(dest);
        src.start(t, (t * 11) % 1.4, dur + 0.01);
        src.onended = () => {
          src.disconnect();
          hp.disconnect();
          env.disconnect();
        };
        break;
      }

      case 'C': {
        // Funky cartoon handclap
        const src = ctx.createBufferSource();
        src.buffer = this.whiteNoise;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1450, t);
        bp.Q.setValueAtTime(1.4, t);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(0.16, t + 0.003);
        env.gain.linearRampToValueAtTime(0.04, t + 0.014);
        env.gain.linearRampToValueAtTime(0.15, t + 0.022);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        src.connect(bp);
        bp.connect(env);
        env.connect(dest);
        src.start(t, (t * 5) % 1.4, 0.11);
        src.onended = () => {
          src.disconnect();
          bp.disconnect();
          env.disconnect();
        };
        break;
      }

      case 'T': {
        // Bouncy tom fill
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(95, t + 0.11);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(0.24, t + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(env);
        env.connect(dest);
        osc.start(t);
        osc.stop(t + 0.13);
        osc.onended = () => {
          osc.disconnect();
          env.disconnect();
        };
        break;
      }

      case 'B':
      case 'R': {
        // Cowbell / crisp cartoon woodblock rim
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = hit === 'B' ? 'square' : 'triangle';
        const f = hit === 'B' ? 560 : 880;
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.045);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(0.14, t + 0.002);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
        osc.connect(env);
        env.connect(dest);
        osc.start(t);
        osc.stop(t + 0.065);
        osc.onended = () => {
          osc.disconnect();
          env.disconnect();
        };
        break;
      }

      case 'A': {
        // Industrial metallic anvil accent
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const env = ctx.createGain();
        o1.type = 'square';
        o2.type = 'sawtooth';
        o1.frequency.setValueAtTime(620, t);
        o2.frequency.setValueAtTime(955, t);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(0.12, t + 0.002);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o1.connect(env);
        o2.connect(env);
        env.connect(dest);
        o1.start(t);
        o2.start(t);
        o1.stop(t + 0.1);
        o2.stop(t + 0.1);
        o1.onended = () => {
          o1.disconnect();
          o2.disconnect();
          env.disconnect();
        };
        break;
      }
    }
  }

  // ---- Shared SFX Cooldown, Polyphony, Panning & Pitch Helpers ----

  public canTriggerSfx(sfx: SfxId, nowMs = Date.now()): boolean {
    const meta = SFX_MANIFEST[sfx];
    if (!meta) return false;
    const prev = this.lastSfxTimeMs.get(sfx);
    if (prev !== undefined && nowMs >= prev && nowMs - prev < meta.cooldownMs) {
      return false;
    }
    return true;
  }

  public reserveSfxVoice(
    sfx: SfxId,
    nowMs: number,
    stopFn: () => void,
    durationMs?: number,
  ): boolean {
    const meta = SFX_MANIFEST[sfx];
    if (!meta) return false;

    this.pruneExpiredVoices(nowMs);

    const incomingRank = PRIORITY_RANK[meta.priority];

    // Enforce per-SFX polyphony limit
    let sameCount = 0;
    let oldestSameIdx = -1;
    for (let i = 0; i < this.activeSfxVoices.length; i++) {
      if (this.activeSfxVoices[i].id === sfx) {
        sameCount++;
        if (oldestSameIdx === -1) oldestSameIdx = i;
      }
    }
    if (sameCount >= meta.maxPolyphony && oldestSameIdx !== -1) {
      const [stolen] = this.activeSfxVoices.splice(oldestSameIdx, 1);
      stolen.stop();
    }

    // Enforce global 16-voice polyphony cap
    if (this.activeSfxVoices.length >= GLOBAL_MAX_SFX_POLYPHONY) {
      let victimIdx = -1;
      let lowestRank = Infinity;
      for (let i = 0; i < this.activeSfxVoices.length; i++) {
        const v = this.activeSfxVoices[i];
        if (v.priorityRank < lowestRank) {
          lowestRank = v.priorityRank;
          victimIdx = i;
        }
      }
      if (victimIdx !== -1 && incomingRank >= lowestRank) {
        const [stolen] = this.activeSfxVoices.splice(victimIdx, 1);
        stolen.stop();
      } else {
        return false;
      }
    }

    this.lastSfxTimeMs.set(sfx, nowMs);
    this.activeSfxVoices.push({
      id: sfx,
      endTimeMs: nowMs + (durationMs ?? meta.estimatedDurationMs),
      priorityRank: incomingRank,
      stop: stopFn,
    });
    return true;
  }

  public computePitchFactor(sfx: SfxId, pitchJitter?: number): number {
    const meta = SFX_MANIFEST[sfx];
    const jitter = pitchJitter ?? meta?.defaultPitchJitter ?? 0;
    if (jitter <= 0) return 1;
    // Fast local xorshift32 PRNG in [-1, 1]
    let x = this.jitterState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.jitterState = x >>> 0;
    const unit = ((this.jitterState / 0xffffffff) * 2) - 1;
    return Math.max(0.5, 1 + unit * jitter);
  }

  public createPanner(pan: number): StereoPannerNode | null {
    if (typeof this.ctx.createStereoPanner !== 'function') return null;
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime);
    return panner;
  }

  private pruneExpiredVoices(nowMs: number): void {
    for (let i = this.activeSfxVoices.length - 1; i >= 0; i--) {
      if (nowMs >= this.activeSfxVoices[i].endTimeMs) {
        this.activeSfxVoices.splice(i, 1);
      }
    }
  }

  // ---- Expressive Cartoon SFX Synthesizer (ALL 42 SfxIds) ----

  public playSfx(sfx: SfxId, options: SfxPlayOptions = {}): boolean {
    if (this.disposed) return false;
    const meta = SFX_MANIFEST[sfx];
    if (!meta) return false;

    const nowMs = Date.now();
    if (!this.canTriggerSfx(sfx, nowMs)) return false;

    const ctx = this.ctx;
    const t = ctx.currentTime + 0.002;
    const gainLevel = clamp01(options.volume ?? 1) * meta.baseGain;
    if (gainLevel <= 0.0005) return false;

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(gainLevel, t);

    const panner = this.createPanner(options.pan ?? 0);
    if (panner) {
      voiceGain.connect(panner);
      panner.connect(this.sfxBus);
    } else {
      voiceGain.connect(this.sfxBus);
    }

    const stopVoice = () => {
      const now = ctx.currentTime;
      try {
        voiceGain.gain.cancelScheduledValues(now);
        voiceGain.gain.setValueAtTime(Math.max(0.0001, voiceGain.gain.value), now);
        voiceGain.gain.linearRampToValueAtTime(0.0001, now + 0.012);
      } catch {
        // Ignore already-closed context errors
      }
    };

    if (!this.reserveSfxVoice(sfx, nowMs, stopVoice, meta.estimatedDurationMs)) {
      voiceGain.disconnect();
      panner?.disconnect();
      return false;
    }

    const p = this.computePitchFactor(sfx, options.pitchJitter);
    this.synthesizeSfx(sfx, voiceGain, t, p);

    // Cleanly disconnect panner/voiceGain shortly after estimated lifetime
    const cleanupDelay = Math.max(80, meta.estimatedDurationMs + 120);
    const timer = globalThis.setTimeout(() => {
      this.cleanupTimers.delete(timer);
      try {
        voiceGain.disconnect();
        panner?.disconnect();
      } catch {
        // Ignore disconnect errors on disposed context
      }
    }, cleanupDelay);
    this.cleanupTimers.add(timer);

    return true;
  }

  private synthesizeSfx(sfx: SfxId, out: GainNode, t: number, p: number): void {
    switch (sfx) {
      case 'jump':
        this.tone(out, 'triangle', 195 * p, 560 * p, t, 0.14, 0.72, 0.004);
        this.tone(out, 'square', 240 * p, 640 * p, t, 0.075, 0.2, 0.004);
        break;

      case 'mach1':
        this.noise(out, true, 'bandpass', 360 * p, 980 * p, 1.8, t, 0.19, 0.42);
        this.tone(out, 'sawtooth', 115 * p, 195 * p, t, 0.18, 0.34, 0.012);
        break;

      case 'mach2':
        this.noise(out, true, 'bandpass', 560 * p, 1550 * p, 2.0, t, 0.22, 0.5);
        this.tone(out, 'sawtooth', 165 * p, 290 * p, t, 0.2, 0.38, 0.01);
        this.tone(out, 'square', 248 * p, 410 * p, t + 0.02, 0.16, 0.18, 0.01);
        break;

      case 'mach3':
        this.noise(out, true, 'bandpass', 850 * p, 2400 * p, 1.5, t, 0.26, 0.62);
        this.driveTone(out, 'sawtooth', 220 * p, 430 * p, t, 0.24, 0.42);
        this.tone(out, 'triangle', 640 * p, 1180 * p, t, 0.22, 0.22, 0.01);
        break;

      case 'mach4':
        // Supersonic flame-boom pulse!
        this.tone(out, 'sine', 160 * p, 42, t, 0.24, 0.75, 0.003);
        this.noise(out, false, 'bandpass', 1200 * p, 3600 * p, 1.2, t, 0.29, 0.68);
        this.driveTone(out, 'sawtooth', 290 * p, 680 * p, t, 0.28, 0.48);
        this.tone(out, 'square', 580 * p, 1360 * p, t + 0.02, 0.24, 0.24, 0.006);
        break;

      case 'mach_drift':
        // Screechy cartoon tire skid!
        this.noise(out, false, 'bandpass', 1750 * p, 2750 * p, 7.5, t, 0.24, 0.62);
        this.wobbleTone(out, 'sawtooth', 980 * p, 1420 * p, 32, 130, t, 0.23, 0.28);
        this.tone(out, 'square', 1320 * p, 840 * p, t + 0.06, 0.17, 0.16, 0.008);
        break;

      case 'wall_climb':
        this.tone(out, 'triangle', 220 * p, 460 * p, t, 0.075, 0.56, 0.003);
        this.noise(out, false, 'bandpass', 1800 * p, 900 * p, 2.2, t, 0.065, 0.34);
        break;

      case 'wall_bounce':
        // Boingy cartoon spring-kick!
        this.wobbleTone(out, 'triangle', 170 * p, 640 * p, 24, 95, t, 0.21, 0.74);
        this.tone(out, 'square', 310 * p, 780 * p, t, 0.11, 0.22, 0.004);
        break;

      case 'grab_dash':
        this.noise(out, true, 'bandpass', 1500 * p, 380 * p, 1.6, t, 0.14, 0.54);
        this.tone(out, 'sawtooth', 460 * p, 165 * p, t, 0.12, 0.52, 0.003);
        this.tone(out, 'triangle', 720 * p, 310 * p, t, 0.08, 0.3, 0.002);
        break;

      case 'throw':
        this.tone(out, 'sine', 760 * p, 230 * p, t, 0.17, 0.6, 0.004);
        this.noise(out, true, 'bandpass', 1900 * p, 520 * p, 2.0, t, 0.15, 0.38);
        break;

      case 'uppercut':
        this.tone(out, 'sine', 165 * p, 55, t, 0.1, 0.65, 0.002);
        this.driveTone(out, 'sawtooth', 260 * p, 1180 * p, t, 0.2, 0.44);
        this.noise(out, false, 'highpass', 2400 * p, 5200 * p, 1.0, t, 0.14, 0.4);
        break;

      case 'sjump_charge':
        this.wobbleTone(out, 'sawtooth', 145 * p, 470 * p, 22, 42, t, 0.26, 0.48);
        this.tone(out, 'triangle', 290 * p, 920 * p, t + 0.03, 0.22, 0.28, 0.01);
        break;

      case 'sjump_launch':
        // Explosive rocket-cannon blastoff!
        this.tone(out, 'sine', 145 * p, 34, t, 0.32, 0.85, 0.002);
        this.noise(out, true, 'lowpass', 3400 * p, 620 * p, 1.1, t, 0.36, 0.72);
        this.driveTone(out, 'sawtooth', 210 * p, 1280 * p, t, 0.34, 0.48);
        this.tone(out, 'square', 315 * p, 1620 * p, t + 0.02, 0.28, 0.24, 0.006);
        break;

      case 'sjump_cancel':
        this.tone(out, 'sawtooth', 940 * p, 290 * p, t, 0.15, 0.52, 0.003);
        this.noise(out, false, 'bandpass', 2400 * p, 800 * p, 2.4, t, 0.14, 0.46);
        break;

      case 'bodyslam_heavy':
        // Earth-shattering cartoon crater boom!
        this.tone(out, 'sine', 120 * p, 28, t, 0.38, 0.95, 0.002);
        this.driveTone(out, 'triangle', 175 * p, 38, t, 0.3, 0.6);
        this.noise(out, true, 'lowpass', 1800 * p, 220 * p, 1.2, t, 0.38, 0.78);
        this.noise(out, false, 'highpass', 1600 * p, 900 * p, 1.0, t, 0.07, 0.42);
        break;

      case 'block_marble':
        // Crunchy masonry shatter
        this.noise(out, false, 'bandpass', 2200 * p, 950 * p, 1.6, t, 0.12, 0.62);
        this.noise(out, false, 'bandpass', 3100 * p, 1200 * p, 2.0, t + 0.038, 0.11, 0.46);
        this.tone(out, 'triangle', 480 * p, 160 * p, t, 0.08, 0.5, 0.002);
        this.tone(out, 'square', 340 * p, 125 * p, t + 0.045, 0.09, 0.25, 0.002);
        break;

      case 'block_metal':
        // Heavy steel clang & crunch!
        this.tone(out, 'square', 415 * p, 380 * p, t, 0.24, 0.34, 0.002);
        this.tone(out, 'sawtooth', 642 * p, 610 * p, t, 0.22, 0.28, 0.002);
        this.tone(out, 'triangle', 1018 * p, 960 * p, t, 0.2, 0.24, 0.002);
        this.tone(out, 'sine', 1560 * p, 1480 * p, t, 0.18, 0.2, 0.002);
        this.tone(out, 'sine', 135 * p, 48, t, 0.14, 0.65, 0.002);
        this.noise(out, false, 'highpass', 2800 * p, 1800 * p, 1.2, t, 0.11, 0.48);
        break;

      case 'taunt': {
        // Iconic cheeky cartoon horn + golden sparkle chime!
        const notes = [523.25, 659.25, 783.99, 880.0]; // C5-E5-G5-A5 punchy major6 stab
        for (let i = 0; i < notes.length; i++) {
          const f = notes[i] * p;
          this.tone(out, 'sawtooth', f * 0.94, f, t + i * 0.012, 0.24, 0.26, 0.008);
        }
        this.tone(out, 'sine', 1567.98 * p, 2093.0 * p, t + 0.03, 0.24, 0.3, 0.005);
        break;
      }

      case 'parry': {
        // Resonant steel anvil-ring + electric flash!
        this.tone(out, 'sine', 165 * p, 52, t, 0.14, 0.72, 0.002);
        const partials = [880, 1318.5, 2093, 2793.8, 3520];
        for (let i = 0; i < partials.length; i++) {
          this.tone(
            out,
            i % 2 === 0 ? 'triangle' : 'sine',
            partials[i] * p,
            partials[i] * p * 0.992,
            t,
            0.44 - i * 0.05,
            0.34 / (1 + i * 0.35),
            0.002,
          );
        }
        this.noise(out, false, 'highpass', 4200 * p, 2200 * p, 1.5, t, 0.12, 0.42);
        break;
      }

      case 'super_taunt': {
        // Thunderous screen-clearing superhero blast!
        this.tone(out, 'sine', 130, 32, t, 0.45, 0.9, 0.003);
        this.noise(out, false, 'bandpass', 3200, 750, 1.0, t, 0.38, 0.62);
        const chord = [261.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < chord.length; i++) {
          this.driveTone(out, 'sawtooth', chord[i] * 0.95 * p, chord[i] * p, t + i * 0.024, 0.5, 0.22);
        }
        break;
      }

      case 'enemy_hit':
        // Comical cartoon bonk/slap!
        this.tone(out, 'triangle', 410 * p, 145 * p, t, 0.11, 0.76, 0.002);
        this.noise(out, false, 'bandpass', 1650 * p, 900 * p, 1.8, t, 0.075, 0.54);
        break;

      case 'enemy_kill':
        // Punchy K.O. bonk + comical flying-out whistle pop!
        this.tone(out, 'sine', 190 * p, 62, t, 0.12, 0.72, 0.002);
        this.tone(out, 'triangle', 300 * p, 940 * p, t + 0.03, 0.18, 0.56, 0.004);
        this.noise(out, false, 'bandpass', 2400 * p, 1200 * p, 1.4, t, 0.1, 0.5);
        break;

      case 'pickup_small':
        this.tone(out, 'square', 880 * p, 920 * p, t, 0.045, 0.28, 0.002);
        this.tone(out, 'triangle', 1318.5 * p, 1360 * p, t + 0.035, 0.075, 0.42, 0.002);
        break;

      case 'pickup_big':
        this.tone(out, 'triangle', 659.25 * p, 659.25 * p, t, 0.065, 0.45, 0.002);
        this.tone(out, 'triangle', 880.0 * p, 880.0 * p, t + 0.055, 0.075, 0.48, 0.002);
        this.tone(out, 'sine', 1318.5 * p, 1340.0 * p, t + 0.11, 0.11, 0.52, 0.003);
        break;

      case 'toppin_free': {
        const arp = [523.25, 659.25, 783.99, 987.77, 1046.5];
        for (let i = 0; i < arp.length; i++) {
          this.tone(out, 'triangle', arp[i] * p, arp[i] * p, t + i * 0.065, 0.16, 0.5, 0.004);
          this.tone(out, 'square', arp[i] * 0.5 * p, arp[i] * 0.5 * p, t + i * 0.065, 0.12, 0.16, 0.004);
        }
        break;
      }

      case 'secret_found': {
        const notes = [369.99, 392.0, 493.88, 587.33, 783.99, 1174.66];
        for (let i = 0; i < notes.length; i++) {
          this.tone(out, 'triangle', notes[i], notes[i], t + i * 0.072, 0.19, 0.48, 0.004);
          this.tone(out, 'sine', notes[i] * 2, notes[i] * 2, t + i * 0.072, 0.14, 0.2, 0.004);
        }
        break;
      }

      case 'treasure_get': {
        const arp = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
        for (let i = 0; i < arp.length; i++) {
          this.tone(out, 'sawtooth', arp[i], arp[i], t + i * 0.065, 0.26, 0.22, 0.005);
          this.tone(out, 'sine', arp[i] * 2, arp[i] * 2, t + i * 0.065, 0.28, 0.28, 0.004);
        }
        break;
      }

      case 'pillar_smash': {
        // Dramatic Pillar Chronos demolition + ominous Krunk Time brass blast!
        this.tone(out, 'sine', 135, 26, t, 0.55, 0.95, 0.002);
        this.noise(out, true, 'lowpass', 2600, 260, 1.1, t, 0.55, 0.85);
        this.noise(out, false, 'bandpass', 2400, 900, 1.8, t + 0.06, 0.25, 0.55);
        this.noise(out, false, 'bandpass', 1900, 700, 1.8, t + 0.16, 0.25, 0.45);
        // Dramatic minor brass sting
        const horn = [164.81, 196.0, 246.94, 329.63];
        for (const f of horn) {
          this.driveTone(out, 'sawtooth', f * 0.96, f, t + 0.08, 0.62, 0.24);
        }
        break;
      }

      case 'lap2_enter': {
        // Reality-warping portal whoosh + manic ascending chord!
        this.wobbleTone(out, 'sawtooth', 220, 1320, 18, 120, t, 0.62, 0.42);
        this.wobbleTone(out, 'square', 330, 1760, 24, 90, t + 0.06, 0.56, 0.26);
        this.noise(out, true, 'bandpass', 420, 3400, 2.2, t, 0.6, 0.55);
        break;
      }

      case 'hurt':
        this.wobbleTone(out, 'sawtooth', 470 * p, 115 * p, 26, 48, t, 0.3, 0.62);
        this.tone(out, 'sine', 150 * p, 52, t, 0.16, 0.65, 0.002);
        break;

      case 'boss_hit':
        this.tone(out, 'sine', 165 * p, 42, t, 0.24, 0.88, 0.002);
        this.driveTone(out, 'sawtooth', 360 * p, 120 * p, t, 0.22, 0.5);
        this.tone(out, 'square', 780 * p, 420 * p, t, 0.14, 0.28, 0.002);
        this.noise(out, false, 'bandpass', 1900 * p, 700 * p, 1.4, t, 0.16, 0.58);
        break;

      case 'boss_defeat': {
        // Triple staggered cartoon K.O. explosions + victory horn blast!
        const booms = [0, 0.18, 0.36];
        for (const dt of booms) {
          this.tone(out, 'sine', 140, 30, t + dt, 0.34, 0.82, 0.002);
          this.noise(out, true, 'lowpass', 2400, 260, 1.2, t + dt, 0.32, 0.72);
        }
        const fanfare = [392.0, 493.88, 587.33, 783.99];
        for (let i = 0; i < fanfare.length; i++) {
          this.driveTone(out, 'sawtooth', fanfare[i], fanfare[i], t + 0.52 + i * 0.055, 0.45, 0.26);
        }
        break;
      }

      case 'shotgun_blast':
        this.tone(out, 'sine', 155 * p, 36, t, 0.2, 0.88, 0.002);
        this.noise(out, false, 'lowpass', 4800 * p, 420 * p, 0.9, t, 0.26, 0.85);
        this.tone(out, 'square', 1100 * p, 520 * p, t + 0.17, 0.04, 0.24, 0.002);
        this.tone(out, 'square', 840 * p, 1280 * p, t + 0.22, 0.045, 0.24, 0.002);
        break;

      case 'revolver_shot':
        this.tone(out, 'sine', 210 * p, 62, t, 0.1, 0.72, 0.002);
        this.noise(out, false, 'bandpass', 2800 * p, 850 * p, 1.2, t, 0.14, 0.72);
        this.tone(out, 'triangle', 1650 * p, 340 * p, t + 0.015, 0.13, 0.36, 0.002);
        break;

      case 'transform': {
        const arp = [329.63, 440.0, 587.33, 783.99, 1046.5];
        for (let i = 0; i < arp.length; i++) {
          this.tone(out, 'triangle', arp[i] * p, arp[i] * 1.06 * p, t + i * 0.048, 0.13, 0.46, 0.003);
        }
        this.noise(out, true, 'bandpass', 900, 2600, 1.5, t, 0.22, 0.34);
        break;
      }

      case 'door_enter':
        this.noise(out, true, 'bandpass', 1200 * p, 450 * p, 1.8, t, 0.12, 0.42);
        this.tone(out, 'triangle', 295 * p, 165 * p, t + 0.04, 0.11, 0.56, 0.003);
        break;

      case 'ui_move':
        this.tone(out, 'triangle', 640 * p, 820 * p, t, 0.048, 0.55, 0.002);
        break;

      case 'ui_confirm':
        this.tone(out, 'triangle', 523.25, 523.25, t, 0.06, 0.54, 0.002);
        this.tone(out, 'square', 783.99, 800.0, t + 0.055, 0.09, 0.34, 0.002);
        break;

      case 'ui_back':
        this.tone(out, 'triangle', 466.16, 293.66, t, 0.11, 0.54, 0.003);
        break;

      case 'combo_drop': {
        // Comical descending wah-wah-wah-waaah!
        const notes = [392.0, 369.99, 349.23, 311.13];
        for (let i = 0; i < notes.length; i++) {
          const isLast = i === notes.length - 1;
          const dur = isLast ? 0.24 : 0.095;
          this.wobbleTone(
            out,
            'sawtooth',
            notes[i] * p,
            (isLast ? notes[i] * 0.84 : notes[i] * 0.96) * p,
            isLast ? 8 : 4,
            isLast ? 14 : 5,
            t + i * 0.1,
            dur,
            0.42,
          );
        }
        break;
      }

      case 'alarm_siren':
        this.tone(out, 'sawtooth', 640 * p, 980 * p, t, 0.21, 0.45, 0.008);
        this.tone(out, 'sawtooth', 620 * p, 960 * p, t + 0.23, 0.23, 0.45, 0.008);
        break;

      case 'time_extend': {
        const notes = [587.33, 880.0, 1174.66, 1760.0];
        for (let i = 0; i < notes.length; i++) {
          this.tone(out, 'triangle', notes[i] * p, notes[i] * p, t + i * 0.052, 0.15, 0.48, 0.003);
        }
        break;
      }
    }
  }

  // ---- Clean Click-Free Synthesis Primitives ----

  private tone(
    dest: AudioNode,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    t: number,
    dur: number,
    peak: number,
    attack = 0.005,
  ): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    const f0 = Math.max(24, startFreq);
    const f1 = Math.max(24, endFreq);
    osc.frequency.setValueAtTime(f0, t);
    if (Math.abs(f1 - f0) > 0.5) {
      osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    }

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + Math.min(attack, dur * 0.4));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(env);
    env.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.015);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  private driveTone(
    dest: AudioNode,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    t: number,
    dur: number,
    peak: number,
  ): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const shaper = ctx.createWaveShaper();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, startFreq), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, endFreq), t + dur);

    shaper.curve = this.softClipCurve;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4200, t);

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(shaper);
    shaper.connect(filter);
    filter.connect(env);
    env.connect(dest);

    osc.start(t);
    osc.stop(t + dur + 0.015);
    osc.onended = () => {
      osc.disconnect();
      shaper.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private wobbleTone(
    dest: AudioNode,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    lfoRate: number,
    lfoDepth: number,
    t: number,
    dur: number,
    peak: number,
  ): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(28, startFreq), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, endFreq), t + dur);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(lfoRate, t);
    lfoGain.gain.setValueAtTime(lfoDepth, t);

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(env);
    env.connect(dest);

    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.015);
    lfo.stop(t + dur + 0.015);
    osc.onended = () => {
      lfo.disconnect();
      lfoGain.disconnect();
      osc.disconnect();
      env.disconnect();
    };
  }

  private noise(
    dest: AudioNode,
    usePink: boolean,
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    q: number,
    t: number,
    dur: number,
    peak: number,
  ): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = usePink ? this.pinkNoise : this.whiteNoise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, t);
    filter.frequency.setValueAtTime(Math.max(40, startFreq), t);
    if (Math.abs(endFreq - startFreq) > 1) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(dest);

    const offset = Math.abs((t * 3.7) % 1.2);
    src.start(t, offset, dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  // ---- Pre-Built Noise & Soft-Clip Buffers ----

  private buildNoiseBuffer(pink: boolean): AudioBuffer {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * 2));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let seed = pink ? 0x517cc1b7 : 0x243f6a88;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;

    for (let i = 0; i < length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const white = ((seed >>> 0) / 0xffffffff) * 2 - 1;
      if (pink) {
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.18) * 1.4));
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  private buildSoftClipCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 256;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * amount);
    }
    return curve;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.stopMusic(10);
    this.disposed = true;
    for (const timer of this.cleanupTimers) {
      globalThis.clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    for (const v of this.activeSfxVoices) {
      v.stop();
    }
    this.activeSfxVoices.length = 0;
    this.lastSfxTimeMs.clear();
    try {
      this.musicSequencerGain.disconnect();
      this.musicBus.disconnect();
      this.sfxBus.disconnect();
      this.compressor.disconnect();
      this.masterGain.disconnect();
    } catch {
      // Ignore disconnect errors on shutdown
    }
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
