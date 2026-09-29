// Applies packages/db/migrations to DATABASE_URL. Idempotent: drizzle records applied
// migrations in drizzle.__drizzle_migrations. Usage: node dist/migrate.mjs <migrations dir>
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('missing required environment variable DATABASE_URL');
const folder = process.argv[2];
if (!folder) throw new Error('usage: migrate <migrations folder>');

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: folder });
  const { rows } = await pool.query('select count(*)::int as n from drizzle.__drizzle_migrations');
  console.log(`migrations applied; ${rows[0].n} recorded`);
} finally {
  await pool.end();
}
