export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  next();
}

export function getSessionUser(req) {
  if (!req.session?.userId) return null;
  return { id: req.session.userId, username: req.session.username };
}
