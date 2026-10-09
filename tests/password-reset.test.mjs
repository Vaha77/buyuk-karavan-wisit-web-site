import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { register } from "node:module";
import bcrypt from "bcryptjs";

register("./ts-resolve.mjs", import.meta.url);
const vault = await import("../lib/auth/password-vault.ts");
const removal = await import("../lib/auth/user-removal.ts");
const access = await import("../lib/auth/seller-access.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");
const key = randomBytes(32).toString("base64");

test("passwords: bcrypt hash for login + AES-256-GCM copy for 👁; no clear text stored", async () => {
  const password = "Ikromjon-Seh-2026!";
  const hash = await bcrypt.hash(password, 4);
  assert.ok(!hash.includes(password) && await bcrypt.compare(password, hash));
  const k = vault.vaultKey(key);
  const one = vault.encryptPassword(password, k), two = vault.encryptPassword(password, k);
  assert.match(one, /^v1:[A-Za-z0-9+/=]+$/);
  assert.ok(!one.includes(password) && !Buffer.from(one.slice(3), "base64").toString("utf8").includes(password), "ciphertext only");
  assert.notEqual(one, two, "random IV every time");
  assert.equal(vault.decryptPassword(one, k), password);
  assert.throws(() => vault.decryptPassword(one, vault.vaultKey(randomBytes(32).toString("base64"))), "a different key cannot read it");
  const bytes = Buffer.from(one.slice(3), "base64");
  bytes[30] ^= 1;
  assert.throws(() => vault.decryptPassword(`v1:${bytes.toString("base64")}`, k), "GCM rejects a changed value");
  assert.equal(vault.vaultKey(""), null);
  assert.equal(vault.vaultKey(Buffer.alloc(16).toString("base64")), null, "the key must be 32 bytes");
  assert.equal(vault.encryptPassword(password, null), null, "no key → nothing kept for viewing");
  assert.equal(vault.isVaultEnabled(""), false);
  assert.equal(vault.isVaultEnabled(key), true);
  const source = await read("../lib/auth/password-vault.ts");
  assert.doesNotMatch(source, /[A-Za-z0-9+/]{43}=/, "the key is never in the code");
  const example = await read("../.env.example");
  assert.match(example, /^PASSWORD_VIEW_KEY=\r?$/m);
});

