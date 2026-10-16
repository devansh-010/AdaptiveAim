/**
 * Game configuration constants for AdaptiveAim.
 */

export interface SixShotConfig {
  targetCount: number;
  durationSeconds: number;
  targetRadius: number;
  spawnMargin: number;
  minTargetSeparation: number;
  spawnRetryLimit: number;
  maxAimDistance?: number;
}

export interface MovingTargetsConfig {
  targetCount: number;
  durationSeconds: number;
  targetRadius: number;
  movementSpeed: number;
  spawnMargin: number;
  minTargetSeparation: number;
  spawnRetryLimit: number;
  maxAimDistance?: number;
}

export interface ThirtyShotConfig {
  targetCount: number;
  targetGoal: number;
  targetRadius: number;
  spawnMargin: number;
  minTargetSeparation: number;
  spawnRetryLimit: number;
  maxAimDistance?: number;
}

export interface GameCanvasConfig {
  width: number;
  height: number;
  backgroundColor: string | number;
}

export interface GameConfiguration {
  canvas: GameCanvasConfig;
  sixShot: SixShotConfig;
  movingTargets: MovingTargetsConfig;
  thirtyShot: ThirtyShotConfig;
  defaultTargetColor: number;
  defaultTargetHoverColor: number;
}

export const SIX_SHOT_TARGET_COUNT = 6;
export const SIX_SHOT_DURATION = 30; // seconds
export const SIX_SHOT_ROUND_DURATION = SIX_SHOT_DURATION; // seconds
export const SIX_SHOT_TARGET_SIZE = 22; // radius in pixels
export const SIX_SHOT_AIM_SENSITIVITY = 1.0;

export const MOVING_TARGETS_TARGET_COUNT = 4;
export const MOVING_TARGETS_DURATION = 30; // seconds
export const MOVING_TARGETS_ROUND_DURATION = MOVING_TARGETS_DURATION; // seconds
export const MOVING_TARGETS_TARGET_SIZE = 22; // radius in pixels
export const MOVING_TARGETS_SPEED = 160; // pixels per second
export const MOVING_TARGETS_AIM_SENSITIVITY = 1.0;

export const THIRTY_SHOT_TARGET_COUNT = 1;
export const THIRTY_SHOT_TARGET_GOAL = 30; // targets to hit
export const THIRTY_SHOT_TARGET_SIZE = 22; // radius in pixels
export const THIRTY_SHOT_AIM_SENSITIVITY = 1.0;

/**
 * Maximum pixel distance from center crosshair for target spawning.
 */
export const DEFAULT_MAX_AIM_DISTANCE = 380;

/**
 * Margin from canvas edges where targets will not spawn.
 * The target's entire bounding circle must remain inside the playable area.
 */
export const TARGET_SPAWN_MARGIN = 40;

/**
 * Minimum pixel distance between target centers to prevent overlap.
 * Set to comfortable spacing relative to 22px target radius.
 */
export const MIN_TARGET_SEPARATION = 65;

/**
 * Maximum number of retries when generating a non-overlapping spawn position.
 */
export const SPAWN_RETRY_LIMIT = 50;

export const GAME_CONFIG: GameConfiguration = {
  canvas: {
    width: 900,
    height: 600,
    backgroundColor: '#12131a',
  },
  sixShot: {
    targetCount: SIX_SHOT_TARGET_COUNT,
    durationSeconds: SIX_SHOT_DURATION,
    targetRadius: SIX_SHOT_TARGET_SIZE,
    spawnMargin: TARGET_SPAWN_MARGIN,
    minTargetSeparation: MIN_TARGET_SEPARATION,
    spawnRetryLimit: SPAWN_RETRY_LIMIT,
    maxAimDistance: DEFAULT_MAX_AIM_DISTANCE,
  },
  movingTargets: {
    targetCount: MOVING_TARGETS_TARGET_COUNT,
    durationSeconds: MOVING_TARGETS_DURATION,
    targetRadius: MOVING_TARGETS_TARGET_SIZE,
    movementSpeed: MOVING_TARGETS_SPEED,
    spawnMargin: TARGET_SPAWN_MARGIN,
    minTargetSeparation: MIN_TARGET_SEPARATION,
    spawnRetryLimit: SPAWN_RETRY_LIMIT,
    maxAimDistance: DEFAULT_MAX_AIM_DISTANCE,
  },
  thirtyShot: {
    targetCount: THIRTY_SHOT_TARGET_COUNT,
    targetGoal: THIRTY_SHOT_TARGET_GOAL,
    targetRadius: THIRTY_SHOT_TARGET_SIZE,
    spawnMargin: TARGET_SPAWN_MARGIN,
    minTargetSeparation: MIN_TARGET_SEPARATION,
    spawnRetryLimit: SPAWN_RETRY_LIMIT,
    maxAimDistance: DEFAULT_MAX_AIM_DISTANCE,
  },
  defaultTargetColor: 0x00e5ff,
  defaultTargetHoverColor: 0xff4081,
};
