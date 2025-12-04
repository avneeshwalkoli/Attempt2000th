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
router.get('/turn-token', protect, (req, res) => {
  const username = req.user._id.toString();
  const turnCreds = generateTurnCredentials(username, 86400);

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  if (turnCreds && process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: turnCreds.username,
      credential: turnCreds.password,
    });
  }

  res.json({ iceServers });
});

module.exports = router;


