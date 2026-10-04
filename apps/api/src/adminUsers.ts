// Admin user management: list and search accounts, change role, disable / re-enable.
// Sits behind the same requireAdmin guard as the CMS (session + admin role + 2FA + our origin).
// Rules: nobody changes their own account here; only a super user changes a super user;
// super-user status itself is never granted or removed through the API.
import { auditLog, session, tenants, user } from '@eqence/db';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { db } from './db';

type U = { id: string; isSuperUser?: boolean };
const me = (c: Context) => c.get('user') as U;

export function mountAdminUsers(app: Hono<any>) {
  app.get('/api/v1/admin/users', async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 100);
    const page = Math.max(1, Math.min(1000, Number(c.req.query('page')) || 1));
    const where = q ? or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`)) : undefined;
    const rows = await db.select({
      id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, role: user.role,
      isSuperUser: user.isSuperUser, twoFactorEnabled: user.twoFactorEnabled, disabled: user.disabled,
      migratedFromC2c: sql<boolean>`${user.legacyC2cId} is not null`, createdAt: user.createdAt,
      plan: tenants.plan, planStatus: tenants.planStatus, planExpiresAt: tenants.planExpiresAt,
    }).from(user).leftJoin(tenants, eq(tenants.ownerUserId, user.id))
      .where(where).orderBy(desc(user.createdAt)).limit(50).offset((page - 1) * 50);
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(user).where(where);
    return c.json({ users: rows, total, page });
  });

  // { role?: 'admin' | 'user', disabled?: boolean }
  app.patch('/api/v1/admin/users/:id', async (c) => {
    const id = c.req.param('id');
    const actor = me(c);
    if (id === actor.id) return c.json({ error: 'you cannot change your own account here' }, 400);
    const b = await c.req.json().catch(() => ({})) as { role?: unknown; disabled?: unknown };
    const set: { role?: string; disabled?: boolean } = {};
    if ('role' in b) {
      if (b.role !== 'admin' && b.role !== 'user') return c.json({ error: 'role must be admin or user' }, 400);
      set.role = b.role;
    }
    if ('disabled' in b) {
      if (typeof b.disabled !== 'boolean') return c.json({ error: 'disabled must be true or false' }, 400);
      set.disabled = b.disabled;
    }
    if (!Object.keys(set).length) return c.json({ error: 'nothing to change' }, 400);
    const [target] = await db.select({ id: user.id, isSuperUser: user.isSuperUser }).from(user).where(eq(user.id, id));
    if (!target) return c.json({ error: 'not found' }, 404);
    if (target.isSuperUser && !actor.isSuperUser) return c.json({ error: 'only a super user can change a super user' }, 403);

    await db.transaction(async (tx) => {
      await tx.update(user).set({ ...set, updatedAt: new Date() }).where(eq(user.id, id));
      // Disabling signs the account out everywhere at once.
      if (set.disabled) await tx.delete(session).where(eq(session.userId, id));
      await tx.insert(auditLog).values({ actorUserId: actor.id, action: 'admin.user_updated', target: id, detail: set });
    });
    const [u] = await db.select({ id: user.id, role: user.role, disabled: user.disabled }).from(user).where(eq(user.id, id));
    return c.json({ user: u });
  });

  // Who changed what, for the user detail view.
  app.get('/api/v1/admin/users/:id/audit', async (c) => {
    const rows = await db.select({ action: auditLog.action, actorUserId: auditLog.actorUserId, detail: auditLog.detail, createdAt: auditLog.createdAt })
      .from(auditLog).where(and(eq(auditLog.target, c.req.param('id')), sql`${auditLog.action} like 'admin.%'`))
      .orderBy(desc(auditLog.createdAt)).limit(50);
    return c.json({ entries: rows });
  });
}
