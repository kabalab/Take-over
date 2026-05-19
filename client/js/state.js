export const appState = {
  user: null,
  screen: 'home',
  space: null,
  session: null,
  friends: [],
  publicSpaces: [],
  selectedTarget: null,
  toast: null,
};

export function setUser(user) {
  appState.user = user;
}

export function setSpace(space) {
  appState.space = space;
  if (space?.status === 'active') appState.screen = 'session';
  else if (space) appState.screen = 'waiting';
}

export function setSession(session) {
  appState.session = session;
  if (session) appState.screen = 'session';
}
