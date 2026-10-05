import { Target } from '../entities/Target';

export interface SpawnArea {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * TargetManager handles target placement, active target pool maintenance,
 * collision bounds validation, and replacement target generation.
 */
export class TargetManager {
  private activeTargets: Map<string, Target> = new Map();
  private maxActiveTargets: number;
  private spawnArea: SpawnArea;

  constructor(maxTargets: number = 6, spawnArea: SpawnArea = { minX: 100, maxX: 800, minY: 100, maxY: 500 }) {
    this.maxActiveTargets = maxTargets;
    this.spawnArea = spawnArea;
  }

  /**
   * TODO: Generate a non-overlapping valid random spawn coordinate within spawnArea.
   */
  public generateValidSpawnPosition(_targetRadius: number): { x: number; y: number } {
    // Placeholder coordinates calculation
    const x = Math.floor(Math.random() * (this.spawnArea.maxX - this.spawnArea.minX)) + this.spawnArea.minX;
    const y = Math.floor(Math.random() * (this.spawnArea.maxY - this.spawnArea.minY)) + this.spawnArea.minY;
    return { x, y };
  }

  /**
   * TODO: Create and register a new target entity.
   */
  public createTarget(_roundId: string, _targetSize: number): Target | null {
    // TODO: Instantiate Target entity and add to activeTargets Map
    return null;
  }

  /**
   * TODO: Handle target destruction and spawn a replacement target to maintain target count.
   */
  public destroyTarget(_targetId: string, _destroyTime: number = Date.now()): void {
    // TODO: Remove target from activeTargets Map, record destroy time, and spawn replacement
  }

  /**
   * TODO: Maintain six active targets by filling empty target slots.
   */
  public maintainTargetCount(_roundId: string, _targetSize: number): void {
    // TODO: Loop until activeTargets count reaches maxActiveTargets
  }

  public getActiveTargets(): Target[] {
    return Array.from(this.activeTargets.values());
  }

  public getActiveCount(): number {
    return this.activeTargets.size;
  }

  public getMaxActiveTargets(): number {
    return this.maxActiveTargets;
  }

  public clearAll(): void {
    this.activeTargets.clear();
  }
}
