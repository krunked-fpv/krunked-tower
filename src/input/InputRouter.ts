import {
  DeadzoneSettings,
  DEFAULT_DEADZONES,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_RENDER_SETTINGS,
  InputDeviceMode,
  InputFrame,
  KeyBindings,
  RenderSettings,
} from '../contracts/index';
import { GamepadDriver } from './GamepadDriver';
import { formatKeyCodeLabel, KeyboardMouseDriver } from './KeyboardMouseDriver';
import { TouchOverlay } from './TouchOverlay';

export type GlyphAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'move'
  | 'jump'
  | 'grab'
  | 'mach'
  | 'taunt'
  | 'pause'
  | 'restart'
  | 'confirm'
  | 'back';

export interface MenuNavState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
  pause: boolean;
  devDrawer: boolean;
}

export interface InputRouterCallbacks {
  onDeviceModeChange?: (mode: InputDeviceMode) => void;
  onUserGesture?: () => void;
  onGamepadConnect?: (padName: string) => void;
  onGamepadDisconnect?: (padName: string) => void;
  onToggleDevDrawer?: () => void;
  onTouchPauseTap?: () => void;
}

export interface InputRouterOptions {
  touchHost: HTMLElement | null;
  keyBindings?: KeyBindings;
  deadzones?: DeadzoneSettings;
  renderSettings?: RenderSettings;
  callbacks?: InputRouterCallbacks;
}

export class InputRouter {
  public readonly keyboard: KeyboardMouseDriver;
  public readonly gamepad: GamepadDriver;
  public readonly touch: TouchOverlay;

  private readonly callbacks: InputRouterCallbacks;
  private deviceMode: InputDeviceMode = 'keyboard';
  /** STRICT ZERO-VISIBILITY DEFAULT */
  private touchActive = false;
  private lastMenuNav: MenuNavState = {
    up: false,
    down: false,
    left: false,
    right: false,
    confirm: false,
    back: false,
    pause: false,
    devDrawer: false,
  };
  private attached = false;

  private readonly handleWindowTouchStart = (): void => {
    this.callbacks.onUserGesture?.();
    this.activateTouch();
  };

  private readonly handleWindowPointerDown = (e: PointerEvent): void => {
    this.callbacks.onUserGesture?.();
    if (e.pointerType === 'touch') {
      this.activateTouch();
    }
  };

  constructor(options: InputRouterOptions) {
    this.callbacks = options.callbacks ?? {};
    const renderSettings = options.renderSettings ?? DEFAULT_RENDER_SETTINGS;

    this.keyboard = new KeyboardMouseDriver(options.keyBindings ?? DEFAULT_KEY_BINDINGS, {
      onUserGesture: () => this.callbacks.onUserGesture?.(),
      onActivity: () => this.activateNonTouchMode('keyboard'),
    });

    this.gamepad = new GamepadDriver(
      options.deadzones ?? DEFAULT_DEADZONES,
      renderSettings.rumble,
      {
        onUserGesture: () => this.callbacks.onUserGesture?.(),
        onActivity: () => this.activateNonTouchMode('gamepad'),
        onConnect: (name) => this.callbacks.onGamepadConnect?.(name),
        onDisconnect: (name) => this.callbacks.onGamepadDisconnect?.(name),
      },
    );

    this.touch = new TouchOverlay(options.touchHost, {
      opacity: renderSettings.touchOpacity,
      machLockDefault: renderSettings.touchMachLockDefault,
      onPauseTap: () => this.callbacks.onTouchPauseTap?.(),
    });

    // Enforce zero-visibility default explicitly
    this.touchActive = false;
    this.touch.setVisible(false);

    this.attachTouchListeners();
  }

  private attachTouchListeners(): void {
    if (this.attached || typeof window === 'undefined') return;
    window.addEventListener('touchstart', this.handleWindowTouchStart, {
      capture: true,
      passive: true,
    });
    window.addEventListener('pointerdown', this.handleWindowPointerDown, {
      capture: true,
      passive: true,
    });
    this.attached = true;
  }

