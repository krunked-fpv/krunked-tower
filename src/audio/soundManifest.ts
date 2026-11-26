// ============================================================================
// Krunked Tower — Sound & Soundtrack Manifest
// Complete metadata registry for all 39 MusicTrackIds and 42 SfxIds.
// Pure TypeScript — ZERO DOM dependencies (safe in Node/Vitest).
// ============================================================================

import type { MusicTrackId, SfxId } from '../contracts/index';

export type ScaleName =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'mixolydian'
  | 'phrygian'
  | 'phrygian_dominant'
  | 'harmonic_minor'
  | 'blues'
  | 'pentatonic_major'
  | 'pentatonic_minor'
  | 'whole_tone'
  | 'lydian'
  | 'hungarian_minor';

export type BassStyle =
  | 'none'
  | 'slap_funk'
  | 'octave_pump'
  | 'walking_swing'
  | 'sub_stomp'
  | 'acid_bounce'
  | 'tuba_oompah'
  | 'gallop_rock'
  | 'spooky_creep';

export type LeadStyle =
  | 'none'
  | 'brass_punch'
  | 'square_cartoon'
  | 'sax_honk'
  | 'organ_spooky'
  | 'twang_banjo'
  | 'synth_bell'
  | 'screech_lead'
  | 'whistle_flute'
  | 'accordion_bouncy';

export type PercussionStyle =
  | 'none'
  | 'funk_break'
  | 'cartoon_march'
  | 'hyper_dnb'
  | 'western_gallop'
  | 'spooky_rim'
  | 'industrial_clang'
  | 'swing_brush'
  | 'boss_thrash'
  | 'minimal_tick';

export type ChordStyle =
  | 'none'
  | 'brass_stab'
  | 'funk_clav'
  | 'organ_swell'
  | 'power_fifth'
  | 'marimba_arp'
  | 'jazz_comp';

export type SfxPriority = 'low' | 'normal' | 'high';

export interface MusicTrackMeta {
  id: MusicTrackId;
  title: string;
  bpm: number;
  rootMidi: number;
  scale: ScaleName;
  vibe: string;
  loopBars: number;
  swing: number;
  bassStyle: BassStyle;
  leadStyle: LeadStyle;
  percussionStyle: PercussionStyle;
  chordStyle: ChordStyle;
  loop: boolean;
  gain: number;
}

export interface SfxMeta {
  id: SfxId;
  cooldownMs: number;
  maxPolyphony: number;
  baseGain: number;
  defaultPitchJitter: number;
  estimatedDurationMs: number;
  priority: SfxPriority;
}

export const GLOBAL_MAX_SFX_POLYPHONY = 16;

