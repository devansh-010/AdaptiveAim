import type {
  Player,
  Session,
  RoundTelemetry,
  TargetTelemetry,
  ShotTelemetry,
  TrajectoryPoint,
} from './types';
import { generatePlayerId, generateSessionId } from './ids';

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
  private trajectoryPoints: TrajectoryPoint[] = [];

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
    this.trajectoryPoints = [];

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

  public recordTrajectoryPoint(point: TrajectoryPoint): void {
    this.trajectoryPoints.push(point);
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

    // Development structured telemetry output
    console.log('=== SIX SHOT TELEMETRY ===');
    console.log(
      JSON.stringify(
        {
          player_id: this.activePlayer.player_id,
          session_id: this.activeSession.session_id,
          round: completedRound,
          targets: this.targetEvents,
          shots: this.shotEvents,
        },
        null,
        2
      )
    );

    return completedRound;
  }

  public getRecordedTargets(): TargetTelemetry[] {
    return [...this.targetEvents];
  }

  public getRecordedShots(): ShotTelemetry[] {
    return [...this.shotEvents];
  }

  public getRecordedTrajectory(): TrajectoryPoint[] {
    return [...this.trajectoryPoints];
  }

  public endSession(): void {
    this.activeSession.end_time = new Date().toISOString();
  }
}

// Global Singleton Instance export for application lifecycle
export const telemetryCollector = new TelemetryCollector();
