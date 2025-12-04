# End-to-End Test Plan - DeskLink Part 3

## Test Environment Setup

### Prerequisites
- Two test accounts (User A, User B)
- Two browser windows or devices
- Backend server running
- MongoDB running
- (Optional) Agent running for full test

---

## Test Case 1: Basic Session Flow

### Objective
Verify complete session lifecycle from request to disconnect

### Steps

1. **Setup**
   - Browser A: Login as User A
   - Browser B: Login as User B
   - User B creates contact link
   - User A adds User B using contact link

2. **Request Session**
   - Browser A: Navigate to DeskLink
   - Browser A: Select User B from saved contacts
   - Browser A: Click "Request Access"
   - **Expected**: "Request Sent" modal appears

3. **Accept Session**
   - Browser B: Incoming request modal appears
   - Browser B: Review permissions checkboxes
   - Browser B: Click "Accept & Connect"
   - **Expected**: Modal closes, session starts

4. **Verify Connection**
   - Browser A: Redirected to `/workspace/desklink/viewer?sessionId=...`
   - Browser A: See "Connecting..." message
   - Browser A: Connection state changes to "Connected"
   - **Expected**: Green "Connected" indicator

5. **End Session**
   - Browser A: Click "End Session" button
   - **Expected**: Both browsers return to DeskLink page
   - **Expected**: Session marked as "ended" in database

### Success Criteria
- ✅ Request sent successfully
- ✅ Accept triggers session start
- ✅ WebRTC connection established
- ✅ Session ends cleanly on both sides

---

## Test Case 2: Permission Controls

### Objective
Verify permission toggles work correctly

### Steps

1. **View Only Mode**
   - Browser B: Receive incoming request
   - Browser B: Check "View Only" checkbox
   - Browser B: Click "Accept & Connect"
   - Browser A: Try to move mouse on video area
   - **Expected**: "View Only Mode" indicator shown
   - **Expected**: No control messages sent

2. **Disable Control**
   - Browser B: Uncheck "Allow Mouse & Keyboard Control"
   - Browser B: Accept session
   - Browser A: Try to click on video
   - **Expected**: Clicks not registered on remote side

3. **Full Control**
   - Browser B: All permissions enabled
   - Browser B: Accept session
   - Browser A: Move mouse, click, type
   - **Expected**: All actions work

### Success Criteria
- ✅ View only prevents control
- ✅ Individual permissions work
- ✅ UI reflects current permissions

---

## Test Case 3: WebRTC Signaling

### Objective
Verify WebRTC offer/answer/ICE flow

### Steps

1. **Monitor Network Tab**
   - Browser A & B: Open DevTools Network tab
   - Filter for WebSocket frames

2. **Start Session**
   - User A requests, User B accepts
   - **Expected**: See these socket events in order:
     1. `desklink-session-start` (both)
     2. `webrtc-offer` (A → Server → B)
     3. `webrtc-answer` (B → Server → A)
     4. Multiple `webrtc-ice` events

3. **Verify ICE Candidates**
   - **Expected**: At least 2-3 ICE candidates exchanged
   - **Expected**: Connection state progresses: new → checking → connected

### Success Criteria
- ✅ Offer/answer exchange completes
- ✅ ICE candidates relayed
- ✅ Connection reaches "connected" state

---

## Test Case 4: Control Messages

### Objective
Verify mouse and keyboard control

### Steps

1. **Mouse Movement**
   - Browser A: Move mouse over video area
   - Browser B: Watch actual cursor (if agent running)
   - **Expected**: Cursor moves on remote screen
   - **Expected**: Remote cursor overlay visible on Browser A

2. **Mouse Clicks**
   - Browser A: Click on video area
   - **Expected**: Click registered on remote side
   - **Expected**: Visual feedback on Browser A

3. **Keyboard Input**
   - Browser A: Type text while focused on viewer
   - **Expected**: Text appears on remote side
   - **Expected**: Modifiers (Ctrl, Alt, Shift) work

4. **Throttling**
   - Browser A: Move mouse rapidly
   - **Expected**: Messages throttled to ~60/sec
   - **Expected**: No lag or queue buildup

### Success Criteria
- ✅ Mouse moves smoothly
- ✅ Clicks register correctly
- ✅ Keyboard input works
- ✅ Throttling prevents spam

---

## Test Case 5: Session Rejection

### Objective
Verify rejection flow

### Steps

1. **Request Session**
   - Browser A: Request access to User B

2. **Reject**
   - Browser B: Click "Reject" on incoming modal
   - **Expected**: Modal closes
   - **Expected**: Browser A shows "Remote user rejected" alert
   - **Expected**: Session status = "rejected" in DB

### Success Criteria
- ✅ Rejection handled gracefully
- ✅ Caller notified
- ✅ No connection established

---

## Test Case 6: Connection Quality

### Objective
Verify stats and quality indicators

### Steps

1. **Start Session**
   - Establish connection

2. **Check Stats Overlay**
   - Browser A: Look at stats overlay
   - **Expected**: See FPS, Bitrate, RTT values
   - **Expected**: Values update every second

3. **Simulate Poor Network**
   - Browser DevTools: Throttle network to "Slow 3G"
   - **Expected**: Bitrate decreases
   - **Expected**: RTT increases
   - **Expected**: Possible packet loss shown

4. **Restore Network**
   - Remove throttling
   - **Expected**: Stats improve
   - **Expected**: Connection recovers

### Success Criteria
- ✅ Stats display correctly
- ✅ Values are realistic
- ✅ Updates in real-time

---

## Test Case 7: Multiple Sessions

### Objective
Verify session isolation

