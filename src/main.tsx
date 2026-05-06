import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

async function initializeApp() {
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#0a0a1a' });
    } catch {}
  }
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(<React.StrictMode><App /></React.StrictMode>);
  const splash = document.getElementById('splash');
  if (splash) { splash.style.transition = 'opacity 0.5s'; splash.style.opacity = '0'; setTimeout(() => splash.remove(), 500); }
  if (Capacitor.isNativePlatform()) { try { await SplashScreen.hide(); } catch {} }
}
initializeApp();
