/**
 * DeskLink Agent - Node.js WebRTC Helper (FIXED)
 * Dependencies:
 * npm install wrtc socket.io-client robotjs screenshot-desktop pngjs
 */

const wrtc = require('wrtc');
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = wrtc;
const { nonstandard } = wrtc;
const { RTCVideoSource } = nonstandard;

const io = require('socket.io-client');
const robot = require('robotjs');
const screenshot = require('screenshot-desktop');
const { PNG } = require('pngjs');

const TURN_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:avn.openai-coturn.workers.dev:443?transport=tcp",
    username: "avneesh",
    credential: "walkoli123",
  },
];

// Configuration
const args = process.argv.slice(2);
const config = {
  // Local-first: default to the local DeskLink server unless explicitly overridden
  serverUrl: args[0] || process.env.DESKLINK_SERVER_URL || 'http://localhost:5000',
  sessionId: args[1],
  token: args[2],
  deviceId: args[3],
  userId: args[4],
  remoteDeviceId: args[5],
  role: args[6] || 'receiver',
  agentJwt: args[7],
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
  console.error('[WebRTC] ===== INITIALIZING PEER CONNECTION =====');
  console.error('[WebRTC] Role:', config.role);
  console.error('[WebRTC] ICE Servers:', JSON.stringify(iceServers));
  
  // ✅ FIX: Add bundle policy to ensure single transport
  peerConnection = new RTCPeerConnection({ 
    iceServers,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket) {
      console.error('[WebRTC] Sending local ICE candidate');
      socket.emit('webrtc-ice', {
        sessionId: config.sessionId,
        fromUserId: config.userId,
        fromDeviceId: config.deviceId,
        toDeviceId: config.remoteDeviceId,
        candidate: event.candidate,
        token: config.token,
      });
    } else if (!event.candidate) {
      console.error('[WebRTC] ICE gathering complete');
    }
  };

  // ✅ CRITICAL FIX: Ensure ondatachannel fires for receiver
  peerConnection.ondatachannel = (event) => {
    console.error('[WebRTC] ===== DATACHANNEL EVENT FIRED =====');
    console.error('[WebRTC] ✓✓✓ Data channel RECEIVED from caller ✓✓✓');
    console.error('[WebRTC] Channel label:', event.channel.label);
    console.error('[WebRTC] Channel readyState:', event.channel.readyState);
    console.error('[WebRTC] Channel id:', event.channel.id);
    
    dataChannel = event.channel;
    setupDataChannel();
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    console.error('[WebRTC] ===== CONNECTION STATE CHANGE =====');
    console.error('[WebRTC] New state:', state);
     
    if (state === 'connecting') {
      console.error('[WebRTC] Attempting to connect...');
    } else if (state === 'connected') {
      console.error('[WebRTC] ✓✓✓ CONNECTED SUCCESSFULLY ✓✓✓');
      
      // ✅ Check datachannel status after connection
      if (dataChannel) {
        console.error('[DataChannel] Status after connection - readyState:', dataChannel.readyState);
      } else {
        console.error('[DataChannel] WARNING: No datachannel after connection!');
      }
      
      if (config.role === 'receiver') {
        console.error('[Screen] Starting screen capture as receiver');
        startScreenCapture();
      }
    } else if (state === 'failed') {
      console.error('[WebRTC] ✗✗✗ CONNECTION FAILED ✗✗✗');
      console.error('[WebRTC] ICE connection state:', peerConnection.iceConnectionState);
      console.error('[WebRTC] Signaling state:', peerConnection.signalingState);
      
      peerConnection.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'candidate-pair') {
            console.error('[WebRTC] Candidate pair:', {
              state: report.state,
              priority: report.priority,
              nominated: report.nominated,
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

  peerConnection.oniceconnectionstatechange = () => {
    console.error('[WebRTC] ICE connection state:', peerConnection.iceConnectionState);
     
    if (peerConnection.iceConnectionState === 'checking') {
      console.error('[WebRTC] ICE checking candidates...');
    } else if (peerConnection.iceConnectionState === 'connected') {
      console.error('[WebRTC] ICE connected!');
    } else if (peerConnection.iceConnectionState === 'completed') {
      console.error('[WebRTC] ICE completed!');
    } else if (peerConnection.iceConnectionState === 'failed') {
      console.error('[WebRTC] ✗ ICE connection failed');
      peerConnection.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'local-candidate') {
            console.error('[ICE] Local candidate:', report.candidateType, report.protocol);
          }
          if (report.type === 'remote-candidate') {
            console.error('[ICE] Remote candidate:', report.candidateType, report.protocol);
          }
        });
      });
    }
  };

  peerConnection.onsignalingstatechange = () => {
    console.error('[WebRTC] Signaling state:', peerConnection.signalingState);
  };

  // ✅ If receiver: add video track BEFORE negotiation
  if (config.role === 'receiver') {
    try {
      videoSource = new RTCVideoSource();
      videoTrack = videoSource.createTrack();
      const sender = peerConnection.addTrack(videoTrack);
      console.error('[WebRTC] ✓ Video track added from agent:', sender.track.id);
    } catch (err) {
      console.error('[WebRTC] ✗ Error creating video track:', err);
    }
  }

  return peerConnection;
}

