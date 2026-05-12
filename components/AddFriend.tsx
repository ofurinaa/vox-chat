'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface AddFriendProps {
  onClose: () => void
  onFriendAdded: () => void
}

export default function AddFriend({ onClose, onFriendAdded }: AddFriendProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { data: user } = await supabase.auth.getUser()
      const currentUserId = user.user?.id

      if (!currentUserId) {
        setMessage('You must be logged in')
        setMessageType('error')
        setLoading(false)
        return
      }

      const { data: users, error: userError } = await supabase
        .from('profiles')
        .select('id, username, email')
        .eq('email', email)
        .maybeSingle()

      if (userError || !users) {
        setMessage('User not found')
        setMessageType('error')
        setLoading(false)
        return
      }

      if (users.id === currentUserId) {
        setMessage('You cannot add yourself as a friend')
        setMessageType('error')
        setLoading(false)
        return
      }

      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${users.id}),and(sender_id.eq.${users.id},receiver_id.eq.${currentUserId})`)
        .maybeSingle()

      if (existingRequest) {
        setMessage('Friend request already sent or pending')
        setMessageType('error')
        setLoading(false)
        return
      }

      const { error: insertError } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: currentUserId,
          receiver_id: users.id
        })

      if (insertError) {
        setMessage('Failed to send friend request')
        setMessageType('error')
      } else {
        setMessage(`Friend request sent to ${users.username || email}!`)
        setMessageType('success')
        setEmail('')
        setTimeout(() => {
          onFriendAdded()
          onClose()
        }, 1500)
      }
    } catch (err) {
      setMessage('An error occurred')
      setMessageType('error')
    }

    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-white/10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Add Friend</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
        </div>
        
        <form onSubmit={handleAddFriend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
              required
            />
          </div>
          
          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              messageType === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
            }`}>
              {message}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Friend Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
