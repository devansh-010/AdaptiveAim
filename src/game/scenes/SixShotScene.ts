import Phaser from 'phaser';
import { GAME_CONFIG, SIX_SHOT_ROUND_DURATION } from '../config/gameConfig';
import { TargetManager } from '../systems/TargetManager';
import { generateRoundId } from '../../telemetry/ids';
import type { Target } from '../entities/Target';

/**
 * Texture key for the concentric-circle target graphic.
 * Generated once in preload/create and reused for all target sprites.
 */
const TARGET_TEXTURE_KEY = 'target_circle';

/**
 * SixShotScene is the primary Phaser scene for the Six Shot aim training mode.
 *
 * Responsibilities:
 * - Phaser scene lifecycle
 * - initializing the Six Shot round environment
 * - managing the 30-second round timer
 * - asking TargetManager to populate and maintain targets
 * - rendering targets via Phaser GameObjects
 *
 * It does NOT contain target spawning algorithms directly.
 */
export type RoundState = 'start' | 'playing' | 'timeOver' | 'results';

/**
 * SixShotScene is the primary Phaser scene for the Six Shot aim training mode.
 *
 * Responsibilities:
 * - Phaser scene lifecycle
 * - managing round state flow (START -> PLAYING -> TIMEOVER -> RESULTS -> RESTART)
 * - managing the 30-second round timer & TIME OVER animation transition
 * - asking TargetManager to populate and maintain targets
 * - rendering targets and overlay screens via Phaser GameObjects
 *
 * It does NOT contain target spawning algorithms directly.
 */
export class SixShotScene extends Phaser.Scene {
  private targetManager!: TargetManager;
  private roundId!: string;

  /**
   * Map of targetId → Phaser Image game object for rendering.
   * Keeps visual objects tied to domain entities without leaking Phaser
   * references into the Target entity class.
   */
  private targetSprites: Map<string, Phaser.GameObjects.Image> = new Map();

  // Round flow state
  private roundState: RoundState = 'start';
  private remainingTime: number = SIX_SHOT_ROUND_DURATION;

  // Debug HUD state & text object
  private shotsFired: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private lastShotResult: string = 'None';
  private lastHitTargetId: string = 'None';
  private debugHudText!: Phaser.GameObjects.Text;

