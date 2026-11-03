import { supabase } from '@/integrations/supabase/client';

export interface SharedPlaylist {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  cover_image_url: string;
  created_at: string;
  shared_by_user_id: string;
  shared_by_username?: string;
  shared_at: string;
  song_count?: number;
}

export interface UserProfile {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

// Share a playlist with another user
export const sharePlaylist = async (
  playlistId: string,
  userId: string,
  currentUserId: string
) => {
  try {
    const { data, error } = await supabase
      .from('playlist_shares')
      .insert({
        playlist_id: playlistId,
        shared_by_user_id: currentUserId,
        shared_with_user_id: userId
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error sharing playlist:', error);
    return { success: false, error };
  }
};

// Unshare a playlist with a user
export const unsharePlaylist = async (playlistId: string, userId: string) => {
  try {
    const { error } = await supabase
      .from('playlist_shares')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('shared_with_user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error unsharing playlist:', error);
    return { success: false, error };
  }
};

// Get all users who this playlist is shared with
export const getPlaylistShares = async (playlistId: string) => {
  try {
    const { data, error } = await supabase
      .from('playlist_shares')
      .select(`
        shared_with_user_id,
        shared_at,
        profiles!shared_with_user_id (
          username,
          display_name,
          avatar_url
        )
      `)
      .eq('playlist_id', playlistId);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching playlist shares:', error);
    return { success: false, error };
  }
};

// Get all playlists shared with current user
export const getSharedPlaylistsWithMe = async (currentUserId: string) => {
  try {
    const { data, error } = await supabase
      .from('playlist_shares')
      .select(`
        playlist_id,
        shared_by_user_id,
        shared_at,
        playlists (
          id,
          name,
          description,
          is_public,
          cover_image_url,
          created_at,
          playlist_songs(count)
        ),
        profiles!shared_by_user_id (
          username,
          display_name,
          avatar_url
        )
      `)
      .eq('shared_with_user_id', currentUserId)
      .order('shared_at', { ascending: false });

    if (error) throw error;

    const sharedPlaylists = data?.map((share: any) => ({
      ...share.playlists,
      shared_by_user_id: share.shared_by_user_id,
      shared_by_username: share.profiles?.username,
      shared_at: share.shared_at,
      song_count: share.playlists.playlist_songs?.[0]?.count || 0
    })) || [];

    return { success: true, data: sharedPlaylists };
  } catch (error) {
    console.error('Error fetching shared playlists:', error);
    return { success: false, error };
  }
};

// Search for users by username or display name
export const searchUsers = async (query: string, excludeUserIds: (string | undefined)[] = []) => {
  try {
    // Build the query
    let userQuery = supabase
      .from('profiles')
      .select('id:user_id, username, display_name, avatar_url')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`);

    // Exclude specified users (by auth user_id)
    const validIds = excludeUserIds.filter((id): id is string => !!id);
    if (validIds.length > 0) {
      userQuery = userQuery.not('user_id', 'in', `(${validIds.join(',')})`);
    }

    const { data, error } = await userQuery.limit(10);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error searching users:', error);
    return { success: false, error };
  }
};

// Check if playlist is shared with a specific user
export const isPlaylistSharedWith = async (
  playlistId: string,
  userId: string
): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('playlist_shares')
      .select('id')
      .eq('playlist_id', playlistId)
      .eq('shared_with_user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
    return !!data;
  } catch (error) {
    console.error('Error checking playlist share:', error);
    return false;
  }
};
