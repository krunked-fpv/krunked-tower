// ============================================================================
// Krunked Tower — Single Source of Truth Contracts (Wave 0 Locked)
// Pure TypeScript types & extracted engine constants — ZERO DOM imports.
// ============================================================================

export const SAVE_STORAGE_KEY = 'krunked_tower_save_v1';

export const ENGINE_CONSTANTS = {
  // Cadence & Geometry
  SIM_HZ: 60,
  FIXED_DT: 1 / 60,
  VIEWPORT_W: 960,
  VIEWPORT_H: 540,
  TILE_SIZE: 32,
  PLAYER_STAND_W: 26,
  PLAYER_STAND_H: 45,
  PLAYER_CROUCH_W: 26,
  PLAYER_CROUCH_H: 32,
  MAX_STEP_PX: 4,
  CORNER_NUDGE_PX: 6,

  // Core Kinetic Physics (Chef Peppo)
  GRAV: 0.5,
  FREEFALL_VSP: 20,
  WALK_CRUISE: 6,
  WALK_MAX: 8,
  JUMP_SPEED: -11,
  JUMP_CUT_DIV: 20,
  JUMP_CUT_VSP_THRESHOLD: 0.5,

  // Input Forgiveness Buffers (ticks @ 60 Hz)
  COYOTE_TICKS: 8,
  JUMP_BUFFER_TICKS: 15,
  STOP_BUFFER_TICKS: 8,
  SLOPE_BUFFER_TICKS: 8,
  SLAP_BUFFER_TICKS: 8,

  // Mach 1 -> Mach 4 Ramp
  MACH1_START: 6,
  MACH1_ACCEL: 0.075,
  MACH1_TO_2: 8,
  MACH2_MAX: 12,
  MACH2_ACCEL: 0.1,
  MACH2_SLOPE_ACCEL: 0.1,
  MACH2_SLOPE_DECEL: 0.2,
  MACH2_TO_3_ACCEL: 0.4,
  MACH3_SPEED: 16,
  MACH3_ACCEL: 0.025,
  MACH3_TO_4_ACCEL: 0.1,
  MACH4_SPEED: 20,

  // Mach Drift, Roll, Wall Climb
  MACH_DRIFT_BOOST_2: 12,
  MACH_DRIFT_BOOST_3: 15,
  MACH_ROLL_VSP: 10,
  MACH_ROLL_ACCEL: 0.1,
  MACH_ROLL_SLOPE_ACCEL: 0.5,
  MACH_ROLL_MAX: 12,
  WALL_CLIMB_ACCEL: 0.15,
  WALL_CLIMB_MAX: 20,

  // Grab Dash, Uppercut, Superjump, Bodyslam, Crouch
  GRAB_DASH_SPEED: 12,
  GRAB_DASH_TICKS: 20,
  UPPERCUT_VSP: -13,
  UPPERCUT_MAX_HSP: 7,
  SJUMP_VSP: -12,
  SJUMP_ACCEL: -0.1,
  SJUMP_SHUFFLE: 2,
  SJUMP_CANCEL_SPEED: 13,
  HEAVY_SLAM_SMASH_THRESHOLD: 10,
  CROUCH_SPEED: 4,
  CROUCH_JUMP_VSP: -8,
  CROUCH_SLIDE_DECEL: 0.2,

  // Taunt, Parry, Super Taunt, Hurt
  TAUNT_TICKS: 20,
  TAUNT_POSE_COUNT: 11,
  PARRY_WINDOW_TICKS: 8,
  PARRY_REFLECT_HSP: 25,
  SUPER_TAUNT_KILLS: 10,
  TAUNT_ESCAPE_PTS: 25,
  TAUNT_ESCAPE_MAX: 10,
  HURT_TICKS: 120,
  INVHURT_TICKS: 30,
  HURT_SCORE_LOSS: 50,

  // Alternate Characters (The Static & Gusto & Chonks)
  STATIC_MACH_MAX: 20,
  STATIC_WALL_BOUNCE_VSP: -12,
  STATIC_WALL_BOUNCE_HSP: 10,
  GUSTO_BASE_SPEED: 8,
  GUSTO_MAX_SPEED: 12,
  GUSTO_ACCEL: 0.15,
  GUSTO_KICK_BUFFER: 30,

  // Combo, Collectibles & Escape
  COMBO_TIME_MAX: 60,
  COMBO_DRAIN_PER_TICK: 0.15,
  SMALL_TOPPING_PTS: 10,
  SMALL_TOPPING_COMBO: 10,
  BIG_TOPPING_PTS: 100,
  BIG_TOPPING_COMBO: 20,
  TOPPIN_PAL_PTS: 1000,
  TOPPIN_PAL_CASH: 10,
  SECRET_PTS: 500,
  TREASURE_PTS: 3000,
  LAP2_PTS: 3000,
  MEGA_CRUST_BASE_SPEED: 8,
  MEGA_CRUST_ACCEL: 0.01,
  BOSS_PLAYER_MAX_HP: 6,

  // Camera
  CAMERA_OFFSET_Y: -50,
  CAMERA_LOOKAHEAD_FACTOR: 50,
  CAMERA_LOOKAHEAD_MACH3_FACTOR: 70,
  MAX_AFTERIMAGES: 32,
} as const;

