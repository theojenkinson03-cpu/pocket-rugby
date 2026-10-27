// Online play on two phones. Each phone keeps the whole match and shares
// only its own moves: the action and the random numbers its dice used. The
// other phone replays each move through the same rules engine, so both stay
// identical and a move that breaks the rules is refused.
//
// Moves travel in each player's room "presence" (a small object the room
// shares with everyone in it and re-sends to anyone who reconnects), so no
// stored data or edit rights are needed.

import { act, actingTeam, isLegal, newMatch } from './engine.js';

export const PROTOCOL = 1;
export const LOG_KEEP = 24;
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeCode(rng = Math.random) {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');
}

export const normaliseCode = text => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
export const validCode = code => code.length === 6 && [...code].every(c => CODE_ALPHABET.includes(c));
export const roomName = code => `pocket-rugby-${code}`;

// A random number from the browser's cryptographic source when there is one.
export function strongRandom() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  return Math.random();
}

// Wraps a random source and keeps every value it hands out. Values are cut
// to six decimal places before use, so they travel short and the other phone
// replays exactly the numbers this phone played.
export function recordingRng(source = strongRandom) {
  const used = [];
  const rng = () => {
    const v = Math.floor(source() * 1e6) / 1e6;
    used.push(v);
    return v;
  };
  rng.used = used;
  return rng;
}

function replayRng(values) {
  let i = 0;
  const rng = () => {
    if (i >= values.length) throw new Error('move ran out of dice');
    return values[i++];
  };
  rng.consumed = () => i;
  return rng;
}

export function encodeAction(action) {
  if (action.type === 'roll') return { t: 'r' };
  if (action.type === 'continue') return { t: 'n' };
  return { t: 'c', v: action.value };
}

export function decodeAction(a) {
  if (a?.t === 'r') return { type: 'roll' };
  if (a?.t === 'n') return { type: 'continue' };
  if (a?.t === 'c' && typeof a.v === 'string') return { type: 'choose', value: a.v };
  return null;
}

