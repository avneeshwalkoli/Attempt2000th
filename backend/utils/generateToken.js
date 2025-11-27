// utils/generateToken.js

const jwt = require('jsonwebtoken');

/**
 * Generates a JWT for a given user ID.
 * @param {string} id - The user's ID.
 * @returns {string} - The generated JWT.
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d', // Token expires in 30 days
  });
};

module.exports = generateToken;
