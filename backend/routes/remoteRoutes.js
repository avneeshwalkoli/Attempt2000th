const express = require('express');
const {
  requestRemoteSession,
  acceptRemoteSession,
  rejectRemoteSession,
  completeRemoteSession,
} = require('../controllers/remoteController');
const { protect } = require('../middleware/authMiddleware');
const { generateTurnCredentials } = require('../utils/sessionToken');

const router = express.Router();

router.post('/request', protect, requestRemoteSession);
router.post('/accept', protect, acceptRemoteSession);
router.post('/reject', protect, rejectRemoteSession);
router.post('/session/:id/complete', protect, completeRemoteSession);
router.post('/complete', protect, completeRemoteSession);

/**
 * GET /api/remote/turn-token
 * Returns TURN/STUN configuration
 */
router.get('/turn-token',  (req, res) => {
  try {
    const username = req.user && req.user._id
      ? req.user._id.toString()
      : 'anonymous';

    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    const hasTurnEnv = process.env.TURN_URL && process.env.TURN_SECRET;

    if (hasTurnEnv && username !== 'anonymous') {
      try {
        const turnCreds = generateTurnCredentials(username, 86400);

        if (turnCreds) {
          iceServers.push({
            urls: process.env.TURN_URL,
            username: turnCreds.username,
            credential: turnCreds.password,
          });
        }
      } catch (err) {
        console.error('[TURN] generateTurnCredentials failed:', err.message);
        // continue with STUN-only
      }
    } else {
      console.warn('[TURN] TURN not configured, using STUN-only');
    }

    return res.json({ iceServers });
  } catch (err) {
    console.error('[TURN] /turn-token route error:', err);
    // Still return STUN so WebRTC can function
    return res.status(200).json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
  }
});

module.exports = router;


