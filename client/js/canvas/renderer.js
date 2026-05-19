const ROLE_LABELS = {
  director: 'Director',
  agent: 'Agent',
  shield: 'Shield',
  liaison: 'Liaison',
  chief: 'Chief',
};

const ACTION_LABELS = {
  collect: 'Collect',
  support: 'Support',
  takeover: 'Takeover',
  levy: 'Levy',
  strike: 'Strike',
  seize: 'Seize',
  shuffle: 'Shuffle',
};

const ROLE_COLORS = {
  director: '#6f42c1',
  agent: '#d73a49',
  shield: '#e36209',
  liaison: '#22863a',
  chief: '#0366d6',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.hitRegions = [];
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = w;
    this.height = h;
  }

  clear() {
    this.ctx.fillStyle = '#0d1117';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.hitRegions = [];
  }

  addHit(id, x, y, w, h, data = {}) {
    this.hitRegions.push({ id, x, y, w, h, data });
  }

  hitTest(px, py) {
    for (let i = this.hitRegions.length - 1; i >= 0; i--) {
      const r = this.hitRegions[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r;
    }
    return null;
  }

  draw(state) {
    this.clear();
    if (!state.user) return;

    switch (state.screen) {
      case 'home':
        this.drawHome(state);
        break;
      case 'waiting':
        this.drawWaiting(state);
        break;
      case 'session':
        this.drawSession(state);
        break;
      default:
        this.drawHome(state);
    }
  }

  text(str, x, y, opts = {}) {
    const ctx = this.ctx;
    ctx.fillStyle = opts.color || '#e6edf3';
    ctx.font = opts.font || '16px Segoe UI, system-ui, sans-serif';
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'top';
    ctx.fillText(str, x, y);
  }

  button(id, label, x, y, w, h, { disabled = false, primary = false } = {}) {
    const ctx = this.ctx;
    ctx.fillStyle = disabled ? '#21262d' : primary ? '#238636' : '#21262d';
    ctx.strokeStyle = disabled ? '#30363d' : primary ? '#2ea043' : '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = disabled ? '#484f58' : '#e6edf3';
    ctx.font = '14px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    if (!disabled) this.addHit(id, x, y, w, h);
  }

  drawHome(state) {
    const { width: w, height: h } = this;
    this.text('Take Over', w / 2, 40, { align: 'center', font: 'bold 28px Segoe UI', color: '#58a6ff' });
    this.text(`Signed in as ${state.user.username}`, w / 2, 80, { align: 'center', color: '#8b949e' });

    let y = 120;
    this.button('create-public', 'New public space', 40, y, 200, 40, { primary: true });
    this.button('create-private', 'New private space', 260, y, 200, 40);
    y += 56;
    this.button('join-code', 'Join with code', 40, y, 200, 40);
    this.button('list-public', 'Browse public spaces', 260, y, 200, 40);
    y += 56;
    this.text('Friends', 40, y, { font: 'bold 18px Segoe UI' });
    y += 28;
    this.button('add-friend', '+ Add friend', 40, y, 140, 32);
    y += 40;

    for (const f of state.friends.slice(0, 8)) {
      const online = f.online ? '●' : '○';
      this.text(`${online} ${f.username}${f.spaceCode ? ` — ${f.spaceCode}` : ''}`, 40, y, {
        color: f.online ? '#3fb950' : '#8b949e',
      });
      if (f.spaceCode) {
        this.button(`join-friend-${f.username}`, 'Join', w - 120, y - 4, 80, 28, { primary: true });
      }
      y += 32;
    }

    if (state.publicSpaces?.length) {
      y += 16;
      this.text('Public spaces', 40, y, { font: 'bold 18px Segoe UI' });
      y += 28;
      for (const sp of state.publicSpaces.slice(0, 5)) {
        this.text(`${sp.code} — ${sp.members.filter((m) => !m.spectator).length} members`, 40, y);
        this.button(`join-public-${sp.code}`, 'Join', w - 120, y - 4, 80, 28);
        y += 32;
      }
    }

    this.button('signout', 'Sign out', w - 120, h - 50, 100, 36);
  }

  drawWaiting(state) {
    const space = state.space;
    if (!space) return;
    const { width: w } = this;
    this.text(`Space ${space.code}`, w / 2, 40, { align: 'center', font: 'bold 24px Segoe UI' });
    this.text(space.visibility === 'private' ? 'Private' : 'Public', w / 2, 72, { align: 'center', color: '#8b949e' });

    let y = 120;
    this.text('Members', 40, y, { font: 'bold 18px Segoe UI' });
    y += 28;
    for (const m of space.members) {
      const host = m.userId === space.hostId ? ' (host)' : '';
      this.text(`${m.username}${host}${m.spectator ? ' [observer]' : ''}`, 40, y);
      y += 28;
    }

    if (space.hostId === state.user.id && space.status === 'waiting') {
      this.button('start-session', 'Begin', 40, y + 16, 160, 44, { primary: true });
    }
    this.button('leave-space', 'Leave', 40, this.height - 60, 120, 40);
    this.button('copy-code', 'Copy code', 180, this.height - 60, 120, 40);
  }

  drawSession(state) {
    const s = state.session;
    if (!s) return;
    const { width: w, height: h } = this;
    const me = s.you;
    const secs = s.phaseEndsAt ? Math.max(0, Math.ceil((new Date(s.phaseEndsAt) - Date.now()) / 1000)) : null;

    this.text(`Phase: ${s.phase.replace(/_/g, ' ')}${secs != null ? ` — ${secs}s` : ''}`, 20, 16, {
      font: '14px Segoe UI',
      color: '#8b949e',
    });

    const cx = w / 2;
    const cy = h / 2 - 40;
    const radius = Math.min(w, h) * 0.32;
    const members = s.members.filter((m) => !m.eliminated || m.id === me?.id);
    const n = s.members.length;

    s.members.forEach((m, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      const active = m.id === s.activeId;
      this.ctx.fillStyle = active ? '#238636' : '#21262d';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 36, 0, Math.PI * 2);
      this.ctx.fill();
      this.text(m.username, x, y - 8, { align: 'center', font: '12px Segoe UI' });
      this.text(`${m.credits} cr`, x, y + 8, { align: 'center', font: '11px Segoe UI', color: '#8b949e' });
      for (let t = 0; t < m.tokenCount; t++) {
        this.ctx.fillStyle = '#30363d';
        this.ctx.fillRect(x - 20 + t * 14, y + 22, 12, 18);
      }
      if (state.selectedTarget === m.id) {
        this.ctx.strokeStyle = '#58a6ff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
      if (!m.eliminated && m.id !== me?.id && s.phase === 'turn' && me?.id === s.activeId) {
        this.addHit(`target-${m.id}`, x - 40, y - 40, 80, 80, { targetId: m.id });
      }
    });

    if (me?.tokens?.length) {
      const y0 = h - 120;
      this.text('Your tokens', 20, y0 - 24, { font: 'bold 14px Segoe UI' });
      me.tokens.forEach((t, i) => {
        this.drawToken(t, 20 + i * 90, y0, true, `token-${i}`);
      });
      this.text(`Credits: ${me.credits}`, 20, y0 + 70, { color: '#d29922' });
    }

    const logY = cy - 60;
    this.text('Activity', cx - 80, logY, { align: 'center', font: '12px Segoe UI', color: '#8b949e' });
    (s.log || []).slice(-4).forEach((entry, i) => {
      this.text(entry.msg, cx - 140, logY + 18 + i * 16, {
        align: 'center',
        font: '11px Segoe UI',
        color: '#8b949e',
      });
    });

    if (s.phase === 'turn' && me?.id === s.activeId && !me.eliminated) {
      this.drawActionBar(state);
    } else if (['challenge_action', 'challenge_block'].includes(s.phase)) {
      this.button('challenge', 'Dispute', w - 200, h - 60, 90, 40, { primary: true });
      this.button('pass', 'Pass', w - 100, h - 60, 80, 40);
    } else if (s.phase === 'block') {
      this.drawBlockBar(state);
    } else if (s.phase === 'lose_standing' && s.loseStandingUserId === me?.id) {
      me.tokens.forEach((t, i) => {
        this.drawToken(t, 20 + i * 90, h - 140, true, `lose-${i}`);
      });
    } else if (s.phase === 'shuffle_pick' && s.shufflePick) {
      let x = 20;
      for (const t of s.shufflePick.options) {
        this.drawToken(t, x, h - 140, true, `keep-${t.id}`);
        x += 90;
      }
      this.button('confirm-shuffle', 'Confirm selection', w / 2 - 80, h - 50, 160, 36, {
        primary: state.shuffleSelection?.length === 2,
        disabled: (state.shuffleSelection?.length || 0) !== 2,
      });
    }

    this.button('leave-space', 'Leave', 20, h - 50, 90, 36);
  }

  drawToken(token, x, y, faceUp, hitId) {
    const ctx = this.ctx;
    ctx.fillStyle = faceUp ? ROLE_COLORS[token.role] || '#30363d' : '#161b22';
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, 70, 100, 8);
    ctx.fill();
    ctx.stroke();
    if (faceUp) {
      this.text(ROLE_LABELS[token.role] || token.role, x + 35, y + 45, {
        align: 'center',
        font: '12px Segoe UI',
        color: '#fff',
      });
    }
    if (hitId) this.addHit(hitId, x, y, 70, 100, { tokenId: token.id, cardIndex: parseInt(hitId.split('-')[1], 10) });
  }

  drawActionBar(state) {
    const s = state.session;
    const allowed = new Set(s.allowed || []);
    const actions = ['collect', 'support', 'levy', 'strike', 'seize', 'shuffle', 'takeover'];
    let x = 20;
    const y = this.height - 200;
    for (const a of actions) {
      const ok = allowed.has(a);
      const needsTarget = ['takeover', 'strike', 'seize'].includes(a);
      const disabled = !ok || (needsTarget && !state.selectedTarget);
      this.button(`action-${a}`, ACTION_LABELS[a], x, y, 88, 36, { disabled, primary: ok && !disabled });
      x += 96;
      if (x > this.width - 100) {
        x = 20;
      }
    }
  }

  drawBlockBar(state) {
    const s = state.session;
    const p = s.pending;
    if (!p) return;
    const roles =
      p.type === 'support'
        ? ['director']
        : p.type === 'strike'
          ? ['shield']
          : ['chief', 'liaison'];
    let x = 20;
    const y = this.height - 120;
    for (const r of roles) {
      this.button(`block-${r}`, `Counter: ${ROLE_LABELS[r]}`, x, y, 140, 40, { primary: true });
      x += 150;
    }
    this.button('pass', 'Pass', x, y, 80, 40);
  }
}
