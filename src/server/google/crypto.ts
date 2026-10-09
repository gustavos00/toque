// AES-256-GCM for secrets stored in the DB (Google tokens).
// Key: TOQUE_ENCRYPTION_KEY = 32 random bytes, base64 (or base64url).
// Format: "v1.<iv>.<auth tag>.<ciphertext>", each part base64url.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]+={0,2}|[A-Za-z0-9_-]+)$/;

type KeyResult =
  { key: Buffer; problem: null } | { key: null; problem: string };

/** Parses TOQUE_ENCRYPTION_KEY strictly: base64/base64url of exactly 32 bytes. */
function parseEncryptionKey(raw: string | undefined): KeyResult {
  const value = raw?.trim();
  if (!value) return { key: null, problem: "TOQUE_ENCRYPTION_KEY is not set." };
  const key = BASE64_PATTERN.test(value) ? Buffer.from(value, "base64") : null;
  if (!key || key.length !== 32) {
    return {
      key: null,
      problem: `TOQUE_ENCRYPTION_KEY must be base64 of exactly 32 bytes${
        key ? ` (got ${key.length})` : " (not valid base64)"
      }. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    };
  }
  return { key, problem: null };
}

/** The 32-byte key, or null when TOQUE_ENCRYPTION_KEY is missing/invalid. */
export function getEncryptionKey(): Buffer | null {
  return parseEncryptionKey(process.env.TOQUE_ENCRYPTION_KEY).key;
}

/** Why the key is unusable (for logs / errors), or null when it is fine. */
export function getEncryptionKeyProblem(): string | null {
  return parseEncryptionKey(process.env.TOQUE_ENCRYPTION_KEY).problem;
}

function requireEncryptionKey(): Buffer {
  const result = parseEncryptionKey(process.env.TOQUE_ENCRYPTION_KEY);
  if (!result.key) throw new Error(result.problem);
  return result.key;
}

export function encryptSecret(plaintext: string, key = requireEncryptionKey()) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url"),
    )
    .join(".");
}

/** Throws if the value was tampered with or encrypted with another key. */
export function decryptSecret(value: string, key = requireEncryptionKey()) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unsupported encrypted value.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
