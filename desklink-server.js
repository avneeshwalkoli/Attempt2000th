// desklink-server.js - Local-only backend for DeskLink / in-meeting remote control
// -------------------------------------------------------------
// Runs independently of the existing backend/server.js.
// Uses in-memory Maps for sessions and device/user mappings so
// you can test the full "request → accept → session start" flow
// without Render or Mongo.

const http = require('http');
const path = require('path');

// Allow requiring backend dependencies (express, cors, socket.io, jsonwebtoken)
// without touching backend/server.js or its code.
module.paths.push(path.join(__dirname, 'backend', 'node_modules'));

const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// In-memory data stores (local-only, cleared on server restart)
// ---------------------------------------------------------------------------

// Map<sessionId, Session>
// Session shape:
//   {
//     sessionId,
//     controllerUserId,
//     targetUserId,
//     controllerDeviceId,
//     receiverDeviceId,
//     permissions,
//     status: 'requested' | 'accepted' | 'rejected' | 'ended',
//     createdAt,
//     callerToken?,
//     receiverToken?,
//   }
const sessions = new Map();

// Map<userId, Set<socketId>>
const onlineUsersById = new Map();

// Map<deviceId, Set<socketId>>
const onlineDevicesById = new Map();

// Keep a reference to the Socket.IO instance so helpers can emit
let ioInstance = null;

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function generateSessionId() {
  return (
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

function getAuthContextFromReq(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  // Allow overriding via custom headers for testing
  if (req.headers['x-user-id']) {
    return {
      userId: String(req.headers['x-user-id']),
      name: req.headers['x-user-name'] || 'Local User',
    };
  }

  if (!authHeader || typeof authHeader !== 'string') {
    return { userId: 'local-user', name: 'Local User' };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { userId: 'local-user', name: 'Local User' };
  }

  const token = match[1];
  try {
    // Decode WITHOUT verifying signature – this is local-only and we
    // just need the embedded user id from the Render-issued JWT.
    const decoded = jwt.decode(token) || {};
    const userId = decoded.id || decoded._id || decoded.userId;
    const name = decoded.fullName || decoded.name || decoded.phoneNumber || 'User';
    if (userId) {
      return { userId: String(userId), name: String(name) };
    }
  } catch (err) {
    console.warn('[auth] Failed to decode Authorization token:', err.message);
  }

  return { userId: 'local-user', name: 'Local User' };
}

function getClientOrigin() {
  return process.env.CLIENT_ORIGIN || 'http://localhost:5173';
}

function trackSocket(map, key, socketId) {
  if (!key) return;
  const id = String(key);
  if (!map.has(id)) {
    map.set(id, new Set());
  }
  map.get(id).add(socketId);
}

function untrackSocket(map, key, socketId) {
  if (!key) return;
  const id = String(key);
  const set = map.get(id);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) {
    map.delete(id);
  }
}

function emitToUser(userId, event, payload) {
  if (!ioInstance || !userId) return;
  const set = onlineUsersById.get(String(userId));
  if (!set) return;
  set.forEach((socketId) => {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, payload);
    }
  });
}

function emitToDevice(deviceId, event, payload) {
  if (!ioInstance || !deviceId) return;
  const set = onlineDevicesById.get(String(deviceId));
  if (!set) return;
  set.forEach((socketId) => {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, payload);
    }
  });
}

