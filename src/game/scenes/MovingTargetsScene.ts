import { SixShotScene } from './SixShotScene.ts';
import { TargetManager } from '../systems/TargetManager.ts';
import {
  GAME_CONFIG,
  MOVING_TARGETS_ROUND_DURATION,
  DEFAULT_MAX_AIM_DISTANCE,
} from '../config/gameConfig.ts';

/**
 * MovingTargetsScene provides the Moving Targets FPS aim trainer mode.
 * Extends SixShotScene to inherit tested pointer lock, center crosshairs, weapon recoil,
 * trajectory sampling, and telemetry while adding continuous target movement
 * and boundary bouncing.
 */
export class MovingTargetsScene extends SixShotScene {
  constructor() {
    super({ key: 'MovingTargetsScene' });
    this.modeKey = 'moving_targets';
    this.modeTitle = 'MOVING TARGETS';
    this.modeSubtitle = 'Track and hit continuously moving targets.';
    this.modeDifficulty = 'moving';
    this.roundDuration = MOVING_TARGETS_ROUND_DURATION;
  }

  /**
   * Initialize TargetManager configured for moving targets.
   */
  protected override initTargetManager(width: number, height: number): void {
    this.targetManager = new TargetManager(
      width,
      height,
      GAME_CONFIG.movingTargets.targetCount,
      GAME_CONFIG.movingTargets.targetRadius,
      GAME_CONFIG.movingTargets.spawnMargin,
      GAME_CONFIG.movingTargets.minTargetSeparation,
      GAME_CONFIG.movingTargets.spawnRetryLimit,
      true, // movementEnabled
      GAME_CONFIG.movingTargets.movementSpeed, // 160 px/s
      GAME_CONFIG.movingTargets.maxAimDistance ?? DEFAULT_MAX_AIM_DISTANCE
    );
  }

  /**
   * Advance active moving target positions prior to sprite synchronization.
   * Only advances positions during active 'playing' state; frozen otherwise.
   */
  protected override onPreUpdate(delta: number): void {
    if (this.roundState === 'playing') {
      this.targetManager.update(delta / 1000);
    }
  }
}
