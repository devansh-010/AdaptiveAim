import { beforeEach, describe, it, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryCollector } from '../TelemetryCollector.ts';
import { TrajectorySampler } from '../../game/systems/TrajectorySampler.ts';
import { downloadRoundJson, getRoundExportFilename, serializeRoundExport } from '../roundExport.ts';
import type { RoundExport, ShotTelemetry, TargetTelemetry } from '../types.ts';

function completeRound(t: TestContext, collector: TelemetryCollector, mode = 'moving_targets'): RoundExport {
  collector.startRound('round_export', mode, mode === 'moving_targets' ? 'moving' : 'fixed');
  const start = collector.getCurrentRound()!.start_time;
  const at = (ms: number) => new Date(Date.parse(start) + ms).toISOString();
  const target: TargetTelemetry = {
    target_id: 'target_export', round_id: 'round_export', spawn_time: start,
    spawn_x: 450, spawn_y: 300, target_size: 22, movement_enabled: mode === 'moving_targets',
    movement_speed: mode === 'moving_targets' ? 160 : 0, direction_x: 1, direction_y: 0,
  };
  collector.recordTargetSpawn(target);
  collector.recordTargetSpawn({ ...target, target_id: 'target_remaining' });
  const sampler = new TrajectorySampler(collector);
  sampler.start('round_export', start);
  sampler.capturePeriodicSnapshot(400, 300, start);
  sampler.accumulateMovement(50, 0);
  sampler.handleShotBoundary('shot_hit', target.target_id, 450, 300, at(100));
  const hit: ShotTelemetry = {
    shot_id: 'shot_hit', round_id: 'round_export', target_id: target.target_id,
    timestamp: at(100), hit: true, player_x: 450, player_y: 300,
    target_x: 450, target_y: 300, target_size: 22, target_speed: target.movement_speed,
    distance_to_target: 0, reaction_time: 0.1, precision: 0,
  };
  collector.recordShot(hit);
  collector.recordTargetDestroy(target.target_id, at(100));
  sampler.accumulateMovement(30, 0);
  sampler.handleShotBoundary('shot_miss', null, 480, 300, at(200));
  collector.recordShot({
    ...hit, shot_id: 'shot_miss', target_id: null, timestamp: at(200), hit: false,
    player_x: 480, target_x: null, target_y: null, target_size: null,
    target_speed: null, distance_to_target: null, reaction_time: null, precision: null,
  });
  sampler.accumulateMovement(4, 0);
  sampler.stop(484, 300, at(300));
  t.mock.timers.tick(1000);
  collector.endRound();
  return collector.getRoundExport()!;
}