  private activateTouch(): void {
    const modeChanged = this.deviceMode !== 'touch' || !this.touchActive;
    this.touchActive = true;
    this.deviceMode = 'touch';
    this.touch.setVisible(true);
    if (modeChanged) {
      this.callbacks.onDeviceModeChange?.('touch');
    }
  }

  private activateNonTouchMode(mode: 'keyboard' | 'gamepad'): void {
    const modeChanged = this.deviceMode !== mode || this.touchActive;
    if (this.touchActive) {
      this.touchActive = false;
      this.touch.setVisible(false);
    }
    this.deviceMode = mode;
    if (modeChanged) {
      this.callbacks.onDeviceModeChange?.(mode);
    }
  }

  public simulateTouch(active: boolean): void {
    if (active) {
      this.activateTouch();
    } else {
      this.activateNonTouchMode('keyboard');
    }
  }

  public isTouchActive(): boolean {
    return this.touchActive && this.touch.isVisible();
  }

  public getDeviceMode(): InputDeviceMode {
    return this.deviceMode;
  }

  public setKeyBindings(bindings: KeyBindings): void {
    this.keyboard.setBindings(bindings);
  }

  public setDeadzones(deadzones: DeadzoneSettings): void {
    this.gamepad.setDeadzones(deadzones);
  }

  public applyRenderSettings(settings: RenderSettings): void {
    this.touch.setOpacity(settings.touchOpacity);
    this.touch.setMachLockDefault(settings.touchMachLockDefault);
    this.gamepad.setRumbleEnabled(settings.rumble);
  }

  public rumble(strong: number, weak: number, durationMs: number): void {
    this.gamepad.rumble(strong, weak, durationMs);
  }

  public poll(options?: { isHighMach?: boolean; hasWeapon?: boolean }): InputFrame {
    const kb = this.keyboard.sample();
    const gp = this.gamepad.poll({ isHighMach: options?.isHighMach });
    const tc = this.touch.sample();

    const kbMoveX: -1 | 0 | 1 = kb.left && !kb.right ? -1 : kb.right && !kb.left ? 1 : 0;
    const kbMoveY: -1 | 0 | 1 = kb.up && !kb.down ? -1 : kb.down && !kb.up ? 1 : 0;

    const moveX: -1 | 0 | 1 =
      kbMoveX !== 0 ? kbMoveX : gp.moveX !== 0 ? gp.moveX : tc.moveX;
    const moveY: -1 | 0 | 1 =
      kbMoveY !== 0 ? kbMoveY : gp.moveY !== 0 ? gp.moveY : tc.moveY;

    const jumpHeld = kb.jumpHeld || gp.jumpHeld || tc.jumpHeld;
    const jumpPressed = kb.jumpPressed || gp.jumpPressed || tc.jumpPressed;
    const jumpReleased = kb.jumpReleased || gp.jumpReleased || tc.jumpReleased;

    const grabHeld = kb.grabHeld || gp.grabHeld || tc.grabHeld;
    const grabPressed = kb.grabPressed || gp.grabPressed || tc.grabPressed;
    const grabReleased = kb.grabReleased || gp.grabReleased || tc.grabReleased;

    const machHeld = kb.machHeld || gp.machHeld || tc.machHeld;
    const machPressed = kb.machPressed || gp.machPressed || tc.machPressed;

    const tauntPressed = kb.tauntPressed || gp.tauntPressed || tc.tauntPressed;
    const superTauntPressed = tauntPressed && moveY === -1;

    const pausePressed = kb.pausePressed || gp.pausePressed || tc.pausePressed;
    const restartPressed = kb.restartPressed || gp.restartPressed;
    const devDrawerPressed = kb.devDrawerPressed || gp.devDrawerPressed;

    if (devDrawerPressed) {
      this.callbacks.onToggleDevDrawer?.();
    }

    this.lastMenuNav = {
      up: kb.navUpPressed || gp.navUpPressed,
      down: kb.navDownPressed || gp.navDownPressed,
      left: kb.navLeftPressed || gp.navLeftPressed,
      right: kb.navRightPressed || gp.navRightPressed,
      confirm: kb.confirmPressed || gp.confirmPressed,
      back: kb.backPressed || gp.backPressed,
      pause: pausePressed,
      devDrawer: devDrawerPressed,
    };

    return {
      moveX,
      moveY,
      jumpHeld,
      jumpPressed,
      jumpReleased,
      grabHeld,
      grabPressed,
      machHeld,
      machPressed,
      tauntPressed,
      superTauntPressed,
      shootPressed: grabPressed,
      shootReleased: grabReleased,
      pausePressed,
      restartPressed,
      deviceMode: this.deviceMode,
    };
  }

