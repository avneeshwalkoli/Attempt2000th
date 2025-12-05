const jwt = require('jsonwebtoken');
const User = require('../models/User');

// POST /api/agent/provision
// Requires Authorization: Bearer <userLoginJWT>
// Returns an agent JWT that can be used by DeskLinkAgent to authenticate to Socket.IO
module.exports.provisionAgentToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');

    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('_id');

    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    const payload = { id: user._id.toString(), agent: true };

    const agentJwt = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '24h',
    });

    return res.json({ agentJwt, ownerUserId: user._id.toString() });
  } catch (err) {
    console.error('[agent-provision] error', err && err.message);
    return res.status(401).json({ message: 'Not authorized' });
  }
};
