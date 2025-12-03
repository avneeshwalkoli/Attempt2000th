import React, { useState } from 'react';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { contactsApi } from '../services/contacts.api.js';
import { X, Sun, Moon } from 'lucide-react'; // Added icons

// --- Theme Utility Component (Embedded) ---
const ThemeToggle = ({ theme, toggleTheme }) => {
  const Icon = theme === 'dark' ? Sun : Moon;
  
  // Modal style for toggle button
  const baseClasses = "p-1 rounded-full transition-colors duration-300";
  const lightClasses = "text-gray-600 hover:bg-gray-100/70";
  const darkClasses = "text-gray-400 hover:bg-gray-700/70";
  
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${baseClasses} ${theme === 'dark' ? darkClasses : lightClasses} focus:outline-none focus:ring-2 focus:ring-opacity-50 focus:ring-indigo-500`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
};

export default function AddContactModal({ onClose, onAdded }) {
  const { token } = useAuth();
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      return newTheme;
    });
  };

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

  // --- Theme Classes Definition (Modal uses a consistent palette) ---
  const themeClasses = {
    light: {
      modalBg: 'bg-white',
      modalBorder: 'border-gray-200',
      textPrimary: 'text-gray-900',
      textSecondary: 'text-gray-500',
      inputBg: 'bg-gray-50',
      inputBorder: 'border-gray-300',
      focus: 'focus:ring-indigo-600 focus:border-indigo-600',
      primaryBtn: 'bg-indigo-600 hover:bg-indigo-700',
      secondaryBtn: 'border-gray-300 text-gray-700 hover:bg-gray-100',
      error: 'text-red-700 bg-red-100 border-red-300',
      selectArrow: 'text-gray-500',
    },
    dark: {
      modalBg: 'bg-gray-800',
      modalBorder: 'border-gray-700',
      textPrimary: 'text-gray-100',
      textSecondary: 'text-gray-400',
      inputBg: 'bg-gray-900/50', 
      inputBorder: 'border-gray-700',
      focus: 'focus:ring-indigo-400 focus:border-indigo-400', 
      primaryBtn: 'bg-indigo-500 hover:bg-indigo-400',
      secondaryBtn: 'border-gray-700 text-gray-300 hover:bg-gray-700',
      error: 'text-red-400 bg-red-900/40 border-red-700',
      selectArrow: 'text-gray-400',
    },
  };

  const currentTheme = themeClasses[theme];


  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className={`w-full max-w-sm ${currentTheme.modalBg} border ${currentTheme.modalBorder} rounded-xl p-6 shadow-2xl transition-colors duration-500 relative`}>
        
        <div className="flex justify-between items-start mb-4">
          <h2 className={`text-xl font-bold ${currentTheme.textPrimary}`}>Add Contact</h2>
          <div className="flex gap-2 items-center">
            {/* Theme Toggle */}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            {/* Close Button */}
            <button 
              onClick={onClose} 
              className={`p-1 rounded-full ${currentTheme.textSecondary} hover:text-red-500 hover:bg-red-500/10 transition-colors`}
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <p className={`text-sm ${currentTheme.textSecondary} mb-5`}>Enter the phone number of the user you want to add.</p>

        {error && (
          <div className={`mb-4 text-sm font-medium ${currentTheme.error} rounded-lg px-3 py-2 border`}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="phoneNumber" className={`block text-sm font-semibold ${currentTheme.textPrimary} mb-2`}>Phone Number</label>
            <div className="flex gap-3">
              <div className={`relative w-24`}>
                <select
                  id="countryCode"
                  className={`appearance-none w-full px-3 py-2.5 rounded-lg ${currentTheme.inputBg} border ${currentTheme.inputBorder} ${currentTheme.textPrimary} text-sm focus:outline-none focus:ring-2 ${currentTheme.focus} transition-all pr-7`}
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  <option value="+91">+91</option>
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                </select>
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${currentTheme.selectArrow}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
              </div>
              <input
                id="phoneNumber"
                type="tel"
                className={`flex-1 px-4 py-2.5 rounded-lg ${currentTheme.inputBg} border ${currentTheme.inputBorder} ${currentTheme.textPrimary} text-sm focus:outline-none focus:ring-2 ${currentTheme.focus} transition-all`}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="9876543210"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg border text-sm font-medium ${currentTheme.secondaryBtn} transition-colors`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 rounded-lg ${currentTheme.primaryBtn} disabled:opacity-50 text-sm text-white font-medium transition-colors`}
            >
              {loading ? 'Adding…' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}