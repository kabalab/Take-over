import { config } from '../config.js';
import { buildDeck, draw } from './deck.js';
import { ACTIONS, canDeclareAction, roleBlocksAction } from './rules.js';

const PHASE = {
  turn: 'turn',
  challengeAction: 'challenge_action',
  block: 'block',
  challengeBlock: 'challenge_block',
  loseStanding: 'lose_standing',
  shufflePick: 'shuffle_pick',
  over: 'over',
};

export class Session {
  constructor(participants) {
    this.members = participants.map((p, i) => ({
      id: p.id,
      username: p.username,
      credits: 2,
      tokens: [],
      eliminated: false,
      revealed: [],
      order: i,
    }));
    this.pool = buildDeck(this.members.length);
    for (const m of this.members) {
      m.tokens = draw(this.pool, 2);
    }
    this.turnIndex = 0;
    this.phase = PHASE.turn;
    this.phaseEndsAt = null;
    this.pending = null;
    this.block = null;
    this.challenges = { action: null, block: null };
    this.passed = new Set();
    this.log = [];
    this.winnerId = null;
    this._timer = null;
    this._onTick = null;
    this.standingQueue = [];
    this.afterStandingCallback = null;
    this.loseStandingUserId = null;
    this.shuffleBuffer = null;
    this.setPhase(PHASE.turn, config.turnMs);
  }

  setOnUpdate(fn) {
    this._onTick = fn;
  }

  emitUpdate() {
    if (this._onTick) this._onTick();
  }

  clearTimer() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  setPhase(phase, ms) {
    this.clearTimer();
    this.phase = phase;
    this.phaseEndsAt = ms ? new Date(Date.now() + ms).toISOString() : null;
    if (ms) {
      this._timer = setTimeout(() => this.onPhaseTimeout(), ms);
    }
    this.emitUpdate();
  }

  active() {
    return this.members[this.turnIndex];
  }

  aliveMembers() {
    return this.members.filter((m) => !m.eliminated);
  }

  getMember(id) {
    return this.members.find((m) => m.id === id);
  }

  _requireParticipant(userId) {
    if (!this.getMember(userId)) return 'Not in session';
    return null;
  }

  advanceToActive() {
    const alive = this.aliveMembers();
    if (alive.length <= 1) {
      this.winnerId = alive[0]?.id ?? null;
      this.phase = PHASE.over;
      this.phaseEndsAt = null;
      this._pushLog(alive[0] ? `${alive[0].username} is the last standing` : 'Session ended');
      this.emitUpdate();
      return;
    }
    let idx = this.turnIndex;
    for (let i = 0; i < this.members.length; i++) {
      idx = (idx + 1) % this.members.length;
      if (!this.members[idx].eliminated) break;
    }
    this.turnIndex = idx;
    this.pending = null;
    this.block = null;
    this.challenges = { action: null, block: null };
    this.passed.clear();
  }

  nextTurn() {
    this.advanceToActive();
    if (this.phase !== PHASE.over) {
      this.setPhase(PHASE.turn, config.turnMs);
    }
  }

  _pushLog(msg) {
    this.log.push({ t: Date.now(), msg });
    if (this.log.length > 50) this.log.shift();
  }

  onPhaseTimeout() {
    switch (this.phase) {
      case PHASE.turn:
        this.declareAction(this.active().id, 'collect');
        break;
      case PHASE.challengeAction:
        this.endChallengeAction();
        break;
      case PHASE.block:
        this.endBlockWindow();
        break;
      case PHASE.challengeBlock:
        this.endChallengeBlock();
        break;
      case PHASE.loseStanding:
        this.autoLoseStanding();
        break;
      case PHASE.shufflePick:
        this.autoShufflePick();
        break;
      default:
        break;
    }
  }

  declareAction(userId, type, targetId = null) {
    const participantErr = this._requireParticipant(userId);
    if (participantErr) return participantErr;
    if (this.phase !== PHASE.turn) return 'Wrong phase';
    const actor = this.active();
    if (actor.id !== userId) return 'Not your turn';
    const def = ACTIONS[type];
    if (!def) return 'Unknown action';

    const err = canDeclareAction(actor, type, config);
    if (err) return err;

    if (def.target) {
      if (!targetId) return 'Target required';
      const target = this.getMember(targetId);
      if (!target || target.eliminated) return 'Invalid target';
      if (target.id === actor.id) return 'Cannot target yourself';
    }

    actor.credits -= def.cost;
    this.pending = { type, actorId: actor.id, targetId, claim: def.claim };
    this._pushLog(`${actor.username} declared ${type}`);

    if (def.claim) {
      this.passed.clear();
      this.setPhase(PHASE.challengeAction, config.windowMs);
    } else if (def.blockable) {
      this.passed.clear();
      this.setPhase(PHASE.block, config.windowMs);
    } else {
      this.resolvePending();
    }
    return null;
  }

