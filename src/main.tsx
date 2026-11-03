import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Capacitor intercepts Android's hardware/gesture Back button. Use the
// app's own React section history first; only exit from the home section.
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  void NativeApp.addListener('backButton', ({ canGoBack }) => {
    const state = window.history.state as { __melodiyaAppNavigation?: boolean; depth?: number } | null;
    const appDepth = state?.__melodiyaAppNavigation ? Number(state.depth ?? 0) : 0;

    if (appDepth > 0 || (canGoBack && window.history.length > 1)) {
      window.history.back();
      return;
    }

    void NativeApp.exitApp();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
