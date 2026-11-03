import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, Share, Plus, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNativeInstall?: () => void;
  canNativeInstall: boolean;
}

export const InstallDialog: React.FC<InstallDialogProps> = ({
  open,
  onOpenChange,
  onNativeInstall,
  canNativeInstall,
}) => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  if (canNativeInstall) {
    // Trigger native install directly
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-center">Install Sonora</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center">
              <Download className="w-8 h-8 text-white" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Install Sonora on your device for the best experience with offline access and background playback.
            </p>
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => {
                onNativeInstall?.();
                onOpenChange(false);
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Install Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-center">Install Sonora</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center">
              <Download className="w-8 h-8 text-white" />
            </div>
          </div>

          {isIOS ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                To install Sonora on your iPhone/iPad:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Share className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">Step 1:</span> Tap the <strong>Share</strong> button at the bottom of Safari
                  </p>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">Step 2:</span> Scroll down and tap <strong>"Add to Home Screen"</strong>
                  </p>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Download className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">Step 3:</span> Tap <strong>"Add"</strong> to install
                  </p>
                </div>
              </div>
            </div>
          ) : isAndroid ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                To install Sonora on your Android device:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <MoreVertical className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">Step 1:</span> Tap the <strong>⋮ menu</strong> in Chrome
                  </p>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Download className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">Step 2:</span> Select <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong>
                  </p>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">Step 3:</span> Tap <strong>"Install"</strong> to confirm
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                To install Sonora, use Chrome or Edge and look for the install option in the browser menu or address bar.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center mt-2">
            Make sure you're visiting <strong>melodiya-your-sound.lovable.app</strong> directly in your browser (not inside another app).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
