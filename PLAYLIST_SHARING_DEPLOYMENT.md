# Playlist Sharing - Deployment Checklist

## Pre-Deployment Verification

### Code Quality
- [ ] All TypeScript files compile without errors
- [ ] No console errors in development
- [ ] ESLint passes (ignoring workspace issues)
- [ ] No unused imports or variables
- [ ] Code follows existing project conventions

### Files Created/Modified
- [ ] `supabase/migrations/20250329_add_playlist_shares.sql` ✓
- [ ] `src/components/music/SharePlaylistDialog.tsx` ✓
- [ ] `src/components/music/SharedPlaylistsView.tsx` ✓
- [ ] `src/lib/playlistSharing.ts` ✓
- [ ] `src/components/music/PlaylistsView.tsx` ✓
- [ ] `src/components/music/Sidebar.tsx` ✓
- [ ] `src/components/music/MelodiyaApp.tsx` ✓

### Testing Completed
- [ ] All manual tests passed (see PLAYLIST_SHARING_TESTING.md)
- [ ] Mobile responsive testing completed
- [ ] Error handling tested
- [ ] Security verified (RLS policies working)
- [ ] Performance acceptable

### Documentation
- [ ] PLAYLIST_SHARING_GUIDE.md ✓
- [ ] PLAYLIST_SHARING_EXAMPLES.md ✓
- [ ] PLAYLIST_SHARING_ARCHITECTURE.md ✓
- [ ] PLAYLIST_SHARING_TESTING.md ✓
- [ ] PLAYLIST_SHARING_SUMMARY.md ✓

## Database Deployment

### Step 1: Pre-Deployment Backup

```bash
# Create backup of production database
supabase db pull --schema-only

# Backup current database structure
pg_dump -U postgres melodiya_db > melodiya_backup.sql
```

### Step 2: Apply Migration

```bash
# Verify migration file
ls -la supabase/migrations/20250329_add_playlist_shares.sql

# Apply migration to development
supabase db push

# Apply migration to staging (if applicable)
supabase db push --to staging

# Apply migration to production
supabase db push --to production
```

### Step 3: Verify Migration

```sql
-- Verify table was created
SELECT * FROM information_schema.tables 
WHERE table_name = 'playlist_shares';

-- Verify RLS is enabled
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'playlist_shares';

-- Verify policies exist
SELECT policyname, permissive, cmd 
FROM pg_policies 
WHERE tablename = 'playlist_shares';

-- Verify indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'playlist_shares';
```

### Expected Results:
```
✓ Table exists
✓ RLS enabled
✓ 3 policies created (SELECT, INSERT, DELETE)
✓ 3 indexes created
✓ No errors
```

## Application Deployment

### Step 1: Build Application

```bash
# Clean build
rm -rf dist/
bun install
bun run build

# Verify build succeeds
# Expected output: "vite v5.x.x ... built successfully"
```

### Step 2: Test Build

```bash
# Test production build locally
bun run preview

# Visit http://localhost:4173
# Test sharing features work
```

### Step 3: Deploy to Hosting

```bash
# Deploy (using your hosting provider)
# Example for common providers:

# Vercel
vercel deploy --prod

# Netlify
netlify deploy --prod

# Or your own server
cp -r dist/* /var/www/melodiya/
```

### Step 4: Post-Deployment Verification

```bash
# Test on production
1. Navigate to https://your-domain.com
2. Complete manual testing checklist (see below)
3. Check browser console for errors
4. Verify all features work
```

## Post-Deployment Testing

### User Interface Tests
- [ ] Share button visible on playlist cards
- [ ] Share dialog opens and closes
- [ ] "Shared with Me" appears in sidebar
- [ ] SharedPlaylistsView renders correctly

### Functionality Tests
- [ ] Can search for users
- [ ] Can share playlists
- [ ] Can view shared playlists
- [ ] Can unshare playlists
- [ ] Can play shared playlists
- [ ] Cannot share with self
- [ ] Cannot duplicate shares
- [ ] Recently played tracking works

### Error Handling
- [ ] Network errors show toast
- [ ] Invalid searches handled gracefully
- [ ] Database errors handled
- [ ] Auth errors handled

### Performance
- [ ] Page loads quickly
- [ ] Search is responsive
- [ ] Sharing is instant
- [ ] No memory leaks in console
- [ ] No slow network requests

### Cross-Browser Testing
- [ ] Chrome/Edge ✓
- [ ] Firefox ✓
- [ ] Safari ✓
- [ ] Mobile browsers ✓

## Rollback Plan

If critical issues occur:

### Step 1: Revert Application

```bash
# Revert to previous version
git revert <commit-hash>

# Or deploy previous build
vercel rollback
```

### Step 2: Revert Database (if needed)

