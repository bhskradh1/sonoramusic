import React, { useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { MusicPlayer } from './MusicPlayer';
import { HomeView } from './HomeView';
import { SearchView } from './SearchView';
import { LikedSongsView } from './LikedSongsView';
import { PlaylistsView } from './PlaylistsView';
import { LibraryView } from './LibraryView';
import { SharedPlaylistsView } from './SharedPlaylistsView';
import { PlaylistDetailView } from './PlaylistDetailView';
import { OfflineLibraryView } from './OfflineLibraryView';
import { RecentlyPlayedView } from './RecentlyPlayedView';
import { TrendingView } from './TrendingView';
import { SettingsView } from './SettingsView';
import { FriendsView } from './FriendsView';
import { KaraokeView } from './KaraokeView';
import { MusicDiscoveryDetailView, type MusicMood } from './MusicDiscoveryDetailView';
import type { MusicArtist } from '@/lib/musicSearch';
import { AdminView } from '../admin/AdminView';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Menu, X, Home, Search, TrendingUp, Library } from 'lucide-react';
import { usePreferences, LANGUAGE_LABELS } from '@/contexts/PreferencesContext';
import { toast } from 'sonner';

const bottomNavItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'library', label: 'Library', icon: Library },
];


interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
  audioUrl?: string;
  audio_url?: string;
  source?: 'youtube_music' | string;
  musicBrainzId?: string;
  playlistId?: string;
}

