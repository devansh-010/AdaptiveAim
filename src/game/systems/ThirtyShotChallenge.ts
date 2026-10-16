import { TargetManager } from './TargetManager.ts';
import { TelemetryCollector } from '../../telemetry/TelemetryCollector.ts';
import type { Target } from '../entities/Target.ts';
import { THIRTY_SHOT_TARGET_GOAL } from '../config/gameConfig.ts';

export interface ThirtyShotResult {
  hit: boolean;
  targetId: string | null;
  hits: number;
  misses: number;
  shotsFired: number;
  targetGoal: number;
  isComplete: boolean;
  replacementTarget: Target | null;
}

/**
 * ThirtyShotChallenge encapsulates pure domain challenge rules for Thirty Shot:
 * - Exactly 1 active stationary target at a time.
 * - Challenge ends immediately upon the 30th successful hit.
 * - Misses record telemetry without advancing hit progress.
 * - No countdown time limit; elapsed time accumulates until completion.
 */
export class ThirtyShotChallenge {
  private targetManager: TargetManager;
  private telemetryCollector: TelemetryCollector;
  private targetGoal: number;
  private roundId: string | null = null;
  private hits: number = 0;
  private misses: number = 0;
  private shotsFired: number = 0;
  private elapsedTime: number = 0;
  private isRoundComplete: boolean = false;

  constructor(
    targetManager: TargetManager,
    telemetryCollector: TelemetryCollector,
    targetGoal: number = THIRTY_SHOT_TARGET_GOAL
  ) {
    this.targetManager = targetManager;
    this.telemetryCollector = telemetryCollector;
    this.targetGoal = targetGoal;
  }

  public startRound(roundId: string): Target[] {
    this.roundId = roundId;
    this.hits = 0;
    this.misses = 0;
    this.shotsFired = 0;
    this.elapsedTime = 0;
    this.isRoundComplete = false;

    this.targetManager.clearAll();
    this.targetManager.setAimOffset(0, 0);
    this.telemetryCollector.startRound(roundId, 'thirty_shot', 'fixed');

    return this.targetManager.spawnInitialTargets(roundId);
  }

  public setAimOffset(x: number, y: number): void {
    this.targetManager.setAimOffset(x, y);
  }

  public registerHit(targetId: string, timestamp: string = new Date().toISOString()): ThirtyShotResult {
    if (this.isRoundComplete || !this.roundId) {
      return {
        hit: false,
        targetId,
        hits: this.hits,
        misses: this.misses,
        shotsFired: this.shotsFired,
        targetGoal: this.targetGoal,
        isComplete: this.isRoundComplete,
        replacementTarget: null,
      };
    }

    const target = this.targetManager.getTarget(targetId);
    if (!target) {
      return {
        hit: false,
        targetId,
        hits: this.hits,
        misses: this.misses,
        shotsFired: this.shotsFired,
        targetGoal: this.targetGoal,
        isComplete: this.isRoundComplete,
        replacementTarget: null,
      };
    }

    this.shotsFired++;
    this.hits++;

    const spawnMs = new Date(target.spawnTime).getTime();
    const shotMs = new Date(timestamp).getTime();
    const reactionTime = Number(((shotMs - spawnMs) / 1000).toFixed(3));

    this.telemetryCollector.recordShot({
      shot_id: `shot_${this.shotsFired}`,
      round_id: this.roundId,
      target_id: targetId,
      timestamp,
      hit: true,
      player_x: target.x,
      player_y: target.y,
      target_x: target.x,
      target_y: target.y,
      target_size: target.size,
      target_speed: target.movementSpeed,
      distance_to_target: 0,
      reaction_time: reactionTime,
      precision: 0,
    });

    this.targetManager.destroyTarget(targetId, timestamp);

    let replacementTarget: Target | null = null;

    if (this.hits >= this.targetGoal) {
      this.isRoundComplete = true;
      this.telemetryCollector.endRound();
    } else {
      const newTargets = this.targetManager.maintainTargetCount(this.roundId);
      replacementTarget = newTargets.length > 0 ? newTargets[0] : null;
    }

    return {
      hit: true,
      targetId,
      hits: this.hits,
      misses: this.misses,
      shotsFired: this.shotsFired,
      targetGoal: this.targetGoal,
      isComplete: this.isRoundComplete,
      replacementTarget,
    };
  }

  public registerMiss(x: number, y: number, timestamp: string = new Date().toISOString()): ThirtyShotResult {
    if (this.isRoundComplete || !this.roundId) {
      return {
        hit: false,
        targetId: null,
        hits: this.hits,
        misses: this.misses,
        shotsFired: this.shotsFired,
        targetGoal: this.targetGoal,
        isComplete: this.isRoundComplete,
        replacementTarget: null,
      };
    }

    this.shotsFired++;
    this.misses++;

    this.telemetryCollector.recordShot({
      shot_id: `shot_${this.shotsFired}`,
      round_id: this.roundId,
      target_id: null,
      timestamp,
      hit: false,
      player_x: x,
      player_y: y,
      target_x: null,
      target_y: null,
      target_size: null,
      target_speed: null,
      distance_to_target: null,
      reaction_time: null,
      precision: null,
    });

    return {
      hit: false,
      targetId: null,
      hits: this.hits,
      misses: this.misses,
      shotsFired: this.shotsFired,
      targetGoal: this.targetGoal,
      isComplete: false,
      replacementTarget: null,
    };
  }

  public updateTime(deltaSeconds: number): void {
    if (!this.isRoundComplete && this.roundId) {
      this.elapsedTime += deltaSeconds;
    }
  }

  public getHits(): number {
    return this.hits;
  }

  public getMisses(): number {
    return this.misses;
  }

  public getShotsFired(): number {
    return this.shotsFired;
  }

  public getElapsedTime(): number {
    return this.elapsedTime;
  }

  public getTargetGoal(): number {
    return this.targetGoal;
  }

  public isComplete(): boolean {
    return this.isRoundComplete;
  }

  public getTargetManager(): TargetManager {
    return this.targetManager;
  }

  public getTelemetryCollector(): TelemetryCollector {
    return this.telemetryCollector;
  }
}
