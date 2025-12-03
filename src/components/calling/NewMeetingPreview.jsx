/**
 * NewMeetingPreview - Zoom-style preview modal before starting a meeting
 * Matches Zoom's "Preview Before Joining" interface
 */

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Settings, Play, X } from 'lucide-react';

export default function NewMeetingPreview({ onClose, onStart }) {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [showAudioDropdown, setShowAudioDropdown] = useState(false);
  const [showVideoDropdown, setShowVideoDropdown] = useState(false);
  const videoRef = useRef(null);

  // Initialize media stream and get devices
  useEffect(() => {
    const init = async () => {
      try {
        // Request permission first
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        // Get available devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');

        setAudioDevices(audioInputs);
        setVideoDevices(videoInputs);

        if (audioInputs.length > 0) {
          setSelectedAudioDevice(audioInputs[0].deviceId);
        }
        if (videoInputs.length > 0) {
          setSelectedVideoDevice(videoInputs[0].deviceId);
        }

        // Update stream with selected devices
        stream.getTracks().forEach((track) => track.stop());
        await updateStream();
      } catch (error) {
        console.error('Error initializing preview:', error);
      }
    };

    init();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Update stream with selected devices
  const updateStream = async () => {
    try {
      const constraints = {
        audio: isAudioEnabled
          ? selectedAudioDevice
            ? { deviceId: { exact: selectedAudioDevice } }
            : true
          : false,
        video: isVideoEnabled
          ? selectedVideoDevice
            ? { deviceId: { exact: selectedVideoDevice }, width: 1280, height: 720 }
            : { width: 1280, height: 720 }
          : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
    } catch (error) {
      console.error('Error updating stream:', error);
    }
  };

  const toggleAudio = async () => {
    const newState = !isAudioEnabled;
    setIsAudioEnabled(newState);
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = newState;
      });
    } else if (newState) {
      await updateStream();
    }
  };

  const toggleVideo = async () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = newState;
      });
    } else if (newState) {
      await updateStream();
    }
  };

  const handleAudioDeviceChange = async (deviceId) => {
    setSelectedAudioDevice(deviceId);
    setShowAudioDropdown(false);
    await updateStream();
  };

  const handleVideoDeviceChange = async (deviceId) => {
    setSelectedVideoDevice(deviceId);
    setShowVideoDropdown(false);
    await updateStream();
  };

  const handleStart = () => {
    if (localStream) {
      onStart({
        localStream,
        isAudioEnabled,
        isVideoEnabled,
        selectedAudioDevice,
        selectedVideoDevice,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1120]">
      <div className="relative w-full max-w-5xl mx-4 bg-[#1E293B] rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Start a new meeting</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preview Area - Large gray background */}
        <div className="relative bg-[#0F172A] aspect-video flex items-center justify-center">
          {isVideoEnabled && localStream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-4">
              {/* Locked preview icon (Zoom-style) */}
              <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <p className="text-slate-400 text-sm">Camera is off</p>
            </div>
          )}
        </div>

        {/* Controls Section */}
        <div className="px-6 py-6 bg-[#1E293B]">
          <div className="flex items-center justify-center gap-6">
            {/* Audio Toggle Button */}
            <div className="relative">
              <button
                onClick={toggleAudio}
                className={`flex items-center justify-center w-14 h-14 rounded-full transition-all ${
                  isAudioEnabled
                    ? 'bg-slate-600 text-white hover:bg-slate-500'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
                title={isAudioEnabled ? 'Mute' : 'Unmute'}
              >
                {isAudioEnabled ? (
                  <Mic className="h-6 w-6" />
                ) : (
                  <MicOff className="h-6 w-6" />
                )}
              </button>
              <button
                onClick={() => {
                  setShowAudioDropdown(!showAudioDropdown);
                  setShowVideoDropdown(false);
                }}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-500 flex items-center justify-center hover:bg-slate-400 transition-colors"
                title="Audio settings"
              >
                <Settings className="h-3 w-3 text-white" />
              </button>
              {showAudioDropdown && (
                <div className="absolute bottom-full right-0 mb-2 w-64 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-10">
                  <div className="p-3">
                    <label className="block text-xs font-medium text-slate-300 mb-2">
                      Microphone
                    </label>
                    <select
                      value={selectedAudioDevice}
                      onChange={(e) => handleAudioDeviceChange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {audioDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Video Toggle Button */}
            <div className="relative">
              <button
                onClick={toggleVideo}
                className={`flex items-center justify-center w-14 h-14 rounded-full transition-all ${
                  isVideoEnabled
                    ? 'bg-slate-600 text-white hover:bg-slate-500'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
                title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {isVideoEnabled ? (
                  <Video className="h-6 w-6" />
                ) : (
                  <VideoOff className="h-6 w-6" />
                )}
              </button>
              <button
                onClick={() => {
                  setShowVideoDropdown(!showVideoDropdown);
                  setShowAudioDropdown(false);
                }}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-500 flex items-center justify-center hover:bg-slate-400 transition-colors"
                title="Camera settings"
              >
                <Settings className="h-3 w-3 text-white" />
              </button>
              {showVideoDropdown && (
                <div className="absolute bottom-full right-0 mb-2 w-64 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-10">
                  <div className="p-3">
                    <label className="block text-xs font-medium text-slate-300 mb-2">
                      Camera
                    </label>
                    <select
                      value={selectedVideoDevice}
                      onChange={(e) => handleVideoDeviceChange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {videoDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Start Meeting Button - Large, bottom-right style */}
            <button
              onClick={handleStart}
              className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-8 py-3 rounded-full transition-colors shadow-lg"
            >
              <Play className="h-5 w-5" />
              <span>Start Meeting</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

