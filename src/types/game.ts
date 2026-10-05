/**
 * Core game domain types for AdaptiveAim.
 */

export type GameMode = 'six_shot' | 'thirty_shot' | 'moving_targets';

export type GameStatus = 'idle' | 'playing' | 'paused' | 'finished';

export interface GameModeInfo {
  id: GameMode;
  name: string;
  description: string;
}

export interface RoundSummary {
  roundId: string;
  mode: GameMode;
  duration: number; // in seconds
  shotsFired: number;
  hits: number;
  misses: number;
  accuracy: number; // 0 to 100 percentage
  avgReactionTime: number; // in ms
  avgPrecision: number; // offset distance from center
}
