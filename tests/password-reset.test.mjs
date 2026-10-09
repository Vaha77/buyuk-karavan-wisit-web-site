import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import bcrypt from "bcryptjs";

register("./ts-resolve.mjs", import.meta.url);
const temp = await import("../lib/auth/temp-password.ts");
const access = await import("../lib/auth/seller-access.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("temporary password: 8 easy-to-read characters (no 0/O/o, 1/l/I), mixed, different every time", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const password = temp.generateTempPassword();
    assert.equal(password.length, 8);
    assert.match(password, /^[A-HJ-NP-Za-km-np-z2-9]{8}$/);
    assert.doesNotMatch(password, /[0Oo1lI]/);
    assert.ok(/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password), password);
    seen.add(password);
  }
  assert.ok(seen.size > 495, "random");
});

test("the password is stored only as a bcrypt hash and never written in clear text (audit, logs)", async () => {
  const password = temp.generateTempPassword();
  const hash = await bcrypt.hash(password, 4);
  assert.notEqual(hash, password);
  assert.ok(!hash.includes(password));
  assert.equal(await bcrypt.compare(password, hash), true);

  const passwords = await read("../lib/auth/password.ts");
  assert.match(passwords, /export async function hashTemporaryPassword[\s\S]*?return hash\(password, WORK_FACTOR\);/);
  const actions = await read("../app/admin/(protected)/users/actions.ts");
  const reset = actions.slice(actions.indexOf("export async function resetUserPasswordAction"), actions.indexOf("/** \"Telegramga yuborish\""));
  assert.match(reset, /passwordHash:await hashTemporaryPassword\(password\),mustPasswordChange:true/);
  assert.match(reset, /getDb\(\)\.adminSession\.deleteMany\(\{where:\{userId:user\.id\}\}\)/, "old sessions end");
  const audit = reset.slice(reset.indexOf("writeAudit("), reset.indexOf("revalidatePath"));
  assert.doesNotMatch(audit, /\bpassword\b/, "the audit entry has no password");
  assert.doesNotMatch(actions, /console\.(log|info|warn|error)\([^)]*password/i, "no password in logs");
  const send = actions.slice(actions.indexOf("export async function sendTempPasswordTelegramAction"));
  assert.match(send, /verifyPassword\(password,user\.passwordHash\)/, "only the password that is currently set can be sent");
  assert.doesNotMatch(send.slice(send.indexOf("writeAudit(")), /\$\{password\}/, "the Telegram audit entry has no password");
  const schema = await read("../prisma/schema.prisma");
  assert.doesNotMatch(schema, /tempPassword|plainPassword/i, "no clear-text column");
});

test("only the Super Admin resets passwords or sends them to Telegram", async () => {
  const actions = await read("../app/admin/(protected)/users/actions.ts");
  assert.match(actions, /export async function resetUserPasswordAction\(userId:string\):Promise<PasswordResetResult>\{const actor=await requireRole\("SUPER_ADMIN"\);/);
  assert.match(actions, /export async function sendTempPasswordTelegramAction\(userId:string,password:string\)[^\n]*?\{const actor=await requireRole\("SUPER_ADMIN"\);/);
  assert.match(actions, /if\(userId===actor\.id\)return\{ok:false/, "not your own password from this list");
  const page = await read("../app/admin/(protected)/users/page.tsx");
  assert.match(page, /await requireRole\("SUPER_ADMIN"\)/);
});

test("a temporary password only opens “Yangi parol o‘rnating” until a new one is set", async () => {
  const guard = await read("../lib/auth/require-admin.ts");
  assert.match(guard, /if \(session\.user\.mustPasswordChange\) \{\s*if \(\(await headers\(\)\)\.has\("next-action"\)\) forbidden\(\);\s*redirect\(PASSWORD_PAGE\);/);
  const login = await read("../app/admin/login/actions.ts");
  assert.match(login, /redirect\(user\.mustPasswordChange \? PASSWORD_PAGE : homeFor\(user\.role\)\)/);
  const request = { method: "GET", headers: { has: () => false } };
  for (const role of ["SELLER", "WORKSHOP", "SUPER_ADMIN"]) assert.equal(access.roleAccess(role, "/admin/password", request), "allow", role);
  assert.equal(access.PASSWORD_PAGE, "/admin/password");
  const change = await read("../app/admin/password/actions.ts");
  assert.match(change, /if \(password\.length < 12/);
  assert.match(change, /passwordHash: await hashPassword\(password\), mustPasswordChange: false/);
  assert.match(change, /db\.adminSession\.deleteMany\(\{ where: \{ userId: user\.id \} \}\)/);
  const session = await read("../lib/auth/session.ts");
  assert.match(session, /!session\.user\.mustPasswordChange \? session : null/, "API routes refuse it too");
  const loginPage = await read("../app/admin/login/page.tsx");
  assert.match(loginPage, /Parolni unutdingizmi\? Admin bilan bog‘laning\./);
});
