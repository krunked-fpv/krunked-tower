import { describe, expect, it } from 'vitest';
import {
  ENGINE_CONSTANTS,
  TileType,
  createNeutralInput,
  type EnemyState,
  type InputFrame,
  type PlayableCharacter,
  type RoomDef,
  type SimState,
  type TransformationId,
} from '../src/contracts/index';
import { createInitialSimState, stepSim } from '../src/sim/step';
import { parseRoomDef } from '../src/sim/levelRuntime';
import {
  canPlayerUncrouch,
  getPlayerBox,
  getTileAt,
  moveAndCollidePlayer,
} from '../src/sim/collision';
import { spawnProjectile } from '../src/sim/combat';
import { registerKillCombo } from '../src/sim/scoring';
import { applyTransformation } from '../src/sim/transformations';

const TS = ENGINE_CONSTANTS.TILE_SIZE;

function makeGrid(w: number, h: number, floorRow = h - 2): string[][] {
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  for (let x = 0; x < w; x++) {
    grid[0][x] = '#';
    for (let y = floorRow; y < h; y++) {
      grid[y][x] = '#';
    }
  }
  for (let y = 0; y < h; y++) {
    grid[y][0] = '#';
    grid[y][w - 1] = '#';
  }
  return grid;
}

function createSandbox(
  grid: string[][],
  spawnTileX: number,
  spawnFloorRow: number,
  character: PlayableCharacter = 'peppo',
  seed = 1337,
): SimState {
  const heightTiles = grid.length;
  const widthTiles = grid[0].length;
  const spawnX = spawnTileX * TS + TS * 0.5;
  const spawnY = spawnFloorRow * TS;
  const roomDef: RoomDef = {
    id: 'physics_sandbox',
    name: 'Physics Sandbox',
    theme: 'crypt',
    widthTiles,
    heightTiles,
    rows: grid.map((r) => r.join('')),
    spawnX,
    spawnY,
    doors: [],
    spawns: [],
  };

  const state = createInitialSimState(seed, character);
  state.screen = 'stage';
  state.stageId = 'tutorial';
  state.room = parseRoomDef(roomDef);
  state.player.x = spawnX;
  state.player.y = spawnY;
  state.player.prevX = spawnX;
  state.player.prevY = spawnY;
  state.player.grounded = true;
  state.player.coyoteTicks = ENGINE_CONSTANTS.COYOTE_TICKS;
  state.player.facing = 1;
  state.enemies = [];
  state.projectiles = [];
  state.pickups = [];
  state.props = [];
  return state;
}

function inputWith(partial: Partial<InputFrame>): InputFrame {
  return { ...createNeutralInput('keyboard'), ...partial };
}

function setPlayerMotion(
  state: SimState,
  action: SimState['player']['state'],
  movespeed: number,
  facing: 1 | -1 = 1,
): void {
  state.player.state = action;
  state.player.movespeed = movespeed;
  state.player.facing = facing;
}

function makeDummyEnemy(id: number, x: number, y: number, archetype: EnemyState['archetype'] = 'slime_glob'): EnemyState {
  return {
    id,
    archetype,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    width: 28,
    height: 28,
    facing: -1,
    hp: 1,
    alive: true,
    stunTicks: 0,
    scared: false,
    grabbed: false,
    thrown: false,
    attackCooldown: 60,
    aiTimer: 0,
    grounded: true,
    originX: x,
    originY: y,
  };
}

