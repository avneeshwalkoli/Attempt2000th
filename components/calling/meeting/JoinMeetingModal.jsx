import React, { useState, useEffect } from 'react';
import { X, LogIn } from 'lucide-react';

/**
 * JoinMeetingModal - Zoom-style join meeting modal
 */
export default function JoinMeetingModal({ onClose, onJoin }) {
  const [meetingId, setMeetingId] = useState('');
  const [userName, setUserName] = useState('');
  const [dontConnectAudio, setDontConnectAudio] = useState(false);
  const [turnOffVideo, setTurnOffVideo] = useState(false);
  const [error, setError] = useState('');

  // Get user name from localStorage
  useEffect(() => {
    try {
      const userProfile = localStorage.getItem('vd_user_profile');
      if (userProfile) {
        const user = JSON.parse(userProfile);
        setUserName(user.name || user.username || user.email?.split('@')[0] || '');
      }
    } catch (err) {
      console.error('Error loading user profile:', err);
    }
  }, []);

  const handleJoin = () => {
    if (!meetingId.trim()) {
      setError('Please enter a meeting ID');
      return;
    }
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }

    setError('');
    onJoin({
      meetingId: meetingId.trim(),
      userName: userName.trim(),
      dontConnectAudio,
      turnOffVideo,
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleJoin();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0B1120] border border-slate-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-50">Join a meeting</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-5">
          {/* Meeting ID input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Meeting ID or Personal Link
            </label>
            <input
              type="text"
              value={meetingId}
              onChange={(e) => {
                setMeetingId(e.target.value);
                setError('');
              }}
              onKeyPress={handleKeyPress}
              placeholder="Enter meeting ID"
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
              autoFocus
            />
          </div>

          {/* User name input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Your name
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value);
                setError('');
              }}
              onKeyPress={handleKeyPress}
              placeholder="Enter your name"
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={dontConnectAudio}
                onChange={(e) => setDontConnectAudio(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors">
                Don't connect to audio
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={turnOffVideo}
                onChange={(e) => setTurnOffVideo(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors">
                Turn off my video
              </span>
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-800 px-4 py-2">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800 bg-slate-900/50 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-transparent px-5 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2 focus:ring-offset-[#0B1120]"
          >
            Cancel
          </button>
          <button
            onClick={handleJoin}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#0B1120]"
          >
            <LogIn className="h-4 w-4" />
            <span>Join</span>
          </button>
        </div>
      </div>
    </div>
  );
}

