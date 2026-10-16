import type { TargetTelemetry } from '../../telemetry/types';

export interface TargetBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Clean domain abstraction representing a single Target in the aim trainer.
 * Handles target state data, movement, boundary reflection, and target lifecycle.
 */
export class Target {
  public readonly targetId: string;
  public readonly roundId: string;
  public x: number;
  public y: number;
  public readonly spawnX: number;
  public readonly spawnY: number;
  public readonly size: number;
  public readonly spawnTime: string;
  public destroyTime?: string;
  public isDestroyed: boolean = false;
  public readonly movementEnabled: boolean;
  public readonly movementSpeed: number;
  public directionX: number;
  public directionY: number;

  constructor(
    targetId: string,
    roundId: string,
    x: number,
    y: number,
    size: number,
    spawnTime: string = new Date().toISOString(),
    movementEnabled: boolean = false,
    movementSpeed: number = 0,
    directionX: number = 0,
    directionY: number = 0
  ) {
    this.targetId = targetId;
    this.roundId = roundId;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.size = size;
    this.spawnTime = spawnTime;
    this.movementEnabled = movementEnabled;
    this.movementSpeed = movementSpeed;
    this.directionX = directionX;
    this.directionY = directionY;
  }

  /**
   * Advance target position based on direction and speed, and bounce off boundaries.
   */
  public update(deltaSeconds: number, bounds: TargetBounds): void {
    if (!this.movementEnabled || this.isDestroyed || deltaSeconds <= 0) {
      return;
    }

    this.x += this.directionX * this.movementSpeed * deltaSeconds;
    this.y += this.directionY * this.movementSpeed * deltaSeconds;

    const minX = Math.min(bounds.minX, bounds.maxX);
    const maxX = Math.max(bounds.minX, bounds.maxX);
    const minY = Math.min(bounds.minY, bounds.maxY);
    const maxY = Math.max(bounds.minY, bounds.maxY);

    // Boundary reflections (accounting for target center within valid bounds)
    if (this.x <= minX) {
      this.x = minX;
      this.directionX = Math.abs(this.directionX);
    } else if (this.x >= maxX) {
      this.x = maxX;
      this.directionX = -Math.abs(this.directionX);
    }

    if (this.y <= minY) {
      this.y = minY;
      this.directionY = Math.abs(this.directionY);
    } else if (this.y >= maxY) {
      this.y = maxY;
      this.directionY = -Math.abs(this.directionY);
    }
  }

  /**
   * Mark target as destroyed and record destroy timestamp (ISO 8601).
   */
  public destroy(destroyTime: string = new Date().toISOString()): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.destroyTime = destroyTime;
  }

  /**
   * Calculate exact distance from a point to target center in logical world coordinates.
   */
  public getDistanceFrom(pointX: number, pointY: number): number {
    const dx = pointX - this.x;
    const dy = pointY - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if a point falls within target radius.
   */
  public isHit(pointX: number, pointY: number): boolean {
    return this.getDistanceFrom(pointX, pointY) <= this.size;
  }

  /**
   * Convert entity data to Telemetry format.
   */
  public toTelemetry(): TargetTelemetry {
    const lifetime = this.destroyTime
      ? new Date(this.destroyTime).getTime() - new Date(this.spawnTime).getTime()
      : undefined;

    return {
      target_id: this.targetId,
      round_id: this.roundId,
      spawn_time: this.spawnTime,
      destroy_time: this.destroyTime,
      spawn_x: this.spawnX,
      spawn_y: this.spawnY,
      target_size: this.size,
      movement_enabled: this.movementEnabled,
      movement_speed: this.movementSpeed,
      direction_x: Number(this.directionX.toFixed(3)),
      direction_y: Number(this.directionY.toFixed(3)),
      lifetime,
    };
  }
}
