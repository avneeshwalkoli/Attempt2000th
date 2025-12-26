# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project overview

VisionDesk is an Electron-wrapped React/Vite desktop workspace with three primary experiences backed by a Node/Express + MongoDB API and a .NET + Node-based remote desktop agent:
- **ChatSpace** – encrypted-feeling 1:1 messaging over Socket.IO, keyed by phone number.
- **MeetSpace** – multi-party video meetings using WebRTC + Socket.IO signaling.
- **DeskLink** – remote desktop sessions using a native DeskLink Agent and a WebRTC data channel for control.

Top-level layout:
- Electron + React/Vite app at repo root (`main.js`, `src/`, `vite.config.js`).
- Backend API and Socket.IO signaling server in `backend/`.
- DeskLink native agent in `DeskLinkAgent/` with a .NET 8 console app and a Node.js WebRTC helper in `DeskLinkAgent/WebRTC/`.

Vite path aliases (see `vite.config.js`):
- `@` → `./src`
- `@components` → `./components`

## How to build and run

### Prerequisites

- Node.js (for Electron shell, React front-end, backend, and Node WebRTC helper).
- .NET 8 SDK (for `DeskLinkAgent`).
- MongoDB instance reachable from the backend.

Key environment variables (used across the stack):
- **Backend (`backend/`):**
  - `MONGO_URI` – MongoDB connection string (required).
  - `JWT_SECRET` – secret used for JWT auth and WebRTC session tokens (required).
  - `PORT` – backend HTTP/Socket.IO port (defaults to `5000`).
  - `CLIENT_ORIGIN` – allowed CORS origin for the SPA; defaults to `http://localhost:5173`.
  - Optional TURN integration for WebRTC: `TURN_URL`, `TURN_SECRET`.
- **Frontend (Vite / Electron):**
  - `VITE_API_BASE` – base URL for REST API (defaults to `https://anydesk.onrender.com/api`).
  - `VITE_SOCKET_URL` – Socket.IO base URL (defaults to `https://anydesk.onrender.com`).

For **local, all-in-one development**, you will usually want:
- `VITE_API_BASE=http://localhost:5000/api`
- `VITE_SOCKET_URL=http://localhost:5000`

### Frontend + Electron shell (root)

From the repo root:

- Install dependencies:
  - `npm install`
- Run Vite dev server (web-only):
  - `npm run dev`
- Run Electron shell (points at Vite dev server when `NODE_ENV=development`):
  - In a **second terminal**, from the repo root: `npm start`
- Build the Vite bundle (for production Electron):
  - `npm run build`
- Preview the built SPA in a standalone HTTP server:
  - `npm run preview`

Electron production loading:
- In development, `main.js` loads `http://localhost:5173`.
- In production, it loads `dist/index.html` from the built Vite bundle.

### Backend API + Socket.IO server (`backend/`)

From `backend/`:

- Install dependencies:
  - `npm install`
- Run in development with auto-reload (requires `MONGO_URI`, `JWT_SECRET` at minimum):
  - `npm run dev`
- Run in production mode:
  - `npm start`

This process starts:
- The REST API (auth, contacts, messaging, device/remote control) on `PORT` (5000 by default).
- The Socket.IO server used by ChatSpace, MeetSpace, and DeskLink (same port).
- Health and metrics endpoints:
  - `/health` – basic JSON health check.
  - `/metrics` – Prometheus-style metrics (active sessions, ICE failures, etc.).

### DeskLink Agent (`DeskLinkAgent/`)

The DeskLink Agent is a .NET 8 console app that talks to the backend via Socket.IO and shells out to a Node WebRTC helper for desktop capture and control.

Build and run (agent side):

- .NET agent (from repo root or `DeskLinkAgent/`):
  - Build: `dotnet build DeskLinkAgent/DeskLinkAgent.csproj`
  - Run: `dotnet run --project DeskLinkAgent/DeskLinkAgent.csproj`
- Node WebRTC helper (copied into the agent output by the csproj, but can also be run directly during development):
  - From `DeskLinkAgent/WebRTC/`:
    - `npm install`
    - `npm start` (runs `NodeHelper.js`)

The agent must be configured (via environment or `.env`, see `DotNetEnv` in the csproj) to connect to the same Socket.IO endpoint as the frontend (`VITE_SOCKET_URL` / backend `PORT`).

### Testing

#### Backend tests

