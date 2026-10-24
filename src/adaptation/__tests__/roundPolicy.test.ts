import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDifficultyState, evaluateRound, ROUND_POLICY } from '../roundPolicy.ts';
import type { RoundEvidence, DecisionReason } from '../roundPolicy.ts';
import { GAME_CONFIG } from '../../game/config/gameConfig.ts';

const context = 'synthetic-stable-context';
function evidence(index: number, overrides: Partial<RoundEvidence> = {}): RoundEvidence {
  return {
    roundId: `round_${index}`, mode: 'six_shot', contextKey: context, radius: 22,
    startedAtMs: index * 31000, endedAtMs: index * 31000 + 30000,
    shots: 20, hits: 19, completion: 'completed', quality: 'verified', ...overrides,
  };
}
const initial = () => createDifficultyState('six_shot', context);

describe('isolated next-round radius policy', () => {
  it('starts at the existing radius in every mode and rejects unsupported initialization', () => {
    for (const config of [GAME_CONFIG.sixShot, GAME_CONFIG.movingTargets, GAME_CONFIG.thirtyShot]) assert.equal(config.targetRadius, ROUND_POLICY.initialRadius);
    for (const radius of [17, 19, 27, NaN, Infinity]) assert.throws(() => createDifficultyState('six_shot', context, radius), RangeError);
    assert.throws(() => createDifficultyState('six_shot', ''), RangeError);
  });

  it('needs two high-accuracy rounds before shrinking by one step', () => {
    const one = evaluateRound(initial(), evidence(1));
    assert.equal(one.action, 'hold');
    assert.equal(one.reason, 'need_second_round');
    const two = evaluateRound(one.state, evidence(2));
    assert.equal(two.action, 'increase_challenge');
    assert.equal(two.toRadius, 20);
    assert.deepEqual(two.evidenceRoundIds, ['round_1', 'round_2']);
    assert.equal(two.state.previous, null);
  });

  it('needs two low-accuracy rounds before enlarging by one step', () => {
    const one = evaluateRound(initial(), evidence(1, { hits: 15 }));
    const two = evaluateRound(one.state, evidence(2, { hits: 15 }));
    assert.equal(two.action, 'decrease_challenge');
    assert.equal(two.toRadius, 24);
  });

  for (const [a, b] of [[16, 16], [18, 18], [19, 15], [15, 19], [19, 18], [16, 15]]) {
    it(`holds for inclusive band boundaries or mixed evidence (${a}/20, ${b}/20)`, () => {
      const one = evaluateRound(initial(), evidence(1, { hits: a }));
      const two = evaluateRound(one.state, evidence(2, { hits: b }));
      assert.equal(two.toRadius, 22);
      assert.equal(two.reason, 'accuracy_band_or_mixed');
    });
  }

  it('uses a rolling pair after a mixed result, requiring a fresh pair after a change', () => {
    let state = evaluateRound(initial(), evidence(1, { hits: 15 })).state;
    state = evaluateRound(state, evidence(2)).state;
    state = evaluateRound(state, evidence(3)).state;
    assert.equal(state.radius, 20);
    const firstNew = evaluateRound(state, evidence(4, { radius: 20 }));
    assert.equal(firstNew.reason, 'need_second_round');
    assert.equal(firstNew.toRadius, 20);
    const secondNew = evaluateRound(firstNew.state, evidence(5, { radius: 20 }));
    assert.equal(secondNew.toRadius, 18);
  });

  it('holds at bounds and can move back away from them', () => {
    for (const [radius, hits, expected] of [[18, 19, 'minimum_radius'], [26, 15, 'maximum_radius']] as const) {
      let state = createDifficultyState('six_shot', context, radius);
      state = evaluateRound(state, evidence(1, { radius, hits })).state;
      const bounded = evaluateRound(state, evidence(2, { radius, hits }));
      assert.equal(bounded.reason, expected);
      assert.equal(bounded.toRadius, radius);
      const reverseHits = hits === 19 ? 15 : 19;
      const reverse = evaluateRound(bounded.state, evidence(3, { radius, hits: reverseHits }));
      const changed = evaluateRound(reverse.state, evidence(4, { radius, hits: reverseHits }));
      assert.equal(changed.toRadius, radius === 18 ? 20 : 24);
    }
  });

  const rejected: [string, Partial<RoundEvidence>, DecisionReason][] = [
    ['unknown completion', { completion: 'unknown' }, 'not_completed'],
    ['early exit', { completion: 'aborted' }, 'not_completed'],
    ['interruption', { quality: 'interrupted' }, 'unverified_quality'],
    ['unverified quality', { quality: 'unknown' }, 'unverified_quality'],
    ['invalid telemetry', { quality: 'invalid' }, 'unverified_quality'],
    ['missing context', { contextKey: null }, 'context_mismatch'],
    ['changed context', { contextKey: 'changed-viewport' }, 'context_mismatch'],
    ['radius different from applied level', { radius: 20 }, 'radius_mismatch'],
    ['sparse shots', { shots: 10, hits: 10 }, 'insufficient_shots'],
    ['zero shots', { shots: 0, hits: 0 }, 'insufficient_shots'],
    ['nonfinite counts', { hits: NaN }, 'invalid_evidence'],
    ['impossible counts', { shots: 20, hits: 21 }, 'invalid_evidence'],
    ['negative counts', { shots: -1, hits: -1 }, 'invalid_evidence'],
    ['fractional counts', { hits: 1.5 }, 'invalid_evidence'],
    ['invalid radius', { radius: 19 }, 'invalid_evidence'],
    ['reversed time', { startedAtMs: 999999 }, 'invalid_evidence'],
    ['nonfinite time', { endedAtMs: Infinity }, 'invalid_evidence'],
  ];
  for (const [name, overrides, reason] of rejected) it(`holds and breaks the evidence streak for ${name}`, () => {
    const one = evaluateRound(initial(), evidence(1));
    const held = evaluateRound(one.state, evidence(2, overrides));
    assert.equal(held.action, 'hold');
    assert.equal(held.reason, reason);
    assert.equal(held.state.previous, null);
    const next = evaluateRound(held.state, evidence(3));
    assert.equal(next.reason, 'need_second_round');
  });

  it('ignores duplicate and late rounds without advancing or erasing evidence', () => {
    const one = evaluateRound(initial(), evidence(2));
    const duplicate = evaluateRound(one.state, evidence(2));
    assert.equal(duplicate.reason, 'duplicate_round');
    assert.deepEqual(duplicate.state, one.state);
    const late = evaluateRound(one.state, evidence(1));
    assert.equal(late.reason, 'out_of_order');
    assert.deepEqual(late.state, one.state);
    assert.equal(evaluateRound(late.state, evidence(3)).toRadius, 20);
  });

  it('keeps state separate across modes', () => {
    const state = evaluateRound(initial(), evidence(1)).state;
    const wrong = evaluateRound(state, evidence(2, { mode: 'moving_targets' }));
    assert.equal(wrong.reason, 'wrong_mode');
    assert.deepEqual(wrong.state, state);
    const moving = evaluateRound(createDifficultyState('moving_targets', context), evidence(2, { mode: 'moving_targets' }));
    assert.equal(moving.reason, 'need_second_round');
    assert.equal(moving.toRadius, 22);
  });

  it('requires the Thirty Shot goal and handles completed rounds with misses', () => {
    const state = createDifficultyState('thirty_shot', context);
    const incomplete = evaluateRound(state, evidence(1, { mode: 'thirty_shot' }));
    assert.equal(incomplete.reason, 'not_completed');
    const one = evaluateRound(incomplete.state, evidence(2, { mode: 'thirty_shot', hits: 30, shots: 32 }));
    const two = evaluateRound(one.state, evidence(3, { mode: 'thirty_shot', hits: 30, shots: 32 }));
    assert.equal(two.toRadius, 20);
  });

  it('does not mutate or retain mutable references to input state and observations', () => {
    const state = initial();
    const round = evidence(1);
    const before = structuredClone({ state, round });
    const result = evaluateRound(state, round);
    assert.deepEqual({ state, round }, before);
    round.hits = 0;
    assert.equal(result.state.previous?.hits, 19);
    result.state.processedRoundIds.push('injected');
    assert.deepEqual(state.processedRoundIds, []);
    const cloned = evaluateRound(result.state, evidence(1));
    cloned.state.previous!.hits = 0;
    assert.equal(result.state.previous?.hits, 19);
  });

  it('stays on the radius ladder and changes at most once per two fresh rounds', () => {
    let state = initial();
    let changes = 0;
    for (let i = 1; i <= 100; i++) {
      const result = evaluateRound(state, evidence(i, { radius: state.radius, hits: i <= 50 ? 20 : 0 }));
      assert.ok(result.toRadius >= 18 && result.toRadius <= 26);
      assert.ok(Math.abs(result.toRadius - result.fromRadius) <= 2);
      assert.equal(result.toRadius % 2, 0);
      if (result.action !== 'hold') changes++;
      state = result.state;
    }
    assert.equal(changes, 6);
    assert.equal(state.radius, 26);
  });
});
