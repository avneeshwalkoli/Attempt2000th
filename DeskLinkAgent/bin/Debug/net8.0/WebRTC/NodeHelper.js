/**
 * DeskLink Agent - Node.js WebRTC Helper
 * * Dependencies:
 * npm install wrtc socket.io-client robotjs screenshot-desktop pngjs
 */

const wrtc = require('wrtc');
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = wrtc;
const { nonstandard } = wrtc;
const { RTCVideoSource } = nonstandard;

const io = require('socket.io-client');
const robot = require('robotjs');
const screenshot = require('screenshot-desktop');
const { PNG } = require('pngjs');   // for decoding PNG screenshots

const TURN_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:avn.openai-coturn.workers.dev:443?transport=tcp",
    username: "avneesh",
    credential: "walkoli123",
  },
];

// Configuration from command line args
const args = process.argv.slice(2);
const config = {
  serverUrl: args[0] || 'https://anydesk.onrender.com',
  sessionId: args[1],
  token: args[2],             // session token for WebRTC validation
  deviceId: args[3],
  userId: args[4],
  remoteDeviceId: args[5],
  role: args[6] || 'receiver', // 'caller' or 'receiver'
  agentJwt: args[7],          // JWT for Socket.IO auth
};

console.error('[NodeHelper] Starting with config:', JSON.stringify(config, null, 2));

// ======================================================
// GLOBAL STATE
// ======================================================
let peerConnection = null;
let dataChannel = null;
let socket = null;
let screenCaptureInterval = null;
let pendingRemoteIceCandidates = [];
let videoSource = null;
let videoTrack = null;

// ======================================================
// WEBRTC LOGIC
// ======================================================

/**
 * Initialize WebRTC peer connection
 */
function initPeerConnection(iceServers) {
  console.error('[WebRTC] initPeerConnection with iceServers:', JSON.stringify(iceServers));
  
  peerConnection = new RTCPeerConnection({ iceServers });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('webrtc-ice', {
        sessionId: config.sessionId,
        fromUserId: config.userId,
        fromDeviceId: config.deviceId,
        toDeviceId: config.remoteDeviceId,
        candidate: event.candidate,
        token: config.token,
      });
    }
  };

  peerConnection.ondatachannel = (event) => {
    console.error('[WebRTC] Data channel received');
    dataChannel = event.channel;
    setupDataChannel();
  };

  // --- ENHANCED CONNECTION STATE LOGGING ---
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    console.error('[WebRTC] ===== CONNECTION STATE CHANGE =====');
    console.error('[WebRTC] New state:', state);
     
    if (state === 'connecting') {
      console.error('[WebRTC] Attempting to connect...');
    } else if (state === 'connected') {
      console.error('[WebRTC] ✓✓✓ CONNECTED SUCCESSFULLY ✓✓✓');
      if (config.role === 'receiver') {
        console.error('[Screen] Starting screen capture as receiver');
        startScreenCapture();
      }
    } else if (state === 'failed') {
      console.error('[WebRTC] ✗✗✗ CONNECTION FAILED ✗✗✗');
      console.error('[WebRTC] ICE connection state:', peerConnection.iceConnectionState);
      console.error('[WebRTC] Signaling state:', peerConnection.signalingState);
      
      // Get more details about why it failed
      peerConnection.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'candidate-pair') {
            console.error('[WebRTC] Candidate pair:', {
              state: report.state,
              priority: report.priority,
              nominated: report.nominated,
              localCandidate: report.localCandidateId,
              remoteCandidate: report.remoteCandidateId
            });
          }
        });
      });
    } else if (state === 'disconnected') {
      console.error('[WebRTC] Disconnected (might recover)');
    } else if (state === 'closed') {
      console.error('[WebRTC] Connection closed');
    }
  };

  // --- ENHANCED ICE CONNECTION STATE LOGGING ---
  peerConnection.oniceconnectionstatechange = () => {
    console.error('[WebRTC] ICE connection state:', peerConnection.iceConnectionState);
     
    if (peerConnection.iceConnectionState === 'failed') {
      console.error('[WebRTC] ICE connection failed - checking candidates...');
      peerConnection.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'local-candidate') {
            console.error('[ICE] Local candidate:', report.candidateType, report.address, report.protocol);
          }
          if (report.type === 'remote-candidate') {
            console.error('[ICE] Remote candidate:', report.candidateType, report.address, report.protocol);
          }
        });
      });
    }
  };

  // If we are the receiver, we need to add the video track immediately
  // so it is available when the offer/answer negotiation happens.
  if (config.role === 'receiver') {
    try {
      videoSource = new RTCVideoSource();
      videoTrack = videoSource.createTrack();
      const sender = peerConnection.addTrack(videoTrack);
      console.error('[WebRTC] Video track added from agent:', sender.track.id);
    } catch (err) {
      console.error('[WebRTC] Error creating video track:', err);
    }
  }

  return peerConnection;
}