```bash
# Only if migration caused critical issues
# Use backup from pre-deployment

# Restore backup
psql -U postgres melodiya_db < melodiya_backup.sql

# Or reset migration
supabase migration down --version 20250329_add_playlist_shares
```

### Step 3: Notify Users

- Update status page
- Send notification to affected users
- Provide timeline for fix

## Monitoring Post-Deployment

### Error Tracking
- [ ] Set up error logging (Sentry, LogRocket, etc.)
- [ ] Monitor for playlist_shares related errors
- [ ] Alert on RLS policy violations
- [ ] Track API response times

### User Analytics
- [ ] Track share feature usage
- [ ] Monitor shared playlist views
- [ ] Identify popular shared content
- [ ] Collect user feedback

### Performance Metrics
- [ ] Monitor database query times
- [ ] Track playlist load times
- [ ] Check share operation latency
- [ ] Monitor search performance

### Example Monitoring Queries

```sql
-- Track feature usage
SELECT DATE(shared_at), COUNT(*) as shares
FROM playlist_shares
GROUP BY DATE(shared_at)
ORDER BY DATE DESC;

-- Find popular shared playlists
SELECT p.name, COUNT(*) as share_count
FROM playlist_shares ps
JOIN playlists p ON ps.playlist_id = p.id
GROUP BY p.id, p.name
ORDER BY share_count DESC
LIMIT 10;

-- Check for issues
SELECT * FROM playlist_shares
WHERE shared_at > NOW() - INTERVAL '24 hours'
ORDER BY shared_at DESC;
```

## Security Review Checklist

Before production deployment:

- [ ] RLS policies are correctly implemented
- [ ] Users cannot access others' private data
- [ ] Auth.uid() checks are in place
- [ ] SQL injection is prevented (using parameterized queries)
- [ ] Rate limiting considered for search
- [ ] No sensitive data in logs
- [ ] Secrets are environment variables
- [ ] CORS properly configured
- [ ] HTTPS enforced
- [ ] Security headers configured

## Performance Optimization Checklist

- [ ] Database indexes created
- [ ] Queries optimized (no N+1)
- [ ] Search results limited to 10
- [ ] Caching considered for shared playlists
- [ ] Debouncing implemented for search
- [ ] Code splitting considered
- [ ] Large payloads minimized
- [ ] Database connections pooled

## Documentation Maintenance

Post-deployment, ensure:

- [ ] Update user-facing documentation
- [ ] Add sharing feature to help center
- [ ] Create user guide for sharing
- [ ] Update API documentation
- [ ] Update changelog with new features
- [ ] Document any configuration changes
- [ ] Update system architecture docs

## Sign-Off

### Development Lead
- [ ] Code reviewed and approved
- [ ] Tests passed
- [ ] Documentation complete
- **Signed**: _____________ **Date**: _______

### QA Lead
- [ ] All manual tests completed
- [ ] Cross-browser testing done
- [ ] Security review passed
- [ ] Performance acceptable
- **Signed**: _____________ **Date**: _______

### Deployment Manager
- [ ] Pre-deployment checklist complete
- [ ] Rollback plan in place
- [ ] Monitoring configured
- [ ] Ready for production
- **Signed**: _____________ **Date**: _______

## Deployment Metrics

Track these after deployment:

```
Feature Usage:
├── Shares created: [metric]
├── Playlists shared: [metric]
├── Active users sharing: [metric]
└── Avg playlists shared per user: [metric]

Performance:
├── Share operation latency: [metric]
├── Search response time: [metric]
├── Page load time: [metric]
└── Database query time: [metric]

Errors:
├── Error rate: [metric]
├── RLS policy violations: [metric]
├── Network errors: [metric]
└── User-reported issues: [metric]
```

## Post-Launch Support

### Week 1
- [ ] Monitor error logs daily
- [ ] Check performance metrics
- [ ] Respond to user feedback
- [ ] Fix critical bugs immediately

### Month 1
- [ ] Gather user feedback
- [ ] Analyze usage patterns
- [ ] Optimize based on real usage
- [ ] Document lessons learned
- [ ] Plan future enhancements

### Ongoing
- [ ] Regular security audits
- [ ] Performance monitoring
- [ ] User feedback collection
- [ ] Bug fixes and patches
- [ ] Feature enhancements

## Contact & Support

For issues during/after deployment:

- **Database Issues**: Check logs, verify RLS policies
- **UI Issues**: Check browser console, verify components
- **Performance Issues**: Check query times, verify indexes
- **Security Issues**: Immediately check RLS policies, audit logs

**Emergency Rollback Contact**: [Your name]
**Deployment Manager**: [Your name]
**Database Admin**: [Your name]

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Status**: ☐ Pending ☐ In Progress ☐ Completed ☐ Rolled Back
