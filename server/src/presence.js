/** @type {Map<string, { socketIds: Set<string>, spaceCode: string | null }>} */
const online = new Map();

/** @type {Map<string, string>} socketId -> userId */
const socketToUser = new Map();

export function setUserOnline(userId, socketId, spaceCode = null) {
  if (!online.has(userId)) online.set(userId, { socketIds: new Set(), spaceCode: null });
  const entry = online.get(userId);
  entry.socketIds.add(socketId);
  if (spaceCode !== undefined) entry.spaceCode = spaceCode;
  socketToUser.set(socketId, userId);
}

export function setUserSpace(userId, spaceCode) {
  const entry = online.get(userId);
  if (entry) entry.spaceCode = spaceCode;
}

export function setUserOffline(socketId) {
  const userId = socketToUser.get(socketId);
  if (!userId) return null;
  socketToUser.delete(socketId);
  const entry = online.get(userId);
  if (!entry) return userId;
  entry.socketIds.delete(socketId);
  if (entry.socketIds.size === 0) {
    online.delete(userId);
  }
  return userId;
}

export function getFriendsPresence(friendRows) {
  const result = {};
  for (const f of friendRows) {
    const entry = online.get(f.id);
    result[f.id] = {
      online: !!entry && entry.socketIds.size > 0,
      spaceCode: entry?.spaceCode ?? null,
    };
  }
  return result;
}
