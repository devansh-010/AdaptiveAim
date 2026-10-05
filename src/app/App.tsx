import React from 'react';
import { GameCanvas } from '../components/GameCanvas';
import './App.css';

export const App: React.FC = () => {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">AdaptiveAim</h1>
        <div className="badge-container">
          <span className="mode-badge">Six Shot</span>
          <span className="status-badge">Coming Soon</span>
        </div>
      </header>

      <main className="game-main">
        <GameCanvas />
      </main>

      <footer className="app-footer">
        <p>v0.1 Non-AI Architecture Baseline &bull; Telemetry System Initialized</p>
      </footer>
    </div>
  );
};

export default App;
