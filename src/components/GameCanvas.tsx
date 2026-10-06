import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { SixShotScene } from '../game/scenes/SixShotScene';
import { GAME_CONFIG } from '../game/config/gameConfig';

interface GameCanvasProps {
  onExit?: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ onExit }) => {
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
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: GAME_CONFIG.canvas.backgroundColor,
      scene: [SixShotScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    const game = new Phaser.Game(config);
    if (onExit) {
      game.registry.set('onExit', onExit);
    }
    gameInstanceRef.current = game;

    return () => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.destroy(true);
        gameInstanceRef.current = null;
      }
    };
  }, [onExit]);

  return (
    <div className="fullscreen-game-wrapper">
      <div ref={containerRef} id="phaser-container" className="fullscreen-phaser-container" />
    </div>
  );
};
