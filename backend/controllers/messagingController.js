const Message = require('../models/Message');

/**
 * @desc    Get message history with a specific phone number
 * @route   GET /api/messages/history/:phoneNumber
 * @access  Private
 */
const getHistory = async (req, res) => {
  const { phoneNumber } = req.params;
  const mePhone = `${req.user.countryCode} ${req.user.phoneNumber}`;

  try {
    const otherPhone = phoneNumber.trim();

    const messages = await Message.find({
      $or: [
        { senderPhone: mePhone, receiverPhone: otherPhone },
        { senderPhone: otherPhone, receiverPhone: mePhone },
      ],
    })
      .sort({ timestamp: 1 })
      .lean();

    res.json({ messages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getHistory };