test("every place a password is set also keeps the encrypted copy", async () => {
  const users = await read("../app/admin/(protected)/users/actions.ts");
  assert.match(users, /adminUser\.create\(\{data:\{name,phone,passwordHash,passwordEncrypted:encryptPassword\(password\)/, "create");
  assert.match(users, /passwordHash:await hashPassword\(password\),passwordEncrypted:encryptPassword\(password\),mustPasswordChange:false/, "✏️ by the Super Admin");
  const registration = await read("../app/admin/register/actions.ts");
  assert.match(registration, /passwordHash:await hashPassword\(password\),passwordEncrypted:encryptPassword\(password\)/, "self-registration");
  const own = await read("../app/admin/password/actions.ts");
  assert.match(own, /passwordHash: await hashPassword\(password\), passwordEncrypted: encryptPassword\(password\)/, "the user's own change");
  const schema = await read("../prisma/schema.prisma");
  assert.doesNotMatch(schema, /plainPassword|passwordPlain|tempPassword/i);
});

test("only the Super Admin views a password, on click only; every view is audited without the password; never logged", async () => {
  const users = await read("../app/admin/(protected)/users/actions.ts");
  for (const name of ["revealPasswordAction", "setUserPasswordAction", "userRemovalPreviewAction", "removeUserAction", "restoreUserAction"]) {
    assert.match(users, new RegExp(`export async function ${name}\\([^\\n]*?\\{const actor=await requireRole\\("SUPER_ADMIN"\\);`), name);
  }
  const reveal = users.slice(users.indexOf("export async function revealPasswordAction"), users.indexOf("// ---- Delete / archive"));
  assert.match(reveal, /if\(!isVaultEnabled\(\)\)return\{ok:false,error:"Vercel’da PASSWORD_VIEW_KEY o‘rnating\."\}/);
  assert.match(reveal, /action:"PASSWORD_VIEW"/);
  const audit = reveal.slice(reveal.indexOf("writeAudit("), reveal.indexOf("return{ok:true,password}"));
  assert.doesNotMatch(audit, /\bpassword\b/, "the audit entry has no password");
  assert.doesNotMatch(users, /console\.(log|info|warn|error)/, "nothing from these actions goes to the log");
  const page = await read("../app/admin/(protected)/users/page.tsx");
  assert.match(page, /passwordStored: !!passwordEncrypted/, "the page sends only “stored or not”, not the ciphertext");
  const cell = await read("../app/admin/(protected)/users/password-cell.tsx");
  assert.match(cell, /const HIDE_AFTER_MS = 30_000;/);
  assert.match(cell, /revealPasswordAction\(userId\)/, "fetched from the server on 👁");
  assert.match(cell, /Xodim saytga bir marta kirgach ko‘rinadi/);
  assert.doesNotMatch(cell, /setUserPasswordAction|✏️|<input/, "only 👁 and Nusxalash on the row");
});

test("delete vs archive: no links → deleted; links → archived (cannot log in, hidden, restorable); never yourself or the last Super Admin", async () => {
  const none = { orders: 0, calculations: 0, customers: 0, sales: 0, other: 0, activity: 0 };
  assert.equal(removal.removalPlan(none).mode, "delete");
  const busy = removal.removalPlan({ ...none, orders: 12, activity: 40 });
  assert.equal(busy.mode, "archive");
  assert.match(busy.text, /^Bu foydalanuvchida 12 ta zakaz, 40 ta faoliyat yozuvi bor — arxivlanadi/);
  assert.deepEqual(removal.checkRemoval("me", { id: "me", role: "ADMIN" }, 3), { ok: false, error: "O‘zingizni o‘chira olmaysiz." });
  assert.deepEqual(removal.checkRemoval("me", { id: "boss", role: "SUPER_ADMIN" }, 0), { ok: false, error: "Oxirgi Super Adminni o‘chirib bo‘lmaydi." });
  assert.deepEqual(removal.checkRemoval("me", { id: "boss", role: "SUPER_ADMIN" }, 1), { ok: true });
  assert.deepEqual(removal.checkRemoval("me", { id: "seller", role: "SELLER" }, 0), { ok: true });

  const users = await read("../app/admin/(protected)/users/actions.ts");
  assert.match(users, /if\(plan\.mode==="delete"\)\{await db\.\$transaction\(\[db\.adminSession\.deleteMany\(\{where:\{userId\}\}\),db\.adminUser\.delete\(\{where:\{id:userId\}\}\)\]\)/);
  assert.match(users, /data:\{archivedAt:new Date\(\),isActive:false,telegramChatId:null,telegramLinkCode:null,telegramLinkExpiresAt:null,salesPersonId:null\}\}\),db\.adminSession\.deleteMany\(\{where:\{userId\}\}\)/, "archived: no login, no Telegram, no sessions");
  assert.match(users, /role:"SUPER_ADMIN",isActive:true,archivedAt:null,NOT:\{id:user\.id\}/, "counts the other active Super Admins");
  const page = await read("../app/admin/(protected)/users/page.tsx");
  assert.match(page, /where: \{ archivedAt: archive \? \{ not: null \} : null \}/, "hidden from the list, shown under “Arxiv”");
  const session = await read("../lib/auth/session.ts");
  assert.match(session, /!session\.user\.isActive/, "an archived (inactive) user's session is refused");
});

test("a forced password change still only opens “Yangi parol o‘rnating”", async () => {
  const guard = await read("../lib/auth/require-admin.ts");
  assert.match(guard, /if \(session\.user\.mustPasswordChange\) \{/);
  const request = { method: "GET", headers: { has: () => false } };
  for (const role of ["SELLER", "WORKSHOP"]) assert.equal(access.roleAccess(role, "/admin/password", request), "allow", role);
  const login = await read("../app/admin/login/page.tsx");
  assert.match(login, /Parolni unutdingizmi\? Admin bilan bog‘laning\./);
});

test("login keeps an encrypted copy of a correct password when there is none (or it is stale); never with a wrong password or without a key", async () => {
  const k = vault.vaultKey(key);
  assert.equal(vault.needsPasswordCapture(null, "Correct-Pass-1", k), true, "older account: captured on login");
  const stored = vault.encryptPassword("Correct-Pass-1", k);
  assert.equal(vault.needsPasswordCapture(stored, "Correct-Pass-1", k), false, "already up to date: no write");
  assert.equal(vault.needsPasswordCapture(stored, "Changed-Pass-2", k), true, "stale copy is refreshed");
  assert.equal(vault.needsPasswordCapture(vault.encryptPassword("x", vault.vaultKey(randomBytes(32).toString("base64"))), "Correct-Pass-1", k), true, "unreadable (old key) is refreshed");
  assert.equal(vault.needsPasswordCapture(null, "Correct-Pass-1", null), false, "no PASSWORD_VIEW_KEY: nothing saved, login as usual");

  // Simulated login with the real order of checks: a wrong password never reaches the capture.
  const user = { passwordHash: await bcrypt.hash("Correct-Pass-1", 4), passwordEncrypted: null };
  const login = async typed => {
    if (!(await bcrypt.compare(typed, user.passwordHash))) return "invalid";
    if (vault.needsPasswordCapture(user.passwordEncrypted, typed, k)) user.passwordEncrypted = vault.encryptPassword(typed, k);
    return "ok";
  };
  assert.equal(await login("wrong-password"), "invalid");
  assert.equal(user.passwordEncrypted, null, "wrong password: nothing saved");
  assert.equal(await login("Correct-Pass-1"), "ok");
  assert.equal(vault.decryptPassword(user.passwordEncrypted, k), "Correct-Pass-1", "correct login: copy saved");

  const action = await read("../app/admin/login/actions.ts");
  const verify = action.indexOf("!(await verifyPassword(passwordInput, user.passwordHash))"), capture = action.indexOf("needsPasswordCapture(user.passwordEncrypted, passwordInput)"), session = action.indexOf("await createAdminSession(user.id);");
  assert.ok(verify > 0 && verify < capture && capture < session, "capture only after the password was verified, before the session");
  assert.match(action, /data: \{ passwordEncrypted: encryptPassword\(passwordInput\) \} \}\)\.catch\(\(\) => undefined\);/, "a failure never blocks the login");
  assert.doesNotMatch(action, /console\.|writeAudit/, "the password is never logged or audited");
});
