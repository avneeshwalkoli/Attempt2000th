const mongoose = require('mongoose');

const remoteSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    callerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiverUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    callerDeviceId: {
      type: String,
      required: true,
    },
    receiverDeviceId: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'ended'],
      default: 'pending',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

remoteSessionSchema.index({ callerUserId: 1, receiverUserId: 1, status: 1 });

module.exports = mongoose.model('RemoteSession', remoteSessionSchema);


