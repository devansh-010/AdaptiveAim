import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrajectoryFeatures } from '../trajectoryFeatures.ts';
import type { TrajectorySegment, TrajectorySample } from '../types';

function createSegment(
  samples: Partial<TrajectorySample>[],
  overrides?: Partial<TrajectorySegment>
): TrajectorySegment {
  return {
    trajectory_id: 'traj_test_123',
    round_id: 'round_test_456',
    shot_id: 'shot_test_789',
    target_id: 'target_test_001',
    start_time: '2026-10-14T10:00:00.000Z',
    end_time: '2026-10-14T10:00:01.000Z',
    duration: 1000,
    samples: samples.map((s, idx) => {
      if (!s) return s as unknown as TrajectorySample;
      return {
        timestamp: s.timestamp ?? `2026-10-14T10:00:00.${String(idx * 50).padStart(3, '0')}Z`,
        x: s.x ?? 0,
        y: s.y ?? 0,
        movement_x: s.movement_x ?? 0,
        movement_y: s.movement_y ?? 0,
      };
    }),
    ...overrides,
  };
}

describe('Derived Trajectory Features Calculator', () => {
  // Case 1: Empty trajectory
  it('1. should handle an empty trajectory correctly', () => {
    const segment = createSegment([]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.valid_sample_count, 0);
    assert.equal(metrics.path_distance, 0);
    assert.equal(metrics.direct_distance, 0);
    assert.equal(metrics.path_efficiency, null);
    assert.equal(metrics.average_velocity, null);
    assert.equal(metrics.max_velocity, null);
    assert.equal(metrics.direction_changes, 0);
    assert.equal(metrics.eligible_duration_seconds, 0);
  });

  // Case 2: One valid sample
  it('2. should handle a single valid sample correctly', () => {
    const segment = createSegment([{ x: 100, y: 150 }]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.valid_sample_count, 1);
    assert.equal(metrics.path_distance, 0);
    assert.equal(metrics.direct_distance, 0);
    assert.equal(metrics.path_efficiency, null);
    assert.equal(metrics.average_velocity, null);
    assert.equal(metrics.max_velocity, null);
    assert.equal(metrics.direction_changes, 0);
    assert.equal(metrics.eligible_duration_seconds, 0);
  });

  // Case 3: Two samples moving in a straight line
  it('3. should calculate exact distances and efficiency for two samples moving in a straight line', () => {
    const segment = createSegment([
      { x: 0, y: 0, timestamp: '2026-10-14T10:00:00.000Z' },
      { x: 30, y: 40, timestamp: '2026-10-14T10:00:00.500Z' }, // 3-4-5 triangle -> distance = 50, elapsed = 0.5s
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.valid_sample_count, 2);
    assert.equal(metrics.path_distance, 50);
    assert.equal(metrics.direct_distance, 50);
    assert.equal(metrics.path_efficiency, 1.0);
    assert.equal(metrics.eligible_duration_seconds, 0.5);
    assert.equal(metrics.average_velocity, 100); // 50 / 0.5 = 100 px/s
    assert.equal(metrics.max_velocity, 100);
    assert.equal(metrics.direction_changes, 0);
  });

  // Case 4: A multi-segment path with a known total distance
  it('4. should calculate multi-segment path with known Euclidean total distance', () => {
    // (0,0) -> (3,4) [d=5] -> (9,4) [d=6] -> (9,12) [d=8]
    // Total path distance = 5 + 6 + 8 = 19
    // Direct distance: (0,0) to (9,12) -> sqrt(9^2 + 12^2) = 15
    const segment = createSegment([
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 9, y: 4 },
      { x: 9, y: 12 },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.valid_sample_count, 4);
    assert.equal(metrics.path_distance, 19);
    assert.equal(metrics.direct_distance, 15);
    assert.equal(metrics.path_efficiency, 15 / 19);
  });

  // Case 5: A path that doubles back on itself
  it('5. should calculate a path that doubles back on itself correctly', () => {
    // (0,0) -> (100,0) -> (0,0)
    // Path distance = 100 + 100 = 200
    // Direct distance = 0
    // Efficiency = 0 / 200 = 0
    const segment = createSegment([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.path_distance, 200);
    assert.equal(metrics.direct_distance, 0);
    assert.equal(metrics.path_efficiency, 0);
    assert.equal(metrics.direction_changes, 1); // 180-degree reversal
  });

  // Case 6: A stationary trajectory
  it('6. should handle stationary trajectory (multiple samples with identical coordinates)', () => {
    const segment = createSegment([
      { x: 50, y: 50, timestamp: '2026-10-14T10:00:00.000Z' },
      { x: 50, y: 50, timestamp: '2026-10-14T10:00:00.100Z' },
      { x: 50, y: 50, timestamp: '2026-10-14T10:00:00.200Z' },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.valid_sample_count, 3);
    assert.equal(metrics.path_distance, 0);
    assert.equal(metrics.direct_distance, 0);
    assert.equal(metrics.path_efficiency, null); // Documented null for 0 distance
    assert.equal(metrics.average_velocity, 0);
    assert.equal(metrics.max_velocity, 0);
    assert.equal(metrics.direction_changes, 0);
  });

  // Case 7: Zero-length path efficiency handling
  it('7. should return null (not NaN or Infinity) for zero-length path efficiency', () => {
    const segment = createSegment([
      { x: 10, y: 20 },
      { x: 10, y: 20 },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.path_distance, 0);
    assert.strictEqual(metrics.path_efficiency, null);
    assert.ok(!Number.isNaN(metrics.path_efficiency));
  });

  // Case 8: Known timestamps and velocity values
  it('8. should calculate exact velocity values with known timestamps', () => {
    // 0.1s interval with 10px -> 100 px/s
    // 0.2s interval with 40px -> 200 px/s
    // Total eligible distance = 50px, total time = 0.3s -> avg = 50 / 0.3 = 166.666... px/s
    const segment = createSegment([
      { x: 0, y: 0, timestamp: '2026-10-14T10:00:00.000Z' },
      { x: 10, y: 0, timestamp: '2026-10-14T10:00:00.100Z' },
      { x: 50, y: 0, timestamp: '2026-10-14T10:00:00.300Z' },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.path_distance, 50);
    assert.ok(Math.abs(metrics.eligible_duration_seconds - 0.3) < 1e-9);
    assert.ok(Math.abs((metrics.average_velocity ?? 0) - 50 / 0.3) < 1e-9);
    assert.equal(metrics.max_velocity, 200);
  });

  // Case 9: Duplicate timestamps
  it('9. should safely ignore intervals with duplicate timestamps (dt = 0)', () => {
    const segment = createSegment([
      { x: 0, y: 0, timestamp: '2026-10-14T10:00:00.000Z' },
      { x: 10, y: 0, timestamp: '2026-10-14T10:00:00.000Z' }, // dt = 0, distance = 10
      { x: 30, y: 0, timestamp: '2026-10-14T10:00:00.200Z' }, // dt = 0.2, distance = 20
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    // Total distance includes all valid samples = 10 + 20 = 30
    assert.equal(metrics.path_distance, 30);
    // Velocity calculation skips the duplicate timestamp interval
    assert.equal(metrics.eligible_duration_seconds, 0.2);
    assert.equal(metrics.average_velocity, 20 / 0.2); // 100 px/s
    assert.equal(metrics.max_velocity, 100);
  });

  // Case 10: Decreasing or invalid timestamps
  it('10. should ignore intervals with decreasing (backwards) timestamps', () => {
    const segment = createSegment([
      { x: 0, y: 0, timestamp: '2026-10-14T10:00:00.500Z' },
      { x: 20, y: 0, timestamp: '2026-10-14T10:00:00.100Z' }, // backwards dt = -0.4s
      { x: 60, y: 0, timestamp: '2026-10-14T10:00:00.300Z' }, // forward dt = 0.2s, dist = 40
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.path_distance, 60);
    assert.equal(metrics.eligible_duration_seconds, 0.2);
    assert.equal(metrics.average_velocity, 40 / 0.2); // 200 px/s
    assert.equal(metrics.max_velocity, 200);
  });

  // Case 11: Maximum velocity selection
  it('11. should correctly identify the peak instantaneous interval velocity', () => {
    const segment = createSegment([
      { x: 0, y: 0, timestamp: '2026-10-14T10:00:00.000Z' },
      { x: 10, y: 0, timestamp: '2026-10-14T10:00:00.100Z' }, // 100 px/s
      { x: 60, y: 0, timestamp: '2026-10-14T10:00:00.200Z' }, // 500 px/s (peak)
      { x: 70, y: 0, timestamp: '2026-10-14T10:00:00.300Z' }, // 100 px/s
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.max_velocity, 500);
  });

  // Case 12: Straight movement with no direction changes
  it('12. should count 0 direction changes for continuous straight movement', () => {
    const segment = createSegment([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
      { x: 40, y: 40 },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.direction_changes, 0);
    assert.equal(metrics.path_efficiency, 1.0);
  });

  // Case 13: A meaningful turn
  it('13. should detect a meaningful turn (90-degree angle change)', () => {
    // (0,0) -> (50,0) (moving East) -> (50,50) (moving South)
    // Turn is 90 degrees = pi/2 rad >= default threshold pi/4 rad
    const segment = createSegment([
      { x: 0, y: 0 },
      { x: 25, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 25 },
      { x: 50, y: 50 },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.direction_changes, 1);
  });

  // Case 14: A reversal of direction
  it('14. should detect a 180-degree reversal as a direction change', () => {
    // (0,0) -> (50,0) -> (10,0)
    const segment = createSegment([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 10, y: 0 },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.direction_changes, 1);
  });

  // Case 15: Stationary samples interspersed with movement
  it('15. should properly chain displacement vectors when stationary samples are interspersed', () => {
    // (0,0) -> (0,0) -> (30,0) -> (30,0) -> (30,40)
    // First vector: East (30px)
    // Second vector: South (40px)
    // Turn = 90 degrees -> 1 direction change
    const segment = createSegment([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 40 },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.path_distance, 70);
    assert.equal(metrics.direct_distance, 50);
    assert.equal(metrics.direction_changes, 1);
  });

  // Case 16: Small movements below the noise threshold
  it('16. should ignore sub-threshold noise jitter when detecting direction changes', () => {
    // (0,0) -> (0.2, 0.3) -> (0.4, 0.1) -> (50, 0)
    // Minor jitter under 1.0px should be ignored, moving East to 50
    const segment = createSegment([
      { x: 0, y: 0 },
      { x: 0.2, y: 0.3 },
      { x: 0.4, y: 0.1 },
      { x: 50, y: 0 },
    ]);
    const metrics = calculateTrajectoryFeatures(segment, { minDisplacementThreshold: 1.0 });

    assert.equal(metrics.direction_changes, 0);
  });

  // Case 17: Missing or invalid positions according to validation policy
  it('17. should filter out invalid samples (NaN coordinates, null, malformed timestamps) safely', () => {
    const rawSamples = [
      { x: 0, y: 0, timestamp: '2026-10-14T10:00:00.000Z' },
      { x: NaN, y: 10, timestamp: '2026-10-14T10:00:00.050Z' }, // Invalid x
      { x: 10, y: Infinity, timestamp: '2026-10-14T10:00:00.060Z' }, // Invalid y
      { x: 20, y: 0, timestamp: 'not-a-date' }, // Invalid timestamp
      null as unknown as TrajectorySample, // Null sample
      { x: 30, y: 40, timestamp: '2026-10-14T10:00:00.500Z' }, // Valid sample
    ];
    const segment = createSegment(rawSamples);
    const metrics = calculateTrajectoryFeatures(segment);

    // Only samples (0,0) and (30,40) are valid
    assert.equal(metrics.valid_sample_count, 2);
    assert.equal(metrics.path_distance, 50);
    assert.equal(metrics.direct_distance, 50);
    assert.equal(metrics.path_efficiency, 1.0);
    assert.equal(metrics.eligible_duration_seconds, 0.5);
    assert.equal(metrics.average_velocity, 100);
  });

  // Case 18: Hit, miss and unassigned segments preserving their associations
  it('18. should calculate metrics identically for hit, miss, and unassigned trailing segments', () => {
    const samples = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];

    const hitSegment = createSegment(samples, { shot_id: 'shot_1', target_id: 'target_1' });
    const missSegment = createSegment(samples, { shot_id: 'shot_2', target_id: null });
    const trailingSegment = createSegment(samples, { shot_id: null, target_id: null });

    const hitMetrics = calculateTrajectoryFeatures(hitSegment);
    const missMetrics = calculateTrajectoryFeatures(missSegment);
    const trailingMetrics = calculateTrajectoryFeatures(trailingSegment);

    assert.equal(hitMetrics.path_distance, 100);
    assert.equal(missMetrics.path_distance, 100);
    assert.equal(trailingMetrics.path_distance, 100);

    // Assert that the original segment associations remain unchanged
    assert.equal(hitSegment.shot_id, 'shot_1');
    assert.equal(hitSegment.target_id, 'target_1');
    assert.equal(missSegment.shot_id, 'shot_2');
    assert.equal(missSegment.target_id, null);
    assert.equal(trailingSegment.shot_id, null);
    assert.equal(trailingSegment.target_id, null);
  });

  // Case 19: Confirmation that calculation does not mutate raw input samples
  it('19. should not mutate the input segment or its raw samples array', () => {
    const originalSamples: TrajectorySample[] = [
      { x: 0, y: 0, movement_x: 2, movement_y: 3, timestamp: '2026-10-14T10:00:00.000Z' },
      { x: 30, y: 40, movement_x: 10, movement_y: 15, timestamp: '2026-10-14T10:00:00.100Z' },
    ];
    const segment: TrajectorySegment = {
      trajectory_id: 'traj_immutable',
      round_id: 'round_immutable',
      shot_id: 'shot_immutable',
      target_id: 'target_immutable',
      start_time: '2026-10-14T10:00:00.000Z',
      end_time: '2026-10-14T10:00:00.100Z',
      duration: 100,
      samples: originalSamples,
    };

    const serializedBefore = JSON.stringify(segment);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.path_distance, 50);
    assert.equal(JSON.stringify(segment), serializedBefore);
    assert.equal(segment.samples.length, 2);
    assert.equal(segment.samples[0].movement_x, 2);
  });

  // Case 20: Reproduction test for peak velocity interval (7,443.8 px/s)
  it('20. should accurately compute peak velocity for real ballistic flick interval (7,443.8 px/s)', () => {
    // 16ms interval with dx=109, dy=48 -> dist = sqrt(109^2 + 48^2) = sqrt(14185) = 119.1008px
    // 119.1008px / 0.016s = 7443.7999 px/s -> 7443.8 px/s
    const segment = createSegment([
      { x: 300, y: 250, timestamp: '2026-10-14T10:00:01.000Z' },
      { x: 409, y: 298, timestamp: '2026-10-14T10:00:01.016Z' },
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    assert.equal(metrics.valid_sample_count, 2);
    assert.ok(Math.abs(metrics.path_distance - 119.1008) < 0.001);
    assert.equal(metrics.eligible_duration_seconds, 0.016);
    assert.equal(metrics.max_velocity !== null ? Number(metrics.max_velocity.toFixed(1)) : null, 7443.8);
    assert.equal(metrics.average_velocity !== null ? Number(metrics.average_velocity.toFixed(1)) : null, 7443.8);
  });

  // Case 21: Non-finite safety under extreme inputs and corrupted options
  it('21. should never emit NaN or Infinity under extreme coordinates or invalid options', () => {
    const segment = createSegment([
      { x: -1e6, y: -1e6, timestamp: '2026-10-14T10:00:00.000Z' },
      { x: 1e6, y: 1e6, timestamp: '2026-10-14T10:00:00.016Z' },
    ]);
    const metrics = calculateTrajectoryFeatures(segment, {
      minDisplacementThreshold: NaN,
      directionChangeAngleThreshold: -5,
    });

    assert.ok(Number.isFinite(metrics.path_distance));
    assert.ok(Number.isFinite(metrics.direct_distance));
    assert.ok(metrics.path_efficiency !== null && Number.isFinite(metrics.path_efficiency));
    assert.ok(metrics.average_velocity !== null && Number.isFinite(metrics.average_velocity));
    assert.ok(metrics.max_velocity !== null && Number.isFinite(metrics.max_velocity));
    assert.ok(Number.isFinite(metrics.direction_changes));
  });

  // Case 22: Velocity consistency across mixed intervals
  it('22. should maintain strict distance-time consistency when mixed with duplicate and invalid timestamps', () => {
    const segment = createSegment([
      { x: 0, y: 0, timestamp: '2026-10-14T10:00:00.000Z' },
      { x: 10, y: 0, timestamp: '2026-10-14T10:00:00.020Z' }, // valid: 10px in 0.02s = 500 px/s
      { x: 20, y: 0, timestamp: '2026-10-14T10:00:00.020Z' }, // duplicate timestamp (dt=0): ignored for velocity
      { x: 30, y: 0, timestamp: '2026-10-14T10:00:00.010Z' }, // backwards timestamp (dt=-0.01s): ignored for velocity
      { x: 50, y: 0, timestamp: '2026-10-14T10:00:00.030Z' }, // valid: 20px in 0.02s = 1000 px/s
    ]);
    const metrics = calculateTrajectoryFeatures(segment);

    // Total path distance includes all movements: 10 + 10 + 10 + 20 = 50px
    assert.equal(metrics.path_distance, 50);
    // Eligible intervals: (1) 10px in 0.02s, (2) 20px in 0.02s -> total 30px in 0.04s
    assert.ok(Math.abs(metrics.eligible_duration_seconds - 0.04) < 1e-9);
    assert.equal(metrics.average_velocity, 30 / 0.04); // 750 px/s
    assert.equal(metrics.max_velocity, 1000); // 20px / 0.02s = 1000 px/s
  });
});
