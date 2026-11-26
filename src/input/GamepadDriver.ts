import { DeadzoneSettings, DEFAULT_DEADZONES } from '../contracts/index';

export interface GamepadSample {
  connected: boolean;
  activeThisFrame: boolean;
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  jumpHeld: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  grabHeld: boolean;
  grabPressed: boolean;
  grabReleased: boolean;
  machHeld: boolean;
  machPressed: boolean;
  tauntPressed: boolean;
  pausePressed: boolean;
  restartPressed: boolean;
  devDrawerPressed: boolean;
  confirmPressed: boolean;
  backPressed: boolean;
  navUpPressed: boolean;
  navDownPressed: boolean;
  navLeftPressed: boolean;
  navRightPressed: boolean;
}

export interface GamepadDriverCallbacks {
  onActivity?: () => void;
  onUserGesture?: () => void;
  onConnect?: (padName: string) => void;
  onDisconnect?: (padName: string) => void;
}

interface DualRumbleActuator {
  playEffect?: (
    type: 'dual-rumble',
    params: {
      startDelay: number;
      duration: number;
      weakMagnitude: number;
      strongMagnitude: number;
    },
  ) => Promise<string> | void;
}

type GamepadWithRumble = Gamepad & {
  vibrationActuator?: DualRumbleActuator;
};

interface PrevGamepadButtons {
  jump: boolean;
  grab: boolean;
  mach: boolean;
  taunt: boolean;
  pause: boolean;
  restart: boolean;
  devChord: boolean;
  confirm: boolean;
  back: boolean;
  navUp: boolean;
  navDown: boolean;
  navLeft: boolean;
  navRight: boolean;
}

function createEmptyPrev(): PrevGamepadButtons {
  return {
    jump: false,
    grab: false,
    mach: false,
    taunt: false,
    pause: false,
    restart: false,
    devChord: false,
    confirm: false,
    back: false,
    navUp: false,
    navDown: false,
    navLeft: false,
    navRight: false,
  };
}

