/**
 * Socket.IO Server
 * - WebRTC signaling for Meet
 * - Realtime private messaging for ChatSpace
 * - Remote Desktop Signaling (Added)
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Message = require('./models/Message');
const RemoteSession = require('./models/RemoteSession');
const Device = require('./models/Device');
const { verifySessionToken } = require('./utils/sessionToken');

let ioInstance = null;
const onlineUsersByPhone = new Map(); // Map<phoneString, Set<socketId>>
const onlineUsersById = new Map(); // Map<userId, Set<socketId>>
const onlineDevicesById = new Map(); // Map<deviceId, Set<socketId>>
const pendingSignalsByDevice = new Map(); // Map<deviceId, Array<{event,payload}>>
const metrics = { activeSessions: 0, offersRelayed: 0, iceFailures: 0, datachannelMsgs: 0 };

function trackUserSocket(map, key, socketId) {
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key).add(socketId);
}

function untrackUserSocket(map, key, socketId) {
  if (!key || !map.has(key)) return;
  const set = map.get(key);
  set.delete(socketId);
  if (set.size === 0) {
    map.delete(key);
  }
}

function emitToUser(userId, event, payload) {
  if (!ioInstance || !userId) return;
  const sockets = onlineUsersById.get(String(userId));
  if (!sockets) return;
  sockets.forEach((socketId) => {
    const target = ioInstance.sockets.sockets.get(socketId);
    if (target) {
      target.emit(event, payload);
    }
  });
}

function emitToDevice(deviceId, event, payload) {
  if (!ioInstance || !deviceId) return;
  const sockets = onlineDevicesById.get(String(deviceId));
  if (!sockets) return;
  sockets.forEach((socketId) => {
    const target = ioInstance.sockets.sockets.get(socketId);
    if (target) {
      target.emit(event, payload);
    }
  });
}

function queueSignal(deviceId, event, payload) {
  if (!pendingSignalsByDevice.has(String(deviceId))) pendingSignalsByDevice.set(String(deviceId), []);
  pendingSignalsByDevice.get(String(deviceId)).push({ event, payload, ts: Date.now() });
}

async function validateSessionAccess(sessionId, userId) {
  if (!sessionId) return null;

  const session = await RemoteSession.findOne({ sessionId });
  if (!session) return null;

  // If a userId is provided, enforce that they are caller or receiver.
  if (userId &&
      String(session.callerUserId) !== String(userId) &&
      String(session.receiverUserId) !== String(userId)) {
    return null;
  }

  return session;
}


function createSocketServer(server, clientOrigin) {
  const io = new Server(server, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  ioInstance = io;

  // Store room data for meetings
  const rooms = new Map(); // Map<roomId, Map<userId, {socketId, userName, isHost}>>
  const roomPermissions = new Map(); // Map<roomId, { micLocked, cameraLocked, chatDisabled }>
  const roomChats = new Map(); // Map<roomId, Array<{ roomId, userId, userName, text, ts }>>

  // Authenticate socket connections using JWT
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      const token = auth.token;

      if (!token) {
        return next(new Error('Not authorized, no token'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('Not authorized, user not found'));
      }

      socket.user = user;
      socket.userPhone = `${user.countryCode} ${user.phoneNumber}`;
      socket.userId = String(user._id);
      return next();
    } catch (err) {
      console.error('[socket] auth error', err && err.message);
      return next(new Error('Not authorized, token failed'));
    }
  });


  io.on('connection', (socket) => {
    console.log('User connected:', socket.id, socket.userPhone);

    trackUserSocket(onlineUsersByPhone, socket.userPhone, socket.id);
    trackUserSocket(onlineUsersById, socket.userId, socket.id);

    // DeskLink registration
    socket.on('register', async ({ deviceId, platform, label, osInfo, deviceName }) => {
      try {
        if (!deviceId) return;

        const devId = String(deviceId);
        socket.data.deviceId = devId;

        // Track in-memory mapping for signaling
        trackUserSocket(onlineDevicesById, devId, socket.id);

        // Auto-register or update device record in MongoDB
        const userId = socket.userId ? String(socket.userId) : null;
        const now = new Date();

        if (!userId) {
          console.warn('[device] register called without authenticated user for deviceId=', devId);
          return;
        }

        await Device.updateOne(
          { deviceId: devId },
          {
            $setOnInsert: {
              deviceId: devId,
              registeredAt: now,
            },
            $set: {
              userId: userId,
              deviceName: deviceName || label || 'Agent Device',
              osInfo: osInfo || platform || 'Unknown',
              platform: platform || '',
              deleted: false,
              blocked: false,
              label: label || 'Agent Device',
              lastOnline: now,
            },
          },
          { upsert: true }
        );

        console.log('[device] registered/updated', devId, 'for user', userId || '(none)');

        // flush pending signals to this device if any
        const pending = pendingSignalsByDevice.get(devId);
        if (pending && pending.length > 0) {
          for (const sig of pending) {
            try {
              socket.emit(sig.event, sig.payload);
            } catch (e) {
              // ignore
            }
          }
          pendingSignalsByDevice.delete(devId);
        }
      } catch (err) {
        console.error('[device] register error', err && err.message);
      }
    });

    // Chat Messaging
    socket.on('private-message', async ({ to, text }) => {
      try {
        if (!text || !String(text).trim()) {
          return;
        }

        const senderPhone = socket.userPhone;
        const receiverPhone = String(to || '').trim();

        if (!receiverPhone) {
          return;
        }

        const msgDoc = await Message.create({
          senderPhone,
          receiverPhone,
          text: String(text).trim(),
        });

        const msg = msgDoc.toObject();

        // Send back to sender
        socket.emit('private-message', msg);

        // Deliver to receiver
        const receiverSockets = onlineUsersByPhone.get(receiverPhone);
        if (receiverSockets && receiverSockets.size > 0) {
          for (const socketId of receiverSockets) {
            const target = io.sockets.sockets.get(socketId);
            if (target) {
              target.emit('private-message', msg);
            }
          }
        }
      } catch (err) {
        console.error('[socket] private-message error', err);
      }
    });

    /**
     * =========================================================
     * START: Remote Desktop Logic (WebRTC Signaling)
     * =========================================================
     */

   /**
 * Fixed WebRTC Signaling Section for socketManager.js
 * Replace the existing WebRTC signaling section with this
 */

