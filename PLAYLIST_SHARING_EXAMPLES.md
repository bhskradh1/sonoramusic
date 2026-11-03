# Playlist Sharing - Code Examples

## Using the Share Functionality

### Example 1: Using SharePlaylistDialog in a Component

```tsx
import { SharePlaylistDialog } from '@/components/music/SharePlaylistDialog';

export const MyComponent = () => {
  const { user } = useAuth();

  return (
    <SharePlaylistDialog
      playlistId="playlist-uuid-here"
      playlistName="My Favorite Songs"
      currentUserId={user?.id || ''}
      triggerClassName="h-6 w-6 p-0"
    />
  );
};
```

### Example 2: Programmatic Sharing

```tsx
import { sharePlaylist, unsharePlaylist } from '@/lib/playlistSharing';

// Share a playlist
const handleShare = async () => {
  const result = await sharePlaylist(
    'playlist-id',
    'user-to-share-with-id',
    'current-user-id'
  );
  
  if (result.success) {
    console.log('Playlist shared successfully');
  } else {
    console.error('Failed to share:', result.error);
  }
};

// Unshare a playlist
const handleUnshare = async () => {
  const result = await unsharePlaylist('playlist-id', 'user-id');
  
  if (result.success) {
    console.log('Playlist unshared');
  }
};
```

### Example 3: Fetching Shared Playlists

```tsx
import { getSharedPlaylistsWithMe } from '@/lib/playlistSharing';
import { useAuth } from '@/components/auth/AuthProvider';
import { useEffect, useState } from 'react';

export const SharedPlaylistsList = () => {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState([]);

  useEffect(() => {
    const fetchShared = async () => {
      const result = await getSharedPlaylistsWithMe(user?.id || '');
      if (result.success) {
        setPlaylists(result.data);
      }
    };

    if (user) {
      fetchShared();
    }
  }, [user]);

  return (
    <div>
      {playlists.map(playlist => (
        <div key={playlist.id}>
          <h3>{playlist.name}</h3>
          <p>Shared by: {playlist.shared_by_username}</p>
        </div>
      ))}
    </div>
  );
};
```

### Example 4: Searching for Users to Share With

```tsx
import { searchUsers } from '@/lib/playlistSharing';
import { useState } from 'react';

export const UserSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    const result = await searchUsers(searchQuery);
    if (result.success) {
      setResults(result.data);
    }
  };

  return (
    <div>
      <input
        placeholder="Search users..."
        onChange={(e) => {
          setQuery(e.target.value);
          handleSearch(e.target.value);
        }}
      />
      {results.map(user => (
        <div key={user.id}>
          <img src={user.avatar_url} alt={user.username} />
          <span>{user.display_name || user.username}</span>
        </div>
      ))}
    </div>
  );
};
```

### Example 5: Checking if Playlist is Shared

```tsx
import { isPlaylistSharedWith } from '@/lib/playlistSharing';

export const PlaylistStatus = ({ playlistId, userId }) => {
  const [isShared, setIsShared] = useState(false);

  useEffect(() => {
    const check = async () => {
      const shared = await isPlaylistSharedWith(playlistId, userId);
      setIsShared(shared);
    };
    
    check();
  }, [playlistId, userId]);

  return (
    <div>
      {isShared ? (
        <span>Shared with this user ✓</span>
      ) : (
        <span>Not shared</span>
      )}
    </div>
  );
};
```

### Example 6: Getting Who You've Shared a Playlist With

```tsx
import { getPlaylistShares } from '@/lib/playlistSharing';

export const PlaylistShareList = ({ playlistId }) => {
  const [shares, setShares] = useState([]);

  useEffect(() => {
    const fetch = async () => {
      const result = await getPlaylistShares(playlistId);
      if (result.success) {
        setShares(result.data);
      }
    };

    fetch();
  }, [playlistId]);

  return (
    <ul>
      {shares.map(share => (
        <li key={share.shared_with_user_id}>
          {share.profiles?.display_name} (@{share.profiles?.username})
          <small>Shared on {new Date(share.shared_at).toLocaleDateString()}</small>
        </li>
      ))}
    </ul>
  );
};
```

