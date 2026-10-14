import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  /** Connection pool size. Set to 1 for `prisma dev`, which serves one connection at a time. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  APP_URL: z.url(),
  AUTH_SECRET: z.string().min(32),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("reviewspace-private"),
  /** Defaults to "supabase" when Supabase is configured, otherwise "local". */
  STORAGE_DRIVER: z.enum(["supabase", "local"]).optional(),
  LOCAL_STORAGE_DIR: z.string().min(1).default(".storage"),
  /** "memory" works for a single server; "postgres" fans out via LISTEN/NOTIFY. */
  REALTIME_DRIVER: z.enum(["memory", "postgres"]).default("memory"),
  /** Direct (non-pooled) connection for LISTEN; falls back to DATABASE_URL. */
  REALTIME_DATABASE_URL: z.string().optional().default(""),
  /** Bearer secret for /api/cron/* maintenance endpoints. */
  CRON_SECRET: z.string().optional().default(""),
  AUTH_GOOGLE_ID: z.string().optional().default(""),
  AUTH_GOOGLE_SECRET: z.string().optional().default(""),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().min(1).default("ReviewSpace <onboarding@resend.dev>"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // List only variable names, never values.
  const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid server environment: ${names}`);
}

export const env = parsed.data;
