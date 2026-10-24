/** Prototype only: this module is not connected to the game scenes. */
export type AdaptiveMode = 'six_shot' | 'moving_targets' | 'thirty_shot';

/** Authored starting hypotheses, not thresholds estimated from the nine-round batch. */
export const ROUND_POLICY = Object.freeze({
  version: 'radius-v1',
  initialRadius: 22,
  minRadius: 18,
  maxRadius: 26,
  radiusStep: 2,
  minimumShots: 20,
  lowerAccuracyPercent: 80,
  upperAccuracyPercent: 90,
} as const);

export interface RoundEvidence {
  roundId: string;
  mode: AdaptiveMode;
  /** Stable rules, settings, viewport and runtime revision; excludes radius. */
  contextKey: string | null;
  radius: number;
  startedAtMs: number;
  endedAtMs: number;
  shots: number;
  hits: number;
  completion: 'completed' | 'aborted' | 'unknown';
  /** Verified means valid telemetry and confirmed uninterrupted collection context. */
  quality: 'verified' | 'interrupted' | 'invalid' | 'unknown';
}

export interface DifficultyState {
  mode: AdaptiveMode;
  contextKey: string;
  radius: number;
  previous: RoundEvidence | null;
  processedRoundIds: string[];
  lastProcessedEndMs: number | null;
}

export type DecisionReason =
  | 'wrong_mode' | 'duplicate_round' | 'out_of_order' | 'invalid_evidence'
  | 'not_completed' | 'unverified_quality' | 'context_mismatch' | 'radius_mismatch'
  | 'insufficient_shots' | 'need_second_round' | 'accuracy_band_or_mixed'
  | 'two_high_accuracy_rounds' | 'two_low_accuracy_rounds'
  | 'minimum_radius' | 'maximum_radius';

export interface DifficultyDecision {
  state: DifficultyState;
  action: 'hold' | 'increase_challenge' | 'decrease_challenge';
  reason: DecisionReason;
  fromRadius: number;
  toRadius: number;
  evidenceRoundIds: string[];
}

function supportedRadius(radius: number): boolean {
  return Number.isInteger(radius) && radius >= ROUND_POLICY.minRadius && radius <= ROUND_POLICY.maxRadius &&
    (radius - ROUND_POLICY.minRadius) % ROUND_POLICY.radiusStep === 0;
}

export function createDifficultyState(mode: AdaptiveMode, contextKey: string, radius: number = ROUND_POLICY.initialRadius): DifficultyState {
  if (!['six_shot', 'moving_targets', 'thirty_shot'].includes(mode) || !contextKey.trim() || !supportedRadius(radius)) {
    throw new RangeError('A supported mode, nonempty context key, and radius on the policy ladder are required.');
  }
  return { mode, contextKey, radius, previous: null, processedRoundIds: [], lastProcessedEndMs: null };
}

/**
 * Consume one finalized observation, producing detached state and a next-round proposal.
 * Caller owns one state per mode/condition and validates telemetry before creating evidence.
 */
export function evaluateRound(state: DifficultyState, round: RoundEvidence): DifficultyDecision {
  const next: DifficultyState = {
    ...state, previous: state.previous ? { ...state.previous } : null,
    processedRoundIds: [...state.processedRoundIds],
  };
  const result = (reason: DecisionReason, evidenceRoundIds: string[] = []): DifficultyDecision => ({
    state: next, reason, evidenceRoundIds, fromRadius: state.radius, toRadius: next.radius,
    action: next.radius < state.radius ? 'increase_challenge' : next.radius > state.radius ? 'decrease_challenge' : 'hold',
  });
  if (round.mode !== state.mode) return result('wrong_mode');
  if (state.processedRoundIds.includes(round.roundId)) return result('duplicate_round');
  if (!round.roundId?.trim() || !Number.isSafeInteger(round.shots) || !Number.isSafeInteger(round.hits) ||
      round.hits < 0 || round.shots < round.hits || !supportedRadius(round.radius) ||
      !Number.isFinite(round.startedAtMs) || !Number.isFinite(round.endedAtMs) || round.endedAtMs <= round.startedAtMs) {
    next.previous = null;
    return result('invalid_evidence');
  }
  // Ignore late/replayed observations without disrupting newer evidence.
  if (state.lastProcessedEndMs !== null && round.startedAtMs < state.lastProcessedEndMs) return result('out_of_order');
  next.processedRoundIds.push(round.roundId);
  next.lastProcessedEndMs = round.endedAtMs;
  const holdAndReset = (reason: DecisionReason) => {
    next.previous = null;
    return result(reason, [round.roundId]);
  };
  if (round.completion !== 'completed' || (round.mode === 'thirty_shot' && round.hits !== 30)) return holdAndReset('not_completed');
  if (round.quality !== 'verified') return holdAndReset('unverified_quality');
  if (round.contextKey !== state.contextKey) return holdAndReset('context_mismatch');
  if (round.radius !== state.radius) return holdAndReset('radius_mismatch');
  if (round.shots < ROUND_POLICY.minimumShots) return holdAndReset('insufficient_shots');

  const previous = next.previous;
  next.previous = { ...round };
  if (!previous) return result('need_second_round', [round.roundId]);
  const evidence = [previous.roundId, round.roundId];
  const high = (r: RoundEvidence) => r.hits * 100 > ROUND_POLICY.upperAccuracyPercent * r.shots;
  const low = (r: RoundEvidence) => r.hits * 100 < ROUND_POLICY.lowerAccuracyPercent * r.shots;
  if (high(previous) && high(round)) {
    if (state.radius === ROUND_POLICY.minRadius) return result('minimum_radius', evidence);
    next.radius -= ROUND_POLICY.radiusStep;
    next.previous = null;
    return result('two_high_accuracy_rounds', evidence);
  }
  if (low(previous) && low(round)) {
    if (state.radius === ROUND_POLICY.maxRadius) return result('maximum_radius', evidence);
    next.radius += ROUND_POLICY.radiusStep;
    next.previous = null;
    return result('two_low_accuracy_rounds', evidence);
  }
  return result('accuracy_band_or_mixed', evidence);
}
