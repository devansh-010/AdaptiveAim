import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryCollector } from '../TelemetryCollector.ts';
import type { ShotTelemetry, TrajectorySegment, TargetTelemetry } from '../types';

describe('TelemetryCollector Invariant Validation', () => {
  let collector: TelemetryCollector;

  beforeEach(() => {
    collector = new TelemetryCollector('test_player_001');
  });

  // Invariant 1: Every recorded shot has the correct shot ID and expected hit/miss classification
  it('1. should record shots with correct shot ID and accurate hit/miss classification', () => {
    collector.startRound('round_inv_1', 'six_shot', 'fixed');

    const hitShot: ShotTelemetry = {
      shot_id: 'shot_hit_001',
      round_id: 'round_inv_1',
      target_id: 'target_001',
      timestamp: '2026-10-15T10:00:01.000Z',
      hit: true,
      player_x: 450,
      player_y: 300,
      target_x: 450,
      target_y: 300,
      target_size: 22,
      target_speed: 0,
      distance_to_target: 0, // Valid 0 precision (bullseye)
      reaction_time: 0.25,
      precision: 0, // Valid 0 value
    };

    const missShot: ShotTelemetry = {
      shot_id: 'shot_miss_002',
      round_id: 'round_inv_1',
      target_id: null,
      timestamp: '2026-10-15T10:00:02.000Z',
      hit: false,
      player_x: 200,
      player_y: 200,
      target_x: null,
      target_y: null,
      target_size: null,
      target_speed: null,
      distance_to_target: null,
      reaction_time: null,
      precision: null,
    };

    collector.recordShot(hitShot);
    collector.recordShot(missShot);

    const shots = collector.getRecordedShots();
    assert.equal(shots.length, 2);
    assert.equal(shots[0].shot_id, 'shot_hit_001');
    assert.equal(shots[0].hit, true);
    assert.equal(shots[0].target_id, 'target_001');
    assert.equal(shots[1].shot_id, 'shot_miss_002');
    assert.equal(shots[1].hit, false);
    assert.equal(shots[1].target_id, null);

    const round = collector.getCurrentRound();
    assert.ok(round);
    assert.equal(round.shots_fired, 2);
    assert.equal(round.hits, 1);
    assert.equal(round.misses, 1);
    assert.equal(round.accuracy, 50.0);
  });

  // Invariant 2: Shot-associated trajectory segments retain their shot IDs and relevant target IDs
  it('2. should retain shot IDs and target IDs on shot-associated trajectory segments', () => {
    collector.startRound('round_inv_2', 'six_shot', 'fixed');

    const hitSegment: TrajectorySegment = {
      trajectory_id: 'traj_hit_001',
      round_id: 'round_inv_2',
      shot_id: 'shot_hit_001',
      target_id: 'target_001',
      start_time: '2026-10-15T10:00:00.000Z',
      end_time: '2026-10-15T10:00:00.500Z',
      duration: 500,
      samples: [
        { x: 400, y: 300, movement_x: 0, movement_y: 0, timestamp: '2026-10-15T10:00:00.000Z' },
        { x: 450, y: 300, movement_x: 50, movement_y: 0, timestamp: '2026-10-15T10:00:00.500Z' },
      ],
    };

    const missSegment: TrajectorySegment = {
      trajectory_id: 'traj_miss_002',
      round_id: 'round_inv_2',
      shot_id: 'shot_miss_002',
      target_id: null,
      start_time: '2026-10-15T10:00:00.500Z',
      end_time: '2026-10-15T10:00:01.000Z',
      duration: 500,
      samples: [
        { x: 450, y: 300, movement_x: 0, movement_y: 0, timestamp: '2026-10-15T10:00:00.500Z' },
        { x: 200, y: 200, movement_x: -250, movement_y: -100, timestamp: '2026-10-15T10:00:01.000Z' },
      ],
    };

    collector.recordTrajectorySegment(hitSegment);
    collector.recordTrajectorySegment(missSegment);

    const segments = collector.getRecordedTrajectorySegments();
    assert.equal(segments.length, 2);
    assert.equal(segments[0].shot_id, 'shot_hit_001');
    assert.equal(segments[0].target_id, 'target_001');
    assert.equal(segments[1].shot_id, 'shot_miss_002');
    assert.equal(segments[1].target_id, null);
    assert.ok(segments[0].derived_metrics);
    assert.ok(segments[1].derived_metrics);
  });

  // Invariant 3: The unassigned trailing segment remains unassigned and is not counted as a shot
  it('3. should keep trailing segment unassigned and never count it as a shot', () => {
    collector.startRound('round_inv_3', 'six_shot', 'fixed');

    const shot: ShotTelemetry = {
      shot_id: 'shot_single_001',
      round_id: 'round_inv_3',
      target_id: 'target_001',
      timestamp: '2026-10-15T10:00:01.000Z',
      hit: true,
      player_x: 450,
      player_y: 300,
      target_x: 450,
      target_y: 300,
      target_size: 22,
      target_speed: 0,
      distance_to_target: 0,
      reaction_time: 0.3,
      precision: 0,
    };
    collector.recordShot(shot);

    // Trailing unassigned segment finalized at round end
    const trailingSegment: TrajectorySegment = {
      trajectory_id: 'traj_trailing_003',
      round_id: 'round_inv_3',
      shot_id: null,
      target_id: null,
      start_time: '2026-10-15T10:00:01.000Z',
      end_time: '2026-10-15T10:00:02.000Z',
      duration: 1000,
      samples: [
        { x: 450, y: 300, movement_x: 0, movement_y: 0, timestamp: '2026-10-15T10:00:01.000Z' },
        { x: 460, y: 305, movement_x: 10, movement_y: 5, timestamp: '2026-10-15T10:00:02.000Z' },
      ],
    };
    collector.recordTrajectorySegment(trailingSegment);

    const round = collector.endRound();
    assert.ok(round);
    // Shots fired must remain exactly 1, not 2
    assert.equal(round.shots_fired, 1);
    assert.equal(round.hits, 1);
    assert.equal(round.misses, 0);

    const segments = collector.getRecordedTrajectorySegments();
    assert.equal(segments.length, 1);
    assert.equal(segments[0].shot_id, null);
    assert.equal(segments[0].target_id, null);
    assert.equal(collector.getRecordedShots().length, 1);
  });

  // Invariant 4: Round-end and restart cleanup do not leak samples or associations across rounds
  it('4. should cleanly reset all events on new round start without leaking previous round data', () => {
    // Round 1
    collector.startRound('round_leak_1', 'six_shot', 'fixed');
    collector.recordShot({
      shot_id: 'shot_r1',
      round_id: 'round_leak_1',
      target_id: 'target_r1',
      timestamp: '2026-10-15T10:00:01.000Z',
      hit: true,
      player_x: 100,
      player_y: 100,
      target_x: 100,
      target_y: 100,
      target_size: 22,
      target_speed: 0,
      distance_to_target: 0,
      reaction_time: 0.2,
      precision: 0,
    });
    collector.recordTrajectorySegment({
      trajectory_id: 'traj_r1',
      round_id: 'round_leak_1',
      shot_id: 'shot_r1',
      target_id: 'target_r1',
      start_time: '2026-10-15T10:00:00.000Z',
      end_time: '2026-10-15T10:00:01.000Z',
      duration: 1000,
      samples: [{ x: 100, y: 100, movement_x: 0, movement_y: 0, timestamp: '2026-10-15T10:00:00.000Z' }],
    });
    const round1 = collector.endRound();
    assert.equal(round1?.shots_fired, 1);
    assert.equal(collector.getRecordedShots().length, 1);
    assert.equal(collector.getRecordedTrajectorySegments().length, 1);

    // Restart: Round 2
    collector.startRound('round_leak_2', 'six_shot', 'fixed');
    assert.equal(collector.getRecordedShots().length, 0);
    assert.equal(collector.getRecordedTargets().length, 0);
    assert.equal(collector.getRecordedTrajectorySegments().length, 0);

    const round2Current = collector.getCurrentRound();
    assert.ok(round2Current);
    assert.equal(round2Current.round_id, 'round_leak_2');
    assert.equal(round2Current.shots_fired, 0);
    assert.equal(round2Current.hits, 0);
    assert.equal(round2Current.misses, 0);
    assert.equal(round2Current.accuracy, 0);
    assert.equal(round2Current.targets_hit, 0);
    assert.equal(round2Current.targets_spawned, 0);
  });

  // Invariant: Distinguishing missing data from a valid zero value in round aggregates
  it('5. should distinguish valid zero precision and reaction time from missing values', () => {
    collector.startRound('round_zero_val', 'six_shot', 'fixed');

    // Target spawn
    const target: TargetTelemetry = {
      target_id: 'target_z1',
      round_id: 'round_zero_val',
      spawn_time: '2026-10-15T10:00:00.000Z',
      spawn_x: 100,
      spawn_y: 100,
      target_size: 22,
      movement_enabled: false,
      movement_speed: 0,
      direction_x: 0,
      direction_y: 0,
    };
    collector.recordTargetSpawn(target);

    // Shot 1: Hit with valid precision = 0.0 (dead center), reaction = 0.2
    collector.recordShot({
      shot_id: 'shot_z1',
      round_id: 'round_zero_val',
      target_id: 'target_z1',
      timestamp: '2026-10-15T10:00:00.200Z',
      hit: true,
      player_x: 100,
      player_y: 100,
      target_x: 100,
      target_y: 100,
      target_size: 22,
      target_speed: 0,
      distance_to_target: 0,
      reaction_time: 0.2,
      precision: 0,
    });

    // Shot 2: Miss (precision = null, reaction_time = null)
    collector.recordShot({
      shot_id: 'shot_z2',
      round_id: 'round_zero_val',
      target_id: null,
      timestamp: '2026-10-15T10:00:00.400Z',
      hit: false,
      player_x: 300,
      player_y: 300,
      target_x: null,
      target_y: null,
      target_size: null,
      target_speed: null,
      distance_to_target: null,
      reaction_time: null,
      precision: null,
    });

    const completed = collector.endRound();
    assert.ok(completed);
    assert.equal(completed.shots_fired, 2);
    assert.equal(completed.hits, 1);
    assert.equal(completed.misses, 1);
    // Precision from the single hit (0.0) must be included in average -> average = 0.0, NOT NaN
    assert.equal(completed.average_precision, 0.0);
    assert.equal(completed.average_reaction_time, 0.2);
  });
});
