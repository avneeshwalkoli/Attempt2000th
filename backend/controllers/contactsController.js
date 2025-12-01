const Contact = require('../models/Contact');
const User = require('../models/User');

/**
 * @desc    Add a contact by phone number
 * @route   POST /api/contacts/add
 * @access  Private
 */
const addContact = async (req, res) => {
  const { phoneNumber, countryCode } = req.body;

  try {
    if (!phoneNumber) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const code = (countryCode || req.user.countryCode || '').trim();
    const phone = phoneNumber.trim();

    const contactUser = await User.findOne({ countryCode: code, phoneNumber: phone });
    if (!contactUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (String(contactUser._id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot add yourself as a contact' });
    }

    const existing = await Contact.findOne({ ownerId: req.user._id, contactUserId: contactUser._id });
    if (existing) {
      return res.status(400).json({ message: 'Contact already exists' });
    }

    const contact = await Contact.create({
      ownerId: req.user._id,
      contactUserId: contactUser._id,
      saved: true,
    });

    res.status(201).json({
      contact: {
        id: contact._id,
        user: {
          id: contactUser._id,
          fullName: contactUser.fullName,
          countryCode: contactUser.countryCode,
          phoneNumber: contactUser.phoneNumber,
          email: contactUser.email,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get logged-in user's contacts
 * @route   GET /api/contacts/list
 * @access  Private
 */
const listContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({ ownerId: req.user._id })
      .populate('contactUserId', 'fullName email countryCode phoneNumber')
      .sort({ createdAt: -1 });

    const formatted = contacts.map((c) => ({
      id: c._id,
      user: {
        id: c.contactUserId._id,
        fullName: c.contactUserId.fullName,
        email: c.contactUserId.email,
        countryCode: c.contactUserId.countryCode,
        phoneNumber: c.contactUserId.phoneNumber,
      },
      createdAt: c.createdAt,
    }));

    res.json({ contacts: formatted });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { addContact, listContacts };