export const MelodiyaApp: React.FC = () => {
  const [activeView, setActiveView] = useState('home');
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const previousOnlineViewRef = useRef('home');
  const historyInitializedRef = useRef(false);
  const lastRootBackAtRef = useRef(0);
  const mobileSidebarOpenRef = useRef(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaylistMode, setIsPlaylistMode] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<MusicArtist | null>(null);
  const [selectedMood, setSelectedMood] = useState<MusicMood | null>(null);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const mainRef = useRef<HTMLDivElement>(null);

  // Keep a real browser-history entry for each in-app screen. Installed
  // Android PWAs use this stack for the system Back gesture/button.
  const navigateToView = (
    view: string,
    playlistId: string | null = null,
    discovery?: { artist?: MusicArtist; mood?: MusicMood },
  ) => {
    if (!isOnline && view !== 'offline-library') return;
    const currentState = window.history.state as {
      __melodiyaAppNavigation?: boolean;
      __melodiyaSidebarOverlay?: boolean;
      activeView?: string;
      selectedPlaylistId?: string | null;
      selectedArtist?: MusicArtist | null;
      selectedMood?: MusicMood | null;
      depth?: number;
    } | null;

    const isClosingSidebar = mobileSidebarOpenRef.current && currentState?.__melodiyaSidebarOverlay;
    if (!isClosingSidebar &&
        currentState?.__melodiyaAppNavigation &&
        currentState.activeView === view &&
        (currentState.selectedPlaylistId ?? null) === playlistId) {
      return;
    }

    const nextState = {
      __melodiyaAppNavigation: true,
      depth: Number(currentState?.depth ?? 0) + 1,
      activeView: view,
      selectedPlaylistId: playlistId,
      selectedArtist: discovery?.artist ?? null,
      selectedMood: discovery?.mood ?? null,
    };

    // Choosing an item in the open drawer replaces its temporary overlay
    // entry, so Back returns to the screen that opened the drawer.
    if (isClosingSidebar) {
      window.history.replaceState(nextState, '', window.location.href);
      mobileSidebarOpenRef.current = false;
      setIsMobileSidebarOpen(false);
    } else {
      window.history.pushState(nextState, '', window.location.href);
    }

    lastRootBackAtRef.current = 0;
    setSelectedPlaylistId(playlistId);
    setSelectedArtist(discovery?.artist ?? null);
    setSelectedMood(discovery?.mood ?? null);
    setActiveView(view);
  };

  const openMobileSidebar = () => {
    if (mobileSidebarOpenRef.current) return;

    const currentState = window.history.state as Record<string, unknown> | null;
    const baseState = currentState ?? {
      __melodiyaAppNavigation: true,
      depth: 0,
      activeView,
      selectedPlaylistId,
      selectedArtist,
      selectedMood,
    };

    window.history.pushState(
      { ...baseState, __melodiyaSidebarOverlay: true },
      '',
      window.location.href,
    );
    mobileSidebarOpenRef.current = true;
    setIsMobileSidebarOpen(true);
  };

  const closeMobileSidebar = () => {
    const currentState = window.history.state as { __melodiyaSidebarOverlay?: boolean } | null;
    if (mobileSidebarOpenRef.current && currentState?.__melodiyaSidebarOverlay) {
      // The popstate handler closes the drawer without changing the screen.
      window.history.back();
      return;
    }

    mobileSidebarOpenRef.current = false;
    setIsMobileSidebarOpen(false);
  };

  useEffect(() => {
    const rootState = {
      __melodiyaAppNavigation: true,
      __melodiyaRoot: true,
      depth: 0,
      activeView: 'home',
      selectedPlaylistId: null,
      selectedArtist: null,
      selectedMood: null,
    };
    const exitGuardState = {
      __melodiyaAppNavigation: true,
      __melodiyaExitGuard: true,
      depth: 0,
      activeView: 'home',
      selectedPlaylistId: null,
      selectedArtist: null,
      selectedMood: null,
    };

    // React StrictMode may re-run effects in development; initialize the
    // history stack once but always attach the listener for the current mount.
    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      window.history.replaceState(rootState, '', window.location.href);
      window.history.pushState(exitGuardState, '', window.location.href);
    }

    const handlePopState = (event: PopStateEvent) => {
      if (!navigator.onLine) {
        setActiveView('offline-library');
        return;
      }
      // Android Back should dismiss the mobile drawer before navigating away.
      if (mobileSidebarOpenRef.current) {
        mobileSidebarOpenRef.current = false;
        setIsMobileSidebarOpen(false);
        return;
      }

      const state = event.state as {
        __melodiyaAppNavigation?: boolean;
        __melodiyaRoot?: boolean;
        activeView?: string;
        selectedPlaylistId?: string | null;
        selectedArtist?: MusicArtist | null;
        selectedMood?: MusicMood | null;
      } | null;

      if (state?.__melodiyaAppNavigation && state.__melodiyaRoot) {
        const now = Date.now();
        if (now - lastRootBackAtRef.current <= 2000) {
          // We are already back on the root entry. Move back once more so
          // Android/the browser can close the standalone PWA when supported.
          lastRootBackAtRef.current = 0;
          window.history.back();
          return;
        }

        lastRootBackAtRef.current = now;
        toast('Press back again to exit Sonora');
        window.history.pushState(exitGuardState, '', window.location.href);
        return;
      }

      if (state?.__melodiyaAppNavigation) {
        lastRootBackAtRef.current = 0;
        setSelectedPlaylistId(state.selectedPlaylistId ?? null);
        setSelectedArtist(state.selectedArtist ?? null);
        setSelectedMood(state.selectedMood ?? null);
        setActiveView(state.activeView ?? 'home');
        return;
      }

      // Recover safely if the browser reports an unexpected/null history state.
      const now = Date.now();
      if (now - lastRootBackAtRef.current <= 2000) {
        lastRootBackAtRef.current = 0;
        window.history.back();
        return;
      }

      lastRootBackAtRef.current = now;
      setSelectedPlaylistId(null);
      setSelectedArtist(null);
      setSelectedMood(null);
      setActiveView('home');
      toast('Press back again to exit Sonora');
      window.history.pushState(exitGuardState, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Treat connection changes as a global navigation mode. In offline mode
  // all online discovery/search views are replaced by the local playlist shelf.
  useEffect(() => {
    const updateNetworkStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      if (activeView !== 'offline-library') previousOnlineViewRef.current = activeView;
      mobileSidebarOpenRef.current = false;
      setIsMobileSidebarOpen(false);
      setActiveView('offline-library');
      setSelectedPlaylistId(null);
      setSelectedArtist(null);
      setSelectedMood(null);
    } else if (activeView === 'offline-library') {
      setActiveView(previousOnlineViewRef.current || 'home');
    }
  }, [isOnline, activeView]);

  // Always land at the top of a view when switching sections
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeView]);

  // Accept optional playlist argument
  const handlePlayTrack = async (track: Track, newPlaylist?: Track[]) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    if (newPlaylist && newPlaylist.length > 0) {
      setPlaylist(newPlaylist);
      setIsPlaylistMode(true);
      const clickedIndex = newPlaylist.findIndex(t => t.id === track.id);
      setCurrentIndex(clickedIndex >= 0 ? clickedIndex : 0);
    } else {
      // Add to playlist if not already there
      if (!playlist.find(t => t.id === track.id)) {
        const newIndex = playlist.length;
        setPlaylist(prev => [...prev, track]);
        setCurrentIndex(newIndex);
      } else {
        const index = playlist.findIndex(t => t.id === track.id);
        setCurrentIndex(index);
      }
    }

    // Recently-played writes require a connection; offline playback should not
    // wait on a Supabase request before using the local IndexedDB Blob.
    if (!navigator.onLine) return;

    // Save to recently played
    try {
      // First, delete any existing entry for this song to avoid duplicates
      await supabase
        .from('recently_played')
        .delete()
        .eq('user_id', user?.id)
        .eq('youtube_video_id', track.videoId);

      // Then insert the new entry
      const { error } = await supabase
        .from('recently_played')
        .insert({
          user_id: user?.id,
          youtube_video_id: track.videoId,
          title: track.title,
          artist: track.artist,
          thumbnail_url: track.thumbnail,
          played_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving to recently played:', error);
      } else {
        console.log('Successfully saved to recently played:', track.title);
      }
    } catch (error) {
      console.error('Error saving to recently played:', error);
    }
  };

  const handlePlayPause = () => {
    console.log(`${isPlaying ? 'Pausing' : 'Playing'} track: ${currentTrack?.title}`);
    setIsPlaying(previous => !previous);
  };

  const fetchRelatedTracks = async (track: Track): Promise<Track[]> => {
    try {
      const code = preferences.preferred_language || '';
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: {
          related: {
            videoId: track.videoId,
            title: track.title,
            artist: track.artist,
            musicBrainzId: track.musicBrainzId,
            language: LANGUAGE_LABELS[code] || '',
            languageCode: /^[a-z]{2}$/i.test(code) ? code : '',
            genres: preferences.favorite_genres || [],
            // Everything already queued/played, so nothing repeats.
            // Artists are sent in play order; the server blocks only the latest 8.
            excludeTitles: playlist.map(t => t.title),
            excludeVideoIds: playlist.map(t => t.videoId),
            excludeArtists: playlist.map(t => t.artist),
            excludeMusicBrainzIds: playlist.map(t => t.musicBrainzId).filter(Boolean),
            limit: 15,
          },
        },
      });
      if (error || !data?.tracks) return [];
      const existingIds = new Set(playlist.map(t => t.videoId));
      existingIds.add(track.videoId);
      return (data.tracks as Track[]).filter(t => !existingIds.has(t.videoId));
    } catch (err) {
      console.error('Error fetching related tracks:', err);
      return [];
    }
  };

  // Manual Next must work even when autoplay is disabled. The autoplay
  // preference only controls whether playback advances at the end of a song.
  const advanceToNextTrack = async (automatic = false) => {
    const hasQueuedNext = playlist.length > 0 && currentIndex + 1 < playlist.length;
    if (automatic && !preferences.auto_play && !hasQueuedNext) {
      setIsPlaying(false);
      return;
    }

    if (hasQueuedNext) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setCurrentTrack(playlist[nextIndex]);
      setIsPlaying(true);
    } else if (isPlaylistMode && playlist.length > 0) {
      setCurrentIndex(0);
      setCurrentTrack(playlist[0]);
      setIsPlaying(true);
    } else if (currentTrack) {
      // A manual skip may fetch a related track even when autoplay is off.
      const related = await fetchRelatedTracks(currentTrack);
      if (related.length > 0) {
        const nextTrack = related[0];
        setPlaylist(prev => [...prev, ...related]);
        setCurrentIndex(prev => prev + 1);
        setCurrentTrack(nextTrack);
        setIsPlaying(true);
      } else {
        console.info('No new eligible recommendations. Stopping playback.');
        setIsPlaying(false);
      }
    }
  };

  const handleNext = () => advanceToNextTrack(false);
  const handleTrackEnded = () => advanceToNextTrack(true);

  const handlePrevious = () => {
    if (playlist.length > 0) {
      const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
      setCurrentIndex(prevIndex);
      setCurrentTrack(playlist[prevIndex]);
      setIsPlaying(true);
      
      console.log(`Skipping to previous track: ${playlist[prevIndex]?.title}`);
    } else if (currentTrack) {
      // If no playlist, just restart current track
      console.log('No playlist available, restarting current track');
      setIsPlaying(true);
    }
  };

  const handleViewPlaylist = (playlistId: string) => {
    navigateToView('playlist-detail', playlistId);
  };

  const handleBackFromPlaylist = () => {
    const currentState = window.history.state as {
      __melodiyaAppNavigation?: boolean;
      depth?: number;
    } | null;

    if (currentState?.__melodiyaAppNavigation && Number(currentState.depth ?? 0) > 0) {
      window.history.back();
    } else {
      navigateToView('playlists');
    }
  };

  const renderView = () => {
    switch (activeView) {
      case 'offline-library':
        return <OfflineLibraryView onPlayTrack={handlePlayTrack} />;
      case 'home':
        return (
          <HomeView
            onPlayTrack={handlePlayTrack}
            onViewChange={navigateToView}
            onSelectArtist={(artist) => navigateToView('artist-detail', null, { artist })}
            onSelectMood={(mood) => navigateToView('mood-detail', null, { mood })}
          />
        );
      case 'artist-detail':
        return selectedArtist ? (
          <MusicDiscoveryDetailView artist={selectedArtist} onBack={() => window.history.back()} onPlayTrack={handlePlayTrack} />
        ) : <HomeView onPlayTrack={handlePlayTrack} onViewChange={navigateToView} onSelectArtist={(artist) => navigateToView('artist-detail', null, { artist })} onSelectMood={(mood) => navigateToView('mood-detail', null, { mood })} />;
      case 'mood-detail':
        return selectedMood ? (
          <MusicDiscoveryDetailView mood={selectedMood} onBack={() => window.history.back()} onPlayTrack={handlePlayTrack} />
        ) : <HomeView onPlayTrack={handlePlayTrack} onViewChange={navigateToView} onSelectArtist={(artist) => navigateToView('artist-detail', null, { artist })} onSelectMood={(mood) => navigateToView('mood-detail', null, { mood })} />;
      case 'search':
        return <SearchView onPlayTrack={handlePlayTrack} />;
      case 'trending':
        return <TrendingView onPlayTrack={handlePlayTrack} />;
      case 'liked':
        return <LikedSongsView onPlayTrack={handlePlayTrack} />;
      case 'playlists':
        return <PlaylistsView onPlayTrack={handlePlayTrack} onViewPlaylist={handleViewPlaylist} />;
      case 'shared-playlists':
        return <SharedPlaylistsView onPlayTrack={handlePlayTrack} onViewPlaylist={handleViewPlaylist} />;
      case 'playlist-detail':
        return selectedPlaylistId ? (
          <PlaylistDetailView 
            playlistId={selectedPlaylistId} 
            onPlayTrack={handlePlayTrack} 
            onBack={handleBackFromPlaylist} 
          />
        ) : <PlaylistsView onPlayTrack={handlePlayTrack} onViewPlaylist={handleViewPlaylist} />;
      case 'recently-played':
        return <RecentlyPlayedView onPlayTrack={handlePlayTrack} />;
      case 'admin':
        return <AdminView />;
      case 'library':
        return <LibraryView onPlayTrack={handlePlayTrack} onViewChange={navigateToView} />;
      case 'friends':
        return <FriendsView />;
      case 'karaoke':
        return <KaraokeView onPlayTrack={handlePlayTrack} />;
      case 'settings':
        return <SettingsView />;
      default:
        return (
          <HomeView
            onPlayTrack={handlePlayTrack}
            onViewChange={navigateToView}
            onSelectArtist={(artist) => navigateToView('artist-detail', null, { artist })}
            onSelectMood={(mood) => navigateToView('mood-detail', null, { mood })}
          />
        );
    }
  };

  return (
    <div className="h-[100dvh] min-h-0 w-full max-w-full overflow-hidden flex flex-col bg-background">
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {/* Mobile Header */}
        {isOnline && isMobile && (
          <div className="absolute top-0 left-0 right-0 z-50 h-16 bg-gradient-to-b from-background/95 via-background/80 to-transparent backdrop-blur-lg flex items-center gap-3 px-5">
            <button
              type="button"
              aria-label="Open menu"
              onClick={openMobileSidebar}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-foreground/10 text-muted-foreground transition-colors active:bg-foreground/5"
            >
              <Menu className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              aria-label="Go to home"
              onClick={() => {
                navigateToView('home');
                closeMobileSidebar();
              }}
              className="flex items-center gap-3 justify-start transition-opacity active:opacity-70"
            >
              <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-zinc-300 to-zinc-700 text-xs font-semibold text-zinc-950">S</span>
              <span className="font-display text-xl font-semibold tracking-[-.03em] text-zinc-300">Sonora</span>
            </button>
          </div>
        )}

        {/* Sidebar */}
        {isOnline && <div className={`${isMobile ? (isMobileSidebarOpen ? 'fixed inset-y-0 left-0 z-50 w-64' : 'hidden') : 'relative w-64'}`}>
          <Sidebar 
            activeView={activeView} 
            onViewChange={navigateToView}
            onClose={closeMobileSidebar}
            isMobile={isMobile}
          />
        </div>}

        {/* Mobile Sidebar Overlay */}
        {isOnline && isMobile && isMobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={closeMobileSidebar}
          />
        )}
        
        {/* Main Content */}
        <div ref={mainRef} className={`flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain ${isOnline && isMobile ? 'pt-16' : ''}`}>
          {isOnline && !isMobile && (
            <div className="sticky top-0 z-20 flex h-20 items-center gap-3 bg-gradient-to-b from-background/95 via-background/80 to-transparent px-10 backdrop-blur-lg">
              {activeView !== 'search' && (
                <button
                  type="button"
                  onClick={() => navigateToView('search')}
                  aria-label="Search Sonora"
                  className="search-spotlight w-full max-w-md text-left"
                >
                  <span className="search-lens"><Search className="h-4 w-4" /></span>
                  <span className="flex-1 px-3 text-xs text-zinc-600">Search the Sonora catalog…</span>
                </button>
              )}
            </div>
          )}
          {renderView()}
        </div>
      </div>
      
      {/* Music Player (above mobile bottom nav) */}
      <MusicPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onTrackEnded={handleTrackEnded}
        offlineMode={!isOnline}
      />

      {/* Mobile Bottom Navigation */}
      {isOnline && isMobile && (
        <nav aria-label="Mobile navigation" className="md:hidden border-t border-foreground/[0.08] bg-[#0b0c0c]/95 backdrop-blur-3xl flex items-stretch justify-around flex-shrink-0 px-2 pb-[env(safe-area-inset-bottom)]">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeView === item.id ||
              (item.id === 'home' && ['artist-detail', 'mood-detail'].includes(activeView)) ||
              (item.id === 'library' &&
                ['library', 'liked', 'playlists', 'shared-playlists', 'recently-played', 'playlist-detail'].includes(activeView));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateToView(item.id)}
                className={`flex h-[4.25rem] flex-col items-center justify-center gap-1 flex-1 transition-colors ${
                  isActive ? 'text-zinc-100' : 'text-zinc-600'
                }`}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={1.7} fill={isActive && item.id === 'home' ? 'currentColor' : 'none'} />
                <span className="text-[10px] leading-none">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
};

// Keep the Sonora app entry-point name while preserving the original export.
export { MelodiyaApp as SonoraApp };
