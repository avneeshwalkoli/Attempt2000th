import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, Video, VideoOff, Settings, Play } from 'lucide-react';
import { WebRTCManager } from '../calling.webrtc.js';

/**
 * NewMeetingPreview - Zoom-style preview modal before starting a meeting
 */
export default function NewMeetingPreview({ onClose, onStart }) {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showVideoSettings, setShowVideoSettings] = useState(false);
  const videoRef = useRef(null);
  const webrtcManagerRef = useRef(null);

  // Initialize WebRTC manager and get devices
  useEffect(() => {
    const init = async () => {
      try {
        webrtcManagerRef.current = new WebRTCManager();
        
        // First, get user media to enable device enumeration (requires permission)
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (err) {
          console.warn('Could not get initial media permission:', err);
        }
        
        // Get available devices
        const [audioInputs, videoInputs] = await Promise.all([
          webrtcManagerRef.current.getAudioInputDevices(),
          webrtcManagerRef.current.getVideoInputDevices(),
        ]);

        setAudioDevices(audioInputs);
        setVideoDevices(videoInputs);

        let selectedAudio = '';
        let selectedVideo = '';

        if (audioInputs.length > 0) {
          selectedAudio = audioInputs[0].deviceId;
          setSelectedAudioDevice(selectedAudio);
        }
        if (videoInputs.length > 0) {
          selectedVideo = videoInputs[0].deviceId;
          setSelectedVideoDevice(selectedVideo);
        }

        // Initialize local stream with selected devices
        const constraints = {
          audio: isAudioEnabled ? (selectedAudio ? { deviceId: { exact: selectedAudio } } : true) : false,
          video: isVideoEnabled ? (selectedVideo ? { deviceId: { exact: selectedVideo }, width: 1280, height: 720 } : { width: 1280, height: 720 }) : false,
        };
        
        const stream = await webrtcManagerRef.current.initializeLocalStream(constraints);
        setLocalStream(stream);
      } catch (error) {
        console.error('Error initializing preview:', error);
      }
    };

    init();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.cleanup();
      }
    };
  }, []);

  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const toggleAudio = async () => {
    const newState = !isAudioEnabled;
    setIsAudioEnabled(newState);
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.toggleAudio(newState);
    }
  };

  const toggleVideo = async () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    if (webrtcManagerRef.current) {
      await webrtcManagerRef.current.toggleVideo(newState);
      if (newState && !localStream) {
        const constraints = {
          audio: isAudioEnabled ? (selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true) : false,
          video: selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice }, width: 1280, height: 720 } : { width: 1280, height: 720 },
        };
        const stream = await webrtcManagerRef.current.initializeLocalStream(constraints);
        setLocalStream(stream);
      }
    }
  };

  // Handle device change
  const handleAudioDeviceChange = async (deviceId) => {
    setSelectedAudioDevice(deviceId);
    if (webrtcManagerRef.current && localStream && isAudioEnabled) {
      try {
        // Stop old audio track
        localStream.getAudioTracks().forEach(track => track.stop());
        
        // Get new audio track
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        const newAudioTrack = newStream.getAudioTracks()[0];
        
        // Replace track in local stream
        localStream.addTrack(newAudioTrack);
        
        // Update WebRTC manager
        webrtcManagerRef.current.localStream = localStream;
      } catch (error) {
        console.error('Error switching audio device:', error);
      }
    }
  };

  const handleVideoDeviceChange = async (deviceId) => {
    setSelectedVideoDevice(deviceId);
    if (webrtcManagerRef.current && localStream && isVideoEnabled) {
      try {
        // Stop old video track
        localStream.getVideoTracks().forEach(track => track.stop());
        
        // Get new video track
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: 1280, height: 720 },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Replace track in local stream
        localStream.addTrack(newVideoTrack);
        
        // Update WebRTC manager
        webrtcManagerRef.current.localStream = localStream;
      } catch (error) {
        console.error('Error switching video device:', error);
      }
    }
  };

  const handleStart = () => {
    onStart({
      webrtcManager: webrtcManagerRef.current,
      localStream,
      isAudioEnabled,
      isVideoEnabled,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl rounded-2xl bg-[#0B1120] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-50">Start a new meeting</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preview area */}
        <div className="relative aspect-video bg-slate-900">
          {isVideoEnabled && localStream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-700">
                  <span className="text-2xl font-semibold text-slate-300">You</span>
                </div>
                <p className="text-sm text-slate-400">Camera is off</p>
              </div>
            </div>
          )}

          {/* Preview overlay info */}
          <div className="absolute top-4 left-4 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <p className="text-xs font-medium text-white">Preview</p>
          </div>
        </div>

        {/* Controls */}
        <div className="border-t border-slate-800 bg-slate-900/50 px-6 py-6">
          <div className="flex items-center justify-center gap-4">
            {/* Audio toggle */}
            <div className="relative">
              <button
                onClick={toggleAudio}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                  isAudioEnabled
                    ? 'bg-slate-700 text-white hover:bg-slate-600'
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
                onClick={() => setShowAudioSettings(!showAudioSettings)}
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-white hover:bg-slate-500"
                title="Audio settings"
              >
                <Settings className="h-3 w-3" />
              </button>
              {showAudioSettings && (
                <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg bg-slate-800 border border-slate-700 p-3 shadow-xl">
                  <label className="mb-2 block text-xs font-medium text-slate-300">
                    Microphone
                  </label>
                  <select
                    value={selectedAudioDevice}
                    onChange={(e) => handleAudioDeviceChange(e.target.value)}
                    className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    {audioDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Video toggle */}
            <div className="relative">
              <button
                onClick={toggleVideo}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                  isVideoEnabled
                    ? 'bg-slate-700 text-white hover:bg-slate-600'
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
                onClick={() => setShowVideoSettings(!showVideoSettings)}
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-white hover:bg-slate-500"
                title="Camera settings"
              >
                <Settings className="h-3 w-3" />
              </button>
              {showVideoSettings && (
                <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg bg-slate-800 border border-slate-700 p-3 shadow-xl">
                  <label className="mb-2 block text-xs font-medium text-slate-300">
                    Camera
                  </label>
                  <select
                    value={selectedVideoDevice}
                    onChange={(e) => handleVideoDeviceChange(e.target.value)}
                    className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    {videoDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Start button */}
            <button
              onClick={handleStart}
              className="ml-4 flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#0B1120]"
            >
              <Play className="h-5 w-5" />
              <span>Start</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

