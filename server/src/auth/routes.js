import { Router } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { createUser, findUserByUsername } from '../db/index.js';
import { requireAuth } from './middleware.js';

const router = Router();
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–20 characters (letters, numbers, underscore)' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (await findUserByUsername(username)) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 11);
    const user = await createUser(uuidv4(), username, hash);
    req.session.userId = user.id;
    req.session.username = user.username;
    delete req.session.guestId;
    delete req.session.isGuest;
    res.json({ id: user.id, username: user.username, isGuest: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = await findUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.userId = user.id;
    req.session.username = user.username;
    delete req.session.guestId;
    delete req.session.isGuest;
    res.json({ id: user.id, username: user.username, isGuest: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sign in failed' });
  }
});

router.post('/guest', (req, res) => {
  const id = uuidv4();
  const tag = id.replace(/-/g, '').slice(0, 6);
  delete req.session.userId;
  delete req.session.isGuest;
  delete req.session.guestId;
  req.session.guestId = id;
  req.session.username = `Guest_${tag}`;
  req.session.isGuest = true;
  res.json({ id, username: req.session.username, isGuest: true });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  if (req.session.isGuest) {
    return res.json({
      id: req.session.guestId,
      username: req.session.username,
      isGuest: true,
    });
  }
  res.json({ id: req.session.userId, username: req.session.username, isGuest: false });
});

export default router;
