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
  average_reaction_time?: number;
  average_precision?: number;
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
  target_x?: number;
  target_y?: number;
  target_size?: number;
  target_speed?: number;
  distance_to_target?: number;
  reaction_time?: number;
  precision?: number;
}

/**
 * Trajectory point type for mouse movement tracking.
 * Reserved for future telemetry milestones.
 */
export interface TrajectoryPoint {
  timestamp: string;
  x: number;
  y: number;
  target_id?: string;
  shot_id?: string;
}