export const SCALE_INTERVALS: Record<ScaleName, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  phrygian_dominant: [0, 1, 4, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  blues: [0, 3, 5, 6, 7, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  whole_tone: [0, 2, 4, 6, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  hungarian_minor: [0, 2, 3, 6, 7, 8, 11],
};

/** Converts MIDI note number (69 = A4 = 440 Hz) into frequency in Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Maps a scale degree (supports negative degrees and multi-octave offsets)
 * into an absolute MIDI pitch relative to `rootMidi`.
 */
export function scaleDegreeToMidi(rootMidi: number, scale: ScaleName, degree: number): number {
  const intervals = SCALE_INTERVALS[scale];
  const len = intervals.length;
  const octave = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return rootMidi + octave * 12 + intervals[idx];
}

// ============================================================================
// Complete Music Track Manifest (All 39 MusicTrackIds)
// ============================================================================

export const MUSIC_MANIFEST: Record<MusicTrackId, MusicTrackMeta> = {
  none: {
    id: 'none',
    title: 'Silence',
    bpm: 0,
    rootMidi: 48,
    scale: 'major',
    vibe: 'silent',
    loopBars: 1,
    swing: 0,
    bassStyle: 'none',
    leadStyle: 'none',
    percussionStyle: 'none',
    chordStyle: 'none',
    loop: false,
    gain: 0,
  },

  // ---- Title & Hubs ----
  title: {
    id: 'title',
    title: 'Krunked Tower Overture',
    bpm: 138,
    rootMidi: 48, // C3
    scale: 'mixolydian',
    vibe: 'punchy 90s cartoon brass fanfare & slap-funk bounce',
    loopBars: 4,
    swing: 0.1,
    bassStyle: 'slap_funk',
    leadStyle: 'brass_punch',
    percussionStyle: 'funk_break',
    chordStyle: 'brass_stab',
    loop: true,
    gain: 0.9,
  },
  hub_1: {
    id: 'hub_1',
    title: 'Lobby Shuffle',
    bpm: 118,
    rootMidi: 41, // F2
    scale: 'mixolydian',
    vibe: 'quirky upbeat lobby funk with bouncy sax',
    loopBars: 4,
    swing: 0.15,
    bassStyle: 'walking_swing',
    leadStyle: 'sax_honk',
    percussionStyle: 'swing_brush',
    chordStyle: 'jazz_comp',
    loop: true,
    gain: 0.8,
  },
  hub_2: {
    id: 'hub_2',
    title: 'Dusty Saloon Mezzanine',
    bpm: 124,
    rootMidi: 50, // D3
    scale: 'blues',
    vibe: 'jaunty western blues twang & cowboy strut',
    loopBars: 4,
    swing: 0.16,
    bassStyle: 'walking_swing',
    leadStyle: 'twang_banjo',
    percussionStyle: 'western_gallop',
    chordStyle: 'jazz_comp',
    loop: true,
    gain: 0.8,
  },
  hub_3: {
    id: 'hub_3',
    title: 'Resort Promenade',
    bpm: 122,
    rootMidi: 43, // G2
    scale: 'lydian',
    vibe: 'sunny tropical marimba & bouncy resort brass',
    loopBars: 4,
    swing: 0.12,
    bassStyle: 'slap_funk',
    leadStyle: 'synth_bell',
    percussionStyle: 'funk_break',
    chordStyle: 'marimba_arp',
    loop: true,
    gain: 0.8,
  },
  hub_4: {
    id: 'hub_4',
    title: 'Back-Alley Boiler Room',
    bpm: 114,
    rootMidi: 40, // E2
    scale: 'dorian',
    vibe: 'gritty street-funk clav & smoky neon bass',
    loopBars: 4,
    swing: 0.11,
    bassStyle: 'acid_bounce',
    leadStyle: 'sax_honk',
    percussionStyle: 'funk_break',
    chordStyle: 'funk_clav',
    loop: true,
    gain: 0.82,
  },
  hub_5: {
    id: 'hub_5',
    title: 'Penthouse Overture',
    bpm: 128,
    rootMidi: 48, // C3
    scale: 'harmonic_minor',
    vibe: 'dramatic gothic-funk penthouse climb',
    loopBars: 4,
    swing: 0.04,
    bassStyle: 'octave_pump',
    leadStyle: 'organ_spooky',
    percussionStyle: 'cartoon_march',
    chordStyle: 'organ_swell',
    loop: true,
    gain: 0.84,
  },
  tutorial: {
    id: 'tutorial',
    title: 'Chef Warmup Course',
    bpm: 132,
    rootMidi: 48, // C3
    scale: 'major',
    vibe: 'cheerful training montage with bouncy tuba & square lead',
    loopBars: 4,
    swing: 0.1,
    bassStyle: 'tuba_oompah',
    leadStyle: 'square_cartoon',
    percussionStyle: 'cartoon_march',
    chordStyle: 'brass_stab',
    loop: true,
    gain: 0.85,
  },

  // ---- Floor 1 Stages ----
  stage_crypt: {
    id: 'stage_crypt',
    title: 'Gutter Crypt Strut',
    bpm: 148,
    rootMidi: 50, // D3
    scale: 'dorian',
    vibe: 'infectious opening-stage cartoon brass funk anthem',
    loopBars: 4,
    swing: 0.08,
    bassStyle: 'slap_funk',
    leadStyle: 'brass_punch',
    percussionStyle: 'funk_break',
    chordStyle: 'brass_stab',
    loop: true,
    gain: 0.9,
  },
  stage_keep: {
    id: 'stage_keep',
    title: 'Keep of the Crust',
    bpm: 144,
    rootMidi: 45, // A2
    scale: 'dorian',
    vibe: 'heroic medieval horn march with slapstick bounce',
    loopBars: 4,
    swing: 0.06,
    bassStyle: 'tuba_oompah',
    leadStyle: 'brass_punch',
    percussionStyle: 'cartoon_march',
    chordStyle: 'power_fifth',
    loop: true,
    gain: 0.88,
  },
  stage_ruins: {
    id: 'stage_ruins',
    title: 'Crumbling Relic Groove',
    bpm: 142,
    rootMidi: 46, // Bb2
    scale: 'phrygian_dominant',
    vibe: 'exotic desert ruins bounce with snaky accordion',
    loopBars: 4,
    swing: 0.08,
    bassStyle: 'slap_funk',
    leadStyle: 'accordion_bouncy',
    percussionStyle: 'funk_break',
    chordStyle: 'marimba_arp',
    loop: true,
    gain: 0.88,
  },
  stage_catacombs: {
    id: 'stage_catacombs',
    title: 'Torchlit Catacomb Caper',
    bpm: 140,
    rootMidi: 43, // G2
    scale: 'harmonic_minor',
    vibe: 'mischievous dungeon organ & clattering rimshots',
    loopBars: 4,
    swing: 0.1,
    bassStyle: 'spooky_creep',
    leadStyle: 'organ_spooky',
    percussionStyle: 'spooky_rim',
    chordStyle: 'organ_swell',
    loop: true,
    gain: 0.86,
  },

  // ---- Floor 2 Stages ----
  stage_mesa: {
    id: 'stage_mesa',
    title: 'Red-Hot Mesa Stampede',
    bpm: 152,
    rootMidi: 45, // A2
    scale: 'mixolydian',
    vibe: 'sun-baked western rock gallop & blazing brass',
    loopBars: 4,
    swing: 0.06,
    bassStyle: 'gallop_rock',
    leadStyle: 'twang_banjo',
    percussionStyle: 'western_gallop',
    chordStyle: 'power_fifth',
    loop: true,
    gain: 0.88,
  },
  stage_graveyard: {
    id: 'stage_graveyard',
    title: 'Boneyard Boogie',
    bpm: 136,
    rootMidi: 47, // B2
    scale: 'hungarian_minor',
    vibe: 'spooky cartoon skeleton swing with rattling clav',
    loopBars: 4,
    swing: 0.14,
    bassStyle: 'spooky_creep',
    leadStyle: 'organ_spooky',
    percussionStyle: 'spooky_rim',
    chordStyle: 'funk_clav',
    loop: true,
    gain: 0.86,
  },
  stage_farm: {
    id: 'stage_farm',
    title: 'Barnyard Hoedown Dash',
    bpm: 146,
    rootMidi: 43, // G2
    scale: 'pentatonic_major',
    vibe: 'rollicking fiddle-whistle barn chase & oompah bass',
    loopBars: 4,
    swing: 0.14,
    bassStyle: 'tuba_oompah',
    leadStyle: 'whistle_flute',
    percussionStyle: 'western_gallop',
    chordStyle: 'brass_stab',
    loop: true,
    gain: 0.88,
  },
  stage_saloon: {
    id: 'stage_saloon',
    title: 'High-Noon Honky-Tonk',
    bpm: 150,
    rootMidi: 50, // D3
    scale: 'blues',
    vibe: 'raucous western saloon piano-twang & saloon brawl drums',
    loopBars: 4,
    swing: 0.15,
    bassStyle: 'walking_swing',
    leadStyle: 'twang_banjo',
    percussionStyle: 'western_gallop',
    chordStyle: 'jazz_comp',
    loop: true,
    gain: 0.88,
  },

  // ---- Floor 3 Stages ----
  stage_pier: {
    id: 'stage_pier',
    title: 'Boardwalk Splashdown',
    bpm: 146,
    rootMidi: 48, // C3
    scale: 'major',
    vibe: 'surf-cartoon boardwalk brass & bubbly slap bass',
    loopBars: 4,
    swing: 0.08,
    bassStyle: 'slap_funk',
    leadStyle: 'brass_punch',
    percussionStyle: 'funk_break',
    chordStyle: 'marimba_arp',
    loop: true,
    gain: 0.88,
  },
  stage_woods: {
    id: 'stage_woods',
    title: 'Shroom Woods Boogie',
    bpm: 138,
    rootMidi: 43, // G2
    scale: 'mixolydian',
    vibe: 'joyful Gusto & Chonks woodland accordion & whistle romp',
    loopBars: 4,
    swing: 0.16,
    bassStyle: 'tuba_oompah',
    leadStyle: 'accordion_bouncy',
    percussionStyle: 'cartoon_march',
    chordStyle: 'marimba_arp',
    loop: true,
    gain: 0.88,
  },
  stage_orbit: {
    id: 'stage_orbit',
    title: 'Zero-G Funk Odyssey',
    bpm: 148,
    rootMidi: 46, // Bb2
    scale: 'lydian',
    vibe: 'cosmic retro-synth arps, acid bass & laser percussion',
    loopBars: 4,
    swing: 0.05,
    bassStyle: 'acid_bounce',
    leadStyle: 'synth_bell',
    percussionStyle: 'funk_break',
    chordStyle: 'funk_clav',
    loop: true,
    gain: 0.88,
  },
  stage_golf: {
    id: 'stage_golf',
    title: 'Par-Five Swingin\' Green',
    bpm: 134,
    rootMidi: 41, // F2
    scale: 'major',
    vibe: 'cheeky elevator-jazz meets hyper-bouncy cartoon sax',
    loopBars: 4,
    swing: 0.16,
    bassStyle: 'walking_swing',
    leadStyle: 'sax_honk',
    percussionStyle: 'swing_brush',
    chordStyle: 'jazz_comp',
    loop: true,
    gain: 0.86,
  },

  // ---- Floor 4 Stages ----
  stage_metro: {
    id: 'stage_metro',
    title: 'Midnight Metro Express',
    bpm: 154,
    rootMidi: 44, // Ab2
    scale: 'dorian',
    vibe: 'slick big-city jazz-funk horns & driving subway groove',
    loopBars: 4,
    swing: 0.1,
    bassStyle: 'slap_funk',
    leadStyle: 'sax_honk',
    percussionStyle: 'funk_break',
    chordStyle: 'funk_clav',
    loop: true,
    gain: 0.88,
  },
  stage_drain: {
    id: 'stage_drain',
    title: 'Sewer Slime Jam',
    bpm: 140,
    rootMidi: 42, // F#2
    scale: 'blues',
    vibe: 'squelchy acid-funk sewer bass & cheeky square hooks',
    loopBars: 4,
    swing: 0.12,
    bassStyle: 'acid_bounce',
    leadStyle: 'square_cartoon',
    percussionStyle: 'industrial_clang',
    chordStyle: 'funk_clav',
    loop: true,
    gain: 0.86,
  },
  stage_foundry: {
    id: 'stage_foundry',
    title: 'Piston-Pound Foundry',
    bpm: 156,
    rootMidi: 40, // E2
    scale: 'phrygian',
    vibe: 'heavy industrial anvil beats & blistering brass blasts',
    loopBars: 4,
    swing: 0.0,
    bassStyle: 'sub_stomp',
    leadStyle: 'brass_punch',
    percussionStyle: 'industrial_clang',
    chordStyle: 'power_fifth',
    loop: true,
    gain: 0.9,
  },
  stage_freezer: {
    id: 'stage_freezer',
    title: 'Sub-Zero Frostbite',
    bpm: 144,
    rootMidi: 51, // Eb3
    scale: 'minor',
    vibe: 'crystalline synth bells over crisp turbo beat',
    loopBars: 4,
    swing: 0.04,
    bassStyle: 'octave_pump',
    leadStyle: 'synth_bell',
    percussionStyle: 'funk_break',
    chordStyle: 'marimba_arp',
    loop: true,
    gain: 0.86,
  },

  // ---- Floor 5 Stages ----
  stage_manor: {
    id: 'stage_manor',
    title: 'Velvet Manor Waltz-Dash',
    bpm: 146,
    rootMidi: 45, // A2
    scale: 'harmonic_minor',
    vibe: 'haunted gothic-cartoon pipe organ & rapid harpsichord clav',
    loopBars: 4,
    swing: 0.06,
    bassStyle: 'spooky_creep',
    leadStyle: 'organ_spooky',
    percussionStyle: 'spooky_rim',
    chordStyle: 'organ_swell',
    loop: true,
    gain: 0.88,
  },
  stage_arcade: {
    id: 'stage_arcade',
    title: 'Glitchy Kid-Zone Mania',
    bpm: 158,
    rootMidi: 48, // C3
    scale: 'whole_tone',
    vibe: 'unhinged toy-arcade chiptune & jittery cartoon mayhem',
    loopBars: 4,
    swing: 0.08,
    bassStyle: 'acid_bounce',
    leadStyle: 'square_cartoon',
    percussionStyle: 'cartoon_march',
    chordStyle: 'marimba_arp',
    loop: true,
    gain: 0.88,
  },
  stage_blitz: {
    id: 'stage_blitz',
    title: 'Countdown Blitzkrieg',
    bpm: 168,
    rootMidi: 40, // E2
    scale: 'phrygian',
    vibe: 'relentless high-octane military speedrun march',
    loopBars: 4,
    swing: 0.0,
    bassStyle: 'gallop_rock',
    leadStyle: 'screech_lead',
    percussionStyle: 'boss_thrash',
    chordStyle: 'power_fifth',
    loop: true,
    gain: 0.92,
  },

  // ---- Secrets, Escapes & Bonus ----
  secret_room: {
    id: 'secret_room',
    title: 'Sneaky Crawlspace',
    bpm: 126,
    rootMidi: 45, // A2
    scale: 'dorian',
    vibe: 'playful tiptoe marimba & muted mystery groove',
    loopBars: 4,
    swing: 0.14,
    bassStyle: 'walking_swing',
    leadStyle: 'synth_bell',
    percussionStyle: 'minimal_tick',
    chordStyle: 'marimba_arp',
    loop: true,
    gain: 0.78,
  },
  escape_krunk_time: {
    id: 'escape_krunk_time',
    title: "It's Krunk Time!",
    bpm: 174,
    rootMidi: 40, // E2
    scale: 'minor',
    vibe: 'iconic high-adrenaline escape rush with screaming brass & pumping bass',
    loopBars: 4,
    swing: 0.0,
    bassStyle: 'octave_pump',
    leadStyle: 'brass_punch',
    percussionStyle: 'hyper_dnb',
    chordStyle: 'brass_stab',
    loop: true,
    gain: 0.94,
  },
  escape_lap2: {
    id: 'escape_lap2',
    title: 'Lap 2 Hyperdrive',
    bpm: 190,
    rootMidi: 42, // F#2
    scale: 'harmonic_minor',
    vibe: 'blistering double-or-nothing turbo panic remix',
    loopBars: 4,
    swing: 0.0,
    bassStyle: 'octave_pump',
    leadStyle: 'screech_lead',
    percussionStyle: 'hyper_dnb',
    chordStyle: 'power_fifth',
    loop: true,
    gain: 0.95,
  },
  escape_spire: {
    id: 'escape_spire',
    title: 'Crumbling Spire Finale',
    bpm: 182,
    rootMidi: 45, // A2
    scale: 'minor',
    vibe: 'heroic climactic tower collapse anthem',
    loopBars: 4,
    swing: 0.0,
    bassStyle: 'gallop_rock',
    leadStyle: 'brass_punch',
    percussionStyle: 'boss_thrash',
    chordStyle: 'brass_stab',
    loop: true,
    gain: 0.95,
  },
  candy_panic: {
    id: 'candy_panic',
    title: 'Sugar Rush Pandemonium',
    bpm: 164,
    rootMidi: 50, // D3
    scale: 'hungarian_minor',
    vibe: 'frantic spooky-candy carnival dash',
    loopBars: 4,
    swing: 0.08,
    bassStyle: 'tuba_oompah',
    leadStyle: 'accordion_bouncy',
    percussionStyle: 'cartoon_march',
    chordStyle: 'marimba_arp',
    loop: true,
    gain: 0.9,
  },

  // ---- Bosses ----
  boss_artiste: {
    id: 'boss_artiste',
    title: "Artiste Bell's Magnum Opus",
    bpm: 156,
    rootMidi: 43, // G2
    scale: 'hungarian_minor',
    vibe: 'pompous slapstick villain brass showdown',
    loopBars: 4,
    swing: 0.06,
    bassStyle: 'tuba_oompah',
    leadStyle: 'brass_punch',
    percussionStyle: 'boss_thrash',
    chordStyle: 'brass_stab',
    loop: true,
    gain: 0.92,
  },
  boss_cheddar: {
    id: 'boss_cheddar',
    title: 'Duel at Cheddar Gulch',
    bpm: 160,
    rootMidi: 45, // A2
    scale: 'phrygian_dominant',
    vibe: 'intense frontier-western quickdraw showdown',
    loopBars: 4,
    swing: 0.04,
    bassStyle: 'gallop_rock',
    leadStyle: 'twang_banjo',
    percussionStyle: 'western_gallop',
    chordStyle: 'power_fifth',
    loop: true,
    gain: 0.92,
  },
  boss_static: {
    id: 'boss_static',
    title: 'Static Signal Overload',
    bpm: 172,
    rootMidi: 48, // C3
    scale: 'mixolydian',
    vibe: 'hyperactive cartoon-ska chaos & zany square-wave mischief',
    loopBars: 4,
    swing: 0.08,
    bassStyle: 'slap_funk',
    leadStyle: 'square_cartoon',
    percussionStyle: 'hyper_dnb',
    chordStyle: 'brass_stab',
    loop: true,
    gain: 0.93,
  },
  boss_doppel: {
    id: 'boss_doppel',
    title: 'Uncanny Mirror Meltdown',
    bpm: 162,
    rootMidi: 49, // C#3
    scale: 'phrygian',
    vibe: 'warped eerie high-speed reflection of the Crypt theme',
    loopBars: 4,
    swing: 0.0,
    bassStyle: 'acid_bounce',
    leadStyle: 'organ_spooky',
    percussionStyle: 'industrial_clang',
    chordStyle: 'organ_swell',
    loop: true,
    gain: 0.92,
  },
  boss_megacrust: {
    id: 'boss_megacrust',
    title: 'Summit of the Mega-Crust',
    bpm: 178,
    rootMidi: 40, // E2
    scale: 'harmonic_minor',
    vibe: 'all-out 3-phase final boss theatrical cartoon metal-funk',
    loopBars: 4,
    swing: 0.0,
    bassStyle: 'octave_pump',
    leadStyle: 'screech_lead',
    percussionStyle: 'boss_thrash',
    chordStyle: 'power_fifth',
    loop: true,
    gain: 0.95,
  },

  // ---- Rank Ceremony ----
  rank_high: {
    id: 'rank_high',
    title: 'Chef Supreme Fanfare',
    bpm: 146,
    rootMidi: 46, // Bb2
    scale: 'major',
    vibe: 'triumphant celebratory brass party & victory groove',
    loopBars: 4,
    swing: 0.14,
    bassStyle: 'slap_funk',
    leadStyle: 'brass_punch',
    percussionStyle: 'funk_break',
    chordStyle: 'brass_stab',
    loop: true,
    gain: 0.88,
  },
  rank_low: {
    id: 'rank_low',
    title: 'Soggy Dough Blues',
    bpm: 96,
    rootMidi: 50, // D3
    scale: 'blues',
    vibe: 'comical downcast trombone blues & brush shuffle',
    loopBars: 4,
    swing: 0.18,
    bassStyle: 'walking_swing',
    leadStyle: 'sax_honk',
    percussionStyle: 'swing_brush',
    chordStyle: 'jazz_comp',
    loop: true,
    gain: 0.82,
  },
};

// ============================================================================
// Complete SFX Manifest (All 42 SfxIds)
// ============================================================================

export const SFX_MANIFEST: Record<SfxId, SfxMeta> = {
  // Movement & Mach Ramp
  jump: {
    id: 'jump',
    cooldownMs: 40,
    maxPolyphony: 3,
    baseGain: 0.62,
    defaultPitchJitter: 0.04,
    estimatedDurationMs: 180,
    priority: 'normal',
  },
  mach1: {
    id: 'mach1',
    cooldownMs: 65,
    maxPolyphony: 2,
    baseGain: 0.52,
    defaultPitchJitter: 0.03,
    estimatedDurationMs: 220,
    priority: 'low',
  },
  mach2: {
    id: 'mach2',
    cooldownMs: 65,
    maxPolyphony: 2,
    baseGain: 0.58,
    defaultPitchJitter: 0.03,
    estimatedDurationMs: 240,
    priority: 'normal',
  },
  mach3: {
    id: 'mach3',
    cooldownMs: 65,
    maxPolyphony: 2,
    baseGain: 0.66,
    defaultPitchJitter: 0.025,
    estimatedDurationMs: 280,
    priority: 'normal',
  },
  mach4: {
    id: 'mach4',
    cooldownMs: 65,
    maxPolyphony: 2,
    baseGain: 0.74,
    defaultPitchJitter: 0.02,
    estimatedDurationMs: 320,
    priority: 'high',
  },
  mach_drift: {
    id: 'mach_drift',
    cooldownMs: 65,
    maxPolyphony: 2,
    baseGain: 0.6,
    defaultPitchJitter: 0.04,
    estimatedDurationMs: 280,
    priority: 'normal',
  },
  wall_climb: {
    id: 'wall_climb',
    cooldownMs: 55,
    maxPolyphony: 3,
    baseGain: 0.48,
    defaultPitchJitter: 0.06,
    estimatedDurationMs: 110,
    priority: 'low',
  },
  wall_bounce: {
    id: 'wall_bounce',
    cooldownMs: 50,
    maxPolyphony: 3,
    baseGain: 0.68,
    defaultPitchJitter: 0.04,
    estimatedDurationMs: 240,
    priority: 'normal',
  },

  // Kinetic Attacks & Acrobatics
  grab_dash: {
    id: 'grab_dash',
    cooldownMs: 50,
    maxPolyphony: 3,
    baseGain: 0.65,
    defaultPitchJitter: 0.04,
    estimatedDurationMs: 170,
    priority: 'normal',
  },
  throw: {
    id: 'throw',
    cooldownMs: 50,
    maxPolyphony: 3,
    baseGain: 0.64,
    defaultPitchJitter: 0.05,
    estimatedDurationMs: 210,
    priority: 'normal',
  },
  uppercut: {
    id: 'uppercut',
    cooldownMs: 55,
    maxPolyphony: 2,
    baseGain: 0.74,
    defaultPitchJitter: 0.03,
    estimatedDurationMs: 250,
    priority: 'normal',
  },
  sjump_charge: {
    id: 'sjump_charge',
    cooldownMs: 65,
    maxPolyphony: 2,
    baseGain: 0.56,
    defaultPitchJitter: 0.02,
    estimatedDurationMs: 300,
    priority: 'normal',
  },
  sjump_launch: {
    id: 'sjump_launch',
    cooldownMs: 65,
    maxPolyphony: 2,
    baseGain: 0.85,
    defaultPitchJitter: 0.025,
    estimatedDurationMs: 420,
    priority: 'high',
  },
  sjump_cancel: {
    id: 'sjump_cancel',
    cooldownMs: 55,
    maxPolyphony: 2,
    baseGain: 0.68,
    defaultPitchJitter: 0.03,
    estimatedDurationMs: 200,
    priority: 'normal',
  },
  bodyslam_heavy: {
    id: 'bodyslam_heavy',
    cooldownMs: 65,
    maxPolyphony: 2,
    baseGain: 0.88,
    defaultPitchJitter: 0.03,
    estimatedDurationMs: 440,
    priority: 'high',
  },

  // Destructibles
  block_marble: {
    id: 'block_marble',
    cooldownMs: 38,
    maxPolyphony: 4,
    baseGain: 0.62,
    defaultPitchJitter: 0.08,
    estimatedDurationMs: 220,
    priority: 'low',
  },
  block_metal: {
    id: 'block_metal',
    cooldownMs: 42,
    maxPolyphony: 4,
    baseGain: 0.72,
    defaultPitchJitter: 0.06,
    estimatedDurationMs: 310,
    priority: 'normal',
  },

  // Taunt, Parry & Super Taunt
  taunt: {
    id: 'taunt',
    cooldownMs: 60,
    maxPolyphony: 2,
    baseGain: 0.8,
    defaultPitchJitter: 0.04,
    estimatedDurationMs: 340,
    priority: 'high',
  },
  parry: {
    id: 'parry',
    cooldownMs: 55,
    maxPolyphony: 2,
    baseGain: 0.9,
    defaultPitchJitter: 0.02,
    estimatedDurationMs: 520,
    priority: 'high',
  },
  super_taunt: {
    id: 'super_taunt',
    cooldownMs: 120,
    maxPolyphony: 1,
    baseGain: 0.92,
    defaultPitchJitter: 0.01,
    estimatedDurationMs: 680,
    priority: 'high',
  },

  // Enemies & Combat
  enemy_hit: {
    id: 'enemy_hit',
    cooldownMs: 40,
    maxPolyphony: 4,
    baseGain: 0.66,
    defaultPitchJitter: 0.07,
    estimatedDurationMs: 160,
    priority: 'normal',
  },
  enemy_kill: {
    id: 'enemy_kill',
    cooldownMs: 40,
    maxPolyphony: 4,
    baseGain: 0.72,
    defaultPitchJitter: 0.06,
    estimatedDurationMs: 260,
    priority: 'normal',
  },

  // Pickups & Stage Milestones
  pickup_small: {
    id: 'pickup_small',
    cooldownMs: 35,
    maxPolyphony: 4,
    baseGain: 0.5,
    defaultPitchJitter: 0.05,
    estimatedDurationMs: 130,
    priority: 'low',
  },
  pickup_big: {
    id: 'pickup_big',
    cooldownMs: 45,
    maxPolyphony: 4,
    baseGain: 0.66,
    defaultPitchJitter: 0.03,
    estimatedDurationMs: 240,
    priority: 'normal',
  },
  toppin_free: {
    id: 'toppin_free',
    cooldownMs: 80,
    maxPolyphony: 2,
    baseGain: 0.82,
    defaultPitchJitter: 0.01,
    estimatedDurationMs: 560,
    priority: 'high',
  },
  secret_found: {
    id: 'secret_found',
    cooldownMs: 100,
    maxPolyphony: 2,
    baseGain: 0.84,
    defaultPitchJitter: 0.0,
    estimatedDurationMs: 620,
    priority: 'high',
  },
  treasure_get: {
    id: 'treasure_get',
    cooldownMs: 100,
    maxPolyphony: 2,
    baseGain: 0.88,
    defaultPitchJitter: 0.0,
    estimatedDurationMs: 740,
    priority: 'high',
  },
  pillar_smash: {
    id: 'pillar_smash',
    cooldownMs: 120,
    maxPolyphony: 1,
    baseGain: 0.94,
    defaultPitchJitter: 0.01,
    estimatedDurationMs: 820,
    priority: 'high',
  },
  lap2_enter: {
    id: 'lap2_enter',
    cooldownMs: 120,
    maxPolyphony: 1,
    baseGain: 0.9,
    defaultPitchJitter: 0.0,
    estimatedDurationMs: 760,
    priority: 'high',
  },

  // Damage & Bosses
  hurt: {
    id: 'hurt',
    cooldownMs: 80,
    maxPolyphony: 2,
    baseGain: 0.82,
    defaultPitchJitter: 0.03,
    estimatedDurationMs: 360,
    priority: 'high',
  },
  boss_hit: {
    id: 'boss_hit',
    cooldownMs: 60,
    maxPolyphony: 2,
    baseGain: 0.88,
    defaultPitchJitter: 0.03,
    estimatedDurationMs: 360,
    priority: 'high',
  },
  boss_defeat: {
    id: 'boss_defeat',
    cooldownMs: 150,
    maxPolyphony: 1,
    baseGain: 0.95,
    defaultPitchJitter: 0.0,
    estimatedDurationMs: 1100,
    priority: 'high',
  },

  // Weapons & Props
  shotgun_blast: {
    id: 'shotgun_blast',
    cooldownMs: 60,
    maxPolyphony: 3,
    baseGain: 0.84,
    defaultPitchJitter: 0.04,
    estimatedDurationMs: 340,
    priority: 'high',
  },
  revolver_shot: {
    id: 'revolver_shot',
    cooldownMs: 45,
    maxPolyphony: 4,
    baseGain: 0.74,
    defaultPitchJitter: 0.05,
    estimatedDurationMs: 220,
    priority: 'normal',
  },
  transform: {
    id: 'transform',
    cooldownMs: 70,
    maxPolyphony: 2,
    baseGain: 0.78,
    defaultPitchJitter: 0.02,
    estimatedDurationMs: 420,
    priority: 'high',
  },
  door_enter: {
    id: 'door_enter',
    cooldownMs: 70,
    maxPolyphony: 2,
    baseGain: 0.62,
    defaultPitchJitter: 0.03,
    estimatedDurationMs: 220,
    priority: 'normal',
  },

  // UI & Alerts
  ui_move: {
    id: 'ui_move',
    cooldownMs: 35,
    maxPolyphony: 2,
    baseGain: 0.44,
    defaultPitchJitter: 0.02,
    estimatedDurationMs: 70,
    priority: 'low',
  },
  ui_confirm: {
    id: 'ui_confirm',
    cooldownMs: 45,
    maxPolyphony: 2,
    baseGain: 0.6,
    defaultPitchJitter: 0.0,
    estimatedDurationMs: 160,
    priority: 'normal',
  },
  ui_back: {
    id: 'ui_back',
    cooldownMs: 45,
    maxPolyphony: 2,
    baseGain: 0.56,
    defaultPitchJitter: 0.0,
    estimatedDurationMs: 150,
    priority: 'normal',
  },
  combo_drop: {
    id: 'combo_drop',
    cooldownMs: 120,
    maxPolyphony: 1,
    baseGain: 0.76,
    defaultPitchJitter: 0.02,
    estimatedDurationMs: 560,
    priority: 'high',
  },
  alarm_siren: {
    id: 'alarm_siren',
    cooldownMs: 100,
    maxPolyphony: 2,
    baseGain: 0.74,
    defaultPitchJitter: 0.015,
    estimatedDurationMs: 520,
    priority: 'high',
  },
  time_extend: {
    id: 'time_extend',
    cooldownMs: 65,
    maxPolyphony: 2,
    baseGain: 0.78,
    defaultPitchJitter: 0.01,
    estimatedDurationMs: 380,
    priority: 'high',
  },
};

export const ALL_MUSIC_TRACK_IDS: readonly MusicTrackId[] = Object.keys(
  MUSIC_MANIFEST,
) as MusicTrackId[];

export const ALL_SFX_IDS: readonly SfxId[] = Object.keys(SFX_MANIFEST) as SfxId[];
