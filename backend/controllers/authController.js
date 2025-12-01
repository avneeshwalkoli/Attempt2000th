// controllers/authController.js

const User = require('../models/User');
const generateToken = require('../utils/generateToken');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/signup
 * @access  Public
 */
const signup = async (req, res) => {
  const { fullName, email, password, countryCode, phoneNumber } = req.body;

  try {
    if (!fullName || !email || !password || !countryCode || !phoneNumber) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingByPhone = await User.findOne({ countryCode, phoneNumber });
    if (existingByPhone) {
      return res.status(400).json({ message: 'Phone number already registered' });
    }

    const existingByEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingByEmail) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password,
      countryCode: countryCode.trim(),
      phoneNumber: phoneNumber.trim(),
    });

    const token = generateToken(user._id);

    res.status(201).json({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        countryCode: user.countryCode,
        phoneNumber: user.phoneNumber,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Auth user by phone & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  const { countryCode, phoneNumber, password } = req.body;

  try {
    if (!countryCode || !phoneNumber || !password) {
      return res.status(400).json({ message: 'Country code, phone number and password are required' });
    }

    const user = await User.findOne({ countryCode, phoneNumber }).select('+password');

    if (!user) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    const token = generateToken(user._id);

    res.json({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        countryCode: user.countryCode,
        phoneNumber: user.phoneNumber,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get current authenticated user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  res.json({
    user: {
      id: req.user._id,
      fullName: req.user.fullName,
      email: req.user.email,
      countryCode: req.user.countryCode,
      phoneNumber: req.user.phoneNumber,
    },
  });
};

module.exports = { signup, login, getMe };
