const express = require('express');
const { registerDevice, setDeviceBlock, softDeleteDevice } = require('../controllers/deviceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', protect, registerDevice);
router.patch('/:deviceId/block', protect, setDeviceBlock);
router.delete('/:deviceId', protect, softDeleteDevice);

module.exports = router;


