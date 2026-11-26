import {
  AssetSourceMode,
  AudioEngineAPI,
  BossId,
  createNeutralInput,
  DebugBridge,
  ENGINE_CONSTANTS,
  FloorId,
  InputDeviceMode,
  InputFrame,
  PerfStats,
  PlayableCharacter,
  RankGrade,
  RendererAPI,
  RenderSettings,
  SimCommand,
  SimEvent,
  SimState,
  StageId,
  TransformationId,
} from '../contracts/index';
import { AudioEngine } from '../audio/AudioEngine';
import { InputRouter } from '../input/InputRouter';
import { WebGL2Renderer } from '../render/WebGL2Renderer';
import { hashSimState } from '../sim/hash';
import { createInitialSimState, dispatchCommand, stepSim } from '../sim/step';
import { UIManager } from '../ui/UIManager';
import { SaveManager } from './SaveManager';

const MAX_CATCHUP_STEPS = 5;
const INITIAL_SEED = 0x4b52554e;

export interface GameAppOptions {
  canvas: HTMLCanvasElement;
  hudHost: HTMLElement | null;
  touchHost: HTMLElement | null;
  uiHost: HTMLElement | null;
  toastHost: HTMLElement | null;
  viewportHost?: HTMLElement | null;
}

function stripEdgeFlags(input: InputFrame): InputFrame {
  return {
    ...input,
    jumpPressed: false,
    jumpReleased: false,
    grabPressed: false,
    machPressed: false,
    tauntPressed: false,
    superTauntPressed: false,
    shootPressed: false,
    shootReleased: false,
    pausePressed: false,
    restartPressed: false,
  };
}

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly viewportHost: HTMLElement | null;
  private readonly saveManager: SaveManager;
  private readonly renderer: RendererAPI;
  private readonly audio: AudioEngineAPI;
  private readonly inputRouter: InputRouter;
  private readonly ui: UIManager;

  private state: SimState;
  private rafId: number | null = null;
  private running = false;
  private audioUnlocked = false;

  private lastLoopTime = 0;
  private lastRenderTime = 0;
  private accumulator = 0;
  private playTicksSinceSave = 0;
  private cachedStateHash = '00000000';
  private lastHashedTick = -1;
  private pendingSimEdges = {
    jumpPressed: false,
    jumpReleased: false,
    grabPressed: false,
    machPressed: false,
    tauntPressed: false,
    superTauntPressed: false,
    shootPressed: false,
    shootReleased: false,
  };

  // Performance metrics
  private emaFps = 60;
  private lastSimMs = 0;
  private lastRenderMs = 0;
  private customAudioObjectUrls: string[] = [];
  private resizeObserver: ResizeObserver | null = null;

  private readonly handleWindowResize = (): void => {
    this.syncCanvasSize();
  };

  constructor(options: GameAppOptions) {
    this.canvas = options.canvas;
    this.viewportHost = options.viewportHost ?? options.canvas.parentElement;

    this.saveManager = new SaveManager();
    const saveData = this.saveManager.getData();

    this.renderer = new WebGL2Renderer();
    this.audio = new AudioEngine();
    this.audio.applySettings(saveData.audioSettings);

    const activeSlot = this.saveManager.getActiveSlot();
    this.state = createInitialSimState(INITIAL_SEED, activeSlot.character);
    this.saveManager.applySlotToSim(this.state);
    this.cachedStateHash = hashSimState(this.state);
    this.lastHashedTick = this.state.tick;

    this.inputRouter = new InputRouter({
      touchHost: options.touchHost,
      keyBindings: saveData.keyBindings,
      deadzones: saveData.deadzones,
      renderSettings: saveData.renderSettings,
      callbacks: {
        onUserGesture: () => this.unlockAudioOnce(),
        onDeviceModeChange: () => this.syncUiNow(),
        onGamepadConnect: (name) => {
          this.ui.showToast(`CONTROLLER CONNECTED: ${name}`, 'info', 2600);
        },
        onGamepadDisconnect: (name) => {
          this.ui.showToast(`CONTROLLER DISCONNECTED: ${name}`, 'warn', 3200);
          if (
            (this.state.screen === 'stage' || this.state.screen === 'boss') &&
            !this.state.paused &&
            !this.state.gameOver
          ) {
            this.runCommand({ type: 'set_paused', paused: true });
            this.ui.showToast('AUTO-PAUSED — CONTROLLER DISCONNECTED', 'warn', 3600);
          }
        },
        onToggleDevDrawer: () => {
          this.ui.toggleDevDrawer();
          this.syncUiNow();
        },
        onTouchPauseTap: () => {
          this.unlockAudioOnce();
        },
      },
    });

    this.ui = new UIManager({
      hudHost: options.hudHost,
      uiHost: options.uiHost,
      toastHost: options.toastHost,
      callbacks: {
        onSelectSlot: (slotIndex) => {
          const slot = this.saveManager.setActiveSlot(slotIndex);
          this.saveManager.applySlotToSim(this.state);
          this.state.character = slot.character;
          this.syncUiNow();
        },
        onResetSlot: (slotIndex) => {
          this.saveManager.resetSlot(slotIndex);
          if (this.saveManager.getData().activeSlot === slotIndex) {
            this.saveManager.applySlotToSim(this.state);
          }
          this.ui.showToast(`SLOT ${slotIndex + 1} RESET`, 'info');
          this.syncUiNow();
        },
        onSelectCharacter: (character) => {
          const activeIdx = this.saveManager.getData().activeSlot;
          this.saveManager.setSlotCharacter(activeIdx, character);
          this.runCommand({ type: 'set_character', character });
        },
        onStartRun: () => {
          this.unlockAudioOnce();
          const slot = this.saveManager.getActiveSlot();
          this.saveManager.applySlotToSim(this.state);
          this.runCommand({ type: 'start_campaign', character: slot.character });
        },
        onStartTutorial: () => {
          this.unlockAudioOnce();
          const slot = this.saveManager.getActiveSlot();
          this.saveManager.applySlotToSim(this.state);
          this.runCommand({ type: 'set_character', character: slot.character });
          this.runCommand({ type: 'enter_stage', stageId: 'tutorial' });
        },
        onResume: () => {
          this.runCommand({ type: 'set_paused', paused: false });
        },
        onRestartStage: () => {
          this.runCommand({ type: 'restart_stage' });
        },
        onReturnToHub: () => {
          this.runCommand({ type: 'return_to_hub' });
        },
        onReturnToTitle: () => {
          this.saveManager.updateSlotFromSim(this.state, this.playTicksSinceSave);
          this.playTicksSinceSave = 0;
          this.ui.menus.closeOptions();
          this.state.paused = false;
          this.state.gameOver = false;
          this.state.screen = 'title';
          this.audio.playMusic('title', true);
          this.syncUiNow();
        },
        onUpdateRenderSettings: (partial) => {
          const updated = this.saveManager.updateRenderSettings(partial);
          this.inputRouter.applyRenderSettings(updated);
          this.syncCanvasSize();
          this.syncUiNow();
        },
        onUpdateAudioSettings: (partial) => {
          const updated = this.saveManager.updateAudioSettings(partial);
          this.audio.applySettings(updated);
          this.syncUiNow();
        },
        onUpdateDeadzones: (partial) => {
          const updated = this.saveManager.updateDeadzones(partial);
          this.inputRouter.setDeadzones(updated);
          this.syncUiNow();
        },
        onRebindKey: (action, done) => {
          this.inputRouter.keyboard.startCapture((code) => {
            if (code) {
              const updated = this.saveManager.updateKeyBindings({ [action]: code });
              this.inputRouter.setKeyBindings(updated);
            }
            done();
            this.syncUiNow();
          });
        },
        onResetKeyBindings: () => {
          const reset = this.saveManager.resetKeyBindings();
          this.inputRouter.setKeyBindings(reset);
          this.syncUiNow();
        },
        onLoadCustomPackFiles: (files) => {
          void this.loadCustomPackFiles(files);
        },
        onSetAssetMode: (mode) => {
          this.setAssetMode(mode);
        },
        onWarpHub: (floor) => {
          this.ui.menus.closeOptions();
          this.runCommand({ type: 'enter_hub', floor });
        },
        onWarpStage: (stageId) => {
          this.ui.menus.closeOptions();
          this.runCommand({ type: 'enter_stage', stageId });
        },
        onWarpBoss: (bossId) => {
          this.ui.menus.closeOptions();
          this.runCommand({ type: 'enter_boss', bossId });
        },
        onSetTransformation: (transformation) => {
          this.runCommand({ type: 'debug_set_transformation', transformation });
        },
        onSetPalette: (paletteId) => {
          this.runCommand({ type: 'set_palette', paletteId });
          this.saveManager.updateSlotFromSim(this.state);
        },
        onTriggerEscape: () => {
          this.runCommand({ type: 'debug_trigger_escape' });
        },
        onTriggerLap2: () => {
          this.runCommand({ type: 'debug_trigger_lap2' });
        },
        onToggleSimulateTouch: () => {
          this.inputRouter.simulateTouch(!this.inputRouter.isTouchActive());
          this.syncUiNow();
        },
        onUnlockAll: () => {
          this.runCommand({ type: 'debug_unlock_all' });
          this.saveManager.updateSlotFromSim(this.state);
          this.ui.showToast('ALL FLOORS, PALETTES & $999 UNLOCKED!', 'info');
        },
        onDamageBoss: (amount) => {
          this.runCommand({ type: 'debug_damage_boss', amount });
        },
        onRankPreview: (rank) => {
          this.ui.menus.closeOptions();
          this.runCommand({ type: 'debug_force_rank', rank });
        },
        onUiSound: (kind) => {
          this.unlockAudioOnce();
          const sfx = kind === 'confirm' ? 'ui_confirm' : kind === 'back' ? 'ui_back' : 'ui_move';
          this.audio.playSfx(sfx);
        },
      },
    });

    this.renderer.init(this.canvas);
    this.syncCanvasSize();
    this.attachResizeHandlers();

    if (saveData.useCustomPack) {
      this.renderer.setAssetMode('custom');
    } else {
      this.renderer.setAssetMode('builtin');
    }

    this.installDebugBridge();
    this.probeDevCustomAudio();
    this.syncUiNow();
  }

  private attachResizeHandlers(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleWindowResize);
      window.addEventListener('orientationchange', this.handleWindowResize);
    }
    if (typeof ResizeObserver !== 'undefined' && this.viewportHost) {
      this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
      this.resizeObserver.observe(this.viewportHost);
    }
  }

  private syncCanvasSize(): void {
    const rect = this.viewportHost?.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect?.width || window.innerWidth || ENGINE_CONSTANTS.VIEWPORT_W));
    const height = Math.max(180, Math.floor(rect?.height || window.innerHeight || ENGINE_CONSTANTS.VIEWPORT_H));
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    this.renderer.resize(width, height, dpr);
  }

  private unlockAudioOnce(): void {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.audio.unlock();
    this.audio.applySettings(this.saveManager.getData().audioSettings);
    if (this.state.screen === 'title') {
      this.audio.playMusic('title');
    }
  }

  private clearPendingSimEdges(): void {
    this.pendingSimEdges.jumpPressed = false;
    this.pendingSimEdges.jumpReleased = false;
    this.pendingSimEdges.grabPressed = false;
    this.pendingSimEdges.machPressed = false;
    this.pendingSimEdges.tauntPressed = false;
    this.pendingSimEdges.superTauntPressed = false;
    this.pendingSimEdges.shootPressed = false;
    this.pendingSimEdges.shootReleased = false;
  }

  private blurFocusedUiElement(): void {
    if (typeof document === 'undefined') return;
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === 'function' && active !== document.body) {
      active.blur();
    }
  }

  private runCommand(cmd: SimCommand): void {
    dispatchCommand(this.state, cmd);
    if (!this.ui.isModalBlockingGameplay(this.state)) {
      this.clearPendingSimEdges();
      this.blurFocusedUiElement();
    }
    if (this.state.events.length > 0) {
      const drained = this.state.events.splice(0, this.state.events.length);
      this.processSimEvents(drained);
    }
    this.cachedStateHash = hashSimState(this.state);
    this.lastHashedTick = this.state.tick;
    this.syncUiNow();
  }

  private processSimEvents(events: readonly SimEvent[]): void {
    if (events.length === 0) return;
    this.audio.consumeEvents(events);
    this.renderer.consumeEvents(events);

    let needsSave = false;
    for (const ev of events) {
      if (ev.type === 'rumble') {
        this.inputRouter.rumble(ev.strong, ev.weak, ev.durationMs);
      } else if (ev.type === 'save_dirty' || ev.type === 'rank_achieved') {
        needsSave = true;
      } else if (ev.type === 'lap2_started') {
        this.ui.showToast('LAP 2 ENGAGED! +3000 PTS', 'info', 2200);
      } else if (ev.type === 'mega_crust_spawned') {
        this.ui.showToast('MEGA-CRUST IS HUNTING YOU!', 'warn', 2800);
      }
    }

    if (needsSave) {
      this.saveManager.updateSlotFromSim(this.state, this.playTicksSinceSave);
      this.playTicksSinceSave = 0;
    }
  }

  private setAssetMode(mode: AssetSourceMode): void {
    this.renderer.setAssetMode(mode);
    const status = this.renderer.getCustomPackStatus();
    const effectiveCustom = mode === 'custom' && status.active;
    this.saveManager.setUseCustomPack(effectiveCustom);
    this.ui.showToast(
      effectiveCustom ? 'SWITCHED TO CUSTOM PACK' : 'SWITCHED TO BUILT-IN KRUNKED ART',
      'info',
      2000,
    );
    this.syncUiNow();
  }

  private async loadCustomPackFiles(files: FileList | File[]): Promise<void> {
    try {
      const status = await this.renderer.loadCustomPackFiles(files);

      // Extract any audio files for AudioEngine custom overrides
      const list = Array.from(files);
      const audioMap = new Map<string, string>();
      this.revokeCustomAudioUrls();
      for (const file of list) {
        if (/\.(ogg|wav|mp3)$/i.test(file.name)) {
          const url = URL.createObjectURL(file);
          this.customAudioObjectUrls.push(url);
          const base = file.name.replace(/\.[^.]+$/, '');
          audioMap.set(base, url);
          const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
          if (rel) audioMap.set(rel, url);
        }
      }
      if (audioMap.size > 0) {
        this.audio.setCustomAudioMap(audioMap);
      }

      if (status.available) {
        this.renderer.setAssetMode('custom');
        this.saveManager.setUseCustomPack(true);
        this.ui.showToast(
          `CUSTOM PACK LOADED (${status.spriteCount} SPRITES, ${Math.max(status.audioCount, audioMap.size)} AUDIO)`,
          'info',
          3000,
        );
      } else {
        this.ui.showToast(status.error ?? 'NO VALID CUSTOM PACK FOUND IN FOLDER', 'warn', 3200);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load custom pack';
      this.ui.showToast(msg, 'warn', 3200);
    }
    this.syncUiNow();
  }

  private probeDevCustomAudio(): void {
    if (typeof fetch !== 'function') return;
    fetch('/custom-pack/manifest.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((manifest: { audio?: Record<string, string> } | null) => {
        if (!manifest || !manifest.audio || typeof manifest.audio !== 'object') return;
        const map = new Map<string, string>();
        for (const [k, relPath] of Object.entries(manifest.audio)) {
          if (typeof relPath === 'string' && relPath.length > 0) {
            const url = relPath.startsWith('/') ? relPath : `/custom-pack/${relPath.replace(/^\/+/, '')}`;
            map.set(k, url);
          }
        }
        if (map.size > 0) {
          this.audio.setCustomAudioMap(map);
        }
      })
      .catch(() => {
        // Optional local custom pack absent — built-in audio remains active
      });
  }

  private revokeCustomAudioUrls(): void {
    for (const url of this.customAudioObjectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    }
    this.customAudioObjectUrls = [];
  }

  private getMergedPerfStats(): PerfStats {
    const rPerf = this.renderer.getPerfStats();
    const targetFps = this.saveManager.getData().renderSettings.targetFps;
    return {
      fps: this.emaFps,
      simMs: this.lastSimMs,
      renderMs: this.lastRenderMs || rPerf.renderMs,
      drawCalls: rPerf.drawCalls,
      activeParticles: rPerf.activeParticles,
      activeAfterimages: rPerf.activeAfterimages,
      targetFps,
    };
  }

  private syncUiNow(): void {
    if (this.lastHashedTick !== this.state.tick) {
      this.cachedStateHash = hashSimState(this.state);
      this.lastHashedTick = this.state.tick;
    }
    this.ui.sync(
      this.state,
      this.saveManager.getData(),
      this.inputRouter.getDeviceMode(),
      this.getMergedPerfStats(),
      this.renderer.getCustomPackStatus(),
      this.inputRouter.isTouchActive(),
      this.cachedStateHash,
    );
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastLoopTime = performance.now();
    this.lastRenderTime = this.lastLoopTime;
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return;

    const rawDt = Math.max(0, (now - this.lastLoopTime) / 1000);
    this.lastLoopTime = now;
    const clampedDt = Math.min(0.25, rawDt);

    // Poll multi-device input once per animation frame
    const isHighMach =
      this.state.player.state === 'mach3' ||
      this.state.player.state === 'mach4' ||
      this.state.player.state === 'sjump_prep';
    const hasWeapon = this.state.player.hasRevolver || this.state.player.hasShotgun;
    const polledInput = this.inputRouter.poll({ isHighMach, hasWeapon });
    const menuNav = this.inputRouter.getLastMenuNav();

    // Global Pause / Options close / Quick Restart handling
    if (this.ui.menus.isOptionsOpen()) {
      if (polledInput.pausePressed) {
        this.ui.menus.closeOptions();
        this.syncUiNow();
      } else {
        this.ui.handleMenuNav(menuNav, this.state);
      }
    } else if (
      polledInput.pausePressed &&
      !this.state.gameOver &&
      (this.state.screen === 'hub' || this.state.screen === 'stage' || this.state.screen === 'boss')
    ) {
      this.runCommand({ type: 'set_paused', paused: !this.state.paused });
    } else if (this.ui.isModalBlockingGameplay(this.state)) {
      this.ui.handleMenuNav(menuNav, this.state);
    } else if (
      polledInput.restartPressed &&
      (this.state.screen === 'stage' || this.state.screen === 'boss')
    ) {
      this.runCommand({ type: 'restart_stage' });
    }

    // Fixed 60 Hz deterministic simulation catch-up loop (max 5 catch-up steps)
    // Latch edge-triggered presses across >60 Hz rAF frames so quick taps are NEVER dropped!
    const canSimulate = !this.ui.isModalBlockingGameplay(this.state);
    if (canSimulate) {
      this.pendingSimEdges.jumpPressed = this.pendingSimEdges.jumpPressed || polledInput.jumpPressed;
      this.pendingSimEdges.jumpReleased = this.pendingSimEdges.jumpReleased || polledInput.jumpReleased;
      this.pendingSimEdges.grabPressed = this.pendingSimEdges.grabPressed || polledInput.grabPressed;
      this.pendingSimEdges.machPressed = this.pendingSimEdges.machPressed || polledInput.machPressed;
      this.pendingSimEdges.tauntPressed = this.pendingSimEdges.tauntPressed || polledInput.tauntPressed;
      this.pendingSimEdges.superTauntPressed =
        this.pendingSimEdges.superTauntPressed || polledInput.superTauntPressed;
      this.pendingSimEdges.shootPressed = this.pendingSimEdges.shootPressed || polledInput.shootPressed;
      this.pendingSimEdges.shootReleased = this.pendingSimEdges.shootReleased || polledInput.shootReleased;

      this.accumulator += clampedDt;
      const fixedDt = ENGINE_CONSTANTS.FIXED_DT;
      let steps = 0;
      const simStart = performance.now();

      while (this.accumulator >= fixedDt && steps < MAX_CATCHUP_STEPS) {
        let tickInput: InputFrame;
        if (steps === 0) {
          tickInput = {
            ...polledInput,
            jumpPressed: this.pendingSimEdges.jumpPressed,
            jumpReleased: this.pendingSimEdges.jumpReleased,
            grabPressed: this.pendingSimEdges.grabPressed,
            machPressed: this.pendingSimEdges.machPressed,
            tauntPressed: this.pendingSimEdges.tauntPressed,
            superTauntPressed: this.pendingSimEdges.superTauntPressed,
            shootPressed: this.pendingSimEdges.shootPressed,
            shootReleased: this.pendingSimEdges.shootReleased,
          };
          this.clearPendingSimEdges();
        } else {
          tickInput = stripEdgeFlags(polledInput);
        }
        const events = stepSim(this.state, tickInput);
        this.processSimEvents(events);
        this.accumulator -= fixedDt;
        steps++;
        this.playTicksSinceSave++;

        // Stop stepping immediately if sim transitioned into a modal screen
        if (this.ui.isModalBlockingGameplay(this.state)) {
          this.accumulator = 0;
          this.clearPendingSimEdges();
          break;
        }
      }

      if (steps > 0) {
        this.lastSimMs = performance.now() - simStart;
      }
      if (this.accumulator > fixedDt * MAX_CATCHUP_STEPS) {
        this.accumulator = 0;
      }

      // Periodic autosave every ~30 seconds of active play
      if (this.playTicksSinceSave >= ENGINE_CONSTANTS.SIM_HZ * 30) {
        this.saveManager.updateSlotFromSim(this.state, this.playTicksSinceSave);
        this.playTicksSinceSave = 0;
      }
    } else {
      this.accumulator = 0;
      this.clearPendingSimEdges();
    }

    // Frame-paced render loop (30 / 60 / 120 FPS)
    const renderSettings = this.saveManager.getData().renderSettings;
    const minIntervalMs =
      renderSettings.targetFps >= 120 ? 0 : 1000 / renderSettings.targetFps - 1.5;
    const sinceRender = now - this.lastRenderTime;

    if (sinceRender >= minIntervalMs) {
      if (sinceRender > 0) {
        const instFps = Math.min(240, 1000 / sinceRender);
        this.emaFps = this.emaFps * 0.9 + instFps * 0.1;
      }
      this.lastRenderTime = now;

      const interpAlpha =
        !canSimulate || renderSettings.nativeSnap60
          ? 1
          : Math.max(0, Math.min(1, this.accumulator / ENGINE_CONSTANTS.FIXED_DT));

      const rStart = performance.now();
      this.renderer.render(this.state, interpAlpha, renderSettings);
      this.lastRenderMs = performance.now() - rStart;

      this.syncUiNow();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private installDebugBridge(): void {
    if (typeof window === 'undefined') return;

    const bridge: DebugBridge = {
      getState: () => this.state,
      hash: () => hashSimState(this.state),
      warpStage: (stageId: StageId, character?: PlayableCharacter) => {
        this.ui.menus.closeOptions();
        if (character) {
          this.runCommand({ type: 'set_character', character });
        }
        this.runCommand({ type: 'enter_stage', stageId });
        this.renderer.render(this.state, 1, this.saveManager.getData().renderSettings);
      },
      warpBoss: (bossId: BossId, character?: PlayableCharacter) => {
        this.ui.menus.closeOptions();
        if (character) {
          this.runCommand({ type: 'set_character', character });
        }
        this.runCommand({ type: 'enter_boss', bossId });
        this.renderer.render(this.state, 1, this.saveManager.getData().renderSettings);
      },
      warpHub: (floor?: FloorId) => {
        this.ui.menus.closeOptions();
        this.runCommand({ type: 'enter_hub', floor: floor ?? this.state.floor });
        this.renderer.render(this.state, 1, this.saveManager.getData().renderSettings);
      },
      triggerEscape: () => {
        this.runCommand({ type: 'debug_trigger_escape' });
      },
      triggerLap2: () => {
        this.runCommand({ type: 'debug_trigger_lap2' });
      },
      setTransformation: (transformation: TransformationId) => {
        this.runCommand({ type: 'debug_set_transformation', transformation });
      },
      setCharacter: (character: PlayableCharacter) => {
        this.runCommand({ type: 'set_character', character });
      },
      setPalette: (paletteId: string) => {
        this.runCommand({ type: 'set_palette', paletteId });
      },
      setRankPreview: (rank: RankGrade) => {
        this.ui.menus.closeOptions();
        this.runCommand({ type: 'debug_force_rank', rank });
      },
      damageBoss: (amount: number) => {
        this.runCommand({ type: 'debug_damage_boss', amount });
      },
      stepTicks: (count: number, input?: Partial<InputFrame>): string => {
        const steps = Math.max(0, Math.floor(count));
        const mode: InputDeviceMode = input?.deviceMode ?? this.inputRouter.getDeviceMode();
        const frame: InputFrame = {
          ...createNeutralInput(mode),
          ...input,
        };
        for (let i = 0; i < steps; i++) {
          const tickInput = i === 0 ? frame : stripEdgeFlags(frame);
          const events = stepSim(this.state, tickInput);
          this.processSimEvents(events);
        }
        this.cachedStateHash = hashSimState(this.state);
        this.lastHashedTick = this.state.tick;
        this.renderer.render(this.state, 1, this.saveManager.getData().renderSettings);
        this.syncUiNow();
        return this.cachedStateHash;
      },
      getInputMode: () => this.inputRouter.getDeviceMode(),
      simulateTouch: (active: boolean) => {
        this.inputRouter.simulateTouch(active);
        this.syncUiNow();
      },
      getTouchOverlayVisible: () => this.inputRouter.isTouchActive(),
      getPerfStats: () => this.getMergedPerfStats(),
      setRenderSettings: (partial: Partial<RenderSettings>) => {
        const updated = this.saveManager.updateRenderSettings(partial);
        this.inputRouter.applyRenderSettings(updated);
        this.syncCanvasSize();
        this.syncUiNow();
      },
      unlockAll: () => {
        this.runCommand({ type: 'debug_unlock_all' });
        this.saveManager.updateSlotFromSim(this.state);
      },
    };

    window.__KRUNKED_DEBUG__ = bridge;
  }

  public dispose(): void {
    this.stop();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleWindowResize);
      window.removeEventListener('orientationchange', this.handleWindowResize);
    }
    this.resizeObserver?.disconnect();
    this.revokeCustomAudioUrls();
    this.inputRouter.dispose();
    this.ui.dispose();
    this.renderer.dispose();
    this.audio.dispose();
  }
}