/**
 * Setup data channel for control messages
 */
function setupDataChannel() {
  if (!dataChannel) {
    console.error('[DataChannel] ✗ setupDataChannel called but dataChannel is null!');
    return;
  }

  console.error('[DataChannel] ===== SETTING UP DATACHANNEL =====');
  console.error('[DataChannel] Current readyState:', dataChannel.readyState);

  dataChannel.onopen = () => {
    console.error('[DataChannel] ✓✓✓ OPENED ✓✓✓ - readyState:', dataChannel.readyState);
    
    // Send a test message
    try {
      dataChannel.send(JSON.stringify({ type: 'ready', message: 'Agent ready' }));
      console.error('[DataChannel] ✓ Test message sent');
    } catch (err) {
      console.error('[DataChannel] ✗ Error sending test message:', err);
    }
  };

  dataChannel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.error('[DataChannel] ✓ Message received:', message.type);
      handleControlMessage(message);
    } catch (err) {
      console.error('[DataChannel] ✗ Error parsing message:', err);
    }
  };

  dataChannel.onclose = () => {
    console.error('[DataChannel] Closed');
  };

  dataChannel.onerror = (err) => {
    console.error('[DataChannel] ✗ Error:', err);
  };

  // If already open, trigger onopen manually
  if (dataChannel.readyState === 'open') {
    console.error('[DataChannel] Already open, triggering onopen');
    dataChannel.onopen();
  }
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
  if (message.deltaY) {
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
  return key.toLowerCase();
}

function handleKeyPress(message) {
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
      
      robot.keyTap(key, mods);
    }
  } catch (err) {
    console.error('[Control] Error handling key press:', err);
  }
}

function handleClipboard(message) {
  console.error('[Control] Clipboard sync not implemented');
}

// ======================================================
// SCREEN CAPTURE LOGIC
// ======================================================

