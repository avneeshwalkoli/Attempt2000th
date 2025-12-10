/**
 * useRoomClient - FIXED WebRTC + Socket.IO hook for multi-user video conferencing
 * Properly handles peer connections, audio/video streams, and signaling
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useRoomClient(roomId, userId, userName, isHost = false, onLeave = null) {
  // State
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
  const [meetingEndedBy, setMeetingEndedBy] = useState(null); // Store who ended the meeting
  const [chatMessages, setChatMessages] = useState([]);

  // Refs
  const socketRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // Map<userId, RTCPeerConnection>
  const remoteStreamsRef = useRef(new Map()); // Map<userId, { videoStream, audioStream }>
  const localStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const screenShareUserIdRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const isInitializedRef = useRef(false);
  const signalingStatesRef = useRef(new Map()); // Map<userId, 'stable' | 'have-local-offer' | 'have-remote-offer' | 'have-local-pranswer' | 'have-remote-pranswer' | 'closed'>
  const pendingOffersRef = useRef(new Set()); // Set<userId> - Track users we're currently creating offers for
  const meetingEndedRef = useRef(false); // Flag to prevent reconnection after meeting ends

  // Leave room - defined early so it can be used by other functions
  const leaveRoom = useCallback(() => {
    // Mark meeting as ended to prevent reconnection
    meetingEndedRef.current = true;

    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    // Clean up remote streams
    remoteStreamsRef.current.forEach((streams) => {
      streams.videoStream.getTracks().forEach((t) => t.stop());
      streams.audioStream.getTracks().forEach((t) => t.stop());
    });
    remoteStreamsRef.current.clear();

    // Clear signaling states and pending offers
    signalingStatesRef.current.clear();
    pendingOffersRef.current.clear();

    // Disconnect socket and prevent auto-reconnect
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

  // Handle meeting ended by host
  const handleMeetingEnded = useCallback(({ roomId: endedRoomId, endedBy, endedByName, message }) => {
    console.log(`Meeting ended by host ${endedByName || endedBy} in room ${endedRoomId}`);
    console.log('All participants will be notified and redirected...');
    
    // Store who ended the meeting for display
    setMeetingEndedBy(endedByName || 'Host');
    
    // Set meeting ended state to show message
    setMeetingEnded(true);
    
    // Leave room and cleanup
    leaveRoom();
    
    // Call onLeave after showing message (2 seconds to ensure all participants see it)
    if (onLeave) {
      setTimeout(() => {
        onLeave();
      }, 2000);
    }
  }, [leaveRoom, onLeave]);

  // Create peer connection for a specific user
  const createPeerConnection = useCallback(
    (targetUserId) => {
      // Don't create connection if meeting has ended
      if (meetingEndedRef.current) {
        return null;
      }

      // Don't create connection to self
      if (targetUserId === userId) return null;

      // Check if connection already exists and is not closed
      const existingPc = peerConnectionsRef.current.get(targetUserId);
      if (existingPc && existingPc.signalingState !== 'closed' && existingPc.connectionState !== 'closed') {
        return existingPc;
      }

      // Clean up old connection if it exists
      if (existingPc) {
        existingPc.close();
        peerConnectionsRef.current.delete(targetUserId);
        remoteStreamsRef.current.delete(targetUserId);
        signalingStatesRef.current.delete(targetUserId);
        pendingOffersRef.current.delete(targetUserId);
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      signalingStatesRef.current.set(targetUserId, 'stable');

      // Add ALL local tracks to this peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          if (track.enabled) {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      }

      // Add screen share track if active
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localScreenStreamRef.current);
        });
      }

      // Handle remote tracks - FIXED: Create separate streams for video and audio
      pc.ontrack = (event) => {
        const track = event.track;
        const stream = event.streams[0];

        // Get or create remote streams for this user
        let remoteStreams = remoteStreamsRef.current.get(targetUserId);
        if (!remoteStreams) {
          remoteStreams = {
            videoStream: new MediaStream(),
            audioStream: new MediaStream(),
          };
          remoteStreamsRef.current.set(targetUserId, remoteStreams);
        }

        // Add track to appropriate stream
        if (track.kind === 'video') {
          // Detect screen share: prefer explicit screenShareUserIdRef, fall back to displaySurface when available
          const settings = track.getSettings ? track.getSettings() : {};
          const isScreenShareTrack =
            screenShareUserIdRef.current === targetUserId ||
            settings.displaySurface === 'screen' ||
            settings.displaySurface === 'window' ||
            settings.displaySurface === 'browser';

          if (isScreenShareTrack) {
            // Use the full remote stream when available so screen audio is included
            const screenStream = stream || new MediaStream([track]);
            setScreenShareStream(screenStream);
            setScreenShareUserId(targetUserId);
            screenShareUserIdRef.current = targetUserId;
            setIsScreenSharing(true);
          } else {
            // Regular camera video track
            remoteStreams.videoStream.addTrack(track);
          }
        } else if (track.kind === 'audio') {
          remoteStreams.audioStream.addTrack(track);
        }

        // Update participant with streams
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

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('ice-candidate', {
            roomId,
            to: targetUserId,
            candidate: event.candidate,
          });
        }
      };

      // Handle signaling state changes
      pc.onsignalingstatechange = () => {
        const state = pc.signalingState;
        signalingStatesRef.current.set(targetUserId, state);
        console.log(`Signaling state for ${targetUserId}: ${state}`);
        
        if (state === 'stable') {
          pendingOffersRef.current.delete(targetUserId);
        }
        
        if (state === 'closed') {
          // Clean up on close
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

      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log(
          `Connection to ${targetUserId}: ${pc.connectionState}`
        );
        if (
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          // Clean up on disconnect
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

      peerConnectionsRef.current.set(targetUserId, pc);
      return pc;
    },
    [userId, roomId]
  );

  // Initialize local media stream
  const initializeLocalStream = useCallback(
    async (constraints = {}) => {
      try {
        const defaultConstraints = {
          audio: isAudioEnabled,
          video: isVideoEnabled ? { width: 1280, height: 720 } : false,
          ...constraints,
        };

        const stream = await navigator.mediaDevices.getUserMedia(
          defaultConstraints
        );
        localStreamRef.current = stream;
        setLocalStream(stream);

        // Add local participant
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

        // Add tracks to ALL existing peer connections
        peerConnectionsRef.current.forEach((pc, peerUserId) => {
          stream.getTracks().forEach((track) => {
            if (track.enabled) {
              // Check if track already added
              const sender = pc
                .getSenders()
                .find((s) => s.track && s.track.kind === track.kind);
              if (sender) {
                sender.replaceTrack(track);
              } else {
                pc.addTrack(track, stream);
              }
            }
          });
        });

        // Initialize audio context for active speaker detection
        if (stream.getAudioTracks().length > 0) {
          audioContextRef.current = new (window.AudioContext ||
            window.webkitAudioContext)();
          audioAnalyserRef.current =
            audioContextRef.current.createAnalyser();
          const source = audioContextRef.current.createMediaStreamSource(
            stream
          );
          source.connect(audioAnalyserRef.current);
          audioAnalyserRef.current.fftSize = 256;

          // Start active speaker detection
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

  // Detect active speaker
  const detectActiveSpeaker = useCallback(() => {
    if (!audioAnalyserRef.current) return;

    const dataArray = new Uint8Array(
      audioAnalyserRef.current.frequencyBinCount
    );
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

  // Handle room users list (when joining, get existing users)
  const handleRoomUsers = useCallback(
    async (users) => {
      // Don't process if meeting has ended
      if (meetingEndedRef.current) {
        return;
      }

      console.log('Room users:', users);
      // Create peer connections for all existing users
      for (const user of users) {
        if (user.userId !== userId) {
          // Add to participants list
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
              },
            ];
          });

          // Create peer connection and send offer
          if (isInitializedRef.current && localStreamRef.current) {
            // Check if we're already creating an offer for this user
            if (pendingOffersRef.current.has(user.userId)) {
              console.log(`Already creating offer for ${user.userId}, skipping...`);
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
                console.error(`Error creating offer for ${user.userId}:`, error);
                pendingOffersRef.current.delete(user.userId);
              }
            }
          }
        }
      }
    },
    [userId, roomId, createPeerConnection]
  );

  // Handle user joined
  const handleUserJoined = useCallback(
    async ({ userId: newUserId, userName: newUserName }) => {
      // Don't process if meeting has ended
      if (meetingEndedRef.current) {
        return;
      }

      if (newUserId === userId) return;

      console.log(`New user joined: ${newUserName} (${newUserId})`);

      // Add to participants list
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
          },
        ];
      });

      return;

      // Create peer connection for new user
      if (isInitializedRef.current && localStreamRef.current) {
        // Check if we're already creating an offer for this user
        if (pendingOffersRef.current.has(newUserId)) {
          console.log(`Already creating offer for ${newUserId}, skipping...`);
          return;
        }

        const pc = createPeerConnection(newUserId);
        if (pc && pc.signalingState === 'stable') {
          pendingOffersRef.current.add(newUserId);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            if (socketRef.current) {
              socketRef.current.emit('offer', {
                roomId,
                to: newUserId,
                offer,
              });
            }
          } catch (error) {
            console.error(`Error creating offer for ${newUserId}:`, error);
            pendingOffersRef.current.delete(newUserId);
          }
        }
      }
    },
    [userId, roomId, createPeerConnection]
  );

  // Handle user left
  const handleUserLeft = useCallback(
    ({ userId: leftUserId }) => {
      console.log(`User left: ${leftUserId}`);

      const pc = peerConnectionsRef.current.get(leftUserId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(leftUserId);
      }

      // Clean up remote streams
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

  // Helper: renegotiate with a specific peer after tracks change
  const renegotiateWithPeer = useCallback(
    async (targetUserId) => {
      const pc = peerConnectionsRef.current.get(targetUserId);
      if (!pc) return;
      if (meetingEndedRef.current) return;
      if (!socketRef.current) return;

      if (pc.signalingState !== 'stable') {
        console.log(
          `Skipping renegotiation with ${targetUserId} - signalingState=${pc.signalingState}`
        );
        return;
      }

      if (pendingOffersRef.current.has(targetUserId)) {
        console.log(
          `Renegotiation already in progress for ${targetUserId}, skipping`
        );
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

  // Helper: renegotiate with all connected peers
  const renegotiateWithAllPeers = useCallback(async () => {
    const peerIds = Array.from(peerConnectionsRef.current.keys());
    for (const peerId of peerIds) {
      // Run sequentially to reduce glare risk
      // eslint-disable-next-line no-await-in-loop
      await renegotiateWithPeer(peerId);
    }
  }, [renegotiateWithPeer]);

  // Handle offer
  const handleOffer = useCallback(
    async ({ from, offer }) => {
      // Don't process if meeting has ended
      if (meetingEndedRef.current) {
        return;
      }

      console.log(`Received offer from ${from}`);

      const pc = createPeerConnection(from);
      if (!pc) return;

      // Check if we're already processing an offer/answer for this peer
      const currentState = pc.signalingState;
      if (currentState !== 'stable' && currentState !== 'have-local-offer') {
        console.warn(`Ignoring offer from ${from} - connection in ${currentState} state`);
        return;
      }

      try {
        // If we have a local offer, we need to rollback or handle it
        if (currentState === 'have-local-offer') {
          // We're in the middle of creating an offer, rollback first
          console.log(`Rolling back local offer for ${from} to handle remote offer`);
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (rollbackError) {
            // Rollback might not be supported or might fail, close and recreate
            console.log(`Rollback failed, recreating connection to ${from}`);
            pc.close();
            peerConnectionsRef.current.delete(from);
            remoteStreamsRef.current.delete(from);
            signalingStatesRef.current.delete(from);
            pendingOffersRef.current.delete(from);
            
            // Recreate connection and try again
            const newPc = createPeerConnection(from);
            if (newPc) {
              await newPc.setRemoteDescription(new RTCSessionDescription(offer));
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
            return;
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
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
        console.error(`Error handling offer from ${from}:`, error);
        // If error, try to recover by closing and recreating the connection
        if (error.name === 'InvalidAccessError' || error.name === 'InvalidStateError') {
          console.log(`Recovering from error - recreating connection to ${from}`);
          pc.close();
          peerConnectionsRef.current.delete(from);
          remoteStreamsRef.current.delete(from);
          signalingStatesRef.current.delete(from);
          pendingOffersRef.current.delete(from);
          
          // Try to recreate and handle the offer again
          try {
            const newPc = createPeerConnection(from);
            if (newPc) {
              await newPc.setRemoteDescription(new RTCSessionDescription(offer));
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
            console.error(`Failed to recover connection to ${from}:`, retryError);
          }
        }
      }
    },
    [roomId, createPeerConnection]
  );

  // Handle answer
  const handleAnswer = useCallback(async ({ from, answer }) => {
    // Don't process if meeting has ended
    if (meetingEndedRef.current) {
      return;
    }

    console.log(`Received answer from ${from}`);

    const pc = peerConnectionsRef.current.get(from);
    if (!pc) {
      console.warn(`No peer connection found for ${from}`);
      return;
    }

    // Check if we're in the correct state to set remote answer
    const currentState = pc.signalingState;
    if (currentState !== 'have-local-offer') {
      console.warn(`Ignoring answer from ${from} - connection in ${currentState} state (expected have-local-offer)`);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error(`Error handling answer from ${from}:`, error);
      // If error, try to recover
      if (error.name === 'InvalidStateError') {
        console.log(`Recovering from error - connection state: ${pc.signalingState}`);
      }
    }
  }, []);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async ({ from, candidate }) => {
    const pc = peerConnectionsRef.current.get(from);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }, []);

  // Handle screen share started
  const handleScreenShareStarted = useCallback(({ userId: sharerUserId }) => {
    setScreenShareUserId(sharerUserId);
    setIsScreenSharing(true);
    screenShareUserIdRef.current = sharerUserId;
  }, []);

  // Handle screen share stopped
  const handleScreenShareStopped = useCallback(() => {
    setScreenShareStream(null);
    setScreenShareUserId(null);
    setIsScreenSharing(false);
    screenShareUserIdRef.current = null;
  }, []);

  // Handle audio mute
  const handleAudioMute = useCallback(({ userId: mutedUserId }) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === mutedUserId ? { ...p, isAudioEnabled: false } : p
      )
    );
  }, []);

  // Handle in-meeting chat message
  const handleMeetingChatMessage = useCallback(
    ({ roomId: msgRoomId, userId: senderId, userName: senderName, text, ts }) => {
      if (!msgRoomId || msgRoomId !== roomId) return;
      if (!text || !String(text).trim()) return;

      setChatMessages((prev) => [
        ...prev,
        {
          roomId: msgRoomId,
          userId: senderId,
          userName: senderName || 'Participant',
          text: String(text).trim(),
          ts: ts || Date.now(),
        },
      ]);
    },
    [roomId]
  );

  // Handle audio unmute
  const handleAudioUnmute = useCallback(({ userId: unmutedUserId }) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === unmutedUserId ? { ...p, isAudioEnabled: true } : p
      )
    );
  }, []);

  // Handle video mute
  const handleVideoMute = useCallback(({ userId: mutedUserId }) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === mutedUserId ? { ...p, isVideoEnabled: false } : p
      )
    );
  }, []);

  // Handle video unmute
  const handleVideoUnmute = useCallback(({ userId: unmutedUserId }) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === unmutedUserId ? { ...p, isVideoEnabled: true } : p
      )
    );
  }, []);


  // Toggle audio
  const toggleAudio = useCallback(
    async (enabled) => {
      setIsAudioEnabled(enabled);
      const hasStream = !!localStreamRef.current;
      const existingAudioTracks = hasStream
        ? localStreamRef.current.getAudioTracks()
        : [];

      if (enabled) {
        // Enable or create audio track
        if (!hasStream || existingAudioTracks.length === 0) {
          // No audio yet: acquire a new track
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

              // Attach audio track to all peer connections
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
          // Re-enable existing tracks and ensure they are attached
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
        // Disable existing audio tracks without detaching senders
        existingAudioTracks.forEach((track) => {
          track.enabled = false;
        });

        await renegotiateWithAllPeers();
      }

      // Update participant state
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === userId ? { ...p, isAudioEnabled: enabled } : p
        )
      );

      // Broadcast to others
      if (socketRef.current) {
        socketRef.current.emit(enabled ? 'audio-unmute' : 'audio-mute', {
          roomId,
          userId,
        });
      }
    },
    [roomId, userId]
  );

  // Toggle video
  const toggleVideo = useCallback(
    async (enabled) => {
      setIsVideoEnabled(enabled);
      const hasStream = !!localStreamRef.current;
      const existingVideoTracks = hasStream
        ? localStreamRef.current.getVideoTracks()
        : [];

      if (enabled) {
        // Enable or create camera video track
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

              // Attach camera video track in all peer connections
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
          // Re-enable existing camera video tracks and ensure they are attached
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
        // Disable existing camera video tracks without detaching senders
        existingVideoTracks.forEach((track) => {
          track.enabled = false;
        });
      }

      // Update participant state
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === userId ? { ...p, isVideoEnabled: enabled } : p
        )
      );

      // Broadcast to others
      if (socketRef.current) {
        socketRef.current.emit(enabled ? 'video-unmute' : 'video-mute', {
          roomId,
          userId,
        });
      }
    },
    [roomId, userId]
  );

  // Start screen share
  const startScreenShare = useCallback(async () => {
    try {
      // Check if someone else is already sharing
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

      // Broadcast screen share started before tracks so receivers can classify correctly
      if (socketRef.current) {
        socketRef.current.emit('screen-share-started', {
          roomId,
          userId,
        });
      }

      // Add screen share track to all peer connections
      peerConnectionsRef.current.forEach((pc) => {
        pc.addTrack(videoTrack, stream);
      });

      await renegotiateWithAllPeers();

      // Handle screen share end
      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Error starting screen share:', error);
      if (error.name !== 'NotAllowedError') {
        throw error;
      }
    }
  }, [roomId, userId, screenShareUserId]);

  // Stop screen share
  const stopScreenShare = useCallback(async () => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
      setLocalScreenStream(null);
    }

    // Remove screen share tracks from peer connections
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

    // Broadcast screen share stopped
    if (socketRef.current) {
      socketRef.current.emit('screen-share-stopped', {
        roomId,
        userId,
      });
    }
  }, [roomId, userId]);

  // End meeting (host only) - broadcasts to all participants
  const endMeeting = useCallback(() => {
    if (!isHost) {
      console.warn('Only host can end the meeting');
      return;
    }

    // Mark meeting as ended immediately
    setMeetingEnded(true);
    meetingEndedRef.current = true;

    // Broadcast meeting ended to all participants
    if (socketRef.current) {
      socketRef.current.emit('end-meeting', {
        roomId,
        userId,
      });
    }

    // Leave room locally (host also leaves)
    leaveRoom();

    // Call onLeave for host immediately
    if (onLeave) {
      setTimeout(() => {
        onLeave();
      }, 50);
    }
  }, [roomId, userId, isHost, leaveRoom, onLeave]);

  // Initialize socket and set up event listeners
  useEffect(() => {
    // Don't initialize if meeting has ended
    if (meetingEndedRef.current) {
      return;
    }

    // Resolve auth token from localStorage (same pattern as DeskLink/chat sockets)
    let authToken = null;
    if (typeof window !== 'undefined') {
      authToken =
        window.localStorage.getItem('token') ||
        window.localStorage.getItem('vd_auth_token');
    }

    if (!authToken) {
      console.warn('[useRoomClient] no auth token found; meeting socket will not connect');
      return;
    }

    // Initialize socket connection with JWT auth
    socketRef.current = io(import.meta.env.VITE_SOCKET_URL || 'https://anydesk.onrender.com', {
      auth: { token: authToken },
      transports: ['websocket'],
      path: '/socket.io',
      reconnection: !meetingEndedRef.current,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    const socket = socketRef.current;

    // Socket connection handlers
    socket.on('connect', () => {
      // Don't join room if meeting has ended
      if (meetingEndedRef.current) {
        socket.disconnect();
        return;
      }

      console.log('Socket connected:', socket.id);
      // Join room
      socket.emit('user-joined', {
        roomId,
        userId,
        userName,
        isHost,
      });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      // If meeting ended, don't allow reconnection
      if (meetingEndedRef.current) {
        socket.removeAllListeners();
      }
    });

    // Prevent reconnection if meeting ended
    socket.io.on('reconnect_attempt', () => {
      if (meetingEndedRef.current) {
        socket.io.disconnect();
      }
    });

    // Register all socket event listeners
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
    socket.on('meeting-ended', handleMeetingEnded);

    // Cleanup on unmount
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
    handleMeetingEnded,
  ]);

  // Send in-meeting chat message
  const sendChatMessage = useCallback(
    (text) => {
      const trimmed = String(text || '').trim();
      if (!trimmed) return;
      if (!socketRef.current) return;

      socketRef.current.emit('meeting-chat-message', {
        roomId,
        userId,
        userName,
        text: trimmed,
        ts: Date.now(),
      });
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
    initializeLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    endMeeting,
    leaveRoom,
    sendChatMessage,
  };
}
