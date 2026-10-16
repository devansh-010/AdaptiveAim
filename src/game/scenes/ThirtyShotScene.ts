import { SixShotScene } from './SixShotScene.ts';
import { TargetManager } from '../systems/TargetManager.ts';
import type { Target } from '../entities/Target.ts';
import { GAME_CONFIG, DEFAULT_MAX_AIM_DISTANCE } from '../config/gameConfig.ts';
import { telemetryCollector } from '../../telemetry/TelemetryCollector.ts';

/**
 * ThirtyShotScene provides the Thirty Shot aim trainer challenge.
 * Extends SixShotScene to inherit tested pointer lock, center crosshairs, weapon recoil,
 * trajectory sampling, and telemetry infrastructure.
 *
 * Rules:
 * - Exactly 1 active stationary target at a time.
 * - Progress counts from 0 to 30 successful hits.
 * - Misses record telemetry without advancing hit progress.
 * - Round ends immediately upon the 30th hit with 'ROUND COMPLETE' transition.
 * - Time tracks elapsed time (no countdown time limit).
 */
export class ThirtyShotScene extends SixShotScene {
  protected targetGoal: number = GAME_CONFIG.thirtyShot.targetGoal;
  protected elapsedTime: number = 0;

  constructor() {
    super({ key: 'ThirtyShotScene' });
    this.modeKey = 'thirty_shot';
    this.modeTitle = 'THIRTY SHOT';
    this.modeSubtitle = 'Hit 30 targets as quickly and accurately as possible.';
    this.modeDifficulty = 'fixed';
    this.roundDuration = 0;
  }

  /**
   * Initialize TargetManager configured for single active stationary target.
   */
  protected override initTargetManager(width: number, height: number): void {
    this.targetManager = new TargetManager(
      width,
      height,
      GAME_CONFIG.thirtyShot.targetCount, // 1
      GAME_CONFIG.thirtyShot.targetRadius, // 22
      GAME_CONFIG.thirtyShot.spawnMargin, // 40
      GAME_CONFIG.thirtyShot.minTargetSeparation, // 65
      GAME_CONFIG.thirtyShot.spawnRetryLimit, // 50
      false, // movementEnabled
      0, // movementSpeed
      GAME_CONFIG.thirtyShot.maxAimDistance ?? DEFAULT_MAX_AIM_DISTANCE
    );
  }

  protected override resetRoundState(): void {
    super.resetRoundState();
    this.elapsedTime = 0;
  }

  /**
   * Accumulate elapsed time instead of counting down.
   */
  protected override updateTimer(delta: number): void {
    this.elapsedTime += delta / 1000;
  }

  /**
   * Update HUD to display elapsed time and target completion progress (e.g. 12 / 30).
   */
  protected override updateHud(): void {
    const accuracy = this.shotsFired > 0
      ? ((this.hits / this.shotsFired) * 100).toFixed(1)
      : '0.0';

    this.hudTimeText.setText(`${this.elapsedTime.toFixed(1)}s`);
    this.hudHitsText.setText(`${this.hits} / ${this.targetGoal}`);
    this.hudAccText.setText(`${accuracy}%`);
  }

  /**
   * On successful hit, destroy target and either complete the round (if 30 hits reached)
   * or spawn the next replacement target.
   */
  protected override onTargetHitCompleted(hitTarget: Target, timestamp: string): void {
    this.removeTarget(hitTarget.targetId, timestamp);

    if (this.hits >= this.targetGoal) {
      this.triggerRoundTransition('ROUND COMPLETE', '#00ffcc');
    } else {
      const newTargets = this.targetManager.maintainTargetCount(this.roundId);
      for (const newTarget of newTargets) {
        this.renderTarget(newTarget);
      }
    }
  }

  /**
   * Present Thirty Shot completion summary with elapsed time and hit goal.
   */
  protected override updateResultsOverlay(): void {
    const completedRound = telemetryCollector.getCurrentRound();
    const accuracy = this.shotsFired > 0
      ? ((this.hits / this.shotsFired) * 100).toFixed(1)
      : '0.0';
    const avgReaction = (completedRound?.average_reaction_time && completedRound.average_reaction_time > 0)
      ? `${completedRound.average_reaction_time.toFixed(2)}s`
      : 'N/A';
    const avgPrecision = (completedRound?.average_precision && completedRound.average_precision > 0)
      ? `${completedRound.average_precision.toFixed(1)}px`
      : 'N/A';
    const duration = completedRound?.duration
      ? `${completedRound.duration.toFixed(2)}s`
      : `${this.elapsedTime.toFixed(2)}s`;

    const lines = [
      `HITS          : ${this.hits} / ${this.targetGoal}`,
      `TIME          : ${duration}`,
      `ACCURACY      : ${accuracy}%`,
      `AVG REACTION  : ${avgReaction}`,
      `AVG PRECISION : ${avgPrecision}`,
      `SHOTS FIRED   : ${this.shotsFired}`,
      `MISSES        : ${this.misses}`,
    ];

    this.resultsStatsText.setText(lines.join('\n'));
  }
}
