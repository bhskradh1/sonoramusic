import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAState {
  isInstalled: boolean;
  isOnline: boolean;
  canInstall: boolean;
  isIOS: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
}

const getInitialOnlineStatus = () => {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
};

const clearPwaCachesAndWorkers = async () => {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((key) => key.startsWith('melodiya-'))
        .map((key) => caches.delete(key))
    );
  }
};

export const usePWA = () => {
  const [pwaState, setPwaState] = useState<PWAState>({
    isInstalled: false,
    isOnline: getInitialOnlineStatus(),
    canInstall: false,
    isIOS: typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent),
    deferredPrompt: null,
  });

  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const checkIfInstalled = useCallback(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (standalone) {
      setPwaState((prev) => ({ ...prev, isInstalled: true }));
    }
  }, []);

  const handleOnlineStatus = useCallback(() => {
    setPwaState((prev) => ({ ...prev, isOnline: navigator.onLine }));
  }, []);

  const handleBeforeInstallPrompt = useCallback((e: Event) => {
    e.preventDefault();
    setPwaState((prev) => ({
      ...prev,
      canInstall: true,
      deferredPrompt: e as BeforeInstallPromptEvent,
    }));
  }, []);

  const handleAppInstalled = useCallback(() => {
    setPwaState((prev) => ({ ...prev, isInstalled: true, canInstall: false, deferredPrompt: null }));
  }, []);

  const installPWA = useCallback(async () => {
    if (!pwaState.deferredPrompt) return;

    await pwaState.deferredPrompt.prompt();
    const { outcome } = await pwaState.deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setPwaState((prev) => ({
        ...prev,
        canInstall: false,
        deferredPrompt: null,
        isInstalled: true,
      }));
    }
  }, [pwaState.deferredPrompt]);

  const handleMusicAction = useCallback((action: string) => {
    window.dispatchEvent(new CustomEvent('music-action', { detail: { action } }));
  }, []);

  const registerServiceWorker = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // Critical: never keep service worker active in Vite dev/sandbox preview.
    if (import.meta.env.DEV) {
      await clearPwaCachesAndWorkers();
      setSwRegistration(null);
      return;
    }

    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      setSwRegistration(registration);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('New service worker available');
          }
        });
      });

      console.log('Service Worker registered successfully');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }, []);

  const requestBackgroundSync = useCallback(
    async (tag: string) => {
      if (!swRegistration || !("sync" in swRegistration)) {
        console.log('Background sync not supported or service worker not ready');
        return;
      }

      if (tag.length > 100) {
        console.warn('Background sync tag too long, skipping');
        return;
      }

      try {
        await (swRegistration as any).sync.register(tag);
        console.log('Background sync registered:', tag);
      } catch (error) {
        console.warn('Background sync registration failed, continuing without sync:', error);
      }
    },
    [swRegistration]
  );

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }, []);

  const showNotification = useCallback(async (title: string, options?: NotificationOptions) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return null;
    try {
      // Android Chrome only allows notifications through the service worker
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, options);
        return null;
      }
    } catch {
      // fall through to the plain Notification API
    }
    try {
      return new Notification(title, options);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    checkIfInstalled();
    void registerServiceWorker();

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MUSIC_ACTION') {
        handleMusicAction(event.data.action);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [checkIfInstalled, registerServiceWorker, handleOnlineStatus, handleBeforeInstallPrompt, handleAppInstalled, handleMusicAction]);

  return {
    ...pwaState,
    installPWA,
    requestBackgroundSync,
    requestNotificationPermission,
    showNotification,
    swRegistration,
  };
};
