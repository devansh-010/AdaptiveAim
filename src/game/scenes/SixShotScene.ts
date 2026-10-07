import Phaser from 'phaser';
import { GAME_CONFIG, SIX_SHOT_ROUND_DURATION, SIX_SHOT_AIM_SENSITIVITY } from '../config/gameConfig';
import { TargetManager } from '../systems/TargetManager';
import { generateRoundId } from '../../telemetry/ids';
import type { Target } from '../entities/Target';

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
 * - Spawning, rendering, hit detection, and replacement of targets
 */
export class SixShotScene extends Phaser.Scene {
  private targetManager!: TargetManager;
  private roundId!: string;

  /**
   * Map of targetId → Phaser Image game object for rendering.
   */
  private targetSprites: Map<string, Phaser.GameObjects.Image> = new Map();

  // Round flow state
  private roundState: RoundState = 'start';
  private remainingTime: number = SIX_SHOT_ROUND_DURATION;

  // Pointer lock & FPS aiming system state
  private pointerLocked: boolean = false;
  private aimOffsetX: number = 0;
  private aimOffsetY: number = 0;

  // Round statistics
  private shotsFired: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private lastShotResult: string = 'None';
  private lastHitTargetId: string = 'None';

  public getLastShotResult(): string {
    return this.lastShotResult;
  }

  public getLastHitTargetId(): string {
    return this.lastHitTargetId;
  }

  // HUD elements
  private hudContainer!: Phaser.GameObjects.Container;
  private hudTimeText!: Phaser.GameObjects.Text;
  private hudHitsText!: Phaser.GameObjects.Text;
  private hudAccText!: Phaser.GameObjects.Text;

  // Navigation exit button
  private exitButton!: Phaser.GameObjects.Text;

  // UI Overlay containers & transition objects
  private startContainer!: Phaser.GameObjects.Container;
  private resultsContainer!: Phaser.GameObjects.Container;
  private resultsStatsText!: Phaser.GameObjects.Text;
  private timeOverText!: Phaser.GameObjects.Text;

