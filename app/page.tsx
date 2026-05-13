'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface Message {
  id: number
  content: string
  user_id: string
  created_at: string
  profiles?: {
    username: string
  }
}

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [authError, setAuthError] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
          
          const newMessageObj: Message = {
            id: payload.new.id,
            content: payload.new.content,
            user_id: payload.new.user_id,
            created_at: payload.new.created_at,
            profiles: profile || { username: 'Anonymous' }
          }
          
          setMessages(prev => [...prev, newMessageObj])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    setLoading(true)

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setAuthError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: { data: { username: username || email.split('@')[0] } }
      })
      if (error) setAuthError(error.message)
    }
    setLoading(false)
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || sending) return

    setSending(true)
    const { error } = await supabase
      .from('messages')
      .insert({ content: newMessage, user_id: user.id })

    if (!error) {
      setNewMessage('')
    }
    setSending(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-pink-800 p-4">
        <div className="relative bg-white/10 backdrop-blur-xl rounded-2xl p-8 w-full max-w-md border border-white/20">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image 
                src="/logo.png" 
                alt="Vox Logo" 
                width={100} 
                height={100}
                className="animate-bounce"
                priority
              />
            </div>
            <h1 className="text-3xl font-bold text-white mt-2">Welcome to Vox</h1>
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

            {authError && (
              <div className="bg-red-500/20 text-red-200 p-3 rounded-xl text-sm">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl hover:opacity-90 transition font-semibold"
            >
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <button
            onClick={() => setIsLogin(!isLogin)}
            className="w-full mt-4 text-sm text-purple-300 hover:text-white transition"
          >
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
          </button>

          <div className="mt-6 pt-6 border-t border-white/10 text-center text-xs text-white/40">
            💬 Real-time • 📹 Video Calls • 🖥️ Screen Share • 🔒 Secure
          </div>
        </div>
      </div>
    )
  }

  const displayName = user.user_metadata?.username || user.email?.split('@')[0]

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="hidden md:flex w-80 bg-gray-900/50 backdrop-blur border-r border-white/10 flex-col">
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-indigo-600/20 to-purple-600/20">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Image 
                  src="/logo.png" 
                  alt="Vox Logo" 
                  width={56} 
                  height={56}
                  className="object-cover"
                />
              </div>
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-gray-900"></div>
            </div>
            <div>
              <h2 className="font-semibold text-white">{displayName}</h2>
              <p className="text-xs text-white/50">{user.email}</p>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-white/60">Online</span>
            </div>
          </div>
          
          <div className="bg-white/5 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-white/40 uppercase mb-3">About Vox</h3>
            <p className="text-sm text-white/60">Real-time messaging with instant delivery.</p>
          </div>
        </div>
        
        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-xl transition font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-gray-900/50 backdrop-blur border-b border-white/10 px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <Image 
                  src="/logo.png" 
                  alt="Vox Logo" 
                  width={32} 
                  height={32}
                  className="object-cover"
                />
              </div>
              <h1 className="text-xl font-bold text-white">Vox Pro</h1>
              <span className="text-xs bg-indigo-600/50 text-indigo-200 px-2 py-0.5 rounded-full ml-2">
                Real-time
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="md:hidden px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-xl transition"
            >
              Exit
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-7xl mb-4 opacity-50">💬</div>
              <h3 className="text-xl font-semibold text-white/60">No messages yet</h3>
              <p className="text-white/40 mt-2">Be the first to say something!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.user_id === user.id
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} animate-fade-in`}
                >
                  <div className={`max-w-[70%] ${isOwn ? 'order-1' : 'order-2'}`}>
                    {!isOwn && (
                      <div className="text-xs font-semibold text-white/50 mb-1 ml-2">
                        {msg.profiles?.username || 'Anonymous'}
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 ${
                      isOwn 
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg' 
                        : 'bg-white/10 backdrop-blur text-white border border-white/10'
                    }`}>
                      <p className="break-words">{msg.content}</p>
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
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 px-5 py-3 bg-white/10 border border-white/10 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-white/40"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !newMessage.trim()}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-full hover:opacity-90 transition disabled:opacity-50 font-medium shadow-lg"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
          <p className="text-xs text-white/30 text-center mt-2">
            Press Enter to send • {messages.length} messages
          </p>
        </div>
      </div>
    </div>
  )
}
