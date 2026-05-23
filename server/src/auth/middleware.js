export function requireAuth(req, res, next) {
  if (!req.session?.userId && !req.session?.guestId) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  next();
}

export function getSessionUser(req) {
  if (req.session?.isGuest && req.session?.guestId) {
    return { id: req.session.guestId, username: req.session.username, isGuest: true };
  }
  if (!req.session?.userId) return null;
  return { id: req.session.userId, username: req.session.username, isGuest: false };
}
