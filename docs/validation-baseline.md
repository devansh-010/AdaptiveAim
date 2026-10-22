# Gameplay and telemetry validation checkpoint

Recorded on 22 October 2026 after the user's browser pass. This is a record of the agreed validation scope, not a claim that every browser, viewport, or endurance scenario has been tested.

## Implementation and Git state

- Committed baseline: `d55fc90` on `main`, matching the local `origin/main` reference at inspection.
- Moving Targets and Thirty Shot implementations are committed in that baseline.
- The UI redesign, trajectory sampler/boundary fix, scene cleanup, moving target visibility fixes, and regression tests remain pending in the working tree at this checkpoint.
- No commit or push was performed as part of this validation pass.
- Installed Phaser version remains **4.2.1**.

## Most recent automated checks

These checks passed against the gameplay changes before this documentation update:

| Check | Result |
| --- | --- |
| `npm test` | 73 tests passed across 7 suites; 0 failures |
| `npm run lint` | Passed |
| `npm run build` | TypeScript and production build passed |
| `git diff --check` | Passed |

The build reports Vite's bundle-size warning for the approximately 1.64 MB JavaScript bundle. This did not fail the build.

Ten regression checks were added for overlay avoidance, immediate resize bounds, direct scene destruction, shutdown/recreation, actual scene shot boundaries, pointer-lock reacquisition routing, Thirty Shot completion/restart, and Six Shot's timed baseline. These tests execute production scene/manager/sampler code with browser, rendering, and timing stubs; they do not prove native pointer-lock behavior.

## Browser results reported by the user

The user marked each of the following checks **passed**:

| Check | Scope |
| --- | --- |
| 1. Moving Targets | Four moving targets, centered crosshair, target visibility around HUD/weapon, hits and deliberate misses |
| 2. Mouse capture | Escape/reacquisition without an aim jump or a shot from the capture click |
| 3. Resize | Smaller browser window, target visibility, HUD alignment, and resumed aiming |
| 4. Completion/restart/exit | Timed round results, fresh scores/targets after restart, and return home |
| 5. Thirty Shot | One stationary target, elapsed timer, misses excluded from progress, completion at 30 hits, restart and exit |
| 6. Six Shot | Six targets with immediate hit replacement |

These are user-observed results. Browser/version, exact viewport sizes, screenshots, and console association blocks were not supplied. Automated checks provide the shot/trajectory association evidence for this checkpoint.

## Next incremental milestone

Review and document telemetry field meanings, units, IDs, and missing-value conventions, then add a structured JSON export for the current round using the existing in-memory collector. Preserve gameplay and Phaser 4.2.1.
