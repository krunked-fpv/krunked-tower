import {
  AudioSettings,
  BossId,
  DeadzoneSettings,
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_DEADZONES,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_RENDER_SETTINGS,
  FloorId,
  HubState,
  KeyBindings,
  PlayableCharacter,
  RankGrade,
  RenderSettings,
  SAVE_STORAGE_KEY,
  SaveData,
  SaveSlotData,
  SimState,
  StageId,
} from '../contracts/index';

const VALID_RANKS = new Set<RankGrade>(['D', 'C', 'B', 'A', 'S', 'P']);
const VALID_FLOORS = new Set<FloorId>([1, 2, 3, 4, 5]);
const VALID_FPS = new Set<30 | 60 | 120>([30, 60, 120]);

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asCharacter(value: unknown): PlayableCharacter {
  return value === 'static' ? 'static' : 'peppo';
}

function asFloor(value: unknown): FloorId {
  return typeof value === 'number' && VALID_FLOORS.has(value as FloorId)
    ? (value as FloorId)
    : 1;
}

export function createDefaultHubState(): HubState {
  return {
    floor: 1,
    cash: 0,
    bossesDefeated: [],
    stagesCleared: [],
    stageBestRanks: {},
    stageBestScores: {},
    toppinsByStage: {},
    unlockedPalettes: ['classic', 'mint_static'],
    completedTasks: [],
    brokerPaidFloors: [],
  };
}

