import { tenants } from '@eqence/db';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { auth, type AuthSession } from './auth';
import { db } from './db';
import { env } from './env';
import { mountAccount } from './account';
import { mountCms } from './cms';
import { mountCrm } from './crm';
import { mountPublicApi } from './publicApi';
import { mountRoutes } from './routes';
import { refuseBanned } from './security';

type Vars = { session: AuthSession['session']; user: AuthSession['user'] };

export const app = new Hono<{ Variables: Vars }>();

app.use('*', secureHeaders());
app.use('/api/*', cors({
  origin: (origin) => (env.webOrigins.includes(origin) ? origin : null),
  credentials: true,
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 600,
}));

// Addresses an admin has banned are refused before anything else runs.
app.use('*', refuseBanned);

app.get('/health', async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, db: 'up' });
  } catch {
    return c.json({ ok: false, db: 'down' }, 503);
  }
});

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Key-authenticated and anonymous endpoints, registered ahead of the session check.
mountPublicApi(app);

// Everything under /api/v1 needs a signed-in user.
app.use('/api/v1/*', async (c, next) => {
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s) return c.json({ error: 'not signed in' }, 401);
  if ((s.user as { disabled?: boolean }).disabled) return c.json({ error: 'account disabled' }, 403);
  c.set('session', s.session);
  c.set('user', s.user);
  await next();
});

app.get('/api/v1/me', async (c) => {
  const u = c.get('user');
  const [tenant] = await db.select().from(tenants).where(eq(tenants.ownerUserId, u.id));
  return c.json({
    user: { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, role: u.role, isSuperUser: u.isSuperUser, twoFactorEnabled: !!(u as { twoFactorEnabled?: boolean }).twoFactorEnabled, viewAs: u.isSuperUser ? (u.effectivePlan ?? null) : null },
    tenant: tenant && {
      id: tenant.id, name: tenant.name, plan: tenant.plan, planStatus: tenant.planStatus,
      planCycle: tenant.planCycle, planExpiresAt: tenant.planExpiresAt,
    },
  });
});

mountRoutes(app);
mountAccount(app);
mountCrm(app);
mountCms(app);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error('unhandled', err);
  return c.json({ error: 'internal error' }, 500);
});
