/**
 * Telemetry data types for player performance tracking and game analytics.
 */

export interface Player {
  player_id: string;
}

export interface Session {
  session_id: string;
  player_id: string;
  start_time: string;
  end_time?: string;
}

export interface RoundTelemetry {
  round_id: string;
  session_id: string;
  mode: string;
  difficulty: string;
  start_time: string;
  end_time?: string;
  duration: number;
  shots_fired: number;
  hits: number;
  misses: number;
  accuracy: number;
  targets_hit: number;
  targets_spawned: number;
  average_reaction_time: number;
  average_precision: number;
}

export interface TargetTelemetry {
  target_id: string;
  round_id: string;
  spawn_time: string;
  destroy_time?: string;
  spawn_x: number;
  spawn_y: number;
  target_size: number;
  movement_enabled: boolean;
  movement_speed: number;
  direction_x: number;
  direction_y: number;
  lifetime?: number;
}

export interface ShotTelemetry {
  shot_id: string;
  round_id: string;
  target_id: string | null;
  timestamp: string;
  hit: boolean;
  player_x: number;
  player_y: number;
  target_x: number | null;
  target_y: number | null;
  target_size: number | null;
  target_speed: number | null;
  distance_to_target: number | null;
  reaction_time: number | null;
  precision: number | null;
}

/**
 * A single raw mouse trajectory sample capturing aim position and movement deltas.
 */
export interface TrajectorySample {
  /** ISO 8601 timestamp of the sample */
  timestamp: string;
  /** Logical/world aim position X (consistent with hit detection coordinates) */
  x: number;
  /** Logical/world aim position Y (consistent with hit detection coordinates) */
  y: number;
  /** Raw relative horizontal mouse movement delta accumulated since last sample */
  movement_x: number;
  /** Raw relative vertical mouse movement delta accumulated since last sample */
  movement_y: number;
}

/**
 * A trajectory segment containing ordered raw samples between two shots,
 * or from round start to first shot, or from last shot to round end.
 */
export interface TrajectorySegment {
  /** Unique trajectory segment identifier */
  trajectory_id: string;
  /** Round this segment belongs to */
  round_id: string;
  /** Shot ID this segment is associated with, or null for trailing/unassigned segments */
  shot_id: string | null;
  /** Target ID actually hit by the associated shot, or null for misses/unassigned */
  target_id: string | null;
  /** ISO 8601 timestamp when this segment started */
  start_time: string;
  /** ISO 8601 timestamp when this segment ended */
  end_time: string;
  /** Duration of the segment in milliseconds */
  duration: number;
  /** Ordered array of raw trajectory samples */
  samples: TrajectorySample[];
}
