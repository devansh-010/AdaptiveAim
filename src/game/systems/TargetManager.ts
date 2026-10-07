import { Target } from '../entities/Target';
import { generateTargetId } from '../../telemetry/ids';
import { GAME_CONFIG } from '../config/gameConfig';
import { telemetryCollector } from '../../telemetry/TelemetryCollector';

export interface SpawnArea {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * TargetManager handles target placement, active target pool maintenance,
 * collision bounds validation, and replacement target generation.
 *
 * It owns the logic for generating valid random positions and preventing overlap.
 * SixShotScene delegates all spawning to this class.
 */
export class TargetManager {
  private activeTargets: Map<string, Target> = new Map();
  private maxActiveTargets: number;
  private spawnArea!: SpawnArea;
  private targetRadius: number;
  private minSeparation: number;
  private retryLimit: number;

  constructor(
    canvasWidth: number,
    canvasHeight: number,
    maxTargets: number = GAME_CONFIG.sixShot.targetCount,
    targetRadius: number = GAME_CONFIG.sixShot.targetRadius,
    spawnMargin: number = GAME_CONFIG.sixShot.spawnMargin,
    minSeparation: number = GAME_CONFIG.sixShot.minTargetSeparation,
    retryLimit: number = GAME_CONFIG.sixShot.spawnRetryLimit,
  ) {
    this.maxActiveTargets = maxTargets;
    this.targetRadius = targetRadius;
    this.minSeparation = minSeparation;
    this.retryLimit = retryLimit;

    // Compute valid spawn area from canvas dimensions, margin, and target radius.
    this.updateSpawnArea(canvasWidth, canvasHeight, spawnMargin);
  }

  /**
   * Update valid spawn area based on updated canvas/viewport dimensions.
   */
  public updateSpawnArea(
    canvasWidth: number,
    canvasHeight: number,
    spawnMargin: number = GAME_CONFIG.sixShot.spawnMargin
  ): void {
    const effectiveMargin = spawnMargin + this.targetRadius;
    this.spawnArea = {
      minX: effectiveMargin,
      maxX: canvasWidth - effectiveMargin,
      minY: effectiveMargin,
      maxY: canvasHeight - effectiveMargin,
    };
  }

  /**
   * Generate a non-overlapping valid random spawn coordinate within spawnArea.
   */
  public generateValidSpawnPosition(): { x: number; y: number } {
    let bestPosition = this.randomPointInArea();
    let bestMinDistance = 0;

    for (let attempt = 0; attempt < this.retryLimit; attempt++) {
      const candidate = this.randomPointInArea();
      const nearestDistance = this.getNearestTargetDistance(candidate.x, candidate.y);

      if (nearestDistance >= this.minSeparation) {
        return candidate;
      }

      if (nearestDistance > bestMinDistance) {
        bestMinDistance = nearestDistance;
        bestPosition = candidate;
      }
    }

    return bestPosition;
  }

  /**
   * Create and register a new target entity at a valid position and record telemetry.
   */
  public createTarget(roundId: string): Target {
    const position = this.generateValidSpawnPosition();
    const targetId = generateTargetId();

    const target = new Target(
      targetId,
      roundId,
      position.x,
      position.y,
      this.targetRadius,
    );

    this.activeTargets.set(targetId, target);
    telemetryCollector.recordTargetSpawn(target.toTelemetry());
    return target;
  }

  /**
   * Spawn initial batch of 6 targets for a round.
   */
  public spawnInitialTargets(roundId: string): Target[] {
    const spawned: Target[] = [];

    for (let i = 0; i < this.maxActiveTargets; i++) {
      const target = this.createTarget(roundId);
      spawned.push(target);
    }

    return spawned;
  }

  /**
   * Handle target destruction, remove from active targets, and record telemetry.
   */
  public destroyTarget(targetId: string, destroyTime: string = new Date().toISOString()): Target | null {
    const target = this.activeTargets.get(targetId);
    if (target) {
      target.destroy(destroyTime);
      this.activeTargets.delete(targetId);
      telemetryCollector.recordTargetDestroy(targetId, target.destroyTime!);
      return target;
    }
    return null;
  }

  /**
   * Maintain active targets count by filling empty slots.
   */
  public maintainTargetCount(roundId: string): Target[] {
    const spawned: Target[] = [];

    while (this.activeTargets.size < this.maxActiveTargets) {
      const target = this.createTarget(roundId);
      spawned.push(target);
    }

    return spawned;
  }

  public getActiveTargets(): Target[] {
    return Array.from(this.activeTargets.values());
  }

  public getTarget(targetId: string): Target | undefined {
    return this.activeTargets.get(targetId);
  }

  /**
   * Check if a point (x, y) in world coordinates hits any active target.
   */
  public checkHit(x: number, y: number): Target | null {
    for (const target of this.activeTargets.values()) {
      if (!target.isDestroyed && target.isHit(x, y)) {
        return target;
      }
    }
    return null;
  }

  public getActiveCount(): number {
    return this.activeTargets.size;
  }

  public getMaxActiveTargets(): number {
    return this.maxActiveTargets;
  }

  public clearAll(): void {
    this.activeTargets.clear();
  }

  private randomPointInArea(): { x: number; y: number } {
    const x = Math.random() * (this.spawnArea.maxX - this.spawnArea.minX) + this.spawnArea.minX;
    const y = Math.random() * (this.spawnArea.maxY - this.spawnArea.minY) + this.spawnArea.minY;
    return { x, y };
  }

  private getNearestTargetDistance(x: number, y: number): number {
    let minDistance = Infinity;

    for (const target of this.activeTargets.values()) {
      const dx = x - target.x;
      const dy = y - target.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    return minDistance;
  }
}