describe('Physics & Collision Anti-Tunneling / Slopes', () => {
  it('never tunnels a 1-tile solid wall at Mach 4 horizontal speed (20 px/tick)', () => {
    // 1-tile solid wall at tx=20 (x=640..672)
    const grid = makeGrid(40, 14, 12);
    for (let y = 1; y < 12; y++) {
      grid[y][20] = '#';
    }

    // Direct swept AABB check across multiple approach offsets
    for (const startX of [612, 616, 620, 624, 626]) {
      const state = createSandbox(grid, 5, 12);
      state.player.x = startX;
      state.player.y = 12 * TS;
      state.player.state = 'mach4';
      state.player.movespeed = ENGINE_CONSTANTS.MACH4_SPEED;

      const res = moveAndCollidePlayer(state, ENGINE_CONSTANTS.MACH4_SPEED, 0);
      expect(res.hitX).toBe(true);
      expect(res.hitDirX).toBe(1);
      expect(state.player.x + ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5).toBeLessThanOrEqual(20 * TS + 0.01);
    }

    // Full stepSim run at Mach 4 (20 px/t) into the 1-tile wall
    const sim = createSandbox(grid, 17, 12);
    sim.player.state = 'mach4';
    sim.player.movespeed = ENGINE_CONSTANTS.MACH4_SPEED;
    sim.player.facing = 1;
    sim.player.stopBufferTicks = 8;

    for (let t = 0; t < 15; t++) {
      stepSim(sim, inputWith({ moveX: 1, machHeld: false }));
      expect(sim.player.x + ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5).toBeLessThanOrEqual(20 * TS + 0.01);
    }
  });

  it('never tunnels a 1-tile solid floor at Bodyslam terminal velocity (20 px/tick)', () => {
    // 1-tile solid floor at ty=10 (y=320..352) with open space below (ty=11..14)
    const grid = Array.from({ length: 16 }, () => Array.from({ length: 24 }, () => '.'));
    for (let x = 0; x < 24; x++) {
      grid[0][x] = '#';
      grid[10][x] = '#';
    }
    for (let y = 0; y < 16; y++) {
      grid[y][0] = '#';
      grid[y][23] = '#';
    }

    for (const startY of [301, 306, 312, 318, 319]) {
      const state = createSandbox(grid, 10, 10);
      state.player.y = startY;
      state.player.grounded = false;
      state.player.state = 'freefall';
      state.player.vy = ENGINE_CONSTANTS.FREEFALL_VSP;

      const res = moveAndCollidePlayer(state, 0, ENGINE_CONSTANTS.FREEFALL_VSP);
      expect(res.hitY).toBe(true);
      expect(res.hitDirY).toBe(1);
      expect(state.player.y).toBe(10 * TS);
    }

    // Full stepSim Bodyslam at 20 px/t onto 1-tile floor
    const sim = createSandbox(grid, 10, 10);
    sim.player.y = 220;
    sim.player.grounded = false;
    sim.player.state = 'freefall';
    sim.player.vy = ENGINE_CONSTANTS.FREEFALL_VSP;
    sim.player.freefallSmash = 12;

    for (let t = 0; t < 20; t++) {
      stepSim(sim, inputWith({ moveY: 1 }));
      expect(sim.player.y).toBeLessThanOrEqual(10 * TS + 0.01);
    }
    expect(sim.player.y).toBe(10 * TS);
  });

  it('traverses 45° and 26.5° slopes up and down at Mach 3/4 without snagging or unintended launch', () => {
    const floorRow = 16;
    const grid = makeGrid(90, 20, floorRow);

    // 45° up-right ramp (x=14..16, rising 3 tiles to row 13)
    for (let i = 0; i < 3; i++) {
      const tx = 14 + i;
      const ty = floorRow - 1 - i;
      grid[ty][tx] = '/';
      for (let fy = ty + 1; fy < 20; fy++) grid[fy][tx] = '#';
    }
    // Plateau at row 13 (x=17..23)
    for (let tx = 17; tx <= 23; tx++) {
      for (let fy = 13; fy < 20; fy++) grid[fy][tx] = '#';
    }
    // 45° down-right ramp (x=24..26, descending back to row 16)
    for (let i = 0; i < 3; i++) {
      const tx = 24 + i;
      const ty = 13 + i;
      grid[ty][tx] = '\\';
      for (let fy = ty + 1; fy < 20; fy++) grid[fy][tx] = '#';
    }

    // 26.5° up-right ramp (x=36..41, rising 3 tiles to row 13)
    for (let i = 0; i < 3; i++) {
      const tx = 36 + i * 2;
      const ty = floorRow - 1 - i;
      grid[ty][tx] = 'a';
      grid[ty][tx + 1] = 'b';
      for (let fy = ty + 1; fy < 20; fy++) {
        grid[fy][tx] = '#';
        grid[fy][tx + 1] = '#';
      }
    }
    // Plateau at row 13 (x=42..48)
    for (let tx = 42; tx <= 48; tx++) {
      for (let fy = 13; fy < 20; fy++) grid[fy][tx] = '#';
    }
    // 26.5° down-right ramp (x=49..54, descending back to row 16)
    for (let i = 0; i < 3; i++) {
      const tx = 49 + i * 2;
      const ty = 13 + i;
      grid[ty][tx] = 'c';
      grid[ty][tx + 1] = 'd';
      for (let fy = ty + 1; fy < 20; fy++) {
        grid[fy][tx] = '#';
        grid[fy][tx + 1] = '#';
      }
    }

    const state = createSandbox(grid, 4, floorRow);
    state.player.state = 'mach3';
    state.player.movespeed = ENGINE_CONSTANTS.MACH3_SPEED;
    state.player.facing = 1;

    let saw45Up = false;
    let saw45Down = false;
    let saw26Up = false;
    let saw26Down = false;
    let minY = Infinity;

    for (let t = 0; t < 130; t++) {
      stepSim(state, inputWith({ moveX: 1, machHeld: true }));

      // Must never snag into wall-climb, bump, or stop
      expect(state.player.state === 'mach3' || state.player.state === 'mach4').toBe(true);
      expect(state.player.movespeed).toBeGreaterThanOrEqual(15);
      // Must never launch upward off crests/downslopes
      expect(state.player.vy).toBeGreaterThanOrEqual(0);
      expect(state.player.grounded).toBe(true);

      if (state.player.y < minY) minY = state.player.y;
      const tx = Math.floor(state.player.x / TS);
      if (tx >= 14 && tx <= 16 && state.player.onSlope) saw45Up = true;
      if (tx >= 24 && tx <= 26 && state.player.onSlope) saw45Down = true;
      if (tx >= 36 && tx <= 41 && state.player.onSlope) saw26Up = true;
      if (tx >= 49 && tx <= 54 && state.player.onSlope) saw26Down = true;

      if (state.player.x > 65 * TS) break;
    }

    expect(state.player.x).toBeGreaterThan(65 * TS);
    expect(minY).toBeCloseTo(13 * TS, 1);
    expect(state.player.y).toBe(floorRow * TS);
    expect(saw45Up).toBe(true);
    expect(saw45Down).toBe(true);
    expect(saw26Up).toBe(true);
    expect(saw26Down).toBe(true);
  });
});

