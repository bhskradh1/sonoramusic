# Playlist Sharing Features - Implementation Guide

## Overview
This document describes the new playlist sharing features added to Melodiya, allowing users to share their playlists with other users and access playlists shared with them.

## Features Added

### 1. **Database Schema** 
- **New Table**: `playlist_shares`
  - Tracks which user shared which playlist with which other user
  - Includes timestamps for when playlists were shared
  - Enforces unique constraints to prevent duplicate shares
  - Includes RLS policies for security

```sql
CREATE TABLE public.playlist_shares (
  id UUID PRIMARY KEY,
  playlist_id UUID REFERENCES playlists(id),
  shared_by_user_id UUID REFERENCES auth.users(id),
  shared_with_user_id UUID REFERENCES auth.users(id),
  shared_at TIMESTAMP,
  UNIQUE(playlist_id, shared_with_user_id)
)
```

### 2. **New Components**

#### `SharePlaylistDialog` (`src/components/music/SharePlaylistDialog.tsx`)
A dialog component that allows users to:
- Search for other users by username or display name
- Share playlists with specific users
- View all users they've shared the playlist with
- Remove shares (unshare) with individual users

**Props:**
- `playlistId: string` - The ID of the playlist to share
- `playlistName: string` - The name of the playlist for display
- `currentUserId: string` - The ID of the current user
- `triggerClassName?: string` - Optional CSS classes for the trigger button

**Features:**
- Real-time user search with debouncing
- Prevents sharing with self
- Shows user avatars and display names
- One-click unshare functionality
- Toast notifications for user feedback

#### `SharedPlaylistsView` (`src/components/music/SharedPlaylistsView.tsx`)
A new view component that displays all playlists shared with the current user.

**Features:**
- Grid layout showing all shared playlists
- Shows who shared the playlist
- Full playback integration
- Playlist preview and play functionality
- Similar UX to the main PlaylistsView for consistency

### 3. **Utility Functions** (`src/lib/playlistSharing.ts`)

#### `sharePlaylist(playlistId, userId, currentUserId)`
Creates a share relationship between a playlist and a user.

#### `unsharePlaylist(playlistId, userId)`
Removes a share relationship, giving the user no longer access to the playlist.

#### `getPlaylistShares(playlistId)`
Retrieves all users a playlist has been shared with.

#### `getSharedPlaylistsWithMe(currentUserId)`
Fetches all playlists that have been shared with the current user.

#### `searchUsers(query, excludeUserIds)`
Searches for users by username or display name, excluding specified users.

#### `isPlaylistSharedWith(playlistId, userId)`
Checks if a playlist is shared with a specific user.

### 4. **UI Updates**

#### PlaylistsView Updates
- Added Share button (Share2 icon) to each playlist card
- Appears on hover alongside the delete button
- Integrated with SharePlaylistDialog for easy sharing

#### Sidebar Updates
- Added "Shared with Me" navigation item
- Uses Share2 icon for consistency
- Routes to SharedPlaylistsView when clicked
- Positioned between "Your Playlists" and "Recently Played"

#### MelodiyaApp Updates
- Added SharedPlaylistsView import and routing
- New route: `shared-playlists` → renders SharedPlaylistsView
- Fully integrated with existing playback system

## Usage Flow

### Sharing a Playlist

1. Navigate to "Your Playlists" in the sidebar
2. Hover over a playlist card
3. Click the Share button (Share2 icon)
4. Search for a user by username or display name
5. Click "Share" next to the desired user
6. User will immediately have access to the shared playlist

### Accessing Shared Playlists

1. Click "Shared with Me" in the sidebar
2. View all playlists shared with you
3. See who shared each playlist
4. Click to view details or play the playlist
5. Full playback capabilities available

### Removing a Share

1. Click Share button on the shared playlist
2. Click the X button next to the user you want to unshare with
3. User will lose access immediately

## Security Considerations

### Row Level Security (RLS)
The `playlist_shares` table implements RLS policies:

1. **View Policy**: Users can only see shares for playlists they own or that are shared with them
2. **Insert Policy**: Users can only create shares for their own playlists
3. **Delete Policy**: Users can only remove shares for playlists they own

### Access Control
- Shared playlists in SharedPlaylistsView are read-only (users cannot edit shared playlists)
- Only the playlist owner can see who they've shared with
- Users cannot share with themselves (enforced by frontend and backend)

## Database Migration

To apply these changes to your database, run the migration:

```bash
supabase migration up
```

The migration file: `supabase/migrations/20250329_add_playlist_shares.sql`

## API Integration

### Supabase Tables Used
- `profiles` - For user search and display information
- `playlists` - Reference existing playlists
- `playlist_shares` - New table for tracking shares
- `playlist_songs` - For displaying song counts

### Real-time Features
The implementation is ready for real-time updates via Supabase subscriptions (can be added in future updates).

## Error Handling

All functions include error handling with:
- Try-catch blocks
- User-friendly toast notifications
- Console logging for debugging
- Graceful fallbacks

## Future Enhancements

Potential features to add:
1. **Playlist Permissions**: Add edit/view-only modes for shared playlists
2. **Share Notifications**: Notify users when playlists are shared with them
3. **Share Comments**: Allow users to add notes when sharing
4. **Collaborative Playlists**: Multiple users editing the same playlist
5. **Share History**: Track share/unshare history
6. **Batch Sharing**: Share with multiple users at once
7. **Public Playlists**: Make playlists discoverable without direct shares
8. **Share Expiration**: Set expiration dates on shares

## Testing

### Manual Testing Checklist
- [ ] Share a playlist with another user
- [ ] View shared playlists as recipient
- [ ] Unshare a playlist
- [ ] Search for users works correctly
- [ ] Prevent sharing with self
- [ ] Prevent duplicate shares
- [ ] Play shared playlists
- [ ] View playlist details of shared playlists
- [ ] Toast notifications appear correctly
- [ ] Mobile responsiveness

### Edge Cases to Test
- Sharing with non-existent users
- Deleting playlists that are shared
- Deleting user accounts with shared playlists
- Concurrent share/unshare operations

## File Structure

```
src/
├── components/
│   └── music/
│       ├── SharePlaylistDialog.tsx (NEW)
│       ├── SharedPlaylistsView.tsx (NEW)
│       ├── PlaylistsView.tsx (UPDATED)
│       ├── Sidebar.tsx (UPDATED)
│       └── MelodiyaApp.tsx (UPDATED)
├── lib/
│   └── playlistSharing.ts (NEW)
supabase/
└── migrations/
    └── 20250329_add_playlist_shares.sql (NEW)
```

## Performance Considerations

- User search is limited to 10 results to reduce payload
- Indexes created on `playlist_shares` for faster lookups
- Queries are optimized to fetch related data in single requests
- No N+1 query problems in the implementation

## Accessibility

- Share button includes title attribute for tooltips
- Icons are semantic (Share2 for sharing)
- Dialog is keyboard accessible
- Proper focus management in search
- Screen reader friendly component labels
