# First adaptive-difficulty controller and evaluation plan

Designed on **24 October 2026**, after the [nine-round baseline inspection](baseline-analysis.md). The deterministic `radius-v1` prototype exists in `src/adaptation/roundPolicy.ts` and has isolated automated tests. It is **not connected to the game scenes**. All live modes still use their current fixed difficulty, Phaser 4.2.1, and schema 1.0.0 exports.

## Objective and scope

The first experiment will try to keep challenge near an **80–90% hit-rate band within each mode**, using completed rounds as observations. It will change only target radius between rounds. The band, bounds, minimum shot count, and step size below are authored starting hypotheses; the single-player batch does not establish optimal thresholds or prove that adaptation improves training.

Accuracy is the controller input. Hits per elapsed second, completion time, radius-normalized center distance, perceived difficulty, and interruptions are evaluation measures. They are not combined into an invented skill label. In particular, high accuracy should not be described as skill improvement if a player simply shoots more slowly.

| Mode | Preserved rules | First adjustable parameter |
| --- | --- | --- |
| Six Shot | Six stationary targets, replacements on hits, 30-second countdown | Radius only |
| Moving Targets | Four moving targets, replacements, 30-second countdown, 160 px/s speed | Radius only |
| Thirty Shot | One stationary target, 30 successful hits, elapsed time; misses do not advance the goal | Radius only |

Sensitivity, aim/clamping conventions, spawn-distance policy, target separation, target counts, timing rules, and moving speed stay fixed. The radius ladder is **18, 20, 22, 24, 26 logical pixels**, starting at the existing **22 px**. Smaller means harder. Radius must control both drawing and hit detection, and bounds/obstruction handling must use the actual radius. This must be verified before a live connection.

## Exact decision rule

Maintain one state for each mode in the adaptive condition. A new context starts at radius 22 with no previous evidence. Observations must be chronological, belong to that mode and context, and record the radius actually played.

An eligible observation has valid telemetry, confirmed completion, verified uninterrupted collection context, a matching actual radius, positive elapsed time, and at least **20 shots**. A Thirty Shot observation additionally needs exactly 30 hits. Sparse, zero-shot, interrupted, aborted, unknown, or mismatched observations hold the radius and clear the evidence streak. Unknown context must not be silently filled with defaults.

Once there are two consecutive eligible observations at the current radius:

| Accuracy of the two rounds, from integer hit/shot counts | Next-round proposal |
| --- | --- |
| Both strictly above 90% | Reduce radius by 2 px, down to 18 |
| Both strictly below 80% | Increase radius by 2 px, up to 26 |
| Either in the inclusive 80–90% band, or directions disagree | Hold radius |

After a size change, clear previous evidence: two fresh eligible rounds at the new radius are required before another change. After a mixed/band hold, retain the latest eligible observation to form the next rolling pair. At a bound, hold and keep observing; two consistent observations in the opposite direction can move away from that bound.

Repeated round IDs, observations from another mode, and late/out-of-order observations are ignored without erasing newer evidence. The state remembers processed IDs within its in-memory lifetime. No persistent player profile or cross-page history is introduced. If settings, viewport, rules, runtime revision, or policy version change, the future owner must create a new context/state at radius 22.

Every result exposes `hold`, `increase_challenge`, or `decrease_challenge`, a reason code, old/new radii, and the supporting round IDs. Returned state and evidence are detached from the inputs. The function proposes next-round state; the eventual caller must apply that radius at the next start and record what was actually applied. A failed application must not be logged as a successful change.

## What the existing batch can show

The nine captures were played at radius 22. Evaluating adjacent observed pairs independently gives these **conditional recommendations**, assuming future eligibility requirements were satisfied:

| Mode | Rounds 1–2 at radius 22 | Rounds 2–3 at radius 22 |
| --- | --- | --- |
| Six Shot | Propose 20 px | Propose 20 px |
| Moving Targets | Hold 22 px | Hold 22 px |
| Thirty Shot | Propose 20 px | Propose 20 px |

These pairs must not be chained as though later recorded rounds used 20 px: they did not. The preview cannot predict accuracy, throughput, or completion time at an unplayed radius. Existing exports lack machine-verifiable termination/configuration context; a strict automatic adapter must hold on that missing evidence. The two 29.99-second warnings remain in the original baseline report. User-reported stable settings help interpret that batch but do not add missing machine fields to its exports.

The pure prototype tests cover the rule boundaries, low-shot/empty/invalid observations, interruptions and unknown metadata, context/radius mismatches, duplicate/late events, separate modes, Thirty Shot goals/misses, immutable state, rate limits, and both radius bounds.

## Metadata required before a live connection

The next implementation milestone must extend recording and validation before enabling adaptation. The following is a **proposed additive schema revision**, not fields present in current 1.0.0 files. Keep the old decoder working and test both contracts when the revision is introduced.

