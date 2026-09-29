// Vercel function: records a waitlist request by emailing it to the team through Resend.
// Eqence has no database; this email is the record until the merge with Comment to Customer.

const TO = 'reply@smarthinkerz.com';
// smarthinkerz.com is the verified sending domain on the Resend account; an unverified From is a 403.
const FROM = 'Eqence Waitlist <noreply@smarthinkerz.com>';
const PLANS = new Set(['', 'starter', 'basic', 'advance', 'premium', 'enterprise']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORE_RE = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

function field(body: any, key: string, max: number): string {
  const value = typeof body?.[key] === 'string' ? body[key].trim() : '';
  return value.length <= max ? value : '';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  // Bots fill the hidden field; accept silently so they learn nothing.
  if (field(body, 'website', 200)) return res.status(200).json({ ok: true });

  const name = field(body, 'name', 100);
  const business = field(body, 'business', 150);
  const email = field(body, 'email', 254);
  const store = field(body, 'store', 200);
  const plan = field(body, 'plan', 20);
  if (!name || !business || !EMAIL_RE.test(email) || !STORE_RE.test(store) || !PLANS.has(plan)) {
    return res.status(400).json({ error: 'Please fill in every field with valid details.' });
  }

  const apiKey = process.env.RESEND_API;
  if (!apiKey) {
    console.error('waitlist: RESEND_API is not set');
    return res.status(500).json({ error: 'Waitlist is unavailable.' });
  }

  const rows: [string, string][] = [
    ['Name', name],
    ['Business', business],
    ['Email', email],
    ['Shopify store', store],
    ['Planned plan of interest', plan || 'Not sure yet'],
    ['Submitted', new Date().toISOString()],
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html = `<h2>New Eqence waitlist request</h2><table>${rows
    .map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`)
    .join('')}</table>`;

  const resend = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: email,
      subject: `Eqence waitlist: ${business.replace(/[\r\n]+/g, ' ')}`,
      text,
      html,
    }),
  });

  if (!resend.ok) {
    console.error('waitlist: Resend returned', resend.status, await resend.text());
    return res.status(502).json({ error: 'Could not record your request.' });
  }
  const sent = await resend.json();
  console.log('waitlist: recorded, resend id', sent?.id);
  return res.status(200).json({ ok: true });
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
