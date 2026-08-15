import { useState } from 'react';
import { Link, useLocation } from 'wouter';

const DEFAULT_ADMIN_EMAIL = 'fathi.alriyami@smarthinkerz.com';
const DEFAULT_ADMIN_PASSWORD = 'TOMOKOnote76$';

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await new Promise(r => setTimeout(r, 500));

      // Check against stored admin credentials or defaults
      const cmsSettings = JSON.parse(localStorage.getItem('eqence_cms_settings') || '{}');
      const adminEmail = cmsSettings.adminEmail || DEFAULT_ADMIN_EMAIL;
      const adminPassword = cmsSettings.adminPassword || DEFAULT_ADMIN_PASSWORD;

      if (email === adminEmail && password === adminPassword) {
        localStorage.setItem('eqence_admin_token', 'admin_' + Date.now());
        navigate('/cms');
      } else {
        setError('Invalid admin credentials');
      }
    } catch {
      setError('Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-navy p-6">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <Link href="/" className="text-[#C41E3A] font-bold text-2xl">Eqence</Link>
            <p className="text-gray-500 text-sm mt-2">Admin Control Panel</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#C41E3A] 
                           focus:ring-2 focus:ring-[#C41E3A]/20 outline-none transition-all duration-150"
                placeholder="fathi.alriyami@smarthinkerz.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#C41E3A] 
                           focus:ring-2 focus:ring-[#C41E3A]/20 outline-none transition-all duration-150"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Authenticating...' : 'Access Admin Panel'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Authorized personnel only. All access is logged.
          </p>
        </div>
      </div>
    </div>
  );
}
