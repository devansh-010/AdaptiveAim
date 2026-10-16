import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { SixShotScene } from '../game/scenes/SixShotScene.ts';
import { MovingTargetsScene } from '../game/scenes/MovingTargetsScene.ts';
import { ThirtyShotScene } from '../game/scenes/ThirtyShotScene.ts';
import { GAME_CONFIG } from '../game/config/gameConfig.ts';

interface GameCanvasProps {
  mode?: 'six_shot' | 'moving_targets' | 'thirty_shot';
  onExit?: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ mode = 'six_shot', onExit }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Prevent duplicate Phaser instances during React strict mode double-invocations
    if (gameInstanceRef.current) {
      return;
    }

    const activeScene =
      mode === 'moving_targets'
        ? MovingTargetsScene
        : mode === 'thirty_shot'
        ? ThirtyShotScene
        : SixShotScene;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: GAME_CONFIG.canvas.backgroundColor,
      scene: [activeScene],
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
  }, [mode, onExit]);

  return (
    <div className="fullscreen-game-wrapper">
      <div ref={containerRef} id="phaser-container" className="fullscreen-phaser-container" />
    </div>
  );
};
