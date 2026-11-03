
-- Playlist sharing table
CREATE TABLE public.playlist_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  shared_by_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  shared_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, shared_with_user_id)
);

CREATE INDEX idx_playlist_shares_with ON public.playlist_shares(shared_with_user_id);
CREATE INDEX idx_playlist_shares_by ON public.playlist_shares(shared_by_user_id);
CREATE INDEX idx_playlist_shares_playlist ON public.playlist_shares(playlist_id);

ALTER TABLE public.playlist_shares ENABLE ROW LEVEL SECURITY;

-- Owner of the playlist (= sharer) can manage shares for their playlists
CREATE POLICY "Owners can create shares for their playlists"
  ON public.playlist_shares FOR INSERT
  WITH CHECK (
    auth.uid() = shared_by_user_id
    AND EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Owners can delete shares for their playlists"
  ON public.playlist_shares FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.user_id = auth.uid())
  );

-- Both the sharer and the recipient can view a share row
CREATE POLICY "Sharer and recipient can view shares"
  ON public.playlist_shares FOR SELECT
  USING (auth.uid() = shared_by_user_id OR auth.uid() = shared_with_user_id);

-- Allow recipients to view playlists shared with them (extends existing playlists SELECT policy)
CREATE POLICY "Recipients can view playlists shared with them"
  ON public.playlists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.playlist_shares ps
      WHERE ps.playlist_id = playlists.id
        AND ps.shared_with_user_id = auth.uid()
    )
  );

-- Allow recipients to view songs of playlists shared with them
CREATE POLICY "Recipients can view songs of shared playlists"
  ON public.playlist_songs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.playlist_shares ps
      WHERE ps.playlist_id = playlist_songs.playlist_id
        AND ps.shared_with_user_id = auth.uid()
    )
  );