### Steps

1. **Start Session 1**
   - User A → User B

2. **Start Session 2** (different users)
   - User C → User D

3. **Verify Isolation**
   - **Expected**: Each session has unique sessionId
   - **Expected**: Control messages don't cross sessions
   - **Expected**: Both sessions work independently

4. **End One Session**
   - End Session 1
   - **Expected**: Session 2 continues unaffected

### Success Criteria
- ✅ Multiple sessions supported
- ✅ Sessions isolated
- ✅ Independent lifecycle

---

## Test Case 8: Error Handling

### Objective
Verify error scenarios

### Steps

1. **Backend Offline**
   - Stop backend server
   - Try to start session
   - **Expected**: Connection error shown
   - **Expected**: Graceful failure message

2. **Session Timeout**
   - Start session
   - Wait 5+ minutes idle
   - **Expected**: Session token expires
   - **Expected**: Reconnection or end session

3. **Invalid Session ID**
   - Navigate to `/workspace/desklink/viewer?sessionId=invalid`
   - **Expected**: "Invalid Session" message
   - **Expected**: Back button works

### Success Criteria
- ✅ Errors handled gracefully
- ✅ User-friendly messages
- ✅ No crashes

---

## Test Case 9: Agent Integration

### Objective
Verify C# agent with Node helper

### Prerequisites
- DeskLink Agent running
- Node helper dependencies installed

### Steps

1. **Start Agent**
   ```powershell
   cd DeskLinkAgent/bin/Debug/net6.0
   ./DeskLinkAgent.exe
   ```
   - **Expected**: Agent connects to backend
   - **Expected**: Device registered

2. **Request Session**
   - Browser A: Request access to agent device
   - Agent: Incoming request notification
   - Agent: Accept via IPC or auto-accept

3. **Verify Screen Capture**
   - **Expected**: Browser A sees agent's screen
   - **Expected**: Screen updates at 15+ FPS

4. **Test Input Injection**
   - Browser A: Move mouse
   - **Expected**: Agent's cursor moves
   - Browser A: Click
   - **Expected**: Click registered on agent PC

### Success Criteria
- ✅ Agent connects successfully
- ✅ Screen capture works
- ✅ Input injection works
- ✅ Session ends cleanly

---

## Test Case 10: Docker Deployment

### Objective
Verify Docker Compose setup

### Steps

1. **Build and Start**
   ```powershell
   docker-compose up -d
   ```
   - **Expected**: All services start
   - **Expected**: No errors in logs

2. **Health Check**
   ```powershell
   curl http://localhost:5000/health
   ```
   - **Expected**: `{"status":"ok"}`

3. **Metrics**
   ```powershell
   curl http://localhost:5000/metrics
   ```
   - **Expected**: Prometheus metrics

4. **Test Session**
   - Run Test Case 1 against Docker deployment
   - **Expected**: All features work

5. **Cleanup**
   ```powershell
   docker-compose down
   ```

### Success Criteria
- ✅ Docker services start
- ✅ Health endpoints work
- ✅ Sessions work in Docker
- ✅ Clean shutdown

---

## Automated Test Script (Playwright)

```javascript
// tests/e2e/remote-session.spec.js
const { test, expect } = require('@playwright/test');

test.describe('DeskLink Remote Session', () => {
  test('complete session flow', async ({ browser }) => {
    // Create two contexts (User A and User B)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    // Login both users
    await pageA.goto('http://localhost:5173');
    await pageA.fill('[name="phone"]', '1234567890');
    await pageA.fill('[name="password"]', 'password');
    await pageA.click('button[type="submit"]');
    
    await pageB.goto('http://localhost:5173');
    await pageB.fill('[name="phone"]', '0987654321');
    await pageB.fill('[name="password"]', 'password');
    await pageB.click('button[type="submit"]');
    
    // Navigate to DeskLink
    await pageA.click('text=DeskLink');
    await pageB.click('text=DeskLink');
    
    // User A requests session
    await pageA.click('text=Request Access');
    await expect(pageA.locator('text=Request Sent')).toBeVisible();
    
    // User B accepts
    await expect(pageB.locator('text=Incoming DeskLink Request')).toBeVisible();
    await pageB.click('text=Accept & Connect');
    
    // Verify connection
    await expect(pageA.locator('text=Connected')).toBeVisible({ timeout: 10000 });
    
    // End session
    await pageA.click('text=End Session');
    await expect(pageA).toHaveURL(/.*desklink$/);
    
    await contextA.close();
    await contextB.close();
  });
});
```

---

## Performance Benchmarks

### Target Metrics
- Session establishment: < 3 seconds
- First frame: < 2 seconds
- Mouse latency: < 100ms
- FPS: 15-30 (adjustable)
- Bitrate: 500-2000 kbps

### Load Testing
- Concurrent sessions: 10+
- CPU usage: < 50% per session
- Memory: < 200MB per session

---

## Test Results Template

```
Test Date: __________
Tester: __________
Environment: [ ] Local [ ] Docker [ ] Production

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC1: Basic Flow | ✅ ❌ | |
| TC2: Permissions | ✅ ❌ | |
| TC3: Signaling | ✅ ❌ | |
| TC4: Controls | ✅ ❌ | |
| TC5: Rejection | ✅ ❌ | |
| TC6: Quality | ✅ ❌ | |
| TC7: Multiple | ✅ ❌ | |
| TC8: Errors | ✅ ❌ | |
| TC9: Agent | ✅ ❌ | |
| TC10: Docker | ✅ ❌ | |

Overall: ✅ PASS ❌ FAIL

Issues Found:
1. 
2. 
3. 
```