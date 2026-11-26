// ============================================================================
// Krunked Tower — Swept AABB + Slope Collision Engine
// Pure 60 Hz simulation — sub-stepped (MAX_STEP_PX = 4), seamless 45° & 26.5°
// slopes, 6px ceiling/ledge corner nudge, and automatic Marble/Metal breaking.
// ============================================================================

import {
  ENGINE_CONSTANTS,
  TileType,
  type ActiveRoomState,
  type PlayerState,
  type SimState,
  type TileTypeValue,
} from '../contracts/index';
import { addScore } from './scoring';

const TS = ENGINE_CONSTANTS.TILE_SIZE;
const MAX_STEP = ENGINE_CONSTANTS.MAX_STEP_PX;
const CORNER_NUDGE = ENGINE_CONSTANTS.CORNER_NUDGE_PX;
const EPS = 0.001;

export interface PlayerCollisionResult {
  hitX: boolean;
  hitY: boolean;
  hitDirX: -1 | 0 | 1;
  hitDirY: -1 | 0 | 1;
  onSlope: boolean;
  slopeDir: -1 | 0 | 1;
  touchedHazard: TileTypeValue | 0;
  touchedWallTile: TileTypeValue | 0;
}

export interface BoxBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  w: number;
  h: number;
}

export function getTileAt(
  room: ActiveRoomState,
  tx: number,
  ty: number,
  escapeActive: boolean,
): TileTypeValue {
  if (tx < 0 || tx >= room.widthTiles) {
    return TileType.SOLID;
  }
  if (ty < 0) {
    return TileType.SOLID;
  }
  if (ty >= room.heightTiles) {
    return TileType.EMPTY;
  }
  const idx = ty * room.widthTiles + tx;
  if (room.brokenMask[idx] === 1) {
    return TileType.EMPTY;
  }
  const raw = room.tiles[idx] as TileTypeValue;
  if (raw === TileType.PILLAR_BLOCK_CLOSED) {
    return escapeActive ? TileType.EMPTY : TileType.PILLAR_BLOCK_CLOSED;
  }
  if (raw === TileType.PILLAR_BLOCK_OPEN) {
    return escapeActive ? TileType.PILLAR_BLOCK_OPEN : TileType.EMPTY;
  }
  if (raw === TileType.BREAK_OUTLET_GATE) {
    return room.outletGateTimer > 0 ? TileType.EMPTY : TileType.BREAK_OUTLET_GATE;
  }
  if (raw === TileType.SECRET_WALL) {
    return TileType.SECRET_WALL;
  }
  return raw;
}

export function isSolidTile(t: TileTypeValue): boolean {
  switch (t) {
    case TileType.SOLID:
    case TileType.BREAK_MARBLE:
    case TileType.BREAK_METAL:
    case TileType.PILLAR_BLOCK_CLOSED:
    case TileType.PILLAR_BLOCK_OPEN:
    case TileType.ICE_SOLID:
    case TileType.CONVEYOR_RIGHT:
    case TileType.CONVEYOR_LEFT:
    case TileType.CHEESE_STICK_WALL:
    case TileType.BREAK_OUTLET_GATE:
      return true;
    default:
      return false;
  }
}

export function isSlopeTile(t: TileTypeValue): boolean {
  return t >= TileType.SLOPE_45_UP_RIGHT && t <= TileType.SLOPE_26_LOW_LEFT;
}

/**
 * Downhill horizontal direction for a slope tile:
 * -1 = descends toward the left ('/', 'a', 'b')
 * +1 = descends toward the right ('\\', 'c', 'd')
 */
export function getSlopeDir(t: TileTypeValue): -1 | 0 | 1 {
  switch (t) {
    case TileType.SLOPE_45_UP_RIGHT:
    case TileType.SLOPE_26_LOW_RIGHT:
    case TileType.SLOPE_26_HIGH_RIGHT:
      return -1;
    case TileType.SLOPE_45_UP_LEFT:
    case TileType.SLOPE_26_HIGH_LEFT:
    case TileType.SLOPE_26_LOW_LEFT:
      return 1;
    default:
      return 0;
  }
}

/**
 * Exact floor surface Y for 45-degree (1:1) and 26.5-degree (2:1) slope tiles.
 * Returns null for non-slope tiles.
 */
