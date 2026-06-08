import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useI18n } from '../contexts/I18nContext';
import { TrendingUp, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

// Mock data
const mockReviews = [
  { id: 1, platform: 'Google', author: 'Sarah M.', rating: 5, text: 'Excellent product quality and fast shipping!', date: '2026-05-28', sentiment: 'positive' },
  { id: 2, platform: 'Shopify', author: 'James K.', rating: 4, text: 'Good overall experience, packaging could be better.', date: '2026-05-27', sentiment: 'positive' },
  { id: 3, platform: 'Facebook', author: 'Maria L.', rating: 2, text: 'Delivery was delayed by a week. Disappointed.', date: '2026-05-26', sentiment: 'negative' },
  { id: 4, platform: 'Google', author: 'David R.', rating: 5, text: 'Best store I have found for this category. Will buy again!', date: '2026-05-25', sentiment: 'positive' },
  { id: 5, platform: 'Trustpilot', author: 'Emma W.', rating: 3, text: 'Product was okay but not as described in photos.', date: '2026-05-24', sentiment: 'neutral' },
];

const trendData = [
  { month: 'Jan', score: 72 }, { month: 'Feb', score: 74 }, { month: 'Mar', score: 78 },
  { month: 'Apr', score: 76 }, { month: 'May', score: 82 }, { month: 'Jun', score: 85 },
];

export default function Dashboard() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const user = JSON.parse(localStorage.getItem('eqence_user') || '{}');

  useEffect(() => {
    if (!localStorage.getItem('eqence_token')) {
      navigate('/login');
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('eqence_token');
    localStorage.removeItem('eqence_user');
    navigate('/login');
  };

  const stats = [
    { label: t('dashboard.reputation'), value: '85/100', change: '+3.2%', icon: TrendingUp, color: 'bg-orange-50 text-orange-700' },
    { label: t('dashboard.reviews'), value: '1,247', change: '+12%', icon: MessageSquare, color: 'bg-slate-50 text-slate-700' },
    { label: t('dashboard.response'), value: '94%', change: '+5%', icon: CheckCircle2, color: 'bg-green-50 text-green-700' },
    { label: t('dashboard.sentiment'), value: '78%', change: '+2.1%', icon: AlertCircle, color: 'bg-slate-50 text-slate-700' },
  ];

  const maxScore = Math.max(...trendData.map(d => d.score));

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-navy-900 text-white flex-shrink-0 hidden lg:flex flex-col">
        <div className="p-6 border-b border-white/10">
          <Link href="/" className="text-2xl font-bold text-white">Eqence</Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {[
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'reviews', label: 'Reviews', icon: '💬' },
            { id: 'responses', label: 'Responses', icon: '✓' },
            { id: 'analytics', label: 'Analytics', icon: '📈' },
            { id: 'settings', label: 'Settings', icon: '⚙️' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors duration-150
                ${activeTab === item.id ? 'bg-orange-500/20 text-white font-medium border-l-2 border-orange-500' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-sm font-bold">
              {user.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="text-sm">
              <div className="font-medium text-white">{user.name || 'User'}</div>
              <div className="text-white/50 text-xs">{user.email || ''}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full text-left text-sm text-white/60 hover:text-white transition-colors px-2">
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-slate-50">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-xl font-bold text-navy-900">{t('dashboard.title')}</h1>
            <p className="text-sm text-slate-500">Welcome back, {user.name || 'User'}</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors active-press">
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 bg-orange-600 rounded-full"></span>
            </button>
          </div>
        </header>

        <div className={`p-${density === 'compact' ? '4' : '6'}`}>
          {/* Density toggle + Stats grid */}
          <div className="flex items-center justify-between mb-6">
            <div></div>
            <Select value={density} onValueChange={(v: any) => setDensity(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                      {stat.change}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-navy-900 tabular-nums">{stat.value}</div>
                  <div className="text-sm text-slate-600 mt-1">{stat.label}</div>
                </div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Trend chart */}
            <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-navy-900 mb-4">Reputation Trend</h3>
              <div className="flex items-end gap-3 h-48">
                {trendData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-slate-600 tabular-nums">{d.score}</span>
                    <div
                      className="w-full rounded-t-lg bg-orange-600 transition-all duration-300"
                      style={{ height: `${(d.score / maxScore) * 100}%` }}
                    />
                    <span className="text-xs text-slate-400">{d.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-navy-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                {[
                  { label: 'Respond to Reviews', icon: '💬', desc: '3 pending' },
                  { label: 'View Analytics', icon: '📊', desc: 'Updated today' },
                  { label: 'Configure AI', icon: '🤖', desc: 'Auto-response' },
                  { label: 'Export Report', icon: '📄', desc: 'PDF/CSV' },
                ].map((action, i) => (
                  <button key={i} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors text-left active-press">
                    <span className="text-xl">{action.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-navy-900">{action.label}</div>
                      <div className="text-xs text-slate-500">{action.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Recent reviews */}
          <div className="mt-6 bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-navy-900">Recent Reviews</h3>
              <button className="text-sm text-orange-600 font-medium hover:text-orange-700 transition-colors">View All →</button>
            </div>
            <div className="space-y-4">
              {mockReviews.map(review => (
                <div key={review.id} className={`flex items-start gap-4 p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors ${density === 'compact' ? 'py-3' : ''}`}>
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0">
                    {review.author[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-navy-900 text-sm">{review.author}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{review.platform}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        review.sentiment === 'positive' ? 'bg-green-50 text-green-700' :
                        review.sentiment === 'negative' ? 'bg-red-50 text-red-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                          review.sentiment === 'positive' ? 'bg-green-600' :
                          review.sentiment === 'negative' ? 'bg-red-600' :
                          'bg-slate-400'
                        }`}></span>
                        {review.sentiment}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <svg key={i} className={`w-3.5 h-3.5 ${i < review.rating ? 'text-orange-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <p className="text-sm text-slate-600 truncate">{review.text}</p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">{review.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
