// Trainee referral pass-through. A visitor arriving with ?ref=<code> keeps that code in a
// first-party cookie for 90 days; it is forwarded as ref=<code> on every Hub checkout URL.
const COOKIE = 'eq_ref';
const REF_RE = /^[A-Za-z0-9_-]{3,32}$/;

export function captureRef(search = window.location.search) {
  const code = new URLSearchParams(search).get('ref');
  if (code && REF_RE.test(code)) {
    const domain = window.location.hostname.endsWith('eqence.com') ? '; Domain=.eqence.com' : '';
    document.cookie = `${COOKIE}=${code}; Max-Age=${90 * 86400}; Path=/; SameSite=Lax; Secure${domain}`;
  }
}

export function storedRef(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  return m && REF_RE.test(m[1]) ? m[1] : null;
}