export function getSlopeFloorY(
  t: TileTypeValue,
  localX: number,
  tileTopY: number,
): number | null {
  const lx = localX < 0 ? 0 : localX > TS ? TS : localX;
  switch (t) {
    case TileType.SLOPE_45_UP_RIGHT:
      return tileTopY + (TS - lx);
    case TileType.SLOPE_45_UP_LEFT:
      return tileTopY + lx;
    case TileType.SLOPE_26_LOW_RIGHT:
      return tileTopY + TS - lx * 0.5;
    case TileType.SLOPE_26_HIGH_RIGHT:
      return tileTopY + TS * 0.5 - lx * 0.5;
    case TileType.SLOPE_26_HIGH_LEFT:
      return tileTopY + lx * 0.5;
    case TileType.SLOPE_26_LOW_LEFT:
      return tileTopY + TS * 0.5 + lx * 0.5;
    default:
      return null;
  }
}

/**
 * Feet-anchored player bounding box:
 * Standing: 26x45 (x-13..x+13, y-45..y)
 * Crouching: 26x32 (x-13..x+13, y-32..y)
 */
export function getPlayerBox(player: PlayerState): BoxBounds {
  const w = player.crouch ? ENGINE_CONSTANTS.PLAYER_CROUCH_W : ENGINE_CONSTANTS.PLAYER_STAND_W;
  const h = player.crouch ? ENGINE_CONSTANTS.PLAYER_CROUCH_H : ENGINE_CONSTANTS.PLAYER_STAND_H;
  const halfW = w * 0.5;
  return {
    left: player.x - halfW,
    right: player.x + halfW,
    top: player.y - h,
    bottom: player.y,
    w,
    h,
  };
}

/**
 * Check if the player has vertical clearance to stand up from crouch (32px -> 45px).
 */
export function canPlayerUncrouch(state: SimState): boolean {
  const p = state.player;
  const halfW = ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5;
  const left = p.x - halfW;
  const right = p.x + halfW;
  const top = p.y - ENGINE_CONSTANTS.PLAYER_STAND_H;
  const bottom = p.y - ENGINE_CONSTANTS.PLAYER_CROUCH_H;
  return !overlapsAnySolid(state.room, state.escape.active, left, top, right, bottom);
}

/**
 * Break a Marble or Metal destructible tile at (tx, ty) if `power` suffices.
 */
export function breakTileAt(
  state: SimState,
  tx: number,
  ty: number,
  power: 'marble' | 'metal',
): boolean {
  const room = state.room;
  if (tx < 0 || tx >= room.widthTiles || ty < 0 || ty >= room.heightTiles) {
    return false;
  }
  const tile = getTileAt(room, tx, ty, state.escape.active);
  if (tile !== TileType.BREAK_MARBLE && tile !== TileType.BREAK_METAL) {
    return false;
  }
  if (tile === TileType.BREAK_METAL && power !== 'metal') {
    return false;
  }

  room.brokenMask[ty * room.widthTiles + tx] = 1;
  const cx = tx * TS + TS * 0.5;
  const cy = ty * TS + TS * 0.5;
  const isMetal = tile === TileType.BREAK_METAL;

  state.events.push(
    {
      type: 'sfx',
      sfx: isMetal ? 'block_metal' : 'block_marble',
      pitchJitter: 0.08,
    },
    {
      type: 'particle',
      kind: isMetal ? 'metal_chunk' : 'marble_chunk',
      x: cx,
      y: cy,
      count: isMetal ? 8 : 6,
      color: isMetal ? '#9aa5b8' : '#e6d8c3',
    },
    {
      type: 'rumble',
      strong: isMetal ? 0.55 : 0.25,
      weak: isMetal ? 0.45 : 0.2,
      durationMs: isMetal ? 90 : 50,
    },
  );

  if (isMetal) {
    state.shakeMag = Math.max(state.shakeMag, 3.5);
    state.shakeTimer = Math.max(state.shakeTimer, 6);
  } else {
    state.shakeMag = Math.max(state.shakeMag, 1.5);
    state.shakeTimer = Math.max(state.shakeTimer, 3);
  }

  addScore(state, 10, cx, cy);
  return true;
}

