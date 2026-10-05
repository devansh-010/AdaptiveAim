/**
 * Game configuration constants for AdaptiveAim.
 */

export interface SixShotConfig {
  targetCount: number;
  durationSeconds: number;
  targetRadius: number;
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
export const DEFAULT_TARGET_SIZE = 30; // radius in pixels

export const GAME_CONFIG: GameConfiguration = {
  canvas: {
    width: 900,
    height: 600,
    backgroundColor: '#12131a',
  },
  sixShot: {
    targetCount: SIX_SHOT_TARGET_COUNT,
    durationSeconds: SIX_SHOT_DURATION,
    targetRadius: DEFAULT_TARGET_SIZE,
  },
  defaultTargetColor: 0x00e5ff,
  defaultTargetHoverColor: 0xff4081,
};
