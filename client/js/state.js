export const appState = {
  user: null,
  screen: 'home',
  space: null,
  session: null,
  friends: [],
  publicSpaces: [],
  friendSpaces: [],
  selectedTarget: null,
  toast: null,
};

export function setUser(user) {
  appState.user = user;
}

export function setSpace(space) {
  appState.space = space;
  if (!space) {
    if (!appState.session) appState.screen = 'home';
    return;
  }
  if (space.status === 'active') {
    if (appState.session) appState.screen = 'session';
    else appState.screen = 'waiting';
  } else {
    appState.screen = 'waiting';
  }
}

export function setSession(session) {
  const prev = appState.session;
  appState.session = session;
  if (session && appState.space?.status === 'active') {
    appState.screen = 'session';
  }
  if (!session || session.phase !== 'turn') {
    appState.selectedTarget = null;
  } else if (prev?.activeId !== session.activeId) {
    appState.selectedTarget = null;
  }
}