export const TileType = {
  EMPTY: 0,
  SOLID: 1,
  ONE_WAY: 2,
  SLOPE_45_UP_RIGHT: 3,
  SLOPE_45_UP_LEFT: 4,
  SLOPE_26_LOW_RIGHT: 5,
  SLOPE_26_HIGH_RIGHT: 6,
  SLOPE_26_HIGH_LEFT: 7,
  SLOPE_26_LOW_LEFT: 8,
  BREAK_MARBLE: 9,
  BREAK_METAL: 10,
  PILLAR_BLOCK_CLOSED: 11,
  PILLAR_BLOCK_OPEN: 12,
  ICE_SOLID: 13,
  CONVEYOR_RIGHT: 14,
  CONVEYOR_LEFT: 15,
  LAVA_HAZARD: 16,
  SPIKE_HAZARD: 17,
  CHEESE_STICK_WALL: 18,
  BREAK_OUTLET_GATE: 19,
  SECRET_WALL: 20,
} as const;

export type TileTypeValue = (typeof TileType)[keyof typeof TileType];

export type PlayableCharacter = 'peppo' | 'static';
export type ActiveRider = 'peppo' | 'static' | 'gusto_chonks';
export type FloorId = 1 | 2 | 3 | 4 | 5;
export type GameScreen = 'title' | 'hub' | 'stage' | 'boss' | 'rank' | 'victory';
export type RankGrade = 'D' | 'C' | 'B' | 'A' | 'S' | 'P';
export type InputDeviceMode = 'keyboard' | 'gamepad' | 'touch';
export type AssetSourceMode = 'builtin' | 'custom';

export type StageId =
  | 'tutorial'
  | 'entrance'
  | 'medieval'
  | 'ruin'
  | 'dungeon'
  | 'badland'
  | 'graveyard'
  | 'farm'
  | 'saloon'
  | 'plage'
  | 'forest'
  | 'space'
  | 'minigolf'
  | 'street'
  | 'sewer'
  | 'industrial'
  | 'freezer'
  | 'chateau'
  | 'kidsparty'
  | 'war'
  | 'exit'
  | 'secretworld'
  | 'trickytreat';

export type BossId =
  | 'b_artiste'
  | 'b_cheddar'
  | 'b_static'
  | 'b_doppel'
  | 'b_megacrust';

export type RoomThemeId =
  | 'hub_lobby'
  | 'hub_western'
  | 'hub_resort'
  | 'hub_slum'
  | 'hub_penthouse'
  | 'crypt'
  | 'keep'
  | 'ruins'
  | 'catacombs'
  | 'mesa'
  | 'graveyard'
  | 'farm'
  | 'saloon'
  | 'pier'
  | 'woods'
  | 'orbit'
  | 'golf'
  | 'metro'
  | 'drain'
  | 'foundry'
  | 'freezer'
  | 'manor'
  | 'arcade'
  | 'blitz'
  | 'spire'
  | 'secret'
  | 'candy'
  | 'boss_gallery'
  | 'boss_canyon'
  | 'boss_studio'
  | 'boss_doppel'
  | 'boss_summit';