- Round termination: explicit `time_limit`, `target_goal`, `exit`, or `scene_destroyed` reason. Only the first two qualify as completed. Preserve wall-clock timestamps/duration alongside the existing game timer semantics; do not repair legacy 29.99-second records.
- Actual round configuration: radius, target count, moving flag/speed, timed duration or hit goal, sensitivity, logical canvas dimensions, and a rules/configuration version. Configuration is snapshotted at start, not inferred afterward from current constants.
- Runtime revision: an explicit build/revision value, with unknown represented as unknown. Capture the real recording build rather than the later analysis tool's Git commit.
- Condition and controller: fixed versus adaptive, policy version, context key, and the proposed decision/reason/evidence round IDs. Associate a proposal with the subsequent round that actually applied it; record requested and applied values separately if application fails.
- Collection quality: active-play focus/visibility loss, pointer-lock loss after acquisition, and resizing. Normal initial lock acquisition and intentional release after completion must not be marked as interruptions. Any such active-play interruption makes that round ineligible for control and primary comparison, while retaining its raw data.

The context key identifies stable non-radius settings and recording context, including the mode, rules/runtime revision, viewport and sensitivity. Radius is recorded separately so a deliberate radius change does not reset the controller. The fixed comparison condition must never feed or advance adaptive state.

## Live behavior for the following milestone

Keep the current fixed mode available. Adaptive play should be an explicit choice, initially off, with the current difficulty and a short next-round explanation visible in results. A target must not change size during a round. Switching condition clears the pending evidence streak; switching context resets the radius to 22. Radius state may be retained for that mode while another fixed-condition block is played, but its evidence streak is cleared on leaving adaptive play.

On a qualifying result, compute a proposal once. At the next start, build target management/rendering/hit detection from a single applied configuration snapshot, then record it. Preserve the 30-hit/one-target and timed-mode rules. Reacquiring pointer lock must still require the normal user gesture and must not create a shot. A restart must not process the previous round twice. Mode exits must clean up as before.

Before browser testing, automate checks for baseline fixed behavior, identical radius across the target sprite/hitbox/export, safe bounds at every supported radius, next-start-only updates, duplicates/restarts/exits, mode isolation, missing metadata holds, and both export-schema versions. Then manually check actual pointer lock, visibility, resize/interrupt handling, results explanations, and downloads in each mode. No backend or learned model is needed for this step.

## Evaluation protocol after live integration

Freeze `radius-v1` and its thresholds before play. First run a short technical smoke check to establish that metadata, rendering/hit detection, decisions, and applied configurations agree. That check is separate from an evaluation batch.

For an initial exploratory comparison, use **eight rounds per mode**, arranged into four blocks of two rounds. Assign fixed/adaptive/adaptive/fixed to the first mode, adaptive/fixed/fixed/adaptive to the second, and fixed/adaptive/adaptive/fixed to the third. Reverse these assignments and rotate mode order in a subsequent session. This is a small feasibility pilot, not a powered efficacy study; the ordering does not eliminate practice, fatigue, or carry-over effects.

Fixed rounds always use radius 22. Adaptive state starts at 22 for each mode and may retain its radius across that mode's adaptive blocks; clear its evidence streak when leaving the adaptive condition. Consecutive adaptive blocks share state. Fixed rounds never supply adaptive evidence. Use a separate warm-up, unchanged device/settings/viewport, breaks between blocks, and download each round before restarting. Record a short perceived-difficulty response after each round: too easy, about right, or too hard.

Predeclare the comparison and report, separately for every mode and condition:

- Number of eligible rounds, exclusions, and reasons; do not drop interrupted or sparse rounds silently. Excluded adaptive rounds still hold/reset the controller. A replacement round, if needed, stays in the same condition/block and is documented.
- Fraction of eligible rounds with accuracy in 80–90%, plus distance from that band. This measures challenge regulation, not skill gain. Report initial two-round calibration separately from later adaptive rounds, and show the actual applied radii.
- Hits per wall-clock second and pooled accuracy for timed modes; completion time and misses for Thirty Shot. Preserve all raw values and timing warnings, and distinguish a different challenge from a faster player.
- Hit center distance divided by actual target radius, keeping misses separate. Raw pixel precision is not directly comparable when radius changes. Keep spawn-to-hit time and trajectory metrics descriptive/exploratory rather than skill labels.
- Decision count, step sizes, holds, bound saturation, invalid/ineligible observations, interruption rates, and perceived-difficulty responses.

Technical acceptance requires no integrity failures, correct once-only decisions, steps confined to the ladder, no mid-round changes, no mode leakage, and correct hold behavior for missing/invalid/interrupted evidence. No win/loss threshold for training effectiveness is estimated from nine fixed rounds. The pilot should expose tradeoffs and inform a larger preplanned comparison; it cannot establish long-term training benefit or justify an ML model by itself. Do not tune thresholds partway through the same evaluation batch.

## Milestone boundary

This checkpoint delivers the per-mode objective, versioned pure rule prototype, tests, conditional offline preview, metadata requirements, and evaluation protocol. **The immediate next implementation is configuration/termination/quality recording and its validator support**, followed by an opt-in live connection. The current game remains fixed difficulty; calling it AI-adaptive would be premature.
