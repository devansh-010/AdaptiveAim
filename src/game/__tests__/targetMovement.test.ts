import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Target, type TargetBounds } from '../entities/Target.ts';
import { TargetManager } from '../systems/TargetManager.ts';

const testBounds: TargetBounds = {
  minX: 50,
  maxX: 850,
  minY: 50,
  maxY: 550,
};

describe('Moving Target Mechanics and Boundary Validation', () => {
  it('keeps the full moving target clear of the HUD and weapon overlays', () => {
    const manager = new TargetManager(900, 600, 1, 22, 40, 65, 50, true, 160);
    const target = manager.createTarget('round_overlay');
    for (const [x, y, dx, dy] of [[450, 130, 0, -1], [610, 420, 1, 0]]) {
      target.x = x;
      target.y = y;
      target.directionX = dx;
      target.directionY = dy;
      manager.update(0.25);
      assert.equal(manager.isObstructed(target.x, target.y), false);
      assert.equal(manager.validateTarget(target).isRenderedVisible, true);
    }
  });

  it('resynchronizes active moving targets immediately when the viewport shrinks', () => {
    const manager = new TargetManager(900, 600, 1, 22, 40, 65, 50, true, 160);
    const target = manager.createTarget('round_resize');
    target.x = 800;
    target.y = 500;
    manager.updateSpawnArea(320, 240);
    assert.equal(manager.validateTarget(target).isRenderedVisible, true);
  });

  it('clears overlay obstructions introduced by a camera aim change', () => {
    const manager = new TargetManager(900, 600, 1, 22, 40, 65, 50, true, 160);
    const target = manager.createTarget('round_camera');
    target.x = 450;
    target.y = 130;
    manager.setAimOffset(0, 50);
    assert.equal(manager.isObstructed(target.x, target.y - 50), false);
  });

  it('1. should advance position according to speed and direction over elapsed time', () => {
    // Start at (100, 100), moving East (1, 0) at 200 px/s for 0.5s -> expected (200, 100)
    const target = new Target(
      'target_m1',
      'round_m1',
      100,
      100,
      22,
      '2026-10-15T10:00:00.000Z',
      true, // movementEnabled
      200,  // movementSpeed
      1,    // directionX
      0     // directionY
    );

    target.update(0.5, testBounds);

    assert.equal(target.x, 200);
    assert.equal(target.y, 100);
    assert.equal(target.spawnX, 100);
    assert.equal(target.spawnY, 100);
  });

  it('2. should not move when movement is disabled (Six Shot mode invariant)', () => {
    const stationaryTarget = new Target(
      'target_s1',
      'round_s1',
      300,
      300,
      22,
      '2026-10-15T10:00:00.000Z',
      false, // movementEnabled = false
      0,
      0,
      0
    );

    stationaryTarget.update(1.0, testBounds);

    assert.equal(stationaryTarget.x, 300);
    assert.equal(stationaryTarget.y, 300);
  });

  it('3. should bounce off right boundary and reflect directionX negatively', () => {
    // Start at 840, moving East (+1) at 100 px/s for 0.2s -> 860 > maxX (850)
    const target = new Target(
      'target_bounce_r',
      'round_b1',
      840,
      300,
      22,
      '2026-10-15T10:00:00.000Z',
      true,
      100,
      1,
      0
    );

    target.update(0.2, testBounds);

    assert.equal(target.x, 850);
    assert.ok(target.directionX < 0, 'directionX should be reversed to negative');
    assert.equal(target.directionX, -1);
  });

  it('4. should bounce off left boundary and reflect directionX positively', () => {
    // Start at 60, moving West (-1) at 100 px/s for 0.2s -> 40 < minX (50)
    const target = new Target(
      'target_bounce_l',
      'round_b2',
      60,
      300,
      22,
      '2026-10-15T10:00:00.000Z',
      true,
      100,
      -1,
      0
    );

    target.update(0.2, testBounds);

    assert.equal(target.x, 50);
    assert.ok(target.directionX > 0, 'directionX should be reversed to positive');
    assert.equal(target.directionX, 1);
  });

  it('5. should bounce off bottom boundary and reflect directionY negatively', () => {
    // Start at 540, moving South (+1) at 100 px/s for 0.2s -> 560 > maxY (550)
    const target = new Target(
      'target_bounce_b',
      'round_b3',
      400,
      540,
      22,
      '2026-10-15T10:00:00.000Z',
      true,
      100,
      0,
      1
    );

    target.update(0.2, testBounds);

    assert.equal(target.y, 550);
    assert.ok(target.directionY < 0, 'directionY should be reversed to negative');
    assert.equal(target.directionY, -1);
  });

  it('6. should bounce off top boundary and reflect directionY positively', () => {
    // Start at 60, moving North (-1) at 100 px/s for 0.2s -> 40 < minY (50)
    const target = new Target(
      'target_bounce_t',
      'round_b4',
      400,
      60,
      22,
      '2026-10-15T10:00:00.000Z',
      true,
      100,
      0,
      -1
    );

    target.update(0.2, testBounds);

    assert.equal(target.y, 50);
    assert.ok(target.directionY > 0, 'directionY should be reversed to positive');
    assert.equal(target.directionY, 1);
  });

  it('7. should accurately update hit detection as target moves across the viewport', () => {
    const target = new Target(
      'target_hit_m',
      'round_h1',
      200,
      200,
      22,
      '2026-10-15T10:00:00.000Z',
      true,
      100,
      1,
      0
    );

    // Initial position (200, 200) -> hit at (200, 200) is true
    assert.equal(target.isHit(200, 200), true);
    // Point (250, 200) is outside 22px radius initially
    assert.equal(target.isHit(250, 200), false);

    // Advance 0.5s -> moves 50px East to (250, 200)
    target.update(0.5, testBounds);
    assert.equal(target.x, 250);
    assert.equal(target.y, 200);

    // Now (250, 200) is a direct bullseye hit!
    assert.equal(target.isHit(250, 200), true);
    // And previous (200, 200) is now a miss
    assert.equal(target.isHit(200, 200), false);
  });

  it('8. should freeze movement when target is destroyed', () => {
    const target = new Target(
      'target_dest',
      'round_d1',
      100,
      100,
      22,
      '2026-10-15T10:00:00.000Z',
      true,
      100,
      1,
      0
    );

    target.destroy();
    target.update(1.0, testBounds);

    // Position must not have changed because target is destroyed
    assert.equal(target.x, 100);
    assert.equal(target.y, 100);
  });

  it('9. should produce accurate movement telemetry metadata', () => {
    const target = new Target(
      'target_telemetry_test',
      'round_t1',
      150,
      250,
      22,
      '2026-10-15T10:00:00.000Z',
      true,
      160,
      0.6,
      0.8
    );

    target.update(0.25, testBounds); // Moves 40px along vector

    const tel = target.toTelemetry();
    assert.equal(tel.target_id, 'target_telemetry_test');
    assert.equal(tel.spawn_x, 150);
    assert.equal(tel.spawn_y, 250);
    assert.equal(tel.movement_enabled, true);
    assert.equal(tel.movement_speed, 160);
    assert.equal(tel.direction_x, 0.6);
    assert.equal(tel.direction_y, 0.8);
    assert.equal(tel.target_size, 22);
  });

  it('10. TargetManager should properly spawn, configure, and advance moving targets', () => {
    const manager = new TargetManager(
      900,
      600,
      4,   // 4 moving targets
      22,  // radius
      40,  // margin
      65,  // separation
      50,  // retry limit
      true, // movementEnabled
      160  // movementSpeed
    );

    assert.equal(manager.isMovementEnabled(), true);
    assert.equal(manager.getMovementSpeed(), 160);
    assert.equal(manager.getMaxActiveTargets(), 4);

    const targets = manager.spawnInitialTargets('round_tm_1');
    assert.equal(targets.length, 4);

    for (const t of targets) {
      assert.equal(t.movementEnabled, true);
      assert.equal(t.movementSpeed, 160);
      assert.ok(t.directionX !== 0 || t.directionY !== 0);
    }

    const initialPositions = targets.map((t) => ({ x: t.x, y: t.y }));

    // Advance 0.5 seconds
    manager.update(0.5);

    // Verify all targets moved
    for (let i = 0; i < targets.length; i++) {
      const moved = targets[i].x !== initialPositions[i].x || targets[i].y !== initialPositions[i].y;
      assert.ok(moved, `Target ${i} should have moved after update()`);
    }
  });
});
