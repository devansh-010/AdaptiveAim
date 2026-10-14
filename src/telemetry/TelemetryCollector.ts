import type {
  Player,
  Session,
  RoundTelemetry,
  TargetTelemetry,
  ShotTelemetry,
  TrajectorySegment,
} from './types';
import { generatePlayerId, generateSessionId } from './ids';
import { calculateTrajectoryFeatures } from './trajectoryFeatures.ts';

/**
 * TelemetryCollector centralizes performance metrics collection and round data aggregation.
 * Independent of React components and Phaser rendering logic.
 */
export class TelemetryCollector {
  private activePlayer: Player;
  private activeSession: Session;
  private currentRound: RoundTelemetry | null = null;
  private targetEvents: TargetTelemetry[] = [];
  private shotEvents: ShotTelemetry[] = [];
  private trajectorySegments: TrajectorySegment[] = [];

  constructor(playerId?: string) {
    const id = playerId || generatePlayerId();
    this.activePlayer = { player_id: id };
    this.activeSession = {
      session_id: generateSessionId(),
      player_id: id,
      start_time: new Date().toISOString(),
    };
  }

  public getPlayer(): Player {
    return { ...this.activePlayer };
  }

  public getSession(): Session {
    return { ...this.activeSession };
  }

  public getCurrentRound(): RoundTelemetry | null {
    return this.currentRound ? { ...this.currentRound } : null;
  }

  /**
   * Start recording a new gameplay round.
   */
  public startRound(roundId: string, mode: string = 'six_shot', difficulty: string = 'fixed'): void {
    this.targetEvents = [];
    this.shotEvents = [];
    this.trajectorySegments = [];

    this.currentRound = {
      round_id: roundId,
      session_id: this.activeSession.session_id,
      mode,
      difficulty,
      start_time: new Date().toISOString(),
      duration: 0,
      shots_fired: 0,
      hits: 0,
      misses: 0,
      accuracy: 0,
      targets_hit: 0,
      targets_spawned: 0,
      average_reaction_time: 0,
      average_precision: 0,
    };
  }

  /**
   * Record target spawn event.
   */
  public recordTargetSpawn(target: TargetTelemetry): void {
    this.targetEvents.push(target);
    if (this.currentRound) {
      this.currentRound.targets_spawned += 1;
    }
  }

  /**
   * Record target destruction event.
   */
  public recordTargetDestroy(targetId: string, destroyTime: string = new Date().toISOString()): void {
    const target = this.targetEvents.find((t) => t.target_id === targetId);
    if (target) {
      target.destroy_time = destroyTime;
      target.lifetime = new Date(destroyTime).getTime() - new Date(target.spawn_time).getTime();
    }
  }

  /**
   * Record shot event.
   */
  public recordShot(shot: ShotTelemetry): void {
    this.shotEvents.push(shot);

    if (this.currentRound) {
      this.currentRound.shots_fired += 1;
      if (shot.hit) {
        this.currentRound.hits += 1;
        this.currentRound.targets_hit += 1;
      } else {
        this.currentRound.misses += 1;
      }

      this.currentRound.accuracy = Number(
        ((this.currentRound.hits / this.currentRound.shots_fired) * 100).toFixed(2)
      );
    }
  }

  /**
   * Record a finalized trajectory segment for the current round.
   * Computes derived kinematic and geometric features if not already calculated.
   */
  public recordTrajectorySegment(segment: TrajectorySegment): void {
    if (!segment.derived_metrics) {
      segment.derived_metrics = calculateTrajectoryFeatures(segment);
    }
    this.trajectorySegments.push(segment);
  }

