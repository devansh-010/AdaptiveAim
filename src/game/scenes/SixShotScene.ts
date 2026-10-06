import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
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
 * - asking TargetManager to populate the initial targets
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

    // Spawn initial 6 targets and render them
    const targets = this.targetManager.spawnInitialTargets(this.roundId);
    for (const target of targets) {
      this.renderTarget(target);
    }

    // Log spawn confirmation in development
    console.log(
      `[SixShotScene] Spawned ${this.targetManager.getActiveCount()} targets for round ${this.roundId}`
    );

    // TODO: Initialize RoundManager system
    // TODO: Register pointerdown input listener for shot recording & hit detection
  }

  override update(_time: number, _delta: number): void {
    // TODO: Update round timer and monitor scene state
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