/**
 * Setup data channel for control messages
 */
function setupDataChannel() {
  if (!dataChannel) return;

  dataChannel.onopen = () => {
    console.error('[DataChannel] Opened');
  };

  dataChannel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleControlMessage(message);
    } catch (err) {
      console.error('[DataChannel] Error parsing message:', err);
    }
  };

  dataChannel.onclose = () => {
    console.error('[DataChannel] Closed');
  };
}

// ======================================================
// CONTROL / ROBOTJS LOGIC
// ======================================================

function handleControlMessage(message) {
  if (!message || !message.type) return;

  try {
    switch (message.type) {
      case 'mouse':
        handleMouseMove(message);
        break;
      case 'click':
        handleMouseClick(message);
        break;
      case 'wheel':
        handleMouseWheel(message);
        break;
      case 'key':
        handleKeyPress(message);
        break;
      case 'clipboard':
        handleClipboard(message);
        break;
      case 'ping':
        if (dataChannel && dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
        break;
      default:
        console.error('[Control] Unknown message type:', message.type);
    }
  } catch (err) {
    console.error('[Control] Error handling message:', err);
  }
}

function handleMouseMove(message) {
  const screenSize = robot.getScreenSize();
  const x = Math.round(message.x * screenSize.width);
  const y = Math.round(message.y * screenSize.height);
  robot.moveMouse(x, y);
}

function handleMouseClick(message) {
  const screenSize = robot.getScreenSize();
  const x = Math.round(message.x * screenSize.width);
  const y = Math.round(message.y * screenSize.height);
  robot.moveMouse(x, y);
  robot.mouseClick(message.button || 'left');
}

function handleMouseWheel(message) {
  // robotjs scroll is: robot.scrollMouse(x, y);
  // message usually has deltaY. Simple implementation:
  if (message.deltaY) {
    // Basic scaling for scrolling
    const scrollAmount = message.deltaY > 0 ? -10 : 10; 
    robot.scrollMouse(0, scrollAmount);
  }
}

const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Backspace: 'backspace',
  Escape: 'escape',
  Delete: 'delete',
  Tab: 'tab',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown'
};

function normalizeKey(key) {
  if (!key) return null;
  if (KEY_MAP[key]) return KEY_MAP[key];
  if (/^[A-Z]$/.test(key)) return key.toLowerCase();
  if (/^\d$/.test(key)) return key;
  return key.toLowerCase(); // Fallback for other chars
}

function handleKeyPress(message) {
  // Security guard
  if (message.modifiers?.ctrl && message.modifiers?.alt && message.key === 'Delete') {
    console.error('[Control] Blocked Ctrl+Alt+Del');
    return;
  }

  try {
    if (message.action === 'press' || message.action === 'down') {
      const key = normalizeKey(message.key);
      if (!key) {
        console.error('[Control] Unsupported key from client:', message.key);
        return;
      }

      const mods = Object.keys(message.modifiers || {}).filter(
        (k) => message.modifiers[k]
      );
      
      // keyTap creates a press and release. 
      // For more complex key holding, you'd need keyToggle, but keyTap is safer for basics.
      robot.keyTap(key, mods);
    }
  } catch (err) {
    console.error('[Control] Error handling key press:', err);
  }
}

function handleClipboard(message) {
  console.error('[Control] Clipboard sync not implemented in this prototype');
}