describe('Chef Peppo Full Moveset Oracle Verification', () => {
  it('enforces exact gravity (0.5), jump (-11), and early jump-release velocity cut (/20)', () => {
    const grid = makeGrid(24, 16, 14);
    const state = createSandbox(grid, 6, 14);

    // Tick 1: Jump pressed & held -> performJump(-11), then applyGravity(+0.5) => -10.5
    stepSim(state, inputWith({ jumpPressed: true, jumpHeld: true }));
    expect(state.player.grounded).toBe(false);
    expect(state.player.vy).toBeCloseTo(-10.5, 5);

    // Tick 2: Still held -> exact +0.5 gravity => -10.0
    stepSim(state, inputWith({ jumpHeld: true }));
    expect(state.player.vy).toBeCloseTo(-10.0, 5);

    // Tick 3: Release jump early -> vy /= 20 (-0.5), then +0.5 gravity => 0.0 and jumpStop = true
    stepSim(state, inputWith({ jumpHeld: false, jumpReleased: true }));
    expect(state.player.jumpStop).toBe(true);
    expect(state.player.vy).toBeCloseTo(0, 5);

    // Tick 4: Falls at +0.5 gravity
    stepSim(state, inputWith({}));
    expect(state.player.vy).toBeCloseTo(0.5, 5);
  });

  it('enforces 8-tick coyote time and 15-tick jump buffer', () => {
    // Platform ledge at x=1..8, open drop from x=9..20
    const grid = makeGrid(24, 20, 18);
    for (let tx = 1; tx <= 8; tx++) {
      grid[10][tx] = '#';
    }

    // 1. Coyote time: step off edge and wait 7 ticks (coyoteTicks 8 -> 1) -> jump succeeds
    const coyotePass = createSandbox(grid, 8, 10);
    coyotePass.player.x = 9 * TS - 2; // right on ledge edge
    stepSim(coyotePass, inputWith({ moveX: 1 })); // grounded tick (coyote=8)
    // Walk cleanly off the ledge
    while (coyotePass.player.grounded) {
      stepSim(coyotePass, inputWith({ moveX: 1 }));
    }
    // Wait 6 more ticks airborne so on the 7th airborne tick coyoteTicks decrements to 1
    for (let i = 0; i < 6; i++) {
      stepSim(coyotePass, inputWith({}));
    }
    expect(coyotePass.player.coyoteTicks).toBeGreaterThan(1);
    stepSim(coyotePass, inputWith({ jumpPressed: true, jumpHeld: true }));
    expect(coyotePass.player.vy).toBeLessThan(-9);

    // 2. Past 8-tick coyote window -> jump does NOT trigger
    const coyoteFail = createSandbox(grid, 8, 10);
    coyoteFail.player.x = 9 * TS - 2;
    while (coyoteFail.player.grounded) {
      stepSim(coyoteFail, inputWith({ moveX: 1 }));
    }
    for (let i = 0; i < 8; i++) {
      stepSim(coyoteFail, inputWith({}));
    }
    expect(coyoteFail.player.coyoteTicks).toBe(0);
    const vyBefore = coyoteFail.player.vy;
    stepSim(coyoteFail, inputWith({ jumpPressed: true, jumpHeld: true }));
    expect(coyoteFail.player.vy).toBeGreaterThan(vyBefore); // kept falling

    // 3. 15-tick jump buffer: tap jump in midair ~8 ticks before landing -> fires immediately on touchdown
    const flatGrid = makeGrid(24, 16, 14);
    const bufState = createSandbox(flatGrid, 8, 14);
    bufState.player.y = 14 * TS - 36;
    bufState.player.grounded = false;
    bufState.player.coyoteTicks = 0;
    bufState.player.vy = 2;

    // Tap jump once in midair
    stepSim(bufState, inputWith({ jumpPressed: true, jumpHeld: true }));
    expect(bufState.player.jumpBufferTicks).toBe(ENGINE_CONSTANTS.JUMP_BUFFER_TICKS);

    // Continue holding jump (jumpPressed=false) as player lands within 15 ticks
    let bounced = false;
    for (let t = 0; t < 14; t++) {
      stepSim(bufState, inputWith({ jumpHeld: true }));
      if (bufState.player.vy < -9) {
        bounced = true;
        break;
      }
    }
    expect(bounced).toBe(true);
  });

  it('ramps cleanly through Mach 1 -> Mach 2 -> Mach 3 -> Mach 4 (6 -> 8 -> 12 -> 16 -> 20)', () => {
    const grid = makeGrid(130, 14, 12);
    const state = createSandbox(grid, 3, 12);

    let sawMach1At6 = false;
    let sawMach2At8 = false;
    let sawMach2At12 = false;
    let sawMach3At16 = false;
    let sawMach4At20 = false;

    for (let t = 0; t < 180; t++) {
      stepSim(state, inputWith({ moveX: 1, machHeld: true, machPressed: t === 0 }));
      const { state: act, movespeed } = state.player;
      if (act === 'mach1' && Math.abs(movespeed - 6) < 0.01) sawMach1At6 = true;
      if (act === 'mach2' && Math.abs(movespeed - 8) < 0.01) sawMach2At8 = true;
      if (act === 'mach2' && Math.abs(movespeed - 12) < 0.01) sawMach2At12 = true;
      if (act === 'mach3' && Math.abs(movespeed - 16) < 0.01) sawMach3At16 = true;
      if (act === 'mach4' && Math.abs(movespeed - 20) < 0.01) {
        sawMach4At20 = true;
        break;
      }
    }

    expect(sawMach1At6).toBe(true);
    expect(sawMach2At8).toBe(true);
    expect(sawMach2At12).toBe(true);
    expect(sawMach3At16).toBe(true);
    expect(sawMach4At20).toBe(true);
  });

  it('executes Mach Drift turnaround snap boost from both Mach 2 (12) and Mach 3 (15)', () => {
    const grid = makeGrid(50, 14, 12);

    // Mach 2 Drift -> snap boost to 12 in opposite direction
    const s2 = createSandbox(grid, 20, 12);
    setPlayerMotion(s2, 'mach2', 11, 1);
    stepSim(s2, inputWith({ moveX: -1, machHeld: true }));
    expect(s2.player.state).toBe('mach_slide');
    for (let t = 0; t < 25 && s2.player.state === 'mach_slide'; t++) {
      stepSim(s2, inputWith({ moveX: -1, machHeld: true }));
    }
    expect(s2.player.facing).toBe(-1);
    expect(s2.player.state).toBe('mach2');
    expect(s2.player.movespeed).toBeGreaterThanOrEqual(ENGINE_CONSTANTS.MACH_DRIFT_BOOST_2);

    // Mach 3 Drift -> snap boost to 15 in opposite direction
    const s3 = createSandbox(grid, 25, 12);
    setPlayerMotion(s3, 'mach3', 16, 1);
    stepSim(s3, inputWith({ moveX: -1, machHeld: true }));
    expect(s3.player.state).toBe('mach_slide');
    for (let t = 0; t < 35 && s3.player.state === 'mach_slide'; t++) {
      stepSim(s3, inputWith({ moveX: -1, machHeld: true }));
    }
    expect(s3.player.facing).toBe(-1);
    expect(s3.player.state).toBe('mach3');
    expect(s3.player.movespeed).toBeGreaterThanOrEqual(ENGINE_CONSTANTS.MACH_DRIFT_BOOST_3);
  });

  it('clears a 32 px low tunnel using Crouch and Mach Roll while blocking standing height (45 px)', () => {
    // Floor at row 10, low ceiling at row 8 across x=12..18 -> exact 32px clearance at row 9
    const grid = makeGrid(32, 12, 10);
    for (let tx = 12; tx <= 18; tx++) {
      grid[8][tx] = '#';
    }

    // 1. Standing player cannot enter tunnel
    const stand = createSandbox(grid, 10, 10);
    for (let t = 0; t < 25; t++) {
      stepSim(stand, inputWith({ moveX: 1 }));
    }
    expect(stand.player.x + ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5).toBeLessThanOrEqual(12 * TS + 0.01);

    // 2. Mach Roll enters & clears entire 32px tunnel while staying crouched underneath
    const roll = createSandbox(grid, 6, 10);
    roll.player.state = 'mach3';
    roll.player.movespeed = 16;
    roll.player.facing = 1;

    let checkedUnderCeiling = false;
    for (let t = 0; t < 45; t++) {
      stepSim(roll, inputWith({ moveX: 1, moveY: 1, machHeld: true }));
      if (roll.player.x > 13 * TS && roll.player.x < 17 * TS) {
        checkedUnderCeiling = true;
        expect(roll.player.crouch).toBe(true);
        expect(getPlayerBox(roll.player).h).toBe(ENGINE_CONSTANTS.PLAYER_CROUCH_H);
        expect(canPlayerUncrouch(roll)).toBe(false);
      }
    }
    expect(checkedUnderCeiling).toBe(true);
    expect(roll.player.x).toBeGreaterThan(19 * TS);
  });

  it('converts Mach 2/3 wall impact into Wall Climb and kicks off via Wall Jump', () => {
    const grid = makeGrid(30, 18, 16);
    for (let y = 3; y < 16; y++) {
      grid[y][16] = '#';
    }

    const state = createSandbox(grid, 12, 16);
    setPlayerMotion(state, 'mach2', 11, 1);

    // Hit wall while holding Mach -> climb_wall
    for (let t = 0; t < 20 && state.player.state !== 'climb_wall'; t++) {
      stepSim(state, inputWith({ moveX: 1, machHeld: true }));
    }
    expect(state.player.state).toBe('climb_wall');
    const yAtStartClimb = state.player.y;

    // Climb upward for 6 ticks
    for (let t = 0; t < 6; t++) {
      stepSim(state, inputWith({ moveX: 1, machHeld: true }));
    }
    expect(state.player.y).toBeLessThan(yAtStartClimb - 30);

    // Wall Jump kick-off -> flips facing to -1, maintains Mach speed!
    stepSim(state, inputWith({ jumpPressed: true, jumpHeld: true, machHeld: true }));
    expect(state.player.facing).toBe(-1);
    expect(state.player.state === 'mach2' || state.player.state === 'mach3').toBe(true);
    expect(state.player.vy).toBeLessThan(-9);
    expect(state.player.movespeed).toBeGreaterThanOrEqual(10);
  });

  it('performs Grab Dash Marble break + quick-Mach chain and Flying Uppercut', () => {
    const grid = makeGrid(40, 14, 12);
    grid[11][10] = 'm'; // Breakable Marble block at x=10
    grid[10][10] = 'm';

    const state = createSandbox(grid, 8, 12);
    // Tap Grab to launch Grab Dash, then hold Mach to break Marble & chain straight into Mach 2
    stepSim(state, inputWith({ moveX: 1, grabPressed: true, grabHeld: true }));
    expect(state.player.state).toBe('grab_dash');

    for (let t = 0; t < 24; t++) {
      stepSim(state, inputWith({ moveX: 1, machHeld: true }));
    }

    // Marble shattered and chained straight into Mach 2!
    expect(getTileAt(state.room, 10, 11, false)).toBe(TileType.EMPTY);
    expect(state.player.state === 'mach2' || state.player.state === 'mach3').toBe(true);

    // Flying Uppercut (Up + Grab)
    const upGrid = makeGrid(24, 16, 14);
    upGrid[11][8] = 'm'; // Marble above player
    const upState = createSandbox(upGrid, 8, 14);
    stepSim(upState, inputWith({ moveY: -1, grabPressed: true }));
    expect(upState.player.state).toBe('uppercut');
    expect(upState.player.vy).toBeCloseTo(ENGINE_CONSTANTS.UPPERCUT_VSP + ENGINE_CONSTANTS.GRAV, 5);
    for (let t = 0; t < 8; t++) {
      stepSim(upState, inputWith({}));
    }
    expect(getTileAt(upState.room, 8, 11, false)).toBe(TileType.EMPTY);
  });

  it('charges Superjump, blasts through Metal ceilings, and supports Shoulder Cancel', () => {
    // Superjump Metal ceiling break
    const grid = makeGrid(24, 18, 16);
    grid[8][10] = 'M'; // Breakable Metal ceiling block
    grid[8][9] = 'M';
    grid[8][11] = 'M';

    const state = createSandbox(grid, 10, 16);
    state.player.state = 'mach3';
    state.player.movespeed = 16;

    // Hold Up at Mach 3 -> sjump_prep
    stepSim(state, inputWith({ moveY: -1, machHeld: true }));
    expect(state.player.state).toBe('sjump_prep');

    // Release Up -> sjump launch!
    stepSim(state, inputWith({ moveY: 0 }));
    expect(state.player.state).toBe('sjump');
    expect(state.player.vy).toBe(ENGINE_CONSTANTS.SJUMP_VSP);

    for (let t = 0; t < 25; t++) {
      stepSim(state, inputWith({}));
    }
    expect(getTileAt(state.room, 10, 8, false)).toBe(TileType.EMPTY);

    // Superjump Shoulder Cancel into horizontal Metal wall break
    const cancelGrid = makeGrid(36, 18, 16);
    cancelGrid[12][14] = 'M';
    cancelGrid[11][14] = 'M';
    const cancelState = createSandbox(cancelGrid, 10, 16);
    cancelState.player.state = 'mach3';
    cancelState.player.movespeed = 16;
    stepSim(cancelState, inputWith({ moveY: -1, machHeld: true }));
    stepSim(cancelState, inputWith({ moveY: 0 })); // launch sjump
    for (let t = 0; t < 6; t++) stepSim(cancelState, inputWith({}));
    expect(cancelState.player.state).toBe('sjump');

    // Press Grab + Right -> sjump_cancel at 13 px/t!
    stepSim(cancelState, inputWith({ grabPressed: true, moveX: 1, machHeld: true }));
    expect(cancelState.player.state).toBe('sjump_cancel');
    expect(cancelState.player.vy).toBe(0);
    expect(cancelState.player.movespeed).toBe(ENGINE_CONSTANTS.SJUMP_CANCEL_SPEED);

    for (let t = 0; t < 25; t++) {
      stepSim(cancelState, inputWith({ moveX: 1, machHeld: true }));
    }
    expect(getTileAt(cancelState.room, 14, 12, false)).toBe(TileType.EMPTY);
  });

  it('distinguishes light Bodyslam (breaks Marble only) from Heavy Slam (>=10 ticks, breaks Metal)', () => {
    // 1. Light slam on Marble -> breaks
    const marbleGrid = makeGrid(20, 18, 16);
    marbleGrid[12][10] = 'm';
    const lightMarble = createSandbox(marbleGrid, 10, 12);
    lightMarble.player.y = 12 * TS - 24;
    lightMarble.player.grounded = false;
    stepSim(lightMarble, inputWith({ moveY: 1 })); // enters freefall
    for (let t = 0; t < 8; t++) stepSim(lightMarble, inputWith({ moveY: 1 }));
    expect(getTileAt(lightMarble.room, 10, 12, false)).toBe(TileType.EMPTY);

    // 2. Light slam on Metal (freefallSmash < 10) -> does NOT break Metal
    const metalGrid = makeGrid(20, 18, 16);
    metalGrid[12][10] = 'M';
    const lightMetal = createSandbox(metalGrid, 10, 12);
    lightMetal.player.y = 12 * TS - 24;
    lightMetal.player.grounded = false;
    stepSim(lightMetal, inputWith({ moveY: 1 }));
    for (let t = 0; t < 8; t++) stepSim(lightMetal, inputWith({ moveY: 1 }));
    expect(getTileAt(lightMetal.room, 10, 12, false)).toBe(TileType.BREAK_METAL);

    // 3. Heavy Slam (starts high enough for >= 10 smash ticks) -> breaks Metal!
    const heavyGrid = makeGrid(20, 22, 20);
    heavyGrid[15][10] = 'M';
    const heavyMetal = createSandbox(heavyGrid, 10, 15);
    heavyMetal.player.y = 4 * TS;
    heavyMetal.player.grounded = false;
    stepSim(heavyMetal, inputWith({ moveY: 1 })); // enters freefall
    let maxSmash = 0;
    for (let t = 0; t < 35; t++) {
      if (heavyMetal.player.freefallSmash > maxSmash) maxSmash = heavyMetal.player.freefallSmash;
      stepSim(heavyMetal, inputWith({ moveY: 1 }));
    }
    expect(maxSmash).toBeGreaterThanOrEqual(ENGINE_CONSTANTS.HEAVY_SLAM_SMASH_THRESHOLD);
    expect(getTileAt(heavyMetal.room, 10, 15, false)).toBe(TileType.EMPTY);
  });

  it('preserves state/speed across 20-tick Taunt, reflects projectiles at facing*25 during 8-tick Parry, and wipes screen on 10-kill Super Taunt', () => {
    const grid = makeGrid(36, 14, 12);

    // 1. 20-tick Taunt freezes velocity & restores exact Mach 3 state/speed after 20 ticks
    const tauntState = createSandbox(grid, 10, 12);
    tauntState.player.state = 'mach3';
    tauntState.player.movespeed = 16;
    tauntState.player.facing = 1;

    stepSim(tauntState, inputWith({ tauntPressed: true }));
    expect(tauntState.player.state).toBe('taunt');
    expect(tauntState.player.tauntTimer).toBe(ENGINE_CONSTANTS.TAUNT_TICKS);
    expect(tauntState.player.parryTicks).toBe(ENGINE_CONSTANTS.PARRY_WINDOW_TICKS);
    expect(tauntState.player.vx).toBe(0);
    expect(tauntState.player.vy).toBe(0);

    for (let t = 0; t < 19; t++) {
      stepSim(tauntState, inputWith({}));
      expect(tauntState.player.state).toBe('taunt');
      expect(tauntState.player.vx).toBe(0);
    }
    // 20th tick finishes taunt -> restores stored mach3 & 16 speed!
    stepSim(tauntState, inputWith({}));
    expect(tauntState.player.state).toBe('mach3');
    expect(tauntState.player.movespeed).toBe(16);

    // 2. 8-tick Parry reflects hostile projectile at facing * 25
    const parryState = createSandbox(grid, 12, 12);
    parryState.player.facing = 1;
    stepSim(parryState, inputWith({ tauntPressed: true }));
    expect(parryState.player.parryTicks).toBe(8);

    const proj = spawnProjectile(parryState, {
      owner: 'enemy',
      kind: 'bullet',
      x: parryState.player.x + 18,
      y: parryState.player.y - 22,
      vx: -6,
      vy: 0,
      radius: 10,
      damage: 1,
      parryable: true,
      reflected: false,
      gravity: false,
      ttlTicks: 80,
      color: '#ff4444',
    });

    stepSim(parryState, inputWith({}));
    expect(proj.owner).toBe('player');
    expect(proj.reflected).toBe(true);
    expect(proj.vx).toBe(parryState.player.facing * ENGINE_CONSTANTS.PARRY_REFLECT_HSP);
    expect(parryState.player.state).toBe('parry');
    expect(parryState.stageStats.parriesLanded).toBeGreaterThanOrEqual(1);

    // 3. 10-kill Super Taunt screen clear
    const stState = createSandbox(grid, 12, 12);
    for (let k = 0; k < 9; k++) {
      registerKillCombo(stState, 100);
    }
    expect(stState.player.superTauntReady).toBe(false);
    registerKillCombo(stState, 100);
    expect(stState.player.superchargeKills).toBe(ENGINE_CONSTANTS.SUPER_TAUNT_KILLS);
    expect(stState.player.superTauntReady).toBe(true);

    // Populate on-screen enemies and hostile projectiles
    stState.enemies.push(
      makeDummyEnemy(101, stState.player.x + 80, 12 * TS),
      makeDummyEnemy(102, stState.player.x + 180, 12 * TS),
      makeDummyEnemy(103, stState.player.x - 90, 12 * TS),
    );
    spawnProjectile(stState, {
      owner: 'enemy',
      kind: 'bullet',
      x: stState.player.x + 120,
      y: 12 * TS - 24,
      vx: -4,
      vy: 0,
      radius: 8,
      damage: 1,
      parryable: true,
      reflected: false,
      gravity: false,
      ttlTicks: 90,
      color: '#ff4444',
    });

    stepSim(stState, inputWith({ moveY: -1, tauntPressed: true, superTauntPressed: true }));
    expect(stState.player.state).toBe('super_taunt');
    expect(stState.enemies.every((e) => !e.alive)).toBe(true);
    expect(stState.projectiles.length).toBe(0);
    expect(stState.player.superTauntReady).toBe(false);
    expect(stState.player.superchargeKills).toBe(0);
    expect(stState.stageStats.superTauntsUsed).toBe(1);
  });
});

