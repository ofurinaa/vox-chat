'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ScreenShareProps {
  callId: string
  peerConnection: RTCPeerConnection | null
  onStop: () => void
}

export default function ScreenShare({ callId, peerConnection, onStop }: ScreenShareProps) {
  const [isSharing, setIsSharing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null)

  const getOriginalVideoTrack = () => {
    if (!peerConnection) return null
    const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video')
    return sender?.track || null
  }

  const startScreenShare = async () => {
    try {
      originalVideoTrackRef.current = getOriginalVideoTrack()
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      screenStreamRef.current = screenStream
      const videoTrack = screenStream.getVideoTracks()[0]

      if (peerConnection) {
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          await sender.replaceTrack(videoTrack)
        }
      }

      setIsSharing(true)
      videoTrack.onended = () => stopScreenShare()
      await supabase.from('calls').update({ is_screen_sharing: true }).eq('id', callId)
    } catch (err) {
      console.error('Screen share failed:', err)
    }
  }

  const stopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
      screenStreamRef.current = null
    }

    if (peerConnection && originalVideoTrackRef.current) {
      const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video')
      if (sender && originalVideoTrackRef.current) {
        await sender.replaceTrack(originalVideoTrackRef.current)
      }
    }

    setIsSharing(false)
    await supabase.from('calls').update({ is_screen_sharing: false }).eq('id', callId)
    onStop()
  }

  const pauseScreenShare = () => {
    if (screenStreamRef.current) {
      const videoTrack = screenStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = false
        setIsPaused(true)
      }
    }
  }

  const resumeScreenShare = () => {
    if (screenStreamRef.current) {
      const videoTrack = screenStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = true
        setIsPaused(false)
      }
    }
  }

  return (
    <div className="fixed bottom-24 right-4 z-40">
      {!isSharing ? (
        <button
          onClick={startScreenShare}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-full shadow-lg transition text-white"
        >
          <span className="text-lg">🖥️</span>
          <span className="text-sm font-medium">Share Screen</span>
        </button>
      ) : (
        <div className="bg-gray-900 rounded-xl shadow-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-2 bg-purple-600/20 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-white">Sharing Screen</span>
            </div>
            <button onClick={stopScreenShare} className="text-xs text-red-400 hover:text-red-300">
              Stop
            </button>
          </div>
          <div className="p-2 flex gap-2">
            {isPaused ? (
              <button onClick={resumeScreenShare} className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs text-white">
                ▶️ Resume
              </button>
            ) : (
              <button onClick={pauseScreenShare} className="flex-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-xs text-white">
                ⏸️ Pause
              </button>
            )}
            <button onClick={stopScreenShare} className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs text-white">
              ⬛ Stop
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
