import { describe, expect, it } from 'vitest';
import {
  createNeutralInput,
  type InputFrame,
  type PlayableCharacter,
  type SimState,
} from '../src/contracts/index';
import { createInitialSimState, dispatchCommand, stepSim } from '../src/sim/step';
import { hashSimState } from '../src/sim/hash';
import { spawnProjectile } from '../src/sim/combat';

interface TapeMetrics {
  finalHash: string;
  checkpoints: string[];
  reachedMach4: boolean;
  wallActed: boolean;
  taunted: boolean;
  parried: boolean;
  blocksBroken: number;
  escapeEntered: boolean;
}

/**
 * Deterministic 600-tick complex scripted input tape exercising:
 * running, jumping, Mach 1->4 acceleration, breaking Marble/Metal blocks,
 * wall-climb (Peppo) / wall-bounce (Static), taunting, projectile parrying,
 * and Pillar Chronos / Krunk Time Escape activation.
 */
function buildScriptedInput(tick: number): InputFrame {
  const inp = createNeutralInput('keyboard');

  // Segment 1 (0..185): Full Mach 1 -> Mach 2 -> Mach 3 -> Mach 4 sprint right + jumps over ledges
  if (tick < 185) {
    inp.moveX = 1;
    inp.machHeld = true;
    inp.machPressed = tick === 0;
    if (tick === 65 || tick === 120 || tick === 160) {
      inp.jumpPressed = true;
      inp.jumpHeld = true;
    } else if (
      (tick > 65 && tick < 78) ||
      (tick > 120 && tick < 134) ||
      (tick > 160 && tick < 172)
    ) {
      inp.jumpHeld = true;
    }
    return inp;
  }

  // Segment 2 (185..215): Taunt + Parry an incoming hostile projectile
  if (tick === 190) {
    inp.tauntPressed = true;
    return inp;
  }
  if (tick < 215) {
    inp.moveX = 1;
    inp.machHeld = true;
    return inp;
  }

  // Segment 3 (215..295): Mach sprint into wall to trigger Wall Climb (Peppo) or Wall Bounce (Static) + kick-off
  if (tick < 295) {
    inp.moveX = 1;
    inp.machHeld = true;
    if (tick === 248 || tick === 278) {
      inp.jumpPressed = true;
      inp.jumpHeld = true;
    } else if ((tick > 248 && tick < 258) || (tick > 278 && tick < 288)) {
      inp.jumpHeld = true;
    }
    return inp;
  }

  // Segment 4 (295..360): Grab Dash + Uppercut + Bodyslam combo
  if (tick === 300) {
    inp.moveX = -1;
    inp.grabPressed = true;
    inp.grabHeld = true;
    return inp;
  }
  if (tick === 325) {
    inp.moveY = -1;
    inp.grabPressed = true;
    return inp;
  }
  if (tick >= 338 && tick < 355) {
    inp.moveY = 1; // Bodyslam!
    return inp;
  }

  // Segment 5 (360..460): Escape active — sprint back left with Mach Roll & jumps
  if (tick < 460) {
    inp.moveX = -1;
    inp.machHeld = true;
    if (tick >= 400 && tick < 420) {
      inp.moveY = 1; // Mach Roll
    }
    if (tick === 430) {
      inp.jumpPressed = true;
      inp.jumpHeld = true;
    } else if (tick > 430 && tick < 444) {
      inp.jumpHeld = true;
    }
    return inp;
  }

  // Segment 6 (460..600): Mach Drift turnaround back right + Escape Taunt + full speed push
  if (tick === 510) {
    inp.tauntPressed = true;
    return inp;
  }
  inp.moveX = 1;
  inp.machHeld = true;
  if (tick === 550) {
    inp.jumpPressed = true;
    inp.jumpHeld = true;
  } else if (tick > 550 && tick < 562) {
    inp.jumpHeld = true;
  }
  return inp;
}

