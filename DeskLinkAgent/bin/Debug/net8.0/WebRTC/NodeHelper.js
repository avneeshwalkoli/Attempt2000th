/**
 * DeskLink Agent - Node.js WebRTC Helper
 * * This is a prototype implementation using node-webrtc for rapid development.
 * For production, consider using native WebRTC bindings (e.g., Microsoft MixedReality-WebRTC).
 * * This helper runs as a subprocess spawned by the C# agent and communicates via stdin/stdout.
 */

const wrtc = require('wrtc');
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = wrtc;
const { nonstandard } = wrtc;
const { RTCVideoSource } = nonstandard;

const io = require('socket.io-client');
const robot = require('robotjs');
const screenshot = require('screenshot-desktop');
const { PNG } = require('pngjs');

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

let peerConnection = null;
let dataChannel = null;
let socket = null;
let screenCaptureInterval = null;
let pendingRemoteIceCandidates = [];
let videoSource = null;
let videoTrack = null;
/**
 * Initialize WebRTC peer connection
 */
function initPeerConnection(iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]) {
  console.error('[WebRTC] initPeerConnection with iceServers:', JSON.stringify(iceServers));

  peerConnection = new RTCPeerConnection({ iceServers });

  // 🔹 Create a video source + track and add it to the PC
  try {
    videoSource = new RTCVideoSource();
    videoTrack = videoSource.createTrack();

    // IMPORTANT: add track before we create answer/offer
    peerConnection.addTrack(videoTrack);
    console.error('[WebRTC] Video track created and added to PeerConnection');
  } catch (e) {
    console.error('[WebRTC] Failed to create video source/track:', e);
  }

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
    } else if (
      peerConnection.connectionState === 'disconnected' ||
      peerConnection.connectionState === 'failed' ||
      peerConnection.connectionState === 'closed'
    ) {
      stopScreenCapture();
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
  console.error('[Control] Mouse wheel not implemented in this prototype');
}

/**
 * Handle key press
 */
const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Backspace: 'backspace',
  Escape: 'escape',
  // letters + numbers – robot expects lowercase
};

function normalizeKey(key) {
  if (!key) return null;
  if (KEY_MAP[key]) return KEY_MAP[key];
  if (/^[A-Z]$/.test(key)) return key.toLowerCase();
  if (/^\d$/.test(key)) return key;
  return null; // unsupported
}

function handleKeyPress(message) {
  if (message.modifiers?.ctrl && message.modifiers?.alt && message.key === 'Delete') {
    console.error('[Control] Blocked Ctrl+Alt+Del');
    return;
  }

  try {
    if (message.action === 'press') {
      const key = normalizeKey(message.key);
      if (!key) {
        console.error('[Control] Unsupported key from client:', message.key);
        return;
      }

      const mods = Object.keys(message.modifiers || {}).filter(
        (k) => message.modifiers[k]
      );

      robot.keyTap(key, mods);
    }
  } catch (err) {
    console.error('[Control] Error handling key press:', err);
  }
}


/**
 * Handle clipboard
 */
function handleClipboard(message) {
  console.error('[Control] Clipboard sync not implemented in this prototype');
}

/**
 * Start screen capture and streaming
 */
async function startScreenCapture() {
  if (!videoSource) {
    console.error('[Screen] No videoSource, cannot start capture');
    return;
  }

  if (screenCaptureInterval) {
    console.error('[Screen] Capture already running, skipping');
    return;
  }

  console.error('[Screen] Starting capture loop…');

  const FPS = 5; // start low; you can bump to 10–15 later
  const INTERVAL = 1000 / FPS;

  screenCaptureInterval = setInterval(async () => {
    try {
      // Grab a screenshot as PNG buffer
      const imgBuffer = await screenshot({ format: 'png' });

      // Decode PNG -> RGBA
      const png = PNG.sync.read(imgBuffer);
      const { width, height, data } = png; // data is RGBA buffer

      if (!videoSource) return;

      // Feed into WebRTC video source
      videoSource.onFrame({
        width,
        height,
        data, // MUST be RGBA
      });
    } catch (err) {
      console.error('[Screen] Capture error:', err);
    }
  }, INTERVAL);
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
 * Fetch TURN/STUN servers
 */
async function getIceServers(serverUrl, sessionToken) {
  try {
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

/**
 * Initialize Socket.IO connection
 */
function initSocket() {
  const authPayload = {
    token: config.agentJwt,
  };

  console.error('[Socket] initSocket: connecting to', config.serverUrl, 'hasAgentJwt', !!config.agentJwt);

  socket = io(config.serverUrl, {
    auth: authPayload,
    transports: ['websocket'],
    path: '/socket.io',
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000
  });

  socket.onAny((event, ...args) => {
    try { console.error('[Socket any]', event, args[0] ?? null); } catch(e){}
  });

  socket.on('connect', async () => {
    console.error('[Socket] Connected - id=', socket.id);
    
    // 1. Register device
    socket.emit('register', { deviceId: config.deviceId });
    socket.emit('register-complete', { deviceId: config.deviceId });
    console.error('[Socket] register emitted for', config.deviceId);

    // 2. Fetch ICE Servers (TURN)
    // FIX 2: Caller now waits for this too
    const iceServers = await getIceServers(config.serverUrl, config.agentJwt || config.token);
    console.error('[Socket] obtained iceServers', JSON.stringify(iceServers));
    
    // FIX 1: Only init peer connection here, once.
    if (!peerConnection) {
      initPeerConnection(iceServers);
    }

    // FIX 2: If we are the Caller, create the offer NOW (after we have the correct ICE servers)
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

      // 🔥 Now that remoteDescription is set, apply any buffered ICE candidates
      if (pendingRemoteIceCandidates.length > 0) {
        console.error('[WebRTC] Applying', pendingRemoteIceCandidates.length, 'buffered ICE candidates for session', sessionId);
        for (const c of pendingRemoteIceCandidates) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(c));
          } catch (err) {
            console.error('[WebRTC] Error applying buffered ICE candidate:', err);
          }
        }
        pendingRemoteIceCandidates = [];
      }

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
      if (!candidate || !candidate.candidate) return;

      // If remoteDescription is not set yet, buffer the candidate
      if (!peerConnection || !peerConnection.remoteDescription) {
        pendingRemoteIceCandidates.push(candidate);
        console.error('[WebRTC] Buffering ICE candidate (no remoteDescription yet) for session', sessionId);
        return;
      }

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.error('[Socket] added ICE candidate for session', sessionId);
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
  // FIX 1 & 2: Removed initPeerConnection(). 
  // It is now handled inside initSocket -> on('connect')
  initSocket();
}

/**
 * Start as receiver (host)
 */
function startAsReceiver() {
  console.error('[NodeHelper] Starting as receiver');
  // FIX 1 & 2: Removed initPeerConnection().
  // It is now handled inside initSocket -> on('connect')
  initSocket();
}

/**
 * Cleanup resources
 */
function cleanup() {
  console.error('[NodeHelper] Cleaning up...');
  
  stopScreenCapture();
   pendingRemoteIceCandidates = [];  
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