// WebRTC Offer
socket.on('webrtc-offer', async ({ sessionId, fromUserId, fromDeviceId, toDeviceId, sdp, token }) => {
  try {
    console.log(`[webrtc-offer] Session: ${sessionId}, From: ${fromDeviceId} → To: ${toDeviceId}`);
    
    // Optional: validate ephemeral session token
    if (token) {
      try {
        const decoded = verifySessionToken(token);
        if (decoded.sessionId && decoded.sessionId !== sessionId) {
          console.error('[webrtc-offer] session token mismatch');
          return;
        }
      } catch (e) {
        console.warn('[webrtc-offer] token validation failed:', e.message);
      }
    }

    // Validate session ownership
    const session = await validateSessionAccess(sessionId, fromUserId);
    if (!session) {
      console.error('[webrtc-offer] invalid session or unauthorized', sessionId, fromUserId);
      return;
    }

    if (session.status !== 'accepted' && session.status !== 'in-progress') {
      console.warn('[webrtc-offer] session not in accepted/in-progress state', sessionId, session.status);
    }

    metrics.offersRelayed++;

    // ✅ FIX: Pass ALL fields including toDeviceId and token
    const payload = {
      sessionId,
      fromUserId,
      fromDeviceId,
      toDeviceId,
      sdp,
      token,
    };

    console.log(`[webrtc-offer] Relaying to device ${toDeviceId}:`, payload);

    // Relay to target device
    emitToDevice(toDeviceId, 'webrtc-offer', payload);

    // If target offline, queue for later
    if (!onlineDevicesById.has(String(toDeviceId))) {
      console.warn(`[webrtc-offer] Device ${toDeviceId} offline, queuing signal`);
      queueSignal(toDeviceId, 'webrtc-offer', payload);
    } else {
      console.log(`[webrtc-offer] Device ${toDeviceId} is ONLINE, signal sent immediately`);
    }
  } catch (err) {
    console.error('[webrtc-offer] error:', err && err.message);
  }
});