export type PlayerActionState =
  | 'normal'
  | 'crouch'
  | 'crouch_slide'
  | 'mach1'
  | 'mach2'
  | 'mach3'
  | 'mach4'
  | 'mach_slide'
  | 'mach_roll'
  | 'climb_wall'
  | 'wall_bounce'
  | 'grab_dash'
  | 'grab_hold'
  | 'piledriver'
  | 'uppercut'
  | 'sjump_prep'
  | 'sjump'
  | 'sjump_land'
  | 'sjump_cancel'
  | 'freefall_prep'
  | 'freefall'
  | 'freefall_land'
  | 'taunt'
  | 'super_taunt'
  | 'parry'
  | 'hurt'
  | 'door_enter'
  | 'victory_pose'
  | 'bump';

export type TransformationId =
  | 'none'
  | 'knight'
  | 'ball'
  | 'bomb'
  | 'fire_butt'
  | 'firemouth'
  | 'ghost'
  | 'beak'
  | 'weenie'
  | 'barrel'
  | 'rocket'
  | 'golf_carry'
  | 'cheese_sticky'
  | 'trash_roll'
  | 'boxed_flat'
  | 'inferno_pepper'
  | 'cross'
  | 'shotgun'
  | 'revolver';

export type TvExpression =
  | 'idle'
  | 'mach2'
  | 'mach3'
  | 'mach4'
  | 'panic'
  | 'hurt'
  | 'taunt'
  | 'combo'
  | 'happy'
  | 'boss'
  | 'gusto'
  | 'static'
  | 'knight'
  | 'ghost'
  | 'shotgun'
  | 'fire';

export type EnemyArchetypeId =
  | 'slime_glob'
  | 'fork_imp'
  | 'swedish_ape'
  | 'pepper_goblin'
  | 'knight_squire'
  | 'bomb_imp'
  | 'tribal_cheese'
  | 'cow_charger'
  | 'ghost_ghoul'
  | 'mushroom_spitter'
  | 'cannon_goblin'
  | 'giant_bee'
  | 'archer_goblin'
  | 'ufo_olive'
  | 'burger_golfer'
  | 'ninja_slice'
  | 'clone_bot'
  | 'fake_santa'
  | 'animatronic_bot'
  | 'blitz_trooper'
  | 'pickle_brawler'
  | 'static_minion';

export type PropKind =
  | 'pillar_chronos'
  | 'toppin_cage'
  | 'gerry_janitor'
  | 'treasure_chest'
  | 'lap2_portal'
  | 'exit_door'
  | 'secret_eye'
  | 'transform_totem'
  | 'buddy_switch'
  | 'time_terminal'
  | 'golf_ball'
  | 'golf_goal'
  | 'dash_button'
  | 'taxi_warp'
  | 'alarm_sensor'
  | 'hub_stage_gate'
  | 'hub_boss_gate'
  | 'hub_elevator'
  | 'hub_broker'
  | 'hub_bonus_gate'
  | 'tutorial_sign';

export type MusicTrackId =
  | 'none'
  | 'title'
  | 'hub_1'
  | 'hub_2'
  | 'hub_3'
  | 'hub_4'
  | 'hub_5'
  | 'tutorial'
  | 'stage_crypt'
  | 'stage_keep'
  | 'stage_ruins'
  | 'stage_catacombs'
  | 'stage_mesa'
  | 'stage_graveyard'
  | 'stage_farm'
  | 'stage_saloon'
  | 'stage_pier'
  | 'stage_woods'
  | 'stage_orbit'
  | 'stage_golf'
  | 'stage_metro'
  | 'stage_drain'
  | 'stage_foundry'
  | 'stage_freezer'
  | 'stage_manor'
  | 'stage_arcade'
  | 'stage_blitz'
  | 'secret_room'
  | 'escape_krunk_time'
  | 'escape_lap2'
  | 'escape_spire'
  | 'boss_artiste'
  | 'boss_cheddar'
  | 'boss_static'
  | 'boss_doppel'
  | 'boss_megacrust'
  | 'rank_high'
  | 'rank_low'
  | 'candy_panic';

