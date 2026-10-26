import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

/**
 * Signing key for session cookies and file links.
 * - SESSION_SECRET (32+ chars) is used when set.
 * - In production it is required: starting without it fails loudly instead of signing with a guessable key.
 * - In development a random key is generated once and kept in .data/.session-secret (never committed).
 * There is deliberately no hard-coded fallback: a key in the source code would let anyone forge a session.
 */
let cached: string | null = null;

export function signingSecret(): string {
  if (cached) return cached;
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 32) return (cached = env);
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters in production.");
  }
  const file = path.join(/*turbopackIgnore: true*/ DATA_DIR, ".session-secret");
  try {
    cached = fs.readFileSync(file, "utf8").trim();
    if (cached.length >= 32) return cached;
  } catch { /* not created yet */ }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  cached = crypto.randomBytes(48).toString("base64url");
  fs.writeFileSync(file, cached, { mode: 0o600 });
  return cached;
}