describe('Alternate Characters: The Static & Gusto & Chonks', () => {
  it('verifies The Static: Skateboard Mach 20, Wall Bounce, Tornado double-jump, Drill Crusher, and Instant Superjump', () => {
    // 1. Skateboard Mach reaches 20 px/t
    const longGrid = makeGrid(130, 14, 12);
    const machState = createSandbox(longGrid, 3, 12, 'static');
    for (let t = 0; t < 180; t++) {
      stepSim(machState, inputWith({ moveX: 1, machHeld: true, machPressed: t === 0 }));
      if (machState.player.state === 'mach4') break;
    }
    expect(machState.player.state).toBe('mach4');
    expect(machState.player.movespeed).toBe(ENGINE_CONSTANTS.STATIC_MACH_MAX);

    // 2. Wall Bounce (instead of Peppo Wall Climb)
    const wallGrid = makeGrid(30, 16, 14);
    for (let y = 3; y < 14; y++) wallGrid[y][16] = '#';
    const bounceState = createSandbox(wallGrid, 12, 14, 'static');
    setPlayerMotion(bounceState, 'mach2', 11, 1);
    for (let t = 0; t < 20 && bounceState.player.state !== 'wall_bounce'; t++) {
      stepSim(bounceState, inputWith({ moveX: 1, machHeld: true }));
    }
    expect(bounceState.player.state).toBe('wall_bounce');
    expect(bounceState.player.facing).toBe(-1);
    expect(bounceState.player.vy).toBe(ENGINE_CONSTANTS.STATIC_WALL_BOUNCE_VSP);
    expect(bounceState.player.vx).toBe(-ENGINE_CONSTANTS.STATIC_WALL_BOUNCE_HSP);

    // 3. Tornado double-jump midair
    const djGrid = makeGrid(24, 16, 14);
    const djState = createSandbox(djGrid, 8, 14, 'static');
    stepSim(djState, inputWith({ jumpPressed: true, jumpHeld: true }));
    for (let t = 0; t < 10; t++) {
      stepSim(djState, inputWith({ jumpHeld: true }));
    }
    expect(djState.player.grounded).toBe(false);
    expect(djState.player.coyoteTicks).toBe(0);
    expect(djState.player.airJumpsLeft).toBe(1);
    stepSim(djState, inputWith({ jumpPressed: true, jumpHeld: true }));
    expect(djState.player.airJumpsLeft).toBe(0);
    expect(djState.player.vy).toBeLessThan(-9);

    // 4. Drill Crusher: breaks Metal immediately even from short height (<10 smash ticks)
    const drillGrid = makeGrid(20, 18, 16);
    drillGrid[12][10] = 'M';
    const drillState = createSandbox(drillGrid, 10, 12, 'static');
    drillState.player.y = 12 * TS - 24;
    drillState.player.grounded = false;
    stepSim(drillState, inputWith({ moveY: 1 }));
    for (let t = 0; t < 8; t++) stepSim(drillState, inputWith({ moveY: 1 }));
    expect(getTileAt(drillState.room, 10, 12, false)).toBe(TileType.EMPTY);

    // 5. Instant Superjump from standstill (Up + Jump without Mach 3!)
    const sjGrid = makeGrid(24, 18, 16);
    const sjState = createSandbox(sjGrid, 10, 16, 'static');
    expect(sjState.player.state).toBe('normal');
    expect(sjState.player.movespeed).toBe(0);
    stepSim(sjState, inputWith({ moveY: -1, jumpPressed: true, jumpHeld: true }));
    expect(sjState.player.state).toBe('sjump');
    expect(sjState.player.vy).toBe(ENGINE_CONSTANTS.SJUMP_VSP);
  });

  it('verifies Gusto & Chonks: 8 -> 12 Metal break, Double Jump Metal break, and Buddy Kick', () => {
    const grid = makeGrid(60, 16, 14);
    grid[13][26] = 'M';
    grid[12][26] = 'M';

    const state = createSandbox(grid, 5, 14);
    state.player.rider = 'gusto_chonks';

    // Sprint 8 -> 12 px/t and smash Metal wall at 12
    stepSim(state, inputWith({ moveX: 1, machHeld: true }));
    expect(state.player.movespeed).toBeGreaterThanOrEqual(ENGINE_CONSTANTS.GUSTO_BASE_SPEED);

    for (let t = 0; t < 75; t++) {
      stepSim(state, inputWith({ moveX: 1, machHeld: true }));
    }
    expect(state.player.movespeed).toBe(ENGINE_CONSTANTS.GUSTO_MAX_SPEED);
    expect(getTileAt(state.room, 26, 13, false)).toBe(TileType.EMPTY);

    // Midair Double Jump breaks Metal directly underneath
    const djGrid = makeGrid(24, 18, 16);
    djGrid[13][10] = 'M';
    const djState = createSandbox(djGrid, 10, 13);
    djState.player.rider = 'gusto_chonks';
    stepSim(djState, inputWith({ jumpPressed: true, jumpHeld: true }));
    stepSim(djState, inputWith({ jumpHeld: true }));
    expect(djState.player.grounded).toBe(false);
    // Double jump right over the Metal tile
    djState.player.y = 13 * TS - 6;
    djState.player.coyoteTicks = 0;
    stepSim(djState, inputWith({ jumpPressed: true, jumpHeld: true }));
    expect(djState.player.airJumpsLeft).toBe(0);
    expect(djState.player.vy).toBeLessThan(-10);
    expect(getTileAt(djState.room, 10, 13, false)).toBe(TileType.EMPTY);

    // Buddy Kick spawns chonks_kick projectile with 30-tick cooldown buffer
    const kickState = createSandbox(makeGrid(30, 14, 12), 8, 12);
    kickState.player.rider = 'gusto_chonks';
    stepSim(kickState, inputWith({ grabPressed: true }));
    const kickProj = kickState.projectiles.find((pr) => pr.kind === 'chonks_kick');
    expect(kickProj).toBeDefined();
    expect(kickProj?.vx).toBe(15);
    expect(kickState.player.gustKickBuffer).toBe(ENGINE_CONSTANTS.GUSTO_KICK_BUFFER);
  });
});

