import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps {
  videoId: string | null;
  isPlaying: boolean;
  isVisible?: boolean;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onEnd?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export const YouTubePlayer = forwardRef<any, YouTubePlayerProps>(({
  videoId,
  isPlaying,
  isVisible = false,
  onReady,
  onStateChange,
  onEnd,
  onTimeUpdate
}, ref) => {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerElementRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);
  const onEndRef = useRef(onEnd);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const [isReady, setIsReady] = useState(false);

  useImperativeHandle(ref, () => playerRef.current);

  useEffect(() => {
    onReadyRef.current = onReady;
    onStateChangeRef.current = onStateChange;
    onEndRef.current = onEnd;
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onReady, onStateChange, onEnd, onTimeUpdate]);

  useEffect(() => {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = initializePlayer;
    } else {
      initializePlayer();
    }
  }, []);

  const initializePlayer = () => {
    if (containerRef.current && window.YT && window.YT.Player) {
      // Create a child element for YouTube to replace (keeps React's ref intact)
      if (playerElementRef.current) {
        playerElementRef.current.remove();
      }
      const el = document.createElement('div');
      el.id = 'yt-player-target';
      containerRef.current.appendChild(el);
      playerElementRef.current = el;

      console.log('Initializing YouTube player...');
      playerRef.current = new window.YT.Player(el, {
        height: '100%',
        width: '100%',
        videoId: videoId || '',
        playerVars: {
          autoplay: 0,
          controls: 1,
          disablekb: 0,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0,
        },
        events: {
          onReady: () => {
            console.log('YouTube player ready');
            setIsReady(true);
            setTimeout(() => {
              onReadyRef.current?.();
            }, 100);
          },
          onStateChange: (event: any) => {
            console.log('YouTube player state changed:', event.data);
            onStateChangeRef.current?.(event.data);
            
            if (event.data === 1) {
              startTimeTracking();
            } else if (event.data === 2 || event.data === 0) {
              stopTimeTracking();
            }
            
            if (event.data === 0) {
              onEndRef.current?.();
            }
          },
          onError: (event: any) => {
            console.error('YouTube player error:', event.data);
          }
        }
      });
    }
  };

  const startTimeTracking = () => {
    stopTimeTracking(); // Clear any existing interval
    
    intervalRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function' && typeof playerRef.current.getDuration === 'function') {
        const currentTime = playerRef.current.getCurrentTime();
        const duration = playerRef.current.getDuration();
        
        if (duration > 0) {
          onTimeUpdateRef.current?.(currentTime, duration);
        }
      }
    }, 250);
  };

  const stopTimeTracking = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopTimeTracking();
    };
  }, []);

  useEffect(() => {
    if (playerRef.current && videoId) {
      console.log('Loading video:', videoId);
      try {
        // First cue the video to ensure it's loaded
        playerRef.current.cueVideoById(videoId);
        console.log('Video cue command sent for:', videoId);
        
        // Then load it for immediate playback if needed
        setTimeout(() => {
          if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
            playerRef.current.loadVideoById(videoId);
            console.log('Video load command sent for:', videoId);
          }
        }, 100);
      } catch (error) {
        console.error('Error loading video:', error);
      }
    }
  }, [videoId]);

  useEffect(() => {
    if (!playerRef.current || !isReady) return;

    if (isPlaying) {
      console.log('Playing video');
      try {
        playerRef.current.playVideo();
        startTimeTracking();
        console.log('Play command sent');
      } catch (error) {
        console.error('Error playing video:', error);
      }
    } else {
      console.log('Pausing video');
      try {
        playerRef.current.pauseVideo();
        stopTimeTracking();
        console.log('Pause command sent');
      } catch (error) {
        console.error('Error pausing video:', error);
      }
    }
  }, [isPlaying, isReady]);

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top) + 4.25rem)',
        left: '50%',
        transform: 'translateX(-50%) translateZ(0)',
        WebkitTransform: 'translateX(-50%) translateZ(0)',
        width: 'min(92vw, 480px)',
        height: 'min(52vw, 270px)',
        minWidth: '200px',
        minHeight: '200px',
        maxHeight: '32dvh',
        opacity: isVisible ? 1 : 0,
        visibility: isVisible ? 'visible' : 'hidden',
        zIndex: isVisible ? 85 : -1,
        pointerEvents: isVisible ? 'auto' : 'none',
        overflow: 'hidden',
        borderRadius: '16px',
        background: '#000',
        display: isVisible ? 'block' : 'none',
      }}
    />
  );
});

YouTubePlayer.displayName = 'YouTubePlayer';
