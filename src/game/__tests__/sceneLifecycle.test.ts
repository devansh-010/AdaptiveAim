import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { telemetryCollector } from '../../telemetry/TelemetryCollector.ts';
import type { TargetManager } from '../systems/TargetManager.ts';
import type { TrajectorySampler } from '../systems/TrajectorySampler.ts';
import type { RoundExport } from '../../telemetry/types.ts';
import { attachSceneHarness, loadGameScenes, sceneValue } from './helpers/sceneHarness.ts';

const { SixShotScene, MovingTargetsScene, ThirtyShotScene } = await loadGameScenes();

describe('Gameplay scene integration', () => {
  for (const Scene of [SixShotScene, MovingTargetsScene, ThirtyShotScene]) {
    it(`downloads ${Scene.name} results without restarting, shooting, or recapturing the mouse`, async (t) => {
      const scene = new Scene();
      const harness = attachSceneHarness(scene, t);
      let blob: Blob | undefined;
      t.mock.method(URL, 'createObjectURL', (value: Blob) => { blob = value; return 'blob:scene-export'; });
      const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
      harness.start();
      const manager = sceneValue<TargetManager>(scene, 'targetManager');
      const hitCount = Scene === ThirtyShotScene ? 30 : 1;
      for (let i = 0; i < hitCount; i++) {
        const target = manager.getActiveTargets()[0];
        target.x = 450;
        target.y = 300;
        harness.click();
      }
      if (Scene !== ThirtyShotScene) scene.update(30000, 30000);
      const round = telemetryCollector.getCurrentRound()!;
      const button = sceneValue<{ getBounds(): { centerX: number; centerY: number } }>(scene, 'roundExportButton');
      const bounds = button.getBounds();
      harness.click(bounds.centerX, bounds.centerY);
      assert.equal(sceneValue<string>(scene, 'roundState'), 'results');
      assert.equal(harness.document.pointerLockElement, null);
      assert.deepEqual(telemetryCollector.getCurrentRound(), round);
      assert.equal(harness.downloads.length, 1);
      assert.ok(harness.downloads[0].filename.includes(round.round_id));
      assert.ok(blob);
      const exported: RoundExport = JSON.parse(await blob.text());
      assert.equal(exported.round.round_id, round.round_id);
      assert.equal(exported.shots.length, hitCount);
      assert.equal(exported.trajectory_segments.filter(s => s.shot_id !== null).length, hitCount);
      t.mock.timers.tick(1000);
      assert.equal(revoke.mock.callCount(), 1);
      harness.click();
      assert.equal(sceneValue<string>(scene, 'roundState'), 'playing');
      assert.notEqual(telemetryCollector.getCurrentRound()?.round_id, exported.round.round_id);
      assert.equal(telemetryCollector.getRoundExport(), null);
      assert.equal(exported.shots.length, hitCount);
    });
  }

  it('keeps results available for retry when a download fails', (t) => {
    const scene = new SixShotScene();
    const harness = attachSceneHarness(scene, t);
    t.mock.method(URL, 'createObjectURL', () => { throw new Error('Download unavailable'); });
    t.mock.method(console, 'warn', () => {});
    harness.start();
    scene.update(30000, 30000);
    const button = sceneValue<{ text: string; getBounds(): { centerX: number; centerY: number } }>(scene, 'roundExportButton');
    const bounds = button.getBounds();
    harness.click(bounds.centerX, bounds.centerY);
    assert.equal(sceneValue<string>(scene, 'roundState'), 'results');
    assert.equal(button.text, 'DOWNLOAD FAILED - TRY AGAIN');
    assert.equal(harness.downloads.length, 0);
    assert.ok(telemetryCollector.getRoundExport());
  });

  it('cleans up an active round on direct destruction, as used when exiting React', (t) => {
    const scene = new MovingTargetsScene();
    const harness = attachSceneHarness(scene, t);
    harness.start();
    harness.move(7, -3);
    const sampler = sceneValue<TrajectorySampler>(scene, 'trajectorySampler');
    const renderer = sceneValue<object>(scene, 'environmentRenderer');
    harness.events.emit('destroy');

    assert.equal(harness.documentEvents.listenerCount('pointerlockchange'), 0);
    assert.equal(harness.documentEvents.listenerCount('mozpointerlockchange'), 0);
    assert.equal(harness.scale.listenerCount('resize'), 0);
    assert.equal(harness.input.listenerCount('pointerdown'), 0);
    assert.equal(harness.input.listenerCount('pointermove'), 0);
    assert.equal(sampler.isActive(), false);
    assert.equal(Reflect.get(renderer, 'container'), null);
    assert.equal(harness.document.pointerLockElement, null);
    assert.ok(telemetryCollector.getCurrentRound()?.end_time);
    const segments = telemetryCollector.getRecordedTrajectorySegments();
    assert.equal(segments.at(-1)?.shot_id, null);
    assert.equal(segments.at(-1)?.samples.at(-1)?.movement_x, 7);
    t.mock.timers.tick(64);
    assert.equal(sampler.getPendingSamples().length, 0);
  });

  it('removes global resize listeners on shutdown and can be created again cleanly', (t) => {
    const scene = new MovingTargetsScene();
    const harness = attachSceneHarness(scene, t);
    harness.start();
    harness.events.emit('shutdown');
    assert.equal(harness.scale.listenerCount('resize'), 0);
    assert.equal(harness.events.listenerCount('destroy'), 0);
    scene.create();
    assert.equal(harness.scale.listenerCount('resize'), 1);
    assert.equal(harness.documentEvents.listenerCount('pointerlockchange'), 1);
    assert.equal(harness.input.listenerCount('pointerdown'), 1);
  });

  it('records inter-tick hit and miss boundaries through the actual pointer handlers', (t) => {
    const scene = new MovingTargetsScene();
    const harness = attachSceneHarness(scene, t);
    harness.start();
    const manager = sceneValue<TargetManager>(scene, 'targetManager');
    const target = manager.getActiveTargets()[0];
    target.x = 457;
    target.y = 297;
    harness.move(7, -3);
    harness.click();
    assert.equal(scene.getLastShotResult(), 'HIT');
    const [hit] = telemetryCollector.getRecordedTrajectorySegments();
    assert.equal(hit.target_id, target.targetId);
    assert.equal(hit.samples.at(-1)?.movement_x, 7);
    assert.equal(hit.samples.at(-1)?.x, 457);
    assert.equal(manager.getActiveCount(), 4);

    for (const active of manager.getActiveTargets()) { active.x = 100; active.y = 150; }
    harness.click();
    const miss = telemetryCollector.getRecordedTrajectorySegments().at(-1)!;
    assert.equal(scene.getLastShotResult(), 'MISS');
    assert.equal(miss.target_id, null);
    assert.equal(miss.samples.at(-1)?.movement_x, 0);
    assert.notEqual(miss.shot_id, hit.shot_id);
  });

  it('reacquires pointer lock without counting the reacquisition click as a shot', (t) => {
    const scene = new MovingTargetsScene();
    const harness = attachSceneHarness(scene, t);
    harness.start();
    harness.move(10, 5);
    harness.document.exitPointerLock();
    const sampler = sceneValue<TrajectorySampler>(scene, 'trajectorySampler');
    assert.deepEqual(sampler.getAccumulatedMovement(), { x: 0, y: 0 });
    harness.move(100, 100);
    harness.click();
    assert.equal(telemetryCollector.getCurrentRound()?.shots_fired, 0);
    assert.equal(sceneValue<number>(scene, 'aimOffsetX'), 10);
    assert.equal(sceneValue<number>(scene, 'aimOffsetY'), 5);
  });

  it('keeps moving targets visible immediately after resizing with a large aim offset', (t) => {
    const scene = new MovingTargetsScene();
    const harness = attachSceneHarness(scene, t);
    harness.start();
    harness.move(700, 600);
    harness.resize(320, 240);
    const manager = sceneValue<TargetManager>(scene, 'targetManager');
    assert.ok(Math.abs(sceneValue<number>(scene, 'aimOffsetX')) <= 256);
    for (const target of manager.getActiveTargets()) {
      assert.equal(manager.validateTarget(target).isRenderedVisible, true);
    }
  });

  it('validates the real Thirty Shot completion and restart paths', (t) => {
    const scene = new ThirtyShotScene();
    const harness = attachSceneHarness(scene, t);
    harness.start();
    const manager = sceneValue<TargetManager>(scene, 'targetManager');
    scene.update(1000, 1200);
    assert.equal(sceneValue<{ text: string }>(scene, 'hudTimeText').text, '1.2s');
    for (let i = 0; i < 30; i++) {
      assert.equal(manager.getActiveCount(), 1);
      const target = manager.getActiveTargets()[0];
      assert.equal(target.movementEnabled, false);
      target.x = 450;
      target.y = 300;
      harness.click();
    }
    assert.equal(manager.getActiveCount(), 0);
    assert.equal(telemetryCollector.getCurrentRound()?.hits, 30);
    assert.equal(telemetryCollector.getRecordedTrajectorySegments().filter(s => s.shot_id !== null).length, 30);
    assert.equal(sceneValue<string>(scene, 'roundState'), 'results');
    harness.click();
    assert.equal(manager.getActiveCount(), 1);
    assert.equal(telemetryCollector.getCurrentRound()?.hits, 0);
    assert.equal(telemetryCollector.getRecordedTrajectorySegments().length, 0);
    assert.equal(sceneValue<number>(scene, 'elapsedTime'), 0);
  });

  it('retains the Six Shot target count and timed round behavior', (t) => {
    const scene = new SixShotScene();
    const harness = attachSceneHarness(scene, t);
    harness.start();
    const manager = sceneValue<TargetManager>(scene, 'targetManager');
    assert.equal(manager.getActiveCount(), 6);
    assert.equal(manager.getActiveTargets().some(target => target.movementEnabled), false);
    scene.update(30000, 30000);
    assert.equal(sceneValue<string>(scene, 'roundState'), 'results');
    assert.equal(telemetryCollector.getCurrentRound()?.mode, 'six_shot');
  });
});
