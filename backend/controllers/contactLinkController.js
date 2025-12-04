const ContactLink = require('../models/ContactLink');
const Device = require('../models/Device');
const User = require('../models/User');

/**
 * POST /api/contact-links
 * Creates or updates a saved contact referencing a specific device.
 */
const linkContact = async (req, res) => {
  const ownerUserId = req.user._id;
  const { contactUserId, contactDeviceId, aliasName } = req.body;

  if (!contactUserId || !contactDeviceId) {
    return res.status(400).json({ message: 'contactUserId and contactDeviceId are required' });
  }

  if (String(ownerUserId) === String(contactUserId)) {
    return res.status(400).json({ message: 'Cannot add yourself as a contact' });
  }

  try {
    const contactUser = await User.findById(contactUserId);
    if (!contactUser) {
      return res.status(404).json({ message: 'Contact user not found' });
    }

    const device = await Device.findOne({ deviceId: contactDeviceId, userId: contactUserId, deleted: false });
    if (!device) {
      return res.status(404).json({ message: 'Device not found for contact user' });
    }

    if (device.blocked) {
      return res.status(423).json({ message: 'Contact device is blocked' });
    }

    const link = await ContactLink.findOneAndUpdate(
      { ownerUserId, contactUserId },
      {
        contactDeviceId,
        aliasName: aliasName || contactUser.fullName,
        blocked: false,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await User.updateOne(
      { _id: ownerUserId, 'contacts.contactUserId': contactUserId },
      {
        $set: {
          'contacts.$.savedName': link.aliasName,
          'contacts.$.contactDeviceId': contactDeviceId,
        },
      }
    );

    await User.updateOne(
      { _id: ownerUserId, 'contacts.contactUserId': { $ne: contactUserId } },
      {
        $push: {
          contacts: {
            contactUserId,
            savedName: link.aliasName,
            contactDeviceId,
          },
        },
      }
    );

    res.status(201).json({ contact: link });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/contact-links
 * Returns all saved contacts for the authenticated user.
 */
const listContactLinks = async (req, res) => {
  try {
    const ownerUserId = req.params.ownerUserId || req.user._id;
    if (String(ownerUserId) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const links = await ContactLink.find({
      ownerUserId,
      blocked: false,
    })
      .populate('contactUserId', 'fullName email')
      .sort({ createdAt: -1 });

    const deviceIds = links.map((link) => link.contactDeviceId);
    const devices = await Device.find({ deviceId: { $in: deviceIds } });
    const deviceMap = new Map(devices.map((d) => [d.deviceId, d]));

    res.json({
      contacts: links.map((link) => {
        const device = deviceMap.get(link.contactDeviceId);
        return {
          id: link._id,
          aliasName: link.aliasName,
          contactDeviceId: link.contactDeviceId,
          deviceStatus: device
            ? {
                lastOnline: device.lastOnline,
                blocked: device.blocked,
              }
            : null,
          contactUser: {
            id: link.contactUserId._id,
            fullName: link.contactUserId.fullName,
            email: link.contactUserId.email,
          },
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  linkContact,
  listContactLinks,
};


