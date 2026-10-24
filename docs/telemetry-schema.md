# Telemetry round export, version 1.0.0

## Download and lifetime

Complete a Six Shot, Moving Targets, or Thirty Shot round, then select **DOWNLOAD ROUND JSON** on its results screen. Downloading leaves the results open; restarting still starts a fresh round. The file is generated locally through a browser download and is not uploaded.

The filename is `adaptiveaim_<mode>_<round_id>.json`. Download before restarting or reloading: the collector retains only the current round. A downloaded file or a returned export snapshot remains independent of later rounds. Exporting does not end an active round, recompute metrics, change IDs, or alter gameplay.

The programmatic entry point is `TelemetryCollector.getRoundExport()`. It returns a detached copy only when the current round has an `end_time`, otherwise `null`. `serializeRoundExport()` creates formatted JSON and rejects non-finite numbers rather than silently converting them to null. `downloadRoundJson()` requests the browser download and removes its temporary anchor and object URL. The browser may still apply its normal download settings.

## Export envelope

| Field | Meaning |
| --- | --- |
| `schema_version` | Literal string `1.0.0`; identifies this field/units contract. Change the version when the contract changes. |
| `exported_at` | UTC ISO 8601 export timestamp; separate from the gameplay timestamps. |
| `player` | Anonymous client player identifier; not a signed-in account. |
| `session` | Metadata for the current page's in-memory session, not an archive of all its rounds. |
| `round` | One finalized round summary. |
| `targets` | Target spawn records with destruction data where recorded. |
| `shots` | Ordered shot records, including hits and misses. |
| `trajectory_segments` | Ordered raw sample segments and derived metrics, including any unassigned trailing segment. |

All event `round_id` values refer to `round.round_id`. `round.session_id` refers to `session.session_id`, and `session.player_id` refers to `player.player_id`.

## Shared conventions

- Timestamps are UTC ISO 8601 strings produced by `Date.toISOString()`.
- Aim/target coordinates and distances use logical world pixels: positive X is right and positive Y is down. A rendered target center is `(target.x - aimOffsetX, target.y - aimOffsetY)`; the shot's world aim position is the viewport center plus its aim offset. These are not physical mouse distances or screen device pixels.
- Raw `movement_x`/`movement_y` are accumulated browser relative mouse deltas. Sensitivity, aim clamping, browser behavior, and viewport changes can make them differ from logical coordinate differences.
- Round `duration` and shot `reaction_time` use **seconds**. Target `lifetime` and trajectory segment `duration` use **milliseconds**. Derived velocities use logical **pixels per second**.
- JSON `null` means unavailable or unassigned where allowed. Zero remains a valid numeric measurement. Optional fields are omitted if they have not been recorded; omission and null have different meanings.
- Arrays retain recording order. Serialization does not reorder events, normalize timestamps, round raw samples, or repair inconsistent records.

## Player and session

| Field | Type / meaning |
| --- | --- |
| `player.player_id` | Generated string ID, normally `player_<UUID>`. |
| `session.session_id` | Generated string ID, normally `session_<UUID>`. |
| `session.player_id` | Owner of this session. |
| `session.start_time` | Time the collector/session was created. |
| `session.end_time` | Optional; present only if `endSession()` has been called. A round ending does not end the session. |

The default singleton generates fresh player/session IDs when the page is loaded. There is no persistent user identity or cross-page session history.

## Round summary

| Field | Meaning / unit |
| --- | --- |
| `round_id`, `session_id` | Round identifier and session link. |
| `mode` | `six_shot`, `moving_targets`, or `thirty_shot`. |
| `difficulty` | `fixed` for the stationary modes, `moving` for Moving Targets. |
| `start_time`, `end_time` | Recording boundaries; exported rounds always have both. |
| `duration` | Wall-clock seconds between those boundaries, rounded to 2 decimal places. |
| `shots_fired`, `hits`, `misses` | Shot counts; `shots_fired = hits + misses`. |
| `accuracy` | `100 * hits / shots_fired`, rounded to 2 decimal places; 0 with no shots. |
| `targets_hit` | Hit count in the current rules, where each hit destroys one target. |
| `targets_spawned` | Number of target spawn events, including initial targets and replacements. |
| `average_reaction_time` | Mean non-null hit-shot reaction time in seconds, rounded to 3 decimal places. |
| `average_precision` | Mean non-null hit-shot center distance in logical pixels, rounded to 2 decimal places. Lower is closer to center. |

Both averages are 0 when no eligible hits exist. Use `hits` and the shot-level nullable fields to distinguish this case from valid zero-valued hits. The results UI currently displays `N/A` for zero averages; the JSON retains numeric zero.

`end_time` means recording ended, not necessarily that a challenge was completed: the collector can also be finalized on an early exit. In normal UI use, the download button is available only on the results screen. A Thirty Shot completion has 30 hits. Round duration uses wall time and may differ slightly from the HUD's accumulated frame time, particularly with focus loss/background tabs.

## Targets

| Field | Meaning / unit |
| --- | --- |
| `target_id`, `round_id` | Stable target identifier and round link. |
| `spawn_time` | Target creation timestamp. |
| `destroy_time` | Optional timestamp of a recorded target destruction. |
| `spawn_x`, `spawn_y` | Initial logical center position, not the later position of a moving target. |
| `target_size` | Target **radius**, in logical pixels. |
| `movement_enabled` | Whether this target moves. |
| `movement_speed` | Configured logical pixels per second; 0 for stationary targets. |
| `direction_x`, `direction_y` | Direction vector at spawn, rounded to 3 decimal places. This record is not updated on boundary bounces. |
| `lifetime` | Optional milliseconds from spawn to a recorded destruction. |

