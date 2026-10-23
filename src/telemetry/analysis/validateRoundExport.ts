import { ROUND_EXPORT_SCHEMA_VERSION } from '../types.ts';
import type { RoundExport } from '../types.ts';
import { calculateTrajectoryFeatures } from '../trajectoryFeatures.ts';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

export interface RoundSummary {
  roundId: string;
  mode: string;
  durationSeconds: number;
  shots: number;
  hits: number;
  misses: number;
  accuracyPercent: number;
  meanReactionSeconds: number | null;
  meanPrecisionPixels: number | null;
  targets: number;
  segments: number;
  trailingSegments: number;
  samples: number;
  sampleIntervalsMs: { count: number; min: number | null; median: number | null; p95: number | null; max: number | null };
  completion: 'goal_reached' | 'below_goal' | 'unknown';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** Invalid records are never included in batch statistics. */
  summary: RoundSummary | null;
}

type Kind = 'text' | 'time' | 'number' | 'nonnegative' | 'positive' | 'count' | 'boolean' | 'nullableId' | 'nullableNumber';
type Fields = Record<string, Kind>;
const nullableShotFields = ['target_x', 'target_y', 'target_size', 'target_speed', 'distance_to_target', 'reaction_time', 'precision'] as const;
const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const time = (v: unknown): boolean => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const roundTo = (value: number, places: number) => Number(value.toFixed(places));
const mean = (values: number[]) => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;

function matches(value: unknown, kind: Kind): boolean {
  switch (kind) {
    case 'text': return typeof value === 'string' && value.trim().length > 0;
    case 'time': return time(value);
    case 'number': return numeric(value);
    case 'nonnegative': return numeric(value) && value >= 0;
    case 'positive': return numeric(value) && value > 0;
    case 'count': return Number.isSafeInteger(value) && (value as number) >= 0;
    case 'boolean': return typeof value === 'boolean';
    case 'nullableId': return value === null || matches(value, 'text');
    case 'nullableNumber': return value === null || numeric(value);
  }
}

