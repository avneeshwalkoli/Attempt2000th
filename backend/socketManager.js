/**
 * Socket.IO Signaling Server for WebRTC
 * Handles all WebRTC signaling events
 */

const { Server } = require('socket.io');

function createSocketServer(server, clientOrigin) {
  const io = new Server(server, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Store room data
  const rooms = new Map(); // Map<roomId, Map<userId, {socketId, userName, isHost}>>

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

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

    // User left
    socket.on('disconnect', () => {
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

module.exports = { createSocketServer };
