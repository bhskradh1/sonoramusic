# Playlist Sharing - Architecture & Component Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MELODIYA APP (MelodiyaApp.tsx)             │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
            ┌────────┐  ┌──────────┐  ┌──────────────┐
            │SIDEBAR │  │MAINVIEW  │  │MUSIC PLAYER  │
            │        │  │ ROUTER   │  │              │
            └────────┘  └──────────┘  └──────────────┘
                │            │
                │        ┌───┴──────────────┬──────────────┐
                │        │                  │              │
                ▼        ▼                  ▼              ▼
            ┌────────┐ ┌───────────┐ ┌──────────────┐ ┌──────────────┐
            │Shared  │ │ Playlists │ │SharedPlaylsts│ │PlaylistDetail│
            │w/Me    │ │View       │ │View (NEW)    │ │View          │
            │(NAV)   │ │           │ │              │ │              │
            └────────┘ └─────┬─────┘ └──────────────┘ └──────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
              ┌──────────────┐  ┌──────────────┐
              │SharePlaylist │  │Play/View     │
              │Dialog (NEW)  │  │Functionality │
              │              │  │              │
              └──────┬───────┘  └──────────────┘
                     │
                     ├─ Search Users
                     ├─ Share Playlist
                     ├─ View Shares
                     └─ Unshare
```

## Data Flow Diagram

### Sharing a Playlist

```
User Action
    │
    ▼
[Share Button Clicked]
    │
    ▼
SharePlaylistDialog Opens
    │
    ├─ Display current shares (getPlaylistShares)
    │
    ▼
[User searches for someone]
    │
    ├─ searchUsers() ──► profiles table
    │
    ▼
[User clicks Share]
    │
    ├─ sharePlaylist() ──► playlist_shares table (INSERT)
    │
    ▼
[Update Dialog UI]
    │
    ├─ Fetch fresh shares (getPlaylistShares)
    │
    ▼
[Toast notification: "Shared successfully"]
```

### Viewing Shared Playlists

```
User Navigation
    │
    ▼
[Click "Shared with Me" in Sidebar]
    │
    ▼
ActiveView = 'shared-playlists'
    │
    ▼
MelodiyaApp renders SharedPlaylistsView
    │
    ▼
getSharedPlaylistsWithMe() fetches data
    │
    ├─ Query: playlist_shares table
    ├─ JOIN: playlists table
    ├─ JOIN: profiles table (for shared_by info)
    │
    ▼
Display playlist grid with:
    ├─ Playlist cover/thumbnail
    ├─ Playlist name
    ├─ Song count
    ├─ Shared by username
    └─ Play button
```

## Component Dependency Tree

```
MelodiyaApp
├── Sidebar
│   ├── Navigation Items
│   │   ├── Home
│   │   ├── Search
│   │   ├── Library
│   │   │   ├── Liked Songs
│   │   │   ├── Your Playlists
│   │   │   ├── Shared with Me ◄─── NEW ROUTE
│   │   │   └── Recently Played
│   │   ├── Settings
│   │   └── Admin (if user is admin)
│   └── Sign Out
│
├── Main View Router
│   ├── HomeView
│   ├── SearchView
│   ├── LikedSongsView
│   ├── PlaylistsView
│   │   └── SharePlaylistDialog ◄─── NEW COMPONENT
│   │       ├── User Search
│   │       ├── Share Management
│   │       └── Unshare Controls
│   ├── SharedPlaylistsView ◄─── NEW COMPONENT
│   │   ├── Shared Playlist Grid
│   │   ├── Play Controls
│   │   └── Playlist Details
│   ├── PlaylistDetailView
│   ├── RecentlyPlayedView
│   ├── TrendingView
│   ├── SettingsView
│   └── AdminView
│
└── MusicPlayer
```

## Database Entity Relationship Diagram

```
┌────────────────┐          ┌──────────────┐
│   profiles     │          │  auth.users  │
├────────────────┤          ├──────────────┤
│ id (PK)        │◄─────────│ id (PK)      │
│ user_id (FK)   │          │              │
│ username       │          └──────────────┘
│ display_name   │
│ avatar_url     │
│ created_at     │
└────┬───────────┘
     │
     │ 1..N
     │
     │
┌────▼──────────────────┐     ┌──────────────┐
│  playlist_shares (NEW) │     │  playlists   │
├──────────────────────┤     ├──────────────┤
│ id (PK)              │     │ id (PK)      │
│ playlist_id (FK)─────┼─────│ id           │
│ shared_by_user_id    │     │ user_id (FK)─┼─► profiles
│ shared_with_user_id  │     │ name         │
│ shared_at            │     │ description  │
│ UNIQUE constraint    │     │ is_public    │
└──────────────────────┘     │ cover_image  │
                             │ created_at   │
                             └──────────────┘
                                    │
                                    │ 1..N
                                    │
                             ┌──────▼────────────┐
                             │  playlist_songs   │
                             ├───────────────────┤
                             │ id (PK)           │
                             │ playlist_id (FK)  │
                             │ youtube_video_id  │
                             │ title             │
                             │ artist            │
                             │ thumbnail_url     │
                             │ added_at          │
                             └───────────────────┘