Targets still present when the round stops may lack destruction fields; this does not imply they are still rendered. The export does not contain a moving target's full position history. Use a hit shot's target coordinates for its hit-time position.

## Shots

| Field | Meaning / unit |
| --- | --- |
| `shot_id`, `round_id` | Stable shot identifier and round link. |
| `timestamp` | Shot event timestamp, also used for the shot's final trajectory sample. |
| `hit` | Hit/miss boolean. |
| `target_id` | ID of the target hit; null for a miss. |
| `player_x`, `player_y` | Logical world aim position at the fixed center crosshair. |
| `target_x`, `target_y` | Logical target center at a hit; null for a miss. |
| `target_size`, `target_speed` | Hit target radius (pixels) and configured speed (pixels/second); null for a miss. |
| `distance_to_target`, `precision` | Same Euclidean aim-to-target-center distance in pixels, rounded to 2 decimal places; null for a miss. Zero is a dead-center hit. |
| `reaction_time` | Seconds from this target's spawn to the hit, rounded to 3 decimal places; null for a miss. |

Reaction time includes time the target was alive before being hit; it is not a separately measured perceptual reaction or time since the preceding shot.

## Trajectory segments and samples

| Segment field | Meaning / unit |
| --- | --- |
| `trajectory_id`, `round_id` | Segment identifier and round link. |
| `shot_id` | Associated shot; null for a trailing/unassigned segment. |
| `target_id` | The associated shot's hit target; null for a miss or trailing segment. |
| `start_time`, `end_time` | Segment boundaries. The next segment starts at the preceding boundary timestamp. |
| `duration` | Milliseconds between segment boundaries. |
| `samples` | Ordered raw samples; an array can be empty. |
| `derived_metrics` | Metrics calculated when the collector records the segment. The type permits omission, but the current collector normally populates this field. |

| Sample field | Meaning / unit |
| --- | --- |
| `timestamp` | Actual capture time. |
| `x`, `y` | Logical world aim position. |
| `movement_x`, `movement_y` | Raw relative deltas accumulated since the preceding capture/boundary, consumed once. |

Sampling uses a nominal 16 ms interval while playing with pointer lock, plus an exact shot-boundary capture. Final pending movement can create a trailing segment at round end. Each actual shot has one associated segment; an unassigned trailing segment does not count as a shot. Do not assume exactly 60 samples/second: use sample timestamps. Pointer-lock loss clears pending raw deltas to prevent reacquisition spikes; unlocked intervals are not sampled and can leave gaps in segment timestamps.

## Derived metrics

| Field | Meaning / unit |
| --- | --- |
| `path_distance` | Sum of Euclidean distances between consecutive valid sample positions, in logical pixels. |
| `direct_distance` | Distance between first and last valid sample positions, in pixels. |
| `path_efficiency` | `direct_distance / path_distance`, nominally 0 to 1; null for a zero-length path. |
| `average_velocity` | Distance across positive-time sample intervals divided by their total duration, in pixels/second; null without an eligible interval. |
| `max_velocity` | Largest positive-time interval velocity, in pixels/second; null without an eligible interval. |
| `direction_changes` | Count of recognized heading turns of at least 45 degrees after a 1-pixel displacement noise threshold. |
| `valid_sample_count` | Count of samples with finite coordinates and parseable timestamps used in calculation. |
| `eligible_duration_seconds` | Sum of the positive-time intervals used for velocity calculations. |

With fewer than two valid samples, distances and direction changes are 0, and efficiency/velocities are null. Duplicate or reversing timestamps do not contribute to velocities. Geometric distances still use consecutive valid sample positions. Raw samples remain in the export even if a feature calculation excludes them.

Metrics cover the samples present: the interval before a segment's first sample is not reconstructed from raw deltas or the preceding segment. Gaps while unlocked/backgrounded are not separately annotated. These conventions should be considered before combining metrics for modelling.

## Validation and scope

Tests exercise JSON round trips, hit/miss/trailing IDs, optional/null/zero values, nested snapshot isolation, restart behavior, empty rounds, download resource cleanup, error handling, and the actual results-click path in all three scenes using the existing browser/rendering stubs.

Native JSON downloads supplied by the user were inspected for Six Shot on 22 October 2026 and Moving Targets and Thirty Shot on 23 October 2026. All three passed the local validator with zero errors or warnings, including envelope/ID links, counts, timestamps, hit distances, reaction-time aggregates, exact shot-boundary samples, trailing-segment conventions, and derived metrics. The Moving Targets and Thirty Shot files also passed an independent distance/velocity calculation. See the [download checkpoint and collection guide](data-collection.md#native-download-validation) for counts, sampling observations, coverage limits, and the next collection step.

A separate nine-round batch was inspected on 24 October 2026. All nine passed integrity validation with zero errors and two retained near-30-second duration warnings. The [baseline analysis](baseline-analysis.md) records the warning review, sampling/boundary observations, and the native Thirty Shot miss-export coverage.

This milestone adds no round archive, backend, database, automatic uploads, or AI.
