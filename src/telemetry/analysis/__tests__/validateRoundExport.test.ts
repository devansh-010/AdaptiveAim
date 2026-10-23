import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoundExport } from '../validateRoundExport.ts';
import { fixture } from './fixtures.ts';
import type { RoundExport } from '../../types.ts';

describe('round export validation', () => {
  for (const mode of ['six_shot', 'moving_targets', 'thirty_shot']) it(`accepts realistic ${mode} records without mutation`, () => {
    const data = fixture(mode, mode === 'thirty_shot' ? 30 : 2);
    const before = structuredClone(data);
    const result = validateRoundExport(data);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
    assert.deepEqual(result.issues, []);
    assert.deepEqual(data, before);
    assert.equal(result.summary?.sampleIntervalsMs.median, 16);
    assert.equal(result.summary?.meanPrecisionPixels, 5);
    assert.equal(result.summary?.completion, mode === 'thirty_shot' ? 'goal_reached' : 'unknown');
  });

  it('accepts zero-shot and no-hit rounds with null summary means and no invented cadence', () => {
    const empty = validateRoundExport(fixture('six_shot', 0, false));
    assert.equal(empty.valid, true);
    assert.equal(empty.summary?.meanReactionSeconds, null);
    assert.equal(empty.summary?.meanPrecisionPixels, null);
    assert.deepEqual(empty.summary?.sampleIntervalsMs, { count: 0, min: null, median: null, p95: null, max: null });
    const missOnly = validateRoundExport(fixture('six_shot', 0));
    assert.equal(missOnly.valid, true);
    assert.equal(missOnly.summary?.meanReactionSeconds, null);
    assert.equal(missOnly.summary?.accuracyPercent, 0);
  });

  it('reports early finalization and absent optional metrics as warnings', () => {
    const data = fixture('thirty_shot');
    delete data.trajectory_segments[0].derived_metrics;
    const result = validateRoundExport(data);
    assert.equal(result.valid, true);
    assert.equal(result.summary?.completion, 'below_goal');
    assert.deepEqual(result.issues.map(i => i.code).sort(), ['goal_count', 'missing_derived']);
    data.round.mode = 'future_mode';
    assert.ok(validateRoundExport(data).issues.some(i => i.code === 'unknown_mode'));
  });

  for (const value of [null, [], {}, { schema_version: '2.0.0' }, { ...fixture(), shots: [null] }, { ...fixture(), targets: {} }]) {
    it(`rejects malformed envelopes safely (${JSON.stringify(value)?.slice(0, 45)})`, () => {
      const result = validateRoundExport(value);
      assert.equal(result.valid, false);
      assert.equal(result.summary, null);
    });
  }

  const defects: [string, string, (data: RoundExport) => void][] = [
    ['nonfinite coordinate', 'shape', d => { d.shots[0].player_x = Infinity; }],
    ['missing required field', 'shape', d => { delete (d.shots[0] as Partial<typeof d.shots[0]>).target_speed; }],
    ['null optional field', 'shape', d => { Object.assign(d.targets[0], { destroy_time: null }); }],
    ['noncanonical time', 'shape', d => { d.round.start_time = '2026-10-22'; }],
    ['fractional count', 'shape', d => { d.round.hits = 1.5; }],
    ['version', 'schema_version', d => { Object.assign(d, { schema_version: '2.0.0' }); }],
    ['session link', 'association', d => { d.session.player_id = 'other_player'; }],
    ['cross-round event', 'association', d => { d.shots[0].round_id = 'other_round'; }],
    ['duplicate target ID', 'duplicate_id', d => { d.targets[1].target_id = d.targets[0].target_id; }],
    ['duplicate shot ID', 'duplicate_id', d => { d.shots[1].shot_id = d.shots[0].shot_id; }],
    ['unknown hit target', 'association', d => { d.shots[1].target_id = 'missing_target'; }],
    ['unknown segment shot', 'association', d => { d.trajectory_segments[0].shot_id = 'missing_shot'; }],
    ['hit null measurement', 'hit_fields', d => { d.shots[1].precision = null; }],
    ['miss nonnull measurement', 'miss_null', d => { d.shots[0].precision = 0; }],
    ['missing shot segment', 'shot_segment_count', d => { d.trajectory_segments.shift(); }],
    ['duplicate shot segment', 'shot_segment_count', d => { d.trajectory_segments[1].shot_id = d.shots[0].shot_id; }],
    ['boundary movement', 'shot_boundary', d => { d.trajectory_segments[0].samples.at(-1)!.x++; }],
    ['non-final trailing segment', 'trailing_segment', d => { d.trajectory_segments[0].shot_id = null; }],
    ['discontinuous segment', 'segment_boundary', d => { d.trajectory_segments[1].start_time = d.round.start_time; }],
    ['out-of-bounds sample', 'time_bounds', d => { d.trajectory_segments[0].samples[0].timestamp = d.exported_at; }],
    ['reversed samples', 'time_order', d => { d.trajectory_segments[0].samples.reverse(); }],
    ['changed derived metrics', 'metric', d => { d.trajectory_segments[0].derived_metrics!.path_distance++; }],
    ['incorrect null velocity', 'metric', d => { d.trajectory_segments[0].derived_metrics!.max_velocity = null; }],
    ['wrong lifetime units', 'metric', d => { d.targets[0].lifetime! /= 1000; }],
    ['wrong round duration units', 'metric', d => { d.round.duration *= 1000; }],
    ['wrong segment duration units', 'metric', d => { d.trajectory_segments[0].duration /= 1000; }],
    ['changed count', 'metric', d => { d.round.shots_fired++; }],
    ['changed average', 'metric', d => { d.round.average_reaction_time++; }],
    ['changed hit center', 'metric', d => { d.shots[1].target_x!++; }],
    ['hit outside radius', 'hit_radius', d => { d.shots[1].player_x += 100; }],
    ['export before round end', 'time_order', d => { d.exported_at = d.round.start_time; }],
    ['destruction without lifetime', 'lifetime', d => { delete d.targets[0].lifetime; }],
  ];
  for (const [name, code, change] of defects) it(`detects ${name}`, () => {
    const data = fixture();
    change(data);
    const result = validateRoundExport(data);
    assert.equal(result.valid, false);
    assert.equal(result.summary, null);
    assert.ok(result.issues.some(i => i.severity === 'error' && i.code === code), JSON.stringify(result.issues));
  });

  it('preserves valid zeros, duplicate sample timestamps, and null stationary velocities', () => {
    const data = fixture();
    const segment = data.trajectory_segments[0];
    segment.samples[0] = { ...segment.samples[1], movement_x: 0, movement_y: 0 };
    segment.derived_metrics = { path_distance: 0, direct_distance: 0, path_efficiency: null, average_velocity: null, max_velocity: null, direction_changes: 0, valid_sample_count: 2, eligible_duration_seconds: 0 };
    const result = validateRoundExport(data);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
    assert.equal(result.summary?.sampleIntervalsMs.min, 0);
  });
});
