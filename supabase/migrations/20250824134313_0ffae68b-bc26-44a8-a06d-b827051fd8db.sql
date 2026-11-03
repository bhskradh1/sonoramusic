-- Create liked_songs table for user favorites
CREATE TABLE public.liked_songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  thumbnail_url TEXT,
  liked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, youtube_video_id)
);

-- Enable RLS on liked_songs
ALTER TABLE public.liked_songs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for liked_songs
CREATE POLICY "Users can manage their own liked songs" 
ON public.liked_songs 
FOR ALL 
USING (auth.uid() = user_id);

-- Add indexes for better performance
CREATE INDEX idx_liked_songs_user_id ON public.liked_songs(user_id);
CREATE INDEX idx_recently_played_user_id ON public.recently_played(user_id);
CREATE INDEX idx_playlists_user_id ON public.playlists(user_id);
CREATE INDEX idx_playlist_songs_playlist_id ON public.playlist_songs(playlist_id);