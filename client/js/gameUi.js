const ACTION_LABELS = {
  collect: 'Collect',
  support: 'Support',
  takeover: 'Takeover',
  levy: 'Levy',
  strike: 'Strike',
  seize: 'Seize',
  shuffle: 'Shuffle',
};

export function pendingActionText(session) {
  const p = session.pending;
  if (!p) return '';
  const actor = session.members.find((m) => m.id === p.actorId);
  const target = p.targetId ? session.members.find((m) => m.id === p.targetId) : null;
  const action = ACTION_LABELS[p.type] || p.type;
  if (target) return `${actor?.username ?? 'Player'} — ${action} → ${target.username}`;
  return `${actor?.username ?? 'Player'} — ${action}`;
}

export function canPassPhase(session, userId) {
  if (!session?.you || session.you.eliminated || session.you.spectator) return false;
  if (!['challenge_action', 'challenge_block', 'block'].includes(session.phase)) return false;
  const p = session.pending;
  if (session.phase === 'challenge_action' && userId === p?.actorId) return false;
  if (session.phase === 'block' && userId === p?.actorId) return false;
  if (session.phase === 'challenge_block' && userId === session.block?.userId) return false;
  return true;
}

export function canChallenge(session, userId) {
  if (!session?.you || session.you.eliminated) return false;
  if (session.phase === 'challenge_action') {
    return userId !== session.pending?.actorId;
  }
  if (session.phase === 'challenge_block') {
    return userId !== session.block?.userId;
  }
  return false;
}

export function canCounter(session, userId) {
  if (session.phase !== 'block' || !session.pending) return false;
  if (session.you?.eliminated) return false;
  const p = session.pending;
  if (p.type === 'support') return userId !== p.actorId;
  if (p.targetId) return userId === p.targetId;
  return false;
}

export function counterRoles(pending) {
  if (!pending) return [];
  if (pending.type === 'support') return ['director'];
  if (pending.type === 'strike') return ['shield'];
  if (pending.type === 'seize') return ['chief', 'liaison'];
  return [];
}
