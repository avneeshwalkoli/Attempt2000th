const express = require('express');
const router = express.Router();
const { provisionAgentToken } = require('../controllers/agentProvisionController');

// POST /api/agent/provision
router.post('/provision', provisionAgentToken);

module.exports = router;
