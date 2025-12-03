import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/auth.api';
import { useAuth } from '../hooks/useAuth';
import { Sun, Moon, Eye, EyeOff } from 'lucide-react'; // Using Eye/EyeOff for better password toggle icon

// --- Theme Utility Component (Relocated and Restyled) ---
const ThemeToggle = ({ theme, toggleTheme }) => {
  const Icon = theme === 'dark' ? Sun : Moon;
  
  // Adjusted for a cleaner, modern look
  const baseClasses = "absolute top-6 right-6 p-2 rounded-full transition-colors duration-300";
  const lightClasses = "text-gray-600 hover:bg-gray-100/70";
  const darkClasses = "text-gray-400 hover:bg-gray-700/70";
  
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${baseClasses} ${theme === 'dark' ? darkClasses : lightClasses} focus:outline-none focus:ring-2 focus:ring-opacity-50 focus:ring-blue-500`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
};

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  const navigate = useNavigate();
  const { login } = useAuth();

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
      const data = await authApi.signup({ fullName, email, password, countryCode, phoneNumber });
      login(data.token, data.user);
      navigate('/workspace/messages', { replace: true });
    } catch (err) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  // --- ENHANCED Tailwind Theme Classes Definition (Same as Login.jsx for consistency) ---
  const themeClasses = {
    light: {
      bg: 'bg-gray-100', 
      cardBg: 'bg-white',
      cardShadow: 'shadow-2xl shadow-gray-200/60',
      textPrimary: 'text-gray-900',
      textSecondary: 'text-gray-500',
      inputBg: 'bg-white',
      inputBorder: 'border-gray-300',
      inputFocus: 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
      button: 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50',
      link: 'text-blue-600 hover:text-blue-700',
      error: 'text-red-700 bg-red-100 border-red-300',
      selectArrow: 'text-gray-500',
    },
    dark: {
      bg: 'bg-gray-900',
      cardBg: 'bg-gray-800',
      cardShadow: 'shadow-2xl shadow-black/40',
      textPrimary: 'text-gray-100',
      textSecondary: 'text-gray-400',
      inputBg: 'bg-gray-900/50', 
      inputBorder: 'border-gray-700',
      inputFocus: 'focus:ring-blue-400 focus:border-blue-400', 
      button: 'bg-blue-500 hover:bg-blue-400 disabled:opacity-50',
      link: 'text-blue-400 hover:text-blue-300',
      error: 'text-red-400 bg-red-900/40 border-red-700',
      selectArrow: 'text-gray-400',
    },
  };

  const currentTheme = themeClasses[theme];
  const PasswordIcon = showPassword ? EyeOff : Eye;

  return (
    <div className={`min-h-screen flex items-center justify-center ${currentTheme.bg} transition-colors duration-500 p-4`}>
      
      <div className={`w-full max-w-md ${currentTheme.cardBg} border-t-4 border-blue-600 rounded-xl p-10 ${currentTheme.cardShadow} transition-all duration-500 relative`}>
        
        {/* Theme Toggle Button - INSIDE the card */}
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
        
        <h1 className={`text-4xl font-extrabold mb-2 ${currentTheme.textPrimary} tracking-tight`}>
          Join VisionDesk
        </h1>
        <p className={`text-base mb-8 ${currentTheme.textSecondary}`}>
          Create your account in seconds.
        </p>

        {error && (
          <div className={`mb-6 text-sm font-medium ${currentTheme.error} rounded-lg px-4 py-3 border`}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Full Name Input */}
          <div>
            <label htmlFor="fullName" className={`block text-sm font-semibold mb-2 ${currentTheme.textPrimary}`}>Full Name</label>
            <input
              id="fullName"
              type="text"
              className={`w-full px-4 py-3 rounded-lg ${currentTheme.inputBg} border ${currentTheme.inputBorder} ${currentTheme.textPrimary} text-base focus:outline-none ${currentTheme.inputFocus} transition-all`}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g., Jane Doe"
              required
            />
          </div>

          {/* Email Input */}
          <div>
            <label htmlFor="email" className={`block text-sm font-semibold mb-2 ${currentTheme.textPrimary}`}>Email</label>
            <input
              id="email"
              type="email"
              className={`w-full px-4 py-3 rounded-lg ${currentTheme.inputBg} border ${currentTheme.inputBorder} ${currentTheme.textPrimary} text-base focus:outline-none ${currentTheme.inputFocus} transition-all`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          {/* Phone Number Input */}
          <div>
            <label htmlFor="phoneNumber" className={`block text-sm font-semibold mb-2 ${currentTheme.textPrimary}`}>Phone Number</label>
            <div className="flex gap-3">
              <div className={`relative w-1/3`}>
                  <select
                      id="countryCode"
                      className={`appearance-none w-full px-3 py-3 rounded-lg ${currentTheme.inputBg} border ${currentTheme.inputBorder} ${currentTheme.textPrimary} text-base focus:outline-none ${currentTheme.inputFocus} transition-all pr-8`}
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                  >
                      <option value="+91">+91 (IN)</option>
                      <option value="+1">+1 (US/CA)</option>
                      <option value="+44">+44 (UK)</option>
                  </select>
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${currentTheme.selectArrow}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </span>
              </div>
              <input
                id="phoneNumber"
                type="tel"
                className={`flex-1 px-4 py-3 rounded-lg ${currentTheme.inputBg} border ${currentTheme.inputBorder} ${currentTheme.textPrimary} text-base focus:outline-none ${currentTheme.inputFocus} transition-all`}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Mobile number"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="password" className={`block text-sm font-semibold mb-2 ${currentTheme.textPrimary}`}>Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={`w-full px-4 py-3 rounded-lg ${currentTheme.inputBg} border ${currentTheme.inputBorder} ${currentTheme.textPrimary} text-base focus:outline-none ${currentTheme.inputFocus} transition-all pr-12`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className={`absolute inset-y-0 right-0 flex items-center px-3 ${currentTheme.textSecondary} hover:${currentTheme.link.split(' ')[0]} transition-colors`}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <PasswordIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-lg ${currentTheme.button} text-white transition-colors text-lg font-bold shadow-lg shadow-blue-500/30 disabled:shadow-none`}
          >
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        {/* Login Link */}
        <p className={`mt-8 text-sm text-center ${currentTheme.textSecondary}`}>
          Already have an account?{' '}
          <Link to="/login" className={`font-semibold ${currentTheme.link} transition-colors`}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}