// ======================================================
// SCREEN CAPTURE LOGIC
// ======================================================

async function startScreenCapture() {
  if (!videoSource) {
    console.error('[Screen] Cannot start capture: videoSource is not initialized');
    return;
  }
  if (screenCaptureInterval) {
    console.error('[Screen] Capture already running');
    return;
  }

  console.error('[Screen] Starting capture loop...');
  const FPS = 10; 
  const interval = 1000 / FPS;

  screenCaptureInterval = setInterval(async () => {
    try {
      // 1) Grab a screenshot as PNG buffer
      const imgBuffer = await screenshot({ format: 'png' });

      // 2) Decode PNG into raw RGBA pixels
      const png = PNG.sync.read(imgBuffer);
      const { width, height, data: rgba } = png;

      const frameSize = width * height;
      const yPlaneSize = frameSize;
      const uvPlaneSize = frameSize >> 2; // /4

      // 3) Allocate I420 buffer: Y (full), U (1/4), V (1/4)
      const i420 = Buffer.alloc(yPlaneSize + uvPlaneSize + uvPlaneSize);

      // 4) Fill Y plane from RGB luma (Grayscale)
      for (let i = 0; i < frameSize; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];

        // Standard BT.601 luma
        let y = 0.257 * r + 0.504 * g + 0.098 * b + 16;
        i420[i] = Math.max(0, Math.min(255, y));
      }

      // 5) Set U and V planes to neutral grey (128) -> No color
      i420.fill(128, yPlaneSize, yPlaneSize + uvPlaneSize + uvPlaneSize);

      // 6) Push the frame to RTCVideoSource
      videoSource.onFrame({
        width,
        height,
        data: i420,
      });
    } catch (err) {
      console.error('[Screen] Capture error:', err);
    }
  }, interval);
}

function stopScreenCapture() {
  if (screenCaptureInterval) {
    clearInterval(screenCaptureInterval);
    screenCaptureInterval = null;
  }

  if (videoTrack) {
    try {
      videoTrack.stop();
    } catch (e) {
      console.error('[Screen] Error stopping videoTrack:', e);
    }
    videoTrack = null;
  }
  videoSource = null;
  console.error('[Screen] Capture stopped');
}

// ======================================================
// SOCKET.IO & SIGNALING
// ======================================================

