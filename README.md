# AdaptiveAim

AdaptiveAim is an AI-powered browser aim trainer. v0.1 establishes a non-AI gameplay and telemetry baseline for future adaptive difficulty research.

---

## Current Status & Scope

```text
Current version: v0.1
Current mode: Six Shot
AI: Not implemented
Backend: Not implemented
Database: Not implemented
```

---

## Tech Stack

- **Frontend Framework:** React 19
- **Language:** TypeScript
- **Build Tool:** Vite
- **Game Engine:** Phaser 3
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
│   │   │   └── SixShotScene.ts
│   │   ├── entities/
│   │   │   └── Target.ts
│   │   └── systems/
│   │       ├── RoundManager.ts
│   │       └── TargetManager.ts
│   ├── telemetry/
│   │   ├── types.ts
│   │   ├── ids.ts
│   │   └── TelemetryCollector.ts
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
- **Phaser 3:** Game canvas execution, scene management, target entities, spatial positioning, hit detection, mouse interactions.
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
- `Trajectory`: Mouse movement dataset tracking (type interface prepared for future recording)

---

## Planned Game Modes

1. **Six Shot (v0.1 Focus):** Static target precision training maintaining six simultaneous active targets.
2. **Thirty Shot:** Fast-paced fixed-target reaction exercise.
3. **Moving Targets:** Dynamic tracking and predictive aim exercise.

---

## Current Limitations

- No AI or machine learning models implemented in v0.1.
- No remote backend server or persistence layer.
- Telemetry events are stored in-memory on the client during session runtime.
- Six Shot gameplay logic stubbed with baseline scene and system interfaces.

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
