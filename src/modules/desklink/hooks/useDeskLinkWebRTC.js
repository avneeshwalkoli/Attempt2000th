import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://anydesk.onrender.com';

/**
 * DeskLink WebRTC Hook for Remote Desktop Sessions
 * Handles peer connection, datachannel, and signaling
 */
export function useDeskLinkWebRTC() {
  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');
  const [remoteStream, setRemoteStream] = useState(null);
  const [stats, setStats] = useState({ bitrate: 0, rtt: 0, fps: 0, packetsLost: 0 });

  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const socketRef = useRef(null);
  const sessionRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const onDataMessageRef = useRef(null);
  const onConnectedRef = useRef(null);
  const onDisconnectedRef = useRef(null);

  /**
   * Initialize RTCPeerConnection with STUN/TURN config
   */
  const createPeerConnection = useCallback(async (iceServers) => {
    // FIX: Don't kill existing connection, reuse it
    if (pcRef.current) {
      console.warn('[WebRTC] PeerConnection already exists, reusing existing one');
      return pcRef.current;
    }

    const config = {
      iceServers: iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    };

    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      console.log('[WebRTC] Connection state:', pc.connectionState);

      if (pc.connectionState === 'connected') {
        onConnectedRef.current?.(remoteStream);
        startStatsCollection();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        onDisconnectedRef.current?.();
        stopStatsCollection();
      }
    };

    pc.oniceconnectionstatechange = () => {
      setIceConnectionState(pc.iceConnectionState);
      console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind);
      const [stream] = event.streams;
      setRemoteStream(stream);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && sessionRef.current) {
        const { sessionId, token, localDeviceId, remoteDeviceId, localUserId } = sessionRef.current;
        socketRef.current.emit('webrtc-ice', {
          sessionId,
          fromUserId: localUserId,
          fromDeviceId: localDeviceId,
          toDeviceId: remoteDeviceId,
          candidate: event.candidate,
          token,
        });
      }
    };

    // Create reliable datachannel for control messages
    const dc = pc.createDataChannel('desklink-control', {
      ordered: true,
      maxRetransmits: 3,
    });

    dc.onopen = () => {
      console.log('[DataChannel] Opened');
    };

    dc.onclose = () => {
      console.log('[DataChannel] Closed');
    };

    dc.onmessage = (event) => {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        onDataMessageRef.current?.(message);
      } catch (err) {
        console.error('[DataChannel] Parse error:', err);
      }
    };

    dataChannelRef.current = dc;

    // Handle incoming datachannel (receiver side)
    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dataChannelRef.current = dc;

      dc.onmessage = (event) => {
        try {
          const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          onDataMessageRef.current?.(message);
        } catch (err) {
          console.error('[DataChannel] Parse error:', err);
        }
      };
    };

    return pc;
  }, []);

  /**
   * Start as caller (controller)
   */
  const startAsCaller = useCallback(async ({ sessionId, token, localUserId, localDeviceId, remoteDeviceId, iceServers }) => {
    try {
      // FIX: Guard against double-start
      if (pcRef.current || socketRef.current) {
        console.log('[WebRTC] Caller already started, skipping');
        return;
      }

      console.log('[WebRTC] Starting as caller');

      sessionRef.current = { sessionId, token, localUserId, localDeviceId, remoteDeviceId, role: 'caller' };

      // Connect socket
     const socket = io(SOCKET_URL, {
  auth: { token },
  transports: ['websocket'],
});
socketRef.current = socket;

// 🔑 register this socket with the deviceId so it can receive webrtc-answer / webrtc-ice
socket.on('connect', () => {
  console.log('[WebRTC] socket connected', socket.id);
  if (localDeviceId) {
    socket.emit('register', { deviceId: localDeviceId });
    console.log('[WebRTC] register emitted for device', localDeviceId);
  }
});


      // Create peer connection
      const pc = await createPeerConnection(iceServers);

      // Listen for answer
      socket.on('webrtc-answer', async ({ sdp }) => {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
          console.log('[WebRTC] Remote description set (answer)');
        } catch (err) {
          console.error('[WebRTC] Error setting remote description:', err);
        }
      });

      // Listen for ICE candidates
      socket.on('webrtc-ice', async ({ candidate }) => {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      });

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false,
      });
      await pc.setLocalDescription(offer);

      socket.emit('webrtc-offer', {
        sessionId,
        fromUserId: localUserId,
        fromDeviceId: localDeviceId,
        toDeviceId: remoteDeviceId,
        sdp: offer.sdp,
        token,
      });

      console.log('[WebRTC] Offer sent');
    } catch (err) {
      console.error('[WebRTC] Error starting as caller:', err);
      throw err;
    }
  }, [createPeerConnection]);

  /**
   * Handle incoming offer (receiver/host)
   */
  const handleOffer = useCallback(async ({ sessionId, token, localUserId, localDeviceId, remoteDeviceId, sdp, iceServers }) => {
    try {
      // FIX: Guard against double-start
      if (pcRef.current || socketRef.current) {
        console.log('[WebRTC] Receiver already started, skipping');
        return;
      }

      console.log('[WebRTC] Handling offer');

      sessionRef.current = { sessionId, token, localUserId, localDeviceId, remoteDeviceId, role: 'receiver' };

      // Connect socket
      const socket = io(SOCKET_URL, {
  auth: { token },
  transports: ['websocket'],
});
socketRef.current = socket;

socket.on('connect', () => {
  console.log('[WebRTC] (receiver) socket connected', socket.id);
  if (localDeviceId) {
    socket.emit('register', { deviceId: localDeviceId });
    console.log('[WebRTC] (receiver) register emitted for device', localDeviceId);
  }
});


      // Create peer connection
      const pc = await createPeerConnection(iceServers);

      // Listen for ICE candidates
      socket.on('webrtc-ice', async ({ candidate }) => {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      });

      // Set remote description and create answer
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc-answer', {
        sessionId,
        fromUserId: localUserId,
        fromDeviceId: localDeviceId,
        toDeviceId: remoteDeviceId,
        sdp: answer.sdp,
        token,
      });

      console.log('[WebRTC] Answer sent');
    } catch (err) {
      console.error('[WebRTC] Error handling offer:', err);
      throw err;
    }
  }, [createPeerConnection]);

  /**
   * Add ICE candidate
   */
  const addIceCandidate = useCallback(async (candidate) => {
    try {
      if (pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error('[WebRTC] Error adding ICE candidate:', err);
    }
  }, []);

  /**
   * Send control message via datachannel
   */
  const sendControlMessage = useCallback((message) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      dataChannelRef.current.send(payload);
    } else {
      console.warn('[DataChannel] Not open, cannot send message');
    }
  }, []);

  /**
   * Stop session
   */
  const stopSession = useCallback(() => {
    console.log('[WebRTC] Stopping session');

    stopStatsCollection();

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (socketRef.current) {
      if (sessionRef.current) {
        socketRef.current.emit('webrtc-cancel', {
          sessionId: sessionRef.current.sessionId,
          fromUserId: sessionRef.current.localUserId,
        });
      }
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setRemoteStream(null);
    setConnectionState('closed');
    sessionRef.current = null;
  }, []);

  /**
   * Start collecting WebRTC stats
   */
  const startStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) return;

    statsIntervalRef.current = setInterval(async () => {
      if (!pcRef.current) return;

      try {
        const stats = await pcRef.current.getStats();
        let bitrate = 0;
        let rtt = 0;
        let fps = 0;
        let packetsLost = 0;

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            bitrate = Math.round((report.bytesReceived * 8) / 1000);
            packetsLost = report.packetsLost || 0;
            fps = report.framesPerSecond || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : 0;
          }
        });

        setStats({ bitrate, rtt, fps, packetsLost });
      } catch (err) {
        console.error('[Stats] Error collecting stats:', err);
      }
    }, 1000);
  }, []);

  /**
   * Stop collecting stats
   */
  const stopStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  return {
    connectionState,
    iceConnectionState,
    remoteStream,
    stats,
    startAsCaller,
    handleOffer,
    addIceCandidate,
    sendControlMessage,
    stopSession,
    setOnDataMessage: (callback) => {
      onDataMessageRef.current = callback;
    },
    setOnConnected: (callback) => {
      onConnectedRef.current = callback;
    },
    setOnDisconnected: (callback) => {
      onDisconnectedRef.current = callback;
    },
  };
}