import { Session } from '../session/Session.js';

export const VISIBILITY = {
  public: 'public',
  private: 'private',
  friends: 'friends',
};

export class Room {
  constructor(code, hostId, visibility = VISIBILITY.public) {
    this.code = code;
    this.hostId = hostId;
    this.visibility = visibility;
    /** @type {Map<string, { userId: string, username: string, socketId: string | null, spectator: boolean }>} */
    this.members = new Map();
    this.session = null;
    this.status = 'waiting';
  }

  addMember(userId, username, socketId, { spectator = false } = {}) {
    if (this.members.has(userId)) {
      const m = this.members.get(userId);
      m.socketId = socketId;
      m.spectator = spectator;
      return m;
    }
    if (!spectator && this.members.size >= 18 && !this.getActiveMember(userId)) {
      throw new Error('Space is full');
    }
    const entry = { userId, username, socketId, spectator };
    this.members.set(userId, entry);
    return entry;
  }

  removeMember(userId) {
    this.members.delete(userId);
    if (this.hostId === userId) {
      const next = [...this.members.values()].find((m) => !m.spectator);
      this.hostId = next?.userId ?? null;
    }
  }

  getActiveMember(userId) {
    const m = this.members.get(userId);
    return m && !m.spectator ? m : null;
  }

  activeCount() {
    return [...this.members.values()].filter((m) => !m.spectator).length;
  }

  isEmpty() {
    return this.members.size === 0;
  }

  toLobbyState() {
    return {
      code: this.visibility === VISIBILITY.friends ? null : this.code,
      hostId: this.hostId,
      visibility: this.visibility,
      status: this.status,
      members: [...this.members.values()].map((m) => ({
        userId: m.userId,
        username: m.username,
        spectator: m.spectator,
      })),
    };
  }

  startSession() {
    const participants = [...this.members.values()].filter((m) => !m.spectator);
    if (participants.length < 2) throw new Error('Need at least 2 participants');
    this.session = new Session(
      participants.map((p) => ({ id: p.userId, username: p.username }))
    );
    this.status = 'active';
    return this.session;
  }
}
