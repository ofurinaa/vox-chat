'use client'

interface CallNotificationProps {
  callId: string
  callerName: string
  callType: 'audio' | 'video'
  onAccept: () => void
  onDecline: () => void
}

export default function CallNotification({ callId, callerName, callType, onAccept, onDecline }: CallNotificationProps) {
  return (
    <div className="fixed top-20 right-4 z-50 animate-slide-in-right">
      <div className="bg-gray-900 rounded-2xl p-4 w-80 border border-white/10 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-2xl">
            {callType === 'video' ? '📹' : '🎙️'}
          </div>
          <div>
            <p className="text-white font-semibold">Incoming {callType} call</p>
            <p className="text-sm text-white/50">from {callerName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition"
          >
            Accept
          </button>
          <button
            onClick={onDecline}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}