export function createDefaultSlot(slotIndex: 0 | 1 | 2): SaveSlotData {
  return {
    slotIndex,
    character: 'peppo',
    paletteId: 'classic',
    hub: createDefaultHubState(),
    totalPlayTicks: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

export function createDefaultSaveData(): SaveData {
  return {
    schemaVersion: 1,
    activeSlot: 0,
    slots: [createDefaultSlot(0), createDefaultSlot(1), createDefaultSlot(2)],
    renderSettings: { ...DEFAULT_RENDER_SETTINGS },
    audioSettings: { ...DEFAULT_AUDIO_SETTINGS },
    deadzones: { ...DEFAULT_DEADZONES },
    keyBindings: { ...DEFAULT_KEY_BINDINGS },
    useCustomPack: false,
  };
}

function validateHubState(raw: unknown): HubState {
  const defaults = createDefaultHubState();
  const obj = asRecord(raw);
  if (!obj) return defaults;

  const bossesDefeated = Array.isArray(obj.bossesDefeated)
    ? (obj.bossesDefeated.filter((x): x is BossId => typeof x === 'string') as BossId[])
    : [];

  const stagesCleared = Array.isArray(obj.stagesCleared)
    ? (obj.stagesCleared.filter((x): x is StageId => typeof x === 'string') as StageId[])
    : [];

  const stageBestRanks: Partial<Record<StageId | BossId, RankGrade>> = {};
  const rawRanks = asRecord(obj.stageBestRanks);
  if (rawRanks) {
    for (const [key, val] of Object.entries(rawRanks)) {
      if (typeof val === 'string' && VALID_RANKS.has(val as RankGrade)) {
        stageBestRanks[key as StageId | BossId] = val as RankGrade;
      }
    }
  }

  const stageBestScores: Partial<Record<StageId | BossId, number>> = {};
  const rawScores = asRecord(obj.stageBestScores);
  if (rawScores) {
    for (const [key, val] of Object.entries(rawScores)) {
      if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
        stageBestScores[key as StageId | BossId] = Math.floor(val);
      }
    }
  }

  const toppinsByStage: Partial<Record<StageId, boolean[]>> = {};
  const rawToppins = asRecord(obj.toppinsByStage);
  if (rawToppins) {
    for (const [key, val] of Object.entries(rawToppins)) {
      if (Array.isArray(val)) {
        toppinsByStage[key as StageId] = [0, 1, 2, 3, 4].map((idx) => Boolean(val[idx]));
      }
    }
  }

  const unlockedSet = new Set<string>(['classic', 'mint_static']);
  if (Array.isArray(obj.unlockedPalettes)) {
    for (const p of obj.unlockedPalettes) {
      if (typeof p === 'string' && p.length > 0) unlockedSet.add(p);
    }
  }

  const completedTasks = Array.isArray(obj.completedTasks)
    ? obj.completedTasks.filter((t): t is string => typeof t === 'string')
    : [];

  const brokerPaidFloors = Array.isArray(obj.brokerPaidFloors)
    ? (obj.brokerPaidFloors.filter(
        (f): f is FloorId => typeof f === 'number' && VALID_FLOORS.has(f as FloorId),
      ) as FloorId[])
    : [];

  return {
    floor: asFloor(obj.floor),
    cash: Math.max(0, Math.floor(asNumber(obj.cash, 0))),
    bossesDefeated: Array.from(new Set(bossesDefeated)),
    stagesCleared: Array.from(new Set(stagesCleared)),
    stageBestRanks,
    stageBestScores,
    toppinsByStage,
    unlockedPalettes: Array.from(unlockedSet),
    completedTasks: Array.from(new Set(completedTasks)),
    brokerPaidFloors: Array.from(new Set(brokerPaidFloors)),
  };
}

function validateSlot(raw: unknown, slotIndex: 0 | 1 | 2): SaveSlotData {
  const defaults = createDefaultSlot(slotIndex);
  const obj = asRecord(raw);
  if (!obj) return defaults;

  return {
    slotIndex,
    character: asCharacter(obj.character),
    paletteId: asString(obj.paletteId, 'classic'),
    hub: validateHubState(obj.hub),
    totalPlayTicks: Math.max(0, Math.floor(asNumber(obj.totalPlayTicks, 0))),
    updatedAt: asString(obj.updatedAt, defaults.updatedAt),
  };
}

function validateRenderSettings(raw: unknown): RenderSettings {
  const obj = asRecord(raw);
  if (!obj) return { ...DEFAULT_RENDER_SETTINGS };
  const rawFps = asNumber(obj.targetFps, DEFAULT_RENDER_SETTINGS.targetFps);
  const targetFps = VALID_FPS.has(rawFps as 30 | 60 | 120)
    ? (rawFps as 30 | 60 | 120)
    : DEFAULT_RENDER_SETTINGS.targetFps;
  const scalingMode = obj.scalingMode === 'pixel-perfect' ? 'pixel-perfect' : 'fit';

  return {
    targetFps,
    nativeSnap60: asBoolean(obj.nativeSnap60, DEFAULT_RENDER_SETTINGS.nativeSnap60),
    scalingMode,
    screenShake: asBoolean(obj.screenShake, DEFAULT_RENDER_SETTINGS.screenShake),
    touchOpacity: clamp(asNumber(obj.touchOpacity, DEFAULT_RENDER_SETTINGS.touchOpacity), 0.15, 0.6),
    touchMachLockDefault: asBoolean(
      obj.touchMachLockDefault,
      DEFAULT_RENDER_SETTINGS.touchMachLockDefault,
    ),
    rumble: asBoolean(obj.rumble, DEFAULT_RENDER_SETTINGS.rumble),
    showFps: asBoolean(obj.showFps, DEFAULT_RENDER_SETTINGS.showFps),
    showHitboxes: asBoolean(obj.showHitboxes, DEFAULT_RENDER_SETTINGS.showHitboxes),
  };
}

function validateAudioSettings(raw: unknown): AudioSettings {
  const obj = asRecord(raw);
  if (!obj) return { ...DEFAULT_AUDIO_SETTINGS };
  return {
    masterVolume: clamp(asNumber(obj.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume), 0, 1),
    musicVolume: clamp(asNumber(obj.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume), 0, 1),
    sfxVolume: clamp(asNumber(obj.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume), 0, 1),
    muted: asBoolean(obj.muted, DEFAULT_AUDIO_SETTINGS.muted),
  };
}

function validateDeadzones(raw: unknown): DeadzoneSettings {
  const obj = asRecord(raw);
  if (!obj) return { ...DEFAULT_DEADZONES };
  return {
    general: clamp(asNumber(obj.general, DEFAULT_DEADZONES.general), 0.05, 0.85),
    horizontal: clamp(asNumber(obj.horizontal, DEFAULT_DEADZONES.horizontal), 0.05, 0.85),
    vertical: clamp(asNumber(obj.vertical, DEFAULT_DEADZONES.vertical), 0.05, 0.85),
    crouchWalk: clamp(asNumber(obj.crouchWalk, DEFAULT_DEADZONES.crouchWalk), 0.1, 0.9),
    superjump: clamp(asNumber(obj.superjump, DEFAULT_DEADZONES.superjump), 0.15, 0.95),
  };
}

function validateKeyBindings(raw: unknown): KeyBindings {
  const obj = asRecord(raw);
  if (!obj) return { ...DEFAULT_KEY_BINDINGS };
  return {
    left: asString(obj.left, DEFAULT_KEY_BINDINGS.left),
    right: asString(obj.right, DEFAULT_KEY_BINDINGS.right),
    up: asString(obj.up, DEFAULT_KEY_BINDINGS.up),
    down: asString(obj.down, DEFAULT_KEY_BINDINGS.down),
    jump: asString(obj.jump, DEFAULT_KEY_BINDINGS.jump),
    grab: asString(obj.grab, DEFAULT_KEY_BINDINGS.grab),
    mach: asString(obj.mach, DEFAULT_KEY_BINDINGS.mach),
    taunt: asString(obj.taunt, DEFAULT_KEY_BINDINGS.taunt),
    pause: asString(obj.pause, DEFAULT_KEY_BINDINGS.pause),
    restart: asString(obj.restart, DEFAULT_KEY_BINDINGS.restart),
  };
}

export function validateSaveData(raw: unknown): SaveData {
  const obj = asRecord(raw);
  if (!obj || obj.schemaVersion !== 1) {
    return createDefaultSaveData();
  }

  const rawSlots = Array.isArray(obj.slots) ? obj.slots : [];
  const activeSlot =
    obj.activeSlot === 1 || obj.activeSlot === 2 ? obj.activeSlot : (0 as 0 | 1 | 2);

  return {
    schemaVersion: 1,
    activeSlot,
    slots: [
      validateSlot(rawSlots[0], 0),
      validateSlot(rawSlots[1], 1),
      validateSlot(rawSlots[2], 2),
    ],
    renderSettings: validateRenderSettings(obj.renderSettings),
    audioSettings: validateAudioSettings(obj.audioSettings),
    deadzones: validateDeadzones(obj.deadzones),
    keyBindings: validateKeyBindings(obj.keyBindings),
    useCustomPack: asBoolean(obj.useCustomPack, false),
  };
}

function cloneHub(hub: HubState): HubState {
  const toppinsByStage: Partial<Record<StageId, boolean[]>> = {};
  for (const [k, v] of Object.entries(hub.toppinsByStage)) {
    if (Array.isArray(v)) {
      toppinsByStage[k as StageId] = [...v];
    }
  }
  return {
    floor: hub.floor,
    cash: hub.cash,
    bossesDefeated: [...hub.bossesDefeated],
    stagesCleared: [...hub.stagesCleared],
    stageBestRanks: { ...hub.stageBestRanks },
    stageBestScores: { ...hub.stageBestScores },
    toppinsByStage,
    unlockedPalettes: [...hub.unlockedPalettes],
    completedTasks: [...hub.completedTasks],
    brokerPaidFloors: [...hub.brokerPaidFloors],
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class SaveManager {
  private readonly storageKey: string;
  private readonly storage: StorageLike | null;
  private memoryFallback: string | null = null;
  private data: SaveData;

  constructor(storageKey: string = SAVE_STORAGE_KEY, storageOverride?: StorageLike | null) {
    this.storageKey = storageKey;
    this.storage = storageOverride !== undefined ? storageOverride : SaveManager.detectStorage();
    this.data = this.load();
  }

  private static detectStorage(): StorageLike | null {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
        const probeKey = '__kt_probe__';
        globalThis.localStorage.setItem(probeKey, '1');
        globalThis.localStorage.removeItem(probeKey);
        return globalThis.localStorage;
      }
    } catch {
      return null;
    }
    return null;
  }

  public load(): SaveData {
    let rawText: string | null = null;
    try {
      rawText = this.storage ? this.storage.getItem(this.storageKey) : this.memoryFallback;
    } catch {
      rawText = this.memoryFallback;
    }

    if (!rawText) {
      this.data = createDefaultSaveData();
      return this.data;
    }

    try {
      const parsed: unknown = JSON.parse(rawText);
      this.data = validateSaveData(parsed);
      return this.data;
    } catch {
      this.data = createDefaultSaveData();
      this.save(this.data);
      return this.data;
    }
  }

  public save(nextData?: SaveData): boolean {
    if (nextData) {
      this.data = validateSaveData(nextData);
    }
    try {
      const serialized = JSON.stringify(this.data);
      this.memoryFallback = serialized;
      if (this.storage) {
        this.storage.setItem(this.storageKey, serialized);
      }
      return true;
    } catch {
      return false;
    }
  }

  public getData(): SaveData {
    return this.data;
  }

  public getActiveSlot(): SaveSlotData {
    return this.data.slots[this.data.activeSlot];
  }

  public setActiveSlot(slotIndex: 0 | 1 | 2): SaveSlotData {
    this.data.activeSlot = slotIndex;
    this.save();
    return this.data.slots[slotIndex];
  }

  public setSlotCharacter(slotIndex: 0 | 1 | 2, character: PlayableCharacter): SaveSlotData {
    const slot = this.data.slots[slotIndex];
    slot.character = character;
    slot.updatedAt = new Date().toISOString();
    this.save();
    return slot;
  }

  public resetSlot(slotIndex: 0 | 1 | 2): SaveSlotData {
    this.data.slots[slotIndex] = createDefaultSlot(slotIndex);
    this.save();
    return this.data.slots[slotIndex];
  }

  public applySlotToSim(state: SimState): void {
    const slot = this.getActiveSlot();
    state.character = slot.character;
    state.paletteId = slot.paletteId;
    state.floor = slot.hub.floor;
    state.hub = cloneHub(slot.hub);
  }

  public updateSlotFromSim(state: SimState, deltaTicks = 0): void {
    const slot = this.getActiveSlot();
    slot.character = state.character;
    slot.paletteId = state.paletteId;
    slot.hub = cloneHub(state.hub);
    slot.hub.floor = state.floor;
    if (deltaTicks > 0) {
      slot.totalPlayTicks += Math.floor(deltaTicks);
    }
    slot.updatedAt = new Date().toISOString();
    this.save();
  }

  public updateRenderSettings(partial: Partial<RenderSettings>): RenderSettings {
    this.data.renderSettings = validateRenderSettings({
      ...this.data.renderSettings,
      ...partial,
    });
    this.save();
    return this.data.renderSettings;
  }

  public updateAudioSettings(partial: Partial<AudioSettings>): AudioSettings {
    this.data.audioSettings = validateAudioSettings({
      ...this.data.audioSettings,
      ...partial,
    });
    this.save();
    return this.data.audioSettings;
  }

  public updateDeadzones(partial: Partial<DeadzoneSettings>): DeadzoneSettings {
    this.data.deadzones = validateDeadzones({
      ...this.data.deadzones,
      ...partial,
    });
    this.save();
    return this.data.deadzones;
  }

  public updateKeyBindings(partial: Partial<KeyBindings>): KeyBindings {
    this.data.keyBindings = validateKeyBindings({
      ...this.data.keyBindings,
      ...partial,
    });
    this.save();
    return this.data.keyBindings;
  }

  public resetKeyBindings(): KeyBindings {
    this.data.keyBindings = { ...DEFAULT_KEY_BINDINGS };
    this.save();
    return this.data.keyBindings;
  }

  public setUseCustomPack(enabled: boolean): void {
    this.data.useCustomPack = Boolean(enabled);
    this.save();
  }
}
