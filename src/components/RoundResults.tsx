import React from 'react';
import type { RoundSummary } from '../types/game';

export interface RoundResultsProps {
  summary: RoundSummary | null;
  onPlayAgain?: () => void;
}

/**
 * RoundResults presents post-round analytics and telemetry summaries.
 */
export const RoundResults: React.FC<RoundResultsProps> = ({ summary, onPlayAgain }) => {
  if (!summary) return null;

  return (
    <div className="round-results-modal">
      <div className="results-card">
        <h2>ROUND COMPLETE</h2>
        <div className="results-grid">
          <div className="result-item">
            <span className="result-label">Shots Fired</span>
            <span className="result-value">{summary.shotsFired}</span>
          </div>
          <div className="result-item">
            <span className="result-label">Hits</span>
            <span className="result-value">{summary.hits}</span>
          </div>
          <div className="result-item">
            <span className="result-label">Accuracy</span>
            <span className="result-value">{summary.accuracy.toFixed(1)}%</span>
          </div>
          <div className="result-item">
            <span className="result-label">Avg Reaction</span>
            <span className="result-value">{summary.avgReactionTime.toFixed(0)} ms</span>
          </div>
        </div>

        {onPlayAgain && (
          <button className="primary-button" onClick={onPlayAgain}>
            Play Again
          </button>
        )}
      </div>
    </div>
  );
};
