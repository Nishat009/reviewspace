import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { signPayload } from "@/lib/signed-token";

/**
 * Private object storage. The bucket is never public: the browser only ever
 * receives short-lived signed URLs, issued after a permission check.
 *
 * Two drivers share one interface:
 * - `supabase`: Supabase Storage with the service-role key (production).
 * - `local`: files under LOCAL_STORAGE_DIR, served by /api/storage/* with
 *   HMAC-signed, expiring URLs. For development without a Supabase project.
 */
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_DIMENSION = 16_000; // px per side
export const SIGNED_URL_TTL_SECONDS = 10 * 60;
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export const EXTENSION_FOR_TYPE: Record<AllowedImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function isAllowedImageType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

/** Object keys are prefixed by workspace, so one prefix maps to one tenant. */
export function versionObjectPath(input: {
  workspaceId: string;
  projectId: string;
  assetId: string;
  versionId: string;
  ext: string;
}) {
  return `${input.workspaceId}/${input.projectId}/${input.assetId}/${input.versionId}/original.${input.ext}`;
}

export function thumbnailPathFor(originalPath: string) {
  return originalPath.replace(/\/original\.[a-z]+$/, "/thumb.webp");
}

export type UploadTarget = { url: string; method: "PUT"; headers: Record<string, string> };

interface StorageDriver {
  createUploadTarget(objectPath: string, contentType: string, maxBytes: number): Promise<UploadTarget>;
  signedReadUrl(objectPath: string, expiresIn: number): Promise<string>;
  download(objectPath: string): Promise<Buffer | null>;
  upload(objectPath: string, body: Buffer, contentType: string): Promise<void>;
  remove(objectPaths: string[]): Promise<void>;
}

// ─── Supabase ────────────────────────────────────────────────────────────────

function supabaseDriver(): StorageDriver {
  let client: SupabaseClient | null = null;
  const bucket = () => {
    client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return client.storage.from(env.SUPABASE_STORAGE_BUCKET);
  };

  return {
    async createUploadTarget(objectPath, contentType) {
      const { data, error } = await bucket().createSignedUploadUrl(objectPath);
      if (error) throw error;
      // Size is re-checked on finalize; Supabase enforces the bucket limit.
      return { url: data.signedUrl, method: "PUT", headers: { "content-type": contentType, "x-upsert": "false" } };
    },
    async signedReadUrl(objectPath, expiresIn) {
      const { data, error } = await bucket().createSignedUrl(objectPath, expiresIn);
      if (error) throw error;
      return data.signedUrl;
    },
    async download(objectPath) {
      const { data, error } = await bucket().download(objectPath);
      if (error) return null;
      return Buffer.from(await data.arrayBuffer());
    },
    async upload(objectPath, body, contentType) {
      const { error } = await bucket().upload(objectPath, body, { contentType, upsert: false });
      if (error) throw error;
    },
    async remove(objectPaths) {
      if (objectPaths.length === 0) return;
      const { error } = await bucket().remove(objectPaths);
      if (error) throw error;
    },
  };
}

// ─── Local filesystem ────────────────────────────────────────────────────────

export const LOCAL_UPLOAD_PURPOSE = "storage-upload";
export const LOCAL_READ_PURPOSE = "storage-read";

/** Rejects anything that is not a plain relative key made of safe segments. */
export function isSafeObjectPath(objectPath: string) {
  return (
    objectPath.length > 0 &&
    objectPath.length <= 512 &&
    objectPath.split("/").every((segment) => /^[A-Za-z0-9._-]+$/.test(segment) && segment !== "." && segment !== "..")
  );
}

export function localFilePath(objectPath: string) {
  if (!isSafeObjectPath(objectPath)) throw new Error("Unsafe object path");
  return path.join(path.resolve(env.LOCAL_STORAGE_DIR), ...objectPath.split("/"));
}

function localDriver(): StorageDriver {
  return {
    async createUploadTarget(objectPath, contentType, maxBytes) {
      const token = signPayload(LOCAL_UPLOAD_PURPOSE, { p: objectPath, ct: contentType, max: maxBytes }, UPLOAD_URL_TTL_SECONDS);
      return { url: `/api/storage/upload?t=${encodeURIComponent(token)}`, method: "PUT", headers: { "content-type": contentType } };
    },
    async signedReadUrl(objectPath, expiresIn) {
      const token = signPayload(LOCAL_READ_PURPOSE, { p: objectPath }, expiresIn);
      return `/api/storage/object?t=${encodeURIComponent(token)}`;
    },
    async download(objectPath) {
      try {
        return await readFile(localFilePath(objectPath));
      } catch {
        return null;
      }
    },
    async upload(objectPath, body) {
      const file = localFilePath(objectPath);
      await mkdir(path.dirname(file), { recursive: true });
      // "wx": never overwrite, matching the bucket's upsert: false.
      await writeFile(file, body, { flag: "wx" });
    },
    async remove(objectPaths) {
      await Promise.all(objectPaths.map((p) => rm(localFilePath(p), { force: true })));
    },
  };
}

export async function localObjectExists(objectPath: string) {
  try {
    return (await stat(localFilePath(objectPath))).isFile();
  } catch {
    return false;
  }
}

// ─── Driver selection ────────────────────────────────────────────────────────

export function storageDriverName(): "supabase" | "local" {
  if (env.STORAGE_DRIVER) return env.STORAGE_DRIVER;
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local";
}

let driver: StorageDriver | null = null;
function storage(): StorageDriver {
  if (driver) return driver;
  const name = storageDriverName();
  if (name === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    }
    driver = supabaseDriver();
  } else {
    driver = localDriver();
  }
  return driver;
}

/** One-time upload URL so the browser uploads straight to storage. */
export function createUploadTarget(objectPath: string, contentType: string, maxBytes = MAX_UPLOAD_BYTES) {
  return storage().createUploadTarget(objectPath, contentType, maxBytes);
}

export function createSignedReadUrl(objectPath: string, expiresIn = SIGNED_URL_TTL_SECONDS) {
  return storage().signedReadUrl(objectPath, expiresIn);
}

/** Returns null when the object does not exist. */
export function downloadObject(objectPath: string) {
  return storage().download(objectPath);
}

export function uploadObject(objectPath: string, body: Buffer, contentType: string) {
  return storage().upload(objectPath, body, contentType);
}

/** Best effort: storage cleanup must never fail the database write it follows. */
export async function removeObjects(objectPaths: string[]) {
  const unique = [...new Set(objectPaths.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await storage().remove(unique);
  } catch (error) {
    console.error("[storage] remove failed", { count: unique.length, error: (error as Error).message });
  }
}
