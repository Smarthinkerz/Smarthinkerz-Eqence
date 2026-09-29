import { serve } from '@hono/node-server';
import { app } from './app';
import { pool } from './db';
import { env } from './env';

const server = serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
  console.log(`eqence-api listening on ${info.address}:${info.port}`);
});

function shutdown(signal: string) {
  console.log(`${signal}: shutting down`);
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
