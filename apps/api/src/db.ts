import { createDb } from '@eqence/db';
import { env } from './env';

export const { db, pool } = createDb(env.databaseUrl);