function generateEphemeralToken(kind, sessionId) {
  // NOT a secure token – just something unique-ish for WebRTC wiring.
  return `${kind}-${sessionId}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Express app + REST API
// ---------------------------------------------------------------------------

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// Simple health check so you can verify server is up
app.get('/health', (req, res) => {
  res.json({ status: 'ok', scope: 'desklink-local', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// REST: /api/remote/meeting-request
// ---------------------------------------------------------------------------

// Body: { "toUserId": "target-user-id" }
// Uses: authenticated user as controllerUserId, resolves controllerDeviceId
// via header overrides or simple mock.
app.post('/api/remote/meeting-request', (req, res) => {
  const { userId, name } = getAuthContextFromReq(req);
  const { toUserId } = req.body || {};

  if (!toUserId) {
    return res.status(400).json({ message: 'toUserId is required' });
  }

  const sessionId = generateSessionId();

  // Prefer explicit header from frontend / agent if provided
  const controllerDeviceId =
    (req.headers['x-device-id'] && String(req.headers['x-device-id'])) ||
    (req.headers['x-controller-device-id'] && String(req.headers['x-controller-device-id'])) ||
    `web-${userId}`; // fallback mock based on user

  const session = {
    sessionId,
    controllerUserId: String(userId),
    targetUserId: String(toUserId),
    controllerDeviceId,
    receiverDeviceId: null,
    permissions: {},
    status: 'requested',
    createdAt: Date.now(),
  };

  sessions.set(sessionId, session);

  // Fire the same socket event shape the real backend uses so
  // MeetingRemoteControlContext & DeskLinkPage can reuse it.
  const payload = {
    sessionId,
    fromUserId: String(userId),
    fromDeviceId: controllerDeviceId,
    callerName: name,
    receiverDeviceId: null,
  };

  // Emit legacy + new event name for in-meeting remote access so both
  // existing DeskLink flows and new AnyDesk-style handlers work.
  emitToUser(String(toUserId), 'desklink-remote-request', payload);
  emitToUser(String(toUserId), 'remote-access-request', payload);

  console.log('[meeting-request] created session', sessionId, 'from', userId, '\u2192', toUserId);

  return res.status(201).json({ session: { sessionId } });
});

// ---------------------------------------------------------------------------
// REST: /api/remote/accept
// ---------------------------------------------------------------------------

// Body: { sessionId, receiverDeviceId, permissions }
app.post('/api/remote/accept', (req, res) => {
  const { userId } = getAuthContextFromReq(req);
  const { sessionId, receiverDeviceId, permissions } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ message: 'Session not found' });
  }

  // Basic ownership guard: only target user can accept
  if (session.targetUserId && String(session.targetUserId) !== String(userId)) {
    return res.status(403).json({ message: 'Not authorized to accept this session' });
  }

  if (session.status !== 'requested') {
    return res.status(400).json({ message: 'Session is not in requested state' });
  }

  const effectiveReceiverDeviceId =
    (receiverDeviceId && String(receiverDeviceId)) ||
    session.receiverDeviceId ||
    `agent-${userId}`;

  session.status = 'accepted';
  session.receiverDeviceId = effectiveReceiverDeviceId;
  session.permissions = {
    ...(session.permissions || {}),
    ...(permissions || {}),
  };

  const callerToken = generateEphemeralToken('caller', sessionId);
  const receiverToken = generateEphemeralToken('receiver', sessionId);

  session.callerToken = callerToken;
  session.receiverToken = receiverToken;

  const sessionMetadata = {
    sessionId: session.sessionId,
    callerDeviceId: session.controllerDeviceId,
    receiverDeviceId: session.receiverDeviceId,
    permissions: session.permissions,
  };

  // Notify viewer (web controller) to start WebRTC
  emitToUser(session.controllerUserId, 'desklink-session-start', {
    ...sessionMetadata,
    token: callerToken,
    role: 'caller',
  });

  // Notify host agent / device to start WebRTC
  emitToDevice(session.receiverDeviceId, 'desklink-session-start', {
    ...sessionMetadata,
    token: receiverToken,
    role: 'receiver',
  });

  // Back-compat: remote response event used by DeskLinkPage → RemoteViewerPage
  emitToUser(session.controllerUserId, 'desklink-remote-response', {
    sessionId: session.sessionId,
    status: 'accepted',
    viewerDeviceId: session.controllerDeviceId,
    hostDeviceId: session.receiverDeviceId,
    callerToken,
  });

  // New-style event name for in-meeting remote access
  emitToUser(session.controllerUserId, 'remote-access-accepted', {
    sessionId: session.sessionId,
    receiverDeviceId: session.receiverDeviceId,
    permissions: session.permissions,
  });

  console.log('[accept] session accepted', sessionId, 'host device', session.receiverDeviceId);

  return res.json({ session, callerToken, receiverToken });
});

// ---------------------------------------------------------------------------
// REST: /api/remote/reject
// ---------------------------------------------------------------------------

app.post('/api/remote/reject', (req, res) => {
  const { userId } = getAuthContextFromReq(req);
  const { sessionId } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ message: 'Session not found' });
  }

  if (session.targetUserId && String(session.targetUserId) !== String(userId)) {
    return res.status(403).json({ message: 'Not authorized to reject this session' });
  }

  session.status = 'rejected';

  emitToUser(session.controllerUserId, 'desklink-remote-response', {
    sessionId: session.sessionId,
    status: 'rejected',
  });

  // New-style event name for in-meeting remote access
  emitToUser(session.controllerUserId, 'remote-access-rejected', {
    sessionId: session.sessionId,
  });

  console.log('[reject] session rejected', sessionId);

  return res.json({ session });
});

// ---------------------------------------------------------------------------
// REST: /api/remote/complete (optional but used by RemoteViewerPage)
// ---------------------------------------------------------------------------

app.post(['/api/remote/complete', '/api/remote/session/:id/complete'], (req, res) => {
  const { userId } = getAuthContextFromReq(req);
  const paramId = req.params && req.params.id;
  const bodyId = req.body && req.body.sessionId;
  const sessionId = paramId || bodyId;

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ message: 'Session not found' });
  }

  if (
    session.controllerUserId &&
    String(session.controllerUserId) !== String(userId) &&
    session.targetUserId &&
    String(session.targetUserId) !== String(userId)
  ) {
    return res.status(403).json({ message: 'Not authorized to complete this session' });
  }

  session.status = 'ended';

  emitToUser(session.controllerUserId, 'desklink-remote-response', {
    sessionId: session.sessionId,
    status: 'ended',
  });
  if (session.targetUserId) {
    emitToUser(session.targetUserId, 'desklink-remote-response', {
      sessionId: session.sessionId,
      status: 'ended',
    });
  }

  console.log('[complete] session ended', sessionId);

  return res.json({ session });
});

// ---------------------------------------------------------------------------
// REST: /api/remote/turn-token
// ---------------------------------------------------------------------------

// Local-only STUN config – no TURN needed.
app.get('/api/remote/turn-token', (req, res) => {
  return res.json({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });
});

// ---------------------------------------------------------------------------
// Socket.IO server (local signaling for DeskLink + meetings)
// ---------------------------------------------------------------------------

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: getClientOrigin(),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  path: '/socket.io',
});

ioInstance = io;

// VERY lightweight auth: decode JWT to get userId, but do not verify.
io.use((socket, next) => {
  try {
    const auth = socket.handshake.auth || {};
    const token = auth.token;

    let userId = 'local-user';
    if (token && token !== 'null' && token !== 'undefined') {
      const decoded = jwt.decode(token) || {};
      userId = String(decoded.id || decoded._id || decoded.userId || 'local-user');
    }

    socket.data.userId = userId;
    trackSocket(onlineUsersById, userId, socket.id);

    return next();
  } catch (err) {
    console.error('[socket-auth] error', err && err.message);
    return next(new Error('socket auth failed'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  console.log('[socket] connected', socket.id, 'user', userId);
  console.log('[socket] onlineUsersById keys now:', Array.from(onlineUsersById.keys()));

  // -----------------------------
  // DeskLink device registration
  // -----------------------------
  socket.on('register', ({ deviceId }) => {
    if (!deviceId) return;
    const devId = String(deviceId);
    socket.data.deviceId = devId;
    trackSocket(onlineDevicesById, devId, socket.id);
    console.log('[device] registered', devId, 'for user', userId);
  });

  // -----------------------------
  // WebRTC signaling for DeskLink
  // -----------------------------

  socket.on('webrtc-offer', ({ sessionId, fromUserId, fromDeviceId, toDeviceId, sdp, token }) => {
    if (!sessionId || !toDeviceId) return;
    const session = sessions.get(sessionId);
    if (!session) {
      console.warn('[webrtc-offer] unknown session', sessionId);
      return;
    }

    const payload = {
      sessionId,
      fromUserId,
      fromDeviceId,
      toDeviceId,
      sdp,
      token,
    };

    console.log('[webrtc-offer] relay', sessionId, 'from', fromDeviceId, '→', toDeviceId);
    emitToDevice(toDeviceId, 'webrtc-offer', payload);
  });

  socket.on('webrtc-answer', ({ sessionId, fromUserId, fromDeviceId, toDeviceId, sdp, token }) => {
    if (!sessionId || !toDeviceId) return;
    const session = sessions.get(sessionId);
    if (!session) {
      console.warn('[webrtc-answer] unknown session', sessionId);
      return;
    }

    const payload = {
      sessionId,
      fromUserId,
      fromDeviceId,
      toDeviceId,
      sdp,
      token,
    };

    console.log('[webrtc-answer] relay', sessionId, 'from', fromDeviceId, '→', toDeviceId);
    emitToDevice(toDeviceId, 'webrtc-answer', payload);
  });

  socket.on('webrtc-ice', ({ sessionId, fromUserId, fromDeviceId, toDeviceId, candidate, token }) => {
    if (!sessionId || !toDeviceId || !candidate) return;
    const session = sessions.get(sessionId);
    if (!session) return; // silently ignore

    const payload = {
      sessionId,
      fromUserId,
      fromDeviceId,
      toDeviceId,
      candidate,
      token,
    };

    emitToDevice(toDeviceId, 'webrtc-ice', payload);
  });

  socket.on('webrtc-cancel', ({ sessionId, fromUserId }) => {
    if (!sessionId) return;
    const session = sessions.get(sessionId);
    if (!session) return;

    session.status = 'ended';

    const payload = { sessionId };

    if (session.controllerUserId) emitToUser(session.controllerUserId, 'webrtc-cancel', payload);
    if (session.targetUserId) emitToUser(session.targetUserId, 'webrtc-cancel', payload);
    if (session.controllerDeviceId) emitToDevice(session.controllerDeviceId, 'webrtc-cancel', payload);
    if (session.receiverDeviceId) emitToDevice(session.receiverDeviceId, 'webrtc-cancel', payload);

    console.log('[webrtc-cancel] session', sessionId, 'cancelled by', fromUserId);
  });

  // -----------------------------
  // Basic meeting signaling subset
  // (copied from backend/socketManager but DB-free)
  // -----------------------------

  const rooms = io.roomsData || (io.roomsData = new Map()); // Map<roomId, Map<userId, {socketId,userName,isHost,authUserId}>>
  const roomPermissions = io.roomPermissions || (io.roomPermissions = new Map());
  const roomChats = io.roomChats || (io.roomChats = new Map());

  socket.on('user-joined', ({ roomId, userId: meetingUserId, userName, isHost }) => {
    if (!roomId || !meetingUserId) return;

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.meetingUserId = meetingUserId;
    socket.data.userName = userName;
    socket.data.isHost = !!isHost;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    rooms.get(roomId).set(meetingUserId, {
      socketId: socket.id,
      userName,
      isHost: !!isHost,
      authUserId: socket.data.userId,
    });

    const existingUsers = Array.from(rooms.get(roomId).entries())
      .filter(([uid]) => uid !== meetingUserId)
      .map(([uid, data]) => ({
        userId: uid,
        userName: data.userName,
        isHost: data.isHost,
        authUserId: data.authUserId,
      }));

    socket.emit('room-users', existingUsers);

    const existingChat = roomChats.get(roomId);
    if (existingChat && existingChat.length > 0) {
      socket.emit('meeting-chat-history', {
        roomId,
        messages: existingChat,
      });
    }

    const perms = roomPermissions.get(roomId);
    if (perms) {
      socket.emit('host_permissions', {
        roomId,
        micLocked: !!perms.micLocked,
        cameraLocked: !!perms.cameraLocked,
        chatDisabled: !!perms.chatDisabled,
      });
    }

    socket.to(roomId).emit('user-joined', {
      userId: meetingUserId,
      userName,
      isHost: !!isHost,
      authUserId: socket.data.userId,
    });

    console.log(`[meeting] user ${userName} (${meetingUserId}) joined room ${roomId}`);
  });

  socket.on('offer', ({ roomId, to, offer }) => {
    const roomUsers = rooms.get(roomId);
    if (!roomUsers) return;
    const targetUser = roomUsers.get(to);
    if (!targetUser) return;
    const targetSocket = io.sockets.sockets.get(targetUser.socketId);
    if (targetSocket) {
      targetSocket.emit('offer', {
        from: socket.data.meetingUserId,
        offer,
      });
    }
  });

  socket.on('answer', ({ roomId, to, answer }) => {
    const roomUsers = rooms.get(roomId);
    if (!roomUsers) return;
    const targetUser = roomUsers.get(to);
    if (!targetUser) return;
    const targetSocket = io.sockets.sockets.get(targetUser.socketId);
    if (targetSocket) {
      targetSocket.emit('answer', {
        from: socket.data.meetingUserId,
        answer,
      });
    }
  });

  socket.on('ice-candidate', ({ roomId, to, candidate }) => {
    const roomUsers = rooms.get(roomId);
    if (!roomUsers) return;
    const targetUser = roomUsers.get(to);
    if (!targetUser) return;
    const targetSocket = io.sockets.sockets.get(targetUser.socketId);
    if (targetSocket) {
      targetSocket.emit('ice-candidate', {
        from: socket.data.meetingUserId,
        candidate,
      });
    }
  });

  socket.on('screen-share-started', ({ roomId, userId: uid }) => {
    socket.to(roomId).emit('screen-share-started', { userId: uid });
  });

  socket.on('screen-share-stopped', ({ roomId, userId: uid }) => {
    socket.to(roomId).emit('screen-share-stopped', { userId: uid });
  });

  socket.on('audio-mute', ({ roomId, userId: uid }) => {
    socket.to(roomId).emit('audio-mute', { userId: uid });
  });

  socket.on('audio-unmute', ({ roomId, userId: uid }) => {
    socket.to(roomId).emit('audio-unmute', { userId: uid });
  });

  socket.on('video-mute', ({ roomId, userId: uid }) => {
    socket.to(roomId).emit('video-mute', { userId: uid });
  });

  socket.on('video-unmute', ({ roomId, userId: uid }) => {
    socket.to(roomId).emit('video-unmute', { userId: uid });
  });

  socket.on('meeting-chat-message', ({ roomId, userId: uid, userName, text, ts }) => {
    if (!roomId || !text) return;

    const message = {
      roomId,
      userId: uid,
      userName: userName || 'Participant',
      text: String(text).trim(),
      ts: ts || Date.now(),
    };

    if (!roomChats.has(roomId)) roomChats.set(roomId, []);
    const list = roomChats.get(roomId);
    list.push(message);
    if (list.length > 200) list.splice(0, list.length - 200);

    io.to(roomId).emit('meeting-chat-message', message);
  });

  socket.on('meeting-chat-history', ({ roomId }) => {
    const list = roomChats.get(roomId) || [];
    socket.emit('meeting-chat-history', { roomId, messages: list });
  });

  socket.on('reaction', ({ roomId, userId: uid, userName, emoji, ts }) => {
    if (!roomId || !emoji) return;
    io.to(roomId).emit('reaction', {
      roomId,
      userId: uid,
      userName: userName || 'Participant',
      emoji: String(emoji),
      ts: ts || Date.now(),
    });
  });

  socket.on('end-meeting', ({ roomId, userId: uid }) => {
    const roomUsers = rooms.get(roomId);
    if (!roomUsers) return;
    const user = roomUsers.get(uid);
    if (!user || !user.isHost) return;

    const hostName = user.userName || 'Host';

    io.to(roomId).emit('meeting-ended', {
      roomId,
      endedBy: uid,
      endedByName: hostName,
      message: `${hostName} ended the meeting`,
    });

    setTimeout(() => {
      rooms.delete(roomId);
      roomPermissions.delete(roomId);
      roomChats.delete(roomId);
      console.log('[meeting] room deleted after end', roomId);
    }, 1000);
  });

  socket.on('disconnect', () => {
    console.log('[socket] disconnected', socket.id, 'user', userId);

    untrackSocket(onlineUsersById, socket.data.userId, socket.id);
    if (socket.data.deviceId) {
      untrackSocket(onlineDevicesById, socket.data.deviceId, socket.id);
    }

    const roomId = socket.data.roomId;
    const meetingUserId = socket.data.meetingUserId;

    if (roomId && meetingUserId) {
      const roomUsers = rooms.get(roomId);
      if (roomUsers) {
        roomUsers.delete(meetingUserId);
        if (roomUsers.size === 0) {
          rooms.delete(roomId);
          roomPermissions.delete(roomId);
          roomChats.delete(roomId);
          console.log('[meeting] room deleted (empty)', roomId);
        }
      }

      socket.to(roomId).emit('user-left', { userId: meetingUserId });
    }
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`DeskLink server running on port ${PORT}`);
});

server.listen(PORT, () => {
  console.log(`DeskLink local server listening on http://localhost:${PORT}`);
  console.log('REST base:   http://localhost:%d/api/remote', PORT);
  console.log('Socket path: http://localhost:%d/socket.io', PORT);
});
