import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { 
  Users, 
  Music, 
  Activity, 
  Crown, 
  Shield, 
  BarChart3,
  UserCheck,
  UserMinus,
  UserX,
  UserPlus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Ban,
  CheckCircle,
  XCircle,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Clock,
  TrendingUp,
  Play,
  Heart
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  created_at: string;
  email?: string;
  role?: string;
  user_roles?: Array<{ role: string }>;
  avatar_url?: string;
  is_suspended?: boolean;
  last_login?: string;
  playlists_count?: number;
  songs_played?: number;
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  adminUsers: number;
  totalPlaylists: number;
  totalSongs: number;
  recentActivity: number;
}

export const AdminView: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [stats, setStats] = useState<UserStats>({
    totalUsers: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    adminUsers: 0,
    totalPlaylists: 0,
    totalSongs: 0,
    recentActivity: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    }
  }, [isAdmin]);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter, statusFilter]);

  const fetchAdminData = async () => {
    try {
      // Fetch all users with their roles and additional data
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch additional user statistics and roles
      const usersWithStats = await Promise.all(
        profiles?.map(async (profile) => {
          const [playlistsResult, songsResult, roleResult] = await Promise.all([
            supabase
              .from('playlists')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', profile.user_id),
            supabase
              .from('recently_played')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', profile.user_id),
            supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', profile.user_id)
              .single()
          ]);

          return {
            ...profile,
            role: roleResult.data?.role || 'user',
            playlists_count: playlistsResult.count || 0,
            songs_played: songsResult.count || 0,
            is_suspended: profile.is_suspended || false
          };
        }) || []
      );

      setUsers(usersWithStats);

      // Calculate statistics
      const adminUsers = usersWithStats.filter(u => u.role === 'admin').length;
      const activeUsers = usersWithStats.length; // You can add logic for active users
      const suspendedUsers = usersWithStats.filter(u => u.is_suspended).length;

      // Fetch overall statistics
      const [
        { count: playlistCount },
        { count: songCount },
        { count: activityCount }
      ] = await Promise.all([
        supabase.from('playlists').select('*', { count: 'exact', head: true }),
        supabase.from('playlist_songs').select('*', { count: 'exact', head: true }),
        supabase.from('recently_played').select('*', { count: 'exact', head: true })
      ]);

      setStats({
        totalUsers: usersWithStats.length,
        activeUsers,
        suspendedUsers,
        adminUsers,
        totalPlaylists: playlistCount || 0,
        totalSongs: songCount || 0,
        recentActivity: activityCount || 0
      });

    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast({
        title: "Error",
        description: "Failed to load admin data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Role filter
    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        filtered = filtered.filter(user => !user.is_suspended);
      } else if (statusFilter === 'suspended') {
        filtered = filtered.filter(user => user.is_suspended);
      }
    }

    setFilteredUsers(filtered);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      // Remove existing role
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Add new role
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: newRole as 'admin' | 'user'
        });

      if (error) throw error;

      // Update local state
      setUsers(prev => prev.map(user => 
        user.user_id === userId 
          ? { ...user, role: newRole }
          : user
      ));

      toast({
        title: "Success",
        description: `User role updated to ${newRole}`,
      });

      fetchAdminData(); // Refresh stats
    } catch (error) {
      console.error('Error updating user role:', error);
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive"
      });
    }
  };

  const handleSuspendUser = async (userId: string, suspend: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_suspended: suspend } as any)
        .eq('user_id', userId);

      if (error) throw error;

      // Update local state
      setUsers(prev => prev.map(user => 
        user.user_id === userId 
          ? { ...user, is_suspended: suspend }
          : user
      ));

      toast({
        title: suspend ? "User Suspended" : "User Reactivated",
        description: suspend 
          ? "User has been suspended from the platform"
          : "User has been reactivated",
      });

      fetchAdminData(); // Refresh stats
    } catch (error) {
      console.error('Error suspending user:', error);
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // Delete user roles
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete user profile
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      // Update local state
      setUsers(prev => prev.filter(user => user.user_id !== userId));

      toast({
        title: "Success",
        description: "User has been deleted",
      });

      fetchAdminData(); // Refresh stats
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: "Failed to delete user",
        variant: "destructive"
      });
    }
  };

  const openUserDetails = (user: UserProfile) => {
    setSelectedUser(user);
    setIsUserDialogOpen(true);
  };

  const openEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setIsEditDialogOpen(true);
  };

  if (!isAdmin) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-muted-foreground mx-auto" />
          <div>
            <h2 className="text-2xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground">You don't have admin privileges</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading admin data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Admin Header */}
      <div className="flex items-center gap-3">
        <Crown className="w-8 h-8 text-accent" />
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage Melodiya users and content</p>
        </div>
      </div>

      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{stats.totalUsers}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.activeUsers} active, {stats.suspendedUsers} suspended
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-accent/20 rounded-lg flex items-center justify-center">
                <Crown className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Admin Users</p>
                <p className="text-2xl font-bold">{stats.adminUsers}</p>
                <p className="text-xs text-muted-foreground">
                  {((stats.adminUsers / stats.totalUsers) * 100).toFixed(1)}% of total
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-secondary/20 rounded-lg flex items-center justify-center">
                <Music className="w-6 h-6 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Playlists</p>
                <p className="text-2xl font-bold">{stats.totalPlaylists}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.totalSongs} songs total
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Recent Activity</p>
                <p className="text-2xl font-bold">{stats.recentActivity}</p>
                <p className="text-xs text-muted-foreground">
                  Songs played today
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="content">Content Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          {/* User Management Controls */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Users List */}
              <div className="space-y-4">
                {filteredUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
                        {user.avatar_url ? (
                          <img 
                            src={user.avatar_url} 
                            alt={user.display_name || user.username}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-semibold">
                            {user.display_name?.charAt(0) || user.username?.charAt(0) || 'U'}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{user.display_name || user.username}</p>
                        <p className="text-sm text-muted-foreground">
                          {user.email} • Joined {new Date(user.created_at).toLocaleDateString()}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            <Play className="w-3 h-3 mr-1" />
                            {user.songs_played} songs
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            <Music className="w-3 h-3 mr-1" />
                            {user.playlists_count} playlists
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role === 'admin' ? (
                          <>
                            <Crown className="w-3 h-3 mr-1" />
                            Admin
                          </>
                        ) : (
                          'User'
                        )}
                      </Badge>
                      
                      <div className="flex items-center gap-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => openUserDetails(user)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                        </Dialog>

                        <Select 
                          value={user.role} 
                          onValueChange={(value) => handleRoleChange(user.user_id, value)}
                        >
                          <SelectTrigger className="w-24 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className={user.is_suspended ? "text-green-600" : "text-red-600"}
                            >
                              {user.is_suspended ? (
                                <CheckCircle className="w-4 h-4" />
                              ) : (
                                <Ban className="w-4 h-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {user.is_suspended ? "Reactivate User" : "Suspend User"}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to {user.is_suspended ? "reactivate" : "suspend"} {user.display_name || user.username}? 
                                {user.is_suspended ? " They will be able to access the platform again." : " They will not be able to access the platform."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleSuspendUser(user.user_id, !user.is_suspended)}
                                className={user.is_suspended ? "bg-green-600" : "bg-red-600"}
                              >
                                {user.is_suspended ? "Reactivate" : "Suspend"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {user.display_name || user.username}? 
                                This action cannot be undone and will remove all their data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUser(user.user_id)}
                                className="bg-red-600"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Content Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Popular Content</h3>
                    <p className="text-sm text-muted-foreground">
                      Most played songs and trending playlists
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">User Generated</h3>
                    <p className="text-sm text-muted-foreground">
                      Playlists and favorites created by users
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Platform Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">User Activity</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Active Users</span>
                      <span className="font-medium">{stats.activeUsers}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Admin Users</span>
                      <span className="font-medium">{stats.adminUsers}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Suspended Users</span>
                      <span className="font-medium">{stats.suspendedUsers}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold">Content Stats</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Songs Played</span>
                      <span className="font-medium">{stats.recentActivity}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Playlists Created</span>
                      <span className="font-medium">{stats.totalPlaylists}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Songs</span>
                      <span className="font-medium">{stats.totalSongs}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User Details Dialog */}
      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Detailed information about {selectedUser?.display_name || selectedUser?.username}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                  {selectedUser.avatar_url ? (
                    <img 
                      src={selectedUser.avatar_url} 
                      alt={selectedUser.display_name || selectedUser.username}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-semibold">
                      {selectedUser.display_name?.charAt(0) || selectedUser.username?.charAt(0) || 'U'}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{selectedUser.display_name || selectedUser.username}</h3>
                  <p className="text-muted-foreground">{selectedUser.email}</p>
                  <Badge variant={selectedUser.role === 'admin' ? 'default' : 'secondary'}>
                    {selectedUser.role === 'admin' ? (
                      <>
                        <Crown className="w-3 h-3 mr-1" />
                        Admin
                      </>
                    ) : (
                      'User'
                    )}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Account Information</Label>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>Joined: {new Date(selectedUser.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>Last login: {selectedUser.last_login ? new Date(selectedUser.last_login).toLocaleDateString() : 'Never'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Activity Statistics</Label>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <Play className="w-4 h-4 text-muted-foreground" />
                      <span>Songs played: {selectedUser.songs_played}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4 text-muted-foreground" />
                      <span>Playlists created: {selectedUser.playlists_count}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsUserDialogOpen(false);
                    openEditUser(selectedUser);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit User
                </Button>
                <Button
                  variant={selectedUser.is_suspended ? "default" : "destructive"}
                  onClick={() => {
                    setIsUserDialogOpen(false);
                    handleSuspendUser(selectedUser.user_id, !selectedUser.is_suspended);
                  }}
                >
                  {selectedUser.is_suspended ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Reactivate
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4 mr-2" />
                      Suspend
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
