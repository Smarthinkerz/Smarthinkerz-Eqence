import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AppShell from './AppShell';

interface Voice { tone: string; bannedPhrases: string[]; signature: string | null; dialectNotes: string | null; version: number }

const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#C41E3A] outline-none text-sm';

export default function BrandVoice() {
  return <AppShell>{() => <Body />}</AppShell>;
}

function Body() {
  const [tone, setTone] = useState('warm, concise, professional');
  const [banned, setBanned] = useState('');
  const [signature, setSignature] = useState('');
  const [dialect, setDialect] = useState('');
  const [version, setVersion] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ brandVoice: Voice | null }>('/api/v1/brand-voice').then(({ brandVoice: v }) => {
      if (!v) return;
      setTone(v.tone); setBanned(v.bannedPhrases.join('\n')); setSignature(v.signature ?? ''); setDialect(v.dialectNotes ?? ''); setVersion(v.version);
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { brandVoice } = await api<{ brandVoice: Voice }>('/api/v1/brand-voice', {
      method: 'PUT', body: { tone, bannedPhrases: banned.split('\n'), signature, dialectNotes: dialect },
    });
    setVersion(brandVoice.version); setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 max-w-2xl">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Brand voice</h1>
        <p className="text-sm text-gray-600">How AI drafts sound. Every draft still waits for your approval.{version ? ` Version ${version}.` : ''}</p>
      </div>
      <label className="block text-sm"><span className="font-medium text-gray-700">Tone</span>
        <input className={inputClass} value={tone} onChange={(e) => setTone(e.target.value)} maxLength={200} /></label>
      <label className="block text-sm"><span className="font-medium text-gray-700">Arabic style notes</span>
        <input className={inputClass} placeholder="e.g. Gulf Arabic, friendly, avoid very formal MSA" value={dialect} onChange={(e) => setDialect(e.target.value)} maxLength={300} /></label>
      <label className="block text-sm"><span className="font-medium text-gray-700">Never say (one phrase per line)</span>
        <textarea className={inputClass} rows={4} value={banned} onChange={(e) => setBanned(e.target.value)} /></label>
      <label className="block text-sm"><span className="font-medium text-gray-700">Signature</span>
        <input className={inputClass} placeholder="e.g. The Example Store team" value={signature} onChange={(e) => setSignature(e.target.value)} maxLength={200} /></label>
      <div className="flex items-center gap-3">
        <button className="btn-primary text-sm px-4 py-2">Save</button>
        {saved && <span role="status" className="text-sm text-green-700">Saved</span>}
      </div>
    </form>
  );
}