  _eligiblePassers() {
    const alive = this.aliveMembers();
    if (this.phase === PHASE.challengeAction) {
      const actorId = this.pending?.actorId;
      return alive.filter((m) => m.id !== actorId).map((m) => m.id);
    }
    if (this.phase === PHASE.block) {
      const actorId = this.pending?.actorId;
      return alive.filter((m) => m.id !== actorId).map((m) => m.id);
    }
    if (this.phase === PHASE.challengeBlock) {
      const blockerId = this.block?.userId;
      return alive.filter((m) => m.id !== blockerId).map((m) => m.id);
    }
    return [];
  }

  _allEligiblePassed() {
    const eligible = this._eligiblePassers();
    if (eligible.length === 0) return true;
    return eligible.every((id) => this.passed.has(id));
  }

  pass(userId) {
    const participantErr = this._requireParticipant(userId);
    if (participantErr) return participantErr;
    if (![PHASE.challengeAction, PHASE.challengeBlock, PHASE.block].includes(this.phase)) {
      return 'Cannot pass now';
    }
    const eligible = this._eligiblePassers();
    if (!eligible.includes(userId)) return 'Cannot pass now';
    this.passed.add(userId);
    if (this._allEligiblePassed()) {
      if (this.phase === PHASE.challengeAction) this.endChallengeAction();
      else if (this.phase === PHASE.block) this.endBlockWindow();
      else if (this.phase === PHASE.challengeBlock) this.endChallengeBlock();
    }
    return null;
  }

  challenge(userId, which = 'auto') {
    const participantErr = this._requireParticipant(userId);
    if (participantErr) return participantErr;
    if (this.phase === PHASE.challengeAction) {
      if (this.challenges.action) return 'Already disputed';
      const actor = this.getMember(this.pending.actorId);
      if (userId === actor.id) return 'Cannot dispute yourself';
      if (this.getMember(userId)?.eliminated) return 'Eliminated';
      this.challenges.action = userId;
      return this.resolveChallenge(actor, userId, this.pending.claim, 'action');
    }
    if (this.phase === PHASE.challengeBlock) {
      if (this.challenges.block) return 'Already disputed';
      const blocker = this.getMember(this.block.userId);
      if (userId === blocker.id) return 'Cannot dispute yourself';
      this.challenges.block = userId;
      return this.resolveChallenge(blocker, userId, this.block.role, 'block');
    }
    return 'Wrong phase';
  }

  resolveChallenge(challenged, challengerId, role, kind) {
    const challenger = this.getMember(challengerId);
    const hasRole = challenged.tokens.some((t) => t.role === role);

    if (hasRole) {
      const idx = challenged.tokens.findIndex((t) => t.role === role);
      const revealed = challenged.tokens.splice(idx, 1)[0];
      challenged.revealed.push(revealed.role);
      this.pool.push(revealed);
      this.shufflePool();
      if (this.pool.length) {
        challenged.tokens.push(draw(this.pool, 1)[0]);
      }
      this._pushLog(`${challenged.username} proved ${role}; ${challenger.username} loses standing`);
      this.afterStandingLoss(() => {
        if (kind === 'action') this._afterActionChallenge();
        else {
          this._pushLog('Counter stands — action cancelled');
          this.pending = null;
          this.block = null;
          this.nextTurn();
        }
      }, challengerId);
    } else {
      this._pushLog(`${challenged.username} could not prove ${role}`);
      if (kind === 'action') {
        this.pending = null;
        this.afterStandingLoss(() => this.nextTurn(), challenged.id);
      } else {
        this.block = null;
        this.afterStandingLoss(() => this.resolvePending(), challenged.id);
      }
    }
    return null;
  }

  _afterActionChallenge() {
    const def = ACTIONS[this.pending?.type];
    if (def?.blockable) {
      this.passed.clear();
      this.setPhase(PHASE.block, config.windowMs);
    } else {
      this.resolvePending();
    }
  }

