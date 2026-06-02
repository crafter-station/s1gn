import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://s1ng:s1ng@localhost:5432/s1ng';

const globalForDb = globalThis as unknown as {
  __s1ngSql?: ReturnType<typeof postgres>;
};

const sql = globalForDb.__s1ngSql ?? postgres(connectionString, { max: 5 });
if (process.env.NODE_ENV !== 'production') globalForDb.__s1ngSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
