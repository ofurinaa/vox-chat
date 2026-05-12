'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

// --- Supabase Client ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// --- Types ---
interface Message {
  id: number
  content: string
  user_id: string
  created_at: string
  profiles?: { username: string }
}

interface CallUser {
  id: string
  username: string
  email: string
}

// --- Main Component ---
export default function Home() {
  // Auth State
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [authError, setAuthError] = useState('')
  
  // Chat State
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [activeTab, setActiveTab] = useState<'chats' | 'friends'>('chats')
  const [showAddFriend, setShowAddFriend] = useState(false)
  
  // Friends State
  const [friends, setFriends] = useState<any[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [friendEmail, setFriendEmail] = useState('')
  const [friendMessage, setFriendMessage] = useState('')
  
  // Call State
  const [inCall, setInCall] = useState(false)
  const [callType, setCallType] = useState<'audio' | 'video'>('video')
  const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'connected'>('idle')
  const [callPartner, setCallPartner] = useState<CallUser | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [incomingCall, setIncomingCall] = useState<{ callerName: string; callType: 'audio' | 'video' } | null>(null)
  
  // Call Refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auth Check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch Messages
  useEffect(() => {
    if (!user) return

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select(`*, profiles (username)`)
        .order('created_at', { ascending: true })
        .limit(100)
      if (data) setMessages(data)
    }
    fetchMessages()

    const channel = supabase
      .channel('messages')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', payload.new.user_id)
            .single()
          setMessages(prev => [...prev, { ...payload.new, profiles: profile || { username: 'Anonymous' } }])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  // Fetch Friends
  useEffect(() => {
    if (!user) return

    const loadFriends = async () => {
      const { data } = await supabase
        .from('friends')
        .select(`friend_id, profiles:friend_id (id, username, email)`)
        .eq('user_id', user.id)
        .eq('status', 'accepted')
      if (data) {
        const friendList = data.map((item: any) => ({
          id: item.profiles.id,
          username: item.profiles.username,
          email: item.profiles.email
        }))
        setFriends(friendList)
      }
    }

    const loadRequests = async () => {
      const { data } = await supabase
        .from('friend_requests')
        .select(`*, sender:sender_id (id, username, email)`)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
      if (data) setPendingRequests(data)
    }

    loadFriends()
    loadRequests()

    const subscription = supabase
      .channel('friends')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => {
        loadRequests()
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [user])

  // --- Auth Handler ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    setLoading(true)

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setAuthError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ 
        email, password,
        options: { data: { username: username || email.split('@')[0] } }
      })
      if (error) setAuthError(error.message)
    }
    setLoading(false)
  }

  // --- Message Handler ---
  const sendMessage = async () => {
    if (!newMessage.trim() || !user || sending) return
    setSending(true)
    await supabase.from('messages').insert({ content: newMessage, user_id: user.id })
    setNewMessage('')
    setSending(false)
  }

  // --- Friend Handlers ---
  const sendFriendRequest = async () => {
    if (!friendEmail.trim()) return
    
    const { data: foundUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', friendEmail)
      .single()
    
    if (!foundUser) {
      setFriendMessage('User not found')
      return
    }
    
    if (foundUser.id === user.id) {
      setFriendMessage('You cannot add yourself')
      return
    }
    
    const { error } = await supabase
      .from('friend_requests')
      .insert({ sender_id: user.id, receiver_id: foundUser.id })
    
    if (error) setFriendMessage('Request already sent')
    else setFriendMessage('Request sent!')
    
    setTimeout(() => setFriendMessage(''), 2000)
    setFriendEmail('')
  }

  const acceptRequest = async (requestId: string, senderId: string) => {
    await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId)
    await supabase.from('friends').insert([
      { user_id: user.id, friend_id: senderId, status: 'accepted' },
      { user_id: senderId, friend_id: user.id, status: 'accepted' }
    ])
    setPendingRequests(prev => prev.filter(r => r.id !== requestId))
    const { data } = await supabase
      .from('profiles')
      .select('id, username, email')
      .eq('id', senderId)
      .single()
    if (data) setFriends(prev => [...prev, data])
  }

  // --- Call Handlers ---
  const startCall = async (type: 'audio' | 'video', partner: CallUser) => {
    setCallType(type)
    setCallPartner(partner)
    setCallStatus('ringing')
    setInCall(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === 'video',
        audio: true
      })
      localStreamRef.current = stream
      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      })

      stream.getTracks().forEach(track => pc.addTrack(track, stream))
      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0]
          setCallStatus('connected')
        }
      }
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected') endCall()
      }

      peerConnectionRef.current = pc
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      setTimeout(() => setCallStatus('connected'), 1000)
    } catch (err) {
      console.error('Call failed:', err)
      endCall()
    }
  }

  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
    }
    setInCall(false)
    setCallStatus('idle')
    setCallPartner(null)
    setIsScreenSharing(false)
  }

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      audioTrack.enabled = !audioTrack.enabled
      setIsMuted(!audioTrack.enabled)
    }
  }

  const toggleCamera = () => {
    if (localStreamRef.current && callType === 'video') {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      videoTrack.enabled = !videoTrack.enabled
      setIsCameraOff(!videoTrack.enabled)
    }
  }

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      screenStreamRef.current = screenStream
      const videoTrack = screenStream.getVideoTracks()[0]
      const sender = peerConnectionRef.current?.getSenders().find(s => s.track?.kind === 'video')
      if (sender) sender.replaceTrack(videoTrack)
      setIsScreenSharing(true)
      videoTrack.onended = () => stopScreenShare()
    } catch (err) {
      console.error('Screen share failed:', err)
    }
  }

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
      setIsScreenSharing(false)
    }
  }

  // --- Loading Screen ---
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-pink-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mx-auto"></div>
          <p className="mt-4 text-white/80">Loading Vox...</p>
        </div>
      </div>
    )
  }

  // --- Auth Screen ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-pink-800 p-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 w-full max-w-md border border-white/20">
          <div className="text-center mb-8">
            <div className="text-7xl mb-3 animate-bounce">🎙️</div>
            <h1 className="text-4xl font-bold text-white">Vox</h1>
            <p className="text-white/60 mt-2">Premium real-time messaging & calling</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40"
                  placeholder="coolusername"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40"
                required
                minLength={6}
              />
            </div>
            {authError && <div className="bg-red-500/20 text-red-200 p-3 rounded-xl text-sm">{authError}</div>}
            <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold">
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <button onClick={() => setIsLogin(!isLogin)} className="w-full mt-4 text-sm text-purple-300 hover:text-white transition">
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
          </button>
        </div>
      </div>
    )
  }

  // --- Call UI ---
  if (inCall) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        {callType === 'video' && (
          <div className="absolute top-4 right-4 w-40 h-56 rounded-xl overflow-hidden shadow-xl border-2 border-white/20">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          </div>
        )}
        <div className="absolute top-4 left-4 text-white bg-black/50 backdrop-blur rounded-xl px-4 py-2">
          <p className="font-semibold">{callPartner?.username || 'Call'}</p>
          <p className="text-sm">{callStatus === 'ringing' ? 'Ringing...' : 'Connected'}</p>
        </div>
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4">
          <button onClick={toggleMute} className={`w-14 h-14 rounded-full ${isMuted ? 'bg-red-600' : 'bg-gray-700'}`}>
            {isMuted ? '🔇' : '🎤'}
          </button>
          {callType === 'video' && (
            <>
              <button onClick={toggleCamera} className={`w-14 h-14 rounded-full ${isCameraOff ? 'bg-red-600' : 'bg-gray-700'}`}>
                {isCameraOff ? '📷❌' : '📷'}
              </button>
              <button onClick={isScreenSharing ? stopScreenShare : startScreenShare} className={`w-14 h-14 rounded-full ${isScreenSharing ? 'bg-green-600' : 'bg-gray-700'}`}>
                🖥️
              </button>
            </>
          )}
          <button onClick={endCall} className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700">📞</button>
        </div>
      </div>
    )
  }

  // --- Main Chat UI ---
  const displayName = user.user_metadata?.username || user.email?.split('@')[0]

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Sidebar */}
      <div className="hidden md:flex w-80 bg-gray-900/50 backdrop-blur border-r border-white/10 flex-col">
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-indigo-600/20 to-purple-600/20">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
              {displayName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-semibold text-white">{displayName}</h2>
              <p className="text-xs text-white/50">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="flex border-b border-white/10">
          <button onClick={() => setActiveTab('chats')} className={`flex-1 py-3 text-sm font-medium ${activeTab === 'chats' ? 'text-purple-400 border-b-2 border-purple-500' : 'text-white/40'}`}>💬 Chats</button>
          <button onClick={() => setActiveTab('friends')} className={`flex-1 py-3 text-sm font-medium ${activeTab === 'friends' ? 'text-purple-400 border-b-2 border-purple-500' : 'text-white/40'}`}>👥 Friends</button>
        </div>

        {activeTab === 'friends' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4">
              <input type="email" value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} placeholder="friend@email.com" className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder-white/40 mb-2" />
              <button onClick={sendFriendRequest} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2 rounded-lg">+ Add Friend</button>
              {friendMessage && <p className="text-sm text-center mt-2 text-white/60">{friendMessage}</p>}
            </div>

            {pendingRequests.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-white/40 mb-2">Requests</h3>
                {pendingRequests.map((req) => (
                  <div key={req.id} className="bg-white/5 rounded-lg p-3 mb-2">
                    <div className="flex justify-between items-center">
                      <span className="text-white">{req.sender?.username}</span>
                      <button onClick={() => acceptRequest(req.id, req.sender_id)} className="px-3 py-1 bg-green-600 text-sm rounded-lg">Accept</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3 className="text-xs font-semibold text-white/40 mb-2">Friends ({friends.length})</h3>
            {friends.map((friend) => (
              <div key={friend.id} className="bg-white/5 rounded-lg p-3 mb-2 flex justify-between items-center">
                <span className="text-white">{friend.username}</span>
                <div className="flex gap-2">
                  <button onClick={() => startCall('audio', friend)} className="px-3 py-1 bg-green-600/20 text-green-300 rounded-lg text-sm">🎙️</button>
                  <button onClick={() => startCall('video', friend)} className="px-3 py-1 bg-purple-600/20 text-purple-300 rounded-lg text-sm">📹</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'chats' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-white/5 rounded-xl p-4 text-center text-white/40 text-sm">Select a chat to start messaging</div>
          </div>
        )}

        <div className="p-4 border-t border-white/10">
          <button onClick={() => supabase.auth.signOut()} className="w-full px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg">Sign Out</button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="bg-gray-900/50 backdrop-blur border-b border-white/10 px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2"><span className="text-2xl">🎙️</span><h1 className="text-xl font-bold text-white">Vox Pro</h1></div>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-purple-600/20 text-purple-300 rounded-xl text-sm font-medium">📹 Video Call</button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center"><div className="text-7xl mb-4 opacity-50">💬</div><p className="text-white/40">No messages yet. Say hello!</p></div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.user_id === user.id
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] ${isOwn ? 'order-1' : 'order-2'}`}>
                    {!isOwn && <div className="text-xs text-white/50 mb-1 ml-2">{msg.profiles?.username || 'Anonymous'}</div>}
                    <div className={`rounded-2xl px-4 py-2.5 ${isOwn ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-white/10 text-white'}`}>
                      <p>{msg.content}</p>
                      <div className={`text-xs mt-1 ${isOwn ? 'text-indigo-200' : 'text-white/40'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="bg-gray-900/50 backdrop-blur border-t border-white/10 p-4">
          <div className="flex gap-3">
            <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} placeholder="Type a message..." className="flex-1 px-5 py-3 bg-white/10 border border-white/10 rounded-full text-white placeholder-white/40" disabled={sending} />
            <button onClick={sendMessage} disabled={sending || !newMessage.trim()} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-full font-medium">Send</button>
          </div>
        </div>
      </div>
    </div>
  )
}