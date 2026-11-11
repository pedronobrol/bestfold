// Community backends for "Fly together". The viewer talks to one small interface; two
// implementations exist:
//
//  - httpCommunity():   the hosted web app. Browsers POST improved designs to /api/board, the
//                       server re-simulates each one with the same engine before accepting it, and
//                       everyone polls the board. Entries arrive already verified.
//  - claudeCommunity(): the single-file claude.ai artifact. Uses the artifact's shared document
//                       store and live room; entries arrive unverified and each browser re-simulates
//                       them before trusting them.
//
// Interface:
//   await c.init()                       -> { shared: boolean, note?: string }
//   c.me                                 -> this contributor's id (or null)
//   c.onEntries(cb)                      cb([{ owner, mission, engine, genome, score, at, verified }])
//   await c.submit({ mission, engine, top: [{ genome, score }], evals })
//   c.setPresence({ folding, mission }); c.onPresence(cb(count))
//   c.onBest(cb({ mission, score })); c.announceBest({ mission, score })
//   await c.names(ids)                   -> { id: displayName }

const POLL_MS = 20000;

export function httpCommunity(base = '') {
  const id = (() => {
    try {
      let v = localStorage.getItem('bestfold-id');
      if (!v) { v = 'anon-' + Math.random().toString(36).slice(2, 12); localStorage.setItem('bestfold-id', v); }
      return v;
    } catch { return 'anon-' + Math.random().toString(36).slice(2, 12); }
  })();
  let entriesCb = () => {}, presenceCb = () => {}, bestCb = () => {};
  let presence = { folding: false, mission: null }, lastTop = {};
  const c = {
    me: id,
    async init() {
      try {
        const r = await fetch(`${base}/api/board?mission=distance`, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        poll();
        setInterval(poll, POLL_MS);
        setInterval(beat, POLL_MS);
        return { shared: true };
      } catch {
        return { shared: false, note: 'The shared board is offline right now; your island still runs locally.' };
      }
    },
    onEntries(cb) { entriesCb = cb; },
    onPresence(cb) { presenceCb = cb; },
    onBest(cb) { bestCb = cb; },
    announceBest() { /* the server's board is the announcement; other pages see it on their next poll */ },
    async submit({ mission, engine, top }) {
      for (const t of top.slice(0, 3)) {
        const r = await fetch(`${base}/api/board`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mission, engine, genome: t.genome, claimed: t.score, owner: id }),
        });
        if (r.status === 429) throw Object.assign(new Error('rate limited'), { code: 'rate_limited' });
      }
      poll();
    },
    setPresence(state) { presence = state; beat(); },
    async names(ids) { return Object.fromEntries(ids.map((x) => [x, x === id ? 'You' : 'Someone'])); },
  };
  async function poll() {
    for (const mission of ['distance', 'hangtime']) {
      try {
        const r = await fetch(`${base}/api/board?mission=${mission}`, { cache: 'no-store' });
        if (!r.ok) continue;
        const j = await r.json();
        const entries = (j.entries || []).map((e) => ({ ...e, mission, verified: true }));
        const best = entries.reduce((m, e) => Math.max(m, e.score), 0);
        if (lastTop[mission] !== undefined && best > lastTop[mission] + 1e-6) bestCb({ mission, score: best });
        lastTop[mission] = best;
        entriesCb(entries, mission);
      } catch { /* offline: keep the last board */ }
    }
  }
  async function beat() {
    try {
      const r = await fetch(`${base}/api/presence`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, folding: !!presence.folding, mission: presence.mission }),
      });
      if (r.ok) presenceCb((await r.json()).folding || 0);
    } catch { /* ignore */ }
  }
  return c;
}

export function claudeCommunity() {
  let db = null, user = null, room = null;
  let entriesCb = () => {}, presenceCb = () => {}, bestCb = () => {};
  const docs = new Map();
  const c = {
    me: null,
    async init() {
      const cl = typeof window !== 'undefined' ? window.claude : null;
      [db, user, room] = await Promise.all(['db', 'user', 'room'].map((n) => (cl && cl.use ? cl.use(n).catch(() => null) : Promise.resolve(null))));
      if (user) { try { c.me = await user.id(); } catch { c.me = null; } }
      if (room) {
        room.onPeers((peers) => presenceCb(peers.filter((p) => p.state && p.state.folding).length));
        room.on('best', (d) => { if (d && typeof d.score === 'number') bestCb(d); });
      }
      if (!db) return { shared: false, note: 'Sign in to share results with everyone.' };
      db.collection('islands').onSnapshot((snap) => {
        for (const d of snap.docs) docs.set(d.id, d.data());
        for (const ch of snap.docChanges ? snap.docChanges() : []) if (ch.type === 'removed') docs.delete(ch.doc.id);
        const entries = [];
        for (const [owner, doc] of docs) {
          if (!doc || !Array.isArray(doc.top)) continue;
          for (const e of doc.top.slice(0, 3)) entries.push({ owner, mission: doc.mission, engine: doc.v, genome: e.genome, score: e.score, at: doc.at || 0, verified: false });
        }
        entriesCb(entries);
      }, () => {});
      return { shared: true };
    },
    onEntries(cb) { entriesCb = cb; },
    onPresence(cb) { presenceCb = cb; },
    onBest(cb) { bestCb = cb; },
    announceBest(d) { if (room) room.emit('best', d); },
    async submit({ mission, engine, top, evals }) {
      if (!db || !c.me) throw Object.assign(new Error('not signed in'), { code: 'not_granted' });
      await db.doc('islands/' + c.me).set({ v: engine, mission, top, evals, at: Date.now() });
    },
    setPresence(state) { if (room) room.presence(state); },
    async names(ids) {
      if (!user) return {};
      try {
        const p = await user.profiles(ids);
        return Object.fromEntries(ids.map((x) => [x, x === c.me ? 'You' : (p[x] && p[x].name) || 'Someone']));
      } catch { return {}; }
    },
  };
  return c;
}
