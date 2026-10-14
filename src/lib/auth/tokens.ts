import { createHash, randomBytes } from "node:crypto";

/** 256-bit URL-safe token. Only its hash is ever persisted. */
export function generateToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const TOKEN_TTL = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 30 * 60 * 1000,
  INVITATION: 7 * 24 * 60 * 60 * 1000,
} as const;
