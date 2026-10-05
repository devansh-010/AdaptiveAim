import type { GameStatus } from '../../types/game';
import { TelemetryCollector } from '../../telemetry/TelemetryCollector';

export interface RoundConfig {
  mode: string;
  durationSeconds: number;
}

/**
 * RoundManager controls round lifecycle: timer countdown, state transitions,
 * and dispatching round start/end notifications to TelemetryCollector.
 */
export class RoundManager {
  private status: GameStatus = 'idle';
  private roundId: string | null = null;
  private durationSeconds: number;
  private timeRemaining: number;
  private telemetryCollector: TelemetryCollector;

  constructor(telemetryCollector: TelemetryCollector, durationSeconds: number = 30) {
    this.telemetryCollector = telemetryCollector;
    this.durationSeconds = durationSeconds;
    this.timeRemaining = durationSeconds;
  }

  /**
   * TODO: Start a new gameplay round and notify TelemetryCollector.
   */
  public startRound(roundId: string, mode: string = 'six_shot'): void {
    this.roundId = roundId;
    this.status = 'playing';
    this.timeRemaining = this.durationSeconds;
    this.telemetryCollector.startRound(roundId, mode);
  }

  /**
   * TODO: Decrement round timer per frame delta or timer tick.
   */
  public updateTimer(deltaSeconds: number): void {
    if (this.status !== 'playing') return;

    this.timeRemaining -= deltaSeconds;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.endRound();
    }
  }

  /**
   * TODO: Conclude active round and finalize telemetry aggregation.
   */
  public endRound(): void {
    if (this.status !== 'playing') return;

    this.status = 'finished';
    this.telemetryCollector.endRound();
  }

  public getStatus(): GameStatus {
    return this.status;
  }

  public getTimeRemaining(): number {
    return this.timeRemaining;
  }

  public getRoundId(): string | null {
    return this.roundId;
  }
}