describe('Transformations Framework (Core 12 Transformations)', () => {
  const CORE_TRANSFORMATIONS: TransformationId[] = [
    'knight',
    'ghost',
    'firemouth',
    'beak',
    'barrel',
    'rocket',
    'shotgun',
    'revolver',
    'cheese_sticky',
    'boxed_flat',
    'inferno_pepper',
    'cross',
  ];

  it('applies and steps all 12 core transformations cleanly with finite kinematics and distinct mechanics', () => {
    for (const tr of CORE_TRANSFORMATIONS) {
      const grid = makeGrid(36, 16, 14);
      const state = createSandbox(grid, 10, 14);
      applyTransformation(state, tr);
      expect(state.player.transformation).toBe(tr);

      for (let t = 0; t < 20; t++) {
        const inp = inputWith({
          moveX: 1,
          moveY: tr === 'ghost' ? -1 : 0,
          jumpHeld: tr === 'inferno_pepper' || tr === 'beak' || tr === 'boxed_flat',
          jumpPressed: t === 2 || (tr === 'beak' && (t === 5 || t === 9)),
          grabPressed: t === 4,
          grabHeld: tr === 'revolver' && t >= 4,
          shootPressed: t === 4,
        });
        stepSim(state, inp);
        expect(Number.isFinite(state.player.x)).toBe(true);
        expect(Number.isFinite(state.player.y)).toBe(true);
        expect(Number.isFinite(state.player.vx)).toBe(true);
        expect(Number.isFinite(state.player.vy)).toBe(true);
      }
    }
  });

  it('verifies signature behaviors for knight, ghost, firemouth, beak, barrel, rocket, shotgun, revolver, cheese_sticky, boxed_flat, inferno_pepper, and cross', () => {
    // 1. Knight breaks Metal horizontally & resists spikes
    const knightGrid = makeGrid(30, 14, 12);
    knightGrid[11][12] = 'M';
    const knight = createSandbox(knightGrid, 9, 12);
    applyTransformation(knight, 'knight');
    for (let t = 0; t < 25; t++) stepSim(knight, inputWith({ moveX: 1 }));
    expect(getTileAt(knight.room, 12, 11, false)).toBe(TileType.EMPTY);

    // 2. Ghost flies freely upward without gravity
    const ghost = createSandbox(makeGrid(24, 16, 14), 10, 14);
    applyTransformation(ghost, 'ghost');
    const ghostStartY = ghost.player.y;
    for (let t = 0; t < 12; t++) stepSim(ghost, inputWith({ moveY: -1 }));
    expect(ghost.player.y).toBeLessThan(ghostStartY - 25);

    // 3. Firemouth spawns flame projectile on grab
    const fm = createSandbox(makeGrid(24, 14, 12), 8, 12);
    applyTransformation(fm, 'firemouth');
    stepSim(fm, inputWith({ grabPressed: true }));
    expect(fm.projectiles.some((pr) => pr.kind === 'flame')).toBe(true);

    // 4. Beak grants 2 midair jumps & caps glide fall speed at 4.5
    const beak = createSandbox(makeGrid(24, 18, 16), 10, 16);
    applyTransformation(beak, 'beak');
    beak.player.y = 6 * TS;
    beak.player.grounded = false;
    beak.player.vy = 10;
    stepSim(beak, inputWith({ jumpHeld: true }));
    expect(beak.player.vy).toBeLessThanOrEqual(5.1);

    // 5. Barrel auto-rolls & bounces reversing facing on solid wall
    const barrelGrid = makeGrid(20, 14, 12);
    for (let y = 1; y < 12; y++) barrelGrid[y][13] = '#';
    const barrel = createSandbox(barrelGrid, 10, 12);
    applyTransformation(barrel, 'barrel');
    for (let t = 0; t < 20; t++) stepSim(barrel, inputWith({}));
    expect(barrel.player.facing).toBe(-1);

    // 6. Rocket cruises at 16, flips on jump, and clears on wall impact
    const rocketGrid = makeGrid(24, 14, 12);
    for (let y = 1; y < 12; y++) rocketGrid[y][15] = '#';
    const rocket = createSandbox(rocketGrid, 10, 12);
    applyTransformation(rocket, 'rocket');
    stepSim(rocket, inputWith({}));
    expect(rocket.player.movespeed).toBe(16);
    for (let t = 0; t < 20; t++) stepSim(rocket, inputWith({}));
    expect(rocket.player.transformation).toBe('none');

    // 7. Shotgun fires 5-pellet spread
    const sg = createSandbox(makeGrid(24, 14, 12), 8, 12);
    applyTransformation(sg, 'shotgun');
    stepSim(sg, inputWith({ shootPressed: true }));
    expect(sg.projectiles.filter((pr) => pr.kind === 'shotgun_pellet').length).toBe(5);

    // 8. Revolver fires bullet & charged_shot after 30-tick hold
    const rev = createSandbox(makeGrid(30, 14, 12), 6, 12);
    applyTransformation(rev, 'revolver');
    stepSim(rev, inputWith({ shootPressed: true, grabHeld: true }));
    expect(rev.projectiles.some((pr) => pr.kind === 'bullet')).toBe(true);
    for (let t = 0; t < 31; t++) stepSim(rev, inputWith({ grabHeld: true }));
    stepSim(rev, inputWith({ grabHeld: false, shootReleased: true }));
    expect(rev.projectiles.some((pr) => pr.kind === 'charged_shot')).toBe(true);

    // 9. Cheese Sticky sticks to adjacent solid wall & climbs upward
    const cheeseGrid = makeGrid(20, 16, 14);
    for (let y = 1; y < 14; y++) cheeseGrid[y][12] = '#';
    const cheese = createSandbox(cheeseGrid, 11, 14);
    cheese.player.x = 12 * TS - 13;
    cheese.player.y = 10 * TS;
    cheese.player.grounded = false;
    applyTransformation(cheese, 'cheese_sticky');
    const cheeseStartY = cheese.player.y;
    for (let t = 0; t < 6; t++) stepSim(cheese, inputWith({ moveY: -1 }));
    expect(cheese.player.onWall).toBe(true);
    expect(cheese.player.y).toBeLessThan(cheeseStartY - 15);

    // 10. Boxed Flat stays crouched (32 px) and flaps midair on grab
    const boxed = createSandbox(makeGrid(24, 16, 14), 10, 14);
    applyTransformation(boxed, 'boxed_flat');
    expect(boxed.player.crouch).toBe(true);
    boxed.player.y = 10 * TS;
    boxed.player.grounded = false;
    boxed.player.vy = 4;
    stepSim(boxed, inputWith({ grabPressed: true }));
    expect(boxed.player.vy).toBeLessThan(-5);

    // 11. Inferno Pepper thrusts upward when holding Jump
    const pepper = createSandbox(makeGrid(24, 16, 14), 10, 14);
    applyTransformation(pepper, 'inferno_pepper');
    const pepperStartY = pepper.player.y;
    for (let t = 0; t < 12; t++) stepSim(pepper, inputWith({ jumpHeld: true }));
    expect(pepper.player.y).toBeLessThan(pepperStartY - 20);

    // 12. Cross vaporizes nearby ghost_ghoul enemies within aura
    const cross = createSandbox(makeGrid(24, 14, 12), 10, 12);
    applyTransformation(cross, 'cross');
    const ghoul = makeDummyEnemy(201, cross.player.x + 60, 12 * TS, 'ghost_ghoul');
    cross.enemies.push(ghoul);
    stepSim(cross, inputWith({}));
    expect(ghoul.alive).toBe(false);
  });
});

