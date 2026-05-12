'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Friend {
  id: string
  username: string
  email: string
  status: string
}

interface FriendListProps {
  onStartCall: (friendId: string, friendName: string, callType: 'audio' | 'video') => void
}

export default function FriendList({ onStartCall }: FriendListProps) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFriends()
    loadPendingRequests()

    const subscription = supabase
      .channel('friend-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => {
        loadFriends()
        loadPendingRequests()
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [])

  const loadFriends = async () => {
    const { data: user } = await supabase.auth.getUser()
    const currentUserId = user.user?.id

    if (!currentUserId) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('friends')
      .select(`
        friend_id,
        profiles:friend_id (
          id,
          username,
          email,
          status
        )
      `)
      .eq('user_id', currentUserId)
      .eq('status', 'accepted')

    if (!error && data) {
      const friendList: Friend[] = data.map((item: any) => ({
        id: item.profiles?.id || '',
        username: item.profiles?.username || 'Unknown',
        email: item.profiles?.email || '',
        status: item.profiles?.status || 'offline'
      }))
      setFriends(friendList)
    }
    setLoading(false)
  }

  const loadPendingRequests = async () => {
    const { data: user } = await supabase.auth.getUser()
    const currentUserId = user.user?.id

    if (!currentUserId) return

    const { data } = await supabase
      .from('friend_requests')
      .select(`
        *,
        sender:sender_id (
          id,
          username,
          email
        )
      `)
      .eq('receiver_id', currentUserId)
      .eq('status', 'pending')

    if (data) {
      setPendingRequests(data)
    }
  }

  const acceptRequest = async (requestId: string, senderId: string) => {
    const { data: user } = await supabase.auth.getUser()
    const currentUserId = user.user?.id

    if (!currentUserId) return

    await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId)

    await supabase
      .from('friends')
      .insert([
        { user_id: currentUserId, friend_id: senderId, status: 'accepted' },
        { user_id: senderId, friend_id: currentUserId, status: 'accepted' }
      ])

    loadFriends()
    loadPendingRequests()
  }

  const declineRequest = async (requestId: string) => {
    await supabase
      .from('friend_requests')
      .update({ status: 'declined' })
      .eq('id', requestId)
    
    loadPendingRequests()
  }

  if (loading) {
    return <div className="text-white/50 text-center py-4">Loading friends...</div>
  }

  return (
    <div className="space-y-4">
      {pendingRequests.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-white/40 uppercase">Friend Requests</h3>
          {pendingRequests.map((req: any) => (
            <div key={req.id} className="bg-white/5 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-white font-medium">{req.sender?.username || 'Unknown'}</p>
                  <p className="text-xs text-white/40">{req.sender?.email || ''}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptRequest(req.id, req.sender_id)}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineRequest(req.id)}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-white/40 uppercase mb-2">Friends ({friends.length})</h3>
        {friends.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-4">No friends yet. Add some!</p>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div key={friend.id} className="bg-white/5 rounded-lg p-3 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-white">
                      {friend.username?.charAt(0).toUpperCase()}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${
                      friend.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                    }`}></div>
                  </div>
                  <div>
                    <p className="text-white font-medium">{friend.username}</p>
                    <p className="text-xs text-white/40">{friend.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onStartCall(friend.id, friend.username, 'audio')}
                    className="w-8 h-8 bg-green-600/20 hover:bg-green-600/30 rounded-full flex items-center justify-center transition"
                  >
                    🎙️
                  </button>
                  <button
                    onClick={() => onStartCall(friend.id, friend.username, 'video')}
                    className="w-8 h-8 bg-purple-600/20 hover:bg-purple-600/30 rounded-full flex items-center justify-center transition"
                  >
                    📹
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