function isBtnDown(gp: Gamepad, index: number, threshold = 0.5): boolean {
  const btn = gp.buttons[index];
  if (!btn) return false;
  return btn.pressed || btn.value > threshold;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export class GamepadDriver {
  private deadzones: DeadzoneSettings;
  private rumbleEnabled: boolean;
  private readonly callbacks: GamepadDriverCallbacks;
  private activePadIndex: number | null = null;
  private prev: PrevGamepadButtons = createEmptyPrev();
  private attached = false;

  private readonly handleConnected = (e: GamepadEvent): void => {
    this.activePadIndex = e.gamepad.index;
    const label = this.shortPadName(e.gamepad.id);
    this.callbacks.onConnect?.(label);
  };

  private readonly handleDisconnected = (e: GamepadEvent): void => {
    const label = this.shortPadName(e.gamepad.id);
    if (this.activePadIndex === e.gamepad.index) {
      this.activePadIndex = null;
      this.prev = createEmptyPrev();
    }
    this.callbacks.onDisconnect?.(label);
  };

  constructor(
    deadzones: DeadzoneSettings = DEFAULT_DEADZONES,
    rumbleEnabled = true,
    callbacks: GamepadDriverCallbacks = {},
  ) {
    this.deadzones = { ...deadzones };
    this.rumbleEnabled = rumbleEnabled;
    this.callbacks = callbacks;
    this.attach();
  }

  public attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', this.handleConnected);
    window.addEventListener('gamepaddisconnected', this.handleDisconnected);
    this.attached = true;
  }

  public setDeadzones(deadzones: DeadzoneSettings): void {
    this.deadzones = { ...deadzones };
  }

  public setRumbleEnabled(enabled: boolean): void {
    this.rumbleEnabled = Boolean(enabled);
  }

  public isConnected(): boolean {
    return this.getPrimaryGamepad() !== null;
  }

  private shortPadName(rawId: string): string {
    const cleaned = rawId.replace(/\s*\([^)]*\)/g, '').trim();
    if (!cleaned) return 'GAMEPAD';
    return cleaned.length > 28 ? `${cleaned.slice(0, 28)}…` : cleaned;
  }

  private getPrimaryGamepad(): GamepadWithRumble | null {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return null;
    }
    let pads: (Gamepad | null)[];
    try {
      pads = Array.from(navigator.getGamepads());
    } catch {
      return null;
    }

    if (this.activePadIndex !== null) {
      const preferred = pads[this.activePadIndex];
      if (preferred && preferred.connected) {
        return preferred as GamepadWithRumble;
      }
    }

    for (const pad of pads) {
      if (pad && pad.connected) {
        this.activePadIndex = pad.index;
        return pad as GamepadWithRumble;
      }
    }
    return null;
  }

  public poll(options?: { isHighMach?: boolean }): GamepadSample {
    const gp = this.getPrimaryGamepad();
    if (!gp) {
      this.prev = createEmptyPrev();
      return {
        connected: false,
        activeThisFrame: false,
        moveX: 0,
        moveY: 0,
        jumpHeld: false,
        jumpPressed: false,
        jumpReleased: false,
        grabHeld: false,
        grabPressed: false,
        grabReleased: false,
        machHeld: false,
        machPressed: false,
        tauntPressed: false,
        pausePressed: false,
        restartPressed: false,
        devDrawerPressed: false,
        confirmPressed: false,
        backPressed: false,
        navUpPressed: false,
        navDownPressed: false,
        navLeftPressed: false,
        navRightPressed: false,
      };
    }

    const dz = this.deadzones;
    const rawX = gp.axes[0] ?? 0;
    const rawY = gp.axes[1] ?? 0;
    const radial = Math.hypot(rawX, rawY);

    // D-Pad standard mapping (12=Up, 13=Down, 14=Left, 15=Right)
    const dUp = isBtnDown(gp, 12);
    const dDown = isBtnDown(gp, 13);
    const dLeft = isBtnDown(gp, 14);
    const dRight = isBtnDown(gp, 15);

    let stickX: -1 | 0 | 1 = 0;
    let stickY: -1 | 0 | 1 = 0;
    let stickActive = false;

    if (radial >= dz.general) {
      stickActive = true;
      const upThreshold = options?.isHighMach
        ? Math.max(dz.vertical, dz.superjump)
        : dz.vertical;

      if (rawY <= -upThreshold) {
        stickY = -1;
      } else if (rawY >= dz.vertical) {
        stickY = 1;
      }

      const horizThreshold = stickY === 1 ? Math.max(dz.horizontal, dz.crouchWalk) : dz.horizontal;
      if (rawX <= -horizThreshold) {
        stickX = -1;
      } else if (rawX >= horizThreshold) {
        stickX = 1;
      }
    }

    const moveX: -1 | 0 | 1 =
      dLeft && !dRight ? -1 : dRight && !dLeft ? 1 : stickX;
    const moveY: -1 | 0 | 1 =
      dUp && !dDown ? -1 : dDown && !dUp ? 1 : stickY;

    // Standard Xbox / DualSense / Tesla USB/BT mapping
    const aDown = isBtnDown(gp, 0);
    const bDown = isBtnDown(gp, 1);
    const xDown = isBtnDown(gp, 2);
    const yDown = isBtnDown(gp, 3);
    const lbDown = isBtnDown(gp, 4);
    const rbDown = isBtnDown(gp, 5);
    const ltDown = isBtnDown(gp, 6, 0.2);
    const rtDown = isBtnDown(gp, 7, 0.2);
    const viewDown = isBtnDown(gp, 8);
    const startDown = isBtnDown(gp, 9);
    const l3Down = isBtnDown(gp, 10);
    const r3Down = isBtnDown(gp, 11);

    const jumpHeld = aDown;
    const grabHeld = xDown || bDown;
    const machHeld = rtDown || rbDown || ltDown;
    const tauntHeld = yDown || lbDown;
    const pauseHeld = startDown;
    const restartHeld = viewDown;
    const devChordHeld = l3Down && r3Down;
    const confirmHeld = aDown;
    const backHeld = bDown;
    const navUpHeld = moveY === -1;
    const navDownHeld = moveY === 1;
    const navLeftHeld = moveX === -1;
    const navRightHeld = moveX === 1;

    let anyButtonPressed = false;
    for (let i = 0; i < gp.buttons.length; i++) {
      const b = gp.buttons[i];
      if (b && (b.pressed || b.value > 0.25)) {
        anyButtonPressed = true;
        break;
      }
    }

    const activeThisFrame = anyButtonPressed || stickActive;
    if (activeThisFrame) {
      this.callbacks.onUserGesture?.();
      this.callbacks.onActivity?.();
    }

    const sample: GamepadSample = {
      connected: true,
      activeThisFrame,
      moveX,
      moveY,
      jumpHeld,
      jumpPressed: jumpHeld && !this.prev.jump,
      jumpReleased: !jumpHeld && this.prev.jump,
      grabHeld,
      grabPressed: grabHeld && !this.prev.grab,
      grabReleased: !grabHeld && this.prev.grab,
      machHeld,
      machPressed: machHeld && !this.prev.mach,
      tauntPressed: tauntHeld && !this.prev.taunt,
      pausePressed: pauseHeld && !this.prev.pause,
      restartPressed: restartHeld && !this.prev.restart,
      devDrawerPressed: devChordHeld && !this.prev.devChord,
      confirmPressed: confirmHeld && !this.prev.confirm,
      backPressed: backHeld && !this.prev.back,
      navUpPressed: navUpHeld && !this.prev.navUp,
      navDownPressed: navDownHeld && !this.prev.navDown,
      navLeftPressed: navLeftHeld && !this.prev.navLeft,
      navRightPressed: navRightHeld && !this.prev.navRight,
    };

    this.prev = {
      jump: jumpHeld,
      grab: grabHeld,
      mach: machHeld,
      taunt: tauntHeld,
      pause: pauseHeld,
      restart: restartHeld,
      devChord: devChordHeld,
      confirm: confirmHeld,
      back: backHeld,
      navUp: navUpHeld,
      navDown: navDownHeld,
      navLeft: navLeftHeld,
      navRight: navRightHeld,
    };

    return sample;
  }

  public rumble(strong: number, weak: number, durationMs: number): void {
    if (!this.rumbleEnabled || durationMs <= 0) return;
    const gp = this.getPrimaryGamepad();
    if (!gp?.vibrationActuator?.playEffect) return;
    try {
      const result = gp.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: Math.max(16, Math.min(2000, Math.round(durationMs))),
        strongMagnitude: clamp01(strong),
        weakMagnitude: clamp01(weak),
      });
      if (result && typeof (result as Promise<string>).catch === 'function') {
        (result as Promise<string>).catch(() => {
          // Ignore unsupported browser rejection
        });
      }
    } catch {
      // Ignore unsupported actuator errors
    }
  }

  public dispose(): void {
    if (!this.attached || typeof window === 'undefined') return;
    window.removeEventListener('gamepadconnected', this.handleConnected);
    window.removeEventListener('gamepaddisconnected', this.handleDisconnected);
    this.attached = false;
  }
}
