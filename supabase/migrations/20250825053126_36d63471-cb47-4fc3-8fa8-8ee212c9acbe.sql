-- Add missing fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN is_suspended BOOLEAN DEFAULT FALSE,
ADD COLUMN last_login TIMESTAMP WITH TIME ZONE;

-- Update the profiles update trigger to handle new columns
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();