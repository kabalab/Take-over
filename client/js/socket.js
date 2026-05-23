let socket = null;

export function getSocket() {
  return socket;
}

export function connectSocket() {
  if (socket?.connected) return socket;
  socket = io(window.__SOCKET_URL__, { withCredentials: true });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function waitForSocket(timeoutMs = 10000) {
  const s = connectSocket();
  if (s.connected) return Promise.resolve(s);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off('connect', onConnect);
      reject(new Error('Could not connect to server'));
    }, timeoutMs);
    function onConnect() {
      clearTimeout(timer);
      s.off('connect', onConnect);
      resolve(s);
    }
    s.on('connect', onConnect);
  });
}

export function emit(event, payload) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Not connected'));
    socket.emit(event, payload, (res) => {
      if (res?.ok === false) reject(new Error(res.error || 'Request failed'));
      else resolve(res);
    });
  });
}
