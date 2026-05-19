export const ACTIONS = {
  collect: { credits: 1, claim: null, blockable: false, target: false, cost: 0 },
  support: { credits: 2, claim: null, blockable: true, blockRole: 'director', target: false, cost: 0 },
  takeover: { credits: 0, claim: null, blockable: false, target: true, cost: 7 },
  levy: { credits: 3, claim: 'director', blockable: false, target: false, cost: 0 },
  strike: { credits: 0, claim: 'agent', blockable: true, blockRoles: ['shield'], target: true, cost: 3 },
  seize: { credits: 0, claim: 'chief', blockable: true, blockRoles: ['chief', 'liaison'], target: true, cost: 0 },
  shuffle: { credits: 0, claim: 'liaison', blockable: false, target: false, cost: 0 },
};

export function canDeclareAction(member, type, config) {
  const def = ACTIONS[type];
  if (!def) return 'Unknown action';
  if (member.credits < def.cost) return 'Not enough credits';
  if (type === 'takeover' && member.credits < config.takeoverCost) return 'Takeover requires 7 credits';
  if (member.credits >= config.forcedTakeoverCredits && type !== 'takeover') {
    return 'Must perform takeover with 10+ credits';
  }
  return null;
}

export function roleBlocksAction(blockRole, pendingAction) {
  if (!pendingAction) return false;
  const def = ACTIONS[pendingAction.type];
  if (!def?.blockable) return false;
  if (def.blockRole) return blockRole === def.blockRole;
  if (def.blockRoles) return def.blockRoles.includes(blockRole);
  return false;
}
