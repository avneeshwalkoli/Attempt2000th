// server.js

const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const contactsRoutes = require('./routes/contactsRoutes');
const messagingRoutes = require('./routes/messagingRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const contactLinkRoutes = require('./routes/contactLinkRoutes');
const remoteRoutes = require('./routes/remoteRoutes');
const { createSocketServer } = require('./socketManager');

// Load environment variables
dotenv.config();

// Connect to the database
connectDB();

// Initialize Express app
const app = express();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Middleware
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/messages', messagingRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/contact-links', contactLinkRoutes);
app.use('/api/remote', remoteRoutes);

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
createSocketServer(server, CLIENT_ORIGIN);

// Define the port
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
