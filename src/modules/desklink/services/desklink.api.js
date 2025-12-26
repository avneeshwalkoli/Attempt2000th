const API_BASE = import.meta.env.VITE_API || 'http://localhost:5000/api';

const parseJSON = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || 'Request failed';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
};

export const desklinkApi = {
  async registerDevice(token, payload) {
    const res = await fetch(`${API_BASE}/device/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return parseJSON(res);
  },

  async listContacts(token) {
    const res = await fetch(`${API_BASE}/contact-links`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return parseJSON(res);
  },

  async requestRemote(token, payload) {
    const res = await fetch(`${API_BASE}/remote/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return parseJSON(res);
  },

  // In-meeting remote access: webId-only (toUserId), deviceId resolved server-side
  async requestMeetingRemote(token, targetUserId) {
    const res = await fetch(`${API_BASE}/remote/meeting-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ toUserId: targetUserId }),
    });
    return parseJSON(res);
  },

  async acceptRemote(token, payload) {
    const res = await fetch(`${API_BASE}/remote/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return parseJSON(res);
  },

  async rejectRemote(token, payload) {
    const res = await fetch(`${API_BASE}/remote/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return parseJSON(res);
  },

  async completeRemote(token, payload) {
    const res = await fetch(`${API_BASE}/remote/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return parseJSON(res);
  },

  async getTurnToken(token) {
    const res = await fetch(`${API_BASE}/remote/turn-token`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return parseJSON(res);
  },
};