export type SfxId =
  | 'jump'
  | 'mach1'
  | 'mach2'
  | 'mach3'
  | 'mach4'
  | 'mach_drift'
  | 'wall_climb'
  | 'wall_bounce'
  | 'grab_dash'
  | 'throw'
  | 'uppercut'
  | 'sjump_charge'
  | 'sjump_launch'
  | 'sjump_cancel'
  | 'bodyslam_heavy'
  | 'block_marble'
  | 'block_metal'
  | 'taunt'
  | 'parry'
  | 'super_taunt'
  | 'enemy_hit'
  | 'enemy_kill'
  | 'pickup_small'
  | 'pickup_big'
  | 'toppin_free'
  | 'secret_found'
  | 'treasure_get'
  | 'pillar_smash'
  | 'lap2_enter'
  | 'hurt'
  | 'boss_hit'
  | 'boss_defeat'
  | 'shotgun_blast'
  | 'revolver_shot'
  | 'transform'
  | 'door_enter'
  | 'ui_move'
  | 'ui_confirm'
  | 'ui_back'
  | 'combo_drop'
  | 'alarm_siren'
  | 'time_extend';

export type ParticleKind =
  | 'dust'
  | 'spark'
  | 'marble_chunk'
  | 'metal_chunk'
  | 'starburst'
  | 'parry_ring'
  | 'slam_wave'
  | 'flame'
  | 'smoke'
  | 'confetti'
  | 'speed_line'
  | 'score_pop'
  | 'combo_pop';

export type RngState = [number, number, number, number];

export interface InputFrame {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  jumpHeld: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  grabHeld: boolean;
  grabPressed: boolean;
  machHeld: boolean;
  machPressed: boolean;
  tauntPressed: boolean;
  superTauntPressed: boolean;
  shootPressed: boolean;
  shootReleased: boolean;
  pausePressed: boolean;
  restartPressed: boolean;
  deviceMode: InputDeviceMode;
}

export function createNeutralInput(deviceMode: InputDeviceMode = 'keyboard'): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    jumpHeld: false,
    jumpPressed: false,
    jumpReleased: false,
    grabHeld: false,
    grabPressed: false,
    machHeld: false,
    machPressed: false,
    tauntPressed: false,
    superTauntPressed: false,
    shootPressed: false,
    shootReleased: false,
    pausePressed: false,
    restartPressed: false,
    deviceMode,
  };
}

export type SimEvent =
  | { type: 'sfx'; sfx: SfxId; pan?: number; pitchJitter?: number; volume?: number }
  | { type: 'music'; track: MusicTrackId; forceRestart?: boolean }
  | { type: 'rumble'; strong: number; weak: number; durationMs: number }
  | {
      type: 'particle';
      kind: ParticleKind;
      x: number;
      y: number;
      vx?: number;
      vy?: number;
      color?: string;
      count?: number;
      text?: string;
    }
  | {
      type: 'afterimage';
      x: number;
      y: number;
      facing: 1 | -1;
      spriteKey: string;
      tint: string;
      alpha?: number;
    }
  | { type: 'callout'; text: string; durationTicks?: number }
  | { type: 'rank_achieved'; id: StageId | BossId; rank: RankGrade; score: number; pRank: boolean }
  | { type: 'boss_phase'; bossId: BossId; phase: number }
  | { type: 'escape_started'; stageId: StageId; seconds: number }
  | { type: 'lap2_started'; stageId: StageId }
  | { type: 'mega_crust_spawned' }
  | { type: 'save_dirty' };