```

## Authentication & Authorization Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     AUTH.UID() (From JWT)                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                    ┌──────────────┐
                    │RLS Policies  │
                    └──────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │SELECT      │  │INSERT      │  │DELETE      │
    │(View Shares│  │(Create     │  │(Unshare)   │
    │)           │  │Share)      │  │            │
    └────────────┘  └────────────┘  └────────────┘
         │                │                │
         │ User can see   │ User can share  │ User can
         │ if owns or     │ if owns playlist│ delete if
         │ received       │                 │ owns
         │                │                 │
         ▼                ▼                 ▼
    ┌─────────────────────────────────────────────┐
    │     SQL Security Checks (in RLS policies)   │
    │  ─────────────────────────────────────────  │
    │ SELECT: (shared_by_user_id = auth.uid()    │
    │          OR shared_with_user_id = auth.uid)│
    │                                             │
    │ INSERT: (shared_by_user_id = auth.uid()    │
    │          AND playlist owner = auth.uid())   │
    │                                             │
    │ DELETE: (shared_by_user_id = auth.uid())   │
    └─────────────────────────────────────────────┘
```

## Function Call Hierarchy

```
SharePlaylistDialog Component
├── useEffect (dialog opens)
│   └── fetchShares()
│       └── getPlaylistShares(playlistId)
│           └── Supabase Query: SELECT * FROM playlist_shares
│
├── handleSearch(query)
│   └── searchUsers(query, excludeIds)
│       └── Supabase Query: SELECT * FROM profiles
│
├── handleShare(userId)
│   └── sharePlaylist(playlistId, userId, currentUserId)
│       └── Supabase INSERT: INSERT INTO playlist_shares
│
└── handleUnshare(userId)
    └── unsharePlaylist(playlistId, userId)
        └── Supabase DELETE: DELETE FROM playlist_shares


SharedPlaylistsView Component
├── useEffect (component mounts)
│   └── fetchSharedPlaylists()
│       └── getSharedPlaylistsWithMe(userId)
│           └── Supabase Query with JOINs:
│               - SELECT * FROM playlist_shares
│               - JOIN playlists
│               - JOIN profiles
│
└── handlePlayTrack(track, playlist)
    └── Play functionality (existing system)
```

## State Management Flow

### SharePlaylistDialog

```
State Variables:
├── isOpen: boolean                    (Dialog open/close)
├── searchQuery: string                (Current search text)
├── searchResults: UserProfile[]       (Search results)
├── sharedWith: ShareData[]            (Current shares)
├── sharedUserIds: Set<string>         (Quick lookup)
├── isSearching: boolean               (Loading state)
└── isLoading: boolean                 (Initial load state)

State Updates:
├── User searches → searchQuery changes
├── Search response → searchResults updated
├── Share clicked → sharedUserIds updated + fetchShares()
├── Unshare clicked → sharedUserIds updated + sharedWith filtered
└── Dialog opens → fetchShares() called
```

### SharedPlaylistsView

```
State Variables:
├── playlists: SharedPlaylist[]       (All shared playlists)
├── loading: boolean                   (Loading state)

State Updates:
├── Component mounts → fetchSharedPlaylists()
├── Data returns → playlists updated
└── Loading complete → loading = false
```

## Error Handling Strategy

```
Try-Catch Blocks
│
├─ API Calls
│  └─ sharePlaylist, unsharePlaylist, getPlaylistShares, etc.
│
├─ User Feedback
│  ├─ Success: Toast notification
│  ├─ Error: Toast with error message
│  └─ Loading: Spinner/disabled state
│
└─ Console Logging
   └─ console.error() for debugging
```

## Performance Optimization

```
Optimization Strategy:
├── Indexing
│   ├─ idx_playlist_shares_playlist_id
│   ├─ idx_playlist_shares_shared_by
│   └─ idx_playlist_shares_shared_with
│
├── Query Optimization
│   ├─ Single JOINs instead of multiple queries
│   ├─ Limit search results to 10
│   └─ Preload shares on dialog open
│
└── Caching Opportunities
    ├─ Cache shared users in state
    ├─ Cache search results temporarily
    └─ Debounce user search
```

## Data Flow Summary

```
SHARING PATH:
User Clicks Share Button
    ↓
Dialog Opens + Fetches Current Shares
    ↓
User Types Username
    ↓
Search API Query (Debounced)
    ↓
Display User Results
    ↓
User Clicks "Share"
    ↓
Insert Into playlist_shares
    ↓
Refresh Dialog + Toast Notification
    ↓
User Can See New Share Recipient


VIEWING SHARED PATH:
User Clicks "Shared with Me"
    ↓
Route: activeView = 'shared-playlists'
    ↓
SharedPlaylistsView Renders
    ↓
getSharedPlaylistsWithMe() Fetches
    ↓
JOIN playlists + profiles
    ↓
Display Grid
    ↓
User Can Click to Play/View Details
```

---

This architecture ensures:
- ✅ Security through RLS and auth checks
- ✅ Performance through indexing and optimized queries
- ✅ Scalability with proper data structure
- ✅ Maintainability with clear component hierarchy
- ✅ User experience with proper feedback and loading states
