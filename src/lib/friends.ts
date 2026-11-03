import { supabase } from '@/integrations/supabase/client';

export interface FriendProfile {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  profile?: FriendProfile;
}

// Send a friend request to a user
export const sendFriendRequest = async (currentUserId: string, addresseeId: string) => {
  if (currentUserId === addresseeId) {
    return { success: false, error: 'Cannot friend yourself' };
  }
  // Check if a friendship already exists either direction
  const { data: existing } = await supabase
    .from('friendships')
    .select('*')
    .or(
      `and(requester_id.eq.${currentUserId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${currentUserId})`
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === 'accepted') return { success: false, error: 'Already friends' };
    if (existing.status === 'pending') return { success: false, error: 'Request already pending' };
    // rejected — allow resend by deleting old row
    await supabase.from('friendships').delete().eq('id', existing.id);
  }

  const { data, error } = await supabase
    .from('friendships')
    .insert({ requester_id: currentUserId, addressee_id: addresseeId, status: 'pending' })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
};

export const respondToFriendRequest = async (
  friendshipId: string,
  accept: boolean
) => {
  const { error } = await supabase
    .from('friendships')
    .update({ status: accept ? 'accepted' : 'rejected' })
    .eq('id', friendshipId);
  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const removeFriendship = async (friendshipId: string) => {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) return { success: false, error: error.message };
  return { success: true };
};

const attachProfiles = async (rows: any[], otherIdField: 'requester_id' | 'addressee_id' | 'either', currentUserId?: string) => {
  if (!rows.length) return [];
  const ids = rows.map((r) => {
    if (otherIdField === 'either') {
      return r.requester_id === currentUserId ? r.addressee_id : r.requester_id;
    }
    return r[otherIdField];
  });
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, username, display_name, avatar_url')
    .in('user_id', ids);
  const map = new Map((profiles || []).map((p) => [p.user_id, p]));
  return rows.map((r) => {
    const otherId =
      otherIdField === 'either'
        ? r.requester_id === currentUserId
          ? r.addressee_id
          : r.requester_id
        : r[otherIdField];
    return { ...r, profile: map.get(otherId) || null };
  });
};

// Incoming pending requests (where I'm the addressee)
export const getIncomingRequests = async (currentUserId: string) => {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('addressee_id', currentUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) return { success: false, error: error.message, data: [] };
  const withProfiles = await attachProfiles(data || [], 'requester_id');
  return { success: true, data: withProfiles as FriendshipRow[] };
};

// Outgoing pending requests
export const getOutgoingRequests = async (currentUserId: string) => {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('requester_id', currentUserId)
    .eq('status', 'pending');
  if (error) return { success: false, error: error.message, data: [] };
  const withProfiles = await attachProfiles(data || [], 'addressee_id');
  return { success: true, data: withProfiles as FriendshipRow[] };
};

// Accepted friends (both directions)
export const getFriends = async (currentUserId: string) => {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);
  if (error) return { success: false, error: error.message, data: [] };
  const withProfiles = await attachProfiles(data || [], 'either', currentUserId);
  return { success: true, data: withProfiles as FriendshipRow[] };
};
