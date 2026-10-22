import Phaser from 'phaser';

/**
 * Texture keys for procedural training environment surfaces.
 */
export const ENV_WALL_GRID_KEY = 'env_wall_checker';
export const ENV_FLOOR_GRID_KEY = 'env_floor_grid';

/**
 * EnvironmentRenderer manages the stylized FPS training room environment:
 * - Gray checkerboard back wall (synchronizing with player aim offset).
 * - Perspective floor with receding grid lines.
 * - Clean ceiling with panel seams and depth corners.
 * - Angled side walls framing the training chamber.
 * - Horizontal blocky barrier with 3D faces, top lighting, and bevel highlights.
 * - Consistent perspective scaling across varying viewport sizes.
 */
export class EnvironmentRenderer {
  private scene: Phaser.Scene;
  private wallTileSprite: Phaser.GameObjects.TileSprite | null = null;
  private roomGraphics: Phaser.GameObjects.Graphics | null = null;
  private barrierGraphics: Phaser.GameObjects.Graphics | null = null;
  private container: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Procedurally generate seamless checkerboard and grid tile textures.
   */
  public generateTextures(): void {
    const textures = this.scene.textures;

    // 1. Gray Checkerboard Wall Texture (64x64px tile with 32x32 checks)
    if (!textures.exists(ENV_WALL_GRID_KEY)) {
      const g = this.scene.add.graphics();
      const tileSize = 64;
      const half = 32;

      // Darker gray square 1 & 4
      g.fillStyle(0x3e424c, 1);
      g.fillRect(0, 0, half, half);
      g.fillRect(half, half, half, half);

      // Slightly lighter gray square 2 & 3
      g.fillStyle(0x474c57, 1);
      g.fillRect(half, 0, half, half);
      g.fillRect(0, half, half, half);

      // Subtle 1px grid seams
      g.lineStyle(1, 0x333640, 0.85);
      g.strokeRect(0, 0, half, half);
      g.strokeRect(half, 0, half, half);
      g.strokeRect(0, half, half, half);
      g.strokeRect(half, half, half, half);

      g.generateTexture(ENV_WALL_GRID_KEY, tileSize, tileSize);
      g.destroy();
    }

    // 2. Floor Grid Texture (64x64px tile with darker concrete tones)
    if (!textures.exists(ENV_FLOOR_GRID_KEY)) {
      const g = this.scene.add.graphics();
      const tileSize = 64;
      const half = 32;

      g.fillStyle(0x22242c, 1);
      g.fillRect(0, 0, half, half);
      g.fillRect(half, half, half, half);

      g.fillStyle(0x292c36, 1);
      g.fillRect(half, 0, half, half);
      g.fillRect(0, half, half, half);

      g.lineStyle(1, 0x1b1c23, 0.9);
      g.strokeRect(0, 0, half, half);
      g.strokeRect(half, 0, half, half);
      g.strokeRect(0, half, half, half);
      g.strokeRect(half, half, half, half);

      g.generateTexture(ENV_FLOOR_GRID_KEY, tileSize, tileSize);
      g.destroy();
    }
  }

  /**
   * Build the environment visual display objects.
   */
  public create(width: number, height: number): void {
    this.generateTextures();

    // Clean up any existing instances
    this.destroy();

    // Container at depth 5 (behind targets at depth 50+, weapon at 120+, HUD at 200+)
    this.container = this.scene.add.container(0, 0);
    this.container.setDepth(5);

    // 1. Back Wall TileSprite (spans the entire viewport so target space is seamless)
    this.wallTileSprite = this.scene.add.tileSprite(
      width / 2,
      height / 2,
      width,
      height,
      ENV_WALL_GRID_KEY
    );
    this.container.add(this.wallTileSprite);

    // 2. Room Perspective Graphics (Ceiling, Floor, Left/Right walls, Corner seams)
    this.roomGraphics = this.scene.add.graphics();
    this.container.add(this.roomGraphics);

    // 3. Horizontal Barrier Graphics (Foreground bench/barrier)
    this.barrierGraphics = this.scene.add.graphics();
    this.container.add(this.barrierGraphics);

    this.renderRoom(0, 0, width, height);
  }

  /**
   * Update environment positions and perspective based on current camera aim offset.
   */
  public update(aimOffsetX: number, aimOffsetY: number, width: number, height: number): void {
    if (this.wallTileSprite) {
      // Synchronize checkerboard tile position 1:1 with logical world aim offset.
      // This ensures targets remain perfectly anchored to the checkerboard pattern!
      this.wallTileSprite.tilePositionX = aimOffsetX;
      this.wallTileSprite.tilePositionY = aimOffsetY;
    }

    this.renderRoom(aimOffsetX, aimOffsetY, width, height);
  }

