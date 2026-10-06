import { Target } from '../entities/Target';
import { generateTargetId } from '../../telemetry/ids';
import { GAME_CONFIG } from '../config/gameConfig';

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
  private spawnArea: SpawnArea;
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
    // Targets must have their entire bounding circle inside the playable area.
    const effectiveMargin = spawnMargin + targetRadius;
    this.spawnArea = {
      minX: effectiveMargin,
      maxX: canvasWidth - effectiveMargin,
      minY: effectiveMargin,
      maxY: canvasHeight - effectiveMargin,
    };
  }

  /**
   * Generate a non-overlapping valid random spawn coordinate within spawnArea.
   * Uses a retry-based approach: try random positions and check distance from
   * all existing targets. If no valid position is found after retryLimit
   * attempts, accept the best (furthest-from-nearest-neighbor) position.
   */
  public generateValidSpawnPosition(): { x: number; y: number } {
    let bestPosition = this.randomPointInArea();
    let bestMinDistance = 0;

    for (let attempt = 0; attempt < this.retryLimit; attempt++) {
      const candidate = this.randomPointInArea();
      const nearestDistance = this.getNearestTargetDistance(candidate.x, candidate.y);

      // If no existing targets, or the candidate is sufficiently separated, accept immediately
      if (nearestDistance >= this.minSeparation) {
        return candidate;
      }

      // Track the best position found so far (the one with the greatest distance to its nearest neighbor)
      if (nearestDistance > bestMinDistance) {
        bestMinDistance = nearestDistance;
        bestPosition = candidate;
      }
    }

    // Fallback: return the best position found even if not ideal
    return bestPosition;
  }

  /**
   * Create and register a new target entity at a valid position.
   * Uses the telemetry ID generator for unique target IDs.
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
    return target;
  }

  /**
   * Spawn the initial batch of targets for a round.
   * Returns an array of all newly created Target entities.
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
   * Handle target destruction and remove from active targets.
   */
  public destroyTarget(targetId: string, destroyTime: number = Date.now()): void {
    const target = this.activeTargets.get(targetId);
    if (target) {
      target.destroy(destroyTime);
      this.activeTargets.delete(targetId);
    }
  }

  /**
   * Maintain active targets count by filling empty slots.
   * Returns an array of newly created Target entities.
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

  /**
   * Check if a point (x, y) hits any active target.
   * Returns the hit Target entity, or null if no target was hit.
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

  /**
   * Generate a random point within the valid spawn area.
   */
  private randomPointInArea(): { x: number; y: number } {
    const x = Math.random() * (this.spawnArea.maxX - this.spawnArea.minX) + this.spawnArea.minX;
    const y = Math.random() * (this.spawnArea.maxY - this.spawnArea.minY) + this.spawnArea.minY;
    return { x, y };
  }

  /**
   * Calculate the distance to the nearest existing active target from a point.
   * Returns Infinity if there are no active targets.
   */
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