  shufflePool() {
    for (let i = this.pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.pool[i], this.pool[j]] = [this.pool[j], this.pool[i]];
    }
  }

  endChallengeAction() {
    const def = ACTIONS[this.pending.type];
    if (def.blockable) {
      this.setPhase(PHASE.block, config.windowMs);
    } else {
      this.resolvePending();
    }
  }

  block(userId, blockRole) {
    const participantErr = this._requireParticipant(userId);
    if (participantErr) return participantErr;
    if (this.phase !== PHASE.block) return 'Wrong phase';
    const def = ACTIONS[this.pending.type];
    const target = this.getMember(this.pending.targetId);
    if (def.target && target?.id !== userId) return 'Only target can counter';
    if (this.pending.type === 'support') {
      if (userId === this.pending.actorId) return 'Cannot counter your own support';
    }
    if (!roleBlocksAction(blockRole, this.pending)) return 'Invalid counter role';
    if (this.getMember(userId)?.eliminated) return 'Eliminated';

    this.block = { userId, role: blockRole };
    this._pushLog(`${this.getMember(userId).username} countered with ${blockRole}`);
    this.passed.clear();
    this.setPhase(PHASE.challengeBlock, config.windowMs);
    return null;
  }

  endBlockWindow() {
    if (this.block) {
      this._pushLog('Counter stands — action cancelled');
      this.pending = null;
      this.block = null;
      this.nextTurn();
    } else {
      this.resolvePending();
    }
  }

  endChallengeBlock() {
    if (this.block) {
      this._pushLog('Counter stands — action cancelled');
      this.pending = null;
      this.block = null;
      this.nextTurn();
    } else {
      this.resolvePending();
    }
  }

  resolvePending() {
    const p = this.pending;
    if (!p) {
      this.nextTurn();
      return;
    }
    const actor = this.getMember(p.actorId);
    const def = ACTIONS[p.type];

    switch (p.type) {
      case 'collect':
        actor.credits += 1;
        break;
      case 'support':
        actor.credits += 2;
        break;
      case 'levy':
        actor.credits += 3;
        break;
      case 'takeover': {
        const target = this.getMember(p.targetId);
        this.afterStandingLoss(() => this.nextTurn(), target.id);
        return;
      }
      case 'strike': {
        const target = this.getMember(p.targetId);
        this.afterStandingLoss(() => this.nextTurn(), target.id);
        return;
      }
      case 'seize': {
        const target = this.getMember(p.targetId);
        const amount = Math.min(2, target.credits);
        target.credits -= amount;
        actor.credits += amount;
        break;
      }
      case 'shuffle':
        this._startShufflePick(actor);
        return;
      default:
        break;
    }
    this.pending = null;
    this.nextTurn();
  }

  _startShufflePick(actor) {
    const drawn = draw(this.pool, 2);
    this.shuffleBuffer = { actorId: actor.id, drawn, hand: [...actor.tokens] };
    actor.tokens = [];
    this.setPhase(PHASE.shufflePick, config.windowMs);
  }

  shufflePick(userId, keptIds) {
    const participantErr = this._requireParticipant(userId);
    if (participantErr) return participantErr;
    if (this.phase !== PHASE.shufflePick) return 'Wrong phase';
    if (!this.shuffleBuffer || this.shuffleBuffer.actorId !== userId) return 'Not your turn';
    const { drawn, hand } = this.shuffleBuffer;
    const combined = [...hand, ...drawn];
    if (!Array.isArray(keptIds) || keptIds.length !== 2) return 'Select exactly 2 tokens';
    const kept = [];
    for (const id of keptIds) {
      const t = combined.find((c) => c.id === id);
      if (!t) return 'Invalid token';
      kept.push(t);
    }
    const returnCards = combined.filter((c) => !keptIds.includes(c.id));
    const actor = this.getMember(userId);
    actor.tokens = kept;
    this.pool.push(...returnCards);
    this.shufflePool();
    this.shuffleBuffer = null;
    this.pending = null;
    this.nextTurn();
    return null;
  }

  autoShufflePick() {
    if (!this.shuffleBuffer) return;
    const { actorId, drawn, hand } = this.shuffleBuffer;
    const combined = [...hand, ...drawn];
    const kept = combined.slice(0, 2);
    const rest = combined.slice(2);
    const actor = this.getMember(actorId);
    actor.tokens = kept;
    this.pool.push(...rest);
    this.shufflePool();
    this.shuffleBuffer = null;
    this.pending = null;
    this.nextTurn();
  }

  afterStandingLoss(cb, ...userIds) {
    for (const id of userIds) {
      if (id && !this.standingQueue.includes(id)) this.standingQueue.push(id);
    }
    this.afterStandingCallback = cb;
    this._processStandingQueue();
  }

  _processStandingQueue() {
    if (this.standingQueue.length === 0) {
      const cb = this.afterStandingCallback;
      this.afterStandingCallback = null;
      if (cb) cb();
      return;
    }
    const userId = this.standingQueue.shift();
    const m = this.getMember(userId);
    if (!m || m.eliminated || m.tokens.length === 0) {
      this._processStandingQueue();
      return;
    }
    if (m.tokens.length === 1) {
      this._loseToken(m, 0);
      this._processStandingQueue();
      return;
    }
    this.loseStandingUserId = userId;
    this.setPhase(PHASE.loseStanding, config.windowMs);
  }

  loseStanding(userId, cardIndex) {
    const participantErr = this._requireParticipant(userId);
    if (participantErr) return participantErr;
    if (this.phase !== PHASE.loseStanding) return 'Wrong phase';
    if (this.loseStandingUserId !== userId) return 'Not your selection';
    const m = this.getMember(userId);
    if (cardIndex < 0 || cardIndex >= m.tokens.length) return 'Invalid token';
    this._loseToken(m, cardIndex);
    this._processStandingQueue();
    return null;
  }

  autoLoseStanding() {
    const m = this.getMember(this.loseStandingUserId);
    if (m && m.tokens.length) {
      const idx = Math.floor(Math.random() * m.tokens.length);
      this._loseToken(m, idx);
    }
    this._processStandingQueue();
  }

  _loseToken(member, index) {
    const [removed] = member.tokens.splice(index, 1);
    member.revealed.push(removed.role);
    this._pushLog(`${member.username} lost ${removed.role}`);
    if (member.tokens.length === 0) {
      member.eliminated = true;
      this._pushLog(`${member.username} eliminated`);
    }
    this.checkWinner();
  }

  checkWinner() {
    const alive = this.aliveMembers();
    if (alive.length === 1) {
      this.winnerId = alive[0].id;
      this.phase = PHASE.over;
      this.clearTimer();
      this.phaseEndsAt = null;
      this._pushLog(`${alive[0].username} is the last standing`);
      this.emitUpdate();
    }
  }

  getView(userId, { spectator = false, eliminatedSpectator = false } = {}) {
    const me = this.getMember(userId);
    const showAll = spectator || (me?.eliminated && eliminatedSpectator);

    return {
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      loseStandingUserId: this.phase === PHASE.loseStanding ? this.loseStandingUserId : null,
      activeId: this.active()?.id,
      pending: this.pending,
      block: this.block,
      winnerId: this.winnerId,
      log: this.log.slice(-20),
      shufflePick: this.phase === PHASE.shufflePick && this.shuffleBuffer?.actorId === userId
        ? {
            options: [...(this.shuffleBuffer.hand || []), ...(this.shuffleBuffer.drawn || [])].map((t) => ({
              id: t.id,
              role: t.role,
            })),
          }
        : null,
      you: me
        ? {
            id: me.id,
            credits: me.credits,
            tokens: me.tokens.map((t) => ({ id: t.id, role: t.role })),
            eliminated: me.eliminated,
          }
        : spectator
          ? { spectator: true }
          : null,
      members: this.members.map((m) => ({
        id: m.id,
        username: m.username,
        credits: m.credits,
        tokenCount: m.tokens.length,
        eliminated: m.eliminated,
        revealed: m.revealed,
        tokens: showAll ? m.tokens.map((t) => ({ id: t.id, role: t.role })) : undefined,
      })),
      allowed: this._allowedActions(userId),
    };
  }

  _allowedActions(userId) {
    const actor = this.active();
    if (this.phase !== PHASE.turn || !actor || actor.id !== userId) return [];
    const opts = [];
    for (const type of Object.keys(ACTIONS)) {
      if (!canDeclareAction(actor, type, config)) continue;
      opts.push(type);
    }
    return opts;
  }
}