There is a Mocha/Chai/Sinon-style test file in `backend/tests/signaling.test.js` covering:
- `RemoteSession` model behavior and defaults.
- WebRTC signaling payload structure.
- `sessionToken` utilities (`generateSessionToken`, `verifySessionToken`).

At the moment, `backend/package.json` does **not** define a `test` script and does **not** declare `mocha`, `chai`, or `sinon` as devDependencies. To actually run the tests you will need to:
- Add the appropriate test dependencies (e.g. `mocha`, `chai`, `sinon`) to `devDependencies`.
- Add a script such as `"test": "mocha tests/**/*.test.js"` to `backend/package.json`.

Once that wiring exists, examples of useful commands would be:
- Run all backend tests:
  - From `backend/`: `npm test`
- Run a single backend test file:
  - From `backend/`: `npx mocha tests/signaling.test.js`

Currently, there are **no** configured frontend or Electron tests.

## High-level architecture

### Electron shell and SPA entry

- `main.js` creates a single `BrowserWindow` and loads either:
  - `http://localhost:5173` when `NODE_ENV=development` (assumes `npm run dev` is running), or
  - `dist/index.html` when packaged.
- The SPA entry is `src/main.jsx`:
  - Renders `App` inside a `HashRouter` (routes are hash-based, which works well inside Electron).

### Authentication and routing (`src/modules/auth`, `src/App.jsx`)

- `src/modules/auth/` contains:
  - `context/AuthContext.jsx` – wraps the app in `AuthProvider`, manages auth state and user info.
  - `hooks/useAuth.js` – hook that exposes `isAuthenticated`, `loading`, and user data.
  - `services/auth.api.js` – minimal REST client for `/api/auth/signup`, `/api/auth/login`, `/api/auth/me` using `VITE_API_BASE`.
  - `pages/Welcome.jsx`, `Login.jsx`, `Signup.jsx` – public auth screens.
- `src/App.jsx` defines the main routing graph:
  - `/` → `Welcome` (entry screen).
  - `/login`, `/signup` → auth forms.
  - AuthGuarded `/workspace/*` routes (only accessible if `useAuth().isAuthenticated`):
    - `/workspace/messages` → ChatSpace.
    - `/workspace/meet` → MeetSpace.
    - `/workspace/desklink` and `/workspace/desklink/viewer` → DeskLink UI and remote viewer.
  - Any unknown route (`*`) redirects back to `/`.

### ChatSpace (messaging) – `src/modules/chatspace` + backend messaging

Frontend:
- `src/modules/chatspace/components/` contains sidebar, chat window, message bubbles, etc.
- `src/modules/chatspace/hooks/useChatData.js` – pulls/organizes conversation lists from REST.
- `src/modules/chatspace/hooks/useChatSocket.js`:
  - Establishes a Socket.IO connection to `VITE_SOCKET_URL` with `auth: { token }`.
  - Listens to and emits `private-message` events.
  - Exposes `sendMessage(toPhone, text)`; messages are keyed by phone number.
- `src/modules/chatspace/services/*.api.js` calls the backend `/api/contacts` and `/api/messages` REST endpoints.

Backend:
- Messaging routes/controllers live under `backend/routes/messagingRoutes.js` and `backend/controllers/messagingController.js` (not exhaustively documented here, but follow standard Express patterns).
- `backend/socketManager.js`:
  - Authenticates sockets with JWT (`JWT_SECRET`), attaches `socket.user`, `socket.userPhone` (countryCode + phoneNumber), `socket.userId`.
  - Maintains in-memory maps:
    - `onlineUsersByPhone` and `onlineUsersById` for routing.
  - On `private-message`:
    - Validates and persists the message via the `Message` model.
    - Emits the same `private-message` payload back to the sender and to all online receivers with the target phone.

### MeetSpace (video meetings) – `src/modules/meetspace` + calling components + backend signaling

Frontend:
- `src/modules/meetspace/pages/Meet.jsx` wraps `MeetDashboard` into the workspace layout.
- `src/modules/meetspace/components/meet/MeetDashboard.jsx` drives the meeting lifecycle:
  - `NewMeetingButton` and `JoinMeetingButton` controls.
  - Uses `crypto.randomUUID()` to generate a meeting `roomId` for new meetings.
  - Uses `navigator.mediaDevices.getUserMedia` to create a `localStream` and passes it to the lower-level `VideoRoom` components.
