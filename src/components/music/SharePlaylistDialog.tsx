import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Share2, X, Search, Check, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  sharePlaylist,
  unsharePlaylist,
  getPlaylistShares,
  UserProfile,
} from '@/lib/playlistSharing';
import { getFriends } from '@/lib/friends';

interface SharePlaylistDialogProps {
  playlistId: string;
  playlistName: string;
  currentUserId: string;
  triggerClassName?: string;
}

export const SharePlaylistDialog: React.FC<SharePlaylistDialogProps> = ({
  playlistId,
  playlistName,
  currentUserId,
  triggerClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [sharedWith, setSharedWith] = useState<any[]>([]);
  const [sharedUserIds, setSharedUserIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch shares + friends when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchShares();
      fetchFriends();
    }
  }, [isOpen]);

  const fetchShares = async () => {
    setIsLoading(true);
    try {
      const result = await getPlaylistShares(playlistId);
      if (result.success && result.data) {
        setSharedWith(result.data);
        const userIds = new Set(
          result.data.map((share: any) => share.shared_with_user_id)
        );
        setSharedUserIds(userIds);
      }
    } catch (error) {
      console.error('Error fetching shares:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFriends = async () => {
    const result = await getFriends(currentUserId);
    if (result.data) {
      const profiles: UserProfile[] = result.data
        .filter((f) => !!f.profile)
        .map((f) => ({
          id: f.profile!.user_id,
          username: f.profile!.username || '',
          display_name: f.profile!.display_name || undefined,
          avatar_url: f.profile!.avatar_url || undefined,
        }));
      setFriends(profiles);
    }
  };

  // Filter friends by search query and already-shared status
  const visibleFriends = friends.filter((f) => {
    if (sharedUserIds.has(f.id)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.username?.toLowerCase().includes(q) ||
      f.display_name?.toLowerCase().includes(q)
    );
  });

  const handleShare = async (userId: string) => {
    try {
      const result = await sharePlaylist(playlistId, userId, currentUserId);
      if (result.success) {
        setSharedUserIds((prev) => new Set([...prev, userId]));
        toast({
          title: 'Shared',
          description: `Playlist shared successfully`,
        });
        setSearchQuery('');
        await fetchShares();
        await fetchFriends();
      } else {
        throw new Error('Failed to share');
      }
    } catch (error) {
      console.error('Error sharing playlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to share playlist',
        variant: 'destructive',
      });
    }
  };

  const handleUnshare = async (userId: string) => {
    try {
      const result = await unsharePlaylist(playlistId, userId);
      if (result.success) {
        setSharedUserIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
        setSharedWith((prev) =>
          prev.filter((share: any) => share.shared_with_user_id !== userId)
        );
        toast({
          title: 'Unshared',
          description: 'Playlist unshared',
        });
        setSearchQuery('');
      } else {
        throw new Error('Failed to unshare');
      }
    } catch (error) {
      console.error('Error unsharing playlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to unshare playlist',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={triggerClassName}
          title="Share this playlist"
        >
          <Share2 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-card">
        <DialogHeader>
          <DialogTitle>Share "{playlistName}"</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Friends list with search filter */}
          <div className="space-y-2">
            <Label htmlFor="user-search" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Share with friends ({friends.length})
            </Label>
            <p className="text-xs text-muted-foreground">
              You can only share playlists with users you're friends with. Add friends from the Friends section.
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="user-search"
                placeholder="Filter friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            <div className="border rounded-md bg-background">
              {friends.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  You have no friends yet. Visit the Friends section to add some.
                </div>
              ) : visibleFriends.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {searchQuery.trim() ? 'No friends match your search' : 'All friends already have access'}
                </div>
              ) : (
                <ScrollArea className="h-48">
                  <div className="space-y-1 p-2">
                    {visibleFriends.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar_url} />
                            <AvatarFallback>
                              {user.display_name?.[0] || user.username?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {user.display_name || user.username}
                            </p>
                            {user.display_name && (
                              <p className="text-xs text-muted-foreground">
                                @{user.username}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleShare(user.id)}
                          className="h-8"
                        >
                          Share
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          {/* Shared With Section */}
          <div className="space-y-2">
            <Label>
              Shared with {sharedWith.length} user
              {sharedWith.length !== 1 ? 's' : ''}
            </Label>
            {sharedWith.length > 0 ? (
              <div className="border rounded-md bg-background p-3 space-y-2">
                {sharedWith.map((share: any) => (
                  <div
                    key={share.shared_with_user_id}
                    className="flex items-center justify-between p-2 rounded bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={share.profiles?.avatar_url}
                        />
                        <AvatarFallback>
                          {share.profiles?.display_name?.[0] ||
                            share.profiles?.username?.[0] ||
                            '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {share.profiles?.display_name ||
                            share.profiles?.username}
                        </p>
                        {share.profiles?.display_name && (
                          <p className="text-xs text-muted-foreground">
                            @{share.profiles?.username}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        handleUnshare(share.shared_with_user_id)
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded bg-muted/50 text-center text-sm text-muted-foreground">
                Not shared with anyone yet
              </div>
            )}
          </div>

          {/* Close Button */}
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="w-full"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
