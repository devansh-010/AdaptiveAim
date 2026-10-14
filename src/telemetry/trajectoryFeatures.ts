import type { TrajectorySegment, TrajectorySample, TrajectoryDerivedMetrics } from './types';

/**
 * Configuration options for trajectory derived feature extraction.
 */
export interface TrajectoryFeatureOptions {
  /**
   * Minimum Euclidean displacement (in logical pixels) required to recognize a movement
   * vector when evaluating direction changes. Samples with displacement below this threshold
   * are treated as stationary noise.
   *
   * Default: 1.0 px.
   */
  minDisplacementThreshold?: number;

  /**
   * Minimum angular difference (in radians) between consecutive movement vectors to count
   * as a meaningful direction change (e.g. turn or course correction).
   *
   * Default: Math.PI / 4 (45 degrees).
   */
  directionChangeAngleThreshold?: number;
}

/**
 * Default configuration values for trajectory feature calculation.
 */
export const DEFAULT_FEATURE_OPTIONS: Required<TrajectoryFeatureOptions> = {
  minDisplacementThreshold: 1.0,
  directionChangeAngleThreshold: Math.PI / 4, // 45 degrees
};

/**
 * Type guard validating that a sample has valid finite coordinates and a parseable ISO timestamp.
 */
export function isValidSample(sample: unknown): sample is TrajectorySample {
  if (!sample || typeof sample !== 'object') {
    return false;
  }
  const s = sample as TrajectorySample;
  return (
    typeof s.x === 'number' &&
    Number.isFinite(s.x) &&
    typeof s.y === 'number' &&
    Number.isFinite(s.y) &&
    typeof s.timestamp === 'string' &&
    !Number.isNaN(Date.parse(s.timestamp))
  );
}

/**
 * Pure calculation function extracting derived kinematic and geometric metrics from a
 * raw TrajectorySegment without mutating input data.
 *
 * Metrics calculated:
 * 1. Path Distance (px): Sum of Euclidean distances between consecutive valid aim positions.
 * 2. Direct Distance (px): Euclidean distance between first and last valid aim positions.
 * 3. Path Efficiency [0, 1]: direct_distance / path_distance (null if path_distance is 0).
 * 4. Average Velocity (px/s): Total path distance across eligible intervals / eligible elapsed seconds (null if elapsed time is 0).
 * 5. Max Velocity (px/s): Maximum instantaneous velocity observed in any eligible positive interval (null if no eligible intervals).
 * 6. Direction Changes: Count of meaningful turns exceeding the configured angular threshold after noise filtering.
 *
 * @param segment - The TrajectorySegment containing raw samples.
 * @param options - Optional thresholds for noise filtering and turn detection.
 * @returns Immutable TrajectoryDerivedMetrics object.
 */
