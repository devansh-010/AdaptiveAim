import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TargetManager } from '../systems/TargetManager.ts';
import { ThirtyShotChallenge } from '../systems/ThirtyShotChallenge.ts';
import { TelemetryCollector } from '../../telemetry/TelemetryCollector.ts';
import {
  GAME_CONFIG,
  DEFAULT_MAX_AIM_DISTANCE,
  SIX_SHOT_TARGET_COUNT,
  MOVING_TARGETS_TARGET_COUNT,
  THIRTY_SHOT_TARGET_GOAL,
} from '../config/gameConfig.ts';

describe('Target Spawn Visibility and Aiming Range Invariant Validation', () => {
  // Test 1: Spawn positions and complete target radius remain strictly inside visible safe bounds.
  it('1. should keep spawn positions and full target radius strictly inside visible safe bounds', () => {
    const width = 900;
    const height = 600;
    const margin = 40;
    const radius = 22;
    const manager = new TargetManager(width, height, 1, radius, margin);

    const bounds = manager.getSpawnArea();
    assert.equal(bounds.minX, margin + radius); // 62
    assert.equal(bounds.maxX, width - (margin + radius)); // 838
    assert.equal(bounds.minY, margin + radius); // 62
    assert.equal(bounds.maxY, height - (margin + radius)); // 538

    for (let i = 0; i < 30; i++) {
      const pos = manager.generateValidSpawnPosition();
      assert.ok(pos.x >= bounds.minX, `x (${pos.x}) must be >= minX (${bounds.minX})`);
      assert.ok(pos.x <= bounds.maxX, `x (${pos.x}) must be <= maxX (${bounds.maxX})`);
      assert.ok(pos.y >= bounds.minY, `y (${pos.y}) must be >= minY (${bounds.minY})`);
      assert.ok(pos.y <= bounds.maxY, `y (${pos.y}) must be <= maxY (${bounds.maxY})`);

      const leftEdge = pos.x - radius;
      const rightEdge = pos.x + radius;
      const topEdge = pos.y - radius;
      const bottomEdge = pos.y + radius;

      assert.ok(leftEdge >= margin, `Left edge (${leftEdge}) must be >= margin (${margin})`);
      assert.ok(rightEdge <= width - margin, `Right edge (${rightEdge}) must be <= ${width - margin}`);
      assert.ok(topEdge >= margin, `Top edge (${topEdge}) must be >= margin (${margin})`);
      assert.ok(bottomEdge <= height - margin, `Bottom edge (${bottomEdge}) must be <= ${height - margin}`);
    }
  });

  // Test 2: Large positive and negative aim offsets keep rendered positions visible and reachable.
  it('2. should maintain visibility and crosshair reachability under large positive and negative aim offsets', () => {
    const width = 900;
    const height = 600;
    const radius = 22;
    const margin = 40;
    const manager = new TargetManager(width, height, 1, radius, margin);
    const maxOffset = manager.getMaxAimOffset(); // 720 for 900x600

    const testOffsets = [
      { x: 500, y: 300 },
      { x: -500, y: -300 },
      { x: 700, y: 0 },
      { x: -700, y: 0 },
      { x: 0, y: 450 },
      { x: 0, y: -450 },
      { x: maxOffset, y: maxOffset * 0.5 },
      { x: -maxOffset, y: -maxOffset * 0.5 },
    ];

    for (const offset of testOffsets) {
      manager.setAimOffset(offset.x, offset.y);

      for (let i = 0; i < 15; i++) {
        const target = manager.createTarget(`round_offset_${offset.x}_${offset.y}`);
        const validation = manager.validateTarget(target);

        // 1. Rendered position must be completely visible inside canvas
        assert.ok(
          validation.isRenderedVisible,
          `Target must be visible on screen at offset (${offset.x}, ${offset.y}): rendered=(${validation.renderedX}, ${validation.renderedY})`
        );
        assert.ok(
          validation.renderedX - radius >= 0,
          `Rendered left edge (${validation.renderedX - radius}) must be >= 0`
        );
        assert.ok(
          validation.renderedX + radius <= width,
          `Rendered right edge (${validation.renderedX + radius}) must be <= ${width}`
        );
        assert.ok(
          validation.renderedY - radius >= 0,
          `Rendered top edge (${validation.renderedY - radius}) must be >= 0`
        );
        assert.ok(
          validation.renderedY + radius <= height,
          `Rendered bottom edge (${validation.renderedY + radius}) must be <= ${height}`
        );

        // 2. Crosshair must be able to reach the target within its maxAimOffset clamp
        assert.ok(
          validation.isReachable,
          `Target at (${target.x}, ${target.y}) must be reachable by crosshair with maxOffset=${maxOffset}`
        );

        manager.destroyTarget(target.targetId);
      }
    }
  });

  // Test 3: Aiming directly at the rendered target center registers a successful hit.
  it('3. should register a successful hit when aiming at the rendered target center', () => {
    const width = 900;
    const height = 600;
    const manager = new TargetManager(width, height, 1, 22, 40);
    const centerX = width / 2;
    const centerY = height / 2;

    const testOffsets = [
      { x: 0, y: 0 },
      { x: 250, y: -150 },
      { x: -400, y: 200 },
      { x: 600, y: -400 },
    ];

    for (const offset of testOffsets) {
      manager.setAimOffset(offset.x, offset.y);
      const target = manager.createTarget('round_hit_test');

      // The player aims by moving the crosshair to the target's rendered center.
      // This sets the aiming offset to: target.x - centerX, target.y - centerY.
      const requiredAimOffsetX = target.x - centerX;
      const requiredAimOffsetY = target.y - centerY;

      // When the shot is fired at screen center with this aim offset, world crosshair is:
      const worldShotX = centerX + requiredAimOffsetX;
      const worldShotY = centerY + requiredAimOffsetY;

      // Verify that worldShot exactly matches target position
      assert.equal(worldShotX, target.x);
      assert.equal(worldShotY, target.y);

      // Verify hit detection succeeds
      const hitTarget = manager.checkHit(worldShotX, worldShotY);
      assert.ok(hitTarget !== null, 'Hit detection must return a valid Target entity');
      assert.equal(hitTarget?.targetId, target.targetId);

      manager.destroyTarget(target.targetId);
    }
  });

  // Test 4: Satisfies configured crosshair maxAimDistance constraint when feasible.
  it('4. should satisfy configured crosshair maxAimDistance constraint when feasible', () => {
    const width = 900;
    const height = 600;
    const maxAimDistance = 250;
    const manager = new TargetManager(width, height, 1, 22, 40, 65, 50, false, 0, maxAimDistance);
    const centerX = width / 2;
    const centerY = height / 2;

    for (let i = 0; i < 25; i++) {
      const pos = manager.generateValidSpawnPosition();
      const distFromCrosshair = Math.hypot(pos.x - centerX, pos.y - centerY);

      assert.ok(
        distFromCrosshair <= maxAimDistance + 2,
        `Distance (${distFromCrosshair.toFixed(1)}) should be <= maxAimDistance (${maxAimDistance})`
      );
    }
  });

  // Test 5: Replacement targets after substantial mouse movements do not drift outside playable canvas.
  it('5. should spawn replacement targets that remain visible and reachable after substantial mouse movements', () => {
    const manager = new TargetManager(900, 600, 1, 22, 40, 65, 50, false, 0, DEFAULT_MAX_AIM_DISTANCE);
    const roundId = 'round_drift_prevention';

    // Spawn target 1 at center
    manager.setAimOffset(0, 0);
    const t1 = manager.createTarget(roundId);
    assert.equal(manager.getActiveCount(), 1);

    // Player aims far right (+450px) to hit t1
    manager.setAimOffset(450, 0);
    manager.destroyTarget(t1.targetId);

    // Replacement target 2 spawns
    const replacements1 = manager.maintainTargetCount(roundId);
    assert.equal(replacements1.length, 1);
    const t2 = replacements1[0];

    const v2 = manager.validateTarget(t2);
    assert.ok(v2.isRenderedVisible, `Target 2 must be rendered on screen at aimOffset=(450, 0)`);
    assert.ok(v2.isReachable, `Target 2 must be reachable by crosshair`);

    // Player now aims far down-left (-400, +350) to hit t2
    manager.setAimOffset(-400, 350);
    manager.destroyTarget(t2.targetId);

    // Replacement target 3 spawns
    const replacements2 = manager.maintainTargetCount(roundId);
    assert.equal(replacements2.length, 1);
    const t3 = replacements2[0];

    const v3 = manager.validateTarget(t3);
    assert.ok(v3.isRenderedVisible, `Target 3 must be rendered on screen at aimOffset=(-400, 350)`);
    assert.ok(v3.isReachable, `Target 3 must be reachable by crosshair`);

    // Player recenters aim to (0, 0)
    manager.setAimOffset(0, 0);
    const v3Recentered = manager.validateTarget(t3);
    assert.ok(v3Recentered.isReachable, `Target 3 must still be reachable when aim is recentered`);
  });

  // Test 6: Moving targets remain within visible movement bounds under small and large delta values.
  it('6. should ensure moving targets bounce within visible bounds under small and large delta values', () => {
    const width = 900;
    const height = 600;
    const radius = 22;
    const margin = 40;
    const speed = 200; // px/s
    const manager = new TargetManager(width, height, 1, radius, margin, 65, 50, true, speed);

    const testDeltas = [0.016, 0.033, 0.5, 2.0, 5.0]; // 60Hz, 30Hz, half-second, 2s lag, 5s lag
    const testOffsets = [
      { x: 0, y: 0 },
      { x: 300, y: -200 },
      { x: -450, y: 150 },
    ];

    for (const offset of testOffsets) {
      manager.setAimOffset(offset.x, offset.y);
      const target = manager.createTarget('round_move_test');

      for (const dt of testDeltas) {
        manager.update(dt);

        const renderedX = target.x - offset.x;
        const renderedY = target.y - offset.y;

        const bounds = manager.getSpawnArea();
        assert.ok(
          renderedX >= bounds.minX - 0.001,
          `Rendered X (${renderedX}) must be >= minX (${bounds.minX}) for dt=${dt}`
        );
        assert.ok(
          renderedX <= bounds.maxX + 0.001,
          `Rendered X (${renderedX}) must be <= maxX (${bounds.maxX}) for dt=${dt}`
        );
        assert.ok(
          renderedY >= bounds.minY - 0.001,
          `Rendered Y (${renderedY}) must be >= minY (${bounds.minY}) for dt=${dt}`
        );
        assert.ok(
          renderedY <= bounds.maxY + 0.001,
          `Rendered Y (${renderedY}) must be <= maxY (${bounds.maxY}) for dt=${dt}`
        );

        // Entire circle radius stays within canvas
        assert.ok(renderedX - radius >= 0, `Target left edge must be >= 0`);
        assert.ok(renderedX + radius <= width, `Target right edge must be <= ${width}`);
        assert.ok(renderedY - radius >= 0, `Target top edge must be >= 0`);
        assert.ok(renderedY + radius <= height, `Target bottom edge must be <= ${height}`);
      }

      manager.destroyTarget(target.targetId);
    }
  });

  // Test 7: Small viewports and deterministic fallback placement never crash or invert bounds.
  it('7. should safely handle small viewports and deterministic fallback placement', () => {
    // 280x200 viewport
    const smallManager = new TargetManager(280, 200, 1, 22, 40, 65, 0); // retryLimit=0 forces grid fallback
    const smallBounds = smallManager.getSpawnArea();

    assert.ok(smallBounds.minX <= smallBounds.maxX, 'Bounds must not be inverted');
    assert.ok(smallBounds.minY <= smallBounds.maxY, 'Bounds must not be inverted');

    for (let i = 0; i < 15; i++) {
      const pos = smallManager.generateValidSpawnPosition();
      assert.ok(!Number.isNaN(pos.x) && !Number.isNaN(pos.y), 'Position must not be NaN');
      assert.ok(pos.x - 22 >= 0, 'Target left edge must stay inside small viewport');
      assert.ok(pos.x + 22 <= 280, 'Target right edge must stay inside small viewport');
      assert.ok(pos.y - 22 >= 0, 'Target top edge must stay inside small viewport');
      assert.ok(pos.y + 22 <= 200, 'Target bottom edge must stay inside small viewport');
    }

    // Tiny 60x60 viewport (smaller than 2*margin)
    const tinyManager = new TargetManager(60, 60, 1, 22, 40, 65, 0);
    const tinyPos = tinyManager.generateValidSpawnPosition();
    assert.ok(!Number.isNaN(tinyPos.x) && !Number.isNaN(tinyPos.y), 'Tiny pos must not be NaN');
  });

  // Test 8: All three modes retain their exact target counts and gameplay rules.
  it('8. should retain required target counts and gameplay rules across all three modes', () => {
    // 1. Six Shot: 6 stationary targets with separation
    const sixShotManager = new TargetManager(
      900,
      600,
      SIX_SHOT_TARGET_COUNT,
      22,
      40,
      65,
      50,
      false,
      0,
      DEFAULT_MAX_AIM_DISTANCE
    );
    const sixShotTargets = sixShotManager.spawnInitialTargets('round_six_shot');
    assert.equal(sixShotTargets.length, 6);
    assert.equal(sixShotManager.getActiveCount(), 6);
    assert.equal(sixShotManager.isMovementEnabled(), false);

    // Verify minimum separation between all 6 targets
    for (let i = 0; i < sixShotTargets.length; i++) {
      for (let j = i + 1; j < sixShotTargets.length; j++) {
        const dist = Math.hypot(
          sixShotTargets[i].x - sixShotTargets[j].x,
          sixShotTargets[i].y - sixShotTargets[j].y
        );
        assert.ok(dist >= 65, `Six Shot pairwise separation must be >= 65px (got ${dist.toFixed(1)})`);
      }
    }

    // 2. Moving Targets: 4 moving targets
    const movingManager = new TargetManager(
      900,
      600,
      MOVING_TARGETS_TARGET_COUNT, // 4
      22,
      40,
      65,
      50,
      true,
      160,
      DEFAULT_MAX_AIM_DISTANCE
    );
    const movingTargets = movingManager.spawnInitialTargets('round_moving');
    assert.equal(movingTargets.length, 4);
    assert.equal(movingManager.getActiveCount(), 4);
    assert.equal(movingManager.isMovementEnabled(), true);
    assert.equal(movingManager.getMovementSpeed(), 160);

    // 3. Thirty Shot: 1 stationary target progressing sequentially
    const thirtyManager = new TargetManager(
      900,
      600,
      GAME_CONFIG.thirtyShot.targetCount, // 1
      22,
      40,
      65,
      50,
      false,
      0,
      DEFAULT_MAX_AIM_DISTANCE
    );
    const telemetry = new TelemetryCollector('test_telemetry_modes');
    const challenge = new ThirtyShotChallenge(thirtyManager, telemetry, THIRTY_SHOT_TARGET_GOAL);

    challenge.startRound('round_thirty_shot');
    assert.equal(thirtyManager.getActiveCount(), 1);
    assert.equal(thirtyManager.isMovementEnabled(), false);

    // Hit target and verify single-target replacement
    const currentTarget = thirtyManager.getActiveTargets()[0];
    const res = challenge.registerHit(currentTarget.targetId);
    assert.equal(res.hit, true);
    assert.equal(res.hits, 1);
    assert.equal(thirtyManager.getActiveCount(), 1);
    assert.notEqual(res.replacementTarget?.targetId, currentTarget.targetId);
  });

  // Test 9: Telemetry records accurate logical spawn coordinates.
  it('9. should record accurate logical spawn coordinates in telemetry', () => {
    const telemetry = new TelemetryCollector('test_telemetry_spawn_validation');
    const targetManager = new TargetManager(
      900,
      600,
      1,
      22,
      40,
      65,
      50,
      false,
      0,
      DEFAULT_MAX_AIM_DISTANCE,
      telemetry
    );

    telemetry.startRound('round_spawn_telemetry_val', 'six_shot', 'fixed');
    targetManager.setAimOffset(200, -100);

    const target = targetManager.createTarget('round_spawn_telemetry_val');
    const tel = target.toTelemetry();

    assert.equal(tel.spawn_x, target.spawnX);
    assert.equal(tel.spawn_y, target.spawnY);
    assert.equal(target.spawnX, target.x);
    assert.equal(target.spawnY, target.y);

    const round = telemetry.getCurrentRound();
    assert.ok(round);
    assert.equal(round.targets_spawned, 1);
  });
});