  /**
   * Finalize current round recording, calculate aggregate metrics, and emit structured debug log.
   */
  public endRound(): RoundTelemetry | null {
    if (!this.currentRound) return null;

    const endTime = new Date().toISOString();
    this.currentRound.end_time = endTime;

    const startMs = new Date(this.currentRound.start_time).getTime();
    const endMs = new Date(endTime).getTime();
    this.currentRound.duration = Number(((endMs - startMs) / 1000).toFixed(2));

    if (this.currentRound.shots_fired > 0) {
      this.currentRound.accuracy = Number(
        ((this.currentRound.hits / this.currentRound.shots_fired) * 100).toFixed(2)
      );
    } else {
      this.currentRound.accuracy = 0;
    }

    // Calculate average reaction time from HIT shots ONLY
    const hitShotsWithReaction = this.shotEvents.filter(
      (s) => s.hit && s.reaction_time !== null && s.reaction_time !== undefined
    );
    if (hitShotsWithReaction.length > 0) {
      const totalReaction = hitShotsWithReaction.reduce(
        (acc, s) => acc + (s.reaction_time || 0),
        0
      );
      this.currentRound.average_reaction_time = Number(
        (totalReaction / hitShotsWithReaction.length).toFixed(3)
      );
    } else {
      this.currentRound.average_reaction_time = 0;
    }

    // Calculate average precision (shot-to-target-center distance in pixels) from HIT shots ONLY
    const hitShotsWithPrecision = this.shotEvents.filter(
      (s) => s.hit && s.precision !== null && s.precision !== undefined
    );
    if (hitShotsWithPrecision.length > 0) {
      const totalPrecision = hitShotsWithPrecision.reduce(
        (acc, s) => acc + (s.precision || 0),
        0
      );
      this.currentRound.average_precision = Number(
        (totalPrecision / hitShotsWithPrecision.length).toFixed(2)
      );
    } else {
      this.currentRound.average_precision = 0;
    }

    const completedRound = { ...this.currentRound };

    // ── Compact round summary ──
    console.log('=== SIX SHOT TELEMETRY ===');
    console.log(JSON.stringify({
      round_id: completedRound.round_id,
      mode: completedRound.mode,
      duration: completedRound.duration,
      shots_fired: completedRound.shots_fired,
      hits: completedRound.hits,
      misses: completedRound.misses,
      accuracy: completedRound.accuracy,
      targets_spawned: completedRound.targets_spawned,
      average_reaction_time: completedRound.average_reaction_time,
      average_precision: completedRound.average_precision,
    }, null, 2));

    // ── Trajectory diagnostic summary ──
    const totalSamples = this.trajectorySegments.reduce(
      (acc, seg) => acc + seg.samples.length, 0
    );

    const segmentDigests = this.trajectorySegments.map((seg) => {
      const first = seg.samples.length > 0 ? seg.samples[0] : null;
      const last = seg.samples.length > 1 ? seg.samples[seg.samples.length - 1] : first;
      const nonzeroCount = seg.samples.filter((s) => s.movement_x !== 0 || s.movement_y !== 0).length;
      return {
        trajectory_id: seg.trajectory_id,
        round_id: seg.round_id,
        shot_id: seg.shot_id,
        target_id: seg.target_id,
        sample_count: seg.samples.length,
        nonzero_sample_count: nonzeroCount,
        start_time: seg.start_time,
        end_time: seg.end_time,
        duration: seg.duration,
        derived: seg.derived_metrics ? {
          path_distance: Number(seg.derived_metrics.path_distance.toFixed(1)),
          direct_distance: Number(seg.derived_metrics.direct_distance.toFixed(1)),
          path_efficiency: seg.derived_metrics.path_efficiency !== null ? Number(seg.derived_metrics.path_efficiency.toFixed(3)) : null,
          avg_velocity: seg.derived_metrics.average_velocity !== null ? Number(seg.derived_metrics.average_velocity.toFixed(1)) : null,
          max_velocity: seg.derived_metrics.max_velocity !== null ? Number(seg.derived_metrics.max_velocity.toFixed(1)) : null,
          direction_changes: seg.derived_metrics.direction_changes,
        } : null,
        first_sample: first,
        last_sample: last,
      };
    });

    // Compute movement delta statistics across all samples
    let nonzeroMovementSamples = 0;
    let zeroMovementSamples = 0;
    let sumAbsMovementX = 0;
    let sumAbsMovementY = 0;
    let maxAbsMovementX = 0;
    let maxAbsMovementY = 0;
    let firstNonzeroSample: { segment_index: number; sample_index: number; sample: typeof segmentDigests[0]['first_sample'] } | null = null;

    for (let si = 0; si < this.trajectorySegments.length; si++) {
      const seg = this.trajectorySegments[si];
      for (let ji = 0; ji < seg.samples.length; ji++) {
        const s = seg.samples[ji];
        const absX = Math.abs(s.movement_x);
        const absY = Math.abs(s.movement_y);
        sumAbsMovementX += absX;
        sumAbsMovementY += absY;
        if (absX > maxAbsMovementX) maxAbsMovementX = absX;
        if (absY > maxAbsMovementY) maxAbsMovementY = absY;
        if (s.movement_x !== 0 || s.movement_y !== 0) {
          nonzeroMovementSamples++;
          if (!firstNonzeroSample) {
            firstNonzeroSample = { segment_index: si, sample_index: ji, sample: s };
          }
        } else {
          zeroMovementSamples++;
        }
      }
    }

    // Aggregate derived trajectory metrics across all segments
    const segmentsWithEfficiency = this.trajectorySegments.filter(
      (s) => s.derived_metrics?.path_efficiency !== null && s.derived_metrics?.path_efficiency !== undefined
    );
    const meanEfficiency = segmentsWithEfficiency.length > 0
      ? Number(
          (
            segmentsWithEfficiency.reduce((acc, s) => acc + (s.derived_metrics!.path_efficiency ?? 0), 0) /
            segmentsWithEfficiency.length
          ).toFixed(3)
        )
      : null;

    const totalPathDistance = Number(
      this.trajectorySegments.reduce((acc, s) => acc + (s.derived_metrics?.path_distance ?? 0), 0).toFixed(1)
    );

    const velocities = this.trajectorySegments
      .map((s) => s.derived_metrics?.max_velocity)
      .filter((v): v is number => v !== null && v !== undefined);
    const peakVelocity = velocities.length > 0 ? Math.max(...velocities) : null;

    const totalDirectionChanges = this.trajectorySegments.reduce(
      (acc, s) => acc + (s.derived_metrics?.direction_changes ?? 0),
      0
    );

    console.log('=== TRAJECTORY DIAGNOSTIC ===');
    console.log(JSON.stringify({
      trajectory_segments_count: this.trajectorySegments.length,
      total_samples: totalSamples,
      movement_stats: {
        nonzero_movement_samples: nonzeroMovementSamples,
        zero_movement_samples: zeroMovementSamples,
        sum_abs_movement_x: Number(sumAbsMovementX.toFixed(2)),
        sum_abs_movement_y: Number(sumAbsMovementY.toFixed(2)),
        max_abs_movement_x: Number(maxAbsMovementX.toFixed(2)),
        max_abs_movement_y: Number(maxAbsMovementY.toFixed(2)),
        first_nonzero_sample: firstNonzeroSample,
      },
      derived_stats: {
        total_path_distance: totalPathDistance,
        mean_path_efficiency: meanEfficiency,
        peak_velocity: peakVelocity !== null ? Number(peakVelocity.toFixed(1)) : null,
        total_direction_changes: totalDirectionChanges,
      },
      segments: segmentDigests,
    }, null, 2));

    // ── Association validation summary ──
    const shotCount = this.shotEvents.length;
    const segmentsWithShot = this.trajectorySegments.filter((s) => s.shot_id !== null);
    const segmentsWithoutShot = this.trajectorySegments.filter((s) => s.shot_id === null);
    const hitSegments = this.trajectorySegments.filter((s) => s.target_id !== null);
    const missSegments = segmentsWithShot.filter((s) => s.target_id === null);

    // Detect duplicate shot_id associations
    const shotIdCounts = new Map<string, number>();
    for (const seg of segmentsWithShot) {
      const count = shotIdCounts.get(seg.shot_id!) ?? 0;
      shotIdCounts.set(seg.shot_id!, count + 1);
    }
    const hasDuplicateShotIds = Array.from(shotIdCounts.values()).some((c) => c > 1);

    console.log('=== ASSOCIATION VALIDATION ===');
    console.log(JSON.stringify({
      shot_records: shotCount,
      segments_with_shot_id: segmentsWithShot.length,
      segments_with_null_shot_id: segmentsWithoutShot.length,
      hit_associated_segments: hitSegments.length,
      miss_associated_segments: missSegments.length,
      duplicate_shot_id_in_segments: hasDuplicateShotIds,
    }, null, 2));

    return completedRound;
  }

  public getRecordedTargets(): TargetTelemetry[] {
    return [...this.targetEvents];
  }

  public getRecordedShots(): ShotTelemetry[] {
    return [...this.shotEvents];
  }

  public getRecordedTrajectorySegments(): TrajectorySegment[] {
    return [...this.trajectorySegments];
  }

  public endSession(): void {
    this.activeSession.end_time = new Date().toISOString();
  }
}

// Global Singleton Instance export for application lifecycle
export const telemetryCollector = new TelemetryCollector();
