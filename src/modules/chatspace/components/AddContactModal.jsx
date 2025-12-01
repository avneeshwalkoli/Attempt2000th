import React, { useState } from 'react';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { contactsApi } from '../services/contacts.api.js';

export default function AddContactModal({ onClose, onAdded }) {
  const { token } = useAuth();
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await contactsApi.add(token, { phoneNumber, countryCode });
      onAdded?.(data.contact);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add contact');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Add Contact</h2>
        <p className="text-xs text-slate-400 mb-4">Enter the phone number of the user you want to add.</p>

        {error && (
          <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Phone Number</label>
            <div className="flex gap-2">
              <select
                className="w-24 px-2 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              >
                <option value="+91">+91</option>
                <option value="+1">+1</option>
                <option value="+44">+44</option>
              </select>
              <input
                type="tel"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="9876543210"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-xs text-white"
            >
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
