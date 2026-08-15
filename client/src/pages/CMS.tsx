import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

type Tab = 'frontpage' | 'app' | 'analytics' | 'users' | 'settings';
type PreviewMode = 'desktop' | 'tablet' | 'mobile';

// Section types for frontpage editor
interface HeroSection {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  backgroundImage: string;
}

interface FeatureItem {
  title: string;
  description: string;
  icon: string;
}

interface PricingTier {
  name: string;
  price: number;
  features: string[];
}

interface TestimonialItem {
  name: string;
  role: string;
  text: string;
  rating: number;
}

export default function CMS() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('frontpage');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Settings state
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('eqence_cms_settings');
    return saved ? JSON.parse(saved) : {
      openaiApiKey: '',
      resendApiKey: '',
      tapApiKey: '',
      shopifyApiKey: '',
      customKeys: [] as { name: string; value: string }[],
      adminEmail: 'fathi.alriyami@smarthinkerz.com',
      adminPassword: 'TOMOKOnote76$',
    };
  });

  // Frontpage content state
  const [heroContent, setHeroContent] = useState<HeroSection>(() => {
    const saved = localStorage.getItem('eqence_cms_hero');
    return saved ? JSON.parse(saved) : {
      title: 'Protect & Grow Your Shopify Store Reputation',
      subtitle: 'AI-powered reputation management that monitors, analyzes, and responds to customer reviews across all platforms — automatically.',
      ctaText: 'Start Free Trial',
      ctaLink: '/register',
      backgroundImage: '',
    };
  });

  const [features, setFeatures] = useState<FeatureItem[]>(() => {
    const saved = localStorage.getItem('eqence_cms_features');
    return saved ? JSON.parse(saved) : [
      { title: 'Review Monitoring', description: 'Track reviews across Google, Shopify, Facebook, and 50+ platforms in real-time.', icon: '🔍' },
      { title: 'Sentiment Analysis', description: 'AI-powered sentiment detection identifies trends and flags critical reviews instantly.', icon: '🧠' },
      { title: 'Auto-Response Engine', description: 'Generate personalized, brand-aligned responses to reviews automatically using AI.', icon: '🤖' },
      { title: 'Advanced Analytics', description: 'Track reputation score trends, response rates, and customer satisfaction over time.', icon: '📊' },
      { title: 'Smart Notifications', description: 'Get instant alerts for negative reviews, rating drops, and competitor activity.', icon: '🔔' },
      { title: 'Shopify Integration', description: 'One-click Shopify app installation with automatic review sync and order matching.', icon: '🛒' },
    ];
  });

  // Check admin auth
  useEffect(() => {
    if (!localStorage.getItem('eqence_admin_token')) {
      navigate('/admin');
    }
  }, []);

  // Save settings
  const saveSettings = () => {
    localStorage.setItem('eqence_cms_settings', JSON.stringify(settings));
    alert('Settings saved successfully!');
  };

  // Save frontpage content
  const saveFrontpageContent = () => {
    localStorage.setItem('eqence_cms_hero', JSON.stringify(heroContent));
    localStorage.setItem('eqence_cms_features', JSON.stringify(features));
    refreshPreview();
    alert('Frontpage content saved!');
  };

  // Refresh preview iframe
  const refreshPreview = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      callback(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleLogout = () => {
    localStorage.removeItem('eqence_admin_token');
    navigate('/admin');
  };

  const previewWidth = previewMode === 'desktop' ? '100%' : previewMode === 'tablet' ? '768px' : '375px';

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'frontpage', label: 'Frontpage Editor', icon: '🏠' },
    { id: 'app', label: 'App Editor', icon: '📱' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* CMS Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-gray-100">
          <h1 className="text-xl font-bold text-[#C41E3A]">Eqence CMS</h1>
          <p className="text-xs text-gray-400 mt-1">Content Management</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150
                ${activeTab === tab.id ? 'bg-red-50 text-[#C41E3A] font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        {/* Frontpage Editor Tab */}
        {activeTab === 'frontpage' && (
          <div className="flex h-screen">
            {/* Editor panel */}
            <div className="w-96 bg-white border-r border-gray-200 overflow-y-auto p-5 flex-shrink-0">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-gray-900">Frontpage Editor</h2>
                <button onClick={saveFrontpageContent} className="btn-primary text-sm px-4 py-2">
                  Save
                </button>
              </div>

              {/* Hero Section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Hero Section</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                    <textarea
                      value={heroContent.title}
                      onChange={(e) => setHeroContent({ ...heroContent, title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#C41E3A] focus:ring-1 focus:ring-[#C41E3A]/20 outline-none resize-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Subtitle</label>
                    <textarea
                      value={heroContent.subtitle}
                      onChange={(e) => setHeroContent({ ...heroContent, subtitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#C41E3A] focus:ring-1 focus:ring-[#C41E3A]/20 outline-none resize-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">CTA Button Text</label>
                    <input
                      type="text"
                      value={heroContent.ctaText}
                      onChange={(e) => setHeroContent({ ...heroContent, ctaText: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#C41E3A] focus:ring-1 focus:ring-[#C41E3A]/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Background Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, (url) => setHeroContent({ ...heroContent, backgroundImage: url }))}
                      className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-red-50 file:text-[#C41E3A] hover:file:bg-red-100"
                    />
                  </div>
                </div>
              </div>

              {/* Features Section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Features</h3>
                <div className="space-y-3">
                  {features.map((feature, i) => (
                    <div key={i} className="p-3 rounded-lg border border-gray-100 bg-gray-50">
                      <input
                        type="text"
                        value={feature.title}
                        onChange={(e) => {
                          const updated = [...features];
                          updated[i] = { ...updated[i], title: e.target.value };
                          setFeatures(updated);
                        }}
                        className="w-full px-2 py-1 rounded border border-gray-200 text-sm mb-2 focus:border-[#C41E3A] outline-none"
                        placeholder="Feature title"
                      />
                      <textarea
                        value={feature.description}
                        onChange={(e) => {
                          const updated = [...features];
                          updated[i] = { ...updated[i], description: e.target.value };
                          setFeatures(updated);
                        }}
                        className="w-full px-2 py-1 rounded border border-gray-200 text-xs resize-none focus:border-[#C41E3A] outline-none"
                        rows={2}
                        placeholder="Feature description"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="flex-1 flex flex-col bg-gray-200">
              <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Live Preview</span>
                <div className="flex items-center gap-1">
                  {(['desktop', 'tablet', 'mobile'] as PreviewMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setPreviewMode(mode)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        previewMode === mode ? 'bg-[#C41E3A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {mode === 'desktop' ? '🖥️' : mode === 'tablet' ? '📱' : '📲'} {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex items-start justify-center p-4 overflow-auto">
                <iframe
                  ref={iframeRef}
                  src="/"
                  className="bg-white shadow-lg rounded-lg border border-gray-300 h-full"
                  style={{ width: previewWidth, maxWidth: '100%' }}
                  title="Live Preview"
                />
              </div>
            </div>
          </div>
        )}

        {/* App Editor Tab */}
        {activeTab === 'app' && (
          <div className="flex h-screen">
            <div className="w-96 bg-white border-r border-gray-200 overflow-y-auto p-5 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 mb-5">App Editor</h2>
              <p className="text-sm text-gray-500 mb-4">Edit the merchant dashboard content and layout.</p>
              
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Dashboard Title</h4>
                  <input type="text" defaultValue="Dashboard" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#C41E3A] outline-none" />
                </div>
                <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Welcome Message</h4>
                  <input type="text" defaultValue="Welcome back" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#C41E3A] outline-none" />
                </div>
                <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Sidebar Color</h4>
                  <input type="color" defaultValue="#1a1f3a" className="w-full h-10 rounded cursor-pointer" />
                </div>
                <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Logo Upload</h4>
                  <input type="file" accept="image/*" className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-red-50 file:text-[#C41E3A]" />
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col bg-gray-200">
              <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">App Preview</span>
                <div className="flex items-center gap-1">
                  {(['desktop', 'tablet', 'mobile'] as PreviewMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setPreviewMode(mode)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        previewMode === mode ? 'bg-[#C41E3A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {mode === 'desktop' ? '🖥️' : mode === 'tablet' ? '📱' : '📲'} {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex items-start justify-center p-4 overflow-auto">
                <iframe
                  src="/dashboard"
                  className="bg-white shadow-lg rounded-lg border border-gray-300 h-full"
                  style={{ width: previewWidth, maxWidth: '100%' }}
                  title="App Preview"
                />
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Platform Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {[
                { label: 'Total Users', value: '2,847', change: '+12%' },
                { label: 'Active Subscriptions', value: '1,203', change: '+8%' },
                { label: 'Monthly Revenue', value: '$45,670', change: '+15%' },
              ].map((stat, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-6">
                  <div className="text-sm text-gray-500 mb-1">{stat.label}</div>
                  <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-sm text-green-600 mt-1">{stat.change} from last month</div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
              <div className="h-64 flex items-end gap-2">
                {[32, 45, 38, 52, 48, 65, 58, 72, 68, 78, 85, 92].map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-[#C41E3A] to-[#e85d73]"
                      style={{ height: `${val}%` }}
                    />
                    <span className="text-[10px] text-gray-400">
                      {['J','F','M','A','M','J','J','A','S','O','N','D'][i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">User Management</h2>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Plan</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Joined</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    { name: 'Sarah Johnson', email: 'sarah@store.com', plan: 'Premium', status: 'Active', date: '2026-03-15' },
                    { name: 'Mike Chen', email: 'mike@shop.com', plan: 'Basic', status: 'Active', date: '2026-04-02' },
                    { name: 'Emma Wilson', email: 'emma@boutique.com', plan: 'Starter', status: 'Trial', date: '2026-05-10' },
                    { name: 'David Kim', email: 'david@electronics.com', plan: 'Advance', status: 'Active', date: '2026-02-28' },
                    { name: 'Lisa Park', email: 'lisa@fashion.com', plan: 'Free', status: 'Inactive', date: '2026-01-20' },
                  ].map((user, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">
                            {user.name[0]}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                            <div className="text-xs text-gray-400">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{user.plan}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          user.status === 'Active' ? 'bg-green-50 text-green-700' :
                          user.status === 'Trial' ? 'bg-blue-50 text-blue-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{user.status}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{user.date}</td>
                      <td className="px-6 py-4">
                        <button className="text-xs text-[#C41E3A] hover:underline font-medium">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="p-8 max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>

            {/* API Keys */}
            <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">API Keys</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
                  <input
                    type="password"
                    value={settings.openaiApiKey}
                    onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A] focus:ring-2 focus:ring-[#C41E3A]/20 outline-none text-sm font-mono"
                    placeholder="sk-..."
                  />
                  <p className="text-xs text-gray-400 mt-1">Used for AI auto-responses and sentiment analysis</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Resend API Key</label>
                  <input
                    type="password"
                    value={settings.resendApiKey}
                    onChange={(e) => setSettings({ ...settings, resendApiKey: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A] focus:ring-2 focus:ring-[#C41E3A]/20 outline-none text-sm font-mono"
                    placeholder="re_..."
                  />
                  <p className="text-xs text-gray-400 mt-1">Used for transactional emails (password reset, notifications)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tap Payments API Key</label>
                  <input
                    type="password"
                    value={settings.tapApiKey}
                    onChange={(e) => setSettings({ ...settings, tapApiKey: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A] focus:ring-2 focus:ring-[#C41E3A]/20 outline-none text-sm font-mono"
                    placeholder="sk_live_..."
                  />
                  <p className="text-xs text-gray-400 mt-1">Used for subscription billing</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shopify API Key</label>
                  <input
                    type="password"
                    value={settings.shopifyApiKey}
                    onChange={(e) => setSettings({ ...settings, shopifyApiKey: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A] focus:ring-2 focus:ring-[#C41E3A]/20 outline-none text-sm font-mono"
                    placeholder="shpat_..."
                  />
                  <p className="text-xs text-gray-400 mt-1">Used for Shopify store integration</p>
                </div>

                {/* Custom Keys */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-700">Custom API Keys</label>
                    <button
                      onClick={() => setSettings({ ...settings, customKeys: [...settings.customKeys, { name: '', value: '' }] })}
                      className="text-xs text-[#C41E3A] font-medium hover:underline"
                    >
                      + Add Key
                    </button>
                  </div>
                  {settings.customKeys.map((key: { name: string; value: string }, i: number) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={key.name}
                        onChange={(e) => {
                          const updated = [...settings.customKeys];
                          updated[i] = { ...updated[i], name: e.target.value };
                          setSettings({ ...settings, customKeys: updated });
                        }}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#C41E3A] outline-none"
                        placeholder="Key name"
                      />
                      <input
                        type="password"
                        value={key.value}
                        onChange={(e) => {
                          const updated = [...settings.customKeys];
                          updated[i] = { ...updated[i], value: e.target.value };
                          setSettings({ ...settings, customKeys: updated });
                        }}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#C41E3A] outline-none font-mono"
                        placeholder="Key value"
                      />
                      <button
                        onClick={() => {
                          const updated = settings.customKeys.filter((_: any, idx: number) => idx !== i);
                          setSettings({ ...settings, customKeys: updated });
                        }}
                        className="px-2 text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Admin Credentials */}
            <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Admin Credentials</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                  <input
                    type="email"
                    value={settings.adminEmail}
                    onChange={(e) => setSettings({ ...settings, adminEmail: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A] focus:ring-2 focus:ring-[#C41E3A]/20 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
                  <input
                    type="password"
                    value={settings.adminPassword}
                    onChange={(e) => setSettings({ ...settings, adminPassword: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A] focus:ring-2 focus:ring-[#C41E3A]/20 outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            {/* File Uploads */}
            <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Brand Assets</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo Upload</label>
                  <input type="file" accept="image/*" className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-medium file:bg-red-50 file:text-[#C41E3A] hover:file:bg-red-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Favicon Upload</label>
                  <input type="file" accept="image/*" className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-medium file:bg-red-50 file:text-[#C41E3A] hover:file:bg-red-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Video Upload (Hero/Promo)</label>
                  <input type="file" accept="video/*" className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-medium file:bg-red-50 file:text-[#C41E3A] hover:file:bg-red-100" />
                </div>
              </div>
            </div>

            <button onClick={saveSettings} className="btn-primary">
              Save All Settings
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
