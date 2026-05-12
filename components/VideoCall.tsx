'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ScreenShare from './ScreenShare'

interface VideoCallProps {
  callId: string
  callerId: string
  receiverId: string
  callType: 'audio' | 'video'
  onEnd: () => void
}

export default function VideoCall({ callId, callerId, receiverId, callType, onEnd }: VideoCallProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [showScreenShare, setShowScreenShare] = useState(false)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    startCall()
    const timer = setInterval(() => setCallDuration(prev => prev + 1), 1000)
    return () => {
      clearInterval(timer)
      endCall()
    }
  }, [])

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callType === 'video',
        audio: true
      })
      localStreamRef.current = stream
      if (localVideoRef.current && callType === 'video') {
        localVideoRef.current.srcObject = stream
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ]
      })

      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }

      const iceCandidates: any[] = []
      
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          iceCandidates.push(event.candidate.toJSON())
          await supabase
            .from('calls')
            .update({ ice_candidates: iceCandidates })
            .eq('id', callId)
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected') {
          endCall()
        }
      }

      peerConnectionRef.current = pc

      const callSubscription = supabase
        .channel(`call-${callId}`)
        .on('postgres_changes', 
          { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` }, 
          async (payload) => {
            const call = payload.new
            if (call.offer && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(call.offer))
              const answer = await pc.createAnswer()
              await pc.setLocalDescription(answer)
              await supabase.from('calls').update({ answer }).eq('id', callId)
            } else if (call.answer && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(call.answer))
            } else if (call.ice_candidates?.length) {
              for (const candidate of call.ice_candidates) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate))
                } catch (e) {
                  console.error('Error adding ICE candidate:', e)
                }
              }
            }
          }
        )
        .subscribe()

      const { data: userData } = await supabase.auth.getUser()
      const currentUserId = userData.user?.id

      const { data: callData } = await supabase
        .from('calls')
        .select('*')
        .eq('id', callId)
        .single()
        
      if (callData?.caller_id === currentUserId) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await supabase.from('calls').update({ offer }).eq('id', callId)
      }

    } catch (err) {
      console.error('Failed to start call:', err)
      endCall()
    }
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

  const endCall = async () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
    }
    await supabase
      .from('calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', callId)
    onEnd()
  }

  const formatDuration = () => {
    const mins = Math.floor(callDuration / 60)
    const secs = callDuration % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {callType === 'video' && (
        <button
          onClick={() => setShowScreenShare(!showScreenShare)}
          className="absolute bottom-24 left-4 z-10 w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 transition flex items-center justify-center text-white"
        >
          🖥️
        </button>
      )}

      {showScreenShare && peerConnectionRef.current && (
        <ScreenShare
          callId={callId}
          peerConnection={peerConnectionRef.current}
          onStop={() => setShowScreenShare(false)}
        />
      )}

      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      
      {callType === 'video' && (
        <div className="absolute top-4 right-4 w-40 h-56 rounded-xl overflow-hidden shadow-xl border-2 border-white/20">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <div className="absolute top-4 left-4 text-white">
        <div className="bg-black/50 backdrop-blur rounded-xl px-4 py-2">
          <p className="font-semibold">In Call</p>
          <p className="text-sm opacity-75">{formatDuration()}</p>
        </div>
      </div>

      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4">
        <button
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full transition-all ${
            isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>
        
        {callType === 'video' && (
          <button
            onClick={toggleCamera}
            className={`w-14 h-14 rounded-full transition-all ${
              isCameraOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isCameraOff ? '📷❌' : '📷'}
          </button>
        )}
        
        <button
          onClick={endCall}
          className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 transition-all"
        >
          📞
        </button>
      </div>
    </div>
  )
}