export type SimCommand =
  | { type: 'start_campaign'; character: PlayableCharacter }
  | { type: 'enter_hub'; floor?: FloorId }
  | { type: 'enter_stage'; stageId: StageId }
  | { type: 'enter_boss'; bossId: BossId }
  | { type: 'return_to_hub' }
  | { type: 'restart_stage' }
  | { type: 'set_character'; character: PlayableCharacter }
  | { type: 'set_palette'; paletteId: string }
  | { type: 'pay_broker'; floor: FloorId }
  | { type: 'set_paused'; paused: boolean }
  | { type: 'change_floor'; floor: FloorId }
  | { type: 'debug_warp_room'; roomIndex: number }
  | { type: 'debug_trigger_escape' }
  | { type: 'debug_trigger_lap2' }
  | { type: 'debug_set_transformation'; transformation: TransformationId }
  | { type: 'debug_unlock_all' }
  | { type: 'debug_damage_boss'; amount: number }
  | { type: 'debug_force_rank'; rank: RankGrade };

export interface PlayerState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: PlayerActionState;
  transformation: TransformationId;
  rider: ActiveRider;
  movespeed: number;
  wallspeed: number;
  coyoteTicks: number;
  jumpBufferTicks: number;
  stopBufferTicks: number;
  slopeBufferTicks: number;
  slapBufferTicks: number;
  jumpStop: boolean;
  grounded: boolean;
  onSlope: boolean;
  slopeDir: -1 | 0 | 1;
  onWall: boolean;
  wallDir: -1 | 0 | 1;
  crouch: boolean;
  freefallSmash: number;
  grabDashTicks: number;
  tauntTimer: number;
  tauntPose: number;
  tauntStoredState: PlayerActionState;
  tauntStoredSpeed: number;
  tauntStoredVy: number;
  parryTicks: number;
  hurtTicks: number;
  invulnTicks: number;
  superchargeKills: number;
  superTauntReady: boolean;
  grabbedEnemyId: number | null;
  hp: number;
  maxHp: number;
  transformTimer: number;
  ammoCooldown: number;
  shotChargeTicks: number;
  airJumpsLeft: number;
  gustKickBuffer: number;
  combo: number;
  comboTime: number;
  comboScore: number;
  comboStarted: boolean;
  comboDropped: boolean;
  maxCombo: number;
  escapeTauntsUsed: number;
  animFrame: number;
  animTimer: number;
  afterimageTick: number;
  /** Used by Mach Drift to remember turn target */
  driftDir: 1 | -1;
  driftFromMach3: boolean;
  /** Used by Boss 2 Revolver / Stage Shotgun */
  hasRevolver: boolean;
  hasShotgun: boolean;
}

export interface EnemyDef {
  id: EnemyArchetypeId;
  name: string;
  width: number;
  height: number;
  speed: number;
  hp: number;
  scoreValue: number;
  behavior:
    | 'patrol'
    | 'charger'
    | 'jumper'
    | 'shooter'
    | 'flier'
    | 'shielded'
    | 'duelist'
    | 'bomber'
    | 'patrol_alarm';
  canBeGrabbed: boolean;
  immuneToMach2: boolean;
  spriteKey: string;
  accentColor: string;
}

export interface EnemyState {
  id: number;
  archetype: EnemyArchetypeId;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  facing: 1 | -1;
  hp: number;
  alive: boolean;
  stunTicks: number;
  scared: boolean;
  grabbed: boolean;
  thrown: boolean;
  attackCooldown: number;
  aiTimer: number;
  grounded: boolean;
  originX: number;
  originY: number;
  escapeOnly?: boolean;
}

export interface ProjectileState {
  id: number;
  owner: 'player' | 'enemy' | 'boss';
  kind:
    | 'bullet'
    | 'charged_shot'
    | 'shotgun_pellet'
    | 'bomb'
    | 'statue'
    | 'bowling_ball'
    | 'dynamite'
    | 'flame'
    | 'head_toss'
    | 'cog'
    | 'tv_toss'
    | 'arrow'
    | 'chonks_kick'
    | 'golf_shot';
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  parryable: boolean;
  reflected: boolean;
  gravity: boolean;
  ttlTicks: number;
  color: string;
}

export interface PickupState {
  id: number;
  kind: 'small_topping' | 'big_topping' | 'pizza_slice' | 'clock_pickup' | 'pumpkin';
  x: number;
  y: number;
  collected: boolean;
  value: number;
  comboRefill: number;
  bobOffset: number;
}

