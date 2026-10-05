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
      start_time: Date.now(),
    };
  }

  public getPlayer(): Player {
    return { ...this.activePlayer };
  }

  public getSession(): Session {
    return { ...this.activeSession };
  }

  public startRound(roundId: string, mode: string, difficulty: string = 'standard'): void {
    this.targetEvents = [];
    this.shotEvents = [];
    this.trajectoryPoints = [];

    this.currentRound = {
      round_id: roundId,
      session_id: this.activeSession.session_id,
      mode,
      difficulty,
      start_time: Date.now(),
      duration: 0,
      shots_fired: 0,
      hits: 0,
      misses: 0,
      accuracy: 0,
      average_reaction_time: 0,
      average_precision: 0,
      targets_hit: 0,
      targets_spawned: 0,
    };
  }

  public recordTargetSpawn(target: TargetTelemetry): void {
    this.targetEvents.push(target);
    if (this.currentRound) {
      this.currentRound.targets_spawned += 1;
    }
  }

  public recordTargetDestroy(targetId: string, destroyTime: number): void {
    const target = this.targetEvents.find((t) => t.target_id === targetId);
    if (target) {
      target.destroy_time = destroyTime;
      target.lifetime = destroyTime - target.spawn_time;
    }
  }

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
    }
  }

  public recordTrajectoryPoint(point: TrajectoryPoint): void {
    this.trajectoryPoints.push(point);
  }

  public endRound(): RoundTelemetry | null {
    if (!this.currentRound) return null;

    const endTime = Date.now();
    this.currentRound.end_time = endTime;
    this.currentRound.duration = (endTime - this.currentRound.start_time) / 1000;

    // Calculate aggregated accuracy
    if (this.currentRound.shots_fired > 0) {
      this.currentRound.accuracy =
        (this.currentRound.hits / this.currentRound.shots_fired) * 100;
    }

    // Calculate average reaction time from hit shots
    const hitShots = this.shotEvents.filter((s) => s.hit && s.reaction_time !== undefined);
    if (hitShots.length > 0) {
      const totalReaction = hitShots.reduce((acc, s) => acc + (s.reaction_time || 0), 0);
      this.currentRound.average_reaction_time = totalReaction / hitShots.length;
    }

    // Calculate average precision (offset distance) from hit shots
    if (hitShots.length > 0) {
      const totalPrecision = hitShots.reduce((acc, s) => acc + (s.precision || 0), 0);
      this.currentRound.average_precision = totalPrecision / hitShots.length;
    }

    return { ...this.currentRound };
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
    this.activeSession.end_time = Date.now();
  }
}

// Global Singleton Instance export for convenience
export const telemetryCollector = new TelemetryCollector();
