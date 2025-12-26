/**
 * useRoomClient - FIXED VERSION WITH PROPER ICE SERVER FETCHING
 * This version ensures TURN servers are loaded before creating peer connections
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export function useRoomClient(roomId, userId, userName, isHost = false, onLeave = null) {
  const [localStream, setLocalStream] = useState(null);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareUserId, setScreenShareUserId] = useState(null);
  const [screenShareStream, setScreenShareStream] = useState(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [meetingEndedBy, setMeetingEndedBy] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [hostMicLocked, setHostMicLocked] = useState(false);
  const [hostCameraLocked, setHostCameraLocked] = useState(false);
  const [hostChatDisabled, setHostChatDisabled] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [hostNotice, setHostNotice] = useState(null);

  const socketRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const screenShareUserIdRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const isInitializedRef = useRef(false);
  const signalingStatesRef = useRef(new Map());
  const pendingOffersRef = useRef(new Set());
  const meetingEndedRef = useRef(false);
  const connectionRetryCountRef = useRef(new Map());
  // Buffer incoming ICE candidates per peer until we have a remote description
  const pendingRemoteIceByPeerRef = useRef(new Map()); // Map<userId, RTCIceCandidateInit[]>
  
  // Store ICE servers in a ref so it's available synchronously
  const iceServersRef = useRef(null);
  const iceServersFetchedRef = useRef(false);

  // Fetch ICE servers immediately when hook is called
  useEffect(() => {
    const fetchIceServers = async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('vd_auth_token');
        // Use the same API base as DeskLink (local-first), override via VITE_API if needed.
        // NOTE: VITE_API already includes the `/api` prefix (e.g. http://localhost:5000/api),
        // so we append only `/remote/turn-token` here to avoid double `/api/api/...` bugs.
        const apiUrl = import.meta.env.VITE_API || 'http://localhost:5000/api';
        
        console.log('🔍 [ICE] Fetching ICE servers from backend...');
        console.log('🔍 [ICE] API URL:', apiUrl);
        console.log('🔍 [ICE] Has token:', !!token);
        
        const response = await fetch(`${apiUrl}/remote/turn-token`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        
        console.log('🔍 [ICE] Response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('🔍 [ICE] Response data:', data);
          
          if (data.iceServers && data.iceServers.length > 0) {
            console.log('✅ [ICE] Fetched', data.iceServers.length, 'ICE servers from backend');
            console.log('✅ [ICE] Servers:', JSON.stringify(data.iceServers, null, 2));
            iceServersRef.current = data.iceServers;
            iceServersFetchedRef.current = true;
            return;
          } else {
            console.warn('⚠️ [ICE] Backend returned empty iceServers array');
          }
        } else {
          console.warn('⚠️ [ICE] Backend fetch failed with status:', response.status);
          const text = await response.text();
          console.warn('⚠️ [ICE] Response body:', text);
        }
        
        console.warn('⚠️ [ICE] Using default TURN servers as fallback');
        iceServersRef.current = DEFAULT_ICE_SERVERS;
        iceServersFetchedRef.current = true;
      } catch (error) {
        console.error('❌ [ICE] Error fetching ICE servers:', error);
        console.error('❌ [ICE] Error details:', error.message, error.stack);
        console.warn('⚠️ [ICE] Using default TURN servers as fallback');
        iceServersRef.current = DEFAULT_ICE_SERVERS;
        iceServersFetchedRef.current = true;
      }
    };
    
    fetchIceServers();
  }, []);

  const leaveRoom = useCallback(() => {
    meetingEndedRef.current = true;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    remoteStreamsRef.current.forEach((streams) => {
      streams.videoStream.getTracks().forEach((t) => t.stop());
      streams.audioStream.getTracks().forEach((t) => t.stop());
    });
    remoteStreamsRef.current.clear();

    signalingStatesRef.current.clear();
    pendingOffersRef.current.clear();
    connectionRetryCountRef.current.clear();

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setLocalStream(null);
    setLocalScreenStream(null);
    setParticipants([]);
    setScreenShareStream(null);
    setIsScreenSharing(false);
  }, []);

  const handleMeetingEnded = useCallback(({ roomId: endedRoomId, endedBy, endedByName, message }) => {
    console.log(`Meeting ended by host ${endedByName || endedBy} in room ${endedRoomId}`);
    
    setMeetingEndedBy(endedByName || 'Host');
    setMeetingEnded(true);
    
    leaveRoom();
    
    if (onLeave) {
      setTimeout(() => {
        onLeave();
      }, 2000);
    }
  }, [leaveRoom, onLeave]);

  const createPeerConnection = useCallback(
    (targetUserId) => {
      if (meetingEndedRef.current) {
        return null;
      }

      if (targetUserId === userId) return null;

      // CRITICAL: Use the ref instead of state
      const iceServers = iceServersRef.current;
      
      if (!iceServers) {
        console.error('❌ [PEER] ICE servers not loaded yet!');
        console.error('❌ [PEER] iceServersFetchedRef.current:', iceServersFetchedRef.current);
        console.error('❌ [PEER] This should not happen - ICE servers should be fetched by now');
        // Use default as emergency fallback
        iceServersRef.current = DEFAULT_ICE_SERVERS;
        return null;
      }

      const existingPc = peerConnectionsRef.current.get(targetUserId);
      if (existingPc && existingPc.signalingState !== 'closed' && existingPc.connectionState !== 'closed') {
        return existingPc;
      }

      if (existingPc) {
        existingPc.close();
        peerConnectionsRef.current.delete(targetUserId);
        remoteStreamsRef.current.delete(targetUserId);
        signalingStatesRef.current.delete(targetUserId);
        pendingOffersRef.current.delete(targetUserId);
      }

      console.log(`🔧 [PEER] Creating peer connection to ${targetUserId} with ${iceServers.length} ICE servers`);
      console.log(`🔧 [PEER] ICE servers:`, iceServers.map(s => ({ 
        urls: s.urls, 
        hasCredentials: !!(s.username && s.credential) 
      })));

      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
      });
      
      signalingStatesRef.current.set(targetUserId, 'stable');

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          if (track.enabled) {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      }

      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localScreenStreamRef.current);
        });
      }

      pc.ontrack = (event) => {
        const track = event.track;
        const stream = event.streams[0];

        let remoteStreams = remoteStreamsRef.current.get(targetUserId);
        if (!remoteStreams) {
          remoteStreams = {
            videoStream: new MediaStream(),
            audioStream: new MediaStream(),
          };
          remoteStreamsRef.current.set(targetUserId, remoteStreams);
        }

        if (track.kind === 'video') {
          const settings = track.getSettings ? track.getSettings() : {};
          const isScreenShareTrack =
            screenShareUserIdRef.current === targetUserId ||
            settings.displaySurface === 'screen' ||
            settings.displaySurface === 'window' ||
            settings.displaySurface === 'browser';

          if (isScreenShareTrack) {
            const screenStream = stream || new MediaStream([track]);
            setScreenShareStream(screenStream);
            setScreenShareUserId(targetUserId);
            screenShareUserIdRef.current = targetUserId;
            setIsScreenSharing(true);
          } else {
            remoteStreams.videoStream.addTrack(track);
          }
        } else if (track.kind === 'audio') {
          remoteStreams.audioStream.addTrack(track);
        }

        setParticipants((prev) => {
          return prev.map((p) => {
            if (p.id === targetUserId) {
              return {
                ...p,
                videoStream: remoteStreams.videoStream,
                audioStream: remoteStreams.audioStream,
              };
            }
            return p;
          });
        });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const parts = event.candidate.candidate.split(' ');
          const type = parts[7];
          console.log(`📡 [ICE] Candidate [${type}] for ${targetUserId}:`, event.candidate.candidate);
          
          if (type === 'relay') {
            console.log('✅ [ICE] TURN RELAY CANDIDATE GENERATED - Cross-network will work!');
          } else if (type === 'srflx') {
            console.log('✅ [ICE] STUN reflexive candidate generated');
          } else if (type === 'host') {
            console.log('📡 [ICE] Host candidate (local network)');
          }
          
          if (socketRef.current) {
            socketRef.current.emit('ice-candidate', {
              roomId,
              to: targetUserId,
              candidate: event.candidate,
            });
          }
        } else {
          console.log(`✅ [ICE] ICE gathering complete for ${targetUserId}`);
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(`🔍 [ICE] ICE gathering state [${targetUserId}]: ${pc.iceGatheringState}`);
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`🔌 [ICE] ICE connection state [${targetUserId}]: ${pc.iceConnectionState}`);
        
        if (pc.iceConnectionState === 'connected') {
          console.log(`✅ [ICE] ICE CONNECTED to ${targetUserId}!`);
          connectionRetryCountRef.current.set(targetUserId, 0);
        }
        
        if (pc.iceConnectionState === 'failed') {
          console.error(`❌ [ICE] ICE connection FAILED for ${targetUserId}`);
          console.error(`❌ [ICE] Attempting ICE restart...`);
          pc.restartIce();
        }
        
        if (pc.iceConnectionState === 'checking') {
          console.log(`🔄 [ICE] Checking connectivity to ${targetUserId}...`);
        }
      };

      pc.onsignalingstatechange = () => {
        const state = pc.signalingState;
        signalingStatesRef.current.set(targetUserId, state);
        console.log(`📞 [SIGNAL] Signaling state for ${targetUserId}: ${state}`);
        
        if (state === 'stable') {
          pendingOffersRef.current.delete(targetUserId);
        }
        
        if (state === 'closed') {
          const streams = remoteStreamsRef.current.get(targetUserId);
          if (streams) {
            streams.videoStream.getTracks().forEach((t) => t.stop());
            streams.audioStream.getTracks().forEach((t) => t.stop());
          }
          remoteStreamsRef.current.delete(targetUserId);
          signalingStatesRef.current.delete(targetUserId);
          pendingOffersRef.current.delete(targetUserId);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`🌐 [PEER] Connection state [${targetUserId}]: ${pc.connectionState}`);
        
        if (pc.connectionState === 'connected') {
          console.log(`✅✅✅ [PEER] SUCCESSFULLY CONNECTED to ${targetUserId}!`);
          connectionRetryCountRef.current.set(targetUserId, 0);
        }
        
        if (pc.connectionState === 'failed') {
          console.error(`❌ [PEER] Connection FAILED to ${targetUserId}`);
          const retryCount = connectionRetryCountRef.current.get(targetUserId) || 0;
          
          if (retryCount < 3 && !meetingEndedRef.current) {
            console.warn(`⚠️ [PEER] Retrying connection (${retryCount + 1}/3)...`);
            connectionRetryCountRef.current.set(targetUserId, retryCount + 1);
            
            pc.close();
            peerConnectionsRef.current.delete(targetUserId);
            remoteStreamsRef.current.delete(targetUserId);
            signalingStatesRef.current.delete(targetUserId);
            pendingOffersRef.current.delete(targetUserId);
            
            setTimeout(() => {
              if (!meetingEndedRef.current && socketRef.current && iceServersRef.current) {
                console.log(`🔄 [PEER] Creating new connection attempt to ${targetUserId}...`);
                const newPc = createPeerConnection(targetUserId);
                if (newPc && newPc.signalingState === 'stable') {
                  pendingOffersRef.current.add(targetUserId);
                  newPc.createOffer()
                    .then(offer => newPc.setLocalDescription(offer))
                    .then(() => {
                      socketRef.current.emit('offer', {
                        roomId,
                        to: targetUserId,
                        offer: newPc.localDescription,
                      });
                    })
                    .catch(err => {
                      console.error('❌ [PEER] Retry offer failed:', err);
                      pendingOffersRef.current.delete(targetUserId);
                    });
                }
              }
            }, 2000 * (retryCount + 1));
          } else {
            console.error(`❌❌❌ [PEER] Connection PERMANENTLY FAILED after ${retryCount} retries`);
            console.error(`❌ [PEER] Possible reasons:`);
            console.error(`   1. Both users behind symmetric NATs`);
            console.error(`   2. TURN server not reachable`);
            console.error(`   3. Firewall blocking all WebRTC traffic`);
          }
          
          const streams = remoteStreamsRef.current.get(targetUserId);
          if (streams) {
            streams.videoStream.getTracks().forEach((t) => t.stop());
            streams.audioStream.getTracks().forEach((t) => t.stop());
          }
          remoteStreamsRef.current.delete(targetUserId);
          signalingStatesRef.current.delete(targetUserId);
          pendingOffersRef.current.delete(targetUserId);
        }
        
        if (pc.connectionState === 'connecting') {
          console.log(`🔄 [PEER] Connecting to ${targetUserId}...`);
        }
        
        if (pc.connectionState === 'disconnected') {
          console.warn(`⚠️ [PEER] Disconnected from ${targetUserId}`);
        }
      };

      peerConnectionsRef.current.set(targetUserId, pc);
      return pc;
    },
    [userId, roomId]
  );

  const initializeLocalStream = useCallback(
    async (constraints = {}) => {
      try {
        const defaultConstraints = {
          audio: isAudioEnabled,
          video: isVideoEnabled ? { width: 1280, height: 720 } : false,
          ...constraints,
        };

        const stream = await navigator.mediaDevices.getUserMedia(defaultConstraints);
        localStreamRef.current = stream;
        setLocalStream(stream);

        setParticipants((prev) => {
          const existing = prev.find((p) => p.id === userId);
          if (existing) {
            return prev.map((p) =>
              p.id === userId
                ? {
                    ...p,
                    videoStream: stream,
                    audioStream: stream,
                    isAudioEnabled,
                    isVideoEnabled,
                  }
                : p
            );
          }
          return [
            ...prev,
            {
              id: userId,
              name: userName,
              videoStream: stream,
              audioStream: stream,
              isAudioEnabled,
              isVideoEnabled,
              isLocal: true,
              isScreenSharing: false,
            },
          ];
        });

        peerConnectionsRef.current.forEach((pc, peerUserId) => {
          stream.getTracks().forEach((track) => {
            if (track.enabled) {
              const sender = pc.getSenders().find((s) => s.track && s.track.kind === track.kind);
              if (sender) {
                sender.replaceTrack(track);
              } else {
                pc.addTrack(track, stream);
              }
            }
          });
        });

        if (stream.getAudioTracks().length > 0) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
          audioAnalyserRef.current = audioContextRef.current.createAnalyser();
          const source = audioContextRef.current.createMediaStreamSource(stream);
          source.connect(audioAnalyserRef.current);
          audioAnalyserRef.current.fftSize = 256;
          detectActiveSpeaker();
        }

        isInitializedRef.current = true;
        return stream;
      } catch (error) {
        console.error('Error accessing media devices:', error);
        throw error;
      }
    },
    [userId, userName, isAudioEnabled, isVideoEnabled]
  );

  const detectActiveSpeaker = useCallback(() => {
    if (!audioAnalyserRef.current) return;

    const dataArray = new Uint8Array(audioAnalyserRef.current.frequencyBinCount);
    const checkAudio = () => {
      if (!audioAnalyserRef.current) return;
      audioAnalyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      if (average > 30) {
        setActiveSpeakerId(userId);
      }

      requestAnimationFrame(checkAudio);
    };
    checkAudio();
  }, [userId]);

  const handleRoomUsers = useCallback(
    async (users) => {
      if (meetingEndedRef.current) {
        return;
      }

      console.log('[ROOM] room-users payload:', users);
      
      // Wait for ICE servers if not loaded yet
      if (!iceServersRef.current && !iceServersFetchedRef.current) {
        console.warn('[ROOM] ICE servers not loaded yet, waiting...');
        // Wait up to 5 seconds for ICE servers
        for (let i = 0; i < 50; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (iceServersRef.current) {
            console.log('[ROOM] ICE servers loaded, proceeding...');
            break;
          }
        }
        if (!iceServersRef.current) {
          console.error('[ROOM] ICE servers still not loaded after 5s, using defaults');
          iceServersRef.current = DEFAULT_ICE_SERVERS;
        }
      }
      
      for (const user of users) {
        if (user.userId !== userId) {
          setParticipants((prev) => {
            if (prev.find((p) => p.id === user.userId)) return prev;
            return [
              ...prev,
              {
                id: user.userId,
                name: user.userName,
                videoStream: null,
                audioStream: null,
                isAudioEnabled: true,
                isVideoEnabled: true,
                isLocal: false,
                isScreenSharing: false,
                authUserId: user.authUserId || null,
              },
            ];
          });

          if (isInitializedRef.current && localStreamRef.current && iceServersRef.current) {
            if (pendingOffersRef.current.has(user.userId)) {
              console.log(`[ROOM] Already creating offer for ${user.userId}, skipping...`);
              continue;
            }

            const pc = createPeerConnection(user.userId);
            if (pc && pc.signalingState === 'stable') {
              pendingOffersRef.current.add(user.userId);
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                if (socketRef.current) {
                  socketRef.current.emit('offer', {
                    roomId,
                    to: user.userId,
                    offer,
                  });
                }
              } catch (error) {
                console.error(`[ROOM] Error creating offer for ${user.userId}:`, error);
                pendingOffersRef.current.delete(user.userId);
              }
            }
          }
        }
      }
    },
    [userId, roomId, createPeerConnection]
  );

  const handleUserJoined = useCallback(
    async ({ userId: newUserId, userName: newUserName, authUserId }) => {
      if (meetingEndedRef.current) {
        return;
      }

      if (newUserId === userId) return;

      console.log('[ROOM] user-joined payload:', {
        newUserId,
        newUserName,
        authUserId,
      });

      setParticipants((prev) => {
        if (prev.find((p) => p.id === newUserId)) return prev;
        return [
          ...prev,
          {
            id: newUserId,
            name: newUserName,
            videoStream: null,
            audioStream: null,
            isAudioEnabled: true,
            isVideoEnabled: true,
            isLocal: false,
            isScreenSharing: false,
            // authUserId comes from the backend (Mongo User._id as string) so that
            // in-meeting remote control can target this participant reliably.
            authUserId: authUserId || null,
          },
        ];
      });

      return;
    },
    [userId]
  );

  const handleUserLeft = useCallback(
    ({ userId: leftUserId }) => {
      console.log(`[ROOM] User left: ${leftUserId}`);

      const pc = peerConnectionsRef.current.get(leftUserId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(leftUserId);
      }

      const streams = remoteStreamsRef.current.get(leftUserId);
      if (streams) {
        streams.videoStream.getTracks().forEach((t) => t.stop());
        streams.audioStream.getTracks().forEach((t) => t.stop());
        remoteStreamsRef.current.delete(leftUserId);
      }

      setParticipants((prev) => prev.filter((p) => p.id !== leftUserId));

      if (screenShareUserId === leftUserId) {
        setScreenShareStream(null);
        setScreenShareUserId(null);
        setIsScreenSharing(false);
        screenShareUserIdRef.current = null;
      }
    },
    [screenShareUserId]
  );

  const renegotiateWithPeer = useCallback(
    async (targetUserId) => {
      const pc = peerConnectionsRef.current.get(targetUserId);
      if (!pc) return;
      if (meetingEndedRef.current) return;
      if (!socketRef.current) return;

      if (pc.signalingState !== 'stable') {
        console.log(`Skipping renegotiation with ${targetUserId} - signalingState=${pc.signalingState}`);
        return;
      }

      if (pendingOffersRef.current.has(targetUserId)) {
        console.log(`Renegotiation already in progress for ${targetUserId}, skipping`);
        return;
      }

      pendingOffersRef.current.add(targetUserId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socketRef.current.emit('offer', {
          roomId,
          to: targetUserId,
          offer,
        });
      } catch (error) {
        console.error(`Error renegotiating with ${targetUserId}:`, error);
        pendingOffersRef.current.delete(targetUserId);
      }
    },
    [roomId]
  );

  const renegotiateWithAllPeers = useCallback(async () => {
    const peerIds = Array.from(peerConnectionsRef.current.keys());
    for (const peerId of peerIds) {
      await renegotiateWithPeer(peerId);
    }
  }, [renegotiateWithPeer]);

  const handleOffer = useCallback(
    async ({ from, offer }) => {
      if (meetingEndedRef.current) {
        return;
      }

      console.log(`[SIGNAL] Received offer from ${from}`);
      
      // Wait for ICE servers if not loaded yet
      if (!iceServersRef.current) {
        console.warn('[SIGNAL] ICE servers not loaded, waiting...');
        for (let i = 0; i < 50; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (iceServersRef.current) break;
        }
        if (!iceServersRef.current) {
          console.error('[SIGNAL] ICE servers not loaded, using defaults');
          iceServersRef.current = DEFAULT_ICE_SERVERS;
        }
      }

      let pc = createPeerConnection(from);
      if (!pc) return;

      const currentState = pc.signalingState;
      if (currentState !== 'stable' && currentState !== 'have-local-offer') {
        console.warn(`[SIGNAL] Ignoring offer from ${from} - connection in ${currentState} state`);
        return;
      }

      try {
        if (currentState === 'have-local-offer') {
          console.log(`[SIGNAL] Rolling back local offer for ${from} to handle remote offer`);
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (rollbackError) {
            console.log(`[SIGNAL] Rollback failed, recreating connection to ${from}`);
            pc.close();
            peerConnectionsRef.current.delete(from);
            remoteStreamsRef.current.delete(from);
            signalingStatesRef.current.delete(from);
            pendingOffersRef.current.delete(from);
            
            pc = createPeerConnection(from);
            if (!pc) return;
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Apply any ICE candidates that arrived before the remote description
        const buffered = pendingRemoteIceByPeerRef.current.get(from);
        if (buffered && buffered.length > 0) {
          console.log('[SIGNAL] Applying buffered ICE candidates for', from);
          for (const c of buffered) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (err) {
              console.error('[ICE] Error applying buffered ICE:', err);
            }
          }
          pendingRemoteIceByPeerRef.current.delete(from);
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (socketRef.current) {
          socketRef.current.emit('answer', {
            roomId,
            to: from,
            answer,
          });
        }
      } catch (error) {
        console.error(`[SIGNAL] Error handling offer from ${from}:`, error);
        if (error.name === 'InvalidAccessError' || error.name === 'InvalidStateError') {
          console.log(`[SIGNAL] Recovering from error - recreating connection to ${from}`);
          pc.close();
          peerConnectionsRef.current.delete(from);
          remoteStreamsRef.current.delete(from);
          signalingStatesRef.current.delete(from);
          pendingOffersRef.current.delete(from);
          
          try {
            const newPc = createPeerConnection(from);
            if (newPc) {
              await newPc.setRemoteDescription(new RTCSessionDescription(offer));

              const buffered = pendingRemoteIceByPeerRef.current.get(from);
              if (buffered && buffered.length > 0) {
                console.log('[SIGNAL] Applying buffered ICE candidates for', from);
                for (const c of buffered) {
                  try {
                    await newPc.addIceCandidate(new RTCIceCandidate(c));
                  } catch (err) {
                    console.error('[ICE] Error applying buffered ICE:', err);
                  }
                }
                pendingRemoteIceByPeerRef.current.delete(from);
              }

              const answer = await newPc.createAnswer();
              await newPc.setLocalDescription(answer);
              
              if (socketRef.current) {
                socketRef.current.emit('answer', {
                  roomId,
                  to: from,
                  answer,
                });
              }
            }
          } catch (retryError) {
            console.error(`[SIGNAL] Failed to recover connection to ${from}:`, retryError);
          }
        }
      }
    },
    [roomId, createPeerConnection]
  );

  const handleAnswer = useCallback(async ({ from, answer }) => {
    if (meetingEndedRef.current) {
      return;
    }

    console.log(`[SIGNAL] Received answer from ${from}`);

    const pc = peerConnectionsRef.current.get(from);
    if (!pc) {
      console.warn(`[SIGNAL] No peer connection found for ${from}`);
      return;
    }

    const currentState = pc.signalingState;
    if (currentState !== 'have-local-offer') {
      console.warn(`[SIGNAL] Ignoring answer from ${from} - connection in ${currentState} state`);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));

      // Apply any buffered ICE candidates for this peer
      const buffered = pendingRemoteIceByPeerRef.current.get(from);
      if (buffered && buffered.length > 0) {
        console.log('[SIGNAL] Applying buffered ICE candidates for', from);
        for (const c of buffered) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch (err) {
            console.error('[ICE] Error applying buffered ICE:', err);
          }
        }
        pendingRemoteIceByPeerRef.current.delete(from);
      }
    } catch (error) {
      console.error(`[SIGNAL] Error handling answer from ${from}:`, error);
    }
  }, []);

  const handleIceCandidate = useCallback(async ({ from, candidate }) => {
    if (!candidate) return;

    const pc = peerConnectionsRef.current.get(from);
    if (!pc || pc.signalingState === 'closed') {
      return;
    }

    // If we don't yet have a remote description, buffer this candidate
    if (!pc.remoteDescription) {
      let list = pendingRemoteIceByPeerRef.current.get(from);
      if (!list) {
        list = [];
        pendingRemoteIceByPeerRef.current.set(from, list);
      }
      list.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[ICE] Error adding ICE candidate:', error);
    }
  }, []);

  const handleScreenShareStarted = useCallback(({ userId: sharerUserId }) => {
    setScreenShareUserId(sharerUserId);
    setIsScreenSharing(true);
    screenShareUserIdRef.current = sharerUserId;
  }, []);

  const handleScreenShareStopped = useCallback(() => {
    setScreenShareStream(null);
    setScreenShareUserId(null);
    setIsScreenSharing(false);
    screenShareUserIdRef.current = null;
  }, []);

  const handleAudioMute = useCallback(({ userId: mutedUserId }) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === mutedUserId ? { ...p, isAudioEnabled: false } : p
      )
    );
  }, []);

  const handleMeetingChatMessage = useCallback(
    ({ roomId: msgRoomId, userId: senderId, userName: senderName, text, ts }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;

      const trimmedText = String(text || '').trim();
      if (!trimmedText) return;

      const tsValue = ts || Date.now();

      setChatMessages((prev) => {
        const exists = prev.some(
          (m) =>
            m.roomId === msgRoomId &&
            m.userId === senderId &&
            m.ts === tsValue &&
            m.text === trimmedText
        );
        if (exists) return prev;

        return [
          ...prev,
          {
            roomId: msgRoomId,
            userId: senderId,
            userName: senderName || 'Participant',
            text: trimmedText,
            ts: tsValue,
          },
        ];
      });
    },
    [roomId]
  );

  const handleMeetingChatHistory = useCallback(
    ({ roomId: msgRoomId, messages }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;
      if (!Array.isArray(messages) || messages.length === 0) return;

      setChatMessages((prev) => {
        const combined = [...prev];
        const existingKeys = new Set(
          combined.map((m) => `${m.userId}-${m.ts}-${m.text}`)
        );

        messages.forEach((msg) => {
          if (!msg || !msg.text) return;
          const key = `${msg.userId}-${msg.ts}-${msg.text}`;
          if (existingKeys.has(key)) {
            return;
          }

          existingKeys.add(key);
          combined.push({
            roomId: msgRoomId,
            userId: msg.userId,
            userName: msg.userName || 'Participant',
            text: String(msg.text).trim(),
            ts: msg.ts || Date.now(),
          });
        });

        combined.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        return combined;
      });
    },
    [roomId]
  );

  const handleAudioUnmute = useCallback(({ userId: unmutedUserId }) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === unmutedUserId ? { ...p, isAudioEnabled: true } : p
      )
    );
  }, []);

  const handleVideoMute = useCallback(({ userId: mutedUserId }) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === mutedUserId ? { ...p, isVideoEnabled: false } : p
      )
    );
  }, []);

  const handleVideoUnmute = useCallback(({ userId: unmutedUserId }) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === unmutedUserId ? { ...p, isVideoEnabled: true } : p
      )
    );
  }, []);

  const handleHostPermissions = useCallback(
    ({ roomId: msgRoomId, micLocked, cameraLocked, chatDisabled }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;
      setHostMicLocked(!!micLocked);
      setHostCameraLocked(!!cameraLocked);
      setHostChatDisabled(!!chatDisabled);
    },
    [roomId]
  );

  const handleHostToggleMic = useCallback(
    ({ roomId: msgRoomId, micLocked, allowUnmute }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;
      const locked =
        typeof micLocked === 'boolean'
          ? micLocked
          : allowUnmute != null
          ? !allowUnmute
          : false;
      setHostMicLocked(locked);
    },
    [roomId]
  );

  const handleHostToggleCamera = useCallback(
    ({ roomId: msgRoomId, cameraLocked, allowCamera }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;
      const locked =
        typeof cameraLocked === 'boolean'
          ? cameraLocked
          : allowCamera != null
          ? !allowCamera
          : false;
      setHostCameraLocked(locked);
    },
    [roomId]
  );

  const handleHostDisableChat = useCallback(
    ({ roomId: msgRoomId, disabled }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;
      setHostChatDisabled(!!disabled);
    },
    [roomId]
  );

  const handleHostMuteYou = useCallback(
    ({ roomId: msgRoomId, hostId, hostName }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;
      if (isHost) return;

      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }

      setIsAudioEnabled(false);
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === userId ? { ...p, isAudioEnabled: false } : p
        )
      );

      setHostNotice('Host muted you');
      setTimeout(() => {
        setHostNotice(null);
      }, 3000);
    },
    [roomId, userId, isHost]
  );

  const handleHostRemoveUser = useCallback(
    ({ roomId: msgRoomId, userId: removedUserId, removedBy, removedByName }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;
      if (removedUserId !== userId) return;

      leaveRoom();
      if (onLeave) {
        onLeave();
      }
    },
    [roomId, userId, leaveRoom, onLeave]
  );

  const handleReaction = useCallback(
    ({ roomId: msgRoomId, userId: senderId, userName: senderName, emoji, ts }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;
      if (!emoji) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const reaction = {
        id,
        roomId: msgRoomId,
        userId: senderId,
        userName: senderName || 'Participant',
        emoji: String(emoji),
        ts: ts || Date.now(),
      };

      setReactions((prev) => [...prev, reaction]);

      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== id));
      }, 2500);
    },
    [roomId]
  );

  const toggleAudio = useCallback(
    async (enabled) => {
      setIsAudioEnabled(enabled);
      const hasStream = !!localStreamRef.current;
      const existingAudioTracks = hasStream
        ? localStreamRef.current.getAudioTracks()
        : [];

      if (enabled) {
        if (!hasStream || existingAudioTracks.length === 0) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
            });
            const audioTrack = stream.getAudioTracks()[0];

            if (audioTrack) {
              if (localStreamRef.current) {
                localStreamRef.current.addTrack(audioTrack);
              } else {
                localStreamRef.current = stream;
                setLocalStream(stream);
              }

              peerConnectionsRef.current.forEach((pc) => {
                const sender = pc
                  .getSenders()
                  .find((s) => s.track && s.track.kind === 'audio');
                if (sender) {
                  sender.replaceTrack(audioTrack);
                } else {
                  pc.addTrack(audioTrack, localStreamRef.current);
                }
              });

              await renegotiateWithAllPeers();
            }
          } catch (error) {
            console.error('Error getting audio track:', error);
          }
        } else {
          existingAudioTracks.forEach((track) => {
            track.enabled = true;
          });

          const audioTrack = existingAudioTracks[0];
          peerConnectionsRef.current.forEach((pc) => {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === 'audio');
            if (sender) {
              sender.replaceTrack(audioTrack);
            } else if (audioTrack && localStreamRef.current) {
              pc.addTrack(audioTrack, localStreamRef.current);
            }
          });

          await renegotiateWithAllPeers();
        }
      } else if (hasStream) {
        existingAudioTracks.forEach((track) => {
          track.enabled = false;
        });

        await renegotiateWithAllPeers();
      }

      setParticipants((prev) =>
        prev.map((p) =>
          p.id === userId ? { ...p, isAudioEnabled: enabled } : p
        )
      );

      if (socketRef.current) {
        socketRef.current.emit(enabled ? 'audio-unmute' : 'audio-mute', {
          roomId,
          userId,
        });
      }
    },
    [roomId, userId, renegotiateWithAllPeers]
  );

  const toggleVideo = useCallback(
    async (enabled) => {
      setIsVideoEnabled(enabled);
      const hasStream = !!localStreamRef.current;
      const existingVideoTracks = hasStream
        ? localStreamRef.current.getVideoTracks()
        : [];

      if (enabled) {
        if (!hasStream || existingVideoTracks.length === 0) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { width: 1280, height: 720 },
            });
            const videoTrack = stream.getVideoTracks()[0];

            if (videoTrack) {
              if (localStreamRef.current) {
                localStreamRef.current.addTrack(videoTrack);
              } else {
                localStreamRef.current = stream;
                setLocalStream(stream);
              }

              peerConnectionsRef.current.forEach((pc) => {
                const sender = pc
                  .getSenders()
                  .find((s) =>
                    s.track &&
                    s.track.kind === 'video' &&
                    !s.track.getSettings().displaySurface
                  );
                if (sender) {
                  sender.replaceTrack(videoTrack);
                } else if (videoTrack && localStreamRef.current) {
                  pc.addTrack(videoTrack, localStreamRef.current);
                }
              });

              await renegotiateWithAllPeers();
            }
          } catch (error) {
            console.error('Error getting video track:', error);
          }
        } else {
          existingVideoTracks.forEach((track) => {
            track.enabled = true;
          });

          const videoTrack = existingVideoTracks[0];
          peerConnectionsRef.current.forEach((pc) => {
            const sender = pc
              .getSenders()
              .find((s) =>
                s.track &&
                s.track.kind === 'video' &&
                !s.track.getSettings().displaySurface
              );
            if (sender) {
              sender.replaceTrack(videoTrack);
            } else if (videoTrack && localStreamRef.current) {
              pc.addTrack(videoTrack, localStreamRef.current);
            }
          });
        }
      } else if (hasStream) {
        existingVideoTracks.forEach((track) => {
          track.enabled = false;
        });
      }

      setParticipants((prev) =>
        prev.map((p) =>
          p.id === userId ? { ...p, isVideoEnabled: enabled } : p
        )
      );

      if (socketRef.current) {
        socketRef.current.emit(enabled ? 'video-unmute' : 'video-mute', {
          roomId,
          userId,
        });
      }
    },
    [roomId, userId, renegotiateWithAllPeers]
  );

  const startScreenShare = useCallback(async () => {
    try {
      if (screenShareUserId && screenShareUserId !== userId) {
        alert('Screen share is already in progress by another participant.');
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const videoTrack = stream.getVideoTracks()[0];
      localScreenStreamRef.current = stream;
      setLocalScreenStream(stream);
      setIsScreenSharing(true);
      setScreenShareUserId(userId);
      screenShareUserIdRef.current = userId;

      if (socketRef.current) {
        socketRef.current.emit('screen-share-started', {
          roomId,
          userId,
        });
      }

      peerConnectionsRef.current.forEach((pc) => {
        pc.addTrack(videoTrack, stream);
      });

      await renegotiateWithAllPeers();

      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Error starting screen share:', error);
      if (error.name !== 'NotAllowedError') {
        throw error;
      }
    }
  }, [roomId, userId, screenShareUserId, renegotiateWithAllPeers]);

  const stopScreenShare = useCallback(async () => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
      setLocalScreenStream(null);
    }

    peerConnectionsRef.current.forEach((pc) => {
      const senders = pc.getSenders();
      senders.forEach((sender) => {
        if (
          sender.track &&
          (sender.track.getSettings().displaySurface === 'screen' ||
            sender.track.getSettings().displaySurface === 'window' ||
            sender.track.getSettings().displaySurface === 'browser')
        ) {
          pc.removeTrack(sender);
        }
      });
    });

    await renegotiateWithAllPeers();

    setIsScreenSharing(false);
    setScreenShareUserId(null);
    setScreenShareStream(null);
    screenShareUserIdRef.current = null;

    if (socketRef.current) {
      socketRef.current.emit('screen-share-stopped', {
        roomId,
        userId,
      });
    }
  }, [roomId, userId, renegotiateWithAllPeers]);

  const endMeeting = useCallback(() => {
    if (!isHost) {
      console.warn('Only host can end the meeting');
      return;
    }

    setMeetingEnded(true);
    meetingEndedRef.current = true;

    if (socketRef.current) {
      socketRef.current.emit('end-meeting', {
        roomId,
        userId,
      });
    }

    leaveRoom();

    if (onLeave) {
      setTimeout(() => {
        onLeave();
      }, 50);
    }
  }, [roomId, userId, isHost, leaveRoom, onLeave]);

  useEffect(() => {
    if (meetingEndedRef.current) {
      return;
    }

    let authToken = null;
    if (typeof window !== 'undefined') {
      authToken =
        window.localStorage.getItem('token') ||
        window.localStorage.getItem('vd_auth_token');
    }

    if (!authToken) {
      console.warn('[useRoomClient] no auth token found');
      return;
    }

    // Local-first Socket.IO endpoint for meetings; override with VITE_SOCKET_URL if needed.
    socketRef.current = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      auth: { token: authToken },
      transports: ['websocket'],
      path: '/socket.io',
      reconnection: !meetingEndedRef.current,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      if (meetingEndedRef.current) {
        socket.disconnect();
        return;
      }

      console.log('[SOCKET] Socket connected:', socket.id);
      socket.emit('user-joined', {
        roomId,
        userId,
        userName,
        isHost,
      });
    });

    socket.on('disconnect', () => {
      console.log('[SOCKET] Socket disconnected');
      if (meetingEndedRef.current) {
        socket.removeAllListeners();
      }
    });

    socket.io.on('reconnect_attempt', () => {
      if (meetingEndedRef.current) {
        socket.io.disconnect();
      }
    });

    socket.on('room-users', handleRoomUsers);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('screen-share-started', handleScreenShareStarted);
    socket.on('screen-share-stopped', handleScreenShareStopped);
    socket.on('audio-mute', handleAudioMute);
    socket.on('audio-unmute', handleAudioUnmute);
    socket.on('video-mute', handleVideoMute);
    socket.on('video-unmute', handleVideoUnmute);
    socket.on('meeting-chat-message', handleMeetingChatMessage);
    socket.on('meeting-chat-history', handleMeetingChatHistory);
    socket.on('host_permissions', handleHostPermissions);
    socket.on('host_toggle_mic', handleHostToggleMic);
    socket.on('host_toggle_camera', handleHostToggleCamera);
    socket.on('host_disable_chat', handleHostDisableChat);
    socket.on('host_mute_you', handleHostMuteYou);
    socket.on('host_remove_user', handleHostRemoveUser);
    socket.on('reaction', handleReaction);
    socket.on('meeting-ended', handleMeetingEnded);

    return () => {
      socket.off('room-users', handleRoomUsers);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('screen-share-started', handleScreenShareStarted);
      socket.off('screen-share-stopped', handleScreenShareStopped);
      socket.off('audio-mute', handleAudioMute);
      socket.off('audio-unmute', handleAudioUnmute);
      socket.off('video-mute', handleVideoMute);
      socket.off('video-unmute', handleVideoUnmute);
      socket.off('meeting-chat-message', handleMeetingChatMessage);
      socket.off('meeting-chat-history', handleMeetingChatHistory);
      socket.off('host_permissions', handleHostPermissions);
      socket.off('host_toggle_mic', handleHostToggleMic);
      socket.off('host_toggle_camera', handleHostToggleCamera);
      socket.off('host_disable_chat', handleHostDisableChat);
      socket.off('host_mute_you', handleHostMuteYou);
      socket.off('host_remove_user', handleHostRemoveUser);
      socket.off('reaction', handleReaction);
      socket.off('meeting-ended', handleMeetingEnded);
      socket.disconnect();
    };
  }, [
    roomId,
    userId,
    userName,
    isHost,
    handleRoomUsers,
    handleUserJoined,
    handleUserLeft,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleScreenShareStarted,
    handleScreenShareStopped,
    handleAudioMute,
    handleAudioUnmute,
    handleVideoMute,
    handleVideoUnmute,
    handleMeetingChatMessage,
    handleMeetingChatHistory,
    handleHostPermissions,
    handleHostToggleMic,
    handleHostToggleCamera,
    handleHostDisableChat,
    handleHostMuteYou,
    handleHostRemoveUser,
    handleReaction,
    handleMeetingEnded,
  ]);

  const sendChatMessage = useCallback(
    (text) => {
      const trimmed = String(text || '').trim();
      if (!trimmed) return;

      const ts = Date.now();

      handleMeetingChatMessage({
        roomId,
        userId,
        userName,
        text: trimmed,
        ts,
      });

      if (!socketRef.current) return;

      socketRef.current.emit('meeting-chat-message', {
        roomId,
        userId,
        userName,
        text: trimmed,
        ts,
      });
    },
    [roomId, userId, userName, handleMeetingChatMessage]
  );

  const muteAllParticipants = useCallback(() => {
    if (!isHost) {
      console.warn('Only host can mute all participants');
      return;
    }
    if (!socketRef.current) return;

    socketRef.current.emit('host_mute_all', {
      roomId,
      userId,
    });
  }, [roomId, userId, isHost]);

  const setMicLock = useCallback(
    (locked) => {
      if (!isHost) {
        console.warn('Only host can toggle mic lock');
        return;
      }
      setHostMicLocked(!!locked);
      if (!socketRef.current) return;

      socketRef.current.emit('host_toggle_mic', {
        roomId,
        allowUnmute: !locked,
      });
    },
    [roomId, isHost]
  );

  const setCameraLock = useCallback(
    (locked) => {
      if (!isHost) {
        console.warn('Only host can toggle camera lock');
        return;
      }
      setHostCameraLocked(!!locked);
      if (!socketRef.current) return;

      socketRef.current.emit('host_toggle_camera', {
        roomId,
        allowCamera: !locked,
      });
    },
    [roomId, isHost]
  );

  const setChatDisabled = useCallback(
    (disabled) => {
      if (!isHost) {
        console.warn('Only host can toggle chat');
        return;
      }
      setHostChatDisabled(!!disabled);
      if (!socketRef.current) return;

      socketRef.current.emit('host_disable_chat', {
        roomId,
        disabled: !!disabled,
      });
    },
    [roomId, isHost]
  );

  const removeParticipant = useCallback(
    (targetUserId) => {
      if (!isHost) {
        console.warn('Only host can remove participants');
        return;
      }
      if (!targetUserId || targetUserId === userId) return;
      if (!socketRef.current) return;

      socketRef.current.emit('host_remove_user', {
        roomId,
        targetUserId,
      });
    },
    [roomId, userId, isHost]
  );

  const sendReaction = useCallback(
    (emoji) => {
      const trimmed = String(emoji || '').trim();
      if (!trimmed) return;
      if (!socketRef.current) return;

      const payload = {
        roomId,
        userId,
        userName,
        emoji: trimmed,
        ts: Date.now(),
      };

      socketRef.current.emit('reaction', payload);
    },
    [roomId, userId, userName]
  );

  return {
    localStream,
    localScreenStream,
    participants,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenShareUserId,
    screenShareStream,
    activeSpeakerId,
    meetingEnded,
    meetingEndedBy,
    chatMessages,
    hostMicLocked,
    hostCameraLocked,
    hostChatDisabled,
    reactions,
    hostNotice,
    initializeLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    endMeeting,
    leaveRoom,
    sendChatMessage,
    muteAllParticipants,
    setMicLock,
    setCameraLock,
    setChatDisabled,
    removeParticipant,
    sendReaction,
  };
}