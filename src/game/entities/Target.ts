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
  public readonly spawnTime: number;
  public destroyTime?: number;
  public isDestroyed: boolean = false;

  constructor(
    targetId: string,
    roundId: string,
    x: number,
    y: number,
    size: number,
    spawnTime: number = Date.now()
  ) {
    this.targetId = targetId;
    this.roundId = roundId;
    this.x = x;
    this.y = y;
    this.size = size;
    this.spawnTime = spawnTime;
  }

  /**
   * Mark target as destroyed and record destroy timestamp.
   */
  public destroy(destroyTime: number = Date.now()): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.destroyTime = destroyTime;
  }

  /**
   * Calculate exact distance from a point (e.g. click coordinates) to target center.
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
      lifetime: this.destroyTime ? this.destroyTime - this.spawnTime : undefined,
    };
  }
}
