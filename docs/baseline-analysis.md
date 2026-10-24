# Initial nine-round baseline inspection

Inspected on **24 October 2026** with the validator at commit `48b1868`. This is the first Milestone 10 collection batch: three new rounds per mode, separate from the earlier single-download checkpoints. All nine files pass integrity validation, with **zero errors and two retained duration warnings**.

The user confirmed the same browser/settings throughout and no interruptions. Exact browser version, viewport dimensions, sensitivity value, and warm-up status were not supplied. The exports do not embed their application commit, so the analysis commit identifies the tool used, not a verified recording build.

## Batch summary

| Mode | Rounds | Hits / shots | Misses | Pooled accuracy | Mean spawn-to-hit time (s) | Mean center distance (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Six Shot | 3 | 101 / 107 | 6 | 94.39% | 3.284 | 9.97 |
| Moving Targets | 3 | 79 / 107 | 28 | 73.83% | 3.714 | 12.43 |
| Thirty Shot | 3 | 90 / 94 | 4 | 95.74% | 0.912 | 10.89 |

There are **308 shots, 270 hits, 38 misses, 314 trajectory segments, and 16,672 samples**. Accuracy is pooled by shot counts, and the two means use hit-shot measurements. No cross-mode performance score is calculated.

Spawn-to-hit time includes the target's entire lifetime before its hit. Six Shot offers six simultaneous targets and Moving Targets four, whereas Thirty Shot offers one. These means therefore describe different tasks and must not be treated as interchangeable perceptual reaction times. Center distance is measured in logical pixels, with a recorded radius of 22 px throughout; lower distance means closer to the center. Misses have null target measurements and are excluded from hit-only means.

## Individual rounds

Labels follow timestamp order within each mode; the actual play order was Six Shot, then Moving Targets, then Thirty Shot.

| Round | Duration (s) | Hits / shots | Misses | Accuracy | Validator warnings |
| --- | ---: | ---: | ---: | ---: | --- |
| Six Shot 1 | 30.07 | 31 / 34 | 3 | 91.18% | None |
| Six Shot 2 | 29.99 | 36 / 37 | 1 | 97.30% | `short_round` |
| Six Shot 3 | 30.00 | 34 / 36 | 2 | 94.44% | None |
| Moving Targets 1 | 30.00 | 23 / 36 | 13 | 63.89% | None |
| Moving Targets 2 | 30.00 | 32 / 36 | 4 | 88.89% | None |
| Moving Targets 3 | 29.99 | 24 / 35 | 11 | 68.57% | `short_round` |
| Thirty Shot 1 | 28.96 | 30 / 32 | 2 | 93.75% | None |
| Thirty Shot 2 | 27.10 | 30 / 32 | 2 | 93.75% | None |
| Thirty Shot 3 | 26.00 | 30 / 30 | 0 | 100.00% | None |

Every Thirty Shot round reached 30 hits. Two contain misses, covering the native miss-export path that the earlier perfect round did not exercise. Median Thirty Shot completion time is **27.10 s**, with a **26.00–28.96 s** range. Three consecutive rounds do not establish a learning trend.

## Integrity and timing review

- All rounds have unique round IDs. Target, shot, and trajectory IDs are also unique across the whole batch. All event links remain within their own round. The captures share one anonymous player and one session.
- Each shot has exactly one associated segment. Six timed rounds each contain a final unassigned segment; the three Thirty Shot rounds contain none. All shot-boundary samples match their shot position and timestamp.
- Hit/miss fields, null conventions, target destruction/lifetimes, target counts, shot geometry, reaction aggregates, and derived metrics pass. All recorded targets have a 22 px radius; moving targets record 160 px/s and stationary targets record zero speed.
- A separate calculation using raw positions/timestamps reproduced path/direct distances, efficiency, eligible durations, mean velocities, and peak velocities for every segment. Production validation also checks direction changes and sample counts.
- Every round has a 16 ms within-segment median sample interval and 17 ms p95. Maxima range from 25 to 32 ms, with no within-segment interval above 100 ms. Six intervals have equal timestamps; these are valid, excluded from velocity calculations, and retained in geometric path calculations.
- The first segment starts 0–2 ms after its round boundary. The last segment ends 0–1 ms before round end except Six Shot 1, which has a 71 ms final boundary gap. The scene stops sampling and releases pointer lock before the collector timestamps round end. This ordering is consistent with a finalization gap, but the export does not identify the particular delay's cause. It is not a 71 ms sampled movement interval and must not be reconstructed as one.

### Two duration warnings

Six Shot 2 spans **29,991 ms** and Moving Targets 3 spans **29,994 ms**. Both round to 29.99 seconds and trigger the conservative `duration < 30` warning. Other timed rounds slightly below 30,000 ms can round to 30.00 and avoid it.

The game countdown subtracts Phaser's frame delta in `SixShotScene.updateTimer()`, while `TelemetryCollector.endRound()` measures elapsed wall time from ISO timestamps. Their boundaries need not coincide exactly. These millisecond differences are consistent with that implementation and are accepted for this descriptive inspection. The original records and both machine warnings remain intact; no validator threshold or raw timestamps were changed to remove them. Timed-round completion is still inferred from the workflow rather than proved by an explicit `end_reason` field, which the schema lacks.

## Interpretation and next step

This batch establishes a working local collection/inspection path and covers all three modes, hits, misses, restarts between rounds, and completed Thirty Shot goals. It represents one anonymous player/session, not nine independent participants. Ordered mode blocks, practice, and fatigue can affect comparisons. Exact collection settings and the runtime build are not independently recoverable from these files. There is no evidence here to fit or evaluate a learned skill model or estimate how changing difficulty affects performance.

The next focused milestone is **adaptive-difficulty design**, with a per-mode objective and evaluation plan before changing gameplay. Candidate round/window measures are hit rate, hits per elapsed second, and hit center distance normalized by target radius. Spawn-to-hit time needs mode/target-lifetime context. Trajectory efficiency is exploratory; velocity peaks are sensitive to short intervals and should not define a skill label by themselves.

Specify a transparent bounded controller and a fixed-difficulty comparison before considering a learned model. Future recordings for that comparison need explicit difficulty/configuration, runtime revision, and termination context. This inspection completes the initial nine-round checkpoint; controlled adaptation, model labels, and broader evaluation remain future work. Phaser remains 4.2.1, and no gameplay, backend, or AI behavior changes are part of this checkpoint.

The subsequent [adaptive-difficulty design](adaptive-difficulty-design.md) defines that first rule prototype, its limits, required recording metadata, and the evaluation protocol. The prototype is tested independently and is not connected to gameplay.

## Local artifacts

Exact byte copies and SHA-256 provenance remain under ignored `data/`. The local report files are `data/reports/batch-2026-10-24-validation.json` and `data/reports/batch-2026-10-24-analysis.json`; a local script records how the independent inspection was reproduced. Filenames and per-record identifiers remain in those local artifacts rather than this summary. See the [collection guide](data-collection.md) for commands and conventions.