  // FPS Aiming visual elements
  private crosshairContainer!: Phaser.GameObjects.Container;
  private weaponImage!: Phaser.GameObjects.Image;
  private lockNoticeText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'SixShotScene' });
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

    // Generate circular target texture
    this.generateTargetTexture();

    // Initialize TargetManager with current viewport dimensions
    this.targetManager = new TargetManager(width, height);

    // Generate round ID for this session
    this.roundId = generateRoundId();

    // Set initial round state to start
    this.roundState = 'start';
    this.remainingTime = SIX_SHOT_ROUND_DURATION;
    this.shotsFired = 0;
    this.hits = 0;
    this.misses = 0;
    this.lastShotResult = 'None';
    this.lastHitTargetId = 'None';
    this.aimOffsetX = 0;
    this.aimOffsetY = 0;

    // Spawn initial 6 targets
    const targets = this.targetManager.spawnInitialTargets(this.roundId);
    for (const target of targets) {
      this.renderTarget(target);
    }

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
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer.worldX, pointer.worldY);
    });

    // Register pointer move listener for FPS relative mouse aiming
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerMove(pointer);
    });

    // Listen to window / canvas resize events
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.handleResize(gameSize.width, gameSize.height);
    });

    console.log(
      `[SixShotScene] Initialized in START state (${width}x${height}) with ${this.targetManager.getActiveCount()} targets`
    );
  }

  override update(_time: number, delta: number): void {
    // Continuously update rendered target positions relative to aim offset
    this.updateTargetPositions();

    // Timer only ticks during active PLAYING state
    if (this.roundState !== 'playing') {
      return;
    }

    // delta is provided in milliseconds by Phaser; convert to seconds
    this.remainingTime -= delta / 1000;

    if (this.remainingTime <= 0) {
      this.triggerTimeOver();
    } else {
      this.updateHud();
    }
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
   * Mouse movement shifts aim offset; targets appear to move in opposite direction relative to center crosshair.
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
    }
  }

  /**
   * Listen to browser pointer lock change events.
   */
  private setupPointerLockListeners(): void {
    const updateLockStatus = () => {
      const isLocked = document.pointerLockElement === this.game.canvas;
      this.pointerLocked = isLocked;

      if (this.lockNoticeText) {
        this.lockNoticeText.setVisible(this.roundState === 'playing' && !isLocked);
      }
    };

    document.addEventListener('pointerlockchange', updateLockStatus);
    document.addEventListener('mozpointerlockchange', updateLockStatus);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('pointerlockchange', updateLockStatus);
      document.removeEventListener('mozpointerlockchange', updateLockStatus);
      this.releasePointerLock();
    });
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
      if (document.pointerLockElement) {
        document.exitPointerLock();
      } else if (this.input && this.input.mouse && this.input.mouse.locked) {
        this.input.mouse.releasePointerLock();
      }
    } catch (e) {
      console.warn('[SixShotScene] Pointer lock release error:', e);
    }
  }

  /**
   * Handle dynamic viewport resize to keep HUD, overlays, exit button, weapon, and crosshair aligned.
   */
  private handleResize(width: number, height: number): void {
    if (this.targetManager) {
      this.targetManager.updateSpawnArea(width, height);
    }
    if (this.hudContainer) {
      this.hudContainer.setPosition(width / 2, 36);
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
   * Start a new round: set state to playing, reset aim offset, and begin timer.
   */
  private startRound(): void {
    this.roundState = 'playing';
    this.remainingTime = SIX_SHOT_ROUND_DURATION;
    this.aimOffsetX = 0;
    this.aimOffsetY = 0;

    this.startContainer.setVisible(false);
    this.resultsContainer.setVisible(false);
    if (this.timeOverText) {
      this.timeOverText.setVisible(false);
    }
    if (this.lockNoticeText) {
      this.lockNoticeText.setVisible(!this.pointerLocked);
    }

    this.updateHud();
    console.log(`[SixShotScene] Round ${this.roundId} started.`);
  }

  /**
   * Trigger the animated TIME OVER transition state when 30s timer reaches zero.
   */
  private triggerTimeOver(): void {
    this.roundState = 'timeOver';
    this.remainingTime = 0;
    this.releasePointerLock();

    if (this.lockNoticeText) {
      this.lockNoticeText.setVisible(false);
    }

    this.updateHud();

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

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

    console.log(`[SixShotScene] Round ${this.roundId} TIME OVER transition started.`);
  }

  /**
   * Conclude active round: set state to results, release pointer lock, and show summary overlay.
   */
  private endRound(): void {
    this.remainingTime = 0;
    this.roundState = 'results';
    this.releasePointerLock();

    this.updateResultsOverlay();
    this.resultsContainer.setVisible(true);
    this.updateHud();
    console.log(`[SixShotScene] Round ${this.roundId} complete.`);
  }

  /**
   * Reset round statistics, recreate fresh targets, reset aim offset, and start new round.
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

    // 4. Reset stats and aim offsets
    this.shotsFired = 0;
    this.hits = 0;
    this.misses = 0;
    this.lastShotResult = 'None';
    this.lastHitTargetId = 'None';
    this.aimOffsetX = 0;
    this.aimOffsetY = 0;

    // 5. Spawn 6 fresh targets
    const targets = this.targetManager.spawnInitialTargets(this.roundId);
    for (const target of targets) {
      this.renderTarget(target);
    }

    // 6. Transition state to playing and start round
    this.startRound();
  }

  /**
   * Handle shot fired at the fixed center crosshair position.
   * Converts center screen coordinates to world coordinates via aim offset.
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

    if (hitTarget) {
      this.hits++;
      this.lastShotResult = 'HIT';
      this.lastHitTargetId = hitTarget.targetId;

      // Screen position of hit target
      const hitScreenX = hitTarget.x - this.aimOffsetX;
      const hitScreenY = hitTarget.y - this.aimOffsetY;

      // Visual feedback: glowing ring expansion at target position
      const hitGfx = this.add.graphics();
      hitGfx.fillStyle(0x00ffff, 0.5);
      hitGfx.fillCircle(hitScreenX, hitScreenY, hitTarget.size + 3);
      hitGfx.lineStyle(2, 0xffffff, 0.9);
      hitGfx.strokeCircle(hitScreenX, hitScreenY, hitTarget.size + 8);

      this.time.delayedCall(120, () => {
        hitGfx.destroy();
      });

      // Destroy hit target's Phaser visual object
      const sprite = this.targetSprites.get(hitTarget.targetId);
      if (sprite) {
        sprite.destroy();
        this.targetSprites.delete(hitTarget.targetId);
      }

      // Destroy target domain entity in TargetManager
      this.targetManager.destroyTarget(hitTarget.targetId);

      // Immediately spawn replacement target to maintain active count = 6
      const newTargets = this.targetManager.maintainTargetCount(this.roundId);
      for (const newTarget of newTargets) {
        this.renderTarget(newTarget);
      }
    } else {
      this.misses++;
      this.lastShotResult = 'MISS';
      this.lastHitTargetId = 'None';

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
    const gap = 4;
    const length = 8;
    const thickness = 1.5;

    // Crosshair dark outline for contrast
    gfx.lineStyle(thickness + 1, 0x000000, 0.7);
    gfx.lineBetween(0, -gap, 0, -gap - length);
    gfx.lineBetween(0, gap, 0, gap + length);
    gfx.lineBetween(-gap, 0, -gap - length, 0);
    gfx.lineBetween(gap, 0, gap + length, 0);

    // Crosshair main cyan lines
    gfx.lineStyle(thickness, 0x00ffff, 0.95);
    gfx.lineBetween(0, -gap, 0, -gap - length);
    gfx.lineBetween(0, gap, 0, gap + length);
    gfx.lineBetween(-gap, 0, -gap - length, 0);
    gfx.lineBetween(gap, 0, gap + length, 0);

    // Subtle center dot
    gfx.fillStyle(0xffffff, 0.9);
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
    const margin = 20;
    const x = this.scale.width - margin;
    const y = margin;

    this.exitButton = this.add.text(x, y, '← EXIT', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '13px',
      color: '#88aacc',
      backgroundColor: '#121626cc',
      padding: { x: 10, y: 6 },
    })
    .setOrigin(1, 0)
    .setDepth(250);
  }

  /**
   * Create Gameplay HUD panel at top-center.
   */
  private createHud(): void {
    const centerX = this.scale.width / 2;
    const centerY = 36;

    const bg = this.add.rectangle(0, 0, 420, 50, 0x0a0d18, 0.85);
    bg.setStrokeStyle(1.5, 0x232736, 0.9);

    const timeLabel = this.add.text(-140, -14, 'TIME', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '10px',
      color: '#88aacc',
    }).setOrigin(0.5, 0.5);

    this.hudTimeText = this.add.text(-140, 6, '30.0s', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '18px',
      color: '#00e5ff',
    }).setOrigin(0.5, 0.5);

    const hitsLabel = this.add.text(0, -14, 'HITS', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '10px',
      color: '#88aacc',
    }).setOrigin(0.5, 0.5);

    this.hudHitsText = this.add.text(0, 6, '0', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5, 0.5);

    const accLabel = this.add.text(140, -14, 'ACCURACY', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '10px',
      color: '#88aacc',
    }).setOrigin(0.5, 0.5);

    this.hudAccText = this.add.text(140, 6, '0.0%', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '18px',
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

  private updateHud(): void {
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

    const panel = this.add.rectangle(0, 0, 480, 260, 0x121626, 0.95);
    panel.setStrokeStyle(2, 0x00e5ff, 0.8);

    const title = this.add.text(0, -65, 'SIX SHOT', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '36px',
      color: '#00e5ff',
    }).setOrigin(0.5, 0.5);

    const subtitle = this.add.text(0, -20, 'Hit the targets as accurately and quickly as you can.', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '13px',
      color: '#88aacc',
    }).setOrigin(0.5, 0.5);

    const startPrompt = this.add.text(0, 50, '[ TAP TO START ]', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '22px',
      color: '#ffffff',
    }).setOrigin(0.5, 0.5);

    this.startContainer = this.add.container(centerX, centerY, [
      bgDim,
      panel,
      title,
      subtitle,
      startPrompt,
    ]);

    this.startContainer.setDepth(220);
    this.startContainer.setVisible(true);
  }

  private createResultsOverlay(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    const bgDim = this.add.rectangle(0, 0, 3000, 2000, 0x090b14, 0.88);

    const panel = this.add.rectangle(0, 0, 480, 340, 0x121626, 0.95);
    panel.setStrokeStyle(2, 0x00ffcc, 0.8);

    const title = this.add.text(0, -110, 'ROUND COMPLETE', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '28px',
      color: '#00ffcc',
    }).setOrigin(0.5, 0.5);

    this.resultsStatsText = this.add.text(0, -10, '', {
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      fontSize: '16px',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 10,
    }).setOrigin(0.5, 0.5);

    const restartPrompt = this.add.text(0, 105, '[ TAP TO RESTART ]', {
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '20px',
      color: '#00ffcc',
    }).setOrigin(0.5, 0.5);

    this.resultsContainer = this.add.container(centerX, centerY, [
      bgDim,
      panel,
      title,
      this.resultsStatsText,
      restartPrompt,
    ]);

    this.resultsContainer.setDepth(220);
    this.resultsContainer.setVisible(false);
  }

  private updateResultsOverlay(): void {
    const accuracy = this.shotsFired > 0
      ? ((this.hits / this.shotsFired) * 100).toFixed(1)
      : '0.0';

    const lines = [
      `HITS        : ${this.hits}`,
      `ACCURACY    : ${accuracy}%`,
      `SHOTS FIRED : ${this.shotsFired}`,
      `MISSES      : ${this.misses}`,
    ];

    this.resultsStatsText.setText(lines.join('\n'));
  }

  private generateTargetTexture(): void {
    const radius = GAME_CONFIG.sixShot.targetRadius;
    const padding = 6;
    const size = (radius + padding) * 2;
    const center = size / 2;

    const graphics = this.add.graphics();

    graphics.fillStyle(0x00e5ff, 0.25);
    graphics.fillCircle(center, center, radius + 4);

    graphics.fillStyle(0x00ffff, 1);
    graphics.fillCircle(center, center, radius);

    graphics.fillStyle(0xffffff, 0.85);
    graphics.fillCircle(center - radius * 0.25, center - radius * 0.25, radius * 0.35);

    graphics.lineStyle(1.5, 0x88ffff, 0.9);
    graphics.strokeCircle(center, center, radius);

    graphics.generateTexture(TARGET_TEXTURE_KEY, size, size);
    graphics.destroy();
  }

  private renderTarget(target: Target): void {
    const image = this.add.image(
      target.x - this.aimOffsetX,
      target.y - this.aimOffsetY,
      TARGET_TEXTURE_KEY
    );
    this.targetSprites.set(target.targetId, image);
  }
}
