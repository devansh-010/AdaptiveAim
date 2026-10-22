import { Target, type TargetBounds } from '../entities/Target.ts';
import { generateTargetId } from '../../telemetry/ids.ts';
import { GAME_CONFIG, DEFAULT_MAX_AIM_DISTANCE } from '../config/gameConfig.ts';
import { telemetryCollector, TelemetryCollector } from '../../telemetry/TelemetryCollector.ts';

export interface SpawnArea {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ObstructedRegion {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * TargetManager handles target placement, active target pool maintenance,
 * collision bounds validation, moving target updates, and replacement target generation.
 *
 * It enforces safe visible region constraints:
 * - Keeps entire target circle strictly inside the visible playable viewport.
 * - Excludes HUD, exit button, and weapon visual obstructions.
 * - Restricts candidate placement within a configurable maximum distance from center crosshair.
 * - Translates screen positions using current aim offsets for immediate discoverability.
 * - Guarantees robust placement via bounded sampling and deterministic grid fallback.
 */
export class TargetManager {
  private activeTargets: Map<string, Target> = new Map();
  private maxActiveTargets: number;
  private spawnArea!: SpawnArea;
  private canvasWidth: number;
  private canvasHeight: number;
  private targetRadius: number;
  private spawnMargin: number;
  private minSeparation: number;
  private retryLimit: number;
  private movementEnabled: boolean;
  private movementSpeed: number;
  private maxAimDistance: number;
  private maxAimOffset: number;
  private aimOffsetX: number = 0;
  private aimOffsetY: number = 0;
  private obstructedRegions: ObstructedRegion[] = [];
  private telemetryCollector: TelemetryCollector;

  constructor(
    canvasWidth: number,
    canvasHeight: number,
    maxTargets: number = GAME_CONFIG.sixShot.targetCount,
    targetRadius: number = GAME_CONFIG.sixShot.targetRadius,
    spawnMargin: number = GAME_CONFIG.sixShot.spawnMargin,
    minSeparation: number = GAME_CONFIG.sixShot.minTargetSeparation,
    retryLimit: number = GAME_CONFIG.sixShot.spawnRetryLimit,
    movementEnabled: boolean = false,
    movementSpeed: number = 0,
    maxAimDistance: number = DEFAULT_MAX_AIM_DISTANCE,
    collector: TelemetryCollector = telemetryCollector
  ) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.maxActiveTargets = maxTargets;
    this.targetRadius = targetRadius;
    this.spawnMargin = spawnMargin;
    this.minSeparation = minSeparation;
    this.retryLimit = retryLimit;
    this.movementEnabled = movementEnabled;
    this.movementSpeed = movementSpeed;
    this.maxAimDistance = maxAimDistance;
    this.maxAimOffset = Math.max(canvasWidth, canvasHeight) * 0.8;
    this.telemetryCollector = collector;

    // Compute valid spawn area from canvas dimensions, margin, and target radius.
    this.updateSpawnArea(canvasWidth, canvasHeight, spawnMargin);
  }

  /**
   * Update valid spawn area and UI obstructions based on updated canvas dimensions.
   * Safely scales edge margins down on small viewports so min <= max is always preserved.
   */
  public updateSpawnArea(
    canvasWidth: number,
    canvasHeight: number,
    spawnMargin: number = this.spawnMargin
  ): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.spawnMargin = spawnMargin;
    this.maxAimOffset = Math.max(canvasWidth, canvasHeight) * 0.8;

    // Calculate maximum available margin on small viewports
    const maxMarginX = Math.max(0, (canvasWidth - 2 * this.targetRadius) / 2);
    const maxMarginY = Math.max(0, (canvasHeight - 2 * this.targetRadius) / 2);

    const safeMarginX = Math.min(spawnMargin, maxMarginX);
    const safeMarginY = Math.min(spawnMargin, maxMarginY);

    const minX = this.targetRadius + safeMarginX;
    const maxX = Math.max(minX, canvasWidth - this.targetRadius - safeMarginX);
    const minY = this.targetRadius + safeMarginY;
    const maxY = Math.max(minY, canvasHeight - this.targetRadius - safeMarginY);

