// Configuration comes from the environment only (systemd EnvironmentFile on the ECS).
// Missing required values stop the process at boot with the variable's name, never its value.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required environment variable ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export const env = {
  port: Number(optional('PORT', '4410')),
  host: optional('HOST', '127.0.0.1'),
  databaseUrl: required('DATABASE_URL'),
  authSecret: required('BETTER_AUTH_SECRET'),
  // Public base URL of this API, e.g. https://api.eqence.com
  publicUrl: optional('PUBLIC_URL', 'https://api.eqence.com'),
  // Browser origins allowed to call the API with credentials.
  webOrigins: optional('WEB_ORIGINS', 'https://eqence.com,https://www.eqence.com')
    .split(',').map((s) => s.trim()).filter(Boolean),
  // Where links in emails send people (the web app).
  webUrl: optional('WEB_URL', 'https://www.eqence.com'),
  // Cookie domain shared by eqence.com and api.eqence.com. Empty = host-only (local dev).
  cookieDomain: optional('COOKIE_DOMAIN', '.eqence.com'),
  resendApiKey: optional('RESEND_API_KEY'),
  emailFrom: optional('EMAIL_FROM', 'Eqence <noreply@smarthinkerz.com>'),
  emailReplyTo: optional('EMAIL_REPLY_TO', 'reply@smarthinkerz.com'),
  // File storage target: 'disk' (ECS, served by nginx) or 'r2' once credentials exist.
  fileStore: optional('FILE_STORE', 'disk'),
  fileDir: optional('FILE_DIR', '/var/lib/eqence/files'),
};
