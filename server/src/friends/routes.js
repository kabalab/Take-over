import { Router } from 'express';
import { addFriend, findUserByUsername, listFriends, removeFriend } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import { getFriendsPresence } from '../presence.js';

export function createFriendsRouter(notifyFriends) {
  const router = Router();

  router.use(requireAuth);

  router.use((req, res, next) => {
    if (req.session?.isGuest) {
      return res.status(403).json({ error: 'Guests cannot use friends' });
    }
    next();
  });

  router.get('/', async (req, res) => {
    const friends = await listFriends(req.session.userId);
    const presence = getFriendsPresence(friends);
    res.json(
      friends.map((f) => ({
        username: f.username,
        online: presence[f.id]?.online ?? false,
        spaceCode: presence[f.id]?.spaceCode ?? null,
      }))
    );
  });

  router.post('/', async (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Username required' });
    if (username.toLowerCase() === req.session.username.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }
    const friend = await findUserByUsername(username);
    if (!friend) return res.status(404).json({ error: 'User not found' });
    await addFriend(req.session.userId, friend.id);
    if (notifyFriends) {
      await notifyFriends(req.session.userId);
      await notifyFriends(friend.id);
    }
    res.json({ ok: true, username: friend.username });
  });

  router.delete('/:username', async (req, res) => {
    const friend = await findUserByUsername(req.params.username);
    if (!friend) return res.status(404).json({ error: 'User not found' });
    await removeFriend(req.session.userId, friend.id);
    if (notifyFriends) {
      await notifyFriends(req.session.userId);
      await notifyFriends(friend.id);
    }
    res.json({ ok: true });
  });

  return router;
}