export interface PropState {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  triggered: boolean;
  /** Semantic payload depending on prop kind */
  index?: number;
  label?: string;
  targetStageId?: StageId;
  targetBossId?: BossId;
  targetFloor?: FloorId;
  targetRoomIndex?: number;
  targetX?: number;
  targetY?: number;
  transformation?: TransformationId;
  riderTarget?: ActiveRider;
  timerTicks?: number;
  vx?: number;
  vy?: number;
  parCount?: number;
  strokes?: number;
}

export interface DoorDef {
  id: string;
  x: number;
  y: number;
  targetRoomIndex: number;
  targetX: number;
  targetY: number;
  requireUp: boolean;
  label?: string;
  escapeLocked?: boolean;
  secretIndex?: number;
}

export interface RoomEntitySpawn {
  kind: 'enemy' | 'pickup' | 'prop';
  x: number;
  y: number;
  archetype?: EnemyArchetypeId;
  pickupKind?: PickupState['kind'];
  propKind?: PropKind;
  index?: number;
  label?: string;
  transformation?: TransformationId;
  riderTarget?: ActiveRider;
  targetStageId?: StageId;
  targetBossId?: BossId;
  targetFloor?: FloorId;
  targetRoomIndex?: number;
  targetX?: number;
  targetY?: number;
  escapeOnly?: boolean;
}

export interface RoomDef {
  id: string;
  name: string;
  theme: RoomThemeId;
  widthTiles: number;
  heightTiles: number;
  /** Compact ASCII or numeric layout converted into Uint8Array by levelRuntime */
  rows: string[];
  spawnX: number;
  spawnY: number;
  doors: DoorDef[];
  spawns: RoomEntitySpawn[];
  isSecretRoom?: boolean;
  secretIndex?: number;
  isEscapeChase?: boolean;
  allowRider?: ActiveRider;
}

export interface LevelDef {
  id: StageId;
  name: string;
  subtitle: string;
  floor: FloorId | 0;
  theme: RoomThemeId;
  music: MusicTrackId;
  sRankScore: number;
  escapeSeconds: number;
  hasPillar: boolean;
  hasLap2: boolean;
  warTimerMode?: boolean;
  candyPanicMode?: boolean;
  secretGauntletMode?: boolean;
  featuredGimmick: string;
  rooms: RoomDef[];
}

export interface BossPhaseDef {
  phase: number;
  hpThreshold: number;
  name: string;
  speedMult: number;
  attacks: string[];
}

export interface BossDef {
  id: BossId;
  name: string;
  staticName?: string;
  title: string;
  floor: FloorId;
  tollCash: number;
  theme: RoomThemeId;
  music: MusicTrackId;
  maxHp: number;
  phase2Hp?: number;
  phase3Hp?: number;
  givesRevolver?: boolean;
  hasEscapePhase?: boolean;
  phases: BossPhaseDef[];
  room: RoomDef;
}

export interface BossState {
  id: BossId;
  name: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  phase: number;
  maxPhases: number;
  aiState:
    | 'intro'
    | 'idle'
    | 'telegraph'
    | 'charge'
    | 'jump_slam'
    | 'projectile'
    | 'vulnerable'
    | 'hurt'
    | 'phase_shift'
    | 'chase_escape'
    | 'defeated';
  stateTimer: number;
  attackIndex: number;
  invulnTicks: number;
  flashTicks: number;
  grounded: boolean;
  parryable: boolean;
  chaseProgress: number;
}

export interface ActiveRoomState {
  id: string;
  name: string;
  theme: RoomThemeId;
  widthTiles: number;
  heightTiles: number;
  tiles: Uint8Array;
  brokenMask: Uint8Array;
  doors: DoorDef[];
  isSecretRoom: boolean;
  secretIndex: number;
  outletGateTimer: number;
  alarmActiveTicks: number;
}

export interface EscapeState {
  active: boolean;
  timerTicks: number;
  maxTicks: number;
  lap: number;
  megaCrustActive: boolean;
  megaCrustX: number;
  megaCrustY: number;
  megaCrustSpeed: number;
  pillarBroken: boolean;
  warMode: boolean;
  terminalsHit: number;
}