## Database Query Examples

### Get All Playlists Shared With a User

```sql
SELECT p.*, ps.shared_at, pr.username, pr.display_name
FROM playlist_shares ps
JOIN playlists p ON ps.playlist_id = p.id
JOIN profiles pr ON ps.shared_by_user_id = pr.user_id
WHERE ps.shared_with_user_id = 'user-id-here'
ORDER BY ps.shared_at DESC;
```

### Get All Users a Playlist is Shared With

```sql
SELECT pr.id, pr.username, pr.display_name, pr.avatar_url, ps.shared_at
FROM playlist_shares ps
JOIN profiles pr ON ps.shared_with_user_id = pr.user_id
WHERE ps.playlist_id = 'playlist-id-here'
ORDER BY ps.shared_at DESC;
```

### Count Shares for a Playlist

```sql
SELECT COUNT(*) as share_count
FROM playlist_shares
WHERE playlist_id = 'playlist-id-here';
```

### Find Recently Shared Playlists

```sql
SELECT p.*, ps.shared_at, pr.username
FROM playlist_shares ps
JOIN playlists p ON ps.playlist_id = p.id
JOIN profiles pr ON ps.shared_by_user_id = pr.user_id
ORDER BY ps.shared_at DESC
LIMIT 10;
```

## Integration with Existing Features

### Playing a Shared Playlist

```tsx
const handlePlaySharedPlaylist = async (playlist) => {
  // Fetch all songs from the shared playlist
  const { data: songs } = await supabase
    .from('playlist_songs')
    .select('*')
    .eq('playlist_id', playlist.id);

  // Convert to tracks
  const tracks = songs.map(song => ({
    id: song.id,
    title: song.title,
    artist: song.artist || 'Unknown Artist',
    thumbnail: song.thumbnail_url || '/placeholder.svg',
    videoId: song.youtube_video_id
  }));

  // Play using existing playback system
  onPlayTrack(tracks[0], tracks);
};
```

### Adding to Recently Played (Shared Playlists)

```tsx
const handlePlayFromShared = async (track, playlistId) => {
  // Save to recently played (works the same for shared playlists)
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

  // Play the track
  onPlayTrack(track);
};
```

## Error Handling Examples

```tsx
import { useToast } from '@/hooks/use-toast';

export const SafePlaylistShare = ({ playlistId, userId }) => {
  const { toast } = useToast();

  const handleShare = async () => {
    try {
      const result = await sharePlaylist(playlistId, userId, currentUserId);
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to share');
      }

      toast({
        title: 'Success',
        description: 'Playlist shared successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  return <button onClick={handleShare}>Share Playlist</button>;
};
```

## Type Definitions

```tsx
// From src/lib/playlistSharing.ts

interface SharedPlaylist {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  cover_image_url: string;
  created_at: string;
  shared_by_user_id: string;
  shared_by_username?: string;
  shared_at: string;
  song_count?: number;
}

interface UserProfile {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

// Function return types
type ShareResult = {
  success: boolean;
  data?: any;
  error?: any;
};
```

## Performance Tips

1. **Debounce User Search**: Wrap the search function in a debounce to avoid excessive queries
2. **Cache Results**: Store shared playlists in state to avoid refetching
3. **Lazy Load**: Load share information only when the dialog is opened
4. **Batch Operations**: Share with multiple users in a single component instance

```tsx
// Example debounced search
import { useCallback } from 'react';

const debouncedSearch = useCallback(
  debounce(async (query) => {
    const result = await searchUsers(query);
    setResults(result.data);
  }, 300),
  []
);
```

## Common Issues and Solutions

### Issue: Share button not appearing
**Solution**: Ensure the Share2 icon is imported from lucide-react and the component is properly integrated.

### Issue: Cannot find users to share with
**Solution**: Check that user profiles are created when users sign up. Verify the profiles table has data.

### Issue: Shared playlists not loading
**Solution**: Ensure RLS policies are correctly configured on the playlist_shares table.

### Issue: Permission denied errors
**Solution**: Check auth.uid() is returning the correct user ID and RLS policies are using the right checks.
