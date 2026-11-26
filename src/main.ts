import './styles/main.css';
import { GameApp } from './app/GameApp';

function bootstrap(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Krunked Tower failed to mount: missing #game-canvas element.');
  }

  const app = new GameApp({
    canvas,
    viewportHost: document.getElementById('stage-viewport'),
    hudHost: document.getElementById('hud-root'),
    touchHost: document.getElementById('touch-root'),
    uiHost: document.getElementById('ui-root'),
    toastHost: document.getElementById('toast-root'),
  });

  app.start();

  window.addEventListener('beforeunload', () => {
    app.dispose();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
