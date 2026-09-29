// Transactional email through Resend. smarthinkerz.com is the verified sending domain;
// an unverified From address is rejected with 403.
import { env } from './env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(mail: Mail): Promise<{ id: string }> {
  if (!env.resendApiKey) {
    // Never log the body: it can carry reset and verification tokens.
    throw new Error('RESEND_API_KEY is not set; refusing to send mail');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [mail.to],
      reply_to: env.emailReplyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
