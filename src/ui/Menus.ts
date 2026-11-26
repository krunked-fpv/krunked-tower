import {
  AssetSourceMode,
  AudioSettings,
  BossId,
  CustomPackStatus,
  DeadzoneSettings,
  ENGINE_CONSTANTS,
  FloorId,
  InputDeviceMode,
  KeyBindings,
  PaletteDef,
  PlayableCharacter,
  RankGrade,
  RenderSettings,
  SaveData,
  SimState,
  StageId,
  TransformationId,
} from '../contracts/index';
import { BOSSES, CHEF_TASKS, LEVELS, PALETTES, PALETTE_MAP, STAGE_ORDER, STRINGS } from '../data/index';
import { renderActionGlyphHtml } from '../input/InputRouter';
import { formatKeyCodeLabel } from '../input/KeyboardMouseDriver';

export interface MenusCallbacks {
  onSelectSlot: (slotIndex: 0 | 1 | 2) => void;
  onResetSlot: (slotIndex: 0 | 1 | 2) => void;
  onSelectCharacter: (character: PlayableCharacter) => void;
  onStartRun: () => void;
  onStartTutorial: () => void;
  onResume: () => void;
  onRestartStage: () => void;
  onReturnToHub: () => void;
  onReturnToTitle: () => void;
  onUpdateRenderSettings: (partial: Partial<RenderSettings>) => void;
  onUpdateAudioSettings: (partial: Partial<AudioSettings>) => void;
  onUpdateDeadzones: (partial: Partial<DeadzoneSettings>) => void;
  onRebindKey: (action: keyof KeyBindings, done: () => void) => void;
  onResetKeyBindings: () => void;
  onLoadCustomPackFiles: (files: FileList) => void;
  onSetAssetMode: (mode: AssetSourceMode) => void;
  // Dev Drawer actions
  onWarpHub: (floor: FloorId) => void;
  onWarpStage: (stageId: StageId) => void;
  onWarpBoss: (bossId: BossId) => void;
  onSetTransformation: (t: TransformationId) => void;
  onSetPalette: (paletteId: string) => void;
  onTriggerEscape: () => void;
  onTriggerLap2: () => void;
  onToggleSimulateTouch: () => void;
  onUnlockAll: () => void;
  onDamageBoss: (amount: number) => void;
  onRankPreview: (rank: RankGrade) => void;
  onUiSound: (kind: 'move' | 'confirm' | 'back') => void;
}

const TRANSFORMATIONS: readonly TransformationId[] = [
  'none',
  'knight',
  'ball',
  'bomb',
  'fire_butt',
  'firemouth',
  'ghost',
  'beak',
  'weenie',
  'barrel',
  'rocket',
  'golf_carry',
  'cheese_sticky',
  'trash_roll',
  'boxed_flat',
  'inferno_pepper',
  'cross',
  'shotgun',
  'revolver',
];

const KEYBIND_ORDER: Array<{ key: keyof KeyBindings; label: string }> = [
  { key: 'left', label: 'Move Left' },
  { key: 'right', label: 'Move Right' },
  { key: 'up', label: 'Up / Door / Superjump' },
  { key: 'down', label: 'Down / Crouch / Slam' },
  { key: 'jump', label: 'Jump' },
  { key: 'grab', label: 'Grab / Dash / Shoot' },
  { key: 'mach', label: 'Mach Run' },
  { key: 'taunt', label: 'Taunt / Parry' },
  { key: 'pause', label: 'Pause' },
  { key: 'restart', label: 'Quick Restart' },
];

const RANKS: readonly RankGrade[] = ['D', 'C', 'B', 'A', 'S', 'P'];

