import React, { useState } from 'react';
import { GameCanvas } from '../components/GameCanvas';
import './App.css';

export type GameMode = 'home' | 'six_shot';

export const App: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<GameMode>('home');

  const handleSelectMode = (mode: GameMode) => {
    setCurrentMode(mode);
  };

  const handleExitGame = () => {
    setCurrentMode('home');
  };

  if (currentMode === 'six_shot') {
    return <GameCanvas onExit={handleExitGame} />;
  }

  return (
    <div className="home-container">
      <header className="home-header">
        <h1 className="home-title">ADAPTIVEAIM</h1>
        <p className="home-subtitle">Precision training. Built to adapt.</p>
      </header>

      <main className="modes-grid">
        {/* Card 1: Six Shot (Active) */}
        <div
          className="mode-card mode-card-active"
          onClick={() => handleSelectMode('six_shot')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleSelectMode('six_shot')}
        >
          <div className="card-badge badge-active">ACTIVE MODE</div>
          <h2 className="card-title">SIX SHOT</h2>
          <p className="card-description">
            Hit as many targets as possible within 30 seconds.
          </p>
          <button className="play-btn">PLAY</button>
        </div>

        {/* Card 2: Moving Targets (Coming Soon) */}
        <div className="mode-card mode-card-disabled">
          <div className="card-badge badge-disabled">COMING SOON</div>
          <h2 className="card-title">MOVING TARGETS</h2>
          <p className="card-description">
            Track and hit continuously moving targets.
          </p>
          <div className="disabled-status">COMING SOON</div>
        </div>

        {/* Card 3: Thirty Shot (Coming Soon) */}
        <div className="mode-card mode-card-disabled">
          <div className="card-badge badge-disabled">COMING SOON</div>
          <h2 className="card-title">THIRTY SHOT</h2>
          <p className="card-description">
            Hit 30 targets as quickly and accurately as possible.
          </p>
          <div className="disabled-status">COMING SOON</div>
        </div>
      </main>

      <footer className="home-footer">
        <p>AdaptiveAim v0.1 &bull; Modern Competitive Aim Trainer</p>
      </footer>
    </div>
  );
};

export default App;
