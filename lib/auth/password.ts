import "server-only";
import { compare, hash } from "bcryptjs";

const WORK_FACTOR = 12;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Password must be 12–72 UTF-8 bytes.");
  }
  return hash(password, WORK_FACTOR);
}

/** The 8-character one-time password from "Parolni tiklash" (stored only as a hash; the user must replace it on login). */
export async function hashTemporaryPassword(password: string): Promise<string> {
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) throw new Error("Temporary password must be 8–72 UTF-8 bytes.");
  return hash(password, WORK_FACTOR);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}
