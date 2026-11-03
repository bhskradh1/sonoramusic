# Playlist Sharing - Setup & Testing Guide

## 🚀 Quick Setup

### Step 1: Apply Database Migration

```bash
# Navigate to your project
cd c:\Users\rocks\.cursor\melodiya

# Run Supabase migration
supabase migration up

# Or if using Supabase CLI:
supabase db push
```

**Expected Output:**
```
✓ Applying migration 20250329_add_playlist_shares.sql
✓ Migration completed successfully
```

### Step 2: Verify Components Are in Place

Check these files exist:
- ✓ `src/components/music/SharePlaylistDialog.tsx`
- ✓ `src/components/music/SharedPlaylistsView.tsx`
- ✓ `src/lib/playlistSharing.ts`
- ✓ Updated `src/components/music/PlaylistsView.tsx`
- ✓ Updated `src/components/music/Sidebar.tsx`
- ✓ Updated `src/components/music/MelodiyaApp.tsx`

### Step 3: Build & Run

```bash
# Install dependencies (if needed)
bun install

# Run dev server
bun run dev

# Build for production
bun run build
```

## 🧪 Manual Testing Guide

### Test Case 1: Share a Playlist

**Preconditions:**
- User A is logged in
- User A has created a playlist
- User B exists in the system

**Steps:**
1. Navigate to "Your Playlists"
2. Hover over any playlist card
3. Click the Share button (Share2 icon)
4. Type User B's username in the search field
5. Wait for search results to appear
6. Click "Share" button next to User B
7. Verify toast notification appears

**Expected Results:**
- ✓ Share dialog opens
- ✓ User search works
- ✓ User B appears in results
- ✓ Share button becomes active
- ✓ Success toast appears
- ✓ User B appears in "Shared with" section

### Test Case 2: View Shared Playlists

**Preconditions:**
- User A and User B both exist
- User A has shared a playlist with User B
- User B is logged in

**Steps:**
1. Login as User B
2. Click "Shared with Me" in sidebar
3. View the playlist shared by User A
4. Click on the playlist card

**Expected Results:**
- ✓ Sidebar shows "Shared with Me" option
- ✓ Shared playlists are displayed
- ✓ Shows "Shared by @username"
- ✓ Can click to view details
- ✓ Correct song count displayed

### Test Case 3: Play a Shared Playlist

**Preconditions:**
- User is viewing a shared playlist
- Playlist has at least one song

**Steps:**
1. View shared playlist
2. Hover over playlist card
3. Click the play button
4. Verify music player activates

**Expected Results:**
- ✓ Play button appears on hover
- ✓ Music player starts
- ✓ Correct track plays
- ✓ All songs in playlist queue up

### Test Case 4: Unshare a Playlist

**Preconditions:**
- User A has shared a playlist with User B
- User A is logged in

**Steps:**
1. Go to "Your Playlists"
2. Click Share button on shared playlist
3. View the user in "Shared with" section
4. Click X button next to User B
5. Verify they're removed from the list

**Expected Results:**
- ✓ X button is visible
- ✓ Click removes user from shared list
- ✓ Toast notification confirms unshare
- ✓ User B no longer sees playlist in "Shared with Me"

### Test Case 5: Search Functionality

**Preconditions:**
- Multiple users exist in system
- User is in share dialog

**Steps:**
1. Open share dialog
2. Type partial username (e.g., "jo" for "john")
3. Wait for search results
4. Verify results match query
5. Clear search and try new query

**Expected Results:**
- ✓ Search results appear instantly
- ✓ Results match search query
- ✓ Shows user avatars
- ✓ Shows display names and usernames
- ✓ Excludes current user
- ✓ Excludes already-shared users
- ✓ Limits to 10 results

### Test Case 6: Prevent Duplicate Shares

**Preconditions:**
- User A has already shared playlist with User B

**Steps:**
1. Open share dialog for same playlist
2. Search for User B
3. Attempt to share again

**Expected Results:**
- ✓ User B doesn't appear in search results
- ✓ Share button is disabled if found
- ✓ Database prevents duplicate entry
- ✓ Error message appears (if attempted)

### Test Case 7: Prevent Self-Sharing

**Preconditions:**
- User is in share dialog
- User searches for their own name

**Steps:**
1. Search for own username
2. Check if own user appears in results

**Expected Results:**
- ✓ Own user doesn't appear in search results
- ✓ Cannot share with self

### Test Case 8: Mobile Responsiveness

**Preconditions:**
- Application viewed on mobile device or in mobile view

**Steps:**
1. Open sidebar on mobile
2. Click "Shared with Me"
3. Verify shared playlists display correctly
4. Test share dialog on mobile
5. Verify search and share work on mobile

**Expected Results:**
- ✓ Sidebar opens/closes properly
- ✓ Playlists grid is responsive
- ✓ Dialog is usable on mobile
- ✓ Touch interactions work
- ✓ No horizontal scrolling
- ✓ Buttons are appropriately sized

### Test Case 9: Error Handling

**Preconditions:**
- Network connectivity issues or database issues

**Steps:**
1. Attempt to share with network disabled
2. Attempt to unshare with connection problems
3. Search with invalid data

**Expected Results:**
- ✓ Error toast appears
- ✓ Error message is descriptive
- ✓ App doesn't crash
- ✓ User can retry
- ✓ Console shows error details

### Test Case 10: Recently Played Integration

**Preconditions:**
- User plays a song from shared playlist

**Steps:**
1. View shared playlist
2. Play a song from it
3. Navigate to "Recently Played"
4. Verify song appears in recently played

**Expected Results:**
- ✓ Song is saved to recently_played table
- ✓ Appears in Recently Played view
- ✓ Shows correct metadata

