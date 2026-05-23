import { auth, friends as friendsApi } from './api.js';
import { connectSocket, emit, waitForSocket } from './socket.js';
import { appState, setUser, setSpace, setSession } from './state.js';
import { Renderer } from './canvas/renderer.js';
import { bindInput } from './canvas/input.js';

const canvas = document.getElementById('main');
const authPanel = document.getElementById('auth-panel');
const renderer = new Renderer(canvas);

appState.shuffleSelection = [];
appState.loseStandingId = null;

let spaceListInterval = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function getViewState() {
  return { ...appState };
}

function loop() {
  renderer.draw(getViewState());
  requestAnimationFrame(loop);
}

async function initAuth() {
  document.querySelectorAll('#auth-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#auth-tabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('signin-form').classList.toggle('hidden', tab !== 'signin');
      document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
    });
  });

  document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const user = await auth.login(fd.get('username'), fd.get('password'));
      await onSignedIn(user);
    } catch (err) {
      document.getElementById('signin-error').textContent = err.message;
    }
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const user = await auth.register(fd.get('username'), fd.get('password'));
      await onSignedIn(user);
    } catch (err) {
      document.getElementById('register-error').textContent = err.message;
    }
  });

  document.getElementById('guest-btn').addEventListener('click', async () => {
    try {
      const user = await auth.guest();
      await onSignedIn(user);
    } catch (err) {
      document.getElementById('guest-error').textContent = err.message;
    }
  });

  try {
    const user = await auth.me();
    await onSignedIn(user);
  } catch {
    authPanel.classList.remove('hidden');
  }
}

async function onSignedIn(user) {
  setUser(user);
  authPanel.classList.add('hidden');
  appState.screen = 'home';
  const sock = connectSocket();
  setupSocket(sock);
  try {
    await waitForSocket();
  } catch (err) {
    showToast(err.message);
  }
  if (!user.isGuest) await loadFriends();
  startSpaceListPolling();
  const saved = localStorage.getItem('to_space');
  if (saved) {
    try {
      const res = await emit('space:join', { code: saved });
      setSpace(res.state);
      stopSpaceListPolling();
    } catch {
      localStorage.removeItem('to_space');
    }
  }
  loop();
}

function setupSocket(sock) {
  sock.on('space:state', (space) => {
    setSpace(space);
  });

  sock.on('session:state', (session) => {
    setSession(session);
    if (appState.space?.code) localStorage.setItem('to_space', appState.space.code);
  });

  sock.on('friends:presence', (list) => {
    appState.friends = list;
  });

  sock.on('connect', async () => {
    if (!appState.user?.isGuest) loadFriends();
    if (appState.screen === 'home') refreshSpaceLists();
    if (
      appState.space?.code &&
      (appState.screen === 'session' || appState.screen === 'waiting')
    ) {
      try {
        const res = await emit('space:join', { code: appState.space.code });
        setSpace(res.state);
      } catch {
        // reconnect sync is best-effort
      }
    }
  });
}

function startSpaceListPolling() {
  stopSpaceListPolling();
  refreshSpaceLists();
  spaceListInterval = setInterval(() => {
    if (appState.screen === 'home') refreshSpaceLists();
  }, 10000);
}

function stopSpaceListPolling() {
  if (spaceListInterval) {
    clearInterval(spaceListInterval);
    spaceListInterval = null;
  }
}

async function refreshSpaceLists() {
  try {
    const pub = await emit('space:listPublic');
    appState.publicSpaces = pub.spaces || [];
    if (!appState.user?.isGuest) {
      const fr = await emit('space:listFriends');
      appState.friendSpaces = fr.spaces || [];
    } else {
      appState.friendSpaces = [];
    }
  } catch {
    // lists refresh silently when offline
  }
}

async function loadFriends() {
  if (appState.user?.isGuest) {
    appState.friends = [];
    return;
  }
  try {
    appState.friends = await friendsApi.list();
  } catch {
    appState.friends = [];
  }
}