- WebRTC UI/logic is in `src/components/calling/` (shared across MeetSpace and potentially other callers):
  - `VideoRoom.jsx`, `MeetingGrid.jsx`, `ParticipantTile.jsx`, `ScreenShareTile.jsx`, `MeetingChatPanel.jsx`, etc.
  - `useRoomClient`, `usePeerConnections`, `useMeetingParticipants`, `useMediaDevices`, `useScreenShare` manage peer connections and in-room state.

Backend:
- `backend/socketManager.js` has a dedicated **WebRTC Meet signaling** section:
  - Maintains `rooms`, `roomPermissions`, and `roomChats` maps keyed by `roomId`.
  - Handles events:
    - `user-joined` – joins room, tracks participant (with both meeting-scoped and auth user IDs), returns existing users and chat history.
    - `offer`, `answer`, `ice-candidate` – P2P WebRTC signaling between specific users in a room.
    - `screen-share-started`/`screen-share-stopped` – broadcast UI events.
    - `audio-mute`/`audio-unmute`, `video-mute`/`video-unmute`.
    - `meeting-chat-message` – in-meeting chat with persisted in-memory history per room (capped to ~200 messages).
    - Host controls: `host_toggle_mic`, `host_toggle_camera`, `host_disable_chat`, `host_mute_all`, `host_remove_user`, `end-meeting`.
  - Room lifecycle: rooms and associated permissions/chats are cleaned up when empty or on explicit `end-meeting`.

### DeskLink (remote desktop) – `src/modules/desklink` + backend remote sessions + DeskLinkAgent

Frontend:
- `src/modules/desklink/pages/DeskLinkPage.jsx` – main DeskLink UI inside the workspace.
- `src/modules/desklink/pages/RemoteViewerPage.jsx` – full-screen remote viewer.
- `services/desklink.api.js` – REST client for the `backend/` remote-control endpoints:
  - `/api/device/register` – register local agent device.
  - `/api/contact-links` – retrieve saved contacts / linked devices.
  - `/api/remote/request`, `/api/remote/accept`, `/api/remote/reject`, `/api/remote/complete` – remote session lifecycle.
  - `/api/remote/turn-token` – fetch dynamic STUN/TURN ICE server config.
- `hooks/useDeskLinkSocket.js`:
  - Creates a Socket.IO connection to `VITE_SOCKET_URL` with the auth token.
  - Exposes `socket` and forwards:
    - `desklink-remote-request` events to the UI (incoming remote session requests).
    - `desklink-remote-response` events (accept/reject/ended responses).
  - Shares the connection via `window.__desklinkSocket` so `useDeskLinkWebRTC` can reuse it.
- `hooks/useDeskLinkWebRTC.js`:
  - Manages a `RTCPeerConnection`, remote `MediaStream` (screen), and a data channel for input/control messages.
  - Uses a combination of static `TURN_ICE_SERVERS` and ICE from the backend to connect to the DeskLinkAgent device.
  - Uses the ephemeral session token (`generateSessionToken` on the backend) for validating `webrtc-offer`, `webrtc-answer`, and `webrtc-ice` messages.
  - Encapsulates the viewer role (`startAsCaller`) and host role (`handleOffer`), including buffering ICE candidates until remote descriptions are set.
  - Exposes `sendControlMessage` for higher-level components to send serialized control messages (mouse/keyboard/etc.) over the data channel.
- `components/` under `src/modules/desklink/components/` contains the presentation and control surfaces for remote sessions (saved devices list, access modals, remote video canvas, remote control toolbar).
- `utils/controlProtocol.js` and `utils/nativeBridge.js` define the protocol and message shapes sent over the data channel and how they map to host-side behavior.

Backend:
- Data model:
  - `backend/models/RemoteSession.js` – tracks each remote session with:
    - `sessionId`, `callerUserId`, `receiverUserId`, `callerDeviceId`, `receiverDeviceId`.
    - `permissions` (view-only, control, file transfer, clipboard), monitor selection, resolution.
    - `status` (`pending`, `accepted`, `rejected`, `ended`) and audit trail.
