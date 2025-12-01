const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Message = require('./models/Message');
const User = require('./models/User');
const Contact = require('./models/Contact');

function createSocketServer(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication token missing'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = {
        id: user._id.toString(),
        fullName: user.fullName,
        countryCode: user.countryCode,
        phoneNumber: user.phoneNumber,
      };

      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userPhone = `${socket.user.countryCode} ${socket.user.phoneNumber}`;

    socket.join(userPhone);

    socket.on('private-message', async (payload) => {
      try {
        const text = String(payload.text || '').trim();
        const toPhone = String(payload.to || '').trim();
        if (!text || !toPhone) return;

        const sanitizedText = text.slice(0, 5000);

        const msg = await Message.create({
          senderPhone: userPhone,
          receiverPhone: toPhone,
          text: sanitizedText,
          timestamp: new Date(),
        });

        // Ensure receiver has an (unsaved) contact entry for sender
        try {
          const receiverUser = await User.findOne({
            countryCode: toPhone.split(' ')[0],
            phoneNumber: toPhone.split(' ').slice(1).join(' '),
          });

          if (receiverUser) {
            const senderUser = await User.findOne({
              countryCode: socket.user.countryCode,
              phoneNumber: socket.user.phoneNumber,
            });

            if (senderUser) {
              const existingContact = await Contact.findOne({
                ownerId: receiverUser._id,
                contactUserId: senderUser._id,
              });

              if (!existingContact) {
                await Contact.create({
                  ownerId: receiverUser._id,
                  contactUserId: senderUser._id,
                  saved: false,
                });
              }
            }
          }
        } catch (contactErr) {
          console.error('Error ensuring unsaved contact for receiver', contactErr.message);
        }

        const messageForClient = {
          id: msg._id,
          senderPhone: msg.senderPhone,
          receiverPhone: msg.receiverPhone,
          text: msg.text,
          timestamp: msg.timestamp,
        };

        io.to(userPhone).to(toPhone).emit('private-message', messageForClient);
      } catch (err) {
        console.error('Error handling private-message', err.message);
      }
    });

    socket.on('disconnect', () => {
      // Cleanup or logging if needed
    });
  });

  return io;
}

module.exports = { createSocketServer };