function runDeterminismTape(character: PlayableCharacter, seed: number, perturbTick?: number): TapeMetrics {
  const state: SimState = createInitialSimState(seed, character);
  dispatchCommand(state, { type: 'enter_stage', stageId: 'entrance' });

  const checkpoints: string[] = [];
  let reachedMach4 = false;
  let wallActed = false;
  let taunted = false;
  let parried = false;
  let escapeEntered = false;
  let maxBrokenCount = 0;

  for (let t = 0; t < 600; t++) {
    // Inject a deterministic parryable projectile aimed right at the player before tick 190 taunt
    if (t === 190) {
      state.player.facing = 1;
      spawnProjectile(state, {
        owner: 'enemy',
        kind: 'bullet',
        x: state.player.x + 20,
        y: state.player.y - 20,
        vx: -8,
        vy: 0,
        radius: 10,
        damage: 1,
        parryable: true,
        reflected: false,
        gravity: false,
        ttlTicks: 60,
        color: '#ff595e',
      });
    }

    // Trigger Escape (Pillar Chronos collapse) at tick 360 so escape countdown runs for the final 240 ticks
    if (t === 360) {
      dispatchCommand(state, { type: 'debug_trigger_escape' });
    }

    const input = buildScriptedInput(t);
    if (perturbTick !== undefined && t === perturbTick) {
      input.jumpPressed = !input.jumpPressed;
      input.jumpHeld = true;
    }

    stepSim(state, input);

    if (state.player.state === 'mach4' || state.player.movespeed >= 20) {
      reachedMach4 = true;
    }
    if (state.player.state === 'climb_wall' || state.player.state === 'wall_bounce') {
      wallActed = true;
    }
    if (state.player.state === 'taunt') {
      taunted = true;
    }
    if (state.stageStats.parriesLanded > 0) {
      parried = true;
    }
    if (state.escape.active) {
      escapeEntered = true;
    }

    let brokenNow = 0;
    const mask = state.room.brokenMask;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) brokenNow++;
    }
    if (brokenNow > maxBrokenCount) maxBrokenCount = brokenNow;

    if ((t + 1) % 60 === 0) {
      checkpoints.push(hashSimState(state));
    }
  }

  return {
    finalHash: hashSimState(state),
    checkpoints,
    reachedMach4,
    wallActed,
    taunted,
    parried,
    blocksBroken: maxBrokenCount,
    escapeEntered,
  };
}

describe('Deterministic 60 Hz Replay Verification (FNV-1a)', () => {
  it('produces bit-for-bit identical 600-tick FNV-1a state hashes for Chef Peppo across independent runs', () => {
    const runA = runDeterminismTape('peppo', 20260420);
    const runB = runDeterminismTape('peppo', 20260420);

    expect(runA.finalHash).toMatch(/^[0-9a-f]{8}$/);
    expect(runA.finalHash).toBe(runB.finalHash);
    expect(runA.checkpoints).toEqual(runB.checkpoints);

    // Ensure the tape genuinely exercised high-energy actions
    expect(runA.reachedMach4).toBe(true);
    expect(runA.wallActed).toBe(true);
    expect(runA.taunted).toBe(true);
    expect(runA.parried).toBe(true);
    expect(runA.blocksBroken).toBeGreaterThan(0);
    expect(runA.escapeEntered).toBe(true);
  });

  it('produces bit-for-bit identical 600-tick FNV-1a state hashes for The Static across independent runs', () => {
    const runA = runDeterminismTape('static', 987654321);
    const runB = runDeterminismTape('static', 987654321);

    expect(runA.finalHash).toMatch(/^[0-9a-f]{8}$/);
    expect(runA.finalHash).toBe(runB.finalHash);
    expect(runA.checkpoints).toEqual(runB.checkpoints);

    expect(runA.reachedMach4).toBe(true);
    expect(runA.wallActed).toBe(true);
    expect(runA.taunted).toBe(true);
    expect(runA.parried).toBe(true);
    expect(runA.blocksBroken).toBeGreaterThan(0);
    expect(runA.escapeEntered).toBe(true);
  });

  it('diverges cleanly when seed or a single input tick is altered', () => {
    const baseline = runDeterminismTape('peppo', 1337);
    const diffSeed = runDeterminismTape('peppo', 7331);
    const diffInput = runDeterminismTape('peppo', 1337, 42);

    expect(diffSeed.finalHash).not.toBe(baseline.finalHash);
    expect(diffInput.finalHash).not.toBe(baseline.finalHash);
  });
});