    this.spawnArea = { minX, maxX, minY, maxY };

    // Update default obstructed UI areas
    this.updateObstructedRegions();
    this.syncMovingTargetsToBounds();
  }

  /**
   * Update default obstructed regions based on viewport dimensions.
   */
  private updateObstructedRegions(): void {
    this.obstructedRegions = [];

    // Only apply UI obstruction exclusions if there is ample viewport space
    const hasAmpleWidth = this.canvasWidth >= 600;
    const hasAmpleHeight = this.canvasHeight >= 400;

    if (hasAmpleHeight) {
      // 1. Top-center HUD banner (420px wide by 50px high, centered at width/2, y=36)
      const hudHalfWidth = Math.min(215, this.canvasWidth * 0.28);
      this.obstructedRegions.push({
        minX: this.canvasWidth / 2 - hudHalfWidth,
        maxX: this.canvasWidth / 2 + hudHalfWidth,
        minY: 0,
        maxY: 75,
      });

      // 2. Top-right Exit button ([ EXIT ] in top-right corner)
      this.obstructedRegions.push({
        minX: this.canvasWidth - 110,
        maxX: this.canvasWidth,
        minY: 0,
        maxY: 50,
      });
    }

    if (hasAmpleWidth && hasAmpleHeight) {
      // 3. Lower-right weapon visual (320x320 image anchored at width, height)
      this.obstructedRegions.push({
        minX: this.canvasWidth - 250,
        maxX: this.canvasWidth,
        minY: this.canvasHeight - 220,
        maxY: this.canvasHeight,
      });
    }
  }

  /**
   * Set or override custom obstructed regions.
   */
  public setObstructedRegions(regions: ObstructedRegion[]): void {
    this.obstructedRegions = [...regions];
    this.syncMovingTargetsToBounds();
  }

  public getObstructedRegions(): ObstructedRegion[] {
    return [...this.obstructedRegions];
  }

