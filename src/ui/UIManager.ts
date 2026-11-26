import {
  CustomPackStatus,
  InputDeviceMode,
  PerfStats,
  SaveData,
  SimState,
} from '../contracts/index';
import { MenuNavState } from '../input/InputRouter';
import { HudOverlay } from './HudOverlay';
import { Menus, MenusCallbacks } from './Menus';

export interface UIManagerOptions {
  hudHost: HTMLElement | null;
  uiHost: HTMLElement | null;
  toastHost: HTMLElement | null;
  callbacks: MenusCallbacks;
}

export class UIManager {
  public readonly hud: HudOverlay;
  public readonly menus: Menus;
  private readonly toastHost: HTMLElement | null;
  private readonly callbacks: MenusCallbacks;

  constructor(options: UIManagerOptions) {
    this.toastHost = options.toastHost;
    this.callbacks = options.callbacks;
    this.hud = new HudOverlay(options.hudHost);
    this.menus = new Menus(options.uiHost, options.callbacks);
  }

  public sync(
    state: SimState,
    saveData: SaveData,
    deviceMode: InputDeviceMode,
    perfStats: PerfStats,
    packStatus: CustomPackStatus,
    touchActive: boolean,
    stateHash: string,
  ): void {
    this.hud.sync(
      state,
      deviceMode,
      saveData.keyBindings,
      saveData.renderSettings,
      perfStats,
      touchActive,
    );
    this.menus.sync(state, saveData, deviceMode, packStatus, touchActive, stateHash);
  }

  public handleMenuNav(nav: MenuNavState, state: SimState): boolean {
    const overlay = this.menus.getActiveOverlayElement();
    if (!overlay) return false;

    if (nav.back) {
      if (this.menus.isOptionsOpen()) {
        this.callbacks.onUiSound('back');
        this.menus.closeOptions();
        return true;
      }
      if (state.paused && (state.screen === 'hub' || state.screen === 'stage' || state.screen === 'boss')) {
        this.callbacks.onUiSound('back');
        this.callbacks.onResume();
        return true;
      }
    }

    const focusables = Array.from(
      overlay.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'),
    );
    if (focusables.length === 0) return false;

    const current =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const currentIdx = current ? focusables.indexOf(current) : -1;

    if (nav.down || nav.right) {
      const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % focusables.length;
      focusables[nextIdx].focus();
      this.callbacks.onUiSound('move');
      return true;
    }

    if (nav.up || nav.left) {
      const prevIdx =
        currentIdx < 0 ? focusables.length - 1 : (currentIdx - 1 + focusables.length) % focusables.length;
      focusables[prevIdx].focus();
      this.callbacks.onUiSound('move');
      return true;
    }

    if (nav.confirm) {
      const target = currentIdx >= 0 ? focusables[currentIdx] : focusables[0];
      target.click();
      return true;
    }

    return false;
  }

  public showToast(message: string, variant: 'info' | 'warn' = 'info', durationMs = 2600): void {
    if (!this.toastHost || typeof document === 'undefined') return;
    const toast = document.createElement('div');
    toast.className = `kt-toast ${variant === 'warn' ? 'kt-toast--warn' : ''}`;
    toast.textContent = message;
    this.toastHost.appendChild(toast);

    // Keep at most 3 toasts on screen
    while (this.toastHost.children.length > 3) {
      this.toastHost.firstElementChild?.remove();
    }

    window.setTimeout(() => {
      toast.remove();
    }, durationMs);
  }

  public toggleDevDrawer(force?: boolean): boolean {
    return this.menus.toggleDevDrawer(force);
  }

  public isModalBlockingGameplay(state: SimState): boolean {
    return (
      this.menus.isOptionsOpen() ||
      state.paused ||
      state.gameOver ||
      state.screen === 'title' ||
      state.screen === 'rank' ||
      state.screen === 'victory'
    );
  }

  public dispose(): void {
    this.hud.dispose();
    this.menus.dispose();
    if (this.toastHost) {
      this.toastHost.innerHTML = '';
    }
  }
}
