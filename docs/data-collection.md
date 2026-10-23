# Local telemetry validation and collection

Milestone 10 adds a repeatable local check for schema `1.0.0`. Use Node.js 24 and the existing npm installation. No additional dependencies are required. Inputs are only read; the command does not upload or rewrite recordings.

## Validate a download

From the repository folder, run this in PowerShell, replacing the example path:

```powershell
npm.cmd run telemetry:check -- "D:\Downloads\adaptiveaim_moving_targets_round_<id>.json"
```

You can supply multiple file or folder paths. Folders include immediate `.json` files only, without descending into subfolders. Explicit file paths can have any filename. Equivalent paths to one file are checked once; separate files carrying the same round ID are all rejected and excluded from totals, including when one copy is damaged.

```powershell
New-Item -ItemType Directory -Force data\captures, data\reports
npm.cmd run telemetry:check -- ".\data\captures"
npm.cmd run --silent telemetry:check -- --json ".\data\captures" > ".\data\reports\batch-report.json"
```

Keep reports outside the input folder. The repository ignores `data/`, including local captures, notes, and reports. Original downloads can also be checked directly without copying them. Avoid committing player JSON or IDs in documentation.

Exit codes are `0` for valid data (possibly with warnings), `1` for a read/parse/data error, and `2` for command usage errors. Empty folders fail. Other valid files are still checked and summarized when one file fails. `--help` describes the command.

## What the check means

Errors cover required fields/types, non-finite numbers, schema version, ID links and uniqueness, hit/miss null conventions, counts and averages, timestamp bounds/order, target lifetime, hit geometry and reaction time, one segment per shot, exact shot-boundary samples, segment continuity, and derived metrics recomputed with the production feature calculator. Numeric comparisons use a relative tolerance of `1e-8` (minimum absolute tolerance `1e-8`); rounded fields are compared against the collector's documented rounding.

Warnings identify missing optional derived metrics, unknown modes, or differences from current gameplay profiles. Timed recordings shorter than 30 seconds and Thirty Shot recordings with a hit count other than 30 require review. Finalization alone does not establish challenge completion. A warning is not a data-error exit code; review it before using the recording in a collection batch.

Summaries group modes separately. Accuracy is pooled by shot counts; reaction and precision means are pooled by hit counts, using shot-level measurements. Means are null with no hits; accuracy is null in a batch with no shots. Invalid or duplicate rounds never enter totals. Valid rounds with warnings enter totals and are counted explicitly, so a passing batch is not automatically a completed-round dataset.

Sample interval min/median/p95/max use actual timestamps between consecutive samples **within each segment**, including zero-length intervals. P95 uses the nearest-rank definition. Boundary-to-first-sample intervals and intervals between segments are excluded. No fixed 60 Hz cadence is assumed. The report cannot prove visual visibility, correct native pointer lock, absence of focus interruptions, or physical mouse behavior.

The current raw export does not include viewport size, sensitivity/configuration revision, pointer-lock interruption markers, or continuous moving-target positions. Raw mouse deltas need not equal logical position differences. Derived metrics cover recorded samples, not reconstructed motion. A match confirms consistency with the current calculator, not independent scientific validation of its definitions. See the [schema](telemetry-schema.md) for units and limitations.

## Native download validation

1. Play one **Moving Targets** round to its results screen. Include ordinary hits and misses. Download its JSON before restarting.
2. Play **Thirty Shot** until 30 successful hits. Confirm misses do not advance the goal, then download before restarting.
3. Check both files with the command above. Review any errors or warnings before collecting further rounds. Record any browser/input/visual issues separately; JSON alone cannot establish those checks.

The supplied native Six Shot download passed the reusable validator on 22 October 2026. The supplied Moving Targets and Thirty Shot downloads passed on 23 October 2026. All three files have zero validation errors or warnings. Raw recordings remain outside the repository.

| Mode | Duration (s) | Shots | Hits | Misses | Accuracy | Targets | Segments | Samples |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Six Shot | 30.01 | 28 | 25 | 3 | 89.29% | 31 | 29 | 1,902 |
| Moving Targets | 30.03 | 18 | 13 | 5 | 72.22% | 17 | 19 | 1,878 |
| Thirty Shot | 41.55 | 30 | 30 | 0 | 100.00% | 30 | 30 | 2,619 |

Envelope/ID links, hit and miss conventions, counts, target lifetimes, hit geometry, reaction-time aggregates, timestamps, exact shot-boundary samples, and derived metrics passed. Moving Targets has four remaining target records and one trailing segment; all 13 hit centers differ from their spawn positions, as expected for moving targets. Thirty Shot has 30 destroyed targets and no trailing segment; an absent trailing segment is valid when no samples remain after the final shot.

An additional independent calculation of path distances and eligible-interval velocities matched both new files. Their within-segment median sampling interval is 16 ms and p95 is 20 ms. Maximum intervals are 133 ms for Moving Targets and 31 ms for Thirty Shot. Moving Targets has four intervals above 30 ms; this is an observation, not a fixed-rate validation failure. The file does not identify the cause of those gaps.

The Thirty Shot recording contains no misses, so that file alone does not exercise its miss path. Existing gameplay tests and the earlier user-reported browser checks cover misses; include ordinary misses in subsequent collection. File consistency does not independently verify visuals or native pointer-lock behavior. The initial native-download checkpoint is complete; the next step is the small baseline below.

## Small baseline after all three modes pass

Collect three normal rounds per mode as an initial nine-round inspection batch. Keep the same browser, viewport, and sensitivity; avoid resizing or changing settings during this batch. Use one unrecorded warm-up first, take breaks as needed, and note play order. Download every round before restarting, preserving its generated filename and round ID.

Keep a local notes file with the app commit (`git rev-parse HEAD`), browser/version, viewport, sensitivity/settings, mode/order, and any focus loss, pointer-lock loss, resizing, or early exit. Pair notes with filenames. If interrupted, keep the file and mark the interruption; review or repeat it before treating it as an ordinary completed round. Do not silently edit raw records to make checks pass.

Validate the folder after collection and review per-mode totals and warnings. This small batch is for finding recording defects and establishing an inspection workflow; it is insufficient to justify an adaptive model or claims about player skill. Modelling, persistent identity, configuration metadata, and larger collection protocols belong to later milestones.
