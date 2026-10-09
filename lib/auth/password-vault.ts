// Encrypted copy of a user's password for the Super Admin's 👁 on the users page. Login never uses it (passwordHash does).
// AES-256-GCM with a 32-byte key from PASSWORD_VIEW_KEY (base64, env only); without a valid key viewing is disabled.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

/** The key, or null when PASSWORD_VIEW_KEY is missing or not 32 bytes. */
export function vaultKey(raw = process.env.PASSWORD_VIEW_KEY) {
  const text = raw?.trim();
  if (!text) return null;
  const key = Buffer.from(text, "base64");
  return key.length === 32 ? key : null;
}
export const isVaultEnabled = (raw?: string) => vaultKey(raw ?? process.env.PASSWORD_VIEW_KEY) !== null;

/** "v1:<base64 iv|tag|ciphertext>", or null when there is no key (the password is then simply not kept for viewing). */
export function encryptPassword(password: string, key = vaultKey()) {
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64")}`;
}

/** Throws when the key is missing / wrong or the value was tampered with (GCM authentication). */
export function decryptPassword(value: string, key = vaultKey()) {
  if (!key) throw new Error("PASSWORD_VIEW_KEY is not set");
  const [version, payload] = value.split(":");
  if (version !== VERSION || !payload) throw new Error("Unknown password format");
  const data = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

/**
 * On a successful login: should the typed password be (re)saved as the encrypted copy? Yes when there is a key and the
 * copy is missing, unreadable (old key) or no longer matches. Without a key: never (login works as usual).
 */
export function needsPasswordCapture(stored: string | null | undefined, typed: string, key = vaultKey()) {
  if (!key) return false;
  if (!stored) return true;
  try { return decryptPassword(stored, key) !== typed; } catch { return true; }
}
