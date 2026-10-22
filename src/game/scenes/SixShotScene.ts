import Phaser from 'phaser';
import {
  GAME_CONFIG,
  SIX_SHOT_ROUND_DURATION,
  SIX_SHOT_AIM_SENSITIVITY,
  DEFAULT_MAX_AIM_DISTANCE,
} from '../config/gameConfig.ts';
import { TargetManager } from '../systems/TargetManager.ts';
import { generateRoundId, generateShotId } from '../../telemetry/ids.ts';
import { telemetryCollector } from '../../telemetry/TelemetryCollector.ts';
import type { Target } from '../entities/Target.ts';
import type { ShotTelemetry } from '../../telemetry/types';
import { EnvironmentRenderer } from '../rendering/EnvironmentRenderer.ts';
import { TrajectorySampler } from '../systems/TrajectorySampler.ts';

/**
 * Texture key for the circular target graphic.
 */
const TARGET_TEXTURE_KEY = 'target_circle';

/**
 * Texture key for the weapon / hand SVG asset.
 */
const WEAPON_TEXTURE_KEY = 'weapon_hand_gun';

export type RoundState = 'start' | 'playing' | 'timeOver' | 'results';

/**
 * SixShotScene is the primary Phaser scene for the Six Shot FPS aim trainer mode.
 *
 * Responsibilities:
 * - Phaser scene lifecycle & responsive viewport scaling
 * - FPS-style aim control via browser Pointer Lock API
 * - Fixed center crosshair aiming system & relative target/world movement
 * - Anchored first-person weapon visual & click recoil feedback
 * - Managing round state flow (START -> PLAYING -> TIMEOVER -> RESULTS -> RESTART)
 * - 30-second round timer & TIME OVER transition
 * - Spawning, rendering, hit detection, replacement of targets, and telemetry recording
 *   including Reaction Time and Precision metrics per shot.
 */
export class SixShotScene extends Phaser.Scene {
  protected targetManager!: TargetManager;
  protected roundId!: string;
  protected modeKey: string = 'six_shot';
  protected modeTitle: string = 'SIX SHOT';
  protected modeSubtitle: string = 'Hit the targets as accurately and quickly as you can.';
  protected modeDifficulty: string = 'fixed';
  protected roundDuration: number = SIX_SHOT_ROUND_DURATION;

  /**
   * Environment renderer for procedural checkerboard walls, floor, ceiling, and barrier.
   */
  protected environmentRenderer!: EnvironmentRenderer;

  /**
   * Map of targetId → Phaser Image game object for rendering.
   */
  protected targetSprites: Map<string, Phaser.GameObjects.Image> = new Map();

  // Round flow state
  protected roundState: RoundState = 'start';
  protected remainingTime: number = SIX_SHOT_ROUND_DURATION;

  // Pointer lock & FPS aiming system state
  protected pointerLocked: boolean = false;
  protected aimOffsetX: number = 0;
  protected aimOffsetY: number = 0;

  // Round statistics
  protected shotsFired: number = 0;
  protected hits: number = 0;
  protected misses: number = 0;
  protected lastShotResult: string = 'None';
  protected lastHitTargetId: string = 'None';

