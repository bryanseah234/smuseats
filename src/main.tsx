/**
 * main.tsx — Application entry point.
 *
 * Mounts the React app inside a BrowserRouter so all routes
 * defined in App.tsx work with browser-native URLs.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
