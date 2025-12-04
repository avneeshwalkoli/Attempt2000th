const mongoose = require('mongoose');
const RemoteSession = require('../models/RemoteSession');
const Device = require('../models/Device');
const ContactLink = require('../models/ContactLink');
const { emitToUser, emitToDevice } = require('../socketManager');
const { generateSessionToken } = require('../utils/sessionToken');

const ensureDeviceOwnership = async (deviceId, userId) => {
  const device = await Device.findOne({ deviceId, deleted: false });
  if (!device) {
    throw new Error('Device not found');
  }
  if (String(device.userId) !== String(userId)) {
    throw new Error('Device does not belong to user');
  }
  if (device.blocked) {
    throw new Error('Device is blocked');
  }
  return device;
};

/**
 * POST /api/remote/request
 * Creates a remote session request.
 */
// simple in-memory request throttle: Map<userId, timestamp>
const lastRequestAt = new Map();

const requestRemoteSession = async (req, res) => {
  const { fromUserId, fromDeviceId, toUserId } = req.body;

  if (!fromUserId || !fromDeviceId || !toUserId) {
    return res.status(400).json({ message: 'fromUserId, fromDeviceId, and toUserId are required' });
  }

  if (String(req.user._id) !== String(fromUserId)) {
    return res.status(403).json({ message: 'Forbidden: mismatched user context' });
  }

  if (String(fromUserId) === String(toUserId)) {
    return res.status(400).json({ message: 'Cannot start a session with yourself' });
  }

  try {
    const now = Date.now();
    const lastAt = lastRequestAt.get(String(fromUserId)) || 0;
    if (now - lastAt < 1000) {
      return res.status(429).json({ message: 'Too many requests' });
    }
    lastRequestAt.set(String(fromUserId), now);

    await ensureDeviceOwnership(fromDeviceId, fromUserId);

    let receiverDevice = await ContactLink.findOne({
      ownerUserId: fromUserId,
      contactUserId: toUserId,
      blocked: false,
    });

    if (receiverDevice) {
      receiverDevice = await Device.findOne({
        deviceId: receiverDevice.contactDeviceId,
        deleted: false,
        blocked: false,
      });
    } else {
      receiverDevice = await Device.findOne({
        userId: toUserId,
        deleted: false,
        blocked: false,
      }).sort({ lastOnline: -1 });
    }

    if (!receiverDevice) {
      return res.status(404).json({ message: 'Receiver device not found or offline' });
    }

    const session = await RemoteSession.create({
      sessionId: new mongoose.Types.ObjectId().toString(),
      callerUserId: fromUserId,
      receiverUserId: toUserId,
      callerDeviceId: fromDeviceId,
      receiverDeviceId: receiverDevice.deviceId,
      status: 'pending',
      startedAt: new Date(),
    });

    emitToUser(toUserId, 'desklink-remote-request', {
      sessionId: session.sessionId,
      fromUserId,
      fromDeviceId,
      callerName: req.user.fullName,
      receiverDeviceId: session.receiverDeviceId,
    });
    // Also emit aliased event names per Part 2 spec
    emitToUser(toUserId, 'desklink-remote-request', {
      sessionId: session.sessionId,
      fromUserId,
      fromDeviceId,
      callerName: req.user.fullName,
      receiverDeviceId: session.receiverDeviceId,
    });

    res.status(201).json({ session });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /api/remote/accept
 */
const acceptRemoteSession = async (req, res) => {
  const { sessionId, receiverDeviceId, permissions, selectedMonitor, resolution } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  try {
    const session = await RemoteSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ message: 'Session is not pending' });
    }

    if (String(session.receiverUserId) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to accept this session' });
    }

    if (receiverDeviceId) {
      await ensureDeviceOwnership(receiverDeviceId, req.user._id);
      session.receiverDeviceId = receiverDeviceId;
    }

    // Generate ephemeral session tokens for both parties
    const callerToken = generateSessionToken(sessionId, session.callerUserId, session.callerDeviceId, 300);
    const receiverToken = generateSessionToken(sessionId, session.receiverUserId, session.receiverDeviceId, 300);

    // Update session with permissions and metadata
    session.status = 'accepted';
    session.sessionToken = receiverToken;
    if (permissions) {
      session.permissions = { ...session.permissions, ...permissions };
    }
    if (selectedMonitor !== undefined) {
      session.selectedMonitor = selectedMonitor;
    }
    if (resolution) {
      session.resolution = resolution;
    }
    session.audit.push({
      event: 'accepted',
      userId: req.user._id,
      details: { permissions, selectedMonitor, resolution },
    });
    await session.save();

    // Emit session start to both parties with full metadata
    const sessionMetadata = {
      sessionId: session.sessionId,
      callerDeviceId: session.callerDeviceId,
      receiverDeviceId: session.receiverDeviceId,
      permissions: session.permissions,
      selectedMonitor: session.selectedMonitor,
      resolution: session.resolution,
    };

    emitToUser(session.callerUserId, 'desklink-session-start', {
      ...sessionMetadata,
      token: callerToken,
      role: 'caller',
    });
    emitToDevice(session.receiverDeviceId, 'desklink-session-start', {
      ...sessionMetadata,
      token: receiverToken,
      role: 'receiver',
    });

    // Legacy events for backward compatibility
    emitToUser(session.callerUserId, 'desklink-remote-response', {
      sessionId: session.sessionId,
      status: 'accepted',
      receiverDeviceId: session.receiverDeviceId,
    });
    emitToUser(session.callerUserId, 'desklink-remote-accepted', {
      sessionId: session.sessionId,
      receiverDeviceId: session.receiverDeviceId,
    });

    res.json({ session, callerToken, receiverToken });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /api/remote/reject
 */
const rejectRemoteSession = async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  try {
    const session = await RemoteSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ message: 'Session is not pending' });
    }

    if (String(session.receiverUserId) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to reject this session' });
    }

    session.status = 'rejected';
    session.endedAt = new Date();
    session.audit.push({
      event: 'rejected',
      userId: req.user._id,
      details: {},
    });
    await session.save();

    emitToUser(session.callerUserId, 'desklink-remote-response', {
      sessionId: session.sessionId,
      status: 'rejected',
    });
    emitToUser(session.callerUserId, 'desklink-remote-rejected', {
      sessionId: session.sessionId,
    });

    res.json({ session });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /api/remote/session/:id/complete
 */
const completeRemoteSession = async (req, res) => {
  const { id } = req.params;
  const sessionIdFromBody = req.body && req.body.sessionId;
  const sessionId = id || sessionIdFromBody;
  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  try {
    const session = await RemoteSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const userId = req.user._id;
    if (String(session.callerUserId) !== String(userId) && String(session.receiverUserId) !== String(userId)) {
      return res.status(403).json({ message: 'Not authorized to complete this session' });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    session.audit.push({
      event: 'ended',
      userId: req.user._id,
      details: {},
    });
    await session.save();

    emitToUser(session.callerUserId, 'desklink-remote-response', {
      sessionId: session.sessionId,
      status: 'ended',
    });
    emitToUser(session.receiverUserId, 'desklink-remote-response', {
      sessionId: session.sessionId,
      status: 'ended',
    });
    emitToUser(session.callerUserId, 'desklink-session-ended', { sessionId: session.sessionId });
    emitToUser(session.receiverUserId, 'desklink-session-ended', { sessionId: session.sessionId });

    res.json({ session });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  requestRemoteSession,
  acceptRemoteSession,
  rejectRemoteSession,
  completeRemoteSession,
};


