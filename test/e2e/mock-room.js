// A stand-in for the claude.ai `room` capability, for browser tests. Pages
// talk through window.__roomSend (a binding the test runner exposes), and
// the runner hands each message to the other pages' window.__roomDeliver.
// It keeps the real API's shape: frozen peers and presence, asynchronous
// first deliveries, `sameTab` for this page only.
(() => {
  const me = Math.random().toString(36).slice(2, 10);
  const rooms = new Map();
  const freeze = o => Object.freeze(o);
  const later = fn => Promise.resolve().then(fn);

  function makeRoom(name) {
    const peers = new Map();
    const peerListeners = new Set();
    const connListeners = new Set();
    let mine = {};
    let left = false;
    const self = () => freeze({ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: freeze({ ...mine }), updatedAt: Date.now() });
    peers.set(me, self());
    const snapshot = () => freeze([...peers.values()]);
    const notify = change => {
      const all = snapshot();
      for (const fn of peerListeners) fn({ peers: all, joined: change.joined || [], left: change.left || [], updated: change.updated || [] });
    };
    const send = msg => window.__roomSend(JSON.stringify({ ...msg, room: name, from: me }));
    const room = {
      name,
      emit: async () => {},
      on: () => () => {},
      async presence(patch) {
        if (left) throw Object.assign(new Error('left'), { code: 'invalid_argument' });
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete mine[k];
          else mine[k] = JSON.parse(JSON.stringify(v));
        }
        if (JSON.stringify(mine).length > 4096) throw Object.assign(new Error('presence over 4 KiB'), { code: 'invalid_argument' });
        const p = self();
        peers.set(me, p);
        later(() => notify({ updated: [p] }));
        send({ type: 'presence', presence: mine });
      },
      peers: snapshot,
      onPeers(handler) {
        peerListeners.add(handler);
        later(() => handler({ peers: snapshot(), joined: snapshot(), left: [], updated: [] }));
        return () => peerListeners.delete(handler);
      },
      connected: () => !left,
      onConnection(handler) {
        connListeners.add(handler);
        later(() => handler(!left));
        return () => connListeners.delete(handler);
      },
      async leave() {
        left = true;
        peerListeners.clear();
        connListeners.clear();
        rooms.delete(name);
        send({ type: 'leave' });
      },
      deliver(msg) {
        if (left) return;
        if (msg.type === 'hello') {
          send({ type: 'presence', presence: mine });
          return;
        }
        if (msg.type === 'leave') {
          const gone = peers.get(msg.from);
          peers.delete(msg.from);
          if (gone) notify({ left: [gone] });
          return;
        }
        if (msg.type === 'presence') {
          const existing = peers.get(msg.from);
          const p = freeze({ peer: msg.from, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: freeze(msg.presence), updatedAt: Date.now() });
          peers.set(msg.from, p);
          notify(existing ? { updated: [p] } : { joined: [p] });
        }
      },
    };
    return room;
  }

  window.__roomDeliver = text => {
    const msg = JSON.parse(text);
    rooms.get(msg.room)?.deliver(msg);
  };

  const namespace = freeze({
    async join(name) {
      if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) throw Object.assign(new Error('bad name'), { code: 'invalid_argument' });
      if (!rooms.has(name)) {
        rooms.set(name, makeRoom(name));
        window.__roomSend(JSON.stringify({ type: 'hello', room: name, from: me }));
      }
      return rooms.get(name);
    },
    connected: () => true,
  });

  window.claude = freeze({ use: name => Promise.resolve(name === 'room' ? namespace : null) });
})();
