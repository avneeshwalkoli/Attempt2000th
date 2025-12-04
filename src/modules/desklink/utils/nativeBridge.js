/**
 * Utilities to talk to the native DeskLink agent exposed by Electron preload.
 * Falls back to localStorage when running purely in a browser.
 */

export async function getNativeDeviceId() {
  if (window?.deskLinkAgent?.getDeviceId) {
    const value = await window.deskLinkAgent.getDeviceId();
    if (value) {
      localStorage.setItem('desklinkDeviceId', value);
      return value;
    }
  }
  return localStorage.getItem('desklinkDeviceId') || '';
}

export function startRemoteClientSession({ sessionId, receiverDeviceId }) {
  if (window?.deskLinkAgent?.startClientSession) {
    window.deskLinkAgent.startClientSession({ sessionId, receiverDeviceId });
  } else {
    console.info('[DeskLink] start client session', sessionId, receiverDeviceId);
  }
}

export function startRemoteHostSession({ sessionId, callerDeviceId }) {
  if (window?.deskLinkAgent?.startHostSession) {
    window.deskLinkAgent.startHostSession({ sessionId, callerDeviceId });
  } else {
    console.info('[DeskLink] start host session', sessionId, callerDeviceId);
  }
}