## 🔍 Debugging Checklist

### Components Not Showing
```bash
# Check imports
grep -r "SharePlaylistDialog" src/components/

# Check file exists
ls -la src/components/music/SharePlaylistDialog.tsx
ls -la src/components/music/SharedPlaylistsView.tsx

# Check MelodiyaApp has routing
grep -A5 "shared-playlists" src/components/music/MelodiyaApp.tsx
```

### Share Button Not Working
```bash
# Verify SharePlaylistDialog import
grep "import.*SharePlaylistDialog" src/components/music/PlaylistsView.tsx

# Check user ID is being passed
# Set breakpoint in browser devtools
```

### Shared Playlists Not Loading
```sql
-- Check database migration was applied
SELECT * FROM information_schema.tables 
WHERE table_name = 'playlist_shares';

-- Check RLS is enabled
SELECT * FROM pg_tables 
WHERE tablename = 'playlist_shares';

-- Check data exists
SELECT * FROM playlist_shares LIMIT 10;
```

### Permission Denied Errors
```sql
-- Verify RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'playlist_shares';

-- Test with specific user
SELECT * FROM playlist_shares 
WHERE shared_with_user_id = '[test-user-id]';
```

## 📊 Test Data Setup

### Create Test Users

```sql
-- Create test profiles
INSERT INTO profiles (user_id, username, display_name) 
VALUES 
  ('[user-1-id]', 'testuser1', 'Test User One'),
  ('[user-2-id]', 'testuser2', 'Test User Two'),
  ('[user-3-id]', 'testuser3', 'Test User Three');
```

### Create Test Playlists

```sql
-- Create test playlists
INSERT INTO playlists (user_id, name, description, is_public)
VALUES 
  ('[user-1-id]', 'Test Playlist 1', 'A test playlist', false),
  ('[user-1-id]', 'Test Playlist 2', 'Another test', false);
```

### Create Test Shares

```sql
-- Create test shares
INSERT INTO playlist_shares (playlist_id, shared_by_user_id, shared_with_user_id)
VALUES 
  ('[playlist-1-id]', '[user-1-id]', '[user-2-id]'),
  ('[playlist-1-id]', '[user-1-id]', '[user-3-id]');
```

## 📈 Performance Testing

### Load Test: User Search

```typescript
// Test search with many users
async function testSearch() {
  const startTime = performance.now();
  
  for (let i = 0; i < 10; i++) {
    await searchUsers('test');
  }
  
  const endTime = performance.now();
  console.log(`Search took ${endTime - startTime}ms`);
  // Expected: < 500ms for 10 searches
}
```

### Load Test: Get Shared Playlists

```typescript
// Test with many shared playlists
async function testGetShared() {
  const startTime = performance.now();
  
  const result = await getSharedPlaylistsWithMe('user-id');
  
  const endTime = performance.now();
  console.log(`Fetching shared playlists took ${endTime - startTime}ms`);
  console.log(`Retrieved ${result.data?.length} playlists`);
  // Expected: < 1000ms for reasonable number of shares
}
```

## 🔐 Security Testing

### Test RLS Policies

```sql
-- Test 1: User can see their own shares
SET request.jwt.claims = '{"sub":"[user-id]"}';
SELECT * FROM playlist_shares 
WHERE shared_by_user_id = '[user-id]'::uuid;
-- Expected: Returns shares user created

-- Test 2: User can see shares sent to them
SELECT * FROM playlist_shares 
WHERE shared_with_user_id = '[user-id]'::uuid;
-- Expected: Returns shares sent to user

-- Test 3: User cannot see others' shares
SELECT * FROM playlist_shares 
WHERE shared_by_user_id = '[other-user-id]'::uuid;
-- Expected: No results (denied by RLS)
```

## 📋 Acceptance Criteria

All of the following must pass before production:

- [ ] Share button appears on hover for each playlist
- [ ] Share dialog opens and closes properly
- [ ] User search works with partial matches
- [ ] User can share playlist with another user
- [ ] Shared playlists appear in "Shared with Me"
- [ ] Can unshare a playlist
- [ ] Cannot duplicate share same user
- [ ] Cannot share with self
- [ ] Can play shared playlists
- [ ] Error handling shows appropriate messages
- [ ] Mobile responsive
- [ ] Toast notifications appear
- [ ] No TypeScript errors
- [ ] Database migration applied successfully
- [ ] RLS policies working correctly

## 🐛 Common Issues & Solutions

### Issue: "Cannot find module 'react'"
**Solution**: This is a linting issue in the workspace. The app will still run correctly.

### Issue: Share button not appearing
**Solution**: 
1. Check PlaylistsView.tsx imports SharePlaylistDialog
2. Check SharePlaylistDialog.tsx is in correct location
3. Clear node_modules and rebuild: `bun install && bun run dev`

### Issue: "Toast is not a function"
**Solution**: Verify `useToast` hook is imported from `@/hooks/use-toast`

### Issue: Shared playlists not loading
**Solution**:
1. Check database migration was applied
2. Verify user has shares in database: `SELECT * FROM playlist_shares`
3. Check RLS policies are correct
4. Check auth.uid() returns correct value

### Issue: Search returns no results
**Solution**:
1. Verify users have profiles created
2. Check profiles table has display_name or username populated
3. Verify search query is at least 2 characters

### Issue: "Permission denied" errors
**Solution**:
1. Check RLS policies are created
2. Verify auth.uid() function exists
3. Check user is properly authenticated

## 📚 References

For more information, see:
- `PLAYLIST_SHARING_GUIDE.md` - Technical documentation
- `PLAYLIST_SHARING_EXAMPLES.md` - Code examples
- `PLAYLIST_SHARING_ARCHITECTURE.md` - System architecture
