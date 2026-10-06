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
export class SixShotScene extends Phaser.Scene {
  private targetManager!: TargetManager;
  private roundId!: string;

  /**
   * Map of targetId → Phaser Image game object for rendering.
   * Keeps visual objects tied to domain entities without leaking Phaser
   * references into the Target entity class.
   */
  private targetSprites: Map<string, Phaser.GameObjects.Image> = new Map();

  // Round timer state
  private remainingTime: number = SIX_SHOT_ROUND_DURATION;
  private roundActive: boolean = true;

  // Debug HUD state & text object
  private shotsFired: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private lastShotResult: string = 'None';
  private lastHitTargetId: string = 'None';
  private debugHudText!: Phaser.GameObjects.Text;

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

    // Reset round timer state
    this.remainingTime = SIX_SHOT_ROUND_DURATION;
    this.roundActive = true;

    // Spawn initial 6 targets and render them
    const targets = this.targetManager.spawnInitialTargets(this.roundId);
    for (const target of targets) {
      this.renderTarget(target);
    }

    // Create Temporary Debug HUD
    this.createDebugHud();

    // Register pointerdown event listener for shot recording & hit detection
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handleShot(pointer.worldX, pointer.worldY);
    });

    // Log spawn confirmation in development
    console.log(
      `[SixShotScene] Spawned ${this.targetManager.getActiveCount()} targets for round ${this.roundId}`
    );
  }

  override update(_time: number, delta: number): void {
    if (!this.roundActive) return;

    // delta is provided in milliseconds by Phaser; convert to seconds
    this.remainingTime -= delta / 1000;

    if (this.remainingTime <= 0) {
      this.remainingTime = 0;
      this.roundActive = false;
      console.log(`[SixShotScene] Round ${this.roundId} complete.`);
    }

    this.updateDebugHud();
  }

  /**
   * Handle mouse pointer click event.
   * Determines whether the click resulted in a HIT or MISS.
   * Ignored if the round is no longer active (timer reached 0).
   * On HIT: destroys the hit target, spawns an immediate replacement, and provides hit visual feedback.
   * On MISS: displays a miss visual pulse.
   * Updates the Debug HUD metrics on every shot.
   */
  private handleShot(x: number, y: number): void {
    // Prevent processing any shot after timer reaches 0
    if (!this.roundActive) {
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
    const statusStr = this.roundActive ? 'ACTIVE' : 'ROUND COMPLETE';

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

    if (!this.roundActive) {
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