function initSocket() {
  const authPayload = {
    token: config.agentJwt,
  };

  console.error('[Socket] initSocket: connecting to', config.serverUrl);

  socket = io(config.serverUrl, {
    auth: authPayload,
    transports: ['websocket'],
    path: '/socket.io',
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000
  });

  socket.on('connect', async () => {
    console.error('[Socket] Connected - id=', socket.id);

    // 1. Register device
    socket.emit('register', { deviceId: config.deviceId });
    socket.emit('register-complete', { deviceId: config.deviceId });

    // 2. Init PeerConnection ONCE
    if (!peerConnection) {
      initPeerConnection(TURN_ICE_SERVERS);
    }

    // 3. If caller, create Offer
    if (config.role === 'caller') {
      try {
        console.error('[NodeHelper] Creating DataChannel and Offer as Caller');

        dataChannel = peerConnection.createDataChannel('desklink-control', {
          ordered: true,
          maxRetransmits: 3,
        });
        setupDataChannel();

        const offer = await peerConnection.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
        });
        await peerConnection.setLocalDescription(offer);

        socket.emit('webrtc-offer', {
          sessionId: config.sessionId,
          fromUserId: config.userId,
          fromDeviceId: config.deviceId,
          toDeviceId: config.remoteDeviceId,
          sdp: offer.sdp,
          token: config.token,
        });
      } catch (err) {
        console.error('[Caller] Error creating offer:', err);
      }
    }
  });

  // --- ENHANCED WEBRTC OFFER HANDLER ---
  socket.on('webrtc-offer', async ({ sdp, sessionId, fromUserId, fromDeviceId, toDeviceId, token }) => {
    console.error('[Socket] ===== RECEIVED OFFER =====');
    console.error('[Socket] sessionId:', sessionId);
    console.error('[Socket] fromDeviceId:', fromDeviceId);
    console.error('[Socket] toDeviceId:', toDeviceId);
    console.error('[Socket] My deviceId:', config.deviceId);
    console.error('[Socket] SDP type:', sdp ? 'present' : 'MISSING');
     
    try {
      if (!peerConnection) {
        console.error('[WebRTC] Creating new PeerConnection for incoming offer');
        initPeerConnection(TURN_ICE_SERVERS);
      }
   
      console.error('[WebRTC] Setting remote description (offer)');
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp })
      );
      console.error('[WebRTC] ✓ Remote description set');
   
      // Apply buffered ICE candidates
      if (pendingRemoteIceCandidates.length > 0) {
        console.error('[WebRTC] Applying', pendingRemoteIceCandidates.length, 'buffered ICE candidates');
        for (const c of pendingRemoteIceCandidates) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(c));
            console.error('[WebRTC] ✓ Applied buffered ICE candidate');
          } catch (err) {
            console.error('[WebRTC] ✗ Error applying buffered ICE:', err.message);
          }
        }
        pendingRemoteIceCandidates = [];
      }
   
      console.error('[WebRTC] Creating answer');
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.error('[WebRTC] ✓ Local description set (answer)');
   
      const answerPayload = {
        sessionId,
        fromUserId: config.userId,
        fromDeviceId: config.deviceId,
        toDeviceId: fromDeviceId,
        sdp: answer.sdp,
        token: token || config.token,
      };
   
      console.error('[Socket] Emitting answer to device:', fromDeviceId);
      console.error('[Socket] Answer payload:', JSON.stringify(answerPayload, null, 2));
       
      socket.emit('webrtc-answer', answerPayload);
      console.error('[WebRTC] ✓ Answer sent');
    } catch (err) {
      console.error('[WebRTC] ✗✗✗ ERROR handling offer:', err);
      console.error('[WebRTC] Error stack:', err.stack);
    }
  });

  socket.on('webrtc-answer', async ({ sdp, sessionId }) => {
    console.error('[Socket] Received answer for session', sessionId);
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
    } catch (err) {
      console.error('[WebRTC] Error handling answer:', err);
    }
  });

  // --- ENHANCED WEBRTC ICE HANDLER ---
  socket.on('webrtc-ice', async ({ candidate, sessionId, fromDeviceId, toDeviceId }) => {
    try {
      if (!candidate || !candidate.candidate) {
        console.error('[WebRTC] Received empty ICE candidate, ignoring');
        return;
      }
   
      console.error('[WebRTC] Received ICE candidate from:', fromDeviceId);
      console.error('[WebRTC] ICE candidate:', candidate.candidate.substring(0, 50) + '...');
   
      if (!peerConnection || !peerConnection.remoteDescription) {
        pendingRemoteIceCandidates.push(candidate);
        console.error('[WebRTC] Buffering ICE candidate (remoteDesc not ready). Total buffered:', pendingRemoteIceCandidates.length);
        return;
      }
   
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.error('[WebRTC] ✓ ICE candidate added successfully');
    } catch (err) {
      console.error('[WebRTC] ✗ Error adding ICE candidate:', err.message);
    }
  });

  socket.on('webrtc-cancel', () => {
    console.error('[Socket] Session cancelled');
    cleanup();
    process.exit(0);
  });

  socket.on('disconnect', (reason) => {
    console.error('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] connect_error:', err.message);
  });
}

// ======================================================
// CLEANUP & ENTRY
// ======================================================

function cleanup() {
  console.error('[NodeHelper] Cleaning up...');
  
  stopScreenCapture();
  pendingRemoteIceCandidates = [];
  
  if (dataChannel) {
    try { dataChannel.close(); } catch(e){}
    dataChannel = null;
  }
  
  if (peerConnection) {
    try { peerConnection.close(); } catch(e){}
    peerConnection = null;
  }
  
  if (socket) {
    try { socket.disconnect(); } catch(e){}
    socket = null;
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

async function main() {
  try {
    // Both roles start by connecting to the socket.
    // The role-specific logic (offer vs wait) is handled inside socket 'connect' event.
    initSocket();
  } catch (err) {
    console.error('[NodeHelper] Fatal error:', err);
    process.exit(1);
  }
}

main();