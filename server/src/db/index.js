import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;

export function getDb() {
  if (!db) {
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
  }
  return db;
}

export function findUserByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}

export function findUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function createUser(id, username, passwordHash) {
  getDb().prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(id, username, passwordHash);
  return findUserById(id);
}

export function listFriends(userId) {
  return getDb()
    .prepare(
      `SELECT u.id, u.username
       FROM friends f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ?
       ORDER BY u.username`
    )
    .all(userId);
}

export function addFriend(userId, friendId) {
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)');
  const tx = db.transaction(() => {
    insert.run(userId, friendId);
    insert.run(friendId, userId);
  });
  tx();
}

export function removeFriend(userId, friendId) {
  const db = getDb();
  const del = db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?');
  const tx = db.transaction(() => {
    del.run(userId, friendId);
    del.run(friendId, userId);
  });
  tx();
}

export function areFriends(userId, friendId) {
  const row = getDb().prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(userId, friendId);
  return !!row;
}
