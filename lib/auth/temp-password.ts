// One-time password the Super Admin hands out after "Parolni tiklash". Pure apart from crypto randomness.
import { randomInt } from "node:crypto";

/** No look-alikes: 0/O/o, 1/l/I are left out so the password reads clearly over the phone. */
export const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export const TEMP_PASSWORD_LENGTH = 8;

export function generateTempPassword(length = TEMP_PASSWORD_LENGTH) {
  let password = "";
  // Always mixed: at least one upper-case letter, one lower-case letter and one digit.
  while (!(/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password))) {
    password = Array.from({ length }, () => TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)]).join("");
  }
  return password;
}
