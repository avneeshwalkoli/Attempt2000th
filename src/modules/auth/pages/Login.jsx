import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { authApi } from '../services/auth.api';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login({ countryCode, phoneNumber, password });
      login(data.token, data.user);
      const redirectTo = location.state?.from?.pathname || '/workspace/messages';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-50">
      <div className="w-full max-w-md bg-slate-800/80 border border-slate-700 rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-semibold mb-2 text-center">Sign in to VisionDesk</h1>
        <p className="text-slate-400 text-sm mb-6 text-center">Use your phone number to continue.</p>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Phone Number</label>
            <div className="flex gap-2">
              <select
                className="w-24 px-2 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              >
                <option value="+91">+91</option>
                <option value="+1">+1</option>
                <option value="+44">+44</option>
              </select>
              <input
                type="tel"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="9876543210"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 px-3 text-xs text-slate-400 hover:text-slate-200"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {loading ? 'Signing in…' : 'Continue'}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-400 text-center">
          New to VisionDesk?{' '}
          <Link to="/signup" className="text-indigo-400 hover:text-indigo-300">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
