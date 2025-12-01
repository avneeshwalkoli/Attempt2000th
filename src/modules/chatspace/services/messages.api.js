const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

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

export const messagesApi = {
  async history(token, phoneNumber) {
    const res = await fetch(`${API_BASE}/messages/history/${encodeURIComponent(phoneNumber)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return parseJSON(res);
  },
};
