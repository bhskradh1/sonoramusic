-- Add user suspension functionality
-- Add is_suspended column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN is_suspended BOOLEAN DEFAULT false;

-- Add last_login column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN last_login TIMESTAMP WITH TIME ZONE;

-- Add index for better performance on suspension queries
CREATE INDEX idx_profiles_suspended ON public.profiles(is_suspended);

-- Add index for last login queries
CREATE INDEX idx_profiles_last_login ON public.profiles(last_login);

-- Update RLS policies to handle suspended users
-- Users cannot access the platform if suspended
CREATE POLICY "Users cannot access if suspended" 
ON public.profiles 
FOR SELECT 
USING (NOT is_suspended OR auth.uid() = user_id);

-- Only admins can update suspension status
CREATE POLICY "Admins can update suspension status" 
ON public.profiles 
FOR UPDATE 
USING (
  public.has_role(auth.uid(), 'admin') OR 
  (auth.uid() = user_id AND NOT is_suspended)
);

-- Function to update last login
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.last_login = now();
  RETURN NEW;
END;
$$;

-- Trigger to update last login on profile updates
CREATE TRIGGER update_profiles_last_login
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_login();

-- Function to check if user is suspended
CREATE OR REPLACE FUNCTION public.is_user_suspended(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT is_suspended
  FROM public.profiles
  WHERE user_id = _user_id
$$;

-- Update existing RLS policies to respect suspension status
-- Update playlists policy to exclude suspended users
DROP POLICY IF EXISTS "Users can view public playlists and their own" ON public.playlists;
CREATE POLICY "Users can view public playlists and their own" 
ON public.playlists 
FOR SELECT 
USING (
  (is_public = true OR auth.uid() = user_id) AND 
  NOT public.is_user_suspended(auth.uid())
);

-- Update playlist management policy
DROP POLICY IF EXISTS "Users can manage their own playlists" ON public.playlists;
CREATE POLICY "Users can manage their own playlists" 
ON public.playlists 
FOR ALL 
USING (
  auth.uid() = user_id AND 
  NOT public.is_user_suspended(auth.uid())
);

-- Update recently played policy
DROP POLICY IF EXISTS "Users can manage their own recently played" ON public.recently_played;
CREATE POLICY "Users can manage their own recently played" 
ON public.recently_played 
FOR ALL 
USING (
  auth.uid() = user_id AND 
  NOT public.is_user_suspended(auth.uid())
);

-- Update user preferences policy
DROP POLICY IF EXISTS "Users can manage their own preferences" ON public.user_preferences;
CREATE POLICY "Users can manage their own preferences" 
ON public.user_preferences 
FOR ALL 
USING (
  auth.uid() = user_id AND 
  NOT public.is_user_suspended(auth.uid())
);
