//import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://s1ng:s1ng@localhost:5432/s1ng',
  },
  strict: true,
} satisfies Config;
