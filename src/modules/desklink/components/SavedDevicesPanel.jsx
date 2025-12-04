import React from 'react';
import { Search, Monitor, Wifi, Dot } from 'lucide-react';

export default function SavedDevicesPanel({
  contacts = [],
  search,
  onSearchChange,
  selectedId,
  onSelectContact,
}) {
  const computeOnline = (contact) => {
    if (!contact.deviceStatus?.lastOnline) return false;
    const lastOnline = new Date(contact.deviceStatus.lastOnline).getTime();
    return Date.now() - lastOnline < 2 * 60 * 1000; // 2 minutes threshold
  };

  const onlineCount = contacts.filter((c) => computeOnline(c)).length;
  return (
    <section
      className="h-full flex flex-col rounded-3xl border border-slate-800/70 bg-slate-900/60
                 backdrop-blur-2xl shadow-[0_24px_80px_rgba(15,23,42,0.85)] overflow-hidden
                 animate-[fadeIn_0.45s_ease-out]"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-800/60 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">
            Saved Devices
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Quick-connect to any of your linked machines.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Online
          </span>
          <span className="text-slate-700">•</span>
          <span>{onlineCount}</span>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-800/60 bg-slate-900/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name or DeskLink ID…"
            className="w-full pl-9 pr-3 py-2.5 text-xs rounded-2xl bg-slate-900/80 border border-slate-800
                       text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/80
                       focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {contacts.length === 0 && (
          <div className="px-5 py-6 text-xs text-slate-500">
            No contacts yet. Link a device to a teammate to quick-connect.
          </div>
        )}

        {contacts.map((contact) => {
          const isActive = contact.id === selectedId;
          const online = computeOnline(contact);
          return (
            <button
              key={contact.id}
              onClick={() => onSelectContact(contact)}
              className={`w-full px-4 py-3 flex items-center gap-3 text-left group transition-all
                         ${
                           isActive
                             ? 'bg-slate-800/80'
                             : 'hover:bg-slate-800/60'
                         }`}
            >
              <div
                className={`w-9 h-9 rounded-2xl flex items-center justify-center
                            bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-700
                            shadow-[0_10px_30px_rgba(15,23,42,0.9)]`}
              >
                <Monitor className="w-4 h-4 text-slate-200" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-100 truncate">
                    {contact.aliasName || contact.contactUser.fullName}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                    <Wifi
                      className={`w-3 h-3 ${
                        online ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    />
                    {online ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] font-mono text-slate-500 truncate">
                  {contact.contactDeviceId}
                </p>
              </div>

              <div className="flex items-center">
                <Dot
                  className={`w-5 h-5 ${
                    online ? 'text-emerald-400' : 'text-rose-500'
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}


