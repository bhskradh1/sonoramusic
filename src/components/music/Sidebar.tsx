import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Home, 
  Search, 
  Music, 
  Heart, 
  Plus, 
  Settings, 
  LogOut,
  Crown,
  Library,
  Clock,
  X,
  Share2,
  Users,
  TrendingUp,
  Mic2

} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onClose?: () => void;
  isMobile?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, onClose, isMobile }) => {
  const { signOut, isAdmin, user } = useAuth();
  const email = user?.email ?? '';
  const displayName = (user?.user_metadata as { display_name?: string; full_name?: string } | undefined)?.display_name
    ?? (user?.user_metadata as { full_name?: string } | undefined)?.full_name
    ?? (email ? email.split('@')[0] : 'Listener');
  const initial = (displayName[0] ?? 'M').toUpperCase();

  // Keep Search and Trending reachable from the mobile drawer as well
  // as the compact bottom navigation.
  const navItems = isMobile
    ? [
        { id: 'search', label: 'Search', icon: Search },
        { id: 'trending', label: 'Trending', icon: TrendingUp },
        { id: 'karaoke', label: 'Karaoke', icon: Mic2 },
        { id: 'friends', label: 'Friends', icon: Users },
      ]
    : [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'search', label: 'Search', icon: Search },
        { id: 'trending', label: 'Trending', icon: TrendingUp },
        { id: 'karaoke', label: 'Karaoke', icon: Mic2 },
        { id: 'friends', label: 'Friends', icon: Users },
        { id: 'library', label: 'Your Library', icon: Library },
      ];


  const libraryItems = [
    { id: 'liked', label: 'Liked Songs', icon: Heart },
    { id: 'playlists', label: 'Your Playlists', icon: Music },
    { id: 'shared-playlists', label: 'Shared with Me', icon: Share2 },
    { id: 'recently-played', label: 'Recently Played', icon: Clock },
  ];

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="glass-sidebar w-64 h-full flex flex-col">
      {/* Brand */}
      <div className="px-7 pt-7 pb-8">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Go to home"
            onClick={() => {
              onViewChange('home');
              onClose?.();
            }}
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
          >
            <span className="brand-bars"><i /><i /><i /><i /></span>
            <span className="font-display text-sm font-bold tracking-[.2em]">SONORA</span>
          </button>
          {isMobile && onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        {/* Main Navigation */}
        <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.18em] text-zinc-600">Browse &amp; collection</p>
        <div className="space-y-1 mb-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors ${
                  activeView === item.id
                    ? "bg-gradient-to-r from-foreground/10 to-transparent text-zinc-100"
                    : "text-zinc-500 hover:bg-foreground/[0.035] hover:text-zinc-200"
                }`}
                onClick={() => onViewChange(item.id)}
                aria-current={activeView === item.id ? 'page' : undefined}
              >
                <Icon className="w-[17px] h-[17px]" strokeWidth={1.7} />
                {item.label}
                {activeView === item.id && <i className="absolute right-0 h-4 w-0.5 rounded-full bg-zinc-200 shadow-[0_0_10px_white]" />}
              </button>
            );
          })}
        </div>

        <Separator className="my-4 bg-foreground/[0.08]" />

        {/* Library Section */}
        <div className="space-y-1 mb-6">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[9px] font-semibold uppercase tracking-[.18em] text-zinc-600">Library</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {libraryItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors ${
                  activeView === item.id
                    ? "bg-gradient-to-r from-foreground/10 to-transparent text-zinc-100"
                    : "text-zinc-500 hover:bg-foreground/[0.035] hover:text-zinc-200"
                }`}
                onClick={() => onViewChange(item.id)}
                aria-current={activeView === item.id ? 'page' : undefined}
              >
                <Icon className="w-[17px] h-[17px]" strokeWidth={1.7} />
                {item.label}
                {activeView === item.id && <i className="absolute right-0 h-4 w-0.5 rounded-full bg-zinc-200 shadow-[0_0_10px_white]" />}
              </button>
            );
          })}
        </div>

        <Separator className="my-4 bg-foreground/[0.08]" />

        {/* Admin Section */}
        {isAdmin && (
          <div className="space-y-1 mb-6">
            <div className="flex items-center gap-2 px-3 py-2">
              <Crown className="w-4 h-4 text-signal" />
              <span className="text-[9px] font-semibold uppercase tracking-[.18em] text-zinc-600">Admin</span>
            </div>
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors ${
                activeView === 'admin' ? "bg-gradient-to-r from-foreground/10 to-transparent text-zinc-100" : "text-zinc-500 hover:bg-foreground/[0.035] hover:text-zinc-200"
              }`}
              onClick={() => onViewChange('admin')}
            >
              <Settings className="w-[17px] h-[17px]" strokeWidth={1.7} />
              Admin Panel
            </button>
          </div>
        )}
      </ScrollArea>

      {/* Bottom Actions */}
      <div className="p-3 space-y-1 border-t border-foreground/[0.08]">
        <div className="flex items-center gap-3 px-2 pb-3 pt-1">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-zinc-400 to-zinc-800 text-[10px] font-semibold text-zinc-100">{initial}</span>
          <span className="min-w-0">
            <strong className="block truncate text-xs font-medium text-zinc-300">{displayName}</strong>
            <small className="block truncate text-[10px] text-zinc-600">{email || 'Sync your collection'}</small>
          </span>
        </div>
        <button
          type="button"
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors ${
            activeView === 'settings' ? "bg-gradient-to-r from-foreground/10 to-transparent text-zinc-100" : "text-zinc-500 hover:bg-foreground/[0.035] hover:text-zinc-200"
          }`}
          onClick={() => onViewChange('settings')}
        >
          <Settings className="w-[17px] h-[17px]" strokeWidth={1.7} />
          Settings
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs text-zinc-500 transition-colors hover:bg-destructive/15 hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="w-[17px] h-[17px]" strokeWidth={1.7} />
          Sign Out
        </button>
      </div>
    </div>
  );
};