function getBreakPowerForPlayer(
  state: SimState,
  axis: 'x' | 'up' | 'down',
): 'marble' | 'metal' | null {
  const p = state.player;
  const st = p.state;
  const tr = p.transformation;

  if (axis === 'x') {
    if (
      st === 'mach3' ||
      st === 'mach4' ||
      st === 'sjump_cancel' ||
      (st === 'mach_roll' && p.movespeed >= ENGINE_CONSTANTS.MACH_ROLL_MAX) ||
      (p.rider === 'gusto_chonks' && p.movespeed >= ENGINE_CONSTANTS.GUSTO_MAX_SPEED) ||
      tr === 'barrel' ||
      tr === 'rocket' ||
      tr === 'knight' ||
      tr === 'ball' ||
      tr === 'inferno_pepper'
    ) {
      return 'metal';
    }
    if (
      st === 'mach2' ||
      st === 'mach_roll' ||
      st === 'grab_dash' ||
      st === 'wall_bounce' ||
      (p.rider === 'gusto_chonks' && p.movespeed >= ENGINE_CONSTANTS.GUSTO_BASE_SPEED) ||
      tr === 'firemouth' ||
      tr === 'weenie' ||
      tr === 'trash_roll' ||
      tr === 'bomb' ||
      tr === 'fire_butt'
    ) {
      return 'marble';
    }
    return null;
  }

  if (axis === 'up') {
    if (
      st === 'sjump' ||
      tr === 'rocket' ||
      tr === 'fire_butt' ||
      (st === 'climb_wall' && p.wallspeed >= ENGINE_CONSTANTS.MACH3_SPEED)
    ) {
      return 'metal';
    }
    if (
      st === 'uppercut' ||
      st === 'climb_wall' ||
      st === 'mach2' ||
      st === 'mach3' ||
      st === 'mach4' ||
      tr === 'knight'
    ) {
      return 'marble';
    }
    return null;
  }

  // axis === 'down'
  if (
    (st === 'freefall' &&
      (p.freefallSmash >= ENGINE_CONSTANTS.HEAVY_SLAM_SMASH_THRESHOLD ||
        state.character === 'static' ||
        p.rider === 'gusto_chonks' ||
        tr === 'knight')) ||
    st === 'piledriver' ||
    tr === 'rocket'
  ) {
    return 'metal';
  }
  if (
    st === 'freefall' ||
    st === 'mach_roll' ||
    st === 'mach2' ||
    st === 'mach3' ||
    st === 'mach4' ||
    tr === 'barrel' ||
    tr === 'ball' ||
    tr === 'knight'
  ) {
    return 'marble';
  }
  return null;
}

function overlapsAnySolid(
  room: ActiveRoomState,
  escapeActive: boolean,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  const minTx = Math.floor((left + EPS) / TS);
  const maxTx = Math.floor((right - EPS) / TS);
  const minTy = Math.floor((top + EPS) / TS);
  const maxTy = Math.floor((bottom - EPS) / TS);

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (isSolidTile(getTileAt(room, tx, ty, escapeActive))) {
        return true;
      }
    }
  }
  return false;
}

interface SlopeProbe {
  y: number;
  dir: -1 | 0 | 1;
  tile: TileTypeValue;
}

/**
 * Exact Minkowski-sum slope floor probe for an AABB `[left, right]` with feet at `footY`.
 * For `/` slopes (high on right, dir = -1), the contacting AABB corner is `right` clamped into the tile.
 * For `\` slopes (high on left, dir = +1), the contacting AABB corner is `left` clamped into the tile.
 * Taking the highest (minimum Y) valid surface across overlapping slope tiles makes every
 * flat <-> 45° <-> 26.5° seam, crest, and trough 100% snag-free even at Mach 4!
 */