export interface StageRunStats {
  score: number;
  toppinsCollected: [boolean, boolean, boolean, boolean, boolean];
  secretsFound: [boolean, boolean, boolean];
  gerryFound: boolean;
  treasureCollected: boolean;
  lap2Done: boolean;
  hitsTaken: number;
  enemiesDefeated: number;
  parriesLanded: number;
  superTauntsUsed: number;
  elapsedTicks: number;
  rank: RankGrade;
  sRankTarget: number;
  pRankEligible: boolean;
}

export interface HubState {
  floor: FloorId;
  cash: number;
  bossesDefeated: BossId[];
  stagesCleared: StageId[];
  stageBestRanks: Partial<Record<StageId | BossId, RankGrade>>;
  stageBestScores: Partial<Record<StageId | BossId, number>>;
  toppinsByStage: Partial<Record<StageId, boolean[]>>;
  unlockedPalettes: string[];
  completedTasks: string[];
  brokerPaidFloors: FloorId[];
}

export interface CameraState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  lookAheadX: number;
  lookAheadY: number;
  targetX: number;
  targetY: number;
}

export interface TvHudState {
  expression: TvExpression;
  animTick: number;
  calloutText: string;
  calloutTimer: number;
  comboBounce: number;
}

export interface SimState {
  tick: number;
  rngState: RngState;
  hitstopTicks: number;
  shakeMag: number;
  shakeTimer: number;
  flashTicks: number;
  screen: GameScreen;
  character: PlayableCharacter;
  paletteId: string;
  floor: FloorId;
  stageId: StageId | null;
  bossId: BossId | null;
  roomIndex: number;
  player: PlayerState;
  room: ActiveRoomState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  pickups: PickupState[];
  props: PropState[];
  boss: BossState | null;
  escape: EscapeState;
  stageStats: StageRunStats;
  hub: HubState;
  camera: CameraState;
  tv: TvHudState;
  events: SimEvent[];
  paused: boolean;
  stageComplete: boolean;
  gameOver: boolean;
  gameOverReason: string | null;
  bossIntroTicks: number;
  lastRankSummary: {
    id: StageId | BossId;
    name: string;
    rank: RankGrade;
    score: number;
    sRankTarget: number;
    pRank: boolean;
    toppinsCount: number;
    secretsCount: number;
    treasureCollected: boolean;
    lap2Done: boolean;
    maxCombo: number;
    elapsedTicks: number;
    cashEarned: number;
    newlyUnlockedPalettes: string[];
    newlyCompletedTasks: string[];
  } | null;
  /** Persistent per-stage room visited & cleared entity keys during active run */
  visitedRooms: number[];
  collectedIds: string[];
  nextEntityId: number;
  /** Track last stage entered from hub to return gracefully */
  returnHubX: number;
  returnHubY: number;
}

export interface PaletteDef {
  id: string;
  name: string;
  unlockHint: string;
  character: PlayableCharacter | 'both';
  /** 6-color cartoon ramp mapped into shd_pal_swapper LUT */
  ramp: [string, string, string, string, string, string];
}

export interface ChefTaskDef {
  id: string;
  stageId: StageId | BossId | 'global';
  name: string;
  description: string;
  paletteReward?: string;
}

// ============================================================================
// Input, Render, Audio, Save & Asset Contracts
// ============================================================================

export interface DeadzoneSettings {
  general: number;
  horizontal: number;
  vertical: number;
  crouchWalk: number;
  superjump: number;
}

export interface RenderSettings {
  targetFps: 30 | 60 | 120;
  nativeSnap60: boolean;
  scalingMode: 'fit' | 'pixel-perfect';
  screenShake: boolean;
  touchOpacity: number;
  touchMachLockDefault: boolean;
  rumble: boolean;
  showFps: boolean;
  showHitboxes: boolean;
}

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export interface KeyBindings {
  left: string;
  right: string;
  up: string;
  down: string;
  jump: string;
  grab: string;
  mach: string;
  taunt: string;
  pause: string;
  restart: string;
}

