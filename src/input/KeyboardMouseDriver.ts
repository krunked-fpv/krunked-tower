import { DEFAULT_KEY_BINDINGS, KeyBindings } from '../contracts/index';

export interface KeyboardSample {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
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

export interface KeyboardDriverCallbacks {
  onActivity?: () => void;
  onUserGesture?: () => void;
}

const PREVENT_DEFAULT_CODES = new Set<string>([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

export function formatKeyCodeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'SHIFT';
    case 'ControlLeft':
    case 'ControlRight':
      return 'CTRL';
    case 'Space':
      return 'SPACE';
    case 'Escape':
      return 'ESC';
    case 'Enter':
      return 'ENTER';
    case 'Backspace':
      return 'BKSP';
    default:
      return code.toUpperCase();
  }
}

export class KeyboardMouseDriver {
  private bindings: KeyBindings;
  private readonly callbacks: KeyboardDriverCallbacks;
  private readonly heldCodes = new Set<string>();
  private readonly pressedQueue = new Set<string>();
  private readonly releasedQueue = new Set<string>();
  private captureHandler: ((code: string) => void) | null = null;
  private attached = false;

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    this.callbacks.onUserGesture?.();
    if (!/^F\d+$/.test(e.code)) {
      this.callbacks.onActivity?.();
    }

    if (this.captureHandler) {
      e.preventDefault();
      e.stopPropagation();
      const cb = this.captureHandler;
      this.captureHandler = null;
      if (e.code !== 'Escape') {
        cb(e.code);
      } else {
        cb('');
      }
      return;
    }

    const target = e.target as HTMLElement | null;
    const isTextField =
      target !== null &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') &&
      (target as HTMLInputElement).type !== 'button' &&
      (target as HTMLInputElement).type !== 'range' &&
      (target as HTMLInputElement).type !== 'checkbox';

    if (isTextField) return;

    if (PREVENT_DEFAULT_CODES.has(e.code) || e.code === 'F9') {
      e.preventDefault();
    }

    if (!this.heldCodes.has(e.code)) {
      this.heldCodes.add(e.code);
      this.pressedQueue.add(e.code);
    }
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    if (this.heldCodes.has(e.code)) {
      this.heldCodes.delete(e.code);
      this.releasedQueue.add(e.code);
    }
  };

  private readonly handleMouseDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') {
      this.callbacks.onUserGesture?.();
    }
  };

  private readonly handleBlur = (): void => {
    for (const code of this.heldCodes) {
      this.releasedQueue.add(code);
    }
    this.heldCodes.clear();
  };

  private readonly handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.hidden) {
      this.handleBlur();
    }
  };

  constructor(
    bindings: KeyBindings = DEFAULT_KEY_BINDINGS,
    callbacks: KeyboardDriverCallbacks = {},
  ) {
    this.bindings = { ...bindings };
    this.callbacks = callbacks;
    this.attach();
  }

  public attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown, { capture: true });
    window.addEventListener('keyup', this.handleKeyUp, { capture: true });
    window.addEventListener('pointerdown', this.handleMouseDown, { passive: true });
    window.addEventListener('blur', this.handleBlur);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.attached = true;
  }

  public setBindings(bindings: KeyBindings): void {
    this.bindings = { ...bindings };
  }

  public getBindings(): KeyBindings {
    return { ...this.bindings };
  }

  public startCapture(handler: (code: string) => void): void {
    this.captureHandler = handler;
  }

  public cancelCapture(): void {
    this.captureHandler = null;
  }

  public isCapturing(): boolean {
    return this.captureHandler !== null;
  }

  private getActionCodes(action: keyof KeyBindings): string[] {
    const primary = this.bindings[action];
    const usedPrimaries = new Set<string>(Object.values(this.bindings));
    const codes = [primary];

    const addAliasIfFree = (alias: string): void => {
      if (alias !== primary && !usedPrimaries.has(alias)) {
        codes.push(alias);
      }
    };

    switch (action) {
      case 'left':
        addAliasIfFree('KeyA');
        break;
      case 'right':
        addAliasIfFree('KeyD');
        break;
      case 'up':
        addAliasIfFree('KeyW');
        break;
      case 'down':
        addAliasIfFree('KeyS');
        break;
      case 'jump':
        addAliasIfFree('Space');
        break;
      case 'mach':
        addAliasIfFree('ShiftRight');
        break;
      default:
        break;
    }

    return codes;
  }

  private isHeld(codes: readonly string[]): boolean {
    for (const c of codes) {
      if (this.heldCodes.has(c)) return true;
    }
    return false;
  }

  private wasPressed(codes: readonly string[]): boolean {
    for (const c of codes) {
      if (this.pressedQueue.has(c)) return true;
    }
    return false;
  }

  private wasReleased(codes: readonly string[]): boolean {
    for (const c of codes) {
      if (this.releasedQueue.has(c)) return true;
    }
    return false;
  }

  public sample(): KeyboardSample {
    const leftCodes = this.getActionCodes('left');
    const rightCodes = this.getActionCodes('right');
    const upCodes = this.getActionCodes('up');
    const downCodes = this.getActionCodes('down');
    const jumpCodes = this.getActionCodes('jump');
    const grabCodes = this.getActionCodes('grab');
    const machCodes = this.getActionCodes('mach');
    const tauntCodes = this.getActionCodes('taunt');
    const pauseCodes = this.getActionCodes('pause');
    const restartCodes = this.getActionCodes('restart');

    const result: KeyboardSample = {
      left: this.isHeld(leftCodes),
      right: this.isHeld(rightCodes),
      up: this.isHeld(upCodes),
      down: this.isHeld(downCodes),
      jumpHeld: this.isHeld(jumpCodes),
      jumpPressed: this.wasPressed(jumpCodes),
      jumpReleased: this.wasReleased(jumpCodes),
      grabHeld: this.isHeld(grabCodes),
      grabPressed: this.wasPressed(grabCodes),
      grabReleased: this.wasReleased(grabCodes),
      machHeld: this.isHeld(machCodes),
      machPressed: this.wasPressed(machCodes),
      tauntPressed: this.wasPressed(tauntCodes),
      pausePressed: this.wasPressed(pauseCodes),
      restartPressed: this.wasPressed(restartCodes),
      devDrawerPressed: this.pressedQueue.has('F9'),
      confirmPressed: this.wasPressed([...jumpCodes, 'Enter']),
      backPressed: this.wasPressed([...pauseCodes, ...grabCodes, 'Backspace']),
      navUpPressed: this.wasPressed(upCodes),
      navDownPressed: this.wasPressed(downCodes),
      navLeftPressed: this.wasPressed(leftCodes),
      navRightPressed: this.wasPressed(rightCodes),
    };

    this.pressedQueue.clear();
    this.releasedQueue.clear();
    return result;
  }

  public dispose(): void {
    if (!this.attached || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown, { capture: true });
    window.removeEventListener('keyup', this.handleKeyUp, { capture: true });
    window.removeEventListener('pointerdown', this.handleMouseDown);
    window.removeEventListener('blur', this.handleBlur);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.attached = false;
    this.heldCodes.clear();
    this.pressedQueue.clear();
    this.releasedQueue.clear();
  }
}