  // UI Overlay containers & transition objects
  private startContainer!: Phaser.GameObjects.Container;
  private resultsContainer!: Phaser.GameObjects.Container;
  private resultsStatsText!: Phaser.GameObjects.Text;
  private timeOverText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'SixShotScene' });
  }

  preload(): void {
    // Target texture is generated programmatically in create()
  }

  create(): void {
    // Set background color from game config
    const bgHex = typeof GAME_CONFIG.canvas.backgroundColor === 'string'
      ? GAME_CONFIG.canvas.backgroundColor
      : '#' + GAME_CONFIG.canvas.backgroundColor.toString(16);

    this.cameras.main.setBackgroundColor(bgHex);

    // Generate the target texture (concentric circles)
    this.generateTargetTexture();

    // Initialize TargetManager with canvas dimensions
    const { width, height } = GAME_CONFIG.canvas;
    this.targetManager = new TargetManager(width, height);

    // Generate a round ID for this session
    this.roundId = generateRoundId();

    // Set initial round state to start (timer paused at 30s)
    this.roundState = 'start';
    this.remainingTime = SIX_SHOT_ROUND_DURATION;
    this.shotsFired = 0;
    this.hits = 0;
    this.misses = 0;
    this.lastShotResult = 'None';
    this.lastHitTargetId = 'None';

    // Spawn initial 6 targets and render them behind start screen
    const targets = this.targetManager.spawnInitialTargets(this.roundId);
    for (const target of targets) {
      this.renderTarget(target);
    }

    // Create Temporary Debug HUD
    this.createDebugHud();

    // Create Start and Results UI Overlays
    this.createStartOverlay();
    this.createResultsOverlay();

    // Register pointerdown event listener for round flow and shooting
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer.worldX, pointer.worldY);
    });

    // Log spawn confirmation in development
    console.log(
      `[SixShotScene] Initialized in START state with ${this.targetManager.getActiveCount()} targets`
    );
  }

  override update(_time: number, delta: number): void {
    // Timer only ticks during active PLAYING state
    if (this.roundState !== 'playing') {
      return;
    }

    // delta is provided in milliseconds by Phaser; convert to seconds
    this.remainingTime -= delta / 1000;

    if (this.remainingTime <= 0) {
      this.triggerTimeOver();
    } else {
      this.updateDebugHud();
    }
  }

  /**
   * Main pointer input router based on current round state.
   */
  private handlePointerDown(x: number, y: number): void {
    if (this.roundState === 'start') {
      this.startRound();
    } else if (this.roundState === 'results') {
      this.restartRound();
    } else if (this.roundState === 'playing') {
      this.handleShot(x, y);
    }
    // If roundState === 'timeOver', ignore clicks completely during transition
  }

  /**
   * Start a new round: set state to playing and begin timer.
   */
  private startRound(): void {
    this.roundState = 'playing';
    this.remainingTime = SIX_SHOT_ROUND_DURATION;
    this.startContainer.setVisible(false);
    this.resultsContainer.setVisible(false);
    if (this.timeOverText) {
      this.timeOverText.setVisible(false);
    }
    this.updateDebugHud();
    console.log(`[SixShotScene] Round ${this.roundId} started.`);
  }

  /**
   * Trigger the animated TIME OVER transition state when the 30s timer reaches zero.
   */
  private triggerTimeOver(): void {
    this.roundState = 'timeOver';
    this.remainingTime = 0;
    this.updateDebugHud();

    const { width, height } = GAME_CONFIG.canvas;
    const centerX = width / 2;
    const centerY = height / 2;

    // Create TIME OVER text object if not already instantiated
    if (!this.timeOverText) {
      this.timeOverText = this.add.text(centerX, centerY, 'TIME OVER', {
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: '52px',
        color: '#ff3366',
        stroke: '#ffffff',
        strokeThickness: 2,
        align: 'center',
      }).setOrigin(0.5, 0.5);
      this.timeOverText.setDepth(300);
    }

    // Set initial animation properties
    this.timeOverText.setScale(0.75);
    this.timeOverText.setAlpha(0);
    this.timeOverText.setVisible(true);

    // Phase 1: Scale up + Fade in (~400ms)
    this.tweens.add({
      targets: this.timeOverText,
      scaleX: 1.0,
      scaleY: 1.0,
      alpha: 1,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        // Phase 2: Hold for 500ms, then Phase 3: Scale out + Fade out (~400ms)
        this.time.delayedCall(500, () => {
          this.tweens.add({
            targets: this.timeOverText,
            scaleX: 1.1,
            scaleY: 1.1,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
              this.timeOverText.setVisible(false);
              this.endRound();
            },
          });
        });
      },
    });

    console.log(`[SixShotScene] Round ${this.roundId} TIME OVER transition started.`);
  }

  /**
   * Conclude active round: set state to results and show summary overlay.
   */
  private endRound(): void {
    this.remainingTime = 0;
    this.roundState = 'results';
    this.updateResultsOverlay();
    this.resultsContainer.setVisible(true);
    this.updateDebugHud();
    console.log(`[SixShotScene] Round ${this.roundId} complete.`);
  }

  /**
   * Reset round statistics, recreate fresh targets, and start a new round.
   */
  private restartRound(): void {
    // 1. Destroy existing Phaser target sprites
    for (const sprite of this.targetSprites.values()) {
      sprite.destroy();
    }
    this.targetSprites.clear();

    // 2. Clear target manager collection
    this.targetManager.clearAll();

    // 3. Generate new round ID
    this.roundId = generateRoundId();

    // 4. Reset stats
    this.shotsFired = 0;
    this.hits = 0;
    this.misses = 0;
    this.lastShotResult = 'None';
    this.lastHitTargetId = 'None';

    // 5. Spawn 6 fresh targets using existing TargetManager logic
    const targets = this.targetManager.spawnInitialTargets(this.roundId);
    for (const target of targets) {
      this.renderTarget(target);
    }

    // 6. Transition state to playing and start timer
    this.startRound();
  }

  /**
   * Handle mouse pointer click event during PLAYING state.
   * Determines whether the click resulted in a HIT or MISS.
   * On HIT: destroys the hit target, spawns an immediate replacement, and provides hit visual feedback.
   * On MISS: displays a miss visual pulse.
   * Updates the Debug HUD metrics on every shot.
   */
  private handleShot(x: number, y: number): void {
    if (this.roundState !== 'playing') {
      return;
    }

    this.shotsFired++;

    const hitTarget = this.targetManager.checkHit(x, y);

    if (hitTarget) {
      this.hits++;
      this.lastShotResult = 'HIT';
      this.lastHitTargetId = hitTarget.targetId;

      // 1. Visual feedback on hit target position
      const hitGfx = this.add.graphics();
      hitGfx.fillStyle(0x00ff88, 0.6);
      hitGfx.fillCircle(hitTarget.x, hitTarget.y, hitTarget.size);
      hitGfx.lineStyle(2, 0x00ff88, 0.9);
      hitGfx.strokeCircle(hitTarget.x, hitTarget.y, hitTarget.size + 4);

      this.time.delayedCall(150, () => {
        hitGfx.destroy();
      });

      // 2. Destroy hit target's Phaser visual object
      const sprite = this.targetSprites.get(hitTarget.targetId);
      if (sprite) {
        sprite.destroy();
        this.targetSprites.delete(hitTarget.targetId);
      }

      // 3. Destroy target domain entity in TargetManager
      this.targetManager.destroyTarget(hitTarget.targetId);

      // 4. Immediately spawn replacement target to maintain active target count = 6
      const newTargets = this.targetManager.maintainTargetCount(this.roundId);
      for (const newTarget of newTargets) {
        this.renderTarget(newTarget);
      }
    } else {
      this.misses++;
      this.lastShotResult = 'MISS';
      this.lastHitTargetId = 'None';

      // Visual feedback: temporary red pulse at click location
      const missGfx = this.add.graphics();
      missGfx.fillStyle(0xff3344, 0.6);
      missGfx.fillCircle(x, y, 5);
      missGfx.lineStyle(2, 0xff3344, 0.8);
      missGfx.strokeCircle(x, y, 12);

      this.time.delayedCall(200, () => {
        missGfx.destroy();
      });
    }

    this.updateDebugHud();
  }

  /**
   * Create the Start Screen UI Overlay container.
   */
  private createStartOverlay(): void {
    const { width, height } = GAME_CONFIG.canvas;
    const centerX = width / 2;
    const centerY = height / 2;

    const bgDim = this.add.rectangle(centerX, centerY, width, height, 0x090b14, 0.85);

    const panel = this.add.rectangle(centerX, centerY, 480, 260, 0x121626, 0.95);
    panel.setStrokeStyle(2, 0x00ff88, 0.8);

    const title = this.add.text(centerX, centerY - 65, 'SIX SHOT', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '36px',
      color: '#00ff88',
    }).setOrigin(0.5, 0.5);

    const subtitle = this.add.text(centerX, centerY - 20, 'Precision Aim Trainer (30s)', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '14px',
      color: '#88aacc',
    }).setOrigin(0.5, 0.5);

    const startPrompt = this.add.text(centerX, centerY + 50, 'TAP TO START', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '22px',
      color: '#ffffff',
    }).setOrigin(0.5, 0.5);

    this.startContainer = this.add.container(0, 0, [
      bgDim,
      panel,
      title,
      subtitle,
      startPrompt,
    ]);

    this.startContainer.setDepth(200);
    this.startContainer.setVisible(true);
  }

  /**
   * Create the Results Screen UI Overlay container.
   */
  private createResultsOverlay(): void {
    const { width, height } = GAME_CONFIG.canvas;
    const centerX = width / 2;
    const centerY = height / 2;

    const bgDim = this.add.rectangle(centerX, centerY, width, height, 0x090b14, 0.85);

    const panel = this.add.rectangle(centerX, centerY, 480, 300, 0x121626, 0.95);
    panel.setStrokeStyle(2, 0x00ffcc, 0.8);

    const title = this.add.text(centerX, centerY - 100, 'ROUND COMPLETE', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '28px',
      color: '#00ffcc',
    }).setOrigin(0.5, 0.5);

    this.resultsStatsText = this.add.text(centerX, centerY - 10, '', {
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      fontSize: '16px',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5, 0.5);

    const restartPrompt = this.add.text(centerX, centerY + 95, 'TAP TO RESTART', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '20px',
      color: '#00ffcc',
    }).setOrigin(0.5, 0.5);

    this.resultsContainer = this.add.container(0, 0, [
      bgDim,
      panel,
      title,
      this.resultsStatsText,
      restartPrompt,
    ]);

    this.resultsContainer.setDepth(200);
    this.resultsContainer.setVisible(false);
  }

  /**
   * Update text content of Results Overlay using final round statistics.
   */
  private updateResultsOverlay(): void {
    const accuracy = this.shotsFired > 0
      ? ((this.hits / this.shotsFired) * 100).toFixed(1)
      : '0.0';

    const lines = [
      `Shots Fired : ${this.shotsFired}`,
      `Hits        : ${this.hits}`,
      `Misses      : ${this.misses}`,
      `Accuracy    : ${accuracy}%`,
    ];

    this.resultsStatsText.setText(lines.join('\n'));
  }

  /**
   * Initialize the temporary Debug HUD text display in top-left corner.
   */
  private createDebugHud(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      fontSize: '13px',
      color: '#00ffcc',
      backgroundColor: '#0a0d18cc',
      padding: { x: 12, y: 10 },
    };

    this.debugHudText = this.add.text(16, 16, '', style);
    this.debugHudText.setDepth(100);
    this.updateDebugHud();
  }

  /**
   * Update the text content of the temporary Debug HUD.
   */
  private updateDebugHud(): void {
    const accuracy = this.shotsFired > 0
      ? ((this.hits / this.shotsFired) * 100).toFixed(1)
      : '0.0';

    const shortTargetId = this.lastHitTargetId !== 'None'
      ? (this.lastHitTargetId.length > 12 ? `${this.lastHitTargetId.substring(0, 10)}...` : this.lastHitTargetId)
      : 'None';

    const timeStr = `${this.remainingTime.toFixed(1)}s`;
    let statusStr = 'START SCREEN';
    if (this.roundState === 'playing') {
      statusStr = 'PLAYING';
    } else if (this.roundState === 'timeOver') {
      statusStr = 'TIME OVER';
    } else if (this.roundState === 'results') {
      statusStr = 'RESULTS';
    }

    const textLines = [
      '=== [DEBUG HUD - SIX SHOT] ===',
      `Time       : ${timeStr}`,
      `Status     : ${statusStr}`,
      `Shots Fired: ${this.shotsFired}`,
      `Hits       : ${this.hits}`,
      `Misses     : ${this.misses}`,
      `Accuracy   : ${accuracy}%`,
      `Active Tgts: ${this.targetManager ? this.targetManager.getActiveCount() : 0}`,
      `Last Shot  : ${this.lastShotResult}`,
      `Target     : ${shortTargetId}`,
    ];

    if (this.roundState === 'results') {
      textLines.push('------------------------------');
      textLines.push('*** ROUND COMPLETE ***');
    }

    this.debugHudText.setText(textLines.join('\n'));
  }

  /**
   * Generate the concentric-circle target texture using Phaser 4 Graphics API.
   * Creates a simple aim-trainer-style bullseye: outer ring, middle ring, center dot.
   */
  private generateTargetTexture(): void {
    const radius = GAME_CONFIG.sixShot.targetRadius;
    const diameter = radius * 2;

    const graphics = this.add.graphics();

    // Outer circle (darkest ring)
    graphics.fillStyle(0xcc2244, 1);
    graphics.fillCircle(radius, radius, radius);

    // Second ring
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(radius, radius, radius * 0.75);

    // Third ring
    graphics.fillStyle(0xcc2244, 1);
    graphics.fillCircle(radius, radius, radius * 0.5);

    // Center bullseye dot
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(radius, radius, radius * 0.25);

    // Outer stroke ring for visibility against dark background
    graphics.lineStyle(2, 0xff4466, 0.8);
    graphics.strokeCircle(radius, radius, radius - 1);

    // Bake to texture and destroy the temporary Graphics object
    graphics.generateTexture(TARGET_TEXTURE_KEY, diameter, diameter);
    graphics.destroy();
  }

  /**
   * Create a Phaser Image for a Target entity at its position.
   * The image is centered on the target's logical coordinates.
   */
  private renderTarget(target: Target): void {
    const image = this.add.image(target.x, target.y, TARGET_TEXTURE_KEY);

    // Phaser Images have origin at 0.5 by default, centering the texture on (x, y).
    // No need to explicitly set origin.

    this.targetSprites.set(target.targetId, image);
  }
}
