/**
 * JoinMeeting - Modal for joining an existing meeting with room ID
 */

import React, { useState, useEffect } from 'react';
import { X, LogIn } from 'lucide-react';

export default function JoinMeeting({ onClose, onJoin }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1120]">
      <div className="relative w-full max-w-md mx-4 bg-[#1E293B] rounded-lg shadow-2xl border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Join a meeting</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-5">
          {/* Meeting ID input */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
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
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              autoFocus
            />
          </div>

          {/* User name input */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
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
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={dontConnectAudio}
                onChange={(e) => setDontConnectAudio(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                Don't connect to audio
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={turnOffVideo}
                onChange={(e) => setTurnOffVideo(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
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
        <div className="flex items-center justify-end gap-3 border-t border-slate-700 bg-slate-800/50 px-6 py-4">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-slate-700 bg-transparent text-slate-300 font-medium hover:bg-slate-700 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleJoin}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            <span>Join</span>
          </button>
        </div>
      </div>
    </div>
  );
}

