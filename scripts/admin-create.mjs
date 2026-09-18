import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { hash } from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;

function normalizeUzPhone(value) {
  if (!/^[+\d\s()\-]+$/.test(value.trim())) return null;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 9) digits = `998${digits}`;
  return digits.length === 12 && digits.startsWith('998') ? `+${digits}` : null;
}

async function hiddenPrompt(label) {
  process.stdout.write(label);
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = '';
  try {
    return await new Promise((resolve, reject) => {
      const onKey = (character, key) => {
        if (key?.ctrl && key.name === 'c') {
          process.stdin.off('keypress', onKey);
          reject(new Error('Cancelled'));
        } else if (key?.name === 'return') {
          process.stdin.off('keypress', onKey);
          process.stdout.write('\n');
          resolve(value);
        } else if (key?.name === 'backspace') {
          value = value.slice(0, -1);
        } else if (character && !key?.ctrl && !key?.meta) {
          value += character;
        }
      };
      process.stdin.on('keypress', onKey);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this script in an interactive terminal.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const url = new URL(process.env.DATABASE_URL);
  url.hostname = url.hostname.replace('-pooler', '');
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const count = await client.query('SELECT count(*)::int AS count FROM "AdminUser"');
    if (count.rows[0].count !== 0) throw new Error('The first admin already exists.');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    let name, phone, role;
    try {
      name = (await prompt.question('Name: ')).trim();
      phone = normalizeUzPhone(await prompt.question('Phone: '));
      role = (await prompt.question('Role [SUPER_ADMIN]: ')).trim().toUpperCase() || 'SUPER_ADMIN';
    } finally {
      prompt.close();
    }
    if (!name || name.length > 120 || !phone || !['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role)) throw new Error('Invalid name, phone, or role.');
    const password = await hiddenPrompt('Password (hidden): ');
    const confirm = await hiddenPrompt('Confirm password (hidden): ');
    if (password !== confirm || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Passwords must match and contain 12–72 UTF-8 bytes.');
    const passwordHash = await hash(password, 12);
    await client.query('INSERT INTO "AdminUser" (id,name,phone,"passwordHash",role,"isActive","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,true,now(),now())', [randomUUID(), name, phone, passwordHash, role]);
    console.log('First admin created.');
  } finally {
    await client.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