  /**
   * Check if a candidate screen position overlaps any obstructed region.
   */
  public isObstructed(screenX: number, screenY: number): boolean {
    const buffer = 4;
    const effectiveRadius = this.targetRadius + buffer;

    for (const region of this.obstructedRegions) {
      if (
        screenX + effectiveRadius >= region.minX &&
        screenX - effectiveRadius <= region.maxX &&
        screenY + effectiveRadius >= region.minY &&
        screenY - effectiveRadius <= region.maxY
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Set current FPS aiming camera offset.
   * When aim offset is non-zero, replacement targets spawn relative to the player's
   * active view rather than static canvas coordinates, ensuring immediate visibility.
   * If movement is enabled, moving targets are synchronized with updated bounds.
   */
  public setAimOffset(offsetX: number, offsetY: number): void {
    this.aimOffsetX = offsetX;
    this.aimOffsetY = offsetY;
    if (this.movementEnabled) {
      this.syncMovingTargetsToBounds();
    }
  }

  public getAimOffset(): { x: number; y: number } {
    return { x: this.aimOffsetX, y: this.aimOffsetY };
  }

  public setMaxAimDistance(distance: number): void {
    this.maxAimDistance = distance;
  }

  public getMaxAimDistance(): number {
    return this.maxAimDistance;
  }

  public setMaxAimOffset(offset: number): void {
    this.maxAimOffset = offset;
  }

  public getMaxAimOffset(): number {
    return this.maxAimOffset;
  }

  /**
   * Calculate moving target movement bounds based on current aim offset.
   * Ensures moving targets bounce off the inner edges of the visible screen.
   */
  public getMovementBounds(): TargetBounds {
    return {
      minX: this.spawnArea.minX + this.aimOffsetX,
      maxX: this.spawnArea.maxX + this.aimOffsetX,
      minY: this.spawnArea.minY + this.aimOffsetY,
      maxY: this.spawnArea.maxY + this.aimOffsetY,
    };
  }

  /**
   * Synchronize active moving targets so their positions remain within current movement bounds
   * even during rapid mouse movements or aim offset changes.
   */
  public syncMovingTargetsToBounds(): void {
    if (!this.movementEnabled) return;
    const bounds = this.getMovementBounds();
    const minX = Math.min(bounds.minX, bounds.maxX);
    const maxX = Math.max(bounds.minX, bounds.maxX);
    const minY = Math.min(bounds.minY, bounds.maxY);
    const maxY = Math.max(bounds.minY, bounds.maxY);

    for (const target of this.activeTargets.values()) {
      if (target.isDestroyed) continue;
      if (target.x < minX) {
        target.x = minX;
        target.directionX = Math.abs(target.directionX);
      } else if (target.x > maxX) {
        target.x = maxX;
        target.directionX = -Math.abs(target.directionX);
      }
      if (target.y < minY) {
        target.y = minY;
        target.directionY = Math.abs(target.directionY);
      } else if (target.y > maxY) {
        target.y = maxY;
        target.directionY = -Math.abs(target.directionY);
      }
      this.resolveMovingTargetObstructions(target);
    }
  }

  /**
   * Advance all active moving targets by delta seconds and bounce off visible movement bounds.
   */
  public update(deltaSeconds: number): void {
    if (!this.movementEnabled || deltaSeconds <= 0) return;

    const bounds = this.getMovementBounds();
    for (const target of this.activeTargets.values()) {
      target.update(deltaSeconds, bounds);
      if (!target.isDestroyed) this.resolveMovingTargetObstructions(target);
    }
  }

  /**
   * Reflect moving targets away from UI overlays as well as the viewport edges.
   * Screen-space candidates also handle an obstruction appearing over a target
   * after a resize or camera movement, including overlapping UI regions.
   */
  private resolveMovingTargetObstructions(target: Target): void {
    const x = target.x - this.aimOffsetX;
    const y = target.y - this.aimOffsetY;
    if (!this.isObstructed(x, y)) return;

    const clearance = this.targetRadius + 4.01;
    const xs = [x];
    const ys = [y];
    for (const region of this.obstructedRegions) {
      xs.push(region.minX - clearance, region.maxX + clearance);
      ys.push(region.minY - clearance, region.maxY + clearance);
    }
    let best: { x: number; y: number } | undefined;
    let bestDistance = Infinity;
    for (const candidateX of xs) {
      for (const candidateY of ys) {
        if (candidateX < this.spawnArea.minX || candidateX > this.spawnArea.maxX ||
            candidateY < this.spawnArea.minY || candidateY > this.spawnArea.maxY ||
            this.isObstructed(candidateX, candidateY)) continue;
        const distance = Math.hypot(candidateX - x, candidateY - y);
        if (distance < bestDistance) {
          best = { x: candidateX, y: candidateY };
          bestDistance = distance;
        }
      }
    }
    if (!best) return; // No unobstructed position exists within the current bounds.
    if (best.x !== x) target.directionX = Math.sign(best.x - x) * Math.abs(target.directionX);
    if (best.y !== y) target.directionY = Math.sign(best.y - y) * Math.abs(target.directionY);
    target.x = best.x + this.aimOffsetX;
    target.y = best.y + this.aimOffsetY;
  }

  /**
   * Generate a non-overlapping valid spawn coordinate in logical world coordinates.
   * Enforces strict mathematical invariants:
   * 1. The rendered target center is strictly inside the valid screen rectangle:
   *    screenX in [spawnArea.minX, spawnArea.maxX], screenY in [spawnArea.minY, spawnArea.maxY].
   * 2. The entire target radius stays 100% inside the visible playable canvas:
   *    screenX - targetRadius >= 0, screenX + targetRadius <= canvasWidth.
   * 3. The target is reachable by the existing aiming system:
   *    worldX in [centerX - maxAimOffset, centerX + maxAimOffset],
   *    worldY in [centerY - maxAimOffset, centerY + maxAimOffset].
   * 4. Candidate placement respects maxAimDistance from center crosshair when feasible.
   * 5. Accounts for current aimOffset so replacement targets are immediately visible.
   * 6. Excludes HUD, exit button, and weapon visual obstructions.
   * 7. Uses bounded sampling with a deterministic grid-based fallback.
   * 8. Performs strict post-generation verification of final rendered screen position and crosshair reachability.
   */
  public generateValidSpawnPosition(): { x: number; y: number } {
    const { minX: safeMinX, maxX: safeMaxX, minY: safeMinY, maxY: safeMaxY } = this.spawnArea;

    // Crosshair screen center
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;

    // Reachable crosshair world bounds:
    // Crosshair world position is (centerX + aimOffsetX, centerY + aimOffsetY).
    // The player's aim offset is clamped to [-maxAimOffset, maxAimOffset].
    // Any target world coordinate (worldX, worldY) must satisfy:
    // centerX - maxAimOffset <= worldX <= centerX + maxAimOffset
    // Since worldX = screenX + aimOffsetX, screenX must satisfy:
    // centerX - maxAimOffset - aimOffsetX <= screenX <= centerX + maxAimOffset - aimOffsetX
    const reachMinScreenX = centerX - this.maxAimOffset - this.aimOffsetX;
    const reachMaxScreenX = centerX + this.maxAimOffset - this.aimOffsetX;
    const reachMinScreenY = centerY - this.maxAimOffset - this.aimOffsetY;
    const reachMaxScreenY = centerY + this.maxAimOffset - this.aimOffsetY;

    // Feasible screen bounds: intersection of safe visible screen and reachable crosshair range
    let feasibleMinX = Math.max(safeMinX, reachMinScreenX);
    let feasibleMaxX = Math.min(safeMaxX, reachMaxScreenX);
    let feasibleMinY = Math.max(safeMinY, reachMinScreenY);
    let feasibleMaxY = Math.min(safeMaxY, reachMaxScreenY);

    if (feasibleMinX > feasibleMaxX) {
      const fallbackX = Math.max(safeMinX, Math.min(safeMaxX, centerX));
      feasibleMinX = fallbackX;
      feasibleMaxX = fallbackX;
    }
    if (feasibleMinY > feasibleMaxY) {
      const fallbackY = Math.max(safeMinY, Math.min(safeMaxY, centerY));
      feasibleMinY = fallbackY;
      feasibleMaxY = fallbackY;
    }

    // Aim distance bounds (if maxAimDistance is configured)
    let aimMinX = feasibleMinX;
    let aimMaxX = feasibleMaxX;
    let aimMinY = feasibleMinY;
    let aimMaxY = feasibleMaxY;

    const useAimRange =
      this.maxAimDistance > 0 &&
      this.maxAimDistance < Math.max(this.canvasWidth, this.canvasHeight);

    if (useAimRange) {
      const rangedMinX = Math.max(feasibleMinX, centerX - this.maxAimDistance);
      const rangedMaxX = Math.min(feasibleMaxX, centerX + this.maxAimDistance);
      const rangedMinY = Math.max(feasibleMinY, centerY - this.maxAimDistance);
      const rangedMaxY = Math.min(feasibleMaxY, centerY + this.maxAimDistance);

      if (rangedMinX <= rangedMaxX && rangedMinY <= rangedMaxY) {
        aimMinX = rangedMinX;
        aimMaxX = rangedMaxX;
        aimMinY = rangedMinY;
        aimMaxY = rangedMaxY;
      }
    }

    // Step 1: Bounded random sampling
    let bestScreenPos = {
      x: (aimMinX + aimMaxX) / 2,
      y: (aimMinY + aimMaxY) / 2,
    };
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < this.retryLimit; attempt++) {
      const candidateX = Math.random() * (aimMaxX - aimMinX) + aimMinX;
      const candidateY = Math.random() * (aimMaxY - aimMinY) + aimMinY;

      // Distance to crosshair check
      const distToCrosshair = Math.hypot(candidateX - centerX, candidateY - centerY);
      if (useAimRange && distToCrosshair > this.maxAimDistance) {
        continue;
      }

      // Obstruction check
      if (this.isObstructed(candidateX, candidateY)) {
        continue;
      }

      // Target separation check (in world coordinates)
      const worldCandidateX = candidateX + this.aimOffsetX;
      const worldCandidateY = candidateY + this.aimOffsetY;
      const nearestDist = this.getNearestTargetDistance(worldCandidateX, worldCandidateY);

      if (nearestDist >= this.minSeparation) {
        return this.finalizePosition(candidateX, candidateY, centerX, centerY);
      }

      if (nearestDist > bestScore) {
        bestScore = nearestDist;
        bestScreenPos = { x: candidateX, y: candidateY };
      }
    }

    // Step 2: Deterministic Grid Fallback
    const gridCols = 8;
    const gridRows = 6;
    let bestFallbackScreenPos: { x: number; y: number } | null = null;
    let bestFallbackDistance = -1;

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const u = col / (gridCols - 1);
        const v = row / (gridRows - 1);
        const gx = aimMinX + u * (aimMaxX - aimMinX);
        const gy = aimMinY + v * (aimMaxY - aimMinY);

        if (this.isObstructed(gx, gy)) {
          continue;
        }

        const distCenter = Math.hypot(gx - centerX, gy - centerY);
        if (useAimRange && distCenter > this.maxAimDistance * 1.05) {
          continue;
        }

        const worldGx = gx + this.aimOffsetX;
        const worldGy = gy + this.aimOffsetY;
        const nearest = this.getNearestTargetDistance(worldGx, worldGy);

        if (nearest >= this.minSeparation) {
          return this.finalizePosition(gx, gy, centerX, centerY);
        }

        if (nearest > bestFallbackDistance) {
          bestFallbackDistance = nearest;
          bestFallbackScreenPos = { x: gx, y: gy };
        }
      }
    }

    const finalScreen = bestFallbackScreenPos || bestScreenPos;
    return this.finalizePosition(finalScreen.x, finalScreen.y, centerX, centerY);
  }