- REST API (`backend/controllers/remoteController.js`, `backend/routes/remoteRoutes.js`):
  - `POST /api/remote/request` – creates a `RemoteSession` record, verifies caller device ownership, resolves target device either by specific `toDeviceId` or via `ContactLink`/`Device` queries, and emits a `desklink-remote-request` Socket.IO event to the target user.
  - `POST /api/remote/accept` – validates that the receiver is authorized, ensures receiver device ownership, moves session to `accepted`, and calls `generateSessionToken` twice to create short-lived tokens for both caller and receiver:
    - Emits `desklink-session-start` to the caller **user** and the receiver **device**, including metadata and their respective tokens.
    - Emits compatibility events `desklink-remote-response` and `desklink-remote-accepted` to the caller user.
  - `POST /api/remote/reject` – sets `status` to `rejected` and notifies the caller via Socket.IO.
  - `POST /api/remote/session/:id/complete` (+ `POST /api/remote/complete`) – marks the session as `ended` and emits `desklink-session-ended` to both caller and receiver.
  - `GET /api/remote/turn-token` – returns ICE servers:
    - Always includes STUN (`stun:stun.l.google.com:19302`, etc.).
    - Optionally appends a TURN server if `TURN_URL` and `TURN_SECRET` are configured, using `generateTurnCredentials`.
- Socket signaling (`backend/socketManager.js` – remote desktop section):
  - Maintains:
    - `onlineDevicesById` – mapping device IDs to connected sockets.
    - `pendingSignalsByDevice` – queue of offers/answers/ICE for temporarily offline devices.
    - Simple metrics: `activeSessions`, `offersRelayed`, `iceFailures`, `datachannelMsgs`.
  - Validates session ownership/authorization via `validateSessionAccess` (Mongo lookup) and `verifySessionToken`.
  - Handles events:
    - `webrtc-offer` – validates token and session, increments `offersRelayed`, emits to target device via `emitToDevice` and queues if offline.
    - `webrtc-answer` – symmetric to offer.
    - `webrtc-ice` – relays ICE candidates, counting failures.
    - `webrtc-cancel` – ends the session in Mongo, decrements `activeSessions`, and broadcasts cancellation to both users and both devices.
  - Device registration:
    - `register` event from DeskLinkAgent/Node helper wires a `deviceId` to the current socket, ensures a `Device` record in Mongo, updates `lastOnline`, and flushes any queued signals.

DeskLinkAgent:
- `DeskLinkAgent/DeskLinkAgent.csproj` targets `net8.0` and copies `WebRTC/**` into the output directory.
- Uses `SocketIOClient` and config libraries to:
  - Establish a persistent connection to the backend Socket.IO server.
  - Register the agent device via the `register` event.
- The Node helper (`DeskLinkAgent/WebRTC/NodeHelper.js`) uses `wrtc`, `screenshot-desktop`, `robotjs`, and `socket.io-client` to:
  - Capture the host desktop and stream it over WebRTC.
  - Apply incoming data channel control messages (mouse/keyboard actions).

### User and identity model – backend

- `backend/models/User.js` defines user identity:
  - `fullName`, `email`, `countryCode`, `phoneNumber`, `password` (hashed via `bcryptjs`).
  - `devices` (string IDs) and `contacts` with references to other users and their devices.
  - Unique compound index on `(countryCode, phoneNumber)`.
- This model underpins:
  - JWT auth (`authController` / `authRoutes`).
  - ChatSpace addressing (phone-number based).
  - Device and contact linking for DeskLink (via `Device` and `ContactLink` models).

## Notes for future changes

- **Environment defaults vs. local dev:** many frontend services default to `https://anydesk.onrender.com` for `VITE_API_BASE` / `VITE_SOCKET_URL`. For local backend work (e.g. modifying `backend/socketManager.js` or `remoteController.js`), always set these Vite env vars to point at your local server.
- **Socket reuse:** DeskLink intentionally reuses a shared Socket.IO connection via `window.__desklinkSocket` to avoid duplicate connections from the same renderer process. When making changes to DeskLink, be careful not to break this sharing behavior or create socket leaks.
- **RemoteSession invariants:**
  - `callerUserId` is always the viewer (the one initiating the session).
  - `receiverUserId` and `receiverDeviceId` represent the host/agent device.
  - `acceptRemoteSession` intentionally does **not** overwrite `receiverDeviceId` from client input; it relies on the device chosen during `requestRemoteSession`.
- **TURN credentials:** `generateTurnCredentials` and `/api/remote/turn-token` provide a path to move ICE configuration out of the frontend and into secure env vars. If you see hard-coded TURN credentials in `useDeskLinkWebRTC.js`, prefer migrating them to use the backend token flow.