function findBestSlope(
  room: ActiveRoomState,
  escapeActive: boolean,
  _x: number,
  left: number,
  right: number,
  footY: number,
  maxUp: number,
  maxDown: number,
): SlopeProbe | null {
  const minTx = Math.floor((left + EPS) / TS);
  const maxTx = Math.floor((right - EPS) / TS);
  const minTy = Math.floor((footY - maxUp) / TS);
  const maxTy = Math.floor((footY + maxDown) / TS);

  let best: SlopeProbe | null = null;

  for (let ty = minTy; ty <= maxTy; ty++) {
    const tileTopY = ty * TS;
    for (let tx = minTx; tx <= maxTx; tx++) {
      const tile = getTileAt(room, tx, ty, escapeActive);
      if (!isSlopeTile(tile)) continue;
      const dir = getSlopeDir(tile);
      const tileLeft = tx * TS;
      const tileRight = tileLeft + TS;
      const sampleX =
        dir === -1
          ? Math.min(tileRight, right)
          : Math.max(tileLeft, left);
      const localX = sampleX - tileLeft;
      const sy = getSlopeFloorY(tile, localX, tileTopY);
      if (sy === null) continue;

      const delta = sy - footY; // negative = slope above feet (step up), positive = below feet (snap down)
      if (delta >= -maxUp && delta <= maxDown) {
        if (best === null || sy < best.y) {
          best = { y: sy, dir, tile };
        }
      }
    }
  }

  return best;
}

function getStandingGroundTile(
  room: ActiveRoomState,
  escapeActive: boolean,
  left: number,
  right: number,
  footY: number,
): TileTypeValue {
  const ty = Math.floor((footY + 1) / TS);
  const minTx = Math.floor((left + 2) / TS);
  const maxTx = Math.floor((right - 2) / TS);
  for (let tx = minTx; tx <= maxTx; tx++) {
    const t = getTileAt(room, tx, ty, escapeActive);
    if (isSolidTile(t) || t === TileType.ONE_WAY || isSlopeTile(t)) {
      return t;
    }
  }
  return TileType.EMPTY;
}

/**
 * Query surface tile immediately beneath the player's feet (for Ice / Conveyor friction).
 */
export function getSurfaceTileUnderPlayer(state: SimState): TileTypeValue {
  const box = getPlayerBox(state.player);
  return getStandingGroundTile(state.room, state.escape.active, box.left, box.right, box.bottom);
}

/**
 * Swept sub-stepped AABB + slope collision for the player.
 */