  /**
   * Finalize and validate spawn position. Clamps both screen and world coordinates
   * to guarantee the entire target is visible on the canvas and reachable by the crosshair.
   */
  private finalizePosition(
    screenX: number,
    screenY: number,
    centerX: number,
    centerY: number
  ): { x: number; y: number } {
    const { minX: safeMinX, maxX: safeMaxX, minY: safeMinY, maxY: safeMaxY } = this.spawnArea;

    // Clamp screen coordinate to safe visible bounds
    let clampedScreenX = Math.max(safeMinX, Math.min(safeMaxX, screenX));
    let clampedScreenY = Math.max(safeMinY, Math.min(safeMaxY, screenY));

    // Convert to world coordinates
    let worldX = clampedScreenX + this.aimOffsetX;
    let worldY = clampedScreenY + this.aimOffsetY;

    // Enforce reachable crosshair bounds
    const minReachableX = centerX - this.maxAimOffset;
    const maxReachableX = centerX + this.maxAimOffset;
    const minReachableY = centerY - this.maxAimOffset;
    const maxReachableY = centerY + this.maxAimOffset;

    worldX = Math.max(minReachableX, Math.min(maxReachableX, worldX));
    worldY = Math.max(minReachableY, Math.min(maxReachableY, worldY));

    // Ensure final rendered position is strictly inside safe screen bounds
    const finalRenderedX = worldX - this.aimOffsetX;
    const finalRenderedY = worldY - this.aimOffsetY;

    if (finalRenderedX < safeMinX || finalRenderedX > safeMaxX) {
      clampedScreenX = Math.max(safeMinX, Math.min(safeMaxX, finalRenderedX));
      worldX = clampedScreenX + this.aimOffsetX;
    }
    if (finalRenderedY < safeMinY || finalRenderedY > safeMaxY) {
      clampedScreenY = Math.max(safeMinY, Math.min(safeMaxY, finalRenderedY));
      worldY = clampedScreenY + this.aimOffsetY;
    }

    return { x: Math.round(worldX), y: Math.round(worldY) };
  }

