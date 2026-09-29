import { account, auditLog, session, tenants, user, verification } from '@eqence/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { env } from './env';
import { isLegacyHash, verifyLegacyPassword } from './legacyPassword';
import { escapeHtml, sendMail } from './mail';

function actionEmail(heading: string, intro: string, url: string, button: string) {
  const text = `${heading}\n\n${intro}\n\n${url}\n\nIf you did not ask for this, ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px">
<h2 style="color:#C41E3A">${escapeHtml(heading)}</h2>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#C41E3A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">${escapeHtml(button)}</a></p>
<p style="color:#666;font-size:13px">If you did not ask for this, ignore this email.</p></div>`;
  return { text, html };
}

export const auth = betterAuth({
  baseURL: env.publicUrl,
  basePath: '/api/auth',
  secret: env.authSecret,
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  trustedOrigins: env.webOrigins,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    password: {
      hash: hashPassword,
      // Migrated C2C accounts keep their passwords; see legacyPassword.ts.
      verify: ({ hash, password }) =>
        isLegacyHash(hash) ? verifyLegacyPassword(password, hash) : verifyPassword({ hash, password }),
    },
    sendResetPassword: async ({ user: u, url }) => {
      const m = actionEmail('Reset your Eqence password', 'Use this link to choose a new password. It expires in one hour.', url, 'Reset password');
      await sendMail({ to: u.email, subject: 'Reset your Eqence password', ...m });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user: u, url }) => {
      const m = actionEmail('Confirm your email', 'Confirm this address to finish creating your Eqence account.', url, 'Confirm email');
      await sendMail({ to: u.email, subject: 'Confirm your Eqence email', ...m });
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', input: false, defaultValue: 'user' },
      isSuperUser: { type: 'boolean', input: false, defaultValue: false },
      effectivePlan: { type: 'string', input: false, required: false },
      legacyC2cId: { type: 'number', input: false, required: false },
    },
  },
  advanced: {
    useSecureCookies: env.publicUrl.startsWith('https://'),
    crossSubDomainCookies: env.cookieDomain
      ? { enabled: true, domain: env.cookieDomain }
      : { enabled: false },
    // nginx sets X-Real-IP from the connecting address; never trust a client-sent chain.
    ipAddress: { ipAddressHeaders: ['x-real-ip'] },
  },
  databaseHooks: {
    user: {
      create: {
        // Every account owns exactly one tenant (workspace) from the moment it exists.
        after: async (u) => {
          await db.insert(tenants).values({ name: u.name || u.email, ownerUserId: u.id }).onConflictDoNothing();
        },
      },
    },
  },
  hooks: {
    // After a successful password sign-in on a migrated account, replace the C2C hash
    // with a Better Auth hash of the same password, so the legacy path retires itself.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return;
      const signedIn = ctx.context.newSession?.user;
      const password = (ctx.body as { password?: unknown } | undefined)?.password;
      if (!signedIn || typeof password !== 'string') return;
      const [cred] = await db.select({ id: account.id, password: account.password }).from(account)
        .where(and(eq(account.userId, signedIn.id), eq(account.providerId, 'credential')));
      if (!cred?.password || !isLegacyHash(cred.password)) return;
      await db.update(account).set({ password: await hashPassword(password), updatedAt: new Date() })
        .where(eq(account.id, cred.id));
      await db.insert(auditLog).values({ actorUserId: signedIn.id, action: 'auth.legacy_hash_upgraded' });
    }),
  },
});

export type AuthSession = typeof auth.$Infer.Session;
