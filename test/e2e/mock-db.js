// Stand-ins for the claude.ai `db`, `user` and `downloads` capabilities, for
// browser tests. The documents live in the test runner (shared by every page
// in a scenario) and pages reach them through window.__dbCall, a binding
// the runner exposes. Subscriptions poll, like the real store's fallback.
// window.__mockUser ({id, name}) is set by the runner before this runs.
(() => {
  const freeze = o => Object.freeze(o);
  const call = async req => {
    const res = JSON.parse(await window.__dbCall(JSON.stringify(req)));
    if (res.error) throw Object.assign(new Error(res.error), { code: res.error });
    return res.value;
  };
  const docSnap = (path, d) => freeze({ id: path.split('/').pop(), exists: d !== null, data: () => (d === null ? undefined : JSON.parse(JSON.stringify(d))), metadata: { fromCache: false, hasPendingWrites: false } });
  const querySnap = rows => {
    const docs = rows.map(r => docSnap(r.path, r.data));
    return freeze({ docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((doc, i) => ({ type: 'added', doc, oldIndex: -1, newIndex: i })), metadata: { fromCache: false, hasPendingWrites: false } });
  };
  // Polls `read` and calls `next` whenever the answer changes.
  function poll(read, make, next, error) {
    let last = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const value = await read();
        const text = JSON.stringify(value);
        if (text !== last) {
          last = text;
          next(make(value));
        }
      } catch (e) {
        error?.(e);
      }
      if (!stopped) setTimeout(tick, 150);
    };
    tick();
    return () => (stopped = true);
  }
  const segments = path => path.split('/').filter(Boolean);
  function docRef(path) {
    if (segments(path).length % 2) throw new TypeError(`document path needs an even number of segments: ${path}`);
    return freeze({
      id: segments(path).pop(),
      path,
      get: () => call({ op: 'get', path }).then(d => docSnap(path, d)),
      set: data => call({ op: 'set', path, data }),
      update: data => call({ op: 'update', path, data }),
      delete: () => call({ op: 'delete', path }),
      acquire: options => call({ op: 'acquire', path, holder: options.holder, ttlMs: options.ttlMs || 30000 }),
      onSnapshot: (next, error) => poll(() => call({ op: 'get', path }), d => docSnap(path, d), next, error),
      collection: sub => collectionRef(`${path}/${sub}`),
    });
  }
  function query(path, spec) {
    return freeze({
      where: (field, op, value) => query(path, { ...spec, where: [...spec.where, [field, op, value]] }),
      orderBy: (field, dir = 'asc') => query(path, { ...spec, orderBy: [field, dir] }),
      limit: n => query(path, { ...spec, limit: n }),
      get: () => call({ op: 'query', path, spec }).then(querySnap),
      onSnapshot: (next, error) => poll(() => call({ op: 'query', path, spec }), querySnap, next, error),
    });
  }
  function collectionRef(path) {
    if (segments(path).length % 2 === 0) throw new TypeError(`collection path needs an odd number of segments: ${path}`);
    const q = query(path, { where: [], orderBy: null, limit: null });
    return freeze({
      ...q,
      path,
      doc: id => docRef(`${path}/${id || Math.random().toString(36).slice(2, 12)}`),
      add: async data => {
        const ref = docRef(`${path}/${Math.random().toString(36).slice(2, 12)}`);
        await ref.set(data);
        return ref;
      },
    });
  }
  const db = freeze({ doc: docRef, collection: collectionRef });

  const me = window.__mockUser || { id: null, name: '' };
  const user = freeze({
    id: async () => me.id,
    name: async () => me.name,
    isOwner: async () => true,
    canEdit: async () => true,
    can: async () => true,
    me: async () => ({ id: me.id, name: me.name, avatarUrl: 'data:,', color: '#888', email: null, isOwner: true, canEdit: true }),
    profiles: async ids => {
      const names = await call({ op: 'names', ids: [].concat(ids) });
      return Object.fromEntries([].concat(ids).map(id => [id, { id, name: names[id] || '', avatarUrl: 'data:,', color: '#888', email: null, isMe: id === me.id, guest: false }]));
    },
  });

  window.__downloaded = [];
  const downloads = freeze({
    save: async ({ filename, data }) => {
      window.__downloaded.push({ filename, size: data?.size ?? data?.length ?? 0 });
      return { status: 'saved' };
    },
  });

  window.__mocks = { ...(window.__mocks || {}), db, user, downloads };
  window.claude = freeze({ use: name => Promise.resolve(window.__mocks[name] || null) });
})();
