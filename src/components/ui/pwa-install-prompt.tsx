import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, Smartphone } from 'lucide-react';
import { usePWA } from '@/hooks/use-pwa';

export const PWAInstallPrompt: React.FC = () => {
  const { canInstall, installPWA, isInstalled, isIOS } = usePWA();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show prompt after a delay if app can be installed
    if ((canInstall || isIOS) && !isInstalled) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 3000); // Show after 3 seconds

      return () => clearTimeout(timer);
    }
  }, [canInstall, isIOS, isInstalled]);

  const handleInstall = async () => {
    try {
      await installPWA();
      setIsVisible(false);
    } catch (error) {
      console.error('Installation failed:', error);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    // Store dismissal in localStorage to avoid showing again
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  // Don't show if dismissed before
  if (!isVisible || isInstalled || localStorage.getItem('pwa-prompt-dismissed') === 'true') {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg p-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <Smartphone className="w-6 h-6 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">Install Sonora</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {isIOS && !canInstall
              ? 'Tap the Share button, then "Add to Home Screen" for a full-screen app'
              : 'Install our app for a better experience and background music playback'}
          </p>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="flex gap-2 mt-3">
        {canInstall && (
          <Button
            size="sm"
            className="flex-1 bg-primary hover:bg-primary/90"
            onClick={handleInstall}
          >
            <Download className="w-4 h-4 mr-2" />
            Install
          </Button>
        )}
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleDismiss}
        >
          Later
        </Button>
      </div>
    </div>
  );
};