async function handleHit(hit) {
  const id = hit.id;
  try {
    if (id === 'signout') {
      await auth.logout();
      location.reload();
      return;
    }
    if (id === 'create-public') {
      const nameInput = prompt('Lobby name (optional)');
      const payload = { visibility: 'public' };
      if (nameInput?.trim()) payload.name = nameInput.trim();
      const res = await emit('space:create', payload);
      setSpace(res.state);
      appState.screen = 'waiting';
      stopSpaceListPolling();
      return;
    }
    if (id === 'create-private') {
      const res = await emit('space:create', { visibility: 'private' });
      setSpace(res.state);
      appState.screen = 'waiting';
      stopSpaceListPolling();
      return;
    }
    if (id === 'create-friends') {
      const res = await emit('space:create', { visibility: 'friends' });
      setSpace(res.state);
      appState.screen = 'waiting';
      stopSpaceListPolling();
      return;
    }
    if (id === 'join-code') {
      const code = prompt('Enter space code');
      if (!code) return;
      const res = await emit('space:join', { code: code.trim().toUpperCase() });
      setSpace(res.state);
      stopSpaceListPolling();
      return;
    }
    if (id === 'add-friend') {
      const username = prompt('Friend username');
      if (!username) return;
      await friendsApi.add(username.trim());
      await loadFriends();
      showToast('Friend added');
      return;
    }
    if (id.startsWith('join-friend-')) {
      const username = id.replace('join-friend-', '');
      const f = appState.friends.find((x) => x.username === username);
      if (f?.spaceCode) {
        const res = await emit('space:join', { code: f.spaceCode });
        setSpace(res.state);
        stopSpaceListPolling();
      }
      return;
    }
    if (id.startsWith('join-friendspace-')) {
      const hostId = id.replace('join-friendspace-', '');
      const res = await emit('space:joinFriends', { hostId });
      setSpace(res.state);
      stopSpaceListPolling();
      return;
    }
    if (id.startsWith('join-public-')) {
      const code = id.replace('join-public-', '');
      const res = await emit('space:join', { code });
      setSpace(res.state);
      stopSpaceListPolling();
      return;
    }
    if (id === 'leave-space') {
      await emit('space:leave');
      localStorage.removeItem('to_space');
      setSpace(null);
      setSession(null);
      appState.screen = 'home';
      appState.selectedTarget = null;
      startSpaceListPolling();
      return;
    }
    if (id === 'copy-code' && appState.space?.code) {
      await navigator.clipboard.writeText(appState.space.code);
      showToast('Code copied');
      return;
    }
    if (id === 'start-session') {
      await emit('session:start');
      return;
    }
    if (id.startsWith('target-')) {
      appState.selectedTarget = hit.data.targetId;
      return;
    }
    if (id.startsWith('action-')) {
      if (hit.data?.disabled && hit.data?.reason) {
        showToast(hit.data.reason);
        return;
      }
      const type = id.replace('action-', '');
      const needsTarget = ['takeover', 'strike', 'seize'].includes(type);
      if (needsTarget && !appState.selectedTarget) {
        showToast('Tap a player first');
        return;
      }
      await emit('session:action', {
        type,
        targetId: needsTarget ? appState.selectedTarget : undefined,
      });
      appState.selectedTarget = null;
      return;
    }
    if (id === 'challenge') {
      await emit('session:challenge');
      return;
    }
    if (id === 'pass') {
      await emit('session:pass');
      return;
    }
    if (id.startsWith('block-')) {
      const role = id.replace('block-', '');
      await emit('session:block', { role });
      return;
    }
    if (id.startsWith('lose-')) {
      await emit('session:loseToken', { cardIndex: hit.data.cardIndex });
      return;
    }
    if (id.startsWith('keep-')) {
      const tid = hit.data.tokenId;
      if (!appState.shuffleSelection) appState.shuffleSelection = [];
      const idx = appState.shuffleSelection.indexOf(tid);
      if (idx >= 0) appState.shuffleSelection.splice(idx, 1);
      else if (appState.shuffleSelection.length < 2) appState.shuffleSelection.push(tid);
      return;
    }
    if (id === 'confirm-shuffle') {
      await emit('session:shufflePick', { keptIds: appState.shuffleSelection });
      appState.shuffleSelection = [];
      return;
    }
  } catch (err) {
    showToast(err.message);
  }
}

bindInput(canvas, renderer, handleHit);
window.addEventListener('resize', () => renderer.resize());
renderer.resize();
initAuth();