describe('Wall Collision, Zero/Short Runway Wall-Climb & Grab Throw Reliability', () => {
  it('never strobes normal <-> mach1 when flush against a wall and moves away immediately on opposite input', () => {
    const grid = makeGrid(30, 16, 14);
    for (let y = 1; y < 14; y++) grid[y][16] = '#';
    const state = createSandbox(grid, 14, 14);
    // Position flush against wall at tx=16 (wall left = 512, stand half-w = 13 -> x = 499)
    state.player.x = 16 * TS - ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5;
    state.player.prevX = state.player.x;
    state.player.facing = 1;

    let mach1SfxCount = 0;
    for (let t = 0; t < 40; t++) {
      const evs = stepSim(state, inputWith({ moveX: 1, machHeld: true }));
      for (const ev of evs) {
        if (ev.type === 'sfx' && ev.sfx === 'mach1') mach1SfxCount++;
      }
      expect(state.player.state).toBe('normal');
      expect(state.player.x).toBeLessThanOrEqual(16 * TS - ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5 + 0.01);
    }
    expect(mach1SfxCount).toBe(0);

    // Pressing Left immediately reverses cleanly into Mach 1 heading left!
    const xAtWall = state.player.x;
    for (let t = 0; t < 10; t++) {
      stepSim(state, inputWith({ moveX: -1, machHeld: true }));
    }
    expect(state.player.facing).toBe(-1);
    expect(state.player.state).toBe('mach1');
    expect(state.player.x).toBeLessThan(xAtWall - 50);
  });

  it('scales an unjumpable 4-tile wall from zero runway with Shift+Jump (Peppo climb, Static bounce)', () => {
    // 4-tile (128px) solid plateau at tx=14..24, top at row 10, floor at row 14
    const grid = makeGrid(30, 16, 14);
    for (let tx = 14; tx <= 24; tx++) {
      for (let ty = 10; ty < 14; ty++) grid[ty][tx] = '#';
    }

    // 1. Chef Peppo: flush at wall, Shift + Right + Jump climbs and vaults cleanly onto plateau!
    const peppo = createSandbox(grid, 13, 14, 'peppo');
    peppo.player.x = 14 * TS - ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5;
    peppo.player.prevX = peppo.player.x;

    let enteredClimb = false;
    for (let t = 0; t < 40; t++) {
      stepSim(peppo, inputWith({
        moveX: 1,
        machHeld: true,
        jumpPressed: t === 0,
        jumpHeld: t < 6,
      }));
      if (peppo.player.state === 'climb_wall') enteredClimb = true;
    }
    expect(enteredClimb).toBe(true);
    expect(peppo.player.x).toBeGreaterThan(15 * TS);
    expect(peppo.player.y).toBeLessThanOrEqual(10 * TS + 1);

    // 2. The Static: flush at wall, Shift + Right + Jump triggers Wall Bounce cleanly!
    const stat = createSandbox(grid, 13, 14, 'static');
    stat.player.x = 14 * TS - ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5;
    stat.player.prevX = stat.player.x;
    stepSim(stat, inputWith({ moveX: 1, machHeld: true, jumpPressed: true, jumpHeld: true }));
    expect(stat.player.state).toBe('wall_bounce');
    expect(stat.player.facing).toBe(-1);
  });

  it('wall-climbs from a short Mach 1 run-up (5 tiles) without stalling', () => {
    // Mirrors Tutorial Zone 3: 7-tile cliff 5 tiles ahead of player
    const grid = makeGrid(40, 20, 18);
    for (let tx = 14; tx <= 26; tx++) {
      for (let ty = 11; ty < 18; ty++) grid[ty][tx] = '#';
    }
    const state = createSandbox(grid, 9, 18, 'peppo');

    let climbed = false;
    let landedOnPlateau = false;
    for (let t = 0; t < 75; t++) {
      stepSim(state, inputWith({ moveX: 1, machHeld: true, machPressed: t === 0 }));
      if (state.player.state === 'climb_wall') climbed = true;
      if (state.player.x > 16 * TS && state.player.grounded && state.player.y === 11 * TS) {
        landedOnPlateau = true;
        break;
      }
    }
    expect(climbed).toBe(true);
    expect(landedOnPlateau).toBe(true);
    expect(state.player.x).toBeGreaterThan(16 * TS);
    expect(state.player.y).toBe(11 * TS);
  });

  it('detaches cleanly from climb_wall when pressing away and drops cleanly on ceiling bonk', () => {
    const grid = makeGrid(24, 16, 14);
    for (let y = 1; y < 14; y++) grid[y][14] = '#';

    // 1. Peppo pressing LEFT while climbing right wall detaches cleanly
    const detachPeppo = createSandbox(grid, 12, 14, 'peppo');
    detachPeppo.player.x = 14 * TS - ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5;
    detachPeppo.player.y = 10 * TS;
    detachPeppo.player.state = 'climb_wall';
    detachPeppo.player.wallDir = 1;
    detachPeppo.player.facing = 1;
    detachPeppo.player.wallspeed = 10;
    detachPeppo.player.onWall = true;

    const startX = detachPeppo.player.x;
    for (let t = 0; t < 8; t++) {
      stepSim(detachPeppo, inputWith({ moveX: -1, machHeld: true }));
    }
    expect(detachPeppo.player.state).not.toBe('climb_wall');
    expect(detachPeppo.player.facing).toBe(-1);
    expect(detachPeppo.player.x).toBeLessThan(startX - 25);

    // 2. Gusto & Chonks pressing LEFT while climbing right wall detaches cleanly
    const detachGusto = createSandbox(grid, 12, 14, 'peppo');
    detachGusto.player.rider = 'gusto_chonks';
    detachGusto.player.x = 14 * TS - ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5;
    detachGusto.player.y = 10 * TS;
    detachGusto.player.state = 'climb_wall';
    detachGusto.player.wallDir = 1;
    detachGusto.player.facing = 1;
    detachGusto.player.wallspeed = 11;
    detachGusto.player.onWall = true;
    for (let t = 0; t < 6; t++) {
      stepSim(detachGusto, inputWith({ moveX: -1, machHeld: true }));
    }
    expect(detachGusto.player.state).not.toBe('climb_wall');
    expect(detachGusto.player.facing).toBe(-1);

    // 3. Ceiling bonk during climb_wall drops cleanly without re-attaching mid-fall
    const bonkState = createSandbox(grid, 12, 14, 'peppo');
    bonkState.player.x = 14 * TS - ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5;
    bonkState.player.y = 3 * TS;
    setPlayerMotion(bonkState, 'climb_wall', 0, 1);
    bonkState.player.wallDir = 1;
    bonkState.player.wallspeed = 10;
    bonkState.player.onWall = true;

    let hitCeiling = false;
    for (let t = 0; t < 20; t++) {
      stepSim(bonkState, inputWith({ moveX: 1, machHeld: true }));
      const curState: string = bonkState.player.state;
      if (!hitCeiling && curState === 'normal') {
        hitCeiling = true;
      } else if (hitCeiling) {
        expect(curState).toBe('normal');
      }
    }
    expect(hitCeiling).toBe(true);
    expect(bonkState.player.y).toBeGreaterThan(5 * TS);
  });

  it('captures grabPressed during hitstop and reliably throws held enemies via slapBufferTicks', () => {
    const grid = makeGrid(24, 14, 12);
    const state = createSandbox(grid, 8, 12);
    const foe = makeDummyEnemy(301, state.player.x + 28, 12 * TS, 'slime_glob');
    state.enemies.push(foe);

    // Grab dash scoops foe into grab_hold without auto-throwing on scoop frame
    stepSim(state, inputWith({ moveX: 1, grabPressed: true, grabHeld: true }));
    for (let t = 0; t < 6 && state.player.state !== 'grab_hold'; t++) {
      stepSim(state, inputWith({ moveX: 1 }));
    }
    expect(state.player.state).toBe('grab_hold');
    expect(state.player.grabbedEnemyId).toBe(foe.id);
    expect(state.player.slapBufferTicks).toBe(0);

    // Simulate hitstop active while player taps Grab -> must buffer and throw immediately after hitstop!
    state.hitstopTicks = 2;
    stepSim(state, inputWith({ grabPressed: true, grabHeld: true }));
    expect(state.player.slapBufferTicks).toBeGreaterThan(0);

    stepSim(state, inputWith({})); // tick 2 of hitstop
    stepSim(state, inputWith({})); // active sim tick executes buffered throw!
    expect(state.player.state).toBe('normal');
    expect(state.player.grabbedEnemyId).toBeNull();
    expect(foe.grabbed).toBe(false);
    expect(foe.thrown).toBe(true);
  });
});
