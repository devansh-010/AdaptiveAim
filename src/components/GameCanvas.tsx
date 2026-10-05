import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { SixShotScene } from '../game/scenes/SixShotScene';
import { GAME_CONFIG } from '../game/config/gameConfig';

export const GameCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Prevent duplicate Phaser instances during React strict mode double-invocations
    if (gameInstanceRef.current) {
      return;
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME_CONFIG.canvas.width,
      height: GAME_CONFIG.canvas.height,
      backgroundColor: GAME_CONFIG.canvas.backgroundColor,
      scene: [SixShotScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    const game = new Phaser.Game(config);
    gameInstanceRef.current = game;

    return () => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.destroy(true);
        gameInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="game-canvas-wrapper">
      <div ref={containerRef} id="phaser-container" className="phaser-container" />
    </div>
  );
};
