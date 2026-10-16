import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TargetManager } from '../systems/TargetManager.ts';
import { ThirtyShotChallenge } from '../systems/ThirtyShotChallenge.ts';
import { TelemetryCollector } from '../../telemetry/TelemetryCollector.ts';
import {
  GAME_CONFIG,
  SIX_SHOT_TARGET_COUNT,
  SIX_SHOT_DURATION,
  MOVING_TARGETS_TARGET_COUNT,
  MOVING_TARGETS_SPEED,
  MOVING_TARGETS_DURATION,
  THIRTY_SHOT_TARGET_COUNT,
  THIRTY_SHOT_TARGET_GOAL,
} from '../config/gameConfig.ts';

describe('Thirty Shot Challenge Mechanics and Invariant Validation', () => {
  let targetManager: TargetManager;
  let telemetryCollector: TelemetryCollector;
  let challenge: ThirtyShotChallenge;

  beforeEach(() => {
    targetManager = new TargetManager(
      900,
      600,
      GAME_CONFIG.thirtyShot.targetCount, // 1
      GAME_CONFIG.thirtyShot.targetRadius, // 22
      GAME_CONFIG.thirtyShot.spawnMargin, // 40
      GAME_CONFIG.thirtyShot.minTargetSeparation, // 65
      GAME_CONFIG.thirtyShot.spawnRetryLimit, // 50
      false, // movementEnabled = false
      0 // movementSpeed = 0
    );
    telemetryCollector = new TelemetryCollector('test_player_thirty_shot');
    challenge = new ThirtyShotChallenge(targetManager, telemetryCollector, THIRTY_SHOT_TARGET_GOAL);
  });

  // Test 1: Exactly one active target at a time.
  it('1. should spawn and maintain exactly one active target at a time', () => {
    const initialTargets = challenge.startRound('round_test_1');

    assert.equal(initialTargets.length, 1);
    assert.equal(targetManager.getActiveCount(), 1);
    assert.equal(targetManager.getMaxActiveTargets(), 1);

    const activeTarget = targetManager.getActiveTargets()[0];
    assert.ok(activeTarget, 'Active target must exist');
    assert.equal(activeTarget.movementEnabled, false);
    assert.equal(activeTarget.movementSpeed, 0);
  });

  // Test 2: A hit increments progress and spawns the next target.
  it('2. should increment progress and spawn the next target when a target is hit', () => {
    challenge.startRound('round_test_2');

    const firstTarget = targetManager.getActiveTargets()[0];
    const firstTargetId = firstTarget.targetId;

    const hitResult = challenge.registerHit(firstTargetId);

    assert.equal(hitResult.hit, true);
    assert.equal(hitResult.hits, 1);
    assert.equal(challenge.getHits(), 1);
    assert.equal(challenge.getShotsFired(), 1);
    assert.equal(hitResult.isComplete, false);
    assert.ok(hitResult.replacementTarget, 'A replacement target should be returned');

    // Total active targets remains exactly 1
    assert.equal(targetManager.getActiveCount(), 1);

    // The replacement target must have a new ID
    const currentTarget = targetManager.getActiveTargets()[0];
    assert.notEqual(currentTarget.targetId, firstTargetId);
    assert.equal(currentTarget.targetId, hitResult.replacementTarget.targetId);
  });

  // Test 3: A miss does not increment progress.
  it('3. should not increment progress or spawn a target on a miss', () => {
    challenge.startRound('round_test_3');

    const activeTarget = targetManager.getActiveTargets()[0];
    const initialTargetId = activeTarget.targetId;

    const missResult = challenge.registerMiss(100, 100);

    assert.equal(missResult.hit, false);
    assert.equal(missResult.hits, 0);
    assert.equal(missResult.misses, 1);
    assert.equal(missResult.shotsFired, 1);
    assert.equal(challenge.getHits(), 0);
    assert.equal(challenge.getMisses(), 1);
    assert.equal(challenge.getShotsFired(), 1);
    assert.equal(missResult.isComplete, false);
    assert.equal(missResult.replacementTarget, null);

    // The active target must be completely unchanged
    assert.equal(targetManager.getActiveCount(), 1);
    assert.equal(targetManager.getActiveTargets()[0].targetId, initialTargetId);
  });

  // Test 4: The round ends exactly on the 30th successful hit.
  it('4. should end the round exactly on the 30th successful hit', () => {
    challenge.startRound('round_test_4');

    // Perform 29 successful hits
    for (let i = 1; i <= 29; i++) {
      const currentTarget = targetManager.getActiveTargets()[0];
      const res = challenge.registerHit(currentTarget.targetId);

      assert.equal(res.hits, i);
      assert.equal(res.isComplete, false);
      assert.equal(challenge.isComplete(), false);
      assert.equal(targetManager.getActiveCount(), 1);
    }

    assert.equal(challenge.getHits(), 29);
    assert.equal(challenge.isComplete(), false);

    // 30th hit
    const target30 = targetManager.getActiveTargets()[0];
    const finalResult = challenge.registerHit(target30.targetId);

    assert.equal(finalResult.hits, 30);
    assert.equal(finalResult.isComplete, true);
    assert.equal(challenge.isComplete(), true);
  });

  // Test 5: No additional targets spawn after completion.
  it('5. should not spawn any additional targets after completion', () => {
    challenge.startRound('round_test_5');

    // Perform all 30 hits
    for (let i = 0; i < 30; i++) {
      const target = targetManager.getActiveTargets()[0];
      challenge.registerHit(target.targetId);
    }

    assert.equal(challenge.isComplete(), true);
    // Active targets pool must now be empty
    assert.equal(targetManager.getActiveCount(), 0);

    // Attempting further shots after completion should not spawn targets or advance hits
    const extraShot = challenge.registerHit('non_existent_target');
    assert.equal(extraShot.hit, false);
    assert.equal(challenge.getHits(), 30);
    assert.equal(targetManager.getActiveCount(), 0);

    const extraMiss = challenge.registerMiss(200, 200);
    assert.equal(extraMiss.hit, false);
    assert.equal(challenge.getHits(), 30);
    assert.equal(targetManager.getActiveCount(), 0);
  });

  // Test 6: Restart resets progress, targets, and round telemetry.
  it('6. should cleanly reset progress, targets, and round telemetry on restart', () => {
    challenge.startRound('round_run_1');

    // Land 5 hits and 2 misses
    for (let i = 0; i < 5; i++) {
      const target = targetManager.getActiveTargets()[0];
      challenge.registerHit(target.targetId);
    }
    challenge.registerMiss(50, 50);
    challenge.registerMiss(60, 60);

    assert.equal(challenge.getHits(), 5);
    assert.equal(challenge.getMisses(), 2);
    assert.equal(challenge.getShotsFired(), 7);

    // Restart with new round
    challenge.startRound('round_run_2');

    assert.equal(challenge.getHits(), 0);
    assert.equal(challenge.getMisses(), 0);
    assert.equal(challenge.getShotsFired(), 0);
    assert.equal(challenge.getElapsedTime(), 0);
    assert.equal(challenge.isComplete(), false);
    assert.equal(targetManager.getActiveCount(), 1);

    const currentTelemetryRound = telemetryCollector.getCurrentRound();
    assert.ok(currentTelemetryRound);
    assert.equal(currentTelemetryRound.round_id, 'round_run_2');
    assert.equal(currentTelemetryRound.hits, 0);
    assert.equal(currentTelemetryRound.misses, 0);
    assert.equal(currentTelemetryRound.shots_fired, 0);
  });

  // Test 7: Mode-specific telemetry remains correct.
  it('7. should record and finalize accurate mode-specific telemetry', () => {
    challenge.startRound('round_telemetry_test');

    // Simulate 30 hits with 10 misses interspersed
    for (let i = 0; i < 30; i++) {
      if (i % 3 === 0) {
        challenge.registerMiss(0, 0);
      }
      const target = targetManager.getActiveTargets()[0];
      challenge.registerHit(target.targetId);
    }

    assert.equal(challenge.isComplete(), true);
    assert.equal(challenge.getHits(), 30);
    assert.equal(challenge.getMisses(), 10);
    assert.equal(challenge.getShotsFired(), 40);

    const roundTel = telemetryCollector.getCurrentRound();
    assert.ok(roundTel);
    assert.equal(roundTel.mode, 'thirty_shot');
    assert.equal(roundTel.difficulty, 'fixed');
    assert.equal(roundTel.hits, 30);
    assert.equal(roundTel.misses, 10);
    assert.equal(roundTel.shots_fired, 40);
    // Accuracy: (30 / 40) * 100 = 75.0%
    assert.equal(roundTel.accuracy, 75);
    assert.ok(roundTel.end_time, 'Round should have an end timestamp');
  });

  // Test 8: Six Shot and Moving Targets configurations remain unchanged.
  it('8. should ensure Six Shot and Moving Targets configurations remain unchanged', () => {
    // Six Shot invariants
    assert.equal(SIX_SHOT_TARGET_COUNT, 6);
    assert.equal(SIX_SHOT_DURATION, 30);
    assert.equal(GAME_CONFIG.sixShot.targetCount, 6);
    assert.equal(GAME_CONFIG.sixShot.durationSeconds, 30);
    assert.equal(GAME_CONFIG.sixShot.targetRadius, 22);

    // Moving Targets invariants
    assert.equal(MOVING_TARGETS_TARGET_COUNT, 4);
    assert.equal(MOVING_TARGETS_SPEED, 160);
    assert.equal(MOVING_TARGETS_DURATION, 30);
    assert.equal(GAME_CONFIG.movingTargets.targetCount, 4);
    assert.equal(GAME_CONFIG.movingTargets.movementSpeed, 160);
    assert.equal(GAME_CONFIG.movingTargets.durationSeconds, 30);
    assert.equal(GAME_CONFIG.movingTargets.targetRadius, 22);

    // Thirty Shot invariants
    assert.equal(THIRTY_SHOT_TARGET_COUNT, 1);
    assert.equal(THIRTY_SHOT_TARGET_GOAL, 30);
    assert.equal(GAME_CONFIG.thirtyShot.targetCount, 1);
    assert.equal(GAME_CONFIG.thirtyShot.targetGoal, 30);
    assert.equal(GAME_CONFIG.thirtyShot.targetRadius, 22);
  });
});
