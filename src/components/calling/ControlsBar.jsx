/**
 * ControlsBar - Bottom control bar with all meeting controls
 */

import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Users,
  MessageSquare,
  Smile,
  Settings,
  Info,
  MoreVertical,
} from 'lucide-react';

export default function ControlsBar({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  onToggleAudio,
  onToggleVideo,
  onScreenShare,
  onLeave,
  onEndMeeting,
  participantCount,
  roomId,
  isHost = false,
  onToggleChat,
}) {
  return (
    <div className="border-t border-slate-800 bg-[#1E293B] px-6 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Left side - Meeting info */}
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-400">
            Meeting ID: <span className="font-mono text-white">{roomId}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Users className="h-4 w-4" />
            <span>{participantCount}</span>
          </div>
        </div>

        {/* Center - Main controls */}
        <div className="flex items-center gap-2">
          {/* Audio Toggle */}
          <button
            onClick={onToggleAudio}
            className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
              isAudioEnabled
                ? 'bg-slate-700 text-white hover:bg-slate-600'
                : 'bg-red-600 text-white hover:bg-red-500'
            }`}
            title={isAudioEnabled ? 'Mute' : 'Unmute'}
          >
            {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          {/* Video Toggle */}
          <button
            onClick={onToggleVideo}
            className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
              isVideoEnabled
                ? 'bg-slate-700 text-white hover:bg-slate-600'
                : 'bg-red-600 text-white hover:bg-red-500'
            }`}
            title={isVideoEnabled ? 'Turn off video' : 'Turn on video'}
          >
            {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>

          {/* Participants */}
          <button
            className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
            title="Participants"
          >
            <Users className="h-5 w-5" />
          </button>

          {/* Chat */}
          <button
            onClick={onToggleChat}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
            title="Chat"
          >
            <MessageSquare className="h-5 w-5" />
          </button>

          {/* Reactions */}
          <button
            className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
            title="Reactions"
          >
            <Smile className="h-5 w-5" />
          </button>

          {/* Share Screen */}
          <button
            onClick={onScreenShare}
            className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
              isScreenSharing
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-slate-700 text-white hover:bg-slate-600'
            }`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            <Monitor className="h-5 w-5" />
          </button>

          {/* Host Tools (only for host) */}
          {isHost && (
            <button
              className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
              title="Host Tools"
            >
              <Settings className="h-5 w-5" />
            </button>
          )}

          {/* Meeting Info */}
          <button
            className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
            title="Meeting Info"
          >
            <Info className="h-5 w-5" />
          </button>

          {/* More */}
          <button
            className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
            title="More"
          >
            <MoreVertical className="h-5 w-5" />
          </button>

          {/* End Meeting - Red button */}
          <button
            onClick={isHost && onEndMeeting ? onEndMeeting : onLeave}
            className="ml-4 flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-medium px-6 py-2 rounded-full transition-colors"
            title={isHost ? 'End meeting for everyone' : 'Leave meeting'}
          >
            <PhoneOff className="h-5 w-5" />
            <span>{isHost ? 'End Meeting' : 'Leave'}</span>
          </button>
        </div>

        {/* Right side - Empty for now */}
        <div className="w-32"></div>
      </div>
    </div>
  );
}
