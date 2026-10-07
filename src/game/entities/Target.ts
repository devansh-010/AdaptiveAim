import type { TargetTelemetry } from '../../telemetry/types';

/**
 * Clean domain abstraction representing a single Target in the aim trainer.
 * Handles target state data and target lifecycle without movement logic.
 */
export class Target {
  public readonly targetId: string;
  public readonly roundId: string;
  public readonly x: number;
  public readonly y: number;
  public readonly size: number;
  public readonly spawnTime: string;
  public destroyTime?: string;
  public isDestroyed: boolean = false;

  constructor(
    targetId: string,
    roundId: string,
    x: number,
    y: number,
    size: number,
    spawnTime: string = new Date().toISOString()
  ) {
    this.targetId = targetId;
    this.roundId = roundId;
    this.x = x;
    this.y = y;
    this.size = size;
    this.spawnTime = spawnTime;
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
      spawn_x: this.x,
      spawn_y: this.y,
      target_size: this.size,
      movement_enabled: false,
      movement_speed: 0,
      direction_x: 0,
      direction_y: 0,
      lifetime,
    };
  }
}