  /**
   * Redraw perspective room geometry, depth corners, and the horizontal barrier.
   */
  private renderRoom(
    aimOffsetX: number,
    aimOffsetY: number,
    width: number,
    height: number
  ): void {
    if (!this.roomGraphics || !this.barrierGraphics) return;

    this.roomGraphics.clear();
    this.barrierGraphics.clear();

    // Subtle parallax shifts for the room boundaries
    const parallaxX = aimOffsetX * 0.12;
    const parallaxY = aimOffsetY * 0.12;

    // Room boundary proportions
    const ceilingH = Math.max(36, height * 0.08 - parallaxY);
    const floorY = Math.min(height - 40, height * 0.88 - parallaxY);
    const leftW = Math.max(30, width * 0.06 - parallaxX);
    const rightX = Math.min(width - 30, width * 0.94 - parallaxX);

    // -------------------------------------------------------------
    // 1. CEILING (Top Trapezoid)
    // -------------------------------------------------------------
    this.roomGraphics.fillStyle(0x1a1c23, 0.96);
    this.roomGraphics.beginPath();
    this.roomGraphics.moveTo(0, 0);
    this.roomGraphics.lineTo(width, 0);
    this.roomGraphics.lineTo(rightX, ceilingH);
    this.roomGraphics.lineTo(leftW, ceilingH);
    this.roomGraphics.closePath();
    this.roomGraphics.fillPath();

    // Ceiling longitudinal perspective lines
    this.roomGraphics.lineStyle(1, 0x272a34, 0.7);
    const ceilingDivisions = 6;
    for (let i = 1; i < ceilingDivisions; i++) {
      const topT = i / ceilingDivisions;
      const x0 = width * topT;
      const x1 = leftW + (rightX - leftW) * topT;
      this.roomGraphics.lineBetween(x0, 0, x1, ceilingH);
    }

    // Ceiling/Wall border seam
    this.roomGraphics.lineStyle(2, 0x14161c, 0.95);
    this.roomGraphics.lineBetween(leftW, ceilingH, rightX, ceilingH);

    // -------------------------------------------------------------
    // 2. FLOOR (Bottom Trapezoid)
    // -------------------------------------------------------------
    this.roomGraphics.fillStyle(0x23252d, 0.95);
    this.roomGraphics.beginPath();
    this.roomGraphics.moveTo(0, height);
    this.roomGraphics.lineTo(width, height);
    this.roomGraphics.lineTo(rightX, floorY);
    this.roomGraphics.lineTo(leftW, floorY);
    this.roomGraphics.closePath();
    this.roomGraphics.fillPath();

    // Floor perspective lines receding towards back wall
    this.roomGraphics.lineStyle(1.5, 0x1b1d24, 0.85);
    const floorDivisions = 8;
    for (let i = 0; i <= floorDivisions; i++) {
      const t = i / floorDivisions;
      const x0 = width * t;
      const x1 = leftW + (rightX - leftW) * t;
      this.roomGraphics.lineBetween(x0, height, x1, floorY);
    }

    // Floor horizontal transverse seams
    const floorSeams = 3;
    for (let i = 1; i <= floorSeams; i++) {
      const t = Math.pow(i / (floorSeams + 1), 1.6);
      const sy = floorY + (height - floorY) * t;
      const sx0 = leftW * (1 - t);
      const sx1 = rightX + (width - rightX) * t;
      this.roomGraphics.lineBetween(sx0, sy, sx1, sy);
    }

    // Floor/Wall border seam
    this.roomGraphics.lineStyle(2, 0x181a20, 0.95);
    this.roomGraphics.lineBetween(leftW, floorY, rightX, floorY);

    // -------------------------------------------------------------
    // 3. LEFT WALL (Left Trapezoid)
    // -------------------------------------------------------------
    this.roomGraphics.fillStyle(0x31343e, 0.88);
    this.roomGraphics.beginPath();
    this.roomGraphics.moveTo(0, 0);
    this.roomGraphics.lineTo(leftW, ceilingH);
    this.roomGraphics.lineTo(leftW, floorY);
    this.roomGraphics.lineTo(0, height);
    this.roomGraphics.closePath();
    this.roomGraphics.fillPath();

    // Left wall horizontal perspective seams
    this.roomGraphics.lineStyle(1, 0x24262f, 0.7);
    const wallDivisions = 4;
    for (let i = 1; i < wallDivisions; i++) {
      const t = i / wallDivisions;
      const y0 = height * t;
      const y1 = ceilingH + (floorY - ceilingH) * t;
      this.roomGraphics.lineBetween(0, y0, leftW, y1);
    }

    // -------------------------------------------------------------
    // 4. RIGHT WALL (Right Trapezoid)
    // -------------------------------------------------------------
    this.roomGraphics.fillStyle(0x31343e, 0.88);
    this.roomGraphics.beginPath();
    this.roomGraphics.moveTo(width, 0);
    this.roomGraphics.lineTo(rightX, ceilingH);
    this.roomGraphics.lineTo(rightX, floorY);
    this.roomGraphics.lineTo(width, height);
    this.roomGraphics.closePath();
    this.roomGraphics.fillPath();

    // Right wall horizontal perspective seams
    this.roomGraphics.lineStyle(1, 0x24262f, 0.7);
    for (let i = 1; i < wallDivisions; i++) {
      const t = i / wallDivisions;
      const y0 = height * t;
      const y1 = ceilingH + (floorY - ceilingH) * t;
      this.roomGraphics.lineBetween(width, y0, rightX, y1);
    }

    // -------------------------------------------------------------
    // 5. ROOM CORNER DEPTH SEAMS
    // -------------------------------------------------------------
    this.roomGraphics.lineStyle(2, 0x14161c, 0.95);
    // Top-left corner
    this.roomGraphics.lineBetween(0, 0, leftW, ceilingH);
    // Top-right corner
    this.roomGraphics.lineBetween(width, 0, rightX, ceilingH);
    // Bottom-left corner
    this.roomGraphics.lineBetween(0, height, leftW, floorY);
    // Bottom-right corner
    this.roomGraphics.lineBetween(width, height, rightX, floorY);

    // Subtle edge highlight along the inner room frame
    this.roomGraphics.lineStyle(1, 0x565c69, 0.5);
    this.roomGraphics.strokeRect(leftW, ceilingH, rightX - leftW, floorY - ceilingH);

    // -------------------------------------------------------------
    // 6. HORIZONTAL BLOCKY BARRIER
    // -------------------------------------------------------------
    // Modeled after the iconic training room low bench/barrier partition.
    // Sits in the lower foreground across the room width.
    const barrierParallaxX = aimOffsetX * 0.18;
    const barrierParallaxY = aimOffsetY * 0.18;

    const barrierTopY = Math.min(height - 42, Math.max(floorY - 14, height * 0.84 - barrierParallaxY));
    const barrierDepth = 14;
    const barrierHeight = 36;
    const barrierFrontY = barrierTopY + barrierDepth;

    // A. Soft Drop Shadow below the barrier on the floor
    this.barrierGraphics.fillStyle(0x13151b, 0.7);
    this.barrierGraphics.fillRect(
      -30 - barrierParallaxX,
      barrierFrontY + barrierHeight,
      width + 60,
      12
    );

    // B. Barrier Front Face (Vertical concrete block)
    this.barrierGraphics.fillStyle(0x383b45, 1);
    this.barrierGraphics.fillRect(
      -30 - barrierParallaxX,
      barrierFrontY,
      width + 60,
      barrierHeight
    );

    // C. Barrier Top Surface (Catches ambient light from ceiling)
    this.barrierGraphics.fillStyle(0x515663, 1);
    this.barrierGraphics.beginPath();
    this.barrierGraphics.moveTo(-30 - barrierParallaxX, barrierTopY);
    this.barrierGraphics.lineTo(width + 30 - barrierParallaxX, barrierTopY);
    this.barrierGraphics.lineTo(width + 30 - barrierParallaxX, barrierFrontY);
    this.barrierGraphics.lineTo(-30 - barrierParallaxX, barrierFrontY);
    this.barrierGraphics.closePath();
    this.barrierGraphics.fillPath();

    // D. Crisp Bevel Highlights and Edge Seams
    // Top-most bevel highlight edge
    this.barrierGraphics.lineStyle(1.5, 0x6e7484, 0.9);
    this.barrierGraphics.lineBetween(
      -30 - barrierParallaxX,
      barrierTopY,
      width + 30 - barrierParallaxX,
      barrierTopY
    );

    // Corner ridge between top face and front face
    this.barrierGraphics.lineStyle(1.5, 0x41454f, 0.95);
    this.barrierGraphics.lineBetween(
      -30 - barrierParallaxX,
      barrierFrontY,
      width + 30 - barrierParallaxX,
      barrierFrontY
    );

    // Bottom shadow edge
    this.barrierGraphics.lineStyle(2, 0x1a1c22, 0.95);
    this.barrierGraphics.lineBetween(
      -30 - barrierParallaxX,
      barrierFrontY + barrierHeight,
      width + 30 - barrierParallaxX,
      barrierFrontY + barrierHeight
    );

    // Vertical modular block seams across the barrier face (every 140px)
    this.barrierGraphics.lineStyle(1.5, 0x272931, 0.85);
    const blockSpacing = 140;
    const startX = ((-barrierParallaxX) % blockSpacing) - blockSpacing;
    for (let x = startX; x < width + 40; x += blockSpacing) {
      // Top face seam
      this.barrierGraphics.lineBetween(x, barrierTopY, x, barrierFrontY);
      // Front face seam
      this.barrierGraphics.lineBetween(x, barrierFrontY, x, barrierFrontY + barrierHeight);
    }
  }

  /**
   * Handle dynamic window / viewport resizing.
   */
  public resize(width: number, height: number): void {
    if (this.wallTileSprite) {
      this.wallTileSprite.setPosition(width / 2, height / 2);
      this.wallTileSprite.setSize(width, height);
    }
    this.renderRoom(0, 0, width, height);
  }

  /**
   * Clean up display objects.
   */
  public destroy(): void {
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
      this.wallTileSprite = null;
      this.roomGraphics = null;
      this.barrierGraphics = null;
    }
  }
}
