/**
 * Socket.IO Server
 * - WebRTC signaling for Meet
 * - Realtime private messaging for ChatSpace
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Message = require('./models/Message');

let ioInstance = null;
const onlineUsersByPhone = new Map(); // Map<phoneString, Set<socketId>>
const onlineUsersById = new Map(); // Map<userId, Set<socketId>>

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

  // Authenticate socket connections using the same JWT as HTTP routes
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
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
      console.error('[socket] auth error', err.message);
      return next(new Error('Not authorized, token failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id, socket.userPhone);

    trackUserSocket(onlineUsersByPhone, socket.userPhone, socket.id);
    trackUserSocket(onlineUsersById, socket.userId, socket.id);

    /**
     * ======================
     * Realtime Chat Messaging
     * ======================
     *
     * Frontend emits: 'private-message' with { to, text }
     * - `to` is the full phone string "CC PHONE"
     * - We persist the message in MongoDB
     * - Then emit the saved message to both sender and receiver
     */
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

        // Send back to sender (so it appears immediately in their chat)
        socket.emit('private-message', msg);

        // Deliver to all connected sockets of the receiver
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
      socket.to(roomId).emit('video-unmute', {
        userId,
      });
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

      // Broadcast meeting ended to ALL participants in the room (including host)
      // Using io.to(roomId) ensures everyone in the room receives the message
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
        console.log(`Room ${roomId} deleted after meeting end`);
      }, 1000);
    });

    // User left (generic disconnect)
    socket.on('disconnect', () => {
      // Clean up online users map for chat
      untrackUserSocket(onlineUsersByPhone, socket.userPhone, socket.id);
      untrackUserSocket(onlineUsersById, socket.userId, socket.id);

      const { roomId, userId } = socket.data;
      if (roomId && userId) {
        // Remove from room
        if (rooms.has(roomId)) {
          rooms.get(roomId).delete(userId);
          if (rooms.get(roomId).size === 0) {
            rooms.delete(roomId);
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

module.exports = { createSocketServer, emitToUser };
