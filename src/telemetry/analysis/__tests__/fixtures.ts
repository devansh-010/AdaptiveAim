import type { RoundExport, ShotTelemetry, TargetTelemetry, TrajectorySegment } from '../../types.ts';

/** Deterministic synthetic records; no captured player data. Distances use a 3-4-5 triangle. */
export function fixture(mode = 'six_shot', hitCount = 2, includeMiss = true): RoundExport {
  const epoch = Date.parse('2026-10-22T10:00:00.000Z');
  const iso = (ms: number) => new Date(epoch + ms).toISOString();
  const moving = mode === 'moving_targets';
  const initial = mode === 'thirty_shot' ? 1 : moving ? 4 : 6;
  const targets: TargetTelemetry[] = [];
  const shots: ShotTelemetry[] = [];
  const segments: TrajectorySegment[] = [];
  const active: TargetTelemetry[] = [];
  const spawn = (ms: number) => {
    const target: TargetTelemetry = {
      target_id: `target_${targets.length}`, round_id: 'round_fixture', spawn_time: iso(ms),
      spawn_x: 100 + targets.length * 50, spawn_y: 200, target_size: 22,
      movement_enabled: moving, movement_speed: moving ? 160 : 0, direction_x: moving ? 1 : 0, direction_y: 0,
    };
    targets.push(target);
    active.push(target);
  };
  for (let i = 0; i < initial; i++) spawn(0);
  const record = (ms: number, target?: TargetTelemetry) => {
    const x = target ? target.spawn_x + (moving ? 10 : 0) : null;
    const y = target?.spawn_y ?? null;
    const shot: ShotTelemetry = {
      shot_id: `shot_${shots.length}`, round_id: 'round_fixture', timestamp: iso(ms), hit: !!target,
      target_id: target?.target_id ?? null, player_x: x === null ? 0 : x + 3, player_y: y === null ? 0 : y + 4,
      target_x: x, target_y: y, target_size: target?.target_size ?? null, target_speed: target?.movement_speed ?? null,
      distance_to_target: target ? 5 : null, precision: target ? 5 : null,
      reaction_time: target ? (Date.parse(iso(ms)) - Date.parse(target.spawn_time)) / 1000 : null,
    };
    const segment: TrajectorySegment = {
      trajectory_id: `trajectory_${shots.length}`, round_id: 'round_fixture', shot_id: shot.shot_id, target_id: shot.target_id,
      start_time: segments.at(-1)?.end_time ?? iso(0), end_time: iso(ms),
      duration: ms - (segments.length ? Date.parse(segments.at(-1)!.end_time) - epoch : 0),
      samples: [
        { timestamp: iso(ms - 16), x: shot.player_x - 6, y: shot.player_y - 8, movement_x: 2, movement_y: 3 },
        { timestamp: iso(ms), x: shot.player_x, y: shot.player_y, movement_x: 6, movement_y: 8 },
      ],
      derived_metrics: { path_distance: 10, direct_distance: 10, path_efficiency: 1, average_velocity: 625, max_velocity: 625, direction_changes: 0, valid_sample_count: 2, eligible_duration_seconds: 0.016 },
    };
    shots.push(shot);
    segments.push(segment);
    if (target) { target.destroy_time = shot.timestamp; target.lifetime = ms - (Date.parse(target.spawn_time) - epoch); }
  };
  if (includeMiss) record(250);
  for (let i = 1; i <= hitCount; i++) {
    record(i * 1000, active.shift()!);
    if (mode !== 'thirty_shot' || i < 30) spawn(i * 1000);
  }
  const end = mode === 'thirty_shot' ? Math.max(1000, hitCount * 1000 + 1) : 30000;
  if (segments.length) segments.push({
    trajectory_id: 'trajectory_trailing', round_id: 'round_fixture', shot_id: null, target_id: null,
    start_time: segments.at(-1)!.end_time, end_time: iso(end), duration: end - (Date.parse(segments.at(-1)!.end_time) - epoch),
    samples: [{ timestamp: iso(end), x: 100, y: 200, movement_x: 0, movement_y: 0 }],
    derived_metrics: { path_distance: 0, direct_distance: 0, path_efficiency: null, average_velocity: null, max_velocity: null, direction_changes: 0, valid_sample_count: 1, eligible_duration_seconds: 0 },
  });
  const reactionSum = shots.reduce((n, s) => n + (s.reaction_time ?? 0), 0);
  return {
    schema_version: '1.0.0', exported_at: iso(end + 1000), player: { player_id: 'player_fixture' },
    session: { session_id: 'session_fixture', player_id: 'player_fixture', start_time: iso(-1000) },
    round: {
      round_id: 'round_fixture', session_id: 'session_fixture', mode, difficulty: moving ? 'moving' : 'fixed',
      start_time: iso(0), end_time: iso(end), duration: Number((end / 1000).toFixed(2)), shots_fired: shots.length,
      hits: hitCount, misses: Number(includeMiss), targets_hit: hitCount, targets_spawned: targets.length,
      accuracy: shots.length ? Number((hitCount / shots.length * 100).toFixed(2)) : 0,
      average_reaction_time: hitCount ? Number((reactionSum / hitCount).toFixed(3)) : 0, average_precision: hitCount ? 5 : 0,
    }, targets, shots, trajectory_segments: segments,
  };
}
