import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DEADZONES,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_RENDER_SETTINGS,
  type InputDeviceMode,
} from '../src/contracts/index';
import {
  InputRouter,
  getActionGlyphText,
  renderActionGlyphHtml,
} from '../src/input/InputRouter';
import { GamepadDriver } from '../src/input/GamepadDriver';
import { buildKrunkedAtlas, fontGlyphKey } from '../src/assets/KrunkedAtlas';

// ============================================================================
// Minimal Deterministic Browser DOM / Event Stub for Vitest `node` Environment
// ============================================================================

type ListenerEntry = {
  fn: (ev: unknown) => void;
  capture: boolean;
};

class FakeEventTarget {
  private listeners = new Map<string, ListenerEntry[]>();

  addEventListener(
    type: string,
    fn: (ev: unknown) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, capture });
    this.listeners.set(type, list);
  }

  removeEventListener(
    type: string,
    fn: (ev: unknown) => void,
    options?: boolean | EventListenerOptions,
  ): void {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(
      type,
      list.filter((e) => !(e.fn === fn && e.capture === capture)),
    );
  }

  dispatchEvent(type: string, ev: Record<string, unknown> = {}): void {
    const list = this.listeners.get(type);
    if (!list) return;
    const eventObj = {
      type,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: null,
      ...ev,
    };
    for (const entry of [...list]) {
      entry.fn(eventObj);
    }
  }
}

class FakeClassList {
  private set = new Set<string>();
  add(...tokens: string[]): void {
    for (const t of tokens) this.set.add(t);
  }
  remove(...tokens: string[]): void {
    for (const t of tokens) this.set.delete(t);
  }
  toggle(token: string, force?: boolean): boolean {
    if (force === undefined) {
      if (this.set.has(token)) {
        this.set.delete(token);
        return false;
      }
      this.set.add(token);
      return true;
    }
    if (force) this.set.add(token);
    else this.set.delete(token);
    return force;
  }
  contains(token: string): boolean {
    return this.set.has(token);
  }
}

class FakeElement extends FakeEventTarget {
  readonly tagName: string;
  className = '';
  type = '';
  innerHTML = '';
  textContent = '';
  dataset: Record<string, string> = {};
  style: Record<string, string | ((k: string, v: string) => void)> = {
    display: '',
    visibility: '',
    pointerEvents: '',
    setProperty: (k: string, v: string) => {
      this.style[k] = v;
    },
  };
  classList = new FakeClassList();
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  private attrs = new Map<string, string>();

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement): FakeElement {
    this.children = this.children.filter((c) => c !== child);
    child.parentElement = null;
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 400, height: 400 };
  }

  setPointerCapture(_id: number): void {
    // no-op
  }
}

interface MockButton {
  pressed: boolean;
  touched: boolean;
  value: number;
}

interface MockGamepad {
  id: string;
  index: number;
  connected: boolean;
  mapping: GamepadMappingType;
  axes: number[];
  buttons: MockButton[];
  timestamp: number;
  vibrationActuator: {
    playEffect: ReturnType<typeof vi.fn>;
  };
}

function createMockXboxPad(overrides?: Partial<MockGamepad>): MockGamepad {
  return {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
    timestamp: 0,
    vibrationActuator: {
      playEffect: vi.fn(() => Promise.resolve('complete')),
    },
    ...overrides,
  };
}