// WebRTC Answer
socket.on('webrtc-answer', async ({ sessionId, fromUserId, fromDeviceId, toDeviceId, sdp, token }) => {
  try {
    console.log(`[webrtc-answer] Session: ${sessionId}, From: ${fromDeviceId} → To: ${toDeviceId}`);
    
    if (token) {
      try {
        const decoded = verifySessionToken(token);
        if (decoded.sessionId && decoded.sessionId !== sessionId) {
          console.error('[webrtc-answer] session token mismatch');
          return;
        }
      } catch (e) {
        console.warn('[webrtc-answer] token validation failed:', e.message);
      }
    }

    const session = await validateSessionAccess(sessionId, fromUserId);
    if (!session) {
      console.error('[webrtc-answer] invalid session or unauthorized', sessionId, fromUserId);
      return;
    }

    // ✅ FIX: Pass ALL fields including toDeviceId and token
    const payload = {
      sessionId,
      fromUserId,
      fromDeviceId,
      toDeviceId,
      sdp,
      token,
    };

    console.log(`[webrtc-answer] Relaying to device ${toDeviceId}:`, payload);

    emitToDevice(toDeviceId, 'webrtc-answer', payload);

    if (!onlineDevicesById.has(String(toDeviceId))) {
      console.warn(`[webrtc-answer] Device ${toDeviceId} offline, queuing signal`);
      queueSignal(toDeviceId, 'webrtc-answer', payload);
    } else {
      console.log(`[webrtc-answer] Device ${toDeviceId} is ONLINE, signal sent immediately`);
    }
  } catch (err) {
    console.error('[webrtc-answer] error:', err && err.message);
  }
});

// WebRTC ICE Candidate
socket.on('webrtc-ice', async ({ sessionId, fromUserId, fromDeviceId, toDeviceId, candidate, token }) => {
  try {
    // Don't log every ICE candidate (too verbose), just count them
    if (token) {
      try {
        const decoded = verifySessionToken(token);
        if (decoded.sessionId && decoded.sessionId !== sessionId) {
          return;
        }
      } catch (e) {
        // Silent fail for ICE candidates
      }
    }

    const session = await validateSessionAccess(sessionId, fromUserId);
    if (!session) {
      metrics.iceFailures++;
      return;
    }

    // ✅ FIX: Pass ALL fields including toDeviceId and token
    const payload = {
      sessionId,
      fromUserId,
      fromDeviceId,
      toDeviceId,
      candidate,
      token,
    };

    // Relay candidate
    emitToDevice(toDeviceId, 'webrtc-ice', payload);

    if (!onlineDevicesById.has(String(toDeviceId))) {
      queueSignal(toDeviceId, 'webrtc-ice', payload);
    }
  } catch (err) {
    console.error('[webrtc-ice] error:', err && err.message);
    metrics.iceFailures++;
  }
});

