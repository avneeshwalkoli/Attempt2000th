/**
 * useMeeting Hook - WebRTC Mesh Architecture
 * Handles peer connections, media streams, and room management
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// Simple signaling server simulation (replace with real WebSocket server)
const SIGNALING_SERVER = import.meta.env.VITE_SOCKET_URL || 'https://anydesk.onrender.com';

export function useMeeting(roomId, userId, isHost = false, externalStream = null, initialAudio = true, initialVideo = true) {
  const [localStream, setLocalStream] = useState(externalStream);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [participants, setParticipants] = useState([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(initialAudio);
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareStream, setScreenShareStream] = useState(null);

  const peersRef = useRef(new Map()); // Map<userId, RTCPeerConnection>
  const localStreamRef = useRef(externalStream);
  const screenShareStreamRef = useRef(null);
  const wsRef = useRef(null);

  // Update local stream ref when external stream changes
  useEffect(() => {
    if (externalStream) {
      localStreamRef.current = externalStream;
      setLocalStream(externalStream);
    }
  }, [externalStream]);
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // Initialize local media stream
  const initializeLocalStream = useCallback(async (constraints = {}) => {
    try {
      const defaultConstraints = {
        audio: isAudioEnabled,
        video: isVideoEnabled ? { width: 1280, height: 720 } : false,
        ...constraints,
      };

      const stream = await navigator.mediaDevices.getUserMedia(defaultConstraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }, [isAudioEnabled, isVideoEnabled]);

  // Create peer connection
  const createPeerConnection = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection(iceServers);

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.set(targetUserId, remoteStream);
        return newMap;
      });
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          roomId,
          from: userId,
          to: targetUserId,
          candidate: event.candidate,
        }));
      }
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.delete(targetUserId);
          return newMap;
        });
        setParticipants((prev) => prev.filter((p) => p.id !== targetUserId));
        peersRef.current.delete(targetUserId);
      }
    };

    peersRef.current.set(targetUserId, pc);
    return pc;
  }, [roomId, userId]);

  // Connect to signaling server (WebSocket simulation)
  const connectSignaling = useCallback(() => {
    // For now, we'll simulate signaling with localStorage events
    // In production, replace with real WebSocket server
    const handleStorageChange = (e) => {
      if (e.key?.startsWith(`signal_${roomId}_`)) {
        const message = JSON.parse(e.newValue);
        handleSignalingMessage(message);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Simulate receiving messages
    const interval = setInterval(() => {
      const messages = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`signal_${roomId}_${userId}_`)) {
          const message = JSON.parse(localStorage.getItem(key));
          messages.push(message);
          localStorage.removeItem(key);
        }
      }
      messages.forEach(handleSignalingMessage);
    }, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [roomId, userId]);

  // Handle signaling messages
  const handleSignalingMessage = useCallback(async (message) => {
    if (message.to !== userId) return;

    switch (message.type) {
      case 'offer':
        await handleOffer(message);
        break;
      case 'answer':
        await handleAnswer(message);
        break;
      case 'ice-candidate':
        await handleIceCandidate(message);
        break;
      case 'user-joined':
        await handleUserJoined(message);
        break;
      case 'user-left':
        handleUserLeft(message);
        break;
    }
  }, [userId]);

  // Handle offer
  const handleOffer = useCallback(async (message) => {
    const pc = createPeerConnection(message.from);
    await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send answer (simulate via localStorage)
    const answerKey = `signal_${roomId}_${message.from}_answer_${Date.now()}`;
    localStorage.setItem(answerKey, JSON.stringify({
      type: 'answer',
      roomId,
      from: userId,
      to: message.from,
      answer,
    }));
    localStorage.removeItem(answerKey);
  }, [roomId, userId, createPeerConnection]);

  // Handle answer
  const handleAnswer = useCallback(async (message) => {
    const pc = peersRef.current.get(message.from);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
    }
  }, []);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (message) => {
    const pc = peersRef.current.get(message.from);
    if (pc && message.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  }, []);

  // Handle user joined
  const handleUserJoined = useCallback(async (message) => {
    if (message.userId === userId) return;

    setParticipants((prev) => {
      if (prev.find((p) => p.id === message.userId)) return prev;
      return [...prev, { id: message.userId, name: message.userName }];
    });

    // Create offer
    const pc = createPeerConnection(message.userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Send offer (simulate via localStorage)
    const offerKey = `signal_${roomId}_${message.userId}_offer_${Date.now()}`;
    localStorage.setItem(offerKey, JSON.stringify({
      type: 'offer',
      roomId,
      from: userId,
      to: message.userId,
      offer,
    }));
    localStorage.removeItem(offerKey);
  }, [userId, roomId, createPeerConnection]);

  // Handle user left
  const handleUserLeft = useCallback((message) => {
    const pc = peersRef.current.get(message.userId);
    if (pc) {
      pc.close();
      peersRef.current.delete(message.userId);
    }
    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.delete(message.userId);
      return newMap;
    });
    setParticipants((prev) => prev.filter((p) => p.id !== message.userId));
  }, []);

  // Toggle audio
  const toggleAudio = useCallback((enabled) => {
    setIsAudioEnabled(enabled);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(async (enabled) => {
    setIsVideoEnabled(enabled);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    } else if (enabled) {
      // Get new video track if stream doesn't exist
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const videoTrack = stream.getVideoTracks()[0];
      if (localStreamRef.current) {
        localStreamRef.current.addTrack(videoTrack);
      } else {
        localStreamRef.current = stream;
        setLocalStream(stream);
      }
      // Replace track in all peer connections
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });
    }
  }, []);

  // Start screen share
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const videoTrack = stream.getVideoTracks()[0];
      screenShareStreamRef.current = stream;
      setScreenShareStream(stream);
      setIsScreenSharing(true);

      // Replace video track in all peer connections
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      // Handle screen share end
      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Error starting screen share:', error);
      throw error;
    }
  }, []);

  // Stop screen share
  const stopScreenShare = useCallback(async () => {
    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach((track) => track.stop());
      screenShareStreamRef.current = null;
      setScreenShareStream(null);
      setIsScreenSharing(false);

      // Restore camera track
      if (isVideoEnabled && localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = stream.getVideoTracks()[0];
        if (localStreamRef.current) {
          localStreamRef.current.addTrack(videoTrack);
        }
        peersRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        });
      }
    }
  }, [isVideoEnabled]);

  // Join room
  const joinRoom = useCallback(async (userName) => {
    // Initialize local stream
    await initializeLocalStream();

    // Notify others (simulate via localStorage)
    const joinKey = `signal_${roomId}_join_${Date.now()}`;
    localStorage.setItem(joinKey, JSON.stringify({
      type: 'user-joined',
      roomId,
      userId,
      userName,
    }));

    // Connect to signaling
    connectSignaling();
  }, [roomId, userId, initializeLocalStream, connectSignaling]);

  // Leave room
  const leaveRoom = useCallback(() => {
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close all peer connections
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    // Notify others
    const leaveKey = `signal_${roomId}_leave_${Date.now()}`;
    localStorage.setItem(leaveKey, JSON.stringify({
      type: 'user-left',
      roomId,
      userId,
    }));

    setLocalStream(null);
    setRemoteStreams(new Map());
    setParticipants([]);
  }, [roomId, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  return {
    localStream,
    remoteStreams,
    participants,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenShareStream,
    initializeLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    joinRoom,
    leaveRoom,
  };
}

