import { customAlphabet } from 'nanoid';
import { Room, VISIBILITY } from './Room.js';

const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {Map<string, string>} userId -> code */
    this.userRoom = new Map();
  }

  create(hostId, hostUsername, socketId, visibility = VISIBILITY.public) {
    if (this.userRoom.has(hostId)) this.leave(hostId);
    let code;
    do {
      code = genCode();
    } while (this.rooms.has(code));

    const room = new Room(code, hostId, visibility);
    room.addMember(hostId, hostUsername, socketId);
    this.rooms.set(code, room);
    this.userRoom.set(hostId, code);
    return room;
  }

  get(code) {
    return this.rooms.get(code?.toUpperCase());
  }

  getByUser(userId) {
    const code = this.userRoom.get(userId);
    return code ? this.rooms.get(code) : null;
  }

  leave(userId) {
    const code = this.userRoom.get(userId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) {
      this.userRoom.delete(userId);
      return null;
    }
    room.removeMember(userId);
    this.userRoom.delete(userId);
    if (room.isEmpty()) {
      this.rooms.delete(code);
      return { deleted: true, code };
    }
    return { deleted: false, code, room };
  }

  listPublicWaiting() {
    return [...this.rooms.values()]
      .filter((r) => r.visibility === VISIBILITY.public && r.status === 'waiting')
      .map((r) => r.toLobbyState());
  }

  listFriendsWaiting(friendHostIds) {
    const hostSet = new Set(friendHostIds);
    return [...this.rooms.values()]
      .filter(
        (r) =>
          r.visibility === VISIBILITY.friends &&
          r.status === 'waiting' &&
          hostSet.has(r.hostId)
      )
      .map((r) => ({
        hostId: r.hostId,
        hostUsername: r.members.get(r.hostId)?.username ?? 'Host',
        memberCount: [...r.members.values()].filter((m) => !m.spectator).length,
      }));
  }

  findFriendsRoomByHost(hostId) {
    return [...this.rooms.values()].find(
      (r) =>
        r.visibility === VISIBILITY.friends &&
        r.hostId === hostId &&
        r.status === 'waiting'
    );
  }
}
