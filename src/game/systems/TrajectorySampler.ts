import { generateTrajectoryId } from '../../telemetry/ids.ts';
import type { TrajectorySample, TrajectorySegment } from '../../telemetry/types';
import { telemetryCollector as defaultCollector, TelemetryCollector } from '../../telemetry/TelemetryCollector.ts';

/**
 * TrajectorySampler coordinates high-frequency mouse trajectory sampling,
 * raw delta accumulation, and shot/round boundary finalization for gameplay.
 *
 * It enforces the following invariants:
 * 1. Mouse movement accumulated between periodic 16 ms samples is captured at the shot boundary
 *    using the shot's timestamp and logical aim position.
 * 2. Movement occurring before a shot belongs to that shot's segment exactly once,
 *    and never leaks into subsequent shot segments.
 * 3. Final movement occurring between the last shot and round completion is captured and preserved
 *    as an unassigned trailing segment (shot_id = null, target_id = null).
 * 4. Empty segments and stationary intervals are handled safely without throwing or corrupting metrics.
 */
export class TrajectorySampler {
  private collector: TelemetryCollector;
  private roundId: string = '';
  private active: boolean = false;
  private segmentStartTime: string = '';
  private pendingSamples: TrajectorySample[] = [];
  private accumulatedMovementX: number = 0;
  private accumulatedMovementY: number = 0;

  constructor(collector: TelemetryCollector = defaultCollector) {
    this.collector = collector;
  }

  /**
   * Start trajectory sampling for a new round.
   */
  public start(roundId: string, startTime: string = new Date().toISOString()): void {
    this.roundId = roundId;
    this.active = true;
    this.pendingSamples = [];
    this.accumulatedMovementX = 0;
    this.accumulatedMovementY = 0;
    this.segmentStartTime = startTime;
  }

  /**
   * Accumulate raw relative mouse movement deltas.
   */
  public accumulateMovement(dx: number, dy: number): void {
    if (!this.active) {
      return;
    }
    this.accumulatedMovementX += dx;
    this.accumulatedMovementY += dy;
  }

  /**
   * Clear accumulated movement without recording (e.g. when pointer lock is lost).
   */
  public clearAccumulatedMovement(): void {
    this.accumulatedMovementX = 0;
    this.accumulatedMovementY = 0;
  }

  /**
   * Capture a periodic snapshot of the logical aim position and consume accumulated deltas.
   */
  public capturePeriodicSnapshot(
    x: number,
    y: number,
    timestamp: string = new Date().toISOString()
  ): TrajectorySample | null {
    if (!this.active) {
      this.clearAccumulatedMovement();
      return null;
    }

    const sample: TrajectorySample = {
      timestamp,
      x,
      y,
      movement_x: this.accumulatedMovementX,
      movement_y: this.accumulatedMovementY,
    };

    this.pendingSamples.push(sample);
    this.accumulatedMovementX = 0;
    this.accumulatedMovementY = 0;

    return sample;
  }

  /**
   * Handle shot boundary:
   * 1. Consumes any pending mouse movement accumulated since the previous snapshot
   *    and records the current logical aim position at the shot boundary using the shot timestamp.
   * 2. Finalizes the current trajectory segment associating it with the shot.
   * 3. Starts a clean segment for subsequent samples with segmentStartTime = timestamp.
   */
  public handleShotBoundary(
    shotId: string,
    targetId: string | null,
    worldX: number,
    worldY: number,
    timestamp: string = new Date().toISOString()
  ): TrajectorySegment | null {
    if (!this.active) {
      return null;
    }

    // Capture the shot boundary sample consuming any movement since last periodic sample
    const boundarySample: TrajectorySample = {
      timestamp,
      x: worldX,
      y: worldY,
      movement_x: this.accumulatedMovementX,
      movement_y: this.accumulatedMovementY,
    };
    this.pendingSamples.push(boundarySample);

    // Reset accumulated movement so it belongs strictly to this shot
    this.accumulatedMovementX = 0;
    this.accumulatedMovementY = 0;

    // Finalize the segment for this shot
    return this.finalizeSegment(shotId, targetId, timestamp);
  }

  /**
   * Stop trajectory collection at round conclusion or transition.
   * Consumes any final pending movement and preserves it as an unassigned trailing segment.
   */
  public stop(
    worldX?: number,
    worldY?: number,
    timestamp: string = new Date().toISOString()
  ): TrajectorySegment | null {
    if (!this.active) {
      return null;
    }
    this.active = false;

    // If there is pending accumulated movement and a valid aim position, capture it
    if (
      (this.accumulatedMovementX !== 0 || this.accumulatedMovementY !== 0) &&
      worldX !== undefined &&
      worldY !== undefined
    ) {
      this.pendingSamples.push({
        timestamp,
        x: worldX,
        y: worldY,
        movement_x: this.accumulatedMovementX,
        movement_y: this.accumulatedMovementY,
      });
      this.accumulatedMovementX = 0;
      this.accumulatedMovementY = 0;
    }

    // Finalize any remaining samples as an unassigned trailing segment
    let trailingSegment: TrajectorySegment | null = null;
    if (this.pendingSamples.length > 0) {
      trailingSegment = this.finalizeSegment(null, null, timestamp);
    }

    this.accumulatedMovementX = 0;
    this.accumulatedMovementY = 0;
    this.pendingSamples = [];

    return trailingSegment;
  }

  /**
   * Finalize the pending samples into a TrajectorySegment, record it in telemetry,
   * and advance the segment window.
   */
  public finalizeSegment(
    shotId: string | null,
    targetId: string | null,
    endTime: string
  ): TrajectorySegment {
    const samples = [...this.pendingSamples];
    const startTime = this.segmentStartTime || endTime;
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();

    const segment: TrajectorySegment = {
      trajectory_id: generateTrajectoryId(),
      round_id: this.roundId,
      shot_id: shotId,
      target_id: targetId,
      start_time: startTime,
      end_time: endTime,
      duration: Math.max(0, endMs - startMs),
      samples,
    };

    this.collector.recordTrajectorySegment(segment);

    // Reset pending state for the next segment
    this.pendingSamples = [];
    this.segmentStartTime = endTime;

    return segment;
  }

  /**
   * Full reset (e.g. on scene destroy or abort).
   */
  public reset(): void {
    this.active = false;
    this.roundId = '';
    this.segmentStartTime = '';
    this.pendingSamples = [];
    this.accumulatedMovementX = 0;
    this.accumulatedMovementY = 0;
  }

  public isActive(): boolean {
    return this.active;
  }

  public getPendingSamples(): readonly TrajectorySample[] {
    return this.pendingSamples;
  }

  public getAccumulatedMovement(): { x: number; y: number } {
    return { x: this.accumulatedMovementX, y: this.accumulatedMovementY };
  }

  public getSegmentStartTime(): string {
    return this.segmentStartTime;
  }
}
