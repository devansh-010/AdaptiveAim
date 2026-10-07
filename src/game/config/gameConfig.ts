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
}

export interface GameCanvasConfig {
  width: number;
  height: number;
  backgroundColor: string | number;
}

export interface GameConfiguration {
  canvas: GameCanvasConfig;
  sixShot: SixShotConfig;
  defaultTargetColor: number;
  defaultTargetHoverColor: number;
}

export const SIX_SHOT_TARGET_COUNT = 6;
export const SIX_SHOT_DURATION = 30; // seconds
export const SIX_SHOT_ROUND_DURATION = SIX_SHOT_DURATION; // seconds
export const SIX_SHOT_TARGET_SIZE = 22; // radius in pixels
export const SIX_SHOT_AIM_SENSITIVITY = 1.0;

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
  },
  defaultTargetColor: 0x00e5ff,
  defaultTargetHoverColor: 0xff4081,
};