  public getLastMenuNav(): MenuNavState {
    return this.lastMenuNav;
  }

  public getGlyphText(action: GlyphAction): string {
    return getActionGlyphText(action, this.deviceMode, this.keyboard.getBindings());
  }

  public renderGlyphHtml(action: GlyphAction): string {
    return renderActionGlyphHtml(action, this.deviceMode, this.keyboard.getBindings());
  }

  public dispose(): void {
    if (this.attached && typeof window !== 'undefined') {
      window.removeEventListener('touchstart', this.handleWindowTouchStart, { capture: true });
      window.removeEventListener('pointerdown', this.handleWindowPointerDown, { capture: true });
      this.attached = false;
    }
    this.keyboard.dispose();
    this.gamepad.dispose();
    this.touch.dispose();
  }
}

export function getActionGlyphText(
  action: GlyphAction,
  mode: InputDeviceMode,
  bindings: KeyBindings = DEFAULT_KEY_BINDINGS,
): string {
  if (mode === 'gamepad') {
    switch (action) {
      case 'left':
        return '◀';
      case 'right':
        return '▶';
      case 'up':
        return '▲';
      case 'down':
        return '▼';
      case 'move':
        return 'L-STICK';
      case 'jump':
      case 'confirm':
        return 'A';
      case 'grab':
        return 'X';
      case 'back':
        return 'B';
      case 'mach':
        return 'RT';
      case 'taunt':
        return 'Y';
      case 'pause':
        return 'START';
      case 'restart':
        return 'VIEW';
    }
  }

  if (mode === 'touch') {
    switch (action) {
      case 'left':
        return '◀';
      case 'right':
        return '▶';
      case 'up':
        return '▲';
      case 'down':
        return '▼';
      case 'move':
        return 'STICK';
      case 'jump':
      case 'confirm':
        return 'J';
      case 'grab':
      case 'back':
        return 'G';
      case 'mach':
        return 'M';
      case 'taunt':
        return 'T';
      case 'pause':
        return '||';
      case 'restart':
        return 'MENU';
    }
  }

  // Keyboard mode
  switch (action) {
    case 'left':
      return formatKeyCodeLabel(bindings.left);
    case 'right':
      return formatKeyCodeLabel(bindings.right);
    case 'up':
      return formatKeyCodeLabel(bindings.up);
    case 'down':
      return formatKeyCodeLabel(bindings.down);
    case 'move':
      return 'ARROWS';
    case 'jump':
    case 'confirm':
      return formatKeyCodeLabel(bindings.jump);
    case 'grab':
      return formatKeyCodeLabel(bindings.grab);
    case 'mach':
      return formatKeyCodeLabel(bindings.mach);
    case 'taunt':
      return formatKeyCodeLabel(bindings.taunt);
    case 'pause':
    case 'back':
      return formatKeyCodeLabel(bindings.pause);
    case 'restart':
      return formatKeyCodeLabel(bindings.restart);
  }
}

export function renderActionGlyphHtml(
  action: GlyphAction,
  mode: InputDeviceMode,
  bindings: KeyBindings = DEFAULT_KEY_BINDINGS,
): string {
  const label = getActionGlyphText(action, mode, bindings);
  let extraCls = '';
  if (mode === 'gamepad') {
    extraCls = ' kt-glyph--gamepad';
    if (label === 'A') extraCls += ' kt-glyph--gp-a';
    else if (label === 'B') extraCls += ' kt-glyph--gp-b';
    else if (label === 'X') extraCls += ' kt-glyph--gp-x';
    else if (label === 'Y') extraCls += ' kt-glyph--gp-y';
  } else if (mode === 'touch') {
    extraCls = ' kt-glyph--touch';
  }
  return `<span class="kt-glyph${extraCls}">${label}</span>`;
}
