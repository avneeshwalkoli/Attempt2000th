const express = require('express');
const { getHistory } = require('../controllers/messagingController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/history/:phoneNumber', protect, getHistory);

module.exports = router;