  // Trajectory sampling system
  protected trajectorySampler: TrajectorySampler = new TrajectorySampler();
  private trajectorySamplingActive: boolean = false;
  private trajectorySamplingTimer: ReturnType<typeof setInterval> | null = null;
  private boundRawMouseHandler: ((event: MouseEvent) => void) | null = null;
  private readonly onPointerDown = (pointer: Phaser.Input.Pointer) => {
    this.handlePointerDown(pointer.worldX, pointer.worldY);
  };
  private readonly onPointerMove = (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer);
  private readonly onResize = (gameSize: Phaser.Structs.Size) => {
    this.handleResize(gameSize.width, gameSize.height);
  };
  private readonly onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.game.canvas;
    if (!this.pointerLocked) this.trajectorySampler.clearAccumulatedMovement();
    this.lockNoticeText?.setVisible(this.roundState === 'playing' && !this.pointerLocked);
  };
  private readonly onSceneCleanup = () => this.cleanupScene();

  public getLastShotResult(): string {
    return this.lastShotResult;
  }

  public getLastHitTargetId(): string {
    return this.lastHitTargetId;
  }

  // HUD elements
  protected hudContainer!: Phaser.GameObjects.Container;
  protected hudTimeText!: Phaser.GameObjects.Text;
  protected hudHitsText!: Phaser.GameObjects.Text;
  protected hudAccText!: Phaser.GameObjects.Text;

  // Navigation exit button
  protected exitButton!: Phaser.GameObjects.Text;

  // UI Overlay containers & transition objects
  protected startContainer!: Phaser.GameObjects.Container;
  protected resultsContainer!: Phaser.GameObjects.Container;
  protected resultsStatsText!: Phaser.GameObjects.Text;
  protected timeOverText!: Phaser.GameObjects.Text;

  // FPS Aiming visual elements
  private crosshairContainer!: Phaser.GameObjects.Container;
  private weaponImage!: Phaser.GameObjects.Image;
  private lockNoticeText!: Phaser.GameObjects.Text;

  constructor(config: Phaser.Types.Scenes.SettingsConfig = { key: 'SixShotScene' }) {
    super(config);
  }

  preload(): void {
    // Load modern SVG FPS weapon/hand illustration asset
    this.load.image(WEAPON_TEXTURE_KEY, 'assets/aim-hand-gun.svg');
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Set background color from game config
    const bgHex = typeof GAME_CONFIG.canvas.backgroundColor === 'string'
      ? GAME_CONFIG.canvas.backgroundColor
      : '#' + GAME_CONFIG.canvas.backgroundColor.toString(16);

    this.cameras.main.setBackgroundColor(bgHex);

    // Initialize Environment Renderer (checkerboard back wall, floor, ceiling, and barrier)
    this.environmentRenderer = new EnvironmentRenderer(this);
    this.environmentRenderer.create(width, height);

    // Generate circular target texture
    this.generateTargetTexture();

    // Initialize TargetManager with current viewport dimensions
    this.initTargetManager(width, height);

    // Set initial round state to start
    this.roundState = 'start';
    this.remainingTime = this.roundDuration;
    this.shotsFired = 0;
    this.hits = 0;
    this.misses = 0;
    this.lastShotResult = 'None';
    this.lastHitTargetId = 'None';
    this.aimOffsetX = 0;
    this.aimOffsetY = 0;

    // Create HUD, Exit Button, Crosshair, Weapon visual, Pointer Lock fallback, and Overlays
    this.createHud();
    this.createExitButton();
    this.createCrosshair();
    this.createWeaponVisual();
    this.createLockNotice();
    this.createStartOverlay();
    this.createResultsOverlay();

    // Register Pointer Lock status change listeners
    this.setupPointerLockListeners();

    // Register pointer down listener for gesture lock and shooting
    this.input.on('pointerdown', this.onPointerDown);

    // Register pointer move listener for FPS relative mouse aiming
    this.input.on('pointermove', this.onPointerMove);

    // Listen to window / canvas resize events
    this.scale.on('resize', this.onResize);

    console.log(
      `[SixShotScene] Initialized in START state (${width}x${height}). Waiting for TAP TO START.`
    );
  }

  /**
   * Factory hook to instantiate TargetManager. Overridden in MovingTargetsScene.
   */
  protected initTargetManager(width: number, height: number): void {
    this.targetManager = new TargetManager(
      width,
      height,
      GAME_CONFIG.sixShot.targetCount,
      GAME_CONFIG.sixShot.targetRadius,
      GAME_CONFIG.sixShot.spawnMargin,
      GAME_CONFIG.sixShot.minTargetSeparation,
      GAME_CONFIG.sixShot.spawnRetryLimit,
      false,
      0,
      GAME_CONFIG.sixShot.maxAimDistance ?? DEFAULT_MAX_AIM_DISTANCE
    );
  }

  /**
   * Lifecycle hook invoked prior to rendering targets in update().
   * Overridden in MovingTargetsScene to advance target positions.
   */
  protected onPreUpdate(_delta: number): void {
    // No-op for stationary targets in Six Shot
  }

  /**
   * Update round timing (countdown in Six Shot / Moving Targets; elapsed in Thirty Shot).
   */
  protected updateTimer(delta: number): void {
    // delta is provided in milliseconds by Phaser; convert to seconds
    this.remainingTime -= delta / 1000;

    if (this.remainingTime <= 0) {
      this.triggerTimeOver();
    }
  }

  override update(_time: number, delta: number): void {
    this.onPreUpdate(delta);
    // Continuously update rendered target positions relative to aim offset
    this.updateTargetPositions();

    // Update environment parallax and tile positions based on aim offset
    if (this.environmentRenderer) {
      this.environmentRenderer.update(
        this.aimOffsetX,
        this.aimOffsetY,
        this.scale.width,
        this.scale.height
      );
    }

    // Timer only ticks during active PLAYING state
    if (this.roundState !== 'playing') {
      return;
    }

    this.updateTimer(delta);
    this.updateHud();
  }

  /**
   * Update visual sprite positions for all targets based on logical spawn position and current aim offset.
   */
  private updateTargetPositions(): void {
    for (const [targetId, sprite] of this.targetSprites.entries()) {
      const target = this.targetManager.getTarget(targetId);
      if (target) {
        sprite.setPosition(target.x - this.aimOffsetX, target.y - this.aimOffsetY);
      }
    }
  }

  /**
   * Handle relative mouse movement when pointer is locked during gameplay.
   */
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.roundState === 'playing' && this.pointerLocked) {
      const movementX = pointer.movementX || 0;
      const movementY = pointer.movementY || 0;

      this.aimOffsetX += movementX * SIX_SHOT_AIM_SENSITIVITY;
      this.aimOffsetY += movementY * SIX_SHOT_AIM_SENSITIVITY;

      // Clamp aim offset to prevent targets from being lost indefinitely outside viewport
      const maxOffset = Math.max(this.scale.width, this.scale.height) * 0.8;
      this.aimOffsetX = Phaser.Math.Clamp(this.aimOffsetX, -maxOffset, maxOffset);
      this.aimOffsetY = Phaser.Math.Clamp(this.aimOffsetY, -maxOffset, maxOffset);

      if (this.targetManager) {
        this.targetManager.setAimOffset(this.aimOffsetX, this.aimOffsetY);
      }
    }
  }

  /**
   * Listen to browser pointer lock change events.
   */
  private setupPointerLockListeners(): void {
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mozpointerlockchange', this.onPointerLockChange);
    // React destroys the whole game on exit; Phaser 4 emits DESTROY directly
    // on that path, without first emitting SHUTDOWN.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onSceneCleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onSceneCleanup);
  }

  private cleanupScene(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onSceneCleanup);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.onSceneCleanup);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mozpointerlockchange', this.onPointerLockChange);
    this.scale.off('resize', this.onResize);
    this.input.off('pointerdown', this.onPointerDown);
    this.input.off('pointermove', this.onPointerMove);
    this.stopTrajectoryCollection();
    const round = telemetryCollector.getCurrentRound();
    if (this.roundState === 'playing' && round?.round_id === this.roundId && !round.end_time) {
      telemetryCollector.endRound();
    }
    this.trajectorySampler.reset();
    this.clearTargets();
    this.environmentRenderer?.destroy();
    this.releasePointerLock();
    this.roundState = 'start';
  }

  /**
   * Request browser pointer lock.
   */
  private requestPointerLock(): void {
    try {
      if (this.input && this.input.mouse) {
        this.input.mouse.requestPointerLock();
      }
    } catch (e) {
      console.warn('[SixShotScene] Pointer lock request error:', e);
    }
  }

  /**
   * Release browser pointer lock.
   */
  private releasePointerLock(): void {
    try {
      if (document.pointerLockElement === this.game.canvas) {
        document.exitPointerLock();
      } else if (!document.pointerLockElement && this.input?.mouse?.locked) {
        this.input.mouse.releasePointerLock();
      }
    } catch (e) {
      console.warn('[SixShotScene] Pointer lock release error:', e);
    }
    this.pointerLocked = false;
  }

  /**
   * Handle dynamic viewport resize to keep HUD, overlays, exit button, weapon, and crosshair aligned.
   */
  private handleResize(width: number, height: number): void {
    const maxOffset = Math.max(width, height) * 0.8;
    this.aimOffsetX = Phaser.Math.Clamp(this.aimOffsetX, -maxOffset, maxOffset);
    this.aimOffsetY = Phaser.Math.Clamp(this.aimOffsetY, -maxOffset, maxOffset);
    if (this.environmentRenderer) {
      this.environmentRenderer.resize(width, height);
    }
    if (this.targetManager) {
      this.targetManager.updateSpawnArea(width, height);
      this.targetManager.setAimOffset(this.aimOffsetX, this.aimOffsetY);
      this.updateTargetPositions();
    }
    if (this.hudContainer) {
      this.hudContainer.setPosition(width / 2, 30);
    }
    if (this.startContainer) {
      this.startContainer.setPosition(width / 2, height / 2);
    }
    if (this.resultsContainer) {
      this.resultsContainer.setPosition(width / 2, height / 2);
    }
    if (this.exitButton) {
      this.exitButton.setPosition(width - 20, 20);
    }
    if (this.timeOverText) {
      this.timeOverText.setPosition(width / 2, height / 2);
    }
    if (this.crosshairContainer) {
      this.crosshairContainer.setPosition(width / 2, height / 2);
    }
    if (this.weaponImage) {
      this.weaponImage.setPosition(width, height);
    }
    if (this.lockNoticeText) {
      this.lockNoticeText.setPosition(width / 2, height / 2 + 100);
    }
  }

  /**
   * Main pointer input router based on current round state.
   */
  private handlePointerDown(x: number, y: number): void {
    // 1. Exit Button click check
    if (this.exitButton && this.exitButton.getBounds().contains(x, y)) {
      this.releasePointerLock();
      const onExit = this.game.registry.get('onExit');
      if (typeof onExit === 'function') {
        onExit();
      }
      return;
    }

    // 2. Route interaction based on roundState
    if (this.roundState === 'start') {
      this.startRound();
      this.requestPointerLock();
    } else if (this.roundState === 'results') {
      this.restartRound();
      this.requestPointerLock();
    } else if (this.roundState === 'playing') {
      if (!this.pointerLocked) {
        this.requestPointerLock();
      } else {
        this.handleShot();
      }
    }
  }

  /**
   * Clear existing target sprites and target manager data.
   */
  private clearTargets(): void {
    for (const sprite of this.targetSprites.values()) {
      sprite.destroy();
    }
    this.targetSprites.clear();
    if (this.targetManager) {
      this.targetManager.clearAll();
    }
  }

  /**
   * Reset round statistics & aim offset. Overridden in ThirtyShotScene.
   */
  protected resetRoundState(): void {
    this.roundState = 'playing';
    this.remainingTime = this.roundDuration;
    this.shotsFired = 0;
    this.hits = 0;
    this.misses = 0;
    this.lastShotResult = 'None';
    this.lastHitTargetId = 'None';
    this.aimOffsetX = 0;
    this.aimOffsetY = 0;
    if (this.targetManager) {
      this.targetManager.setAimOffset(0, 0);
    }
  }

  /**
   * Start a new round: set state to playing, reset stats and aim offset, start telemetry round, and spawn initial targets.
   */
  protected startRound(): void {
    // 1. Clear any existing targets
    this.clearTargets();

    // 2. Stop any previous trajectory collection (ensures clean state on restart)
    this.stopTrajectoryCollection();

    // 3. Generate unique round ID
    this.roundId = generateRoundId();

    // 4. Reset round statistics & aim offset
    this.resetRoundState();

    // 5. Initialize Telemetry collector for this round
    telemetryCollector.startRound(this.roundId, this.modeKey, this.modeDifficulty);

    // 6. Spawn initial targets (records target spawn events in telemetry)
    const targets = this.targetManager.spawnInitialTargets(this.roundId);
    for (const target of targets) {
      this.renderTarget(target);
    }

    // 7. Start trajectory sampling for this round
    this.startTrajectoryCollection();

    // 8. Update UI visibility
    this.startContainer.setVisible(false);
    this.resultsContainer.setVisible(false);
    if (this.timeOverText) {
      this.timeOverText.setVisible(false);
    }
    if (this.lockNoticeText) {
      this.lockNoticeText.setVisible(!this.pointerLocked);
    }

    this.updateHud();
    console.log(`[${this.constructor.name}] Round ${this.roundId} started with telemetry recording.`);
  }

  /**
   * Conclude gameplay with animated transition banner ('TIME OVER' or 'ROUND COMPLETE').
   */
  protected triggerRoundTransition(bannerText: string = 'TIME OVER', bannerColor: string = '#ff3366'): void {
    this.roundState = 'timeOver';
    this.remainingTime = 0;

    // Stop trajectory sampling and finalize trailing segment before ending the round
    this.stopTrajectoryCollection();

    this.releasePointerLock();

    // Finalize telemetry recording for current round
    telemetryCollector.endRound();

    if (this.lockNoticeText) {
      this.lockNoticeText.setVisible(false);
    }

    this.updateHud();

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    if (!this.timeOverText) {
      this.timeOverText = this.add.text(centerX, centerY, bannerText, {
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: '52px',
        color: bannerColor,
        stroke: '#ffffff',
        strokeThickness: 2,
        align: 'center',
      }).setOrigin(0.5, 0.5);
      this.timeOverText.setDepth(300);
    } else {
      this.timeOverText.setText(bannerText);
      this.timeOverText.setColor(bannerColor);
    }

    this.timeOverText.setPosition(centerX, centerY);
    this.timeOverText.setScale(0.75);
    this.timeOverText.setAlpha(0);
    this.timeOverText.setVisible(true);

    this.tweens.add({
      targets: this.timeOverText,
      scaleX: 1.0,
      scaleY: 1.0,
      alpha: 1,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
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

    console.log(`[${this.constructor.name}] Round ${this.roundId} transition '${bannerText}' started.`);
  }

  /**
   * Trigger the animated TIME OVER transition state when timer reaches zero.
   */
  protected triggerTimeOver(): void {
    this.triggerRoundTransition('TIME OVER', '#ff3366');
  }

  /**
   * Conclude active round: set state to results, release pointer lock, and show summary overlay.
   */
  protected endRound(): void {
    this.remainingTime = 0;
    this.roundState = 'results';
    this.releasePointerLock();

    this.updateResultsOverlay();
    this.resultsContainer.setVisible(true);
    this.updateHud();
    console.log(`[${this.constructor.name}] Round ${this.roundId} complete.`);
  }

  /**
   * Reset round statistics, recreate fresh targets, reset aim offset, and start new round.
   */
  protected restartRound(): void {
    this.startRound();
  }

  /**
   * Handle shot fired at the fixed center crosshair position.
   * Calculates logical crosshair world coordinates, reaction time, and precision distance for telemetry.
   */
  private handleShot(): void {
    if (this.roundState !== 'playing') {
      return;
    }

    this.shotsFired++;

    // Fixed center crosshair screen position
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    // World coordinates corresponding to crosshair position
    const worldX = centerX + this.aimOffsetX;
    const worldY = centerY + this.aimOffsetY;

    // Trigger subtle weapon recoil and flash
    this.triggerWeaponRecoil();

    const hitTarget = this.targetManager.checkHit(worldX, worldY);
    const shotId = generateShotId();
    const timestamp = new Date().toISOString();

    // Finalize the pre-shot trajectory segment with this shot's ID, capturing
    // pending movement and current logical aim position at the shot boundary
    this.trajectorySampler.handleShotBoundary(
      shotId,
      hitTarget ? hitTarget.targetId : null,
      worldX,
      worldY,
      timestamp
    );

    if (hitTarget) {
      this.hits++;
      this.lastShotResult = 'HIT';
      this.lastHitTargetId = hitTarget.targetId;

      // Precision: Euclidean distance between crosshair logical position and target logical center
      const dx = worldX - hitTarget.x;
      const dy = worldY - hitTarget.y;
      const precision = Number(Math.sqrt(dx * dx + dy * dy).toFixed(2));

      // Reaction time: (shot_timestamp - target_spawn_time) in seconds
      const spawnMs = new Date(hitTarget.spawnTime).getTime();
      const shotMs = new Date(timestamp).getTime();
      const reactionTime = Number(((shotMs - spawnMs) / 1000).toFixed(3));

      // Record HIT shot telemetry
      const shotTelemetry: ShotTelemetry = {
        shot_id: shotId,
        round_id: this.roundId,
        target_id: hitTarget.targetId,
        timestamp,
        hit: true,
        player_x: worldX,
        player_y: worldY,
        target_x: hitTarget.x,
        target_y: hitTarget.y,
        target_size: hitTarget.size,
        target_speed: hitTarget.movementSpeed,
        distance_to_target: precision,
        reaction_time: reactionTime,
        precision,
      };
      telemetryCollector.recordShot(shotTelemetry);

      // Screen position of hit target
      const hitScreenX = hitTarget.x - this.aimOffsetX;
      const hitScreenY = hitTarget.y - this.aimOffsetY;

      // Visual feedback: bright neon-green glowing ring expansion at target position
      const hitGfx = this.add.graphics();
      hitGfx.fillStyle(0x00ff66, 0.5);
      hitGfx.fillCircle(hitScreenX, hitScreenY, hitTarget.size + 3);
      hitGfx.lineStyle(2, 0xaaffcc, 0.9);
      hitGfx.strokeCircle(hitScreenX, hitScreenY, hitTarget.size + 8);
      hitGfx.setDepth(100);

      this.time.delayedCall(120, () => {
        hitGfx.destroy();
      });

      // Handle target visual & entity destruction and replacement
      this.onTargetHitCompleted(hitTarget, timestamp);
    } else {
      this.misses++;
      this.lastShotResult = 'MISS';
      this.lastHitTargetId = 'None';

      // Record MISS shot telemetry (target_id, target_x/y, reaction_time, precision are null)
      const shotTelemetry: ShotTelemetry = {
        shot_id: shotId,
        round_id: this.roundId,
        target_id: null,
        timestamp,
        hit: false,
        player_x: worldX,
        player_y: worldY,
        target_x: null,
        target_y: null,
        target_size: null,
        target_speed: null,
        distance_to_target: null,
        reaction_time: null,
        precision: null,
      };
      telemetryCollector.recordShot(shotTelemetry);

      // Visual feedback: temporary red pulse at center crosshair location
      const missGfx = this.add.graphics();
      missGfx.fillStyle(0xff3344, 0.6);
      missGfx.fillCircle(centerX, centerY, 4);
      missGfx.lineStyle(2, 0xff3344, 0.8);
      missGfx.strokeCircle(centerX, centerY, 10);

      this.time.delayedCall(180, () => {
        missGfx.destroy();
      });
    }

    this.updateHud();
  }

  /**
   * Play subtle weapon recoil movement animation and muzzle flash.
   */
  private triggerWeaponRecoil(): void {
    if (!this.weaponImage) return;

    const baseWidth = this.scale.width;
    const baseHeight = this.scale.height;

    this.tweens.add({
      targets: this.weaponImage,
      x: baseWidth + 8,
      y: baseHeight + 10,
      rotation: 0.03,
      duration: 45,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.weaponImage.setPosition(baseWidth, baseHeight);
        this.weaponImage.setRotation(0);
      },
    });

    // Muzzle flash graphic at barrel tip
    const flashX = baseWidth - 250;
    const flashY = baseHeight - 240;
    const flashGfx = this.add.graphics();
    flashGfx.fillStyle(0x00ffff, 0.8);
    flashGfx.fillCircle(flashX, flashY, 14);
    flashGfx.fillStyle(0xffffff, 0.95);
    flashGfx.fillCircle(flashX, flashY, 7);
    flashGfx.setDepth(130);

    this.time.delayedCall(50, () => {
      flashGfx.destroy();
    });
  }

  /**
   * Create fixed center crosshair permanently positioned at (width/2, height/2).
   */
  private createCrosshair(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    const gfx = this.add.graphics();
    const gap = 3;
    const length = 6;
    const thickness = 1.5;

    // Crosshair dark outline for contrast against any background
    gfx.lineStyle(thickness + 1.5, 0x0a0c12, 0.85);
    gfx.lineBetween(0, -gap, 0, -gap - length);
    gfx.lineBetween(0, gap, 0, gap + length);
    gfx.lineBetween(-gap, 0, -gap - length, 0);
    gfx.lineBetween(gap, 0, gap + length, 0);

    // Crosshair crisp lines with subtle cyan-white tint
    gfx.lineStyle(thickness, 0x00ffff, 0.95);
    gfx.lineBetween(0, -gap, 0, -gap - length);
    gfx.lineBetween(0, gap, 0, gap + length);
    gfx.lineBetween(-gap, 0, -gap - length, 0);
    gfx.lineBetween(gap, 0, gap + length, 0);

    // Center precision dot
    gfx.fillStyle(0xffffff, 0.95);
    gfx.fillCircle(0, 0, 1);

    this.crosshairContainer = this.add.container(centerX, centerY, [gfx]);
    this.crosshairContainer.setDepth(150);
  }

  /**
   * Create modern FPS weapon visual anchored to lower-right corner of viewport.
   */
  private createWeaponVisual(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.weaponImage = this.add.image(width, height, WEAPON_TEXTURE_KEY);
    this.weaponImage.setOrigin(1.0, 1.0);
    this.weaponImage.setDisplaySize(320, 320);
    this.weaponImage.setDepth(120);
  }

  /**
   * Create fallback prompt shown when pointer lock is lost during active gameplay.
   */
  private createLockNotice(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2 + 100;

    this.lockNoticeText = this.add.text(centerX, centerY, '[ CLICK TO CAPTURE MOUSE ]', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '16px',
      color: '#00e5ff',
      backgroundColor: '#090b14dd',
      padding: { x: 14, y: 8 },
    })
    .setOrigin(0.5, 0.5)
    .setDepth(210);

    this.lockNoticeText.setVisible(false);
  }

  /**
   * Create Exit Button in top-right corner.
   */
  private createExitButton(): void {
    const margin = 18;
    const x = this.scale.width - margin;
    const y = margin;

    this.exitButton = this.add.text(x, y, '← EXIT', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '12px',
      color: '#8fa0b5',
      backgroundColor: '#121520dd',
      padding: { x: 12, y: 7 },
    })
    .setOrigin(1, 0)
    .setDepth(250);
  }

  /**
   * Create Gameplay HUD panel at top-center.
   * Compact, translucent dark banner with white numbers and restrained cyan accents.
   */
  private createHud(): void {
    const centerX = this.scale.width / 2;
    const centerY = 30;

    const bg = this.add.rectangle(0, 0, 360, 40, 0x10131d, 0.82);
    bg.setStrokeStyle(1, 0x272c3d, 0.9);

    const timeLabel = this.add.text(-120, -10, 'TIME', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '10px',
      color: '#7e8b9f',
    }).setOrigin(0.5, 0.5);

    this.hudTimeText = this.add.text(-120, 6, '30.0s', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '16px',
      color: '#00e5ff',
    }).setOrigin(0.5, 0.5);

    const hitsLabel = this.add.text(0, -10, 'HITS', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '10px',
      color: '#7e8b9f',
    }).setOrigin(0.5, 0.5);

    this.hudHitsText = this.add.text(0, 6, '0', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5, 0.5);

    const accLabel = this.add.text(120, -10, 'ACCURACY', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '10px',
      color: '#7e8b9f',
    }).setOrigin(0.5, 0.5);

    this.hudAccText = this.add.text(120, 6, '0.0%', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '16px',
      color: '#00ffcc',
    }).setOrigin(0.5, 0.5);

    this.hudContainer = this.add.container(centerX, centerY, [
      bg,
      timeLabel,
      this.hudTimeText,
      hitsLabel,
      this.hudHitsText,
      accLabel,
      this.hudAccText,
    ]);

    this.hudContainer.setDepth(200);
    this.updateHud();
  }

  /**
   * Remove a hit target entity and its visual sprite.
   */
  protected removeTarget(targetId: string, timestamp: string): void {
    const sprite = this.targetSprites.get(targetId);
    if (sprite) {
      sprite.destroy();
      this.targetSprites.delete(targetId);
    }
    this.targetManager.destroyTarget(targetId, timestamp);
  }

  /**
   * Handle target destruction and replacement spawning after a hit.
   * Overridden in ThirtyShotScene to check for 30 hits completion.
   */
  protected onTargetHitCompleted(hitTarget: Target, timestamp: string): void {
    this.removeTarget(hitTarget.targetId, timestamp);

    const newTargets = this.targetManager.maintainTargetCount(this.roundId);
    for (const newTarget of newTargets) {
      this.renderTarget(newTarget);
    }
  }

  protected updateHud(): void {
    const accuracy = this.shotsFired > 0
      ? ((this.hits / this.shotsFired) * 100).toFixed(1)
      : '0.0';

    this.hudTimeText.setText(`${this.remainingTime.toFixed(1)}s`);
    this.hudHitsText.setText(`${this.hits}`);
    this.hudAccText.setText(`${accuracy}%`);
  }

  private createStartOverlay(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    const bgDim = this.add.rectangle(0, 0, 3000, 2000, 0x090b14, 0.85);

    const panel = this.add.rectangle(0, 0, 480, 250, 0x131622, 0.95);
    panel.setStrokeStyle(1.5, 0x242a3c, 0.9);

    const title = this.add.text(0, -60, this.modeTitle, {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '34px',
      color: '#ffffff',
      stroke: '#00e5ff',
      strokeThickness: 1,
    }).setOrigin(0.5, 0.5);

    const subtitle = this.add.text(0, -15, this.modeSubtitle, {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '13px',
      color: '#8fa0b5',
    }).setOrigin(0.5, 0.5);

    const buttonBox = this.add.rectangle(0, 48, 240, 44, 0x1a2030, 0.9);
    buttonBox.setStrokeStyle(1.5, 0x00e5ff, 0.85);

    const startPrompt = this.add.text(0, 48, 'CLICK TO START', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '16px',
      color: '#00e5ff',
    }).setOrigin(0.5, 0.5);

    this.startContainer = this.add.container(centerX, centerY, [
      bgDim,
      panel,
      title,
      subtitle,
      buttonBox,
      startPrompt,
    ]);

    this.startContainer.setDepth(220);
    this.startContainer.setVisible(true);
  }

  private createResultsOverlay(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    const bgDim = this.add.rectangle(0, 0, 3000, 2000, 0x090b14, 0.88);

    const panel = this.add.rectangle(0, 0, 480, 350, 0x131622, 0.96);
    panel.setStrokeStyle(1.5, 0x242a3c, 0.9);

    const title = this.add.text(0, -125, 'ROUND COMPLETE', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '26px',
      color: '#00ffcc',
    }).setOrigin(0.5, 0.5);

    this.resultsStatsText = this.add.text(0, -8, '', {
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      fontSize: '14px',
      color: '#e2e8f0',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5, 0.5);

    const buttonBox = this.add.rectangle(0, 118, 250, 42, 0x1a2030, 0.9);
    buttonBox.setStrokeStyle(1.5, 0x00ffcc, 0.85);

    const restartPrompt = this.add.text(0, 118, 'CLICK TO RESTART', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '15px',
      color: '#00ffcc',
    }).setOrigin(0.5, 0.5);

    this.resultsContainer = this.add.container(centerX, centerY, [
      bgDim,
      panel,
      title,
      this.resultsStatsText,
      buttonBox,
      restartPrompt,
    ]);

    this.resultsContainer.setDepth(220);
    this.resultsContainer.setVisible(false);
  }

  protected updateResultsOverlay(): void {
    const completedRound = telemetryCollector.getCurrentRound();
    const accuracy = this.shotsFired > 0
      ? ((this.hits / this.shotsFired) * 100).toFixed(1)
      : '0.0';
    const avgReaction = (completedRound?.average_reaction_time && completedRound.average_reaction_time > 0)
      ? `${completedRound.average_reaction_time.toFixed(2)}s`
      : 'N/A';
    const avgPrecision = (completedRound?.average_precision && completedRound.average_precision > 0)
      ? `${completedRound.average_precision.toFixed(1)}px`
      : 'N/A';

    const lines = [
      `HITS          : ${this.hits}`,
      `ACCURACY      : ${accuracy}%`,
      `AVG REACTION  : ${avgReaction}`,
      `AVG PRECISION : ${avgPrecision}`,
      `SHOTS FIRED   : ${this.shotsFired}`,
      `MISSES        : ${this.misses}`,
    ];

    this.resultsStatsText.setText(lines.join('\n'));
  }

  private generateTargetTexture(): void {
    const radius = GAME_CONFIG.sixShot.targetRadius;
    const padding = 6;
    const size = (radius + padding) * 2;
    const center = size / 2;

    const graphics = this.add.graphics();

    // Subtle outer neon aura
    graphics.fillStyle(0x00ff44, 0.2);
    graphics.fillCircle(center, center, radius + 3);

    // Main flat neon-green sphere body
    graphics.fillStyle(0x00ff44, 1);
    graphics.fillCircle(center, center, radius);

    // Subtle bottom-right volume shadow for 3D sphere depth
    graphics.fillStyle(0x00c832, 0.45);
    graphics.fillCircle(center + radius * 0.12, center + radius * 0.12, radius * 0.88);

    // Specular highlight spot (top-left)
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(center - radius * 0.28, center - radius * 0.28, radius * 0.3);
    graphics.fillStyle(0xaaffcc, 0.6);
    graphics.fillCircle(center - radius * 0.28, center - radius * 0.28, radius * 0.42);

    // High-contrast outer boundary rim so it pops against light and dark tiles
    graphics.lineStyle(1.5, 0x007722, 0.95);
    graphics.strokeCircle(center, center, radius);

    graphics.generateTexture(TARGET_TEXTURE_KEY, size, size);
    graphics.destroy();
  }

  protected renderTarget(target: Target): void {
    const image = this.add.image(
      target.x - this.aimOffsetX,
      target.y - this.aimOffsetY,
      TARGET_TEXTURE_KEY
    );
    image.setDepth(50);
    this.targetSprites.set(target.targetId, image);
  }

  // ============================================================
  // Trajectory Sampling System
  // ============================================================

  /**
   * Start trajectory sampling for the current round.
   * Sets up a ~60Hz interval timer that captures aim position and accumulated mouse deltas.
   */
  private startTrajectoryCollection(): void {
    this.trajectorySampler.start(this.roundId);
    this.trajectorySamplingActive = true;

    // Attach a direct DOM mousemove listener on the canvas to capture every raw
    // movement delta. Phaser's pointermove callback only exposes the LAST DOM
    // event's movementX/Y per frame, losing intermediate deltas when multiple
    // native mousemove events fire between frames. This listener accumulates
    // every delta so the trajectory samples reflect true mouse movement.
    this.removeRawMouseListener();
    this.boundRawMouseHandler = (event: MouseEvent) => {
      if (!this.trajectorySamplingActive || this.roundState !== 'playing' || !this.pointerLocked) {
        return;
      }

      const mx = event.movementX || (event as unknown as { mozMovementX?: number }).mozMovementX || (event as unknown as { webkitMovementX?: number }).webkitMovementX || 0;
      const my = event.movementY || (event as unknown as { mozMovementY?: number }).mozMovementY || (event as unknown as { webkitMovementY?: number }).webkitMovementY || 0;

      this.trajectorySampler.accumulateMovement(mx, my);
    };
    if (this.game?.canvas) {
      this.game.canvas.addEventListener('mousemove', this.boundRawMouseHandler);
    }

    // Sample at ~60Hz (16ms interval)
    this.trajectorySamplingTimer = setInterval(() => {
      this.captureTrajectorySnapshot();
    }, 16);
  }

  /**
   * Stop trajectory sampling, finalize any trailing segment, and clean up the timer.
   */
  private stopTrajectoryCollection(): void {
    this.trajectorySamplingActive = false;

    // Clear the sampling interval timer
    if (this.trajectorySamplingTimer !== null) {
      clearInterval(this.trajectorySamplingTimer);
      this.trajectorySamplingTimer = null;
    }

    // Remove the direct DOM mousemove listener
    this.removeRawMouseListener();

    const centerX = this.scale ? this.scale.width / 2 : 0;
    const centerY = this.scale ? this.scale.height / 2 : 0;
    const worldX = centerX + this.aimOffsetX;
    const worldY = centerY + this.aimOffsetY;

    // Finalize any pending movement as an unassigned trailing segment
    this.trajectorySampler.stop(worldX, worldY);
  }

  /**
   * Remove the direct DOM mousemove listener if it exists.
   */
  private removeRawMouseListener(): void {
    if (this.boundRawMouseHandler && this.game?.canvas) {
      this.game.canvas.removeEventListener('mousemove', this.boundRawMouseHandler);
      this.boundRawMouseHandler = null;
    }
  }

  /**
   * Capture a single trajectory snapshot at the current aim position.
   * Only captures when sampling is active, the round is playing, and pointer lock is held.
   */
  private captureTrajectorySnapshot(): void {
    if (!this.trajectorySamplingActive || this.roundState !== 'playing' || !this.pointerLocked) {
      this.trajectorySampler.clearAccumulatedMovement();
      return;
    }

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    // Logical world aim position — same coordinate system as checkHit()
    const worldX = centerX + this.aimOffsetX;
    const worldY = centerY + this.aimOffsetY;

    this.trajectorySampler.capturePeriodicSnapshot(worldX, worldY);
  }

  /**
   * Finalize the current trajectory segment with the given associations.
   * Consumes all pending samples into a TrajectorySegment and records it via the telemetry collector.
   * Starts a fresh segment for subsequent samples.
   *
   * @param shotId - Shot ID to associate with this segment, or null for trailing segments
   * @param targetId - Target ID actually hit, or null for misses/unassigned
   * @param endTime - ISO timestamp marking the end of this segment
   */
  protected finalizeTrajectorySegment(
    shotId: string | null,
    targetId: string | null,
    endTime: string
  ): void {
    this.trajectorySampler.finalizeSegment(shotId, targetId, endTime);
  }
}
