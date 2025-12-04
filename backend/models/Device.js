const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    osInfo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    lastOnline: {
      type: Date,
      default: Date.now,
      index: true,
    },
    registeredAt: {
      type: Date,
      default: Date.now,
    },
    blocked: {
      type: Boolean,
      default: false,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

deviceSchema.index({ userId: 1, deviceId: 1 });

module.exports = mongoose.model('Device', deviceSchema);