async function startScreenCapture() {
  if (!videoSource) {
    console.error('[Screen] ✗ Cannot start capture: videoSource is not initialized');
    return;
  }
  if (screenCaptureInterval) {
    console.error('[Screen] Capture already running');
    return;
  }

  console.error('[Screen] ===== STARTING SCREEN CAPTURE =====');
  const FPS = 10; 
  const interval = 1000 / FPS;

  screenCaptureInterval = setInterval(async () => {
    try {
      const imgBuffer = await screenshot({ format: 'png' });
      const png = PNG.sync.read(imgBuffer);
      const { width, height, data: rgba } = png;

      const frameSize = width * height;
      const yPlaneSize = frameSize;
      const uvPlaneSize = frameSize >> 2;

      const i420 = Buffer.alloc(yPlaneSize + uvPlaneSize + uvPlaneSize);

      // Convert RGBA to I420
      for (let i = 0; i < frameSize; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];

        let y = 0.257 * r + 0.504 * g + 0.098 * b + 16;
        i420[i] = Math.max(0, Math.min(255, y));
      }

      // Fill U and V planes with neutral gray
      i420.fill(128, yPlaneSize, yPlaneSize + uvPlaneSize + uvPlaneSize);

      videoSource.onFrame({
        width,
        height,
        data: i420,
      });
    } catch (err) {
      console.error('[Screen] Capture error:', err);
    }
  }, interval);
  
  console.error('[Screen] ✓ Capture started at', FPS, 'FPS');
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

  console.error('[Socket] ===== INITIALIZING SOCKET =====');
  console.error('[Socket] Connecting to:', config.serverUrl);

  socket = io(config.serverUrl, {
    auth: authPayload,
    transports: ['websocket'],
    path: '/socket.io',
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000
  });

  socket.on('connect', async () => {
    console.error('[Socket] ✓ Connected - id=', socket.id);

    socket.emit('register', { deviceId: config.deviceId });
    socket.emit('register-complete', { deviceId: config.deviceId });

    // ✅ Initialize PC only once
    if (!peerConnection) {
      initPeerConnection(TURN_ICE_SERVERS);
    }

    // ✅ CALLER: Create datachannel and offer
    if (config.role === 'caller') {
      try {
        console.error('[NodeHelper] ===== ROLE: CALLER =====');
        console.error('[NodeHelper] Creating DataChannel and Offer...');

        // Create datachannel first
        dataChannel = peerConnection.createDataChannel('desklink-control', {
          ordered: true,
          maxRetransmits: 3,
        });
        setupDataChannel();
        
        console.error('[NodeHelper] ✓ DataChannel created');

        // Wait a bit for datachannel to initialize
        await new Promise(resolve => setTimeout(resolve, 200));

        // Then create offer
        const offer = await peerConnection.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
        });
        await peerConnection.setLocalDescription(offer);

        console.error('[NodeHelper] ✓ Offer created and local description set');

        socket.emit('webrtc-offer', {
          sessionId: config.sessionId,
          fromUserId: config.userId,
          fromDeviceId: config.deviceId,
          toDeviceId: config.remoteDeviceId,
          sdp: offer.sdp,
          token: config.token,
        });
        
        console.error('[WebRTC] ✓✓✓ OFFER SENT to', config.remoteDeviceId);
      } catch (err) {
        console.error('[Caller] ✗ Error creating offer:', err);
      }
    } else {
      console.error('[NodeHelper] ===== ROLE: RECEIVER =====');
      console.error('[NodeHelper] Waiting for offer from caller...');
    }
  });

  // ✅ RECEIVER: Handle incoming offer
  socket.on('webrtc-offer', async ({ sdp, sessionId, fromUserId, fromDeviceId, toDeviceId, token }) => {
    console.error('[Socket] ===== RECEIVED OFFER =====');
    console.error('[Socket] sessionId:', sessionId);
    console.error('[Socket] fromDeviceId:', fromDeviceId);
    console.error('[Socket] toDeviceId:', toDeviceId);
    console.error('[Socket] My deviceId:', config.deviceId);
    console.error('[Socket] SDP type:', sdp ? 'present' : 'MISSING');
     
    try {
      if (!peerConnection) {
        console.error('[WebRTC] Creating PeerConnection for incoming offer');
        initPeerConnection(TURN_ICE_SERVERS);
      }
   
      console.error('[WebRTC] Setting remote description (offer)...');
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp })
      );
      console.error('[WebRTC] ✓ Remote description set');
   
      // ✅ Apply buffered ICE candidates
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
   
      console.error('[WebRTC] Creating answer...');
      const answer = await peerConnection.createAnswer();
      
      // Log DTLS role
      console.error('[WebRTC] Answer SDP setup role:', answer.sdp.includes('setup:active') ? 'active' : 'passive');
      
      await peerConnection.setLocalDescription(answer);
      console.error('[WebRTC] ✓ Local description set (answer)');
   
      const answerPayload = {
        sessionId,
        fromUserId: config.userId,
        fromDeviceId: config.deviceId,
        toDeviceId: fromDeviceId,
        sdp: answer.sdp,
        token: config.token,
      };
   
      console.error('[Socket] Emitting answer to device:', fromDeviceId);
       
      socket.emit('webrtc-answer', answerPayload);
      console.error('[WebRTC] ✓✓✓ ANSWER SENT ✓✓✓');
    } catch (err) {
      console.error('[WebRTC] ✗✗✗ ERROR handling offer:', err);
      console.error('[WebRTC] Error stack:', err.stack);
    }
  });

  socket.on('webrtc-answer', async ({ sdp, sessionId }) => {
    console.error('[Socket] ===== RECEIVED ANSWER =====');
    console.error('[Socket] sessionId:', sessionId);
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
      console.error('[WebRTC] ✓ Remote description set (answer)');
      
      // Apply buffered ICE
      if (pendingRemoteIceCandidates.length > 0) {
        console.error('[WebRTC] Applying', pendingRemoteIceCandidates.length, 'buffered ICE candidates');
        for (const c of pendingRemoteIceCandidates) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(c));
          } catch (err) {
            console.error('[WebRTC] Error applying buffered ICE:', err);
          }
        }
        pendingRemoteIceCandidates = [];
      }
    } catch (err) {
      console.error('[WebRTC] ✗ Error handling answer:', err);
    }
  });

  socket.on('webrtc-ice', async ({ candidate, sessionId, fromDeviceId, toDeviceId }) => {
    try {
      if (!candidate || !candidate.candidate) {
        console.error('[WebRTC] Received empty ICE candidate, ignoring');
        return;
      }
   
      console.error('[WebRTC] Received ICE candidate from:', fromDeviceId);
   
      // ✅ FIX: Buffer ICE if remote description not set yet
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
  console.error('[NodeHelper] ===== CLEANING UP =====');
  
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
    initSocket();
  } catch (err) {
    console.error('[NodeHelper] Fatal error:', err);
    process.exit(1);
  }
}

main();