import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { IS_NATIVE, IS_PORTAL } from './lib/env';
import PortalApp from './PortalApp';
import './index.css';
import './theme-dark.css';
import App from './App';
import { AppProvider } from './lib/store';
import { CreatorProvider } from './lib/creatorStore';

const Router = IS_NATIVE ? HashRouter : BrowserRouter;
if (IS_PORTAL) document.title = 'BEE-OAK Partners · Creator & Staff';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <AppProvider>
        <CreatorProvider>
          {IS_PORTAL ? <PortalApp /> : <App />}
        </CreatorProvider>
      </AppProvider>
    </Router>
  </StrictMode>,
);

// Fade out the boot splash once the first frame of the app is painted.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('out');
  setTimeout(() => boot.remove(), 400);
}));