export function moveAndCollidePlayer(
  state: SimState,
  dx: number,
  dy: number,
): PlayerCollisionResult {
  const p = state.player;
  const room = state.room;
  const esc = state.escape.active;

  const result: PlayerCollisionResult = {
    hitX: false,
    hitY: false,
    hitDirX: 0,
    hitDirY: 0,
    onSlope: false,
    slopeDir: 0,
    touchedHazard: 0,
    touchedWallTile: 0,
  };

  const w = p.crouch ? ENGINE_CONSTANTS.PLAYER_CROUCH_W : ENGINE_CONSTANTS.PLAYER_STAND_W;
  const h = p.crouch ? ENGINE_CONSTANTS.PLAYER_CROUCH_H : ENGINE_CONSTANTS.PLAYER_STAND_H;
  const halfW = w * 0.5;

  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
  let stepX = dx / steps;
  let stepY = dy / steps;

  let stuckToGround = p.grounded || p.onSlope;
  const movingUpward = dy < -EPS;

  for (let step = 0; step < steps; step++) {
    let hitYThisStep = false;
    // ------------------------------------------------------------------
    // 1. HORIZONTAL SUBSTEP
    // ------------------------------------------------------------------
    if (Math.abs(stepX) > 1e-6) {
      const prevX = p.x;
      p.x += stepX;

      // Try automatic Marble/Metal breaking on the leading edge first
      const xPower = getBreakPowerForPlayer(state, 'x');
      if (xPower) {
        const edgeX = stepX > 0 ? p.x + halfW - EPS : p.x - halfW + EPS;
        const edgeTx = Math.floor(edgeX / TS);
        const minTy = Math.floor((p.y - h + EPS) / TS);
        const maxTy = Math.floor((p.y - EPS) / TS);
        for (let ty = minTy; ty <= maxTy; ty++) {
          breakTileAt(state, edgeTx, ty, xPower);
        }
      }

      // Check slope ascent while moving horizontally (smoothly climb up slopes)
      const slopeUp = findBestSlope(
        room,
        esc,
        p.x,
        p.x - halfW,
        p.x + halfW,
        p.y,
        Math.abs(stepX) + 8,
        0,
      );
      if (slopeUp && !movingUpward) {
        if (!overlapsAnySolid(room, esc, p.x - halfW, slopeUp.y - h, p.x + halfW, slopeUp.y - EPS)) {
          p.y = slopeUp.y;
          result.onSlope = true;
          result.slopeDir = slopeUp.dir;
          stuckToGround = true;
        }
      }

      // Check solid collisions along X
      let minTx = Math.floor((p.x - halfW + EPS) / TS);
      let maxTx = Math.floor((p.x + halfW - EPS) / TS);
      let minTy = Math.floor((p.y - h + EPS) / TS);
      let maxTy = Math.floor((p.y - EPS) / TS);

      let blockingTile: TileTypeValue = TileType.EMPTY;
      let blockingTx = 0;
      let highestBlockedTop = Infinity;

      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          const t = getTileAt(room, tx, ty, esc);
          if (isSolidTile(t)) {
            blockingTile = t;
            blockingTx = tx;
            const tileTop = ty * TS;
            if (tileTop < highestBlockedTop) {
              highestBlockedTop = tileTop;
            }
          }
        }
      }

      if (blockingTile !== TileType.EMPTY) {
        // Slope-top seam forgiveness / ledge lip step-up (<= 8px from slope, <= 6px general)
        const maxStepUp = stuckToGround || result.onSlope ? 10 : CORNER_NUDGE;
        let nudged = false;

        if (!movingUpward && p.y - highestBlockedTop > 0 && p.y - highestBlockedTop <= maxStepUp) {
          const tryY = highestBlockedTop;
          if (!overlapsAnySolid(room, esc, p.x - halfW, tryY - h, p.x + halfW, tryY)) {
            p.y = tryY;
            nudged = true;
          }
        }

        // Ceiling corner nudge down while airborne (<= 6px)
        if (!nudged && !stuckToGround) {
          for (let off = 1; off <= CORNER_NUDGE; off++) {
            if (!overlapsAnySolid(room, esc, p.x - halfW, p.y - h + off, p.x + halfW, p.y + off)) {
              p.y += off;
              nudged = true;
              break;
            }
          }
        }

        if (!nudged) {
          if (stepX > 0) {
            p.x = blockingTx * TS - halfW;
            result.hitDirX = 1;
          } else {
            p.x = (blockingTx + 1) * TS + halfW;
            result.hitDirX = -1;
          }
          // Safety guard: never push player backwards past prevX into another tile
          if (
            overlapsAnySolid(room, esc, p.x - halfW, p.y - h, p.x + halfW, p.y)
          ) {
            p.x = prevX;
          }
          result.hitX = true;
          result.touchedWallTile = blockingTile;
          stepX = 0;
        }
      }
    }

    // ------------------------------------------------------------------
    // 2. VERTICAL SUBSTEP
    // ------------------------------------------------------------------
    const prevY = p.y;
    if (Math.abs(stepY) > 1e-6) {
      p.y += stepY;

      if (stepY < 0) {
        // Moving UP: break blocks above if allowed
        const upPower = getBreakPowerForPlayer(state, 'up');
        if (upPower) {
          const topTy = Math.floor((p.y - h + EPS) / TS);
          const minTx = Math.floor((p.x - halfW + EPS) / TS);
          const maxTx = Math.floor((p.x + halfW - EPS) / TS);
          for (let tx = minTx; tx <= maxTx; tx++) {
            breakTileAt(state, tx, topTy, upPower);
          }
        }

        // Check ceiling solid collision
        const minTx = Math.floor((p.x - halfW + EPS) / TS);
        const maxTx = Math.floor((p.x + halfW - EPS) / TS);
        const minTy = Math.floor((p.y - h + EPS) / TS);
        const maxTy = Math.floor((p.y - EPS) / TS);

        let hitCeiling = false;
        let lowestCeilBottom = -Infinity;

        for (let ty = minTy; ty <= maxTy; ty++) {
          for (let tx = minTx; tx <= maxTx; tx++) {
            if (isSolidTile(getTileAt(room, tx, ty, esc))) {
              hitCeiling = true;
              const tileBot = (ty + 1) * TS;
              if (tileBot > lowestCeilBottom) {
                lowestCeilBottom = tileBot;
              }
            }
          }
        }

        if (hitCeiling) {
          // 6px ceiling corner nudge left/right
          let nudged = false;
          for (let off = 1; off <= CORNER_NUDGE; off++) {
            if (!overlapsAnySolid(room, esc, p.x - off - halfW, p.y - h, p.x - off + halfW, p.y)) {
              p.x -= off;
              nudged = true;
              break;
            }
            if (!overlapsAnySolid(room, esc, p.x + off - halfW, p.y - h, p.x + off + halfW, p.y)) {
              p.x += off;
              nudged = true;
              break;
            }
          }

          if (!nudged) {
            p.y = lowestCeilBottom + h;
            result.hitY = true;
            result.hitDirY = -1;
            stepY = 0;
          }
        }
      } else {
        // Moving DOWN: break Marble/Metal underneath during Freefall/HeavySlam/Drill/Piledriver
        const downPower = getBreakPowerForPlayer(state, 'down');
        if (downPower && (p.state === 'freefall' || p.state === 'piledriver')) {
          const botTy = Math.floor((p.y - EPS) / TS);
          const minTx = Math.floor((p.x - halfW + EPS) / TS);
          const maxTx = Math.floor((p.x + halfW - EPS) / TS);
          let brokeAny = false;
          for (let tx = minTx; tx <= maxTx; tx++) {
            if (breakTileAt(state, tx, botTy, downPower)) {
              brokeAny = true;
            }
          }
          if (brokeAny) {
            // Keep smashing downward cleanly
          }
        }

        // Check slope floor landing first
        const slopeLanding = findBestSlope(
          room,
          esc,
          p.x,
          p.x - halfW,
          p.x + halfW,
          p.y,
          10,
          2,
        );
        if (slopeLanding && prevY <= slopeLanding.y + 8 && p.y >= slopeLanding.y - EPS) {
          p.y = slopeLanding.y;
          result.hitY = true;
          result.hitDirY = 1;
          result.onSlope = true;
          result.slopeDir = slopeLanding.dir;
          stuckToGround = true;
          hitYThisStep = true;
          stepY = 0;
        } else {
          // Check solid tiles and ONE_WAY platforms
          const minTx = Math.floor((p.x - halfW + EPS) / TS);
          const maxTx = Math.floor((p.x + halfW - EPS) / TS);
          const minTy = Math.floor((p.y - h + EPS) / TS);
          const maxTy = Math.floor((p.y - EPS) / TS);

          let landY = Infinity;
          for (let ty = minTy; ty <= maxTy; ty++) {
            for (let tx = minTx; tx <= maxTx; tx++) {
              const t = getTileAt(room, tx, ty, esc);
              const tileTop = ty * TS;
              if (isSolidTile(t)) {
                if (tileTop < landY) landY = tileTop;
              } else if (
                t === TileType.ONE_WAY &&
                prevY <= tileTop + 2 &&
                p.y >= tileTop
              ) {
                if (tileTop < landY) landY = tileTop;
              }
            }
          }

          if (landY < Infinity) {
            p.y = landY;
            result.hitY = true;
            result.hitDirY = 1;
            stuckToGround = true;
            hitYThisStep = true;
            stepY = 0;
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // 3. PER-SUBSTEP SLOPE SNAP-DOWN (Mach 4 never launches off downslopes!)
    // ------------------------------------------------------------------
    if (stuckToGround && !movingUpward && !hitYThisStep) {
      const snapMax = Math.abs(stepX) + 7;
      // Check flat solid support directly underneath first so we never sink into an adjacent flat block
      const probeMinTx = Math.floor((p.x - halfW + EPS) / TS);
      const probeMaxTx = Math.floor((p.x + halfW - EPS) / TS);
      const probeMinTy = Math.floor(p.y / TS);
      const probeMaxTy = Math.floor((p.y + snapMax) / TS);
      let flatY = Infinity;
      for (let ty = probeMinTy; ty <= probeMaxTy; ty++) {
        for (let tx = probeMinTx; tx <= probeMaxTx; tx++) {
          const t = getTileAt(room, tx, ty, esc);
          const tileTop = ty * TS;
          if (
            (isSolidTile(t) || t === TileType.ONE_WAY) &&
            tileTop >= p.y - 1 &&
            tileTop <= p.y + snapMax
          ) {
            if (tileTop < flatY) flatY = tileTop;
          }
        }
      }

      const slopeSnap = findBestSlope(
        room,
        esc,
        p.x,
        p.x - halfW,
        p.x + halfW,
        p.y,
        4,
        snapMax,
      );

      // Pick whichever valid floor surface is higher (smaller Y) to stay flush on flat <-> slope seams
      if (slopeSnap && slopeSnap.y <= flatY + EPS) {
        if (!overlapsAnySolid(room, esc, p.x - halfW, slopeSnap.y - h, p.x + halfW, slopeSnap.y - EPS)) {
          p.y = slopeSnap.y;
          result.hitY = true;
          result.hitDirY = 1;
          result.onSlope = true;
          result.slopeDir = slopeSnap.dir;
        } else if (flatY < Infinity) {
          p.y = flatY;
          result.hitY = true;
          result.hitDirY = 1;
        }
      } else if (flatY < Infinity) {
        p.y = flatY;
        result.hitY = true;
        result.hitDirY = 1;
      } else {
        stuckToGround = false;
      }
    }

    // ------------------------------------------------------------------
    // 4. HAZARD OVERLAP CHECK
    // ------------------------------------------------------------------
    if (result.touchedHazard === 0) {
      const hMinTx = Math.floor((p.x - halfW + 3) / TS);
      const hMaxTx = Math.floor((p.x + halfW - 3) / TS);
      const hMinTy = Math.floor((p.y - h + 4) / TS);
      const hMaxTy = Math.floor((p.y + 1) / TS);
      for (let ty = hMinTy; ty <= hMaxTy; ty++) {
        for (let tx = hMinTx; tx <= hMaxTx; tx++) {
          const t = getTileAt(room, tx, ty, esc);
          if (t === TileType.LAVA_HAZARD) {
            result.touchedHazard = TileType.LAVA_HAZARD;
            break;
          }
          if (t === TileType.SPIKE_HAZARD) {
            result.touchedHazard = TileType.SPIKE_HAZARD;
          }
        }
        if (result.touchedHazard === TileType.LAVA_HAZARD) break;
      }
    }
  }

  // Final grounded / slope confirmation when standing still (dy == 0)
  if (!movingUpward && !result.hitY) {
    const slopeCheck = findBestSlope(room, esc, p.x, p.x - halfW, p.x + halfW, p.y, 2, 2);
    if (slopeCheck) {
      p.y = slopeCheck.y;
      result.hitY = true;
      result.hitDirY = 1;
      result.onSlope = true;
      result.slopeDir = slopeCheck.dir;
    } else {
      const footTy = Math.floor((p.y + 1) / TS);
      const minTx = Math.floor((p.x - halfW + EPS) / TS);
      const maxTx = Math.floor((p.x + halfW - EPS) / TS);
      for (let tx = minTx; tx <= maxTx; tx++) {
        const t = getTileAt(room, tx, footTy, esc);
        const tileTop = footTy * TS;
        if (
          (isSolidTile(t) || t === TileType.ONE_WAY) &&
          Math.abs(tileTop - p.y) <= 1.5
        ) {
          p.y = tileTop;
          result.hitY = true;
          result.hitDirY = 1;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Generic swept AABB + slope mover for enemies, bosses, and physics props.
 * Coordinates use bottom-center anchor (x, y) matching PlayerState/EnemyState/BossState.
 */
export function moveAndCollideBox(
  room: ActiveRoomState,
  escapeActive: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
): { x: number; y: number; hitX: boolean; hitY: boolean; grounded: boolean } {
  let cx = x;
  let cy = y;
  let hitX = false;
  let hitY = false;
  let grounded = false;
  const halfW = w * 0.5;

  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
  let stepX = dx / steps;
  let stepY = dy / steps;

  for (let step = 0; step < steps; step++) {
    // Horizontal
    if (Math.abs(stepX) > 1e-6) {
      cx += stepX;

      const slopeUp = findBestSlope(room, escapeActive, cx, cx - halfW, cx + halfW, cy, Math.abs(stepX) + 6, 0);
      if (slopeUp && dy >= 0) {
        if (!overlapsAnySolid(room, escapeActive, cx - halfW, slopeUp.y - h, cx + halfW, slopeUp.y - EPS)) {
          cy = slopeUp.y;
          grounded = true;
        }
      }

      const minTx = Math.floor((cx - halfW + EPS) / TS);
      const maxTx = Math.floor((cx + halfW - EPS) / TS);
      const minTy = Math.floor((cy - h + EPS) / TS);
      const maxTy = Math.floor((cy - EPS) / TS);

      let blocked = false;
      let blockTx = 0;
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          if (isSolidTile(getTileAt(room, tx, ty, escapeActive))) {
            blocked = true;
            blockTx = tx;
            break;
          }
        }
        if (blocked) break;
      }

      if (blocked) {
        cx = stepX > 0 ? blockTx * TS - halfW : (blockTx + 1) * TS + halfW;
        hitX = true;
        stepX = 0;
      }
    }

    // Vertical
    const prevY = cy;
    if (Math.abs(stepY) > 1e-6) {
      cy += stepY;

      if (stepY < 0) {
        const minTx = Math.floor((cx - halfW + EPS) / TS);
        const maxTx = Math.floor((cx + halfW - EPS) / TS);
        const minTy = Math.floor((cy - h + EPS) / TS);
        const maxTy = Math.floor((cy - EPS) / TS);
        let lowestBot = -Infinity;
        for (let ty = minTy; ty <= maxTy; ty++) {
          for (let tx = minTx; tx <= maxTx; tx++) {
            if (isSolidTile(getTileAt(room, tx, ty, escapeActive))) {
              const bot = (ty + 1) * TS;
              if (bot > lowestBot) lowestBot = bot;
            }
          }
        }
        if (lowestBot > -Infinity) {
          cy = lowestBot + h;
          hitY = true;
          stepY = 0;
        }
      } else {
        const slopeLand = findBestSlope(room, escapeActive, cx, cx - halfW, cx + halfW, cy, 8, 2);
        if (slopeLand && prevY <= slopeLand.y + 8 && cy >= slopeLand.y - EPS) {
          cy = slopeLand.y;
          hitY = true;
          grounded = true;
          stepY = 0;
        } else {
          const minTx = Math.floor((cx - halfW + EPS) / TS);
          const maxTx = Math.floor((cx + halfW - EPS) / TS);
          const minTy = Math.floor((cy - h + EPS) / TS);
          const maxTy = Math.floor((cy - EPS) / TS);
          let landY = Infinity;
          for (let ty = minTy; ty <= maxTy; ty++) {
            for (let tx = minTx; tx <= maxTx; tx++) {
              const t = getTileAt(room, tx, ty, escapeActive);
              const tileTop = ty * TS;
              if (isSolidTile(t)) {
                if (tileTop < landY) landY = tileTop;
              } else if (t === TileType.ONE_WAY && prevY <= tileTop + 2 && cy >= tileTop) {
                if (tileTop < landY) landY = tileTop;
              }
            }
          }
          if (landY < Infinity) {
            cy = landY;
            hitY = true;
            grounded = true;
            stepY = 0;
          }
        }
      }
    }
  }

  // Ground probe if dy >= 0
  if (dy >= 0 && !grounded) {
    const slopeCheck = findBestSlope(room, escapeActive, cx, cx - halfW, cx + halfW, cy, 2, 2);
    if (slopeCheck) {
      cy = slopeCheck.y;
      grounded = true;
    } else {
      const footTy = Math.floor((cy + 1) / TS);
      const minTx = Math.floor((cx - halfW + EPS) / TS);
      const maxTx = Math.floor((cx + halfW - EPS) / TS);
      for (let tx = minTx; tx <= maxTx; tx++) {
        const t = getTileAt(room, tx, footTy, escapeActive);
        if ((isSolidTile(t) || t === TileType.ONE_WAY) && Math.abs(footTy * TS - cy) <= 1.5) {
          grounded = true;
          break;
        }
      }
    }
  }

  return { x: cx, y: cy, hitX, hitY, grounded };
}