function mockDownloadBrowser(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const anchor = { href: '', download: '', style: { display: '' }, click() {}, remove() {} };
  const documentStub = { createElement: () => anchor, body: { appendChild() {} } };
  Object.defineProperty(globalThis, 'document', { value: documentStub, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  let capturedBlob: Blob | undefined;
  const create = t.mock.method(URL, 'createObjectURL', (blob: Blob) => {
    capturedBlob = blob;
    return 'blob:round-export-test';
  });
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
  const click = t.mock.method(anchor, 'click');
  const remove = t.mock.method(anchor, 'remove');
  const append = t.mock.method(documentStub.body, 'appendChild');
  return { anchor, create, revoke, click, remove, append, blob: () => capturedBlob };
}

describe('Versioned round JSON export', () => {
  let collector: TelemetryCollector;
  beforeEach((t) => {
    assert.ok('mock' in t);
    t.mock.method(console, 'log', () => {});
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-22T10:00:00.000Z') });
    collector = new TelemetryCollector('player_export');
  });

  it('does not export or finalize an absent or active round', () => {
    assert.equal(collector.getRoundExport(), null);
    collector.startRound('active');
    assert.equal(collector.getRoundExport(), null);
    assert.equal(collector.getCurrentRound()?.end_time, undefined);
  });

  it('preserves hit/miss/trailing associations, raw samples, metrics, and valid zeros', (t) => {
    const data = completeRound(t, collector);
    assert.equal(data.schema_version, '1.0.0');
    assert.equal(data.exported_at, '2026-10-22T10:00:01.000Z');
    assert.equal(data.player.player_id, data.session.player_id);
    assert.equal(data.round.session_id, data.session.session_id);
    assert.equal(data.round.duration, 1);
    assert.equal(data.round.shots_fired, 2);
    assert.equal(data.round.hits, 1);
    assert.equal(data.round.misses, 1);
    assert.equal(data.round.accuracy, 50);
    assert.equal(data.round.average_precision, 0);
    assert.equal(data.targets[0].lifetime, 100);
    assert.equal(data.shots[0].precision, 0);
    assert.equal(data.shots[1].precision, null);
    assert.equal(data.trajectory_segments.length, 3);
    for (const shot of data.shots) {
      const [segment] = data.trajectory_segments.filter(s => s.shot_id === shot.shot_id);
      assert.ok(segment);
      assert.equal(segment.target_id, shot.target_id);
      assert.equal(segment.round_id, data.round.round_id);
      assert.equal(segment.samples.at(-1)?.timestamp, shot.timestamp);
      assert.equal(segment.samples.at(-1)?.x, shot.player_x);
    }
    const trailing = data.trajectory_segments[2];
    assert.equal(trailing.shot_id, null);
    assert.equal(trailing.target_id, null);
    assert.equal(trailing.samples[0].movement_x, 4);
    assert.deepEqual(data.trajectory_segments, collector.getRecordedTrajectorySegments());
  });

  it('returns independent copies including nested samples and derived metrics', (t) => {
    const data = completeRound(t, collector);
    const expected = collector.getRoundExport()!;
    data.player.player_id = 'changed';
    data.session.session_id = 'changed';
    data.round.hits = 999;
    data.targets[0].spawn_x = 999;
    data.shots[0].target_id = 'changed';
    data.trajectory_segments[0].samples[0].x = 999;
    data.trajectory_segments[0].derived_metrics!.path_distance = 999;
    assert.deepEqual(collector.getRoundExport(), expected);
  });

  it('keeps a saved snapshot intact across restart and excludes previous-round records', (t) => {
    const previous = completeRound(t, collector);
    const saved = serializeRoundExport(previous);
    collector.startRound('round_next', 'thirty_shot');
    assert.equal(collector.getRoundExport(), null);
    collector.endRound();
    const next = collector.getRoundExport()!;
    assert.equal(next.round.round_id, 'round_next');
    assert.deepEqual(next.shots, []);
    assert.deepEqual(next.targets, []);
    assert.deepEqual(next.trajectory_segments, []);
    assert.equal(serializeRoundExport(previous), saved);
  });

  it('serializes nulls and optional fields consistently and preserves empty rounds in every mode', (t) => {
    const json = JSON.parse(serializeRoundExport(completeRound(t, collector)));
    assert.equal(json.shots[0].precision, 0);
    assert.equal(json.shots[1].target_id, null);
    assert.equal(json.shots[1].target_x, null);
    assert.equal(json.trajectory_segments[1].derived_metrics.average_velocity, null);
    assert.equal('destroy_time' in json.targets[1], false);
    assert.equal('end_time' in json.session, false);
    for (const mode of ['six_shot', 'moving_targets', 'thirty_shot']) {
      collector.startRound(`empty_${mode}`, mode);
      collector.endRound();
      const empty = JSON.parse(serializeRoundExport(collector.getRoundExport()!));
      assert.equal(empty.round.mode, mode);
      assert.equal(empty.round.shots_fired, 0);
      assert.equal(empty.round.average_precision, 0);
      assert.deepEqual(empty.shots, []);
    }
  });

  it('rejects non-finite numbers instead of silently converting them to null', (t) => {
    const data = completeRound(t, collector);
    data.trajectory_segments[0].samples[0].x = Infinity;
    assert.throws(() => serializeRoundExport(data), /non-finite/);
    data.trajectory_segments[0].samples[0].x = NaN;
    assert.throws(() => serializeRoundExport(data), /non-finite/);
  });

  it('downloads parseable JSON with a round-specific filename and releases browser resources', async (t) => {
    const data = completeRound(t, collector);
    const browser = mockDownloadBrowser(t);
    downloadRoundJson(data);
    assert.equal(browser.anchor.download, 'adaptiveaim_moving_targets_round_export.json');
    assert.equal(browser.anchor.href, 'blob:round-export-test');
    assert.equal(browser.click.mock.callCount(), 1);
    assert.equal(browser.append.mock.callCount(), 1);
    assert.equal(browser.remove.mock.callCount(), 1);
    const blob = browser.blob();
    assert.ok(blob);
    assert.equal(blob.type, 'application/json;charset=utf-8');
    assert.deepEqual(JSON.parse(await blob.text()), JSON.parse(serializeRoundExport(data)));
    assert.equal(browser.revoke.mock.callCount(), 0);
    t.mock.timers.tick(1000);
    assert.equal(browser.revoke.mock.callCount(), 1);
    assert.deepEqual(browser.revoke.mock.calls[0].arguments, ['blob:round-export-test']);
    assert.match(getRoundExportFilename({ ...data, round: { ...data.round, mode: 'a/b: c' } }), /^adaptiveaim_a_b__c_round_export\.json$/);
  });

  it('removes the anchor and releases its URL even if the browser download throws', (t) => {
    const data = completeRound(t, collector);
    const browser = mockDownloadBrowser(t);
    browser.click.mock.mockImplementation(() => { throw new Error('Download blocked'); });
    assert.throws(() => downloadRoundJson(data), /Download blocked/);
    assert.equal(browser.remove.mock.callCount(), 1);
    t.mock.timers.tick(1000);
    assert.equal(browser.revoke.mock.callCount(), 1);
  });
});
