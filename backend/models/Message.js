const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    senderPhone: {
      type: String,
      required: true,
      trim: true,
    },
    receiverPhone: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ senderPhone: 1, receiverPhone: 1, timestamp: 1 });

module.exports = mongoose.model('Message', messageSchema);
