/**
 * Creates the private Supabase Storage bucket (idempotent).
 * Usage: pnpm storage:setup
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "reviewspace-private";

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await supabase.storage.getBucket(bucket);
if (existing) {
  if (existing.public) {
    console.error(`Bucket "${bucket}" exists but is PUBLIC. Make it private in the Supabase dashboard.`);
    process.exit(1);
  }
  console.log(`Bucket "${bucket}" already exists and is private.`);
} else {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (error) {
    console.error(`Could not create bucket: ${error.message}`);
    process.exit(1);
  }
  console.log(`Created private bucket "${bucket}".`);
}
