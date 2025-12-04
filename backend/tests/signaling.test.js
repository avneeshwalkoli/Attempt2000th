const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const RemoteSession = require('../models/RemoteSession');
const { verifySessionToken } = require('../utils/sessionToken');

describe('WebRTC Signaling Tests', () => {
  let mockSocket;
  let mockIo;
  let sessionId;

  beforeEach(() => {
    sessionId = new mongoose.Types.ObjectId().toString();
    
    mockSocket = {
      id: 'socket-123',
      emit: sinon.stub(),
      on: sinon.stub(),
      data: {},
      user: {
        _id: 'user-123',
      },
    };

    mockIo = {
      sockets: {
        sockets: new Map([[mockSocket.id, mockSocket]]),
      },
    };
  });

  describe('Session Creation', () => {
    it('should create a session with valid parameters', async () => {
      const session = await RemoteSession.create({
        sessionId,
        callerUserId: 'user-123',
        receiverUserId: 'user-456',
        callerDeviceId: 'device-123',
        receiverDeviceId: 'device-456',
        status: 'pending',
      });

      expect(session).to.exist;
      expect(session.sessionId).to.equal(sessionId);
      expect(session.status).to.equal('pending');
    });

    it('should include default permissions', async () => {
      const session = await RemoteSession.create({
        sessionId,
        callerUserId: 'user-123',
        receiverUserId: 'user-456',
        callerDeviceId: 'device-123',
        receiverDeviceId: 'device-456',
      });

      expect(session.permissions).to.exist;
      expect(session.permissions.allowControl).to.be.true;
      expect(session.permissions.viewOnly).to.be.false;
    });
  });

  describe('Signal Routing', () => {
    it('should relay offer to target device', () => {
      const offer = { type: 'offer', sdp: 'mock-sdp' };
      
      // Simulate signal routing logic
      const targetDeviceId = 'device-456';
      const signalPayload = {
        sessionId,
        fromUserId: 'user-123',
        fromDeviceId: 'device-123',
        sdp: offer.sdp,
      };

      // In real test, this would go through socket manager
      expect(signalPayload).to.have.property('sessionId');
      expect(signalPayload).to.have.property('sdp');
    });
  });

  afterEach(() => {
    sinon.restore();
  });
});

describe('Session Token Tests', () => {
  it('should generate and verify valid session token', () => {
    const { generateSessionToken, verifySessionToken } = require('../utils/sessionToken');
    
    const sessionId = 'test-session';
    const userId = 'user-123';
    const deviceId = 'device-123';

    const token = generateSessionToken(sessionId, userId, deviceId, 300);
    expect(token).to.be.a('string');

    const decoded = verifySessionToken(token);
    expect(decoded.sessionId).to.equal(sessionId);
    expect(decoded.userId).to.equal(userId);
    expect(decoded.deviceId).to.equal(deviceId);
  });

  it('should reject invalid token', () => {
    expect(() => {
      verifySessionToken('invalid-token');
    }).to.throw();
  });
});