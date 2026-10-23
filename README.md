# AdaptiveAim

AdaptiveAim is a browser aim trainer. v0.1 establishes a non-AI gameplay and telemetry baseline for future adaptive difficulty research.

---

## Current Status & Scope

```text
Current version: v0.1
Playable modes: Six Shot, Moving Targets, Thirty Shot
AI: Not implemented
Backend: Not implemented
Database: Not implemented
```

---

## Tech Stack

- **Frontend Framework:** React 19
- **Language:** TypeScript
- **Build Tool:** Vite
- **Game Engine:** Phaser 4.2.1
- **Linter & Code Quality:** ESLint
- **Package Manager:** npm

---

## Project Architecture

AdaptiveAim maintains a strict architectural separation between React UI rendering and Phaser gameplay logic:

```text
AdaptiveAim/
│
├── public/
│   └── assets/
│
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── App.css
│   ├── components/
│   │   ├── GameCanvas.tsx
│   │   ├── GameHUD.tsx
│   │   └── RoundResults.tsx
│   ├── game/
│   │   ├── config/
│   │   │   └── gameConfig.ts
│   │   ├── scenes/
│   │   │   ├── SixShotScene.ts
│   │   │   ├── MovingTargetsScene.ts
│   │   │   └── ThirtyShotScene.ts
│   │   ├── rendering/
│   │   │   └── EnvironmentRenderer.ts
│   │   ├── entities/
│   │   │   └── Target.ts
│   │   └── systems/
│   │       ├── RoundManager.ts
│   │       ├── TargetManager.ts
│   │       └── TrajectorySampler.ts
│   ├── telemetry/
│   │   ├── types.ts
│   │   ├── ids.ts
│   │   ├── TelemetryCollector.ts
│   │   └── trajectoryFeatures.ts
│   ├── types/
│   │   └── game.ts
│   └── main.tsx
│
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
└── eslint.config.js
```

### Layer Responsibilities

- **React:** UI rendering, menus, HUD overlay, round results screen, mounting and unmounting the Phaser game instance.
- **Phaser 4.2.1:** Game canvas execution, scene management, target entities, spatial positioning, hit detection, mouse interactions.
- **Telemetry Module:** Decoupled telemetry collector capturing structured round, target, and shot event data for downstream statistical analysis and machine learning.

---

## Data Flow & Telemetry

```text
Phaser Gameplay
      ↓
Gameplay Events
      ↓
TelemetryCollector
      ↓
Structured Round Data
```

Telemetry models include:

- `Player`: `player_id`
- `Session`: `session_id`, `player_id`, `start_time`, `end_time`
- `Round`: `round_id`, `session_id`, `mode`, `difficulty`, `start_time`, `end_time`, `duration`, `shots_fired`, `hits`, `misses`, `accuracy`, `average_reaction_time`, `average_precision`, `targets_hit`, `targets_spawned`
- `Target`: `target_id`, `round_id`, `spawn_time`, `destroy_time`, `spawn_x`, `spawn_y`, `target_size`, `movement_enabled`, `movement_speed`, `direction_x`, `direction_y`, `lifetime`
- `Shot`: `shot_id`, `round_id`, `target_id`, `timestamp`, `hit`, `player_x`, `player_y`, `target_x`, `target_y`, `target_size`, `target_speed`, `distance_to_target`, `reaction_time`, `precision`
- `TrajectorySample`: Logical aim position, ISO timestamp, and accumulated raw mouse deltas, sampled approximately every 16 ms and at shot boundaries.
- `TrajectorySegment`: Round/shot/target associations, ordered samples, duration, and derived distance, efficiency, velocity, and direction-change metrics. Trailing segments have null shot/target IDs.

After a round completes, click **DOWNLOAD ROUND JSON** beside restart on the results screen. Each file includes schema version `1.0.0`, player/session context, the round summary, targets, shots, raw trajectory samples, and derived metrics. Download before restarting or leaving the page: the collector keeps only the current round in memory.

See the [telemetry schema](docs/telemetry-schema.md) for field meanings, units, associations, and missing-value conventions. Downloads stay on the client; nothing is uploaded.

Validate downloaded rounds locally with Node.js 24:

```powershell
npm.cmd run telemetry:check -- "D:\Downloads\adaptiveaim_<mode>_<round_id>.json"
```

The command accepts files or folders, checks telemetry consistency, and reports per-mode totals. See the [validation and collection guide](docs/data-collection.md) for warnings, JSON reports, and the next browser checks. Keep local captures/reports under the ignored `data/` folder.

---

## Playable Game Modes

1. **Six Shot:** Six stationary targets with immediate replacement on a hit; a 30-second round.
2. **Moving Targets:** Four moving targets with boundary/overlay handling; a 30-second round.
3. **Thirty Shot:** One stationary target at a time; finish on 30 successful hits with an elapsed-time HUD. Misses do not advance progress.

---

## Current Limitations

- No AI or machine learning models implemented in v0.1.
- No remote backend server or persistence layer.
- Telemetry events are stored in-memory on the client during session runtime.
- JSON export covers one finalized round at a time; there is no stored round history or session-wide export.

The [gameplay validation checkpoint](docs/validation-baseline.md) records automated checks and the user-reported browser pass for all three modes.

---

## Getting Started

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

### Code Formatting & Linting

```bash
npm run lint
```

### Automated Tests

Use Node.js 24 for the native TypeScript test runner:

```bash
npm test
```

Tests cover gameplay rules, target visibility, telemetry associations, trajectory metrics, and scene lifecycle/input integration. Scene integration tests use browser/rendering stubs; real pointer lock and visuals are checked in a browser.
