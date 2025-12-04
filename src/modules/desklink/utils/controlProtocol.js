/**
 * DeskLink Control Protocol
 * Defines message types and utilities for remote control
 */

export const MessageTypes = {
  MOUSE_MOVE: 'mouse',
  MOUSE_CLICK: 'click',
  MOUSE_WHEEL: 'wheel',
  KEY_PRESS: 'key',
  CLIPBOARD: 'clipboard',
  FILE_INIT: 'file-init',
  FILE_CHUNK: 'file-chunk',
  FILE_COMPLETE: 'file-complete',
  PING: 'ping',
};

/**
 * Create mouse move message
 */
export function createMouseMoveMessage(x, y, sessionId, token) {
  return {
    type: MessageTypes.MOUSE_MOVE,
    sessionId,
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    ts: Date.now(),
    auth: token,
  };
}

/**
 * Create mouse click message
 */
export function createMouseClickMessage(x, y, button, sessionId, token) {
  return {
    type: MessageTypes.MOUSE_CLICK,
    sessionId,
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    button: button || 'left',
    ts: Date.now(),
    auth: token,
  };
}

/**
 * Create mouse wheel message
 */
export function createMouseWheelMessage(deltaX, deltaY, sessionId, token) {
  return {
    type: MessageTypes.MOUSE_WHEEL,
    sessionId,
    deltaX,
    deltaY,
    ts: Date.now(),
    auth: token,
  };
}

/**
 * Create keyboard message
 */
export function createKeyMessage(key, action, modifiers, sessionId, token) {
  return {
    type: MessageTypes.KEY_PRESS,
    sessionId,
    key,
    action: action || 'press',
    modifiers: modifiers || {},
    ts: Date.now(),
    auth: token,
  };
}

/**
 * Create clipboard message
 */
export function createClipboardMessage(text, sessionId, token) {
  return {
    type: MessageTypes.CLIPBOARD,
    sessionId,
    text,
    ts: Date.now(),
    auth: token,
  };
}

/**
 * Create ping message
 */
export function createPingMessage(sessionId, token) {
  return {
    type: MessageTypes.PING,
    sessionId,
    ts: Date.now(),
    auth: token,
  };
}

/**
 * Throttle utility for mouse moves
 */
export class MessageThrottler {
  constructor(intervalMs = 16) {
    this.intervalMs = intervalMs;
    this.lastSent = 0;
    this.pending = null;
    this.timeoutId = null;
  }

  throttle(message, sendFn) {
    const now = Date.now();
    const timeSinceLastSent = now - this.lastSent;

    if (timeSinceLastSent >= this.intervalMs) {
      sendFn(message);
      this.lastSent = now;
      this.pending = null;
    } else {
      this.pending = message;
      if (!this.timeoutId) {
        this.timeoutId = setTimeout(() => {
          if (this.pending) {
            sendFn(this.pending);
            this.lastSent = Date.now();
            this.pending = null;
          }
          this.timeoutId = null;
        }, this.intervalMs - timeSinceLastSent);
      }
    }
  }

  clear() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.pending = null;
  }
}