  /**
   * Validate a target's rendered screen position and crosshair reachability.
   */
  public validateTarget(target: Target): {
    isRenderedVisible: boolean;
    isReachable: boolean;
    renderedX: number;
    renderedY: number;
  } {
    const renderedX = target.x - this.aimOffsetX;
    const renderedY = target.y - this.aimOffsetY;
    const radius = target.size;

    const isRenderedVisible =
      renderedX - radius >= 0 &&
      renderedX + radius <= this.canvasWidth &&
      renderedY - radius >= 0 &&
      renderedY + radius <= this.canvasHeight;

    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;
    const requiredOffsetX = target.x - centerX;
    const requiredOffsetY = target.y - centerY;

    const isReachable =
      Math.abs(requiredOffsetX) <= this.maxAimOffset &&
      Math.abs(requiredOffsetY) <= this.maxAimOffset;

    return { isRenderedVisible, isReachable, renderedX, renderedY };
  }

  /**
   * Create and register a new target entity at a valid position and record telemetry.
   */
  public createTarget(roundId: string): Target {
    const position = this.generateValidSpawnPosition();
    const targetId = generateTargetId();

    let dirX = 0;
    let dirY = 0;
    if (this.movementEnabled) {
      const angle = Math.random() * Math.PI * 2;
      dirX = Math.cos(angle);
      dirY = Math.sin(angle);
    }

    const target = new Target(
      targetId,
      roundId,
      position.x,
      position.y,
      this.targetRadius,
      new Date().toISOString(),
      this.movementEnabled,
      this.movementSpeed,
      dirX,
      dirY
    );

    this.activeTargets.set(targetId, target);
    this.telemetryCollector.recordTargetSpawn(target.toTelemetry());
    return target;
  }

