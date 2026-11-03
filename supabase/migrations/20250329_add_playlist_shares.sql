-- Create playlist_shares table for tracking shared playlists between users
CREATE TABLE public.playlist_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  shared_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(playlist_id, shared_with_user_id),
  CHECK(shared_by_user_id != shared_with_user_id)
);

-- Enable RLS on playlist_shares
ALTER TABLE public.playlist_shares ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX idx_playlist_shares_playlist_id ON public.playlist_shares(playlist_id);
CREATE INDEX idx_playlist_shares_shared_by ON public.playlist_shares(shared_by_user_id);
CREATE INDEX idx_playlist_shares_shared_with ON public.playlist_shares(shared_with_user_id);

-- RLS policy: Users can view shares for playlists they own
CREATE POLICY "Users can view shares for their own playlists"
  ON public.playlist_shares
  FOR SELECT
  USING (
    shared_by_user_id = (SELECT auth.uid()) OR
    shared_with_user_id = (SELECT auth.uid())
  );

-- RLS policy: Users can create shares for playlists they own
CREATE POLICY "Users can share their own playlists"
  ON public.playlist_shares
  FOR INSERT
  WITH CHECK (
    shared_by_user_id = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE id = playlist_id AND user_id = (SELECT auth.uid())
    )
  );

-- RLS policy: Users can delete shares for playlists they own
CREATE POLICY "Users can unshare their own playlists"
  ON public.playlist_shares
  FOR DELETE
  USING (shared_by_user_id = (SELECT auth.uid()));