/** Validate unknown JSON before reading any event fields. Never repairs or mutates input. */
export function validateRoundExport(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const issue = (code: string, path: string, message: string, severity: ValidationIssue['severity'] = 'error') => {
    issues.push({ severity, code, path, message });
  };
  const require = (condition: boolean, code: string, path: string, message: string) => {
    if (!condition) issue(code, path, message);
  };
  const fields = (value: unknown, path: string, spec: Fields) => {
    if (!object(value)) {
      issue('shape', path, 'Expected an object.');
      return;
    }
    for (const [key, kind] of Object.entries(spec)) {
      const optional = key.endsWith('?');
      const name = optional ? key.slice(0, -1) : key;
      if (optional && !Object.hasOwn(value, name)) continue;
      if (!matches(value[name], kind)) issue('shape', `${path}.${name}`, `Expected ${kind}${optional ? ' when present' : ''}.`);
    }
  };
  const array = (value: unknown, path: string, visit: (item: unknown, path: string) => void) => {
    if (!Array.isArray(value)) issue('shape', path, 'Expected an array.');
    else value.forEach((item: unknown, i: number) => visit(item, `${path}[${i}]`));
  };
  if (!object(input)) return { valid: false, issues: [{ severity: 'error', code: 'shape', path: '$', message: 'Expected an export object.' }], summary: null };
  fields(input, '$', { schema_version: 'text', exported_at: 'time' });
  require(input.schema_version === ROUND_EXPORT_SCHEMA_VERSION, 'schema_version', '$.schema_version', `Only schema ${ROUND_EXPORT_SCHEMA_VERSION} is supported.`);
  fields(input.player, '$.player', { player_id: 'text' });
  fields(input.session, '$.session', { player_id: 'text', session_id: 'text', start_time: 'time', 'end_time?': 'time' });
  fields(input.round, '$.round', {
    round_id: 'text', session_id: 'text', mode: 'text', difficulty: 'text', start_time: 'time', end_time: 'time',
    duration: 'nonnegative', shots_fired: 'count', hits: 'count', misses: 'count', targets_hit: 'count', targets_spawned: 'count',
    accuracy: 'nonnegative', average_reaction_time: 'nonnegative', average_precision: 'nonnegative',
  });
  array(input.targets, '$.targets', (v, p) => fields(v, p, {
    target_id: 'text', round_id: 'text', spawn_time: 'time', 'destroy_time?': 'time', 'lifetime?': 'nonnegative',
    spawn_x: 'number', spawn_y: 'number', target_size: 'positive', movement_enabled: 'boolean',
    movement_speed: 'nonnegative', direction_x: 'number', direction_y: 'number',
  }));
  array(input.shots, '$.shots', (v, p) => fields(v, p, {
    shot_id: 'text', round_id: 'text', timestamp: 'time', hit: 'boolean', target_id: 'nullableId', player_x: 'number', player_y: 'number',
    ...Object.fromEntries(nullableShotFields.map(key => [key, 'nullableNumber' as const])),
  }));
  array(input.trajectory_segments, '$.trajectory_segments', (v, p) => {
    fields(v, p, { trajectory_id: 'text', round_id: 'text', shot_id: 'nullableId', target_id: 'nullableId', start_time: 'time', end_time: 'time', duration: 'nonnegative' });
    if (!object(v)) return;
    array(v.samples, `${p}.samples`, (s, sp) => fields(s, sp, { timestamp: 'time', x: 'number', y: 'number', movement_x: 'number', movement_y: 'number' }));
    if (Object.hasOwn(v, 'derived_metrics')) fields(v.derived_metrics, `${p}.derived_metrics`, {
      path_distance: 'nonnegative', direct_distance: 'nonnegative', path_efficiency: 'nullableNumber',
      average_velocity: 'nullableNumber', max_velocity: 'nullableNumber', direction_changes: 'count',
      valid_sample_count: 'count', eligible_duration_seconds: 'nonnegative',
    });
  });
  if (issues.length) return { valid: false, issues, summary: null };

  // All properties consumed below have passed the runtime shape checks above.
  const data = input as unknown as RoundExport;
  const { round, shots, targets, trajectory_segments: segments } = data;
  const start = Date.parse(round.start_time);
  const end = Date.parse(round.end_time);
  const equal = (actual: number | null, expected: number | null, path: string) => {
    const same = actual === expected || (actual !== null && expected !== null && Number.isFinite(expected) && Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)));
    require(same, 'metric', path, `Expected ${expected}; received ${actual}.`);
  };
  const bounds = (timestamp: string, path: string, low = start, high = end) => {
    require(Date.parse(timestamp) >= low && Date.parse(timestamp) <= high, 'time_bounds', path, 'Timestamp is outside its recording boundaries.');
  };
  const unique = <T,>(items: T[], key: (v: T) => string, path: string) => {
    const ids = new Set<string>();
    items.forEach((item, i) => {
      require(!ids.has(key(item)), 'duplicate_id', `${path}[${i}]`, 'Identifier is repeated in this array.');
      ids.add(key(item));
    });
  };
  require(end >= start, 'time_order', '$.round.end_time', 'Round ends before it starts.');
  require(Date.parse(data.exported_at) >= end, 'time_order', '$.exported_at', 'Export precedes round end.');
  require(Date.parse(data.session.start_time) <= start, 'time_order', '$.session.start_time', 'Session starts after the round.');
  if (data.session.end_time) bounds(data.session.end_time, '$.session.end_time', end, Date.parse(data.exported_at));
  require(data.session.player_id === data.player.player_id, 'association', '$.session.player_id', 'Player link differs from export player.');
  require(round.session_id === data.session.session_id, 'association', '$.round.session_id', 'Session link differs from export session.');
  unique(targets, t => t.target_id, '$.targets');
  unique(shots, s => s.shot_id, '$.shots');
  unique(segments, s => s.trajectory_id, '$.trajectory_segments');
  const targetById = new Map(targets.map(t => [t.target_id, t]));
  const shotById = new Map(shots.map(s => [s.shot_id, s]));
  const hitTargets = new Set<string>();
  shots.forEach((shot, i) => {
    const p = `$.shots[${i}]`;
    bounds(shot.timestamp, `${p}.timestamp`);
    if (i) require(Date.parse(shots[i - 1].timestamp) <= Date.parse(shot.timestamp), 'time_order', p, 'Shots are out of order.');
    if (!shot.hit) {
      for (const key of ['target_id', ...nullableShotFields] as const) require(shot[key] === null, 'miss_null', `${p}.${key}`, 'Miss fields must be null.');
      return;
    }
    require(shot.target_id !== null && nullableShotFields.every(key => shot[key] !== null), 'hit_fields', p, 'Hits require a target ID and all target measurements.');
    const target = shot.target_id === null ? undefined : targetById.get(shot.target_id);
    require(target !== undefined, 'association', `${p}.target_id`, 'Hit target does not exist.');
    if (!target || nullableShotFields.some(key => shot[key] === null)) return;
    require(!hitTargets.has(target.target_id), 'duplicate_hit', `${p}.target_id`, 'A target is hit more than once.');
    hitTargets.add(target.target_id);
    require(target.destroy_time === shot.timestamp, 'association', p, 'Hit and target destruction timestamps differ.');
    bounds(shot.timestamp, `${p}.timestamp`, Date.parse(target.spawn_time));
    equal(shot.target_size, target.target_size, `${p}.target_size`);
    equal(shot.target_speed, target.movement_speed, `${p}.target_speed`);
    if (!target.movement_enabled) {
      equal(shot.target_x, target.spawn_x, `${p}.target_x`);
      equal(shot.target_y, target.spawn_y, `${p}.target_y`);
    }
    const dx = shot.player_x - shot.target_x!;
    const dy = shot.player_y - shot.target_y!;
    const distance = Math.sqrt(dx * dx + dy * dy);
    require(distance <= target.target_size + 1e-8, 'hit_radius', p, 'Hit aim is outside the target radius.');
    equal(shot.precision, roundTo(distance, 2), `${p}.precision`);
    equal(shot.distance_to_target, roundTo(distance, 2), `${p}.distance_to_target`);
    equal(shot.reaction_time, roundTo((Date.parse(shot.timestamp) - Date.parse(target.spawn_time)) / 1000, 3), `${p}.reaction_time`);
  });
  targets.forEach((target, i) => {
    const p = `$.targets[${i}]`;
    bounds(target.spawn_time, `${p}.spawn_time`);
    if (target.destroy_time !== undefined) {
      bounds(target.destroy_time, `${p}.destroy_time`, Date.parse(target.spawn_time));
      require(hitTargets.has(target.target_id), 'association', p, 'Destroyed target has no hit shot.');
      require(target.lifetime !== undefined, 'lifetime', p, 'Destroyed target requires lifetime in milliseconds.');
      equal(target.lifetime ?? null, Date.parse(target.destroy_time) - Date.parse(target.spawn_time), `${p}.lifetime`);
    } else require(target.lifetime === undefined, 'lifetime', p, 'Live target cannot have a destruction lifetime.');
    if (!target.movement_enabled) {
      equal(target.movement_speed, 0, `${p}.movement_speed`);
      equal(target.direction_x, 0, `${p}.direction_x`);
      equal(target.direction_y, 0, `${p}.direction_y`);
    }
  });

  const associated = new Map<string, number>();
  const intervals: number[] = [];
  segments.forEach((segment, i) => {
    const p = `$.trajectory_segments[${i}]`;
    bounds(segment.start_time, `${p}.start_time`);
    bounds(segment.end_time, `${p}.end_time`, Date.parse(segment.start_time));
    equal(segment.duration, Date.parse(segment.end_time) - Date.parse(segment.start_time), `${p}.duration`);
    if (i) require(segment.start_time === segments[i - 1].end_time, 'segment_boundary', p, 'Consecutive segment boundaries differ.');
    if (segment.shot_id === null) {
      require(segment.target_id === null && i === segments.length - 1, 'trailing_segment', p, 'Only the last segment may be unassigned, with a null target.');
    } else {
      associated.set(segment.shot_id, (associated.get(segment.shot_id) ?? 0) + 1);
      const shot = shotById.get(segment.shot_id);
      require(shot !== undefined, 'association', `${p}.shot_id`, 'Associated shot does not exist.');
      if (shot) {
        require(segment.target_id === shot.target_id, 'association', `${p}.target_id`, 'Segment target differs from shot target.');
        require(segment.end_time === shot.timestamp, 'shot_boundary', p, 'Segment must end at its shot timestamp.');
        const last = segment.samples.at(-1);
        require(last !== undefined && last.timestamp === shot.timestamp && last.x === shot.player_x && last.y === shot.player_y, 'shot_boundary', p, 'Missing exact shot-boundary sample.');
      }
    }
    segment.samples.forEach((sample, j) => {
      bounds(sample.timestamp, `${p}.samples[${j}].timestamp`, Date.parse(segment.start_time), Date.parse(segment.end_time));
      if (j) {
        const dt = Date.parse(sample.timestamp) - Date.parse(segment.samples[j - 1].timestamp);
        require(dt >= 0, 'time_order', `${p}.samples[${j}]`, 'Samples are out of order.');
        intervals.push(dt);
      }
    });
    const derived = calculateTrajectoryFeatures(segment);
    if (!segment.derived_metrics) issue('missing_derived', `${p}.derived_metrics`, 'Optional derived metrics are absent; raw samples were checked.', 'warning');
    else for (const key of Object.keys(derived) as (keyof typeof derived)[]) equal(segment.derived_metrics[key], derived[key], `${p}.derived_metrics.${key}`);
  });
  shots.forEach((shot, i) => require(associated.get(shot.shot_id) === 1, 'shot_segment_count', `$.shots[${i}]`, 'Each shot requires exactly one associated segment.'));
  for (const [name, events] of [['targets', targets], ['shots', shots], ['trajectory_segments', segments]] as const) {
    events.forEach((event, i) => require(event.round_id === round.round_id, 'association', `$.${name}[${i}].round_id`, 'Event belongs to another round.'));
  }
  const hits = shots.filter(s => s.hit);
  const reaction = mean(hits.flatMap(s => s.reaction_time === null ? [] : [s.reaction_time]));
  const precision = mean(hits.flatMap(s => s.precision === null ? [] : [s.precision]));
  equal(round.duration, roundTo((end - start) / 1000, 2), '$.round.duration');
  equal(round.shots_fired, shots.length, '$.round.shots_fired');
  equal(round.hits, hits.length, '$.round.hits');
  equal(round.misses, shots.length - hits.length, '$.round.misses');
  equal(round.targets_hit, hits.length, '$.round.targets_hit');
  equal(round.targets_spawned, targets.length, '$.round.targets_spawned');
  equal(round.accuracy, shots.length ? roundTo(100 * hits.length / shots.length, 2) : 0, '$.round.accuracy');
  equal(round.average_reaction_time, roundTo(reaction ?? 0, 3), '$.round.average_reaction_time');
  equal(round.average_precision, roundTo(precision ?? 0, 2), '$.round.average_precision');

  // Gameplay profiles are warnings: the schema also permits early finalized/API rounds.
  let completion: RoundSummary['completion'] = 'unknown';
  let expectedTargets: number | undefined;
  if (round.mode === 'thirty_shot') {
    completion = hits.length === 30 ? 'goal_reached' : hits.length < 30 ? 'below_goal' : 'unknown';
    if (hits.length !== 30) issue('goal_count', '$.round.hits', 'Thirty Shot completion requires 30 hits; this recording has a different count.', 'warning');
    expectedTargets = Math.min(hits.length + 1, 30);
  } else if (round.mode === 'six_shot' || round.mode === 'moving_targets') {
    expectedTargets = hits.length + (round.mode === 'six_shot' ? 6 : 4);
    if (round.duration < 30) issue('short_round', '$.round.duration', 'Recording is shorter than the current 30-second timed mode; completion is unknown.', 'warning');
  } else issue('unknown_mode', '$.round.mode', 'No gameplay profile for this mode; structural and telemetry checks still apply.', 'warning');
  if (expectedTargets !== undefined && targets.length !== expectedTargets) issue('spawn_profile', '$.targets', `Current mode normally records ${expectedTargets} targets; verify the recording context.`, 'warning');
  if (['six_shot', 'moving_targets', 'thirty_shot'].includes(round.mode) && targets.some(t => t.movement_enabled !== (round.mode === 'moving_targets'))) {
    issue('movement_profile', '$.targets', 'Target movement differs from the current mode profile.', 'warning');
  }
  const valid = !issues.some(i => i.severity === 'error');
  intervals.sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  return { valid, issues, summary: valid ? {
    roundId: round.round_id, mode: round.mode, durationSeconds: round.duration, shots: shots.length, hits: hits.length,
    misses: shots.length - hits.length, accuracyPercent: round.accuracy, meanReactionSeconds: reaction, meanPrecisionPixels: precision,
    targets: targets.length, segments: segments.length, trailingSegments: segments.filter(s => s.shot_id === null).length,
    samples: segments.reduce((n, s) => n + s.samples.length, 0), completion,
    sampleIntervalsMs: {
      count: intervals.length, min: intervals[0] ?? null, max: intervals.at(-1) ?? null,
      median: intervals.length ? (intervals.length % 2 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2) : null,
      p95: intervals[Math.ceil(intervals.length * 0.95) - 1] ?? null,
    },
  } : null };
}
