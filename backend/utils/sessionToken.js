const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Generate ephemeral session token for WebRTC signaling
 * Short-lived (5 minutes default) and tied to specific session
 */
function generateSessionToken(sessionId, userId, deviceId, expiresInSeconds = 300) {
  const payload = {
    sessionId,
    userId: String(userId),
    deviceId: String(deviceId),
    type: 'webrtc-session',
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: expiresInSeconds,
  });
}

/**
 * Verify session token
 */
function verifySessionToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'webrtc-session') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (err) {
    throw new Error('Invalid or expired session token');
  }
}

/**
 * Generate TURN credentials using HMAC (for coturn long-term credentials)
 */
function generateTurnCredentials(username, ttl = 86400) {
  const secret = process.env.TURN_SECRET;
  if (!secret) {
    return null;
  }

  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const turnUsername = `${timestamp}:${username}`;
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(turnUsername);
  const turnPassword = hmac.digest('base64');

  return {
    username: turnUsername,
    password: turnPassword,
    ttl: timestamp,
  };
}

module.exports = {
  generateSessionToken,
  verifySessionToken,
  generateTurnCredentials,
};