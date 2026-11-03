-- Friendship system to control who can share playlists with whom
CREATE TABLE public.friendships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL,
  addressee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT friendships_status_check CHECK (status IN ('pending','accepted','rejected')),
  CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id),
  CONSTRAINT friendships_unique_pair UNIQUE (requester_id, addressee_id)
);

CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON public.friendships(addressee_id);
CREATE INDEX idx_friendships_status ON public.friendships(status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Either party can view their friendship rows
CREATE POLICY "Users can view their friendships"
ON public.friendships FOR SELECT
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Only the requester can create a friend request
CREATE POLICY "Users can send friend requests"
ON public.friendships FOR INSERT
WITH CHECK (auth.uid() = requester_id);

-- Only the addressee can update status (accept/reject)
CREATE POLICY "Addressee can respond to requests"
ON public.friendships FOR UPDATE
USING (auth.uid() = addressee_id)
WITH CHECK (auth.uid() = addressee_id);

-- Either party can delete (unfriend / cancel)
CREATE POLICY "Either party can remove friendship"
ON public.friendships FOR DELETE
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE TRIGGER update_friendships_updated_at
BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function: are these two users friends (accepted)?
CREATE OR REPLACE FUNCTION public.are_friends(_user_a UUID, _user_b UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND (
        (requester_id = _user_a AND addressee_id = _user_b)
        OR (requester_id = _user_b AND addressee_id = _user_a)
      )
  );
$$;

-- Tighten playlist_shares: only allow sharing with accepted friends
DROP POLICY IF EXISTS "Owners can create shares for their playlists" ON public.playlist_shares;

CREATE POLICY "Owners can share only with friends"
ON public.playlist_shares FOR INSERT
WITH CHECK (
  auth.uid() = shared_by_user_id
  AND EXISTS (
    SELECT 1 FROM public.playlists p
    WHERE p.id = playlist_shares.playlist_id AND p.user_id = auth.uid()
  )
  AND public.are_friends(auth.uid(), shared_with_user_id)
);