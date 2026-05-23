import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let client;

function getClient() {
  if (!client) throw new Error('Database not initialized. Call initDb() first.');
  return client;
}

export async function initDb() {
  if (client) return client;

  const url = config.tursoUrl;
  const opts = { url };
  if (config.tursoAuthToken) opts.authToken = config.tursoAuthToken;

  if (url.startsWith('file:')) {
    const filePath = url.replace(/^file:/, '');
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  client = createClient(opts);
  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await client.executeMultiple(schema);

  return client;
}

export async function findUserByUsername(username) {
  const result = await getClient().execute({
    sql: 'SELECT * FROM users WHERE username = ? COLLATE NOCASE',
    args: [username],
  });
  return result.rows[0] ?? null;
}

export async function findUserById(id) {
  const result = await getClient().execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [id],
  });
  return result.rows[0] ?? null;
}

export async function createUser(id, username, passwordHash) {
  await getClient().execute({
    sql: 'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
    args: [id, username, passwordHash],
  });
  return findUserById(id);
}

export async function listFriends(userId) {
  const result = await getClient().execute({
    sql: `SELECT u.id, u.username
       FROM friends f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ?
       ORDER BY u.username`,
    args: [userId],
  });
  return result.rows;
}

export async function addFriend(userId, friendId) {
  await getClient().batch(
    [
      {
        sql: 'INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)',
        args: [userId, friendId],
      },
      {
        sql: 'INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)',
        args: [friendId, userId],
      },
    ],
    'write'
  );
}

export async function removeFriend(userId, friendId) {
  await getClient().batch(
    [
      {
        sql: 'DELETE FROM friends WHERE user_id = ? AND friend_id = ?',
        args: [userId, friendId],
      },
      {
        sql: 'DELETE FROM friends WHERE user_id = ? AND friend_id = ?',
        args: [friendId, userId],
      },
    ],
    'write'
  );
}

export async function areFriends(userId, friendId) {
  const result = await getClient().execute({
    sql: 'SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?',
    args: [userId, friendId],
  });
  return result.rows.length > 0;
}
