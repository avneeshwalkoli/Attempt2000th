/**
 * DeskLink Agent - Node.js WebRTC Helper
 * 
 * This is a prototype implementation using node-webrtc for rapid development.
 * For production, consider using native WebRTC bindings (e.g., Microsoft MixedReality-WebRTC).
 * 
 * This helper runs as a subprocess spawned by the C# agent and communicates via stdin/stdout.
 */

const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = require('wrtc');
const io = require('socket.io-client');
const robot = require('robotjs');
const screenshot = require('screenshot-desktop');

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
  agentJwt: args[7],           // JWT for Socket.IO auth
};

console.error('[NodeHelper] Starting with config:', JSON.stringify(config, null, 2));

let peerConnection = null;
let dataChannel = null;
let socket = null;
let screenCaptureInterval = null;

// ICE servers configuration
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Initialize WebRTC peer connection
 */
function initPeerConnection(iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]) {
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

  peerConnection.onconnectionstatechange = () => {
    console.error('[WebRTC] Connection state:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') {
      console.error('[WebRTC] Connected successfully');
      if (config.role === 'receiver') {
        startScreenCapture();
      }
    }
  };

  peerConnection.ondatachannel = (event) => {
    console.error('[WebRTC] Data channel received');
    dataChannel = event.channel;
    setupDataChannel();
  };

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

/**
 * Handle incoming control messages
 */
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
        // Respond to ping
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

/**
 * Handle mouse move
 */
function handleMouseMove(message) {
  const screenSize = robot.getScreenSize();
  const x = Math.round(message.x * screenSize.width);
  const y = Math.round(message.y * screenSize.height);
  robot.moveMouse(x, y);
}

/**
 * Handle mouse click
 */
function handleMouseClick(message) {
  const screenSize = robot.getScreenSize();
  const x = Math.round(message.x * screenSize.width);
  const y = Math.round(message.y * screenSize.height);
  robot.moveMouse(x, y);
  robot.mouseClick(message.button || 'left');
}

/**
 * Handle mouse wheel
 */
function handleMouseWheel(message) {
  // robotjs doesn't have native wheel support, would need platform-specific implementation
  console.error('[Control] Mouse wheel not implemented in this prototype');
}

/**
 * Handle key press
 */
function handleKeyPress(message) {
  // Safety: block dangerous key combinations
  if (message.modifiers?.ctrl && message.modifiers?.alt && message.key === 'Delete') {
    console.error('[Control] Blocked Ctrl+Alt+Del');
    return;
  }

  try {
    if (message.action === 'press') {
      robot.keyTap(message.key, Object.keys(message.modifiers || {}).filter(k => message.modifiers[k]));
    }
  } catch (err) {
    console.error('[Control] Error handling key press:', err);
  }
}

/**
 * Handle clipboard
 */
function handleClipboard(message) {
  // Clipboard sync would require platform-specific implementation
  console.error('[Control] Clipboard sync not implemented in this prototype');
}

/**
 * Start screen capture and streaming
 */
async function startScreenCapture() {
  console.error('[Screen] Starting capture...');

  // Note: This is a simplified prototype. For production:
  // 1. Use hardware-accelerated encoding (H.264/VP8)
  // 2. Implement proper MediaStreamTrack from canvas
  // 3. Add frame rate control and quality settings

  screenCaptureInterval = setInterval(async () => {
    try {
      // Capture screenshot
      const imgBuffer = await screenshot({ format: 'png' });
      
      // In a real implementation, you would:
      // 1. Decode the image to raw frames
      // 2. Encode to video codec (H.264/VP8)
      // 3. Send via WebRTC video track
      
      // For this prototype, we're just demonstrating the capture
      // You would need to create a MediaStreamTrack and add to peer connection
      
    } catch (err) {
      console.error('[Screen] Capture error:', err);
    }
  }, 1000 / 15); // 15 FPS
}

/**
 * Stop screen capture
 */
function stopScreenCapture() {
  if (screenCaptureInterval) {
    clearInterval(screenCaptureInterval);
    screenCaptureInterval = null;
  }
}

/**
 * Initialize Socket.IO connection
 */
// NodeHelper.js
 // ensure this is imported at top
   // if you need to fetch TURN token (node 18+ has global fetch)

async function getIceServers(serverUrl, sessionToken) {
  try {
    // Try to fetch turn token from the central server (if endpoint exists)
    const res = await fetch(`${serverUrl}/api/remote/turn-token`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      timeout: 5000,
    });
    if (!res.ok) {
      console.error('[TURN] turn-token fetch failed', res.status);
      return [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
    }
    const body = await res.json();
    return body.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];
  } catch (err) {
    console.error('[TURN] fetch error', err);
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

function initSocket() {
  const authPayload = {
    token: config.agentJwt,
  };

  console.error('[Socket] initSocket: connecting to', config.serverUrl, 'hasAgentJwt', !!config.agentJwt);

  socket = io(config.serverUrl, {
    auth: authPayload,
    transports: ['websocket'],
    path: '/socket.io', // ensure server uses default path; adjust if your server uses a custom path
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000
  });

  // helpful: log every event the socket receives
  socket.onAny((event, ...args) => {
    try { console.error('[Socket any]', event, args[0] ?? null); } catch(e){}
  });

  socket.on('connect', async () => {
    console.error('[Socket] Connected - id=', socket.id);
    try {
      // emit register so server maps deviceId -> socketId (important)
      socket.emit('register', { deviceId: config.deviceId });
      socket.emit('register-complete', { deviceId: config.deviceId }); // optional extra event if you want
      console.error('[Socket] register emitted for', config.deviceId);

      // Optionally fetch TURN/STUN servers and initialize peer connection after socket connected
      const iceServers = await getIceServers(config.serverUrl, config.token);
      console.error('[Socket] obtained iceServers', JSON.stringify(iceServers));
      initPeerConnection(iceServers); // you must adapt your initPeerConnection to accept iceServers
    } catch (err) {
      console.error('[Socket] error in connect handler', err);
    }
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] connect_error', err && (err.message || err));
  });

  socket.on('disconnect', (reason) => {
    console.error('[Socket] Disconnected', reason);
  });

  socket.on('webrtc-offer', async ({ sdp, sessionId, fromUserId, fromDeviceId, toDeviceId, token }) => {
    console.error('[Socket] Received offer for session', sessionId);
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('webrtc-answer', {
        sessionId,
        fromUserId: config.userId,
        fromDeviceId: config.deviceId,
        toDeviceId: fromDeviceId, // reply to the caller
        sdp: answer.sdp,
        token: token || config.token
      });
      console.error('[Socket] sent webrtc-answer for', sessionId);
    } catch (err) {
      console.error('[WebRTC] Error handling offer:', err);
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

  socket.on('webrtc-ice', async ({ candidate, sessionId }) => {
    try {
      // candidate may be null or malformed — guard it
      if (candidate && candidate.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.error('[Socket] added ICE candidate for session', sessionId);
      }
    } catch (err) {
      console.error('[WebRTC] Error adding ICE candidate:', err);
    }
  });

  socket.on('webrtc-cancel', () => {
    console.error('[Socket] Session cancelled');
    cleanup();
    process.exit(0);
  });

  return socket;
}


/**
 * Start as caller (controller)
 */
async function startAsCaller() {
  console.error('[NodeHelper] Starting as caller');
  
  initPeerConnection();
  initSocket();

  // Create data channel
  dataChannel = peerConnection.createDataChannel('desklink-control', {
    ordered: true,
    maxRetransmits: 3,
  });
  setupDataChannel();

  // Create and send offer
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
}

/**
 * Start as receiver (host)
 */
function startAsReceiver() {
  console.error('[NodeHelper] Starting as receiver');
  
  initPeerConnection();
  initSocket();
  
  // Wait for offer from socket
}

/**
 * Cleanup resources
 */
function cleanup() {
  console.error('[NodeHelper] Cleaning up...');
  
  stopScreenCapture();
  
  if (dataChannel) {
    dataChannel.close();
  }
  
  if (peerConnection) {
    peerConnection.close();
  }
  
  if (socket) {
    socket.disconnect();
  }
}

/**
 * Handle process signals
 */
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

/**
 * Main entry point
 */
async function main() {
  try {
    if (config.role === 'caller') {
      await startAsCaller();
    } else {
      startAsReceiver();
    }
  } catch (err) {
    console.error('[NodeHelper] Fatal error:', err);
    process.exit(1);
  }
}

main();