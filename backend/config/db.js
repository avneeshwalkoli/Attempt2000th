// config/db.js

const mongoose = require('mongoose');

/**
 * Establishes a connection to the MongoDB database.
 */
const connectDB = async () => {
  try {
    // Attempt to connect to the database using the URI from environment variables
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // Log any errors that occur during connection and exit the process
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