export function calculateTrajectoryFeatures(
  segment: TrajectorySegment,
  options?: TrajectoryFeatureOptions
): TrajectoryDerivedMetrics {
  const rawDisplacement = options?.minDisplacementThreshold ?? DEFAULT_FEATURE_OPTIONS.minDisplacementThreshold;
  const minDisplacement = Number.isFinite(rawDisplacement) && rawDisplacement > 0
    ? rawDisplacement
    : DEFAULT_FEATURE_OPTIONS.minDisplacementThreshold;

  const rawAngle = options?.directionChangeAngleThreshold ?? DEFAULT_FEATURE_OPTIONS.directionChangeAngleThreshold;
  const minAngle = Number.isFinite(rawAngle) && rawAngle > 0
    ? rawAngle
    : DEFAULT_FEATURE_OPTIONS.directionChangeAngleThreshold;

  // Extract valid samples without mutating original array
  const rawSamples = segment?.samples ?? [];
  const validSamples = rawSamples.filter(isValidSample);
  const sampleCount = validSamples.length;

  if (sampleCount < 2) {
    return {
      path_distance: 0,
      direct_distance: 0,
      path_efficiency: null,
      average_velocity: null,
      max_velocity: null,
      direction_changes: 0,
      valid_sample_count: sampleCount,
      eligible_duration_seconds: 0,
    };
  }

  // 1. Total Path Distance & Velocity Intervals
  let totalPathDistance = 0;
  let eligiblePathDistance = 0;
  let totalEligibleSeconds = 0;
  let maxVelocity: number | null = null;
  let eligibleIntervalCount = 0;

  for (let i = 0; i < sampleCount - 1; i++) {
    const sCurrent = validSamples[i];
    const sNext = validSamples[i + 1];

    const dx = sNext.x - sCurrent.x;
    const dy = sNext.y - sCurrent.y;
    const stepDistance = Math.sqrt(dx * dx + dy * dy);
    totalPathDistance += stepDistance;

    const tCurrentMs = Date.parse(sCurrent.timestamp);
    const tNextMs = Date.parse(sNext.timestamp);
    const elapsedSeconds = (tNextMs - tCurrentMs) / 1000;

    // Only compute velocity for intervals with positive elapsed time (ignores duplicate/reversing timestamps)
    if (elapsedSeconds > 0) {
      const intervalVelocity = stepDistance / elapsedSeconds;
      eligiblePathDistance += stepDistance;
      totalEligibleSeconds += elapsedSeconds;
      eligibleIntervalCount++;

      if (maxVelocity === null || intervalVelocity > maxVelocity) {
        maxVelocity = intervalVelocity;
      }
    }
  }

  // 2. Direct Distance between segment endpoints
  const firstSample = validSamples[0];
  const lastSample = validSamples[sampleCount - 1];
  const directDx = lastSample.x - firstSample.x;
  const directDy = lastSample.y - firstSample.y;
  const directDistance = Math.sqrt(directDx * directDx + directDy * directDy);

  // 3. Path Efficiency (directDistance / totalPathDistance)
  let pathEfficiency: number | null = null;
  if (totalPathDistance > 0) {
    let rawEfficiency = directDistance / totalPathDistance;
    // Account for minor floating-point inaccuracies where directDistance slightly exceeds totalPathDistance
    if (rawEfficiency > 1.0 && rawEfficiency <= 1.0 + 1e-9) {
      rawEfficiency = 1.0;
    }
    pathEfficiency = rawEfficiency;
  }

  // 4. Average Velocity
  const averageVelocity = eligibleIntervalCount > 0 && totalEligibleSeconds > 0
    ? eligiblePathDistance / totalEligibleSeconds
    : null;

  // 5. Direction Changes (with noise filtering)
  let directionChanges = 0;
  let prevVector: { x: number; y: number; len: number } | null = null;
  let anchor = { x: firstSample.x, y: firstSample.y };

  for (let i = 1; i < sampleCount; i++) {
    const s = validSamples[i];
    const vx = s.x - anchor.x;
    const vy = s.y - anchor.y;
    const len = Math.sqrt(vx * vx + vy * vy);

    if (len >= minDisplacement) {
      const currentVector = { x: vx, y: vy, len };

      if (prevVector !== null) {
        // Calculate angle between consecutive movement vectors using dot product: u . v = |u||v| cos(theta)
        const dot = prevVector.x * currentVector.x + prevVector.y * currentVector.y;
        const cosTheta = Math.max(-1, Math.min(1, dot / (prevVector.len * currentVector.len)));
        const theta = Math.acos(cosTheta);

        if (theta >= minAngle) {
          directionChanges++;
        }
      }

      prevVector = currentVector;
      anchor = { x: s.x, y: s.y };
    }
  }

  return {
    path_distance: totalPathDistance,
    direct_distance: directDistance,
    path_efficiency: pathEfficiency,
    average_velocity: averageVelocity,
    max_velocity: maxVelocity,
    direction_changes: directionChanges,
    valid_sample_count: sampleCount,
    eligible_duration_seconds: totalEligibleSeconds,
  };
}