export interface SaveSlotData {
  slotIndex: 0 | 1 | 2;
  character: PlayableCharacter;
  paletteId: string;
  hub: HubState;
  totalPlayTicks: number;
  updatedAt: string;
}

export interface SaveData {
  schemaVersion: 1;
  activeSlot: 0 | 1 | 2;
  slots: [SaveSlotData, SaveSlotData, SaveSlotData];
  renderSettings: RenderSettings;
  audioSettings: AudioSettings;
  deadzones: DeadzoneSettings;
  keyBindings: KeyBindings;
  useCustomPack: boolean;
}

export interface PerfStats {
  fps: number;
  simMs: number;
  renderMs: number;
  drawCalls: number;
  activeParticles: number;
  activeAfterimages: number;
  targetFps: 30 | 60 | 120;
}

export interface AtlasSpriteRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
  frames?: number;
}

export interface AssetManifestEntry {
  key: string;
  atlasPage: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
  source?: string;
}

export interface AssetManifest {
  version: 1;
  source: AssetSourceMode;
  atlasWidth: number;
  atlasHeight: number;
  sprites: Record<string, AssetManifestEntry>;
  audio?: Record<string, string>;
}

export interface CustomPackStatus {
  available: boolean;
  active: boolean;
  source: 'none' | 'vite-dev' | 'indexeddb' | 'folder-picker';
  spriteCount: number;
  audioCount: number;
  error?: string;
}

export interface RendererAPI {
  init(canvas: HTMLCanvasElement): boolean;
  resize(width: number, height: number, dpr: number): void;
  render(state: SimState, interpAlpha: number, settings: RenderSettings): void;
  consumeEvents(events: readonly SimEvent[]): void;
  setAssetMode(mode: AssetSourceMode): void;
  getCustomPackStatus(): CustomPackStatus;
  loadCustomPackFiles(files: FileList | File[]): Promise<CustomPackStatus>;
  getPerfStats(): PerfStats;
  dispose(): void;
}

export interface AudioEngineAPI {
  unlock(): void;
  applySettings(settings: AudioSettings): void;
  playMusic(track: MusicTrackId, forceRestart?: boolean): void;
  playSfx(sfx: SfxId, pan?: number, pitchJitter?: number, volume?: number): void;
  consumeEvents(events: readonly SimEvent[]): void;
  setCustomAudioMap(map: Map<string, string>): void;
  dispose(): void;
}

export interface DebugBridge {
  getState(): SimState;
  hash(): string;
  warpStage(stageId: StageId, character?: PlayableCharacter): void;
  warpBoss(bossId: BossId, character?: PlayableCharacter): void;
  warpHub(floor?: FloorId): void;
  triggerEscape(): void;
  triggerLap2(): void;
  setTransformation(transformation: TransformationId): void;
  setCharacter(character: PlayableCharacter): void;
  setPalette(paletteId: string): void;
  setRankPreview(rank: RankGrade): void;
  damageBoss(amount: number): void;
  stepTicks(count: number, input?: Partial<InputFrame>): string;
  getInputMode(): InputDeviceMode;
  simulateTouch(active: boolean): void;
  getTouchOverlayVisible(): boolean;
  getPerfStats(): PerfStats;
  setRenderSettings(partial: Partial<RenderSettings>): void;
  unlockAll(): void;
}

export const DEFAULT_DEADZONES: DeadzoneSettings = {
  general: 0.25,
  horizontal: 0.25,
  vertical: 0.35,
  crouchWalk: 0.45,
  superjump: 0.55,
};

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  targetFps: 120,
  nativeSnap60: false,
  scalingMode: 'fit',
  screenShake: true,
  touchOpacity: 0.32,
  touchMachLockDefault: false,
  rumble: true,
  showFps: false,
  showHitboxes: false,
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.85,
  musicVolume: 0.72,
  sfxVolume: 0.88,
  muted: false,
};

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  jump: 'KeyZ',
  grab: 'KeyX',
  mach: 'ShiftLeft',
  taunt: 'KeyC',
  pause: 'Escape',
  restart: 'KeyR',
};

declare global {
  interface Window {
    __KRUNKED_DEBUG__?: DebugBridge;
  }
}
