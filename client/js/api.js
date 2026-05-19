const base = () => window.__API_URL__;

export async function api(path, options = {}) {
  const res = await fetch(`${base()}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const auth = {
  register: (username, password) =>
    api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username, password) =>
    api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  me: () => api('/api/auth/me'),
};

export const friends = {
  list: () => api('/api/friends'),
  add: (username) => api('/api/friends', { method: 'POST', body: JSON.stringify({ username }) }),
  remove: (username) => api(`/api/friends/${encodeURIComponent(username)}`, { method: 'DELETE' }),
};
