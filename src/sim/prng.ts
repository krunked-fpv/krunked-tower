// ============================================================================
// Krunked Tower — Deterministic PRNG (SplitMix32 seeding + xoshiro128**)
// Pure simulation module — ZERO non-deterministic RNG or DOM dependencies.
// ============================================================================

import type { RngState } from '../contracts/index';

function splitmix32(seed: number): [number, number] {
  const nextSeed = (seed + 0x9e3779b9) >>> 0;
  let z = nextSeed;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return [z, nextSeed];
}

function rotl32(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Create a 128-bit xoshiro128** state seeded deterministically via SplitMix32.
 */
export function createRngState(seed: number): RngState {
  let s = (seed | 0) >>> 0;
  let s0: number;
  let s1: number;
  let s2: number;
  let s3: number;
  [s0, s] = splitmix32(s);
  [s1, s] = splitmix32(s);
  [s2, s] = splitmix32(s);
  [s3, s] = splitmix32(s);
  if ((s0 | s1 | s2 | s3) === 0) {
    s0 = 0x9e3779b9;
  }
  return [s0, s1, s2, s3];
}

/**
 * Advance xoshiro128** in-place and return an unsigned 32-bit integer.
 */
export function nextU32(rng: RngState): number {
  const result = Math.imul(rotl32(Math.imul(rng[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (rng[1] << 9) >>> 0;

  rng[2] = (rng[2] ^ rng[0]) >>> 0;
  rng[3] = (rng[3] ^ rng[1]) >>> 0;
  rng[1] = (rng[1] ^ rng[2]) >>> 0;
  rng[0] = (rng[0] ^ rng[3]) >>> 0;

  rng[2] = (rng[2] ^ t) >>> 0;
  rng[3] = rotl32(rng[3], 11);

  return result;
}

/**
 * Deterministic uniform float in [0, 1).
 */
export function nextFloat(rng: RngState): number {
  return nextU32(rng) / 4294967296;
}

/**
 * Deterministic inclusive integer in [min, max].
 */
export function nextInt(rng: RngState, min: number, max: number): number {
  const lo = Math.floor(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  const span = hi - lo + 1;
  return lo + (nextU32(rng) % span);
}

/**
 * Deterministic float in [min, max).
 */
export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}
