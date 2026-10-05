import React from 'react';

export interface GameHUDProps {
  score?: number;
  accuracy?: number;
  timeRemaining?: number;
  modeName?: string;
}

/**
 * GameHUD displays heads-up display telemetry summary overlays during gameplay.
 * Complies with React architectural layer constraints (UI rendering only).
 */
export const GameHUD: React.FC<GameHUDProps> = ({
  score = 0,
  accuracy = 100,
  timeRemaining = 30,
  modeName = 'Six Shot',
}) => {
  return (
    <div className="game-hud">
      <div className="hud-metric">
        <span className="hud-label">MODE</span>
        <span className="hud-value">{modeName}</span>
      </div>
      <div className="hud-metric">
        <span className="hud-label">TIME</span>
        <span className="hud-value">{timeRemaining.toFixed(1)}s</span>
      </div>
      <div className="hud-metric">
        <span className="hud-label">SCORE</span>
        <span className="hud-value">{score}</span>
      </div>
      <div className="hud-metric">
        <span className="hud-label">ACCURACY</span>
        <span className="hud-value">{accuracy.toFixed(1)}%</span>
      </div>
    </div>
  );
};
