import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TrajectorySampler } from '../systems/TrajectorySampler.ts';
import { TelemetryCollector } from '../../telemetry/TelemetryCollector.ts';

describe('TrajectorySampler Shot Boundary and Invariant Validation', () => {
  let collector: TelemetryCollector;
  let sampler: TrajectorySampler;

  beforeEach(() => {
    collector = new TelemetryCollector('test_player_sampler');
    sampler = new TrajectorySampler(collector);
  });

  it('1. should capture pending movement and current aim position at shot boundary using shot timestamp', () => {
    const roundId = 'round_boundary_01';
    const tStart = '2026-10-22T10:00:00.000Z';
    const tShot = '2026-10-22T10:00:00.010Z';

    sampler.start(roundId, tStart);

    // Mouse movement accumulated before any periodic sample
    sampler.accumulateMovement(15, -8);
    assert.deepEqual(sampler.getAccumulatedMovement(), { x: 15, y: -8 });

    // Shot fired at 10ms with aim coordinates (450, 320)
    const segment = sampler.handleShotBoundary('shot_001', 'target_abc', 450, 320, tShot);

    assert.ok(segment);
    assert.equal(segment.shot_id, 'shot_001');
    assert.equal(segment.target_id, 'target_abc');
    assert.equal(segment.start_time, tStart);
    assert.equal(segment.end_time, tShot);
    assert.equal(segment.duration, 10);

    // Boundary sample must contain the accumulated movement and exact shot aim coordinates
    assert.equal(segment.samples.length, 1);
    assert.equal(segment.samples[0].timestamp, tShot);
    assert.equal(segment.samples[0].x, 450);
    assert.equal(segment.samples[0].y, 320);
    assert.equal(segment.samples[0].movement_x, 15);
    assert.equal(segment.samples[0].movement_y, -8);

    // Accumulated movement must be reset immediately
    assert.deepEqual(sampler.getAccumulatedMovement(), { x: 0, y: 0 });
    assert.equal(sampler.getPendingSamples().length, 0);
  });

  it('2. should ensure movement before a shot belongs to that shot\'s segment exactly once and never leaks into the next segment', () => {
    const roundId = 'round_no_leak_02';
    const tStart = '2026-10-22T10:00:00.000Z';
    const tShot1 = '2026-10-22T10:00:00.020Z';
    const tShot2 = '2026-10-22T10:00:00.040Z';

    sampler.start(roundId, tStart);

    // Movement for Shot 1
    sampler.accumulateMovement(25, 10);
    const segment1 = sampler.handleShotBoundary('shot_001', 'target_001', 400, 300, tShot1);
    assert.ok(segment1);

    // Movement for Shot 2
    sampler.accumulateMovement(7, -3);
    const segment2 = sampler.handleShotBoundary('shot_002', null, 407, 297, tShot2);
    assert.ok(segment2);

    // Verify Shot 1 segment
    assert.equal(segment1.samples.length, 1);
    assert.equal(segment1.samples[0].movement_x, 25);
    assert.equal(segment1.samples[0].movement_y, 10);

    // Verify Shot 2 segment - must NOT contain any movement from Shot 1
    assert.equal(segment2.samples.length, 1);
    assert.equal(segment2.samples[0].movement_x, 7);
    assert.equal(segment2.samples[0].movement_y, -3);

    // Total displacement in Segment 2 must be strictly 7, -3
    assert.equal(segment2.samples[0].x, 407);
    assert.equal(segment2.samples[0].y, 297);
  });

  it('3. should handle shots occurring between 16ms periodic sampling ticks without losing movement', () => {
    const roundId = 'round_between_ticks_03';
    const t0 = '2026-10-22T10:00:00.000Z';
    const tTick1 = '2026-10-22T10:00:00.016Z';
    const tShot1 = '2026-10-22T10:00:00.025Z'; // Shot fired 9ms after Tick 1, before Tick 2 (which would be at 32ms)

    sampler.start(roundId, t0);

    // Movement before Tick 1
    sampler.accumulateMovement(12, 6);
    sampler.capturePeriodicSnapshot(412, 306, tTick1);

    // Movement between Tick 1 and Shot 1
    sampler.accumulateMovement(8, 4);

    // Shot fired between ticks
    const segment1 = sampler.handleShotBoundary('shot_001', 'target_001', 420, 310, tShot1);

    assert.ok(segment1);
    assert.equal(segment1.samples.length, 2);

    // Sample 1: Periodic tick at 16ms
    assert.equal(segment1.samples[0].timestamp, tTick1);
    assert.equal(segment1.samples[0].x, 412);
    assert.equal(segment1.samples[0].y, 306);
    assert.equal(segment1.samples[0].movement_x, 12);
    assert.equal(segment1.samples[0].movement_y, 6);

    // Sample 2: Shot boundary at 25ms
    assert.equal(segment1.samples[1].timestamp, tShot1);
    assert.equal(segment1.samples[1].x, 420);
    assert.equal(segment1.samples[1].y, 310);
    assert.equal(segment1.samples[1].movement_x, 8);
    assert.equal(segment1.samples[1].movement_y, 4);

    // Verify derived metrics calculated
    assert.ok(segment1.derived_metrics);
    // Path distance = dist(412,306 to 420,310) = sqrt(8^2 + 4^2) = sqrt(80) ≈ 8.94
    assert.ok(segment1.derived_metrics.path_distance > 8.9 && segment1.derived_metrics.path_distance < 9.0);
  });

  it('4. should preserve final movement at round end as an unassigned trailing segment', () => {
    const roundId = 'round_trailing_04';
    const t0 = '2026-10-22T10:00:00.000Z';
    const tShot1 = '2026-10-22T10:00:00.500Z';
    const tTick = '2026-10-22T10:00:00.800Z';
    const tEnd = '2026-10-22T10:00:01.000Z';

    sampler.start(roundId, t0);

    // Shot 1
    sampler.accumulateMovement(20, 0);
    sampler.handleShotBoundary('shot_001', 'target_001', 420, 300, tShot1);

    // Post-shot movement before periodic tick
    sampler.accumulateMovement(10, 5);
    sampler.capturePeriodicSnapshot(430, 305, tTick);

    // Final movement accumulated between last tick and round end
    sampler.accumulateMovement(6, 2);

    // Round ends
    const trailingSegment = sampler.stop(436, 307, tEnd);

    assert.ok(trailingSegment);
    assert.equal(trailingSegment.shot_id, null);
    assert.equal(trailingSegment.target_id, null);
    assert.equal(trailingSegment.start_time, tShot1);
    assert.equal(trailingSegment.end_time, tEnd);

    // Must have 2 samples: the tick sample and the final stop boundary sample
    assert.equal(trailingSegment.samples.length, 2);
    assert.equal(trailingSegment.samples[0].movement_x, 10);
    assert.equal(trailingSegment.samples[0].movement_y, 5);
    assert.equal(trailingSegment.samples[1].movement_x, 6);
    assert.equal(trailingSegment.samples[1].movement_y, 2);
    assert.equal(trailingSegment.samples[1].x, 436);
    assert.equal(trailingSegment.samples[1].y, 307);

    // Verify collector has both segments recorded
    const recorded = collector.getRecordedTrajectorySegments();
    assert.equal(recorded.length, 2);
    assert.equal(recorded[0].shot_id, 'shot_001');
    assert.equal(recorded[1].shot_id, null);
  });

  it('5. should preserve final movement at round end even if no periodic ticks occurred after last shot', () => {
    const roundId = 'round_trailing_no_tick_05';
    const t0 = '2026-10-22T10:00:00.000Z';
    const tShot1 = '2026-10-22T10:00:00.990Z';
    const tEnd = '2026-10-22T10:00:01.000Z'; // Round ends 10ms after shot

    sampler.start(roundId, t0);
    sampler.handleShotBoundary('shot_001', 'target_001', 400, 300, tShot1);

    // Movement after shot, but round ends before 16ms periodic tick
    sampler.accumulateMovement(9, 3);
    const trailing = sampler.stop(409, 303, tEnd);

    assert.ok(trailing);
    assert.equal(trailing.shot_id, null);
    assert.equal(trailing.samples.length, 1);
    assert.equal(trailing.samples[0].movement_x, 9);
    assert.equal(trailing.samples[0].movement_y, 3);
    assert.equal(trailing.samples[0].x, 409);
    assert.equal(trailing.samples[0].y, 303);
  });

  it('6. should not create a spurious trailing segment when no movement occurred after the last shot', () => {
    const roundId = 'round_no_trailing_06';
    const t0 = '2026-10-22T10:00:00.000Z';
    const tShot1 = '2026-10-22T10:00:01.000Z';

    sampler.start(roundId, t0);
    sampler.accumulateMovement(5, 5);
    sampler.handleShotBoundary('shot_001', 'target_001', 405, 305, tShot1);

    // Round ends immediately with zero movement
    const trailing = sampler.stop(405, 305, tShot1);

    assert.equal(trailing, null);
    assert.equal(collector.getRecordedTrajectorySegments().length, 1);
    assert.equal(collector.getRecordedTrajectorySegments()[0].shot_id, 'shot_001');
  });

  it('7. should safely handle empty segment finalization without crashing derived metrics calculation', () => {
    const roundId = 'round_empty_07';
    const t0 = '2026-10-22T10:00:00.000Z';
    const tEnd = '2026-10-22T10:00:00.100Z';

    sampler.start(roundId, t0);

    // Explicitly finalize an empty segment
    const emptySegment = sampler.finalizeSegment('shot_empty', null, tEnd);

    assert.ok(emptySegment);
    assert.equal(emptySegment.samples.length, 0);
    assert.ok(emptySegment.derived_metrics);
    assert.equal(emptySegment.derived_metrics.path_distance, 0);
    assert.equal(emptySegment.derived_metrics.direct_distance, 0);
    assert.equal(emptySegment.derived_metrics.path_efficiency, null);
    assert.equal(emptySegment.derived_metrics.average_velocity, null);
  });

  it('8. should clear accumulated movement when pointer lock is lost', () => {
    sampler.start('round_lock_08');
    sampler.accumulateMovement(50, -30);
    assert.deepEqual(sampler.getAccumulatedMovement(), { x: 50, y: -30 });

    sampler.clearAccumulatedMovement();
    assert.deepEqual(sampler.getAccumulatedMovement(), { x: 0, y: 0 });
  });

  it('9. should cleanly reset all state on new round start without leaking previous round data', () => {
    // Round 1
    sampler.start('round_prev_09', '2026-10-22T10:00:00.000Z');
    sampler.accumulateMovement(30, 20);
    sampler.capturePeriodicSnapshot(100, 100);
    sampler.accumulateMovement(10, 5);
    sampler.stop(110, 105);

    // Start Round 2
    const t2 = '2026-10-22T10:05:00.000Z';
    sampler.start('round_fresh_09', t2);

    assert.equal(sampler.isActive(), true);
    assert.deepEqual(sampler.getAccumulatedMovement(), { x: 0, y: 0 });
    assert.equal(sampler.getPendingSamples().length, 0);
    assert.equal(sampler.getSegmentStartTime(), t2);
  });
});
