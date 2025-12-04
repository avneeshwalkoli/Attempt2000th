const express = require('express');
const {
  requestRemoteSession,
  acceptRemoteSession,
  rejectRemoteSession,
  completeRemoteSession,
} = require('../controllers/remoteController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/request', protect, requestRemoteSession);
router.post('/accept', protect, acceptRemoteSession);
router.post('/reject', protect, rejectRemoteSession);
router.post('/session/:id/complete', protect, completeRemoteSession);

module.exports = router;


