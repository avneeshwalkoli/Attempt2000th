import React, { useEffect, useState } from 'react';
import SidebarShell from './SidebarShell.jsx';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { contactsApi } from '../services/contacts.api.js';
import AddContactModal from './AddContactModal.jsx';

const LAST_CHAT_KEY = 'vd_last_active_chat_phone';

export default function SidebarContacts({ activePhone, onSelectContact, refreshKey = 0 }) {
  const { token } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const data = await contactsApi.list(token);
        if (!cancelled) {
          setContacts(data.contacts || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load contacts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  useEffect(() => {
    if (!activePhone) {
      const last = localStorage.getItem(LAST_CHAT_KEY);
      if (last && contacts.some((c) => `${c.user.countryCode} ${c.user.phoneNumber}` === last)) {
        onSelectContact(last);
      }
    } else {
      localStorage.setItem(LAST_CHAT_KEY, activePhone);
    }
  }, [activePhone, contacts, onSelectContact]);

  const handleAdded = (contact) => {
    setContacts((prev) => [contact, ...prev]);
  };

  return (
    <>
      <SidebarShell />
      <section className="w-72 border-r border-slate-800 bg-slate-900/80 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="text-sm font-medium text-slate-100">Contacts</div>
          <button
            onClick={() => setShowAdd(true)}
            className="w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center justify-center"
            title="Add contact"
          >
            +
          </button>
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/40">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && contacts.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-500">Loading contacts…</div>
          )}

          {contacts.map((c) => {
            const phone = `${c.user.countryCode} ${c.user.phoneNumber}`;
            const isActive = phone === activePhone;
            return (
              <button
                key={c.id}
                onClick={() => onSelectContact(phone)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors border-l-2 ${
                  isActive
                    ? 'bg-slate-800/80 border-indigo-500'
                    : 'border-transparent hover:bg-slate-800/60'
                }`}
              >
                <div className="w-9 h-9 rounded-2xl bg-slate-700 flex items-center justify-center text-xs font-semibold text-white">
                  {c.user.fullName
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <div className="text-slate-100 text-sm truncate">{c.user.fullName}</div>
                    {!c.saved && (
                      <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[9px] text-slate-400 uppercase">
                        unsaved
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{phone}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {showAdd && (
        <AddContactModal onClose={() => setShowAdd(false)} onAdded={handleAdded} />
      )}
    </>
  );
}