describe('InputRouter & Input Taste Discipline', () => {
  let fakeWindow: FakeEventTarget;
  let fakeDocument: FakeEventTarget & {
    hidden: boolean;
    createElement: (tag: string) => FakeElement;
  };
  let mockPads: (MockGamepad | null)[];
  let origWindow: unknown;
  let origDocument: unknown;
  let origNavigator: unknown;
  let router: InputRouter | null = null;

  beforeEach(() => {
    origWindow = (globalThis as Record<string, unknown>).window;
    origDocument = (globalThis as Record<string, unknown>).document;
    origNavigator = (globalThis as Record<string, unknown>).navigator;

    fakeWindow = new FakeEventTarget();
    fakeDocument = Object.assign(new FakeEventTarget(), {
      hidden: false,
      createElement: (tag: string) => new FakeElement(tag),
    });
    mockPads = [null, null, null, null];

    Object.defineProperty(globalThis, 'window', {
      value: fakeWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        getGamepads: () => mockPads,
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    router?.dispose();
    router = null;

    if (origWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: origWindow,
        configurable: true,
        writable: true,
      });
    }
    if (origDocument === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      Object.defineProperty(globalThis, 'document', {
        value: origDocument,
        configurable: true,
        writable: true,
      });
    }
    if (origNavigator === undefined) {
      delete (globalThis as Record<string, unknown>).navigator;
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        value: origNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  it('enforces strict zero-visibility default for touch controls on boot', () => {
    const host = new FakeElement('div');
    router = new InputRouter({
      touchHost: host as unknown as HTMLElement,
    });

    expect(router.isTouchActive()).toBe(false);
    expect(router.getDeviceMode()).toBe('keyboard');
    expect(router.touch.isVisible()).toBe(false);

    const root = router.touch.getRootElement() as unknown as FakeElement;
    expect(root).not.toBeNull();
    expect(root.dataset.touchVisible).toBe('false');
    expect(root.style.display).toBe('none');
    expect(root.style.visibility).toBe('hidden');
    expect(root.getAttribute('aria-hidden')).toBe('true');

    // Non-touch mouse click must NOT show touch controls
    fakeWindow.dispatchEvent('pointerdown', { pointerType: 'mouse' });
    expect(router.isTouchActive()).toBe(false);
    expect(router.getDeviceMode()).toBe('keyboard');
  });

  it('activates touch overlay on touchstart or touch pointerdown and flips deviceMode to touch', () => {
    const modes: InputDeviceMode[] = [];
    const host = new FakeElement('div');
    router = new InputRouter({
      touchHost: host as unknown as HTMLElement,
      callbacks: { onDeviceModeChange: (m) => modes.push(m) },
    });

    fakeWindow.dispatchEvent('touchstart', {});
    expect(router.isTouchActive()).toBe(true);
    expect(router.getDeviceMode()).toBe('touch');
    expect(modes).toEqual(['touch']);

    const root = router.touch.getRootElement() as unknown as FakeElement;
    expect(root.dataset.touchVisible).toBe('true');
    expect(root.style.display).toBe('block');
    expect(root.style.visibility).toBe('visible');
    expect(root.getAttribute('aria-hidden')).toBe('false');

    // Reset via keyboard, then verify pointerdown with pointerType === 'touch' also activates touch
    fakeWindow.dispatchEvent('keydown', { code: 'ArrowRight' });
    expect(router.isTouchActive()).toBe(false);

    fakeWindow.dispatchEvent('pointerdown', { pointerType: 'touch' });
    expect(router.isTouchActive()).toBe(true);
    expect(router.getDeviceMode()).toBe('touch');
  });

  it('immediately hides touch controls on any regular keyboard key or gamepad input', () => {
    const host = new FakeElement('div');
    router = new InputRouter({
      touchHost: host as unknown as HTMLElement,
    });
    const root = router.touch.getRootElement() as unknown as FakeElement;

    // 1. Touch -> Keyboard cancels touch immediately
    router.simulateTouch(true);
    expect(router.isTouchActive()).toBe(true);

    fakeWindow.dispatchEvent('keydown', { code: 'KeyZ' });
    expect(router.isTouchActive()).toBe(false);
    expect(router.getDeviceMode()).toBe('keyboard');
    expect(root.style.display).toBe('none');
    expect(root.dataset.touchVisible).toBe('false');

    // 2. Touch -> Gamepad button or stick cancels touch immediately
    router.simulateTouch(true);
    expect(router.isTouchActive()).toBe(true);

    const pad = createMockXboxPad();
    pad.buttons[0].pressed = true;
    pad.buttons[0].value = 1;
    mockPads[0] = pad;

    const frame = router.poll();
    expect(frame.jumpPressed).toBe(true);
    expect(frame.deviceMode).toBe('gamepad');
    expect(router.isTouchActive()).toBe(false);
    expect(router.getDeviceMode()).toBe('gamepad');
    expect(root.style.display).toBe('none');
  });

  it('preserves active touch mode when F9 (or other function keys) are pressed', () => {
    const onToggleDevDrawer = vi.fn();
    const host = new FakeElement('div');
    router = new InputRouter({
      touchHost: host as unknown as HTMLElement,
      callbacks: { onToggleDevDrawer },
    });

    router.simulateTouch(true);
    expect(router.isTouchActive()).toBe(true);
    expect(router.getDeviceMode()).toBe('touch');

    fakeWindow.dispatchEvent('keydown', { code: 'F9' });
    expect(router.isTouchActive()).toBe(true);
    expect(router.getDeviceMode()).toBe('touch');

    const frame = router.poll();
    expect(frame.deviceMode).toBe('touch');
    expect(onToggleDevDrawer).toHaveBeenCalledTimes(1);
    expect(router.getLastMenuNav().devDrawer).toBe(true);
    expect(router.isTouchActive()).toBe(true);

    // Other function keys (e.g., F12) also do not cancel touch mode
    fakeWindow.dispatchEvent('keydown', { code: 'F12' });
    expect(router.isTouchActive()).toBe(true);
    expect(router.getDeviceMode()).toBe('touch');

    // A regular gameplay key still cancels touch immediately
    fakeWindow.dispatchEvent('keydown', { code: 'Space' });
    expect(router.isTouchActive()).toBe(false);
    expect(router.getDeviceMode()).toBe('keyboard');
  });

  it('enforces all 5 granular Xbox GamepadDriver deadzones (general, horizontal, vertical, crouchWalk, superjump)', () => {
    const pad = createMockXboxPad();
    mockPads[0] = pad;
    const driver = new GamepadDriver({ ...DEFAULT_DEADZONES }, true);

    // 1. General radial deadzone (0.25): (0.17, 0.17) => hypot ~0.2404 < 0.25
    pad.axes = [0.17, 0.17, 0, 0];
    let s = driver.poll();
    expect(s.activeThisFrame).toBe(false);
    expect(s.moveX).toBe(0);
    expect(s.moveY).toBe(0);

    // 2. Horizontal deadzone (0.25): radial >= 0.25 via diagonal (0.20, 0.20) => |x|=0.20 < 0.25
    pad.axes = [0.20, 0.20, 0, 0];
    s = driver.poll();
    expect(s.activeThisFrame).toBe(true);
    expect(s.moveX).toBe(0);
    expect(s.moveY).toBe(0);

    pad.axes = [0.28, 0, 0, 0];
    s = driver.poll();
    expect(s.moveX).toBe(1);
    expect(s.moveY).toBe(0);

    pad.axes = [-0.28, 0, 0, 0];
    s = driver.poll();
    expect(s.moveX).toBe(-1);

    // 3. Vertical deadzone (0.35): |y|=0.30 < 0.35 => 0; |y|=0.38 >= 0.35 => -1/+1
    pad.axes = [0, -0.30, 0, 0];
    s = driver.poll();
    expect(s.activeThisFrame).toBe(true);
    expect(s.moveY).toBe(0);

    pad.axes = [0, -0.38, 0, 0];
    s = driver.poll({ isHighMach: false });
    expect(s.moveY).toBe(-1);

    pad.axes = [0, 0.38, 0, 0];
    s = driver.poll();
    expect(s.moveY).toBe(1);

    // 4. Crouch-walk deadzone (0.45): holding Down (y=0.80) suppresses slight X (< 0.45)
    pad.axes = [0.35, 0.80, 0, 0];
    s = driver.poll();
    expect(s.moveY).toBe(1);
    expect(s.moveX).toBe(0);

    pad.axes = [0.50, 0.80, 0, 0];
    s = driver.poll();
    expect(s.moveY).toBe(1);
    expect(s.moveX).toBe(1);

    pad.axes = [-0.50, 0.80, 0, 0];
    s = driver.poll();
    expect(s.moveY).toBe(1);
    expect(s.moveX).toBe(-1);

    // 5. Superjump deadzone (0.55) when isHighMach === true
    pad.axes = [0, -0.45, 0, 0];
    const normalMach = driver.poll({ isHighMach: false });
    expect(normalMach.moveY).toBe(-1);

    const highMachBelow = driver.poll({ isHighMach: true });
    expect(highMachBelow.moveY).toBe(0);

    pad.axes = [0, -0.60, 0, 0];
    const highMachAbove = driver.poll({ isHighMach: true });
    expect(highMachAbove.moveY).toBe(-1);

    driver.dispose();
  });

  it('maps standard Xbox buttons (A/B/X/Y/RT/Start/View/D-Pad) and gates rumble on setting', () => {
    const pad = createMockXboxPad();
    mockPads[0] = pad;
    router = new InputRouter({
      touchHost: null,
      renderSettings: { ...DEFAULT_RENDER_SETTINGS, rumble: true },
    });

    // Frame 1: press A (0), X (2), Y (3), RT (7 analog 0.45), Start (9)
    pad.buttons[0] = { pressed: true, touched: true, value: 1 };
    pad.buttons[2] = { pressed: true, touched: true, value: 1 };
    pad.buttons[3] = { pressed: true, touched: true, value: 1 };
    pad.buttons[7] = { pressed: false, touched: true, value: 0.45 };
    pad.buttons[9] = { pressed: true, touched: true, value: 1 };

    const f1 = router.poll();
    expect(f1.jumpHeld).toBe(true);
    expect(f1.jumpPressed).toBe(true);
    expect(f1.grabHeld).toBe(true);
    expect(f1.grabPressed).toBe(true);
    expect(f1.tauntPressed).toBe(true);
    expect(f1.machHeld).toBe(true);
    expect(f1.machPressed).toBe(true);
    expect(f1.pausePressed).toBe(true);
    expect(router.getLastMenuNav().confirm).toBe(true);

    // Frame 2: still held -> Pressed edges clear while Held stays true
    const f2 = router.poll();
    expect(f2.jumpHeld).toBe(true);
    expect(f2.jumpPressed).toBe(false);
    expect(f2.grabHeld).toBe(true);
    expect(f2.grabPressed).toBe(false);
    expect(f2.tauntPressed).toBe(false);
    expect(f2.machHeld).toBe(true);
    expect(f2.machPressed).toBe(false);
    expect(f2.pausePressed).toBe(false);

    // Frame 3: release A/X/Y/RT/Start, press B (1) and View (8) and D-Pad Right (15)
    pad.buttons[0] = { pressed: false, touched: false, value: 0 };
    pad.buttons[1] = { pressed: true, touched: true, value: 1 };
    pad.buttons[2] = { pressed: false, touched: false, value: 0 };
    pad.buttons[3] = { pressed: false, touched: false, value: 0 };
    pad.buttons[7] = { pressed: false, touched: false, value: 0 };
    pad.buttons[8] = { pressed: true, touched: true, value: 1 };
    pad.buttons[9] = { pressed: false, touched: false, value: 0 };
    pad.buttons[15] = { pressed: true, touched: true, value: 1 };

    const f3 = router.poll();
    expect(f3.jumpReleased).toBe(true);
    expect(f3.grabHeld).toBe(true); // B also maps to grab + back
    expect(f3.restartPressed).toBe(true);
    expect(f3.moveX).toBe(1);
    expect(router.getLastMenuNav().back).toBe(true);

    // Rumble gating: enabled -> fires playEffect; disabled -> blocked
    router.rumble(0.8, 0.35, 160);
    expect(pad.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(pad.vibrationActuator.playEffect).toHaveBeenCalledWith('dual-rumble', {
      startDelay: 0,
      duration: 160,
      strongMagnitude: 0.8,
      weakMagnitude: 0.35,
    });

    router.applyRenderSettings({ ...DEFAULT_RENDER_SETTINGS, rumble: false });
    router.rumble(1.0, 1.0, 200);
    expect(pad.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
  });

  it('switches dynamic input glyphs cleanly across keyboard, gamepad, and touch modes', () => {
    router = new InputRouter({ touchHost: null });

    // Keyboard mode (default)
    expect(router.getDeviceMode()).toBe('keyboard');
    expect(router.getGlyphText('jump')).toBe('Z');
    expect(router.getGlyphText('grab')).toBe('X');
    expect(router.getGlyphText('mach')).toBe('SHIFT');
    expect(router.getGlyphText('taunt')).toBe('C');
    expect(router.getGlyphText('pause')).toBe('ESC');
    expect(router.renderGlyphHtml('jump')).toBe('<span class="kt-glyph">Z</span>');

    // Touch mode
    router.simulateTouch(true);
    expect(router.getGlyphText('jump')).toBe('J');
    expect(router.getGlyphText('grab')).toBe('G');
    expect(router.getGlyphText('mach')).toBe('M');
    expect(router.getGlyphText('taunt')).toBe('T');
    expect(router.getGlyphText('pause')).toBe('||');
    expect(router.renderGlyphHtml('jump')).toContain('kt-glyph--touch');

    // Gamepad mode
    const pad = createMockXboxPad();
    pad.buttons[0] = { pressed: true, touched: true, value: 1 };
    mockPads[0] = pad;
    router.poll();

    expect(router.getDeviceMode()).toBe('gamepad');
    expect(router.getGlyphText('jump')).toBe('A');
    expect(router.getGlyphText('grab')).toBe('X');
    expect(router.getGlyphText('back')).toBe('B');
    expect(router.getGlyphText('mach')).toBe('RT');
    expect(router.getGlyphText('taunt')).toBe('Y');
    expect(router.getGlyphText('pause')).toBe('START');
    expect(router.renderGlyphHtml('jump')).toContain('kt-glyph--gp-a');
    expect(router.renderGlyphHtml('taunt')).toContain('kt-glyph--gp-y');

    // Back to Keyboard with custom remapped bindings
    fakeWindow.dispatchEvent('keydown', { code: 'KeyK' });
    router.setKeyBindings({ ...DEFAULT_KEY_BINDINGS, jump: 'Space', mach: 'KeyK' });
    expect(router.getDeviceMode()).toBe('keyboard');
    expect(router.getGlyphText('jump')).toBe('SPACE');
    expect(router.getGlyphText('mach')).toBe('K');

    // Pure helper consistency check
    expect(getActionGlyphText('move', 'keyboard')).toBe('ARROWS');
    expect(getActionGlyphText('move', 'gamepad')).toBe('L-STICK');
    expect(getActionGlyphText('move', 'touch')).toBe('STICK');
    expect(renderActionGlyphHtml('back', 'gamepad')).toContain('kt-glyph--gp-b');
  });

  it('provides atlas bitmap font glyphs for all punctuation used in banners (&, (), em/en-dash)', () => {
    const atlas = buildKrunkedAtlas();
    const samples = [
      'A', 'B', 'O', 'P', 'U', '0', '9',
      '!', '?', ':', '.', '+', '-', '/', ',', "'", '$',
      '&', '(', ')', '—', '–',
    ];
    for (const ch of samples) {
      const key = fontGlyphKey(ch);
      expect(key, `glyph key for ${ch}`).toBeTruthy();
      expect(atlas.rects[key!], `atlas rect for ${ch} (${key})`).toBeDefined();
      expect(atlas.rects[key!].w).toBe(12);
      expect(atlas.rects[key!].h).toBe(16);
    }
  });
});