function formatDuration(ticks: number): string {
  const sec = Math.max(0, Math.floor(ticks / ENGINE_CONSTANTS.SIM_HZ));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class Menus {
  private readonly host: HTMLElement | null;
  private readonly cb: MenusCallbacks;

  private titleOverlay: HTMLDivElement | null = null;
  private pauseOverlay: HTMLDivElement | null = null;
  private optionsOverlay: HTMLDivElement | null = null;
  private rankOverlay: HTMLDivElement | null = null;
  private gameOverOverlay: HTMLDivElement | null = null;
  private devDrawer: HTMLElement | null = null;
  private packInput: HTMLInputElement | null = null;

  private optionsOpen = false;
  private optionsTab: 'video' | 'audio' | 'controls' = 'video';
  private devDrawerOpen = false;
  private listeningKeyAction: keyof KeyBindings | null = null;
  private confirmResetSlot: number | null = null;

  private lastTitleKey = '';
  private lastPauseKey = '';
  private lastOptionsKey = '';
  private lastRankKey = '';
  private lastGameOverKey = '';
  private lastDevMetaTick = -1;

  constructor(host: HTMLElement | null, callbacks: MenusCallbacks) {
    this.host = host;
    this.cb = callbacks;
    if (!this.host || typeof document === 'undefined') return;

    this.titleOverlay = this.createOverlay('kt-screen-overlay kt-title-overlay');
    this.pauseOverlay = this.createOverlay('kt-screen-overlay kt-pause-overlay');
    this.optionsOverlay = this.createOverlay('kt-screen-overlay kt-options-overlay');
    this.rankOverlay = this.createOverlay('kt-screen-overlay kt-rank-overlay');
    this.gameOverOverlay = this.createOverlay('kt-screen-overlay kt-gameover-overlay');

    const devDrawer = document.createElement('aside');
    devDrawer.className = 'kt-dev-drawer';
    devDrawer.setAttribute('aria-label', 'Playtest Dev Drawer');
    this.host.appendChild(devDrawer);
    this.devDrawer = devDrawer;

    // Hidden folder picker input for Custom Pack loading
    const packInput = document.createElement('input');
    packInput.type = 'file';
    packInput.multiple = true;
    packInput.setAttribute('webkitdirectory', '');
    packInput.setAttribute('directory', '');
    packInput.style.display = 'none';
    packInput.addEventListener('change', () => {
      if (packInput.files && packInput.files.length > 0) {
        this.cb.onLoadCustomPackFiles(packInput.files);
      }
      packInput.value = '';
    });
    this.host.appendChild(packInput);
    this.packInput = packInput;

    this.buildDevDrawerStatic();
  }

  private createOverlay(className: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = className;
    this.host?.appendChild(el);
    return el;
  }

  public isOptionsOpen(): boolean {
    return this.optionsOpen;
  }

  public openOptions(): void {
    this.optionsOpen = true;
    this.lastOptionsKey = '';
  }

  public closeOptions(): void {
    this.optionsOpen = false;
    this.listeningKeyAction = null;
  }

  public isDevDrawerOpen(): boolean {
    return this.devDrawerOpen;
  }

  public toggleDevDrawer(force?: boolean): boolean {
    this.devDrawerOpen = force !== undefined ? force : !this.devDrawerOpen;
    this.devDrawer?.classList.toggle('is-visible', this.devDrawerOpen);
    return this.devDrawerOpen;
  }

  public getActiveOverlayElement(): HTMLElement | null {
    if (this.optionsOpen && this.optionsOverlay) return this.optionsOverlay;
    if (this.gameOverOverlay?.classList.contains('is-visible')) return this.gameOverOverlay;
    if (this.pauseOverlay?.classList.contains('is-visible')) return this.pauseOverlay;
    if (this.rankOverlay?.classList.contains('is-visible')) return this.rankOverlay;
    if (this.titleOverlay?.classList.contains('is-visible')) return this.titleOverlay;
    return null;
  }

  public sync(
    state: SimState,
    saveData: SaveData,
    deviceMode: InputDeviceMode,
    packStatus: CustomPackStatus,
    touchActive: boolean,
    stateHash: string,
  ): void {
    const showTitle = state.screen === 'title' && !this.optionsOpen;
    const showRank = (state.screen === 'rank' || state.screen === 'victory') && !this.optionsOpen;
    const showGameOver =
      state.gameOver &&
      (state.screen === 'stage' || state.screen === 'boss') &&
      !this.optionsOpen;
    const showPause =
      state.paused &&
      !showGameOver &&
      !this.optionsOpen &&
      (state.screen === 'hub' || state.screen === 'stage' || state.screen === 'boss');

    this.titleOverlay?.classList.toggle('is-visible', showTitle);
    this.pauseOverlay?.classList.toggle('is-visible', showPause);
    this.optionsOverlay?.classList.toggle('is-visible', this.optionsOpen);
    this.rankOverlay?.classList.toggle('is-visible', showRank);
    this.gameOverOverlay?.classList.toggle('is-visible', showGameOver);

    if (showTitle) {
      this.renderTitle(saveData, deviceMode, packStatus);
    }
    if (showPause) {
      this.renderPause(state, deviceMode, saveData.keyBindings);
    }
    if (this.optionsOpen) {
      this.renderOptions(saveData);
    }
    if (showRank) {
      this.renderRankCeremony(state, deviceMode, saveData.keyBindings);
    }
    if (showGameOver) {
      this.renderGameOver(state);
    }
    if (this.devDrawerOpen) {
      this.syncDevDrawerLive(state, saveData.renderSettings, touchActive, deviceMode, stateHash);
    }
  }

  private renderTitle(
    saveData: SaveData,
    deviceMode: InputDeviceMode,
    packStatus: CustomPackStatus,
  ): void {
    if (!this.titleOverlay) return;
    const slot = saveData.slots[saveData.activeSlot];
    const renderKey = JSON.stringify({
      activeSlot: saveData.activeSlot,
      char: slot.character,
      slots: saveData.slots.map((s) => ({
        c: s.character,
        f: s.hub.floor,
        $: s.hub.cash,
        st: s.hub.stagesCleared.length,
        b: s.hub.bossesDefeated.length,
        t: Math.floor(s.totalPlayTicks / 3600),
      })),
      confirmReset: this.confirmResetSlot,
      mode: deviceMode,
      useCustom: saveData.useCustomPack,
      pack: packStatus,
    });
    if (renderKey === this.lastTitleKey) return;
    this.lastTitleKey = renderKey;

    const strMap = STRINGS as Record<string, string>;
    const titleText = strMap.gameTitle ?? 'KRUNKED TOWER';
    const subText = strMap.gameSubtitle ?? '60 HZ KINETIC CARTOON SPEED-PLATFORMER';

    const packText = packStatus.error
      ? `Pack Error: ${packStatus.error}`
      : packStatus.active
        ? `Custom Pack Active (${packStatus.spriteCount} sprites • ${packStatus.audioCount} audio)`
        : packStatus.available
          ? `Custom Pack Ready (${packStatus.spriteCount} sprites) — Using Built-In Art`
          : 'Built-In Hand-Inked Krunked Art Active';

    this.titleOverlay.innerHTML = `
      <div class="kt-card">
        <div class="kt-title-header">
          <h1 class="kt-logo">${escapeHtml(titleText)}</h1>
          <p class="kt-logo-sub">${escapeHtml(subText)}</p>
        </div>

        <div class="kt-section-label">CHOOSE YOUR RUNNER</div>
        <div class="kt-char-grid">
          <button type="button" class="kt-char-card ${slot.character === 'peppo' ? 'is-selected' : ''}" data-char="peppo">
            <div class="kt-char-name">PLAY AS CHEF PEPPO</div>
            <div class="kt-char-desc">Mach 1–4 Sprint • Wall Climb • Superjump • Parry & Piledriver</div>
          </button>
          <button type="button" class="kt-char-card ${slot.character === 'static' ? 'is-selected' : ''}" data-char="static">
            <div class="kt-char-name">PLAY AS THE STATIC</div>
            <div class="kt-char-desc">Skateboard Mach • Wall Bounce • Tornado Jump • Drill Crusher</div>
          </button>
        </div>

        <div class="kt-section-label">SAVE SLOTS</div>
        <div class="kt-slots-grid">
          ${saveData.slots
            .map((s) => {
              const pct = Math.min(
                100,
                Math.round(((s.hub.stagesCleared.length + s.hub.bossesDefeated.length * 2) / 29) * 100),
              );
              const pRanks = Object.values(s.hub.stageBestRanks).filter((r) => r === 'P').length;
              const sRanks = Object.values(s.hub.stageBestRanks).filter((r) => r === 'S').length;
              const selected = s.slotIndex === saveData.activeSlot;
              const confirming = this.confirmResetSlot === s.slotIndex;
              return `
                <div class="kt-slot-card ${selected ? 'is-selected' : ''}" data-slot="${s.slotIndex}" role="button" tabindex="0">
                  <div class="kt-slot-head">
                    <span>SLOT ${s.slotIndex + 1}</span>
                    <span>${pct}%</span>
                  </div>
                  <div class="kt-slot-meta">
                    ${s.character === 'static' ? 'THE STATIC' : 'CHEF PEPPO'} • FLOOR ${s.hub.floor}<br/>
                    $${s.hub.cash} • ${s.hub.stagesCleared.length}/19 STAGES • P:${pRanks} S:${sRanks}
                  </div>
                  <button type="button" class="kt-slot-reset" data-reset-slot="${s.slotIndex}">
                    ${confirming ? 'CLICK AGAIN TO WIPE' : 'RESET'}
                  </button>
                </div>
              `;
            })
            .join('')}
        </div>

        <div class="kt-btn-row">
          <button type="button" class="kt-btn kt-btn--primary" data-action="start-run">START RUN</button>
          <button type="button" class="kt-btn kt-btn--accent" data-action="tutorial">TUTORIAL</button>
          <button type="button" class="kt-btn" data-action="options">OPTIONS</button>
        </div>

        <div class="kt-pack-bar">
          <div class="kt-pack-status">${escapeHtml(packText)}</div>
          <div class="kt-pack-controls">
            <button type="button" class="kt-btn kt-btn--small" data-action="load-pack">LOAD CUSTOM PACK</button>
            <div class="kt-pill-toggle" role="group" aria-label="Art Mode">
              <button type="button" class="${!packStatus.active ? 'is-active' : ''}" data-art-mode="builtin">USE BUILT-IN ART</button>
              <button type="button" class="${packStatus.active ? 'is-active' : ''}" data-art-mode="custom" ${packStatus.available ? '' : 'disabled'}>USE CUSTOM PACK</button>
            </div>
          </div>
        </div>

        <div class="kt-footer-hint">
          <span>${renderActionGlyphHtml('confirm', deviceMode, saveData.keyBindings)} SELECT</span>
          <span>${renderActionGlyphHtml('mach', deviceMode, saveData.keyBindings)} MACH</span>
          <span>${renderActionGlyphHtml('taunt', deviceMode, saveData.keyBindings)} TAUNT/PARRY</span>
          <span><span class="kt-glyph">F9</span> DEV DRAWER</span>
        </div>
      </div>
    `;

    this.titleOverlay.querySelectorAll<HTMLButtonElement>('[data-char]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ch = btn.dataset.char === 'static' ? 'static' : 'peppo';
        this.cb.onUiSound('move');
        this.cb.onSelectCharacter(ch);
      });
    });

    this.titleOverlay.querySelectorAll<HTMLElement>('[data-slot]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement)?.closest('[data-reset-slot]')) return;
        const idx = Number(card.dataset.slot) as 0 | 1 | 2;
        this.confirmResetSlot = null;
        this.cb.onUiSound('move');
        this.cb.onSelectSlot(idx);
      });
    });

    this.titleOverlay.querySelectorAll<HTMLButtonElement>('[data-reset-slot]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.resetSlot) as 0 | 1 | 2;
        if (this.confirmResetSlot === idx) {
          this.confirmResetSlot = null;
          this.cb.onUiSound('back');
          this.cb.onResetSlot(idx);
        } else {
          this.confirmResetSlot = idx;
          this.lastTitleKey = '';
          this.cb.onUiSound('move');
        }
      });
    });

    this.titleOverlay.querySelector('[data-action="start-run"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.cb.onStartRun();
    });

    this.titleOverlay.querySelector('[data-action="tutorial"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.cb.onStartTutorial();
    });

    this.titleOverlay.querySelector('[data-action="options"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.openOptions();
    });

    this.titleOverlay.querySelector('[data-action="load-pack"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.packInput?.click();
    });

    this.titleOverlay.querySelectorAll<HTMLButtonElement>('[data-art-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode: AssetSourceMode = btn.dataset.artMode === 'custom' ? 'custom' : 'builtin';
        this.cb.onUiSound('move');
        this.cb.onSetAssetMode(mode);
      });
    });
  }

  private renderPause(state: SimState, deviceMode: InputDeviceMode, bindings: KeyBindings): void {
    if (!this.pauseOverlay) return;
    const inStageOrBoss = state.screen === 'stage' || state.screen === 'boss';
    const key = `${state.screen}:${state.stageId}:${state.bossId}:${deviceMode}`;
    if (key === this.lastPauseKey) return;
    this.lastPauseKey = key;

    const place =
      state.screen === 'boss' && state.bossId
        ? BOSSES[state.bossId]?.name ?? 'Boss Arena'
        : state.screen === 'stage' && state.stageId
          ? LEVELS[state.stageId]?.name ?? 'Stage'
          : `Floor ${state.floor} Hub`;

    this.pauseOverlay.innerHTML = `
      <div class="kt-card kt-card--narrow">
        <h2 class="kt-modal-title">PAUSED</h2>
        <div style="text-align:center;font-weight:800;margin-bottom:8px;color:#5b2c91">${escapeHtml(place.toUpperCase())}</div>
        <div class="kt-btn-stack">
          <button type="button" class="kt-btn kt-btn--primary" data-pause="resume">RESUME</button>
          <button type="button" class="kt-btn kt-btn--accent" data-pause="restart" ${inStageOrBoss ? '' : 'disabled'}>RESTART STAGE</button>
          <button type="button" class="kt-btn" data-pause="hub" ${inStageOrBoss ? '' : 'disabled'}>RETURN TO HUB</button>
          <button type="button" class="kt-btn" data-pause="options">OPTIONS</button>
          <button type="button" class="kt-btn" data-pause="title">TITLE SCREEN</button>
        </div>
        <div class="kt-footer-hint">
          <span>${renderActionGlyphHtml('pause', deviceMode, bindings)} RESUME</span>
          <span>${renderActionGlyphHtml('restart', deviceMode, bindings)} RESTART</span>
        </div>
      </div>
    `;

    this.pauseOverlay.querySelector('[data-pause="resume"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.cb.onResume();
    });
    this.pauseOverlay.querySelector('[data-pause="restart"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.cb.onRestartStage();
    });
    this.pauseOverlay.querySelector('[data-pause="hub"]')?.addEventListener('click', () => {
      this.cb.onUiSound('back');
      this.cb.onReturnToHub();
    });
    this.pauseOverlay.querySelector('[data-pause="options"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.openOptions();
    });
    this.pauseOverlay.querySelector('[data-pause="title"]')?.addEventListener('click', () => {
      this.cb.onUiSound('back');
      this.cb.onReturnToTitle();
    });
  }

  private renderOptions(saveData: SaveData): void {
    if (!this.optionsOverlay) return;
    const key = JSON.stringify({
      tab: this.optionsTab,
      r: saveData.renderSettings,
      a: saveData.audioSettings,
      d: saveData.deadzones,
      k: saveData.keyBindings,
      listen: this.listeningKeyAction,
    });
    if (key === this.lastOptionsKey) return;
    this.lastOptionsKey = key;

    const r = saveData.renderSettings;
    const a = saveData.audioSettings;
    const d = saveData.deadzones;
    const k = saveData.keyBindings;

    let bodyHtml = '';
    if (this.optionsTab === 'video') {
      bodyHtml = `
        <div class="kt-options-grid">
          <div class="kt-opt-row">
            <span class="kt-opt-label">Target FPS</span>
            <select data-opt-render="targetFps">
              <option value="30" ${r.targetFps === 30 ? 'selected' : ''}>30 FPS</option>
              <option value="60" ${r.targetFps === 60 ? 'selected' : ''}>60 FPS</option>
              <option value="120" ${r.targetFps === 120 ? 'selected' : ''}>120 FPS (Default)</option>
            </select>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">Native 60 Hz Snap</span>
            <input type="checkbox" data-opt-render-bool="nativeSnap60" ${r.nativeSnap60 ? 'checked' : ''} />
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">Scaling Mode</span>
            <select data-opt-render="scalingMode">
              <option value="fit" ${r.scalingMode === 'fit' ? 'selected' : ''}>Fit Screen</option>
              <option value="pixel-perfect" ${r.scalingMode === 'pixel-perfect' ? 'selected' : ''}>Pixel-Perfect</option>
            </select>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">Screen Shake</span>
            <input type="checkbox" data-opt-render-bool="screenShake" ${r.screenShake ? 'checked' : ''} />
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">Show FPS & Perf</span>
            <input type="checkbox" data-opt-render-bool="showFps" ${r.showFps ? 'checked' : ''} />
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">Show Hitboxes</span>
            <input type="checkbox" data-opt-render-bool="showHitboxes" ${r.showHitboxes ? 'checked' : ''} />
          </div>
        </div>
      `;
    } else if (this.optionsTab === 'audio') {
      bodyHtml = `
        <div class="kt-options-grid">
          <div class="kt-opt-row">
            <span class="kt-opt-label">Master Volume</span>
            <input type="range" min="0" max="100" value="${Math.round(a.masterVolume * 100)}" data-opt-audio="masterVolume" />
            <span class="kt-opt-val">${Math.round(a.masterVolume * 100)}%</span>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">Music Volume</span>
            <input type="range" min="0" max="100" value="${Math.round(a.musicVolume * 100)}" data-opt-audio="musicVolume" />
            <span class="kt-opt-val">${Math.round(a.musicVolume * 100)}%</span>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">SFX Volume</span>
            <input type="range" min="0" max="100" value="${Math.round(a.sfxVolume * 100)}" data-opt-audio="sfxVolume" />
            <span class="kt-opt-val">${Math.round(a.sfxVolume * 100)}%</span>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">Mute All Audio</span>
            <input type="checkbox" data-opt-audio-bool="muted" ${a.muted ? 'checked' : ''} />
          </div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="kt-options-grid">
          <div class="kt-opt-row">
            <span class="kt-opt-label">Gamepad Rumble</span>
            <input type="checkbox" data-opt-render-bool="rumble" ${r.rumble ? 'checked' : ''} />
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">Touch Opacity</span>
            <input type="range" min="15" max="60" value="${Math.round(r.touchOpacity * 100)}" data-opt-render-range="touchOpacity" />
            <span class="kt-opt-val">${Math.round(r.touchOpacity * 100)}%</span>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">Touch Mach Lock Default</span>
            <input type="checkbox" data-opt-render-bool="touchMachLockDefault" ${r.touchMachLockDefault ? 'checked' : ''} />
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">DZ: General</span>
            <input type="range" min="5" max="80" value="${Math.round(d.general * 100)}" data-opt-dz="general" />
            <span class="kt-opt-val">${Math.round(d.general * 100)}%</span>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">DZ: Horizontal</span>
            <input type="range" min="5" max="80" value="${Math.round(d.horizontal * 100)}" data-opt-dz="horizontal" />
            <span class="kt-opt-val">${Math.round(d.horizontal * 100)}%</span>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">DZ: Vertical</span>
            <input type="range" min="5" max="80" value="${Math.round(d.vertical * 100)}" data-opt-dz="vertical" />
            <span class="kt-opt-val">${Math.round(d.vertical * 100)}%</span>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">DZ: Crouch Walk</span>
            <input type="range" min="10" max="85" value="${Math.round(d.crouchWalk * 100)}" data-opt-dz="crouchWalk" />
            <span class="kt-opt-val">${Math.round(d.crouchWalk * 100)}%</span>
          </div>
          <div class="kt-opt-row">
            <span class="kt-opt-label">DZ: Superjump</span>
            <input type="range" min="15" max="90" value="${Math.round(d.superjump * 100)}" data-opt-dz="superjump" />
            <span class="kt-opt-val">${Math.round(d.superjump * 100)}%</span>
          </div>
        </div>
        <div class="kt-section-label">KEYBOARD BINDINGS</div>
        <div class="kt-keybind-grid">
          ${KEYBIND_ORDER.map((item) => {
            const listening = this.listeningKeyAction === item.key;
            return `
              <div class="kt-opt-row">
                <span class="kt-opt-label">${item.label}</span>
                <button type="button" class="kt-keybind-btn ${listening ? 'is-listening' : ''}" data-rebind="${item.key}">
                  ${listening ? 'PRESS KEY...' : escapeHtml(formatKeyCodeLabel(k[item.key]))}
                </button>
              </div>
            `;
          }).join('')}
        </div>
        <div style="margin-top:8px;text-align:right">
          <button type="button" class="kt-btn kt-btn--small" data-action="reset-keys">RESET KEYBINDS</button>
        </div>
      `;
    }

    this.optionsOverlay.innerHTML = `
      <div class="kt-card">
        <h2 class="kt-modal-title">OPTIONS</h2>
        <div class="kt-options-tabs">
          <button type="button" class="kt-btn kt-btn--small ${this.optionsTab === 'video' ? 'kt-btn--accent' : ''}" data-opt-tab="video">DISPLAY & PERF</button>
          <button type="button" class="kt-btn kt-btn--small ${this.optionsTab === 'audio' ? 'kt-btn--accent' : ''}" data-opt-tab="audio">AUDIO</button>
          <button type="button" class="kt-btn kt-btn--small ${this.optionsTab === 'controls' ? 'kt-btn--accent' : ''}" data-opt-tab="controls">CONTROLS & TOUCH</button>
        </div>
        ${bodyHtml}
        <div class="kt-btn-row">
          <button type="button" class="kt-btn kt-btn--primary" data-action="close-options">DONE</button>
        </div>
      </div>
    `;

    this.optionsOverlay.querySelectorAll<HTMLButtonElement>('[data-opt-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.optTab as 'video' | 'audio' | 'controls';
        this.optionsTab = tab;
        this.lastOptionsKey = '';
        this.cb.onUiSound('move');
      });
    });

    this.optionsOverlay.querySelectorAll<HTMLSelectElement>('[data-opt-render]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const prop = sel.dataset.optRender;
        if (prop === 'targetFps') {
          this.cb.onUpdateRenderSettings({ targetFps: Number(sel.value) as 30 | 60 | 120 });
        } else if (prop === 'scalingMode') {
          this.cb.onUpdateRenderSettings({
            scalingMode: sel.value === 'pixel-perfect' ? 'pixel-perfect' : 'fit',
          });
        }
      });
    });

    this.optionsOverlay
      .querySelectorAll<HTMLInputElement>('[data-opt-render-bool]')
      .forEach((chk) => {
        chk.addEventListener('change', () => {
          const prop = chk.dataset.optRenderBool as keyof RenderSettings;
          this.cb.onUpdateRenderSettings({ [prop]: chk.checked } as Partial<RenderSettings>);
        });
      });

    this.optionsOverlay
      .querySelectorAll<HTMLInputElement>('[data-opt-render-range]')
      .forEach((rng) => {
        rng.addEventListener('input', () => {
          const prop = rng.dataset.optRenderRange;
          if (prop === 'touchOpacity') {
            this.cb.onUpdateRenderSettings({ touchOpacity: Number(rng.value) / 100 });
          }
        });
      });

    this.optionsOverlay.querySelectorAll<HTMLInputElement>('[data-opt-audio]').forEach((rng) => {
      rng.addEventListener('input', () => {
        const prop = rng.dataset.optAudio as 'masterVolume' | 'musicVolume' | 'sfxVolume';
        this.cb.onUpdateAudioSettings({ [prop]: Number(rng.value) / 100 });
      });
    });

    this.optionsOverlay
      .querySelectorAll<HTMLInputElement>('[data-opt-audio-bool]')
      .forEach((chk) => {
        chk.addEventListener('change', () => {
          this.cb.onUpdateAudioSettings({ muted: chk.checked });
        });
      });

    this.optionsOverlay.querySelectorAll<HTMLInputElement>('[data-opt-dz]').forEach((rng) => {
      rng.addEventListener('input', () => {
        const prop = rng.dataset.optDz as keyof DeadzoneSettings;
        this.cb.onUpdateDeadzones({ [prop]: Number(rng.value) / 100 });
      });
    });

    this.optionsOverlay.querySelectorAll<HTMLButtonElement>('[data-rebind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.rebind as keyof KeyBindings;
        this.listeningKeyAction = action;
        this.lastOptionsKey = '';
        this.cb.onRebindKey(action, () => {
          this.listeningKeyAction = null;
          this.lastOptionsKey = '';
        });
      });
    });

    this.optionsOverlay.querySelector('[data-action="reset-keys"]')?.addEventListener('click', () => {
      this.cb.onUiSound('back');
      this.cb.onResetKeyBindings();
    });

    this.optionsOverlay.querySelector('[data-action="close-options"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.closeOptions();
    });
  }

  private renderRankCeremony(
    state: SimState,
    deviceMode: InputDeviceMode,
    bindings: KeyBindings,
  ): void {
    if (!this.rankOverlay) return;
    const summary = state.lastRankSummary;
    const isVictory = state.screen === 'victory';
    const key = JSON.stringify({ isVictory, summary, mode: deviceMode });
    if (key === this.lastRankKey) return;
    this.lastRankKey = key;

    const rank: RankGrade = summary?.rank ?? state.stageStats.rank ?? 'D';
    const title = isVictory
      ? 'TOWER CONQUERED!'
      : summary?.name?.toUpperCase() ?? 'STAGE CLEAR!';
    const score = summary?.score ?? state.stageStats.score;
    const sTarget = summary?.sRankTarget ?? state.stageStats.sRankTarget;
    const toppins = summary?.toppinsCount ?? state.stageStats.toppinsCollected.filter(Boolean).length;
    const secrets = summary?.secretsCount ?? state.stageStats.secretsFound.filter(Boolean).length;
    const treasure = summary?.treasureCollected ?? state.stageStats.treasureCollected;
    const lap2 = summary?.lap2Done ?? state.stageStats.lap2Done;
    const maxCombo = summary?.maxCombo ?? state.player.maxCombo;
    const elapsed = summary?.elapsedTicks ?? state.stageStats.elapsedTicks;
    const cashEarned = summary?.cashEarned ?? 0;
    const unlockedPalettes = summary?.newlyUnlockedPalettes ?? [];
    const unlockedTasks = summary?.newlyCompletedTasks ?? [];

    const unlocksHtml =
      unlockedPalettes.length > 0 || unlockedTasks.length > 0
        ? `
          <div class="kt-section-label">NEW UNLOCKS!</div>
          <div class="kt-unlocks-list">
            ${unlockedPalettes
              .map((p) => {
                const label = PALETTE_MAP[p]?.name ?? p.replace(/_/g, ' ');
                return `<span class="kt-unlock-chip">COSTUME: ${escapeHtml(label.toUpperCase())}</span>`;
              })
              .join('')}
            ${unlockedTasks
              .map((t) => {
                const taskObj = CHEF_TASKS.find((item) => item.id === t);
                const label = taskObj?.name ?? t.replace(/^task_/, '').replace(/_/g, ' ');
                return `<span class="kt-unlock-chip">TASK: ${escapeHtml(label.toUpperCase())}</span>`;
              })
              .join('')}
          </div>
        `
        : '';

    this.rankOverlay.innerHTML = `
      <div class="kt-card kt-card--rank">
        <h2 class="kt-modal-title">${escapeHtml(title)}</h2>
        <div class="kt-rank-layout">
          <div class="kt-rank-stamp-wrap">
            <div class="kt-rank-stamp" data-rank="${rank}">${rank}</div>
            <div style="margin-top:8px;font-family:var(--kt-font-display);font-size:15px;color:#5b2c91">
              ${rank === 'P' ? 'PERFECT P-RANK!' : rank === 'S' ? 'SUPREME RUN!' : 'RANK AWARDED'}
            </div>
          </div>
          <div class="kt-rank-stats">
            <div class="kt-stat-tile"><div class="kt-stat-k">SCORE / TARGET</div><div class="kt-stat-v">${score.toLocaleString('en-US')} / ${sTarget.toLocaleString('en-US')}</div></div>
            <div class="kt-stat-tile"><div class="kt-stat-k">TOPPIN PALS</div><div class="kt-stat-v">${toppins} / 5</div></div>
            <div class="kt-stat-tile"><div class="kt-stat-k">SECRETS</div><div class="kt-stat-v">${secrets} / 3</div></div>
            <div class="kt-stat-tile"><div class="kt-stat-k">GERRY TREASURE</div><div class="kt-stat-v">${treasure ? 'COLLECTED' : 'MISSED'}</div></div>
            <div class="kt-stat-tile"><div class="kt-stat-k">LAP 2</div><div class="kt-stat-v">${lap2 ? 'CLEARED!' : '—'}</div></div>
            <div class="kt-stat-tile"><div class="kt-stat-k">MAX COMBO</div><div class="kt-stat-v">${maxCombo}x</div></div>
            <div class="kt-stat-tile"><div class="kt-stat-k">CLEAR TIME</div><div class="kt-stat-v">${formatDuration(elapsed)}</div></div>
            <div class="kt-stat-tile"><div class="kt-stat-k">CASH EARNED</div><div class="kt-stat-v">+$${cashEarned}</div></div>
          </div>
        </div>
        ${unlocksHtml}
        <div class="kt-btn-row">
          <button type="button" class="kt-btn kt-btn--primary" data-rank-btn="hub">CONTINUE TO HUB</button>
          ${
            isVictory
              ? '<button type="button" class="kt-btn" data-rank-btn="title">TITLE SCREEN</button>'
              : '<button type="button" class="kt-btn kt-btn--accent" data-rank-btn="retry">RETRY</button>'
          }
        </div>
        <div class="kt-footer-hint">
          <span>${renderActionGlyphHtml('confirm', deviceMode, bindings)} CONTINUE</span>
        </div>
      </div>
    `;

    this.rankOverlay.querySelector('[data-rank-btn="hub"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.cb.onReturnToHub();
    });
    this.rankOverlay.querySelector('[data-rank-btn="retry"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.cb.onRestartStage();
    });
    this.rankOverlay.querySelector('[data-rank-btn="title"]')?.addEventListener('click', () => {
      this.cb.onUiSound('back');
      this.cb.onReturnToTitle();
    });
  }

  private renderGameOver(state: SimState): void {
    if (!this.gameOverOverlay) return;
    const reason = state.gameOverReason ?? 'TIME UP — MEGA-CRUST CAUGHT YOU!';
    if (reason === this.lastGameOverKey) return;
    this.lastGameOverKey = reason;

    this.gameOverOverlay.innerHTML = `
      <div class="kt-card kt-card--narrow">
        <h2 class="kt-modal-title">KRUNKED OUT!</h2>
        <p style="text-align:center;font-weight:800;margin:8px 0 14px">${escapeHtml(reason)}</p>
        <div class="kt-btn-stack">
          <button type="button" class="kt-btn kt-btn--primary" data-go="retry">TRY AGAIN</button>
          <button type="button" class="kt-btn" data-go="hub">RETURN TO HUB</button>
        </div>
      </div>
    `;

    this.gameOverOverlay.querySelector('[data-go="retry"]')?.addEventListener('click', () => {
      this.cb.onUiSound('confirm');
      this.cb.onRestartStage();
    });
    this.gameOverOverlay.querySelector('[data-go="hub"]')?.addEventListener('click', () => {
      this.cb.onUiSound('back');
      this.cb.onReturnToHub();
    });
  }

  private buildDevDrawerStatic(): void {
    if (!this.devDrawer) return;
    const floors: FloorId[] = [1, 2, 3, 4, 5];
    const bossIds = Object.keys(BOSSES) as BossId[];

    this.devDrawer.innerHTML = `
      <div class="kt-dev-header">
        <span>F9 PLAYTEST DEV DRAWER</span>
        <button type="button" class="kt-dev-btn" data-dev-close>✕</button>
      </div>
      <div class="kt-dev-body">
        <div class="kt-dev-group">
          <div class="kt-dev-group-title">LIVE SIM TELEMETRY</div>
          <div class="kt-dev-meta" data-dev-meta>Ready</div>
        </div>

        <div class="kt-dev-group">
          <div class="kt-dev-group-title">CHARACTER & TOOLS</div>
          <div class="kt-dev-grid">
            <button type="button" class="kt-dev-btn" data-dev-char="peppo">Chef Peppo</button>
            <button type="button" class="kt-dev-btn" data-dev-char="static">The Static</button>
            <button type="button" class="kt-dev-btn" data-dev-action="escape">Trigger Escape</button>
            <button type="button" class="kt-dev-btn" data-dev-action="lap2">Trigger Lap 2</button>
            <button type="button" class="kt-dev-btn" data-dev-action="sim-touch">Simulate Touch</button>
            <button type="button" class="kt-dev-btn" data-dev-action="hitboxes">Hitboxes</button>
            <button type="button" class="kt-dev-btn" data-dev-action="unlock-all">Unlock All</button>
            <button type="button" class="kt-dev-btn" data-dev-action="boss-dmg">Boss -1 HP</button>
          </div>
        </div>

        <div class="kt-dev-group">
          <div class="kt-dev-group-title">WARP FLOOR HUBS</div>
          <div class="kt-dev-grid">
            ${floors.map((f) => `<button type="button" class="kt-dev-btn" data-dev-hub="${f}">Floor ${f}</button>`).join('')}
          </div>
        </div>

        <div class="kt-dev-group">
          <div class="kt-dev-group-title">WARP STAGES (ALL ${STAGE_ORDER.length})</div>
          <div class="kt-dev-grid">
            ${STAGE_ORDER.map((id: StageId) => {
              const def = LEVELS[id];
              return `<button type="button" class="kt-dev-btn" data-dev-stage="${id}">${escapeHtml(def?.name ?? id)}</button>`;
            }).join('')}
          </div>
        </div>

        <div class="kt-dev-group">
          <div class="kt-dev-group-title">WARP BOSSES (5)</div>
          <div class="kt-dev-grid">
            ${bossIds
              .map((id) => {
                const b = BOSSES[id];
                return `<button type="button" class="kt-dev-btn" data-dev-boss="${id}">${escapeHtml(b?.name ?? id)}</button>`;
              })
              .join('')}
          </div>
        </div>

        <div class="kt-dev-group">
          <div class="kt-dev-group-title">TRANSFORMATIONS (${TRANSFORMATIONS.length})</div>
          <div class="kt-dev-grid">
            ${TRANSFORMATIONS.map(
              (t) => `<button type="button" class="kt-dev-btn" data-dev-transfo="${t}">${t}</button>`,
            ).join('')}
          </div>
        </div>

        <div class="kt-dev-group">
          <div class="kt-dev-group-title">PALETTE COSTUMES (${PALETTES.length})</div>
          <div class="kt-dev-grid">
            ${PALETTES.map(
              (p: PaletteDef) =>
                `<button type="button" class="kt-dev-btn" data-dev-pal="${p.id}"><span class="kt-palette-swatch" style="background:${p.ramp[1]}"></span>${escapeHtml(p.name)}</button>`,
            ).join('')}
          </div>
        </div>

        <div class="kt-dev-group">
          <div class="kt-dev-group-title">RANK CEREMONY PREVIEW</div>
          <div class="kt-dev-grid">
            ${RANKS.map((r) => `<button type="button" class="kt-dev-btn" data-dev-rank="${r}">Rank ${r}</button>`).join('')}
          </div>
        </div>
      </div>
    `;

    this.devDrawer.querySelector('[data-dev-close]')?.addEventListener('click', () => {
      this.toggleDevDrawer(false);
    });

    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-char]').forEach((b) => {
      b.addEventListener('click', () => {
        this.cb.onSelectCharacter(b.dataset.devChar === 'static' ? 'static' : 'peppo');
      });
    });

    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-hub]').forEach((b) => {
      b.addEventListener('click', () => {
        this.cb.onWarpHub(Number(b.dataset.devHub) as FloorId);
      });
    });

    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-stage]').forEach((b) => {
      b.addEventListener('click', () => {
        this.cb.onWarpStage(b.dataset.devStage as StageId);
      });
    });

    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-boss]').forEach((b) => {
      b.addEventListener('click', () => {
        this.cb.onWarpBoss(b.dataset.devBoss as BossId);
      });
    });

    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-transfo]').forEach((b) => {
      b.addEventListener('click', () => {
        this.cb.onSetTransformation(b.dataset.devTransfo as TransformationId);
      });
    });

    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-pal]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.devPal) this.cb.onSetPalette(b.dataset.devPal);
      });
    });

    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-rank]').forEach((b) => {
      b.addEventListener('click', () => {
        this.cb.onRankPreview(b.dataset.devRank as RankGrade);
      });
    });

    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-action]').forEach((b) => {
      b.addEventListener('click', () => {
        switch (b.dataset.devAction) {
          case 'escape':
            this.cb.onTriggerEscape();
            break;
          case 'lap2':
            this.cb.onTriggerLap2();
            break;
          case 'sim-touch':
            this.cb.onToggleSimulateTouch();
            break;
          case 'hitboxes': {
            const active = b.classList.contains('is-active');
            this.cb.onUpdateRenderSettings({ showHitboxes: !active });
            break;
          }
          case 'unlock-all':
            this.cb.onUnlockAll();
            break;
          case 'boss-dmg':
            this.cb.onDamageBoss(1);
            break;
          default:
            break;
        }
      });
    });
  }

  private syncDevDrawerLive(
    state: SimState,
    renderSettings: RenderSettings,
    touchActive: boolean,
    deviceMode: InputDeviceMode,
    stateHash: string,
  ): void {
    if (!this.devDrawer) return;
    if (this.lastDevMetaTick === state.tick && state.tick > 0) return;
    this.lastDevMetaTick = state.tick;

    const metaEl = this.devDrawer.querySelector('[data-dev-meta]');
    if (metaEl) {
      metaEl.textContent =
        `Tick ${state.tick} | Hash ${stateHash} | ${state.screen.toUpperCase()} (${state.stageId ?? state.bossId ?? `F${state.floor}`})\n` +
        `Pos (${state.player.x.toFixed(1)}, ${state.player.y.toFixed(1)}) Spd ${state.player.movespeed.toFixed(2)} | ${state.player.state} | ${state.player.transformation}\n` +
        `Input: ${deviceMode.toUpperCase()} | TouchOverlay: ${touchActive ? 'VISIBLE' : 'HIDDEN'} | Palette: ${state.paletteId}`;
    }

    this.devDrawer
      .querySelector('[data-dev-action="sim-touch"]')
      ?.classList.toggle('is-active', touchActive);
    this.devDrawer
      .querySelector('[data-dev-action="hitboxes"]')
      ?.classList.toggle('is-active', renderSettings.showHitboxes);
    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-char]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.devChar === state.character);
    });
    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-pal]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.devPal === state.paletteId);
    });
    this.devDrawer.querySelectorAll<HTMLButtonElement>('[data-dev-transfo]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.devTransfo === state.player.transformation);
    });
  }

  public dispose(): void {
    this.titleOverlay?.remove();
    this.pauseOverlay?.remove();
    this.optionsOverlay?.remove();
    this.rankOverlay?.remove();
    this.gameOverOverlay?.remove();
    this.devDrawer?.remove();
    this.packInput?.remove();
  }
}
