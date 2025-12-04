const mongoose = require('mongoose');

const contactLinkSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    contactUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    contactDeviceId: {
      type: String,
      required: true,
      trim: true,
    },
    aliasName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    blocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

contactLinkSchema.index({ ownerUserId: 1, contactUserId: 1 }, { unique: true });

module.exports = mongoose.model('ContactLink', contactLinkSchema);


