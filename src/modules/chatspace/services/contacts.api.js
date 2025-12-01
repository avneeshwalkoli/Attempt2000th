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

export const contactsApi = {
  async list(token) {
    const res = await fetch(`${API_BASE}/contacts/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return parseJSON(res);
  },

  async add(token, { phoneNumber, countryCode }) {
    const res = await fetch(`${API_BASE}/contacts/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phoneNumber, countryCode }),
    });
    return parseJSON(res);
  },
};