// WebRTC Cancel
socket.on('webrtc-cancel', async ({ sessionId, fromUserId }) => {
  try {
    const session = await validateSessionAccess(sessionId, fromUserId);
    if (!session) return;

    console.log(`[webrtc-cancel] ${sessionId} from ${fromUserId}`);

    // ✅ Emit to both caller and receiver users
    emitToUser(session.callerUserId, 'webrtc-cancel', { sessionId });
    emitToUser(session.receiverUserId, 'webrtc-cancel', { sessionId });

    // ✅ Also emit to devices
    if (session.callerDeviceId) {
      emitToDevice(session.callerDeviceId, 'webrtc-cancel', { sessionId });
    }
    if (session.receiverDeviceId) {
      emitToDevice(session.receiverDeviceId, 'webrtc-cancel', { sessionId });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    session.audit.push({ event: 'cancelled', userId: fromUserId, details: {} });
    await session.save();

    if (metrics.activeSessions > 0) metrics.activeSessions--;
  } catch (err) {
    console.error('[webrtc-cancel] error:', err && err.message);
  }
});

    /**
     * =========================================================
     * END: Remote Desktop Logic
     * =========================================================
     */


    // ======================
    // WebRTC Meet Signaling
    // ======================

    // User joined room
    socket.on('user-joined', ({ roomId, userId, userName, isHost }) => {
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.userId = userId;
      socket.data.userName = userName;
      socket.data.isHost = isHost;

      // Add to room
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }
      rooms.get(roomId).set(userId, {
        socketId: socket.id,
        userName,
        isHost,
      });

      // Send list of existing users to the new user
      const existingUsers = Array.from(rooms.get(roomId).entries())
        .filter(([uid]) => uid !== userId)
        .map(([uid, data]) => ({
          userId: uid,
          userName: data.userName,
          isHost: data.isHost,
        }));

      socket.emit('room-users', existingUsers);

      // Send existing chat history to the new user (if any)
      const existingChat = roomChats.get(roomId);
      if (existingChat && existingChat.length > 0) {
        socket.emit('meeting-chat-history', {
          roomId,
          messages: existingChat,
        });
      }

      // Send current host permissions state
      const perms = roomPermissions.get(roomId);
      if (perms) {
        socket.emit('host_permissions', {
          roomId,
          micLocked: !!perms.micLocked,
          cameraLocked: !!perms.cameraLocked,
          chatDisabled: !!perms.chatDisabled,
        });
      }

      // Notify others in room about new user
      socket.to(roomId).emit('user-joined', {
        userId,
        userName,
        isHost,
      });

      console.log(`User ${userName} (${userId}) joined room ${roomId}`);
    });

    // Send offer - target specific user
    socket.on('offer', ({ roomId, to, offer }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const targetUser = roomUsers.get(to);
      if (targetUser) {
        const targetSocket = io.sockets.sockets.get(targetUser.socketId);
        if (targetSocket) {
          targetSocket.emit('offer', {
            from: socket.data.userId,
            offer,
          });
        }
      }
    });

    // Send answer - target specific user
    socket.on('answer', ({ roomId, to, answer }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const targetUser = roomUsers.get(to);
      if (targetUser) {
        const targetSocket = io.sockets.sockets.get(targetUser.socketId);
        if (targetSocket) {
          targetSocket.emit('answer', {
            from: socket.data.userId,
            answer,
          });
        }
      }
    });

    // Send ICE candidate - target specific user
    socket.on('ice-candidate', ({ roomId, to, candidate }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const targetUser = roomUsers.get(to);
      if (targetUser) {
        const targetSocket = io.sockets.sockets.get(targetUser.socketId);
        if (targetSocket) {
          targetSocket.emit('ice-candidate', {
            from: socket.data.userId,
            candidate,
          });
        }
      }
    });

    // Screen share started
    socket.on('screen-share-started', ({ roomId, userId }) => {
      socket.to(roomId).emit('screen-share-started', {
        userId,
      });
      console.log(`Screen share started by ${userId} in room ${roomId}`);
    });

    // Screen share stopped
    socket.on('screen-share-stopped', ({ roomId, userId }) => {
      socket.to(roomId).emit('screen-share-stopped', {
        userId,
      });
      console.log(`Screen share stopped by ${userId} in room ${roomId}`);
    });

    // Audio mute
    socket.on('audio-mute', ({ roomId, userId }) => {
      socket.to(roomId).emit('audio-mute', {
        userId,
      });
    });

    // Audio unmute
    socket.on('audio-unmute', ({ roomId, userId }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const caller = roomUsers.get(socket.data.userId);
      const perms = roomPermissions.get(roomId) || {
        micLocked: false,
        cameraLocked: false,
        chatDisabled: false,
      };

      // If mic is locked and caller is not host, ignore unmute
      if (perms.micLocked && (!caller || !caller.isHost)) {
        console.log('[audio-unmute] blocked by host mic lock in room', roomId);
        return;
      }

      socket.to(roomId).emit('audio-unmute', {
        userId,
      });
    });

    // Video mute
    socket.on('video-mute', ({ roomId, userId }) => {
      socket.to(roomId).emit('video-mute', {
        userId,
      });
    });

    // Video unmute
    socket.on('video-unmute', ({ roomId, userId }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const caller = roomUsers.get(socket.data.userId);
      const perms = roomPermissions.get(roomId) || {
        micLocked: false,
        cameraLocked: false,
        chatDisabled: false,
      };

      // If camera is locked and caller is not host, ignore unmute
      if (perms.cameraLocked && (!caller || !caller.isHost)) {
        console.log('[video-unmute] blocked by host camera lock in room', roomId);
        return;
      }

      socket.to(roomId).emit('video-unmute', {
        userId,
      });
    });

    // In-meeting chat message (room broadcast + history)
    socket.on('meeting-chat-message', ({ roomId, userId, userName, text, ts }) => {
      try {
        if (!roomId || !text || !String(text).trim()) {
          return;
        }

        const perms = roomPermissions.get(roomId) || {
          micLocked: false,
          cameraLocked: false,
          chatDisabled: false,
        };

        const isHostSocket = !!socket.data.isHost;

        // If chat is disabled and this socket is not host, ignore message
        if (perms.chatDisabled && !isHostSocket) {
          console.log('[meeting-chat-message] blocked by host chat lock in room', roomId);
          return;
        }

        const senderId = userId || socket.data.userId;
        const senderName = userName || socket.data.userName || 'Participant';

        const message = {
          roomId,
          userId: senderId,
          userName: senderName,
          text: String(text).trim(),
          ts: ts || Date.now(),
        };

        if (!roomChats.has(roomId)) {
          roomChats.set(roomId, []);
        }
        const list = roomChats.get(roomId);
        list.push(message);
        // Optional cap to avoid unbounded growth
        if (list.length > 200) {
          list.splice(0, list.length - 200);
        }

        // Broadcast to everyone who joined this Socket.IO roomId
        io.to(roomId).emit('meeting-chat-message', message);
      } catch (err) {
        console.error('[socket] meeting-chat-message error', err && err.message);
      }
    });

    // Emoji reaction broadcast
    socket.on('reaction', ({ roomId, emoji, userId, userName, ts }) => {
      try {
        if (!roomId || !emoji) return;

        const senderId = userId || socket.data.userId;
        const senderName = userName || socket.data.userName || 'Participant';

        const payload = {
          roomId,
          userId: senderId,
          userName: senderName,
          emoji: String(emoji),
          ts: ts || Date.now(),
        };

        // Broadcast to everyone in the room (including sender)
        io.to(roomId).emit('reaction', payload);
      } catch (err) {
        console.error('[socket] reaction error', err && err.message);
      }
    });

    // Host: toggle mic lock (participants cannot unmute)
    socket.on('host_toggle_mic', ({ roomId, allowUnmute }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const caller = roomUsers.get(socket.data.userId);
      if (!caller || !caller.isHost) {
        console.warn('[host] non-host attempted mic toggle in room', roomId);
        return;
      }

      const perms = roomPermissions.get(roomId) || {
        micLocked: false,
        cameraLocked: false,
        chatDisabled: false,
      };

      const micLocked =
        allowUnmute != null ? !allowUnmute : !perms.micLocked;

      const updated = {
        ...perms,
        micLocked,
      };

      roomPermissions.set(roomId, updated);

      io.to(roomId).emit('host_toggle_mic', {
        roomId,
        micLocked,
        allowUnmute: !micLocked,
        changedBy: socket.data.userId,
        changedByName: caller.userName,
      });
    });

    // Host: toggle camera lock
    socket.on('host_toggle_camera', ({ roomId, allowCamera }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const caller = roomUsers.get(socket.data.userId);
      if (!caller || !caller.isHost) {
        console.warn('[host] non-host attempted camera toggle in room', roomId);
        return;
      }

      const perms = roomPermissions.get(roomId) || {
        micLocked: false,
        cameraLocked: false,
        chatDisabled: false,
      };

      const cameraLocked =
        allowCamera != null ? !allowCamera : !perms.cameraLocked;

      const updated = {
        ...perms,
        cameraLocked,
      };

      roomPermissions.set(roomId, updated);

      io.to(roomId).emit('host_toggle_camera', {
        roomId,
        cameraLocked,
        allowCamera: !cameraLocked,
        changedBy: socket.data.userId,
        changedByName: caller.userName,
      });
    });

    // Host: disable / enable chat for participants
    socket.on('host_disable_chat', ({ roomId, disabled }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const caller = roomUsers.get(socket.data.userId);
      if (!caller || !caller.isHost) {
        console.warn('[host] non-host attempted chat toggle in room', roomId);
        return;
      }

      const perms = roomPermissions.get(roomId) || {
        micLocked: false,
        cameraLocked: false,
        chatDisabled: false,
      };

      const chatDisabled =
        disabled != null ? !!disabled : !perms.chatDisabled;

      const updated = {
        ...perms,
        chatDisabled,
      };

      roomPermissions.set(roomId, updated);

      io.to(roomId).emit('host_disable_chat', {
        roomId,
        disabled: chatDisabled,
        changedBy: socket.data.userId,
        changedByName: caller.userName,
      });
    });

    // Host: mute all participants (except host)
    socket.on('host_mute_all', ({ roomId }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const caller = roomUsers.get(socket.data.userId);
      if (!caller || !caller.isHost) {
        console.warn('[host] non-host attempted mute-all in room', roomId);
        return;
      }

      const hostUserId = socket.data.userId;

      roomUsers.forEach((userData, uid) => {
        if (uid === hostUserId) return;

        const targetSocket = io.sockets.sockets.get(userData.socketId);
        if (targetSocket) {
          // Direct notice to the participant
          targetSocket.emit('host_mute_you', {
            roomId,
            hostId: hostUserId,
            hostName: caller.userName,
          });
        }

        // Let clients update UI for that userId
        io.to(roomId).emit('audio-mute', {
          userId: uid,
        });
      });
    });

    // Host: remove participant from meeting
    socket.on('host_remove_user', ({ roomId, targetUserId }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) return;

      const caller = roomUsers.get(socket.data.userId);
      if (!caller || !caller.isHost) {
        console.warn('[host] non-host attempted remove-user in room', roomId);
        return;
      }

      const target = roomUsers.get(targetUserId);
      if (!target) return;

      const targetSocket = io.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.emit('host_remove_user', {
          roomId,
          userId: targetUserId,
          removedBy: socket.data.userId,
          removedByName: caller.userName,
        });

        targetSocket.leave(roomId);
      }

      roomUsers.delete(targetUserId);

      socket.to(roomId).emit('user-left', {
        userId: targetUserId,
      });

      if (roomUsers.size === 0) {
        rooms.delete(roomId);
        roomPermissions.delete(roomId);
        roomChats.delete(roomId);
        console.log(`Room ${roomId} deleted (empty after host remove)`);
      }
    });

    // End meeting (host only)
    socket.on('end-meeting', ({ roomId, userId }) => {
      const roomUsers = rooms.get(roomId);
      if (!roomUsers) {
        console.warn(`Room ${roomId} not found`);
        return;
      }

      const user = roomUsers.get(userId);
      if (!user || !user.isHost) {
        console.warn(`User ${userId} attempted to end meeting but is not host`);
        return;
      }

      // Get host name for the message
      const hostName = user.userName || 'Host';

      // Broadcast meeting ended to ALL participants in the room
      io.to(roomId).emit('meeting-ended', {
        roomId,
        endedBy: userId,
        endedByName: hostName,
        message: `${hostName} ended the meeting`,
      });

      console.log(`Meeting ${roomId} ended by host ${hostName} (${userId}). Notifying all ${roomUsers.size} participants.`);

      // Delete the room after a short delay to ensure message is sent
      setTimeout(() => {
        rooms.delete(roomId);
        roomPermissions.delete(roomId);
        roomChats.delete(roomId);
        console.log(`Room ${roomId} deleted after meeting end`);
      }, 1000);
    });

    // User left (generic disconnect)
    socket.on('disconnect', () => {
      // Clean up online users map for chat
      untrackUserSocket(onlineUsersByPhone, socket.userPhone, socket.id);
      untrackUserSocket(onlineUsersById, socket.userId, socket.id);
      if (socket.data && socket.data.deviceId) {
        untrackUserSocket(onlineDevicesById, socket.data.deviceId, socket.id);
      }

      const { roomId, userId } = socket.data;
      if (roomId && userId) {
        // Remove from room
        if (rooms.has(roomId)) {
          rooms.get(roomId).delete(userId);
          if (rooms.get(roomId).size === 0) {
            rooms.delete(roomId);
            roomPermissions.delete(roomId);
            roomChats.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
          }
        }

        // Notify others
        socket.to(roomId).emit('user-left', {
          userId,
        });

        console.log(`User ${userId} left room ${roomId}`);
      }
    });
  });

  return io;
}

function getMetrics() {
  return { ...metrics };
}

module.exports = { createSocketServer, emitToUser, emitToDevice, getMetrics };