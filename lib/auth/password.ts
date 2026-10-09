import "server-only";
import { compare, hash } from "bcryptjs";

const WORK_FACTOR = 12;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Password must be 12–72 UTF-8 bytes.");
  }
  return hash(password, WORK_FACTOR);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}