// 32-bit FNV-1a over the match, leaving out who controls which side (the
// one thing that differs between the two phones).
export function hashState(match) {
  const { controllers, ...shared } = match;
  const text = JSON.stringify(shared);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// The starting match both phones build from the host's kick-off message.
// The host is team 0; the guest is team 1 and calls the toss.
export function startingMatch(start, myRole) {
  const host = myRole === 'host';
  return newMatch({
    mode: 'online',
    teams: start.teams,
    length: start.length,
    cards: start.cards,
    tossCaller: 1,
    controllers: host ? ['human', 'remote'] : ['remote', 'human'],
  });
}

// Checks and applies one move from the other phone. Returns
// {ok: true, state, events} or {ok: false, reason}.
export function applyRemote(match, entry, remoteTeam) {
  if (!entry || entry.s !== match.seq) return { ok: false, reason: 'out of order' };
  if (actingTeam(match) !== remoteTeam) return { ok: false, reason: 'not their turn' };
  const action = decodeAction(entry.a);
  if (!action || !isLegal(match, action)) return { ok: false, reason: 'illegal move' };
  const values = entry.r;
  if (!Array.isArray(values) || values.length > 8 || !values.every(v => typeof v === 'number' && v >= 0 && v < 1)) {
    return { ok: false, reason: 'bad dice' };
  }
  try {
    const rng = replayRng(values);
    const { state, events } = act(match, action, rng);
    if (rng.consumed() !== values.length) return { ok: false, reason: 'bad dice' };
    return { ok: true, state, events };
  } catch {
    return { ok: false, reason: 'bad dice' };
  }
}

// The next moves to apply from the other phone's log, in order, stopping at
// the first gap or refusal.
export function pendingEntries(match, log) {
  if (!Array.isArray(log)) return [];
  const bySeq = new Map(log.filter(e => e && Number.isInteger(e.s)).map(e => [e.s, e]));
  const out = [];
  for (let s = match.seq; bySeq.has(s); s++) out.push(bySeq.get(s));
  return out;
}

// ---- Session: one phone's place in a named room -----------------------------

const sanitiseTeam = team => ({
  name: String(team?.name || 'Visitors').slice(0, 14),
  color: /^#[0-9a-f]{6}$/i.test(team?.color) ? team.color : '#4aa2df',
  roster: team?.roster && typeof team.roster === 'object'
    ? Object.fromEntries(['S', 'F', 'C', 'W', 'B'].map(p => [p, String(team.roster[p] || '').slice(0, 20)]))
    : null,
});

export class OnlineSession {
  // room: the `room` capability; build: this page's version, which both phones must share.
  constructor({ room, code, role, team, build, log = [], onChange }) {
    this.room = room;
    this.code = code;
    this.role = role;
    this.team = sanitiseTeam(team);
    this.build = build;
    this.log = log;
    this.onChange = onChange;
    this.named = null;
    this.peer = null;
    this.connected = false;
    this.presence = { app: 'pocket-rugby', v: PROTOCOL, build, role, team: this.team, ready: role === 'guest', log: this.log };
  }

  async join() {
    this.named = await this.room.join(roomName(this.code));
    this.left = false;
    // A room lost after a reconnect can be joined again, unless we may not.
    const lost = e => {
      if (this.left) return;
      if (e?.code === 'not_permitted' || this.retries >= 5) return this.fail(e?.code || 'lost');
      this.retries = (this.retries || 0) + 1;
      this.connected = false;
      this.onChange?.('connection');
      setTimeout(() => this.rejoin(), 1500 * this.retries);
    };
    this.stopPeers = this.named.onPeers(change => this.readPeers(change.peers), lost);
    this.stopConn = this.named.onConnection(on => {
      this.connected = on;
      if (on) this.retries = 0;
      this.onChange?.('connection');
    }, lost);
    await this.named.presence(this.presence);
    this.readPeers(this.named.peers());
  }

  async rejoin() {
    if (this.left) return;
    this.stopPeers?.();
    this.stopConn?.();
    try {
      await this.join();
    } catch (e) {
      this.fail(e?.code || 'lost');
    }
  }

  fail(reason) {
    this.error = reason;
    this.onChange?.('error');
  }

  // The other player: the most recent peer in the other role on this page
  // version. Only this tab is left out, so one account can play itself on
  // two phones.
  readPeers(peers) {
    const theirs = peers
      .filter(p => !p.sameTab && p.presence?.app === 'pocket-rugby' && p.presence.role === (this.role === 'host' ? 'guest' : 'host'))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
    const before = this.raw;
    this.raw = theirs?.presence || null;
    if (this.raw === before) return;
    this.peer = theirs ? { ...theirs.presence, team: sanitiseTeam(theirs.presence.team), peer: theirs.peer } : null;
    this.onChange?.('peer');
  }

  get opponentPresent() {
    return !!this.peer;
  }

  get versionMismatch() {
    return !!this.peer && (this.peer.v !== PROTOCOL || this.peer.build !== this.build);
  }

  async publish(patch) {
    Object.assign(this.presence, patch);
    try {
      await this.named?.presence(patch);
    } catch {
      this.fail('send');
    }
  }

  // Host: set the match up and kick it off. Every match has its own id,
  // `mid`, sent with each phone's moves so a rematch never picks up moves
  // from the match before.
  kickOff({ length, cards, guestTeam, rng = strongRandom }) {
    const mid = makeCode(rng);
    this.log = [];
    const start = { mid, length, cards, teams: [this.team, sanitiseTeam(guestTeam)] };
    return this.publish({ start, mid, log: [], seq: 0, hash: null }).then(() => start);
  }

  // Guest: the host's match has begun; start an empty log for it.
  beginGuest(mid) {
    this.log = [];
    return this.publish({ mid, log: [], seq: 0, hash: null });
  }

  // After a move this phone made: share it.
  shareMove(match, entry) {
    this.log = [...this.log, entry].slice(-LOG_KEEP);
    return this.publish({ log: this.log, seq: match.seq, hash: hashState(match) });
  }

  // Tell the other phone where this one has got to (after applying their move).
  shareProgress(match) {
    return this.publish({ seq: match.seq, hash: hashState(match) });
  }

  async leave() {
    this.left = true;
    this.stopPeers?.();
    this.stopConn?.();
    try {
      await this.named?.leave();
    } catch {
      // Already gone.
    }
    this.named = null;
  }
}
