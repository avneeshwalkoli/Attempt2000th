/**
 * Utilities to talk to the native DeskLink agent exposed by Electron preload.
 * Falls back to localStorage when running purely in a browser.
 */

export async function getNativeDeviceId() {
  // 1) Electron / native bridge (if running in desktop shell)
  if (window?.deskLinkAgent?.getDeviceId) {
    const value = await window.deskLinkAgent.getDeviceId();
    if (value) {
      localStorage.setItem('desklinkDeviceId', value);
      return value;
    }
  }

  // 2) Existing stored id (maybe set earlier)
  const existing = localStorage.getItem('desklinkDeviceId');
  if (existing) {
    return existing;
  }

  // 3) 🔥 Browser-only fallback: generate a deterministic web device id
  try {
    const raw = localStorage.getItem('vd_user_profile');
    if (raw) {
      const profile = JSON.parse(raw);
      if (profile.id) {
        const webId = `web-${profile.id}`;
        localStorage.setItem('desklinkDeviceId', webId);
        console.log('[DeskLink] using browser fallback deviceId:', webId);
        return webId;
      }
    }
  } catch (e) {
    console.error('[DeskLink] failed to create fallback deviceId', e);
  }

  // 4) Last resort: empty string
  return '';
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