  /**
   * Spawn initial batch of targets for a round.
   */
  public spawnInitialTargets(roundId: string): Target[] {
    const spawned: Target[] = [];

    for (let i = 0; i < this.maxActiveTargets; i++) {
      const target = this.createTarget(roundId);
      spawned.push(target);
    }

    return spawned;
  }

  /**
   * Handle target destruction, remove from active targets, and record telemetry.
   */
  public destroyTarget(targetId: string, destroyTime: string = new Date().toISOString()): Target | null {
    const target = this.activeTargets.get(targetId);
    if (target) {
      target.destroy(destroyTime);
      this.activeTargets.delete(targetId);
      this.telemetryCollector.recordTargetDestroy(targetId, target.destroyTime!);
      return target;
    }
    return null;
  }

  /**
   * Maintain active targets count by filling empty slots.
   */
  public maintainTargetCount(roundId: string): Target[] {
    const spawned: Target[] = [];

    while (this.activeTargets.size < this.maxActiveTargets) {
      const target = this.createTarget(roundId);
      spawned.push(target);
    }

    return spawned;
  }

  public getActiveTargets(): Target[] {
    return Array.from(this.activeTargets.values());
  }

  public getTarget(targetId: string): Target | undefined {
    return this.activeTargets.get(targetId);
  }

  /**
   * Check if a point (x, y) in world coordinates hits any active target.
   */
  public checkHit(x: number, y: number): Target | null {
    for (const target of this.activeTargets.values()) {
      if (!target.isDestroyed && target.isHit(x, y)) {
        return target;
      }
    }
    return null;
  }

  public getActiveCount(): number {
    return this.activeTargets.size;
  }

  public getMaxActiveTargets(): number {
    return this.maxActiveTargets;
  }

  public isMovementEnabled(): boolean {
    return this.movementEnabled;
  }

  public getMovementSpeed(): number {
    return this.movementSpeed;
  }

  public getSpawnArea(): SpawnArea {
    return { ...this.spawnArea };
  }

  public getCanvasWidth(): number {
    return this.canvasWidth;
  }

  public getCanvasHeight(): number {
    return this.canvasHeight;
  }

  public getTargetRadius(): number {
    return this.targetRadius;
  }

  public clearAll(): void {
    this.activeTargets.clear();
  }

  private getNearestTargetDistance(x: number, y: number): number {
    let minDistance = Infinity;

    for (const target of this.activeTargets.values()) {
      const dx = x - target.x;
      const dy = y - target.y;
      const distance = Math.hypot(dx, dy);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    return minDistance;
  }
}
