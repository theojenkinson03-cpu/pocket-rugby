// Online play: the move format, the checks on the other phone's moves, and
// whole matches between two "phones" talking through an in-memory room that
// behaves like the real one (frozen presence, re-sent to whoever joins).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, actingTeam, controllerOf, isLegal, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import {
  applyRemote, decodeAction, encodeAction, hashState, LOG_KEEP, makeCode, normaliseCode, OnlineSession, pendingEntries,
  PROTOCOL, recordingRng, roomName, startingMatch, validCode,
} from '../js/online.js';
import { randomRoster } from '../js/players.js';

test('codes: six easy-to-read characters, typed any way you like', () => {
  const rng = seededRng(3);
  for (let i = 0; i < 500; i++) {
    const code = makeCode(rng);
    assert.ok(validCode(code), code);
    assert.doesNotMatch(code, /[01ilo]/, 'no characters that look alike');
    assert.match(roomName(code), /^[a-z0-9][a-z0-9_.-]{0,47}$/, 'a valid room name');
  }
  assert.equal(normaliseCode(' K7mP-2q '), 'k7mp2q');
  assert.equal(normaliseCode('k7mp2qxx'), 'k7mp2q');
  assert.ok(!validCode('k7mp2'));
  assert.ok(!validCode('k7mp2o'), 'o is not in the alphabet');
});

test('actions travel small and come back the same', () => {
  for (const a of [{ type: 'roll' }, { type: 'continue' }, { type: 'choose', value: 'tails' }, { type: 'choose', value: 'sure-hands' }]) {
    assert.deepEqual(decodeAction(JSON.parse(JSON.stringify(encodeAction(a)))), a);
  }
  for (const bad of [null, {}, { t: 'x' }, { t: 'c' }, { t: 'c', v: 3 }]) assert.equal(decodeAction(bad), null);
});

test('the recording dice keep what they used, cut to six places', () => {
  const rng = recordingRng(() => 0.123456789);
  assert.equal(rng(), 0.123456);
  assert.equal(rng(), 0.123456);
  assert.deepEqual(rng.used, [0.123456, 0.123456]);
  const top = recordingRng(() => 0.9999999999);
  assert.ok(top() < 1);
});

const START = { mid: 'abc123', length: 'quick', cards: true, teams: [{ name: 'Ravens', color: '#1d3577', roster: randomRoster() }, { name: 'Gulls', color: '#c62a2f', roster: null }] };

test('both phones build the same match; the guest calls the toss', () => {
  const host = startingMatch(START, 'host');
  const guest = startingMatch(START, 'guest');
  assert.deepEqual(host.controllers, ['human', 'remote']);
  assert.deepEqual(guest.controllers, ['remote', 'human']);
  assert.equal(hashState(host), hashState(guest), 'identical apart from who controls what');
  assert.equal(host.step.team, 1);
  assert.equal(controllerOf(guest), 'human');
  assert.equal(controllerOf(host), 'remote');
  assert.equal(host.mode, 'online');
});

// One move as the phone that makes it does: act with recording dice.
function move(match, action, source) {
  const rng = recordingRng(source);
  const { state, events } = act(match, action, rng);
  return { state, events, entry: { s: match.seq, a: encodeAction(action), r: rng.used } };
}

test('a move replays exactly on the other phone', () => {
  const source = seededRng(8);
  let host = startingMatch(START, 'host');
  let guest = startingMatch(START, 'guest');
  for (let i = 0; i < 400 && guest.step.type !== 'fulltime'; i++) {
    const team = actingTeam(guest);
    const mine = team === 1 ? guest : host;
    const action = mine.step.type === 'roll' ? { type: 'roll' } : mine.step.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice({ ...mine, cpuLevel: 'pro' }, source) };
    const made = move(mine, action, source);
    const other = team === 1 ? host : guest;
    const got = applyRemote(other, JSON.parse(JSON.stringify(made.entry)), team);
    assert.ok(got.ok, got.reason);
    assert.deepEqual(got.events, made.events);
    assert.equal(hashState(got.state), hashState(made.state));
    if (team === 1) [guest, host] = [made.state, got.state];
    else [host, guest] = [made.state, got.state];
  }
});

test('moves that break the rules, or arrive out of turn or order, are refused', () => {
  const guest = startingMatch(START, 'guest');
  const host = startingMatch(START, 'host');
  const toss = move(guest, { type: 'choose', value: 'heads' }, seededRng(1)).entry;
  assert.ok(applyRemote(host, toss, 1).ok);
  assert.equal(applyRemote(host, { ...toss, s: 1 }, 1).reason, 'out of order');
  assert.equal(applyRemote(host, toss, 0).reason, 'not their turn');
  assert.equal(applyRemote(host, { ...toss, a: { t: 'r' } }, 1).reason, 'illegal move');
  assert.equal(applyRemote(host, { ...toss, a: { t: 'c', v: 'edge' } }, 1).reason, 'illegal move');
  assert.equal(applyRemote(host, { ...toss, a: { t: 'zz' } }, 1).reason, 'illegal move');
  assert.equal(applyRemote(host, { ...toss, r: [] }, 1).reason, 'bad dice', 'too few dice');
  assert.equal(applyRemote(host, { ...toss, r: [...toss.r, 0.5] }, 1).reason, 'bad dice', 'unused dice');
  assert.equal(applyRemote(host, { ...toss, r: toss.r.map(() => 1) }, 1).reason, 'bad dice', 'out of range');
  assert.equal(applyRemote(host, { ...toss, r: toss.r.map(() => -0.1) }, 1).reason, 'bad dice');
  assert.equal(applyRemote(host, { ...toss, r: toss.r.map(() => '0.5') }, 1).reason, 'bad dice');
  assert.equal(applyRemote(host, { ...toss, r: Array(9).fill(0.5) }, 1).reason, 'bad dice', 'too many');
  assert.equal(applyRemote(host, { ...toss, r: 'nope' }, 1).reason, 'bad dice');
  assert.equal(applyRemote(host, null, 1).reason, 'out of order');
  // A refused move changes nothing.
  assert.equal(host.seq, 0);
});

test('pending moves come in order and stop at the first gap', () => {
  const m = { seq: 4 };
  const log = [{ s: 2 }, { s: 6 }, { s: 4 }, { s: 5 }, null, { s: 'x' }];
  assert.deepEqual(pendingEntries(m, log).map(e => e.s), [4, 5, 6]);
  assert.deepEqual(pendingEntries({ seq: 7 }, log), []);
  assert.deepEqual(pendingEntries(m, 'junk'), []);
  assert.deepEqual(pendingEntries({ seq: 3 }, log), [], 'a gap at the start');
});

// ---- Sessions over an in-memory room --------------------------------------

function createRoomServer() {
  const rooms = new Map();
  let nextPeer = 1;
  const freeze = o => Object.freeze(o);
  const tick = () => new Promise(r => setTimeout(r, 0));
  function client() {
    const peer = `p${nextPeer++}`;
    return {
      async join(name) {
        if (!rooms.has(name)) rooms.set(name, new Map());
        const room = rooms.get(name);
        const listeners = new Set();
        const conns = new Set();
        const member = { presence: freeze({}), updatedAt: 0, listeners };
        room.set(peer, member);
        const snapshot = forPeer => freeze([...room.entries()].map(([id, m]) => freeze({ peer: id, by: null, isMe: id === forPeer, sameTab: id === forPeer, kind: 'viewer', guest: false, presence: m.presence, updatedAt: m.updatedAt })));
        const broadcast = () => {
          for (const [id, m] of room) for (const fn of m.listeners) setTimeout(() => fn({ peers: snapshot(id), joined: [], left: [], updated: [] }), 0);
        };
        broadcast();
        return {
          name,
          async presence(patch) {
            const next = { ...member.presence };
            for (const [k, v] of Object.entries(patch)) {
              if (v === null) delete next[k];
              else next[k] = JSON.parse(JSON.stringify(v));
            }
            const size = JSON.stringify(next).length;
            if (size > 4096) throw Object.assign(new Error(`presence ${size} bytes`), { code: 'invalid_argument' });
            member.presence = freeze(next);
            member.updatedAt = Date.now() + nextPeer++;
            broadcast();
          },
          peers: () => snapshot(peer),
          onPeers(fn) {
            listeners.add(fn);
            setTimeout(() => fn({ peers: snapshot(peer), joined: [], left: [], updated: [] }), 0);
            return () => listeners.delete(fn);
          },
          connected: () => true,
          onConnection(fn) {
            conns.add(fn);
            setTimeout(() => fn(true), 0);
            return () => conns.delete(fn);
          },
          async leave() {
            room.delete(peer);
            broadcast();
          },
        };
      },
    };
  }
  return { client, tick, rooms };
}

const team = name => ({ name, color: '#1d3577', roster: randomRoster() });
const settle = async server => {
  for (let i = 0; i < 5; i++) await server.tick();
};

test('sessions find each other, check versions and ignore strangers', async () => {
  const server = createRoomServer();
  const host = new OnlineSession({ room: server.client(), code: 'abc234', role: 'host', team: team('Ravens'), build: 'b1' });
  const guest = new OnlineSession({ room: server.client(), code: 'abc234', role: 'guest', team: team('Gulls<b>'), build: 'b1' });
  await host.join();
  assert.equal(host.opponentPresent, false);
  await guest.join();
  await settle(server);
  assert.ok(host.opponentPresent && guest.opponentPresent);
  assert.equal(host.peer.team.name, 'Gulls<b>', 'names are only ever shown as text');
  assert.equal(host.versionMismatch, false);
  assert.equal(host.peer.v, PROTOCOL);

  // A third tab claiming to be another host, or another app, is ignored by the host.
  const stranger = new OnlineSession({ room: server.client(), code: 'abc234', role: 'host', team: team('Other'), build: 'b1' });
  await stranger.join();
  await settle(server);
  assert.equal(host.peer.team.name, 'Gulls<b>');

  // A different version is spotted.
  const old = new OnlineSession({ room: server.client(), code: 'zzz234', role: 'host', team: team('Old'), build: 'b0' });
  const fresh = new OnlineSession({ room: server.client(), code: 'zzz234', role: 'guest', team: team('New'), build: 'b1' });
  await old.join();
  await fresh.join();
  await settle(server);
  assert.ok(fresh.versionMismatch && old.versionMismatch);

  // Leaving is seen.
  await guest.leave();
  await settle(server);
  assert.equal(host.opponentPresent, false);
});

test('team details from the other phone are cleaned up', async () => {
  const server = createRoomServer();
  const host = new OnlineSession({ room: server.client(), code: 'qqq234', role: 'host', team: team('Ravens'), build: 'b1' });
  await host.join();
  const sneaky = await server.client().join(roomName('qqq234'));
  await sneaky.presence({ app: 'pocket-rugby', v: PROTOCOL, build: 'b1', role: 'guest', team: { name: 'x'.repeat(40), color: 'red;background:url(x)', roster: { S: 'y'.repeat(50), F: 3, extra: 'z' } } });
  await settle(server);
  assert.equal(host.peer.team.name.length, 14);
  assert.equal(host.peer.team.color, '#4aa2df', 'not a colour: a safe default');
  assert.equal(host.peer.team.roster.S.length, 20);
  assert.equal(host.peer.team.roster.F, '3');
  assert.ok(!('extra' in host.peer.team.roster));
  assert.equal(host.peer.team.kit, null, 'no kit sent: plain');
  // Patterned kits: a known pattern and two to four real colours, or plain.
  const kitFrom = async kit => {
    await sneaky.presence({ team: { name: 'Gulls', color: '#1d3577', kit } });
    await settle(server);
    return host.peer.team.kit;
  };
  assert.deepEqual(await kitFrom(['hoops', '#1d3577', '#f4f4f0']), ['hoops', '#1d3577', '#f4f4f0']);
  assert.deepEqual(await kitFrom(['quarters', '#111111', '#222222', '#333333', '#444444', '#555555']), ['quarters', '#111111', '#222222', '#333333', '#444444'], 'four colours at most');
  assert.equal(await kitFrom(['zigzag', '#1d3577', '#f4f4f0']), null, 'unknown pattern');
  assert.equal(await kitFrom(['hoops', 'red;x', '#f4f4f0']), null, 'not a colour');
  assert.equal(await kitFrom(['hoops', '#1d3577']), null, 'one colour is plain');
  assert.equal(await kitFrom('hoops'), null);
});

// Plays a whole match between two sessions. Each phone acts only on its turn
// and applies the other's moves from what the room shows it.
async function playOnline(server, seed, { cards = true, length = 'quick' } = {}) {
  const code = `m${String(seed).padStart(5, '2').slice(-5)}`.replace(/[01ilo]/g, 'x');
  const host = new OnlineSession({ room: server.client(), code, role: 'host', team: team('Ravens'), build: 'b1' });
  const guest = new OnlineSession({ room: server.client(), code, role: 'guest', team: team('Gulls'), build: 'b1' });
  await host.join();
  await guest.join();
  await settle(server);
  const start = await host.kickOff({ length, cards, guestTeam: guest.team, rng: seededRng(seed) });
  await settle(server);
  assert.deepEqual(guest.peer.start, start);
  await guest.beginGuest(start.mid);
  const phones = [
    { session: host, team: 0, match: startingMatch(start, 'host'), rng: seededRng(seed * 7 + 1) },
    { session: guest, team: 1, match: startingMatch(start, 'guest'), rng: seededRng(seed * 7 + 2) },
  ];
  let largest = 0;
  for (let guard = 0; guard < 6000; guard++) {
    if (phones.every(p => p.match.step.type === 'fulltime')) break;
    for (const p of phones) {
      const m = p.match;
      if (m.step.type === 'fulltime') continue;
      if (controllerOf(m) === 'remote') {
        const peer = p.session.peer;
        if (!peer || peer.mid !== start.mid) continue;
        const [entry] = pendingEntries(m, peer.log);
        if (!entry) continue;
        const got = applyRemote(m, entry, 1 - p.team);
        assert.ok(got.ok, got.reason);
        p.match = got.state;
        await p.session.shareProgress(p.match);
      } else {
        const action = m.step.type === 'roll' ? { type: 'roll' } : m.step.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice({ ...m, cpuLevel: 'pro' }, p.rng) };
        assert.ok(isLegal(m, action));
        const made = move(m, action, p.rng);
        p.match = made.state;
        await p.session.shareMove(p.match, made.entry);
        assert.ok(p.session.log.length <= LOG_KEEP);
      }
      largest = Math.max(largest, JSON.stringify(p.session.presence).length);
    }
    await settle(server);
  }
  const [a, b] = phones.map(p => p.match);
  assert.equal(a.step.type, 'fulltime', 'the match finished');
  assert.equal(hashState(a), hashState(b), 'both phones agree on everything');
  return { match: a, largest, host, guest, start };
}

test('whole online matches: both phones end up with the same match, inside the presence size limit', async () => {
  const server = createRoomServer();
  for (let seed = 1; seed <= 6; seed++) {
    const { match, largest } = await playOnline(server, seed, { cards: seed % 2 === 1, length: seed % 3 ? 'quick' : 'standard' });
    assert.ok(match.winner === 0 || match.winner === 1);
    assert.ok(largest < 4096, `presence peaked at ${largest} bytes`);
  }
});

test('once a match starts, someone else joining with the same code is ignored', async () => {
  const server = createRoomServer();
  const host = new OnlineSession({ room: server.client(), code: 'ccc234', role: 'host', team: team('Ravens'), build: 'b1' });
  const guest = new OnlineSession({ room: server.client(), code: 'ccc234', role: 'guest', team: team('Gulls'), build: 'b1' });
  await host.join();
  await guest.join();
  await settle(server);
  const start = await host.kickOff({ length: 'quick', cards: true, guestTeam: guest.team, rng: seededRng(5) });
  await settle(server);
  await guest.beginGuest(start.mid);
  await settle(server);
  const intruder = new OnlineSession({ room: server.client(), code: 'ccc234', role: 'guest', team: team('Intruders'), build: 'b1' });
  await intruder.join();
  await intruder.publish({ seq: 5, log: [{ s: 0, a: { t: 'c', v: 'heads' }, r: [0.1] }] });
  await settle(server);
  assert.equal(host.peer.team.name, 'Gulls', 'still following the guest in the match');
  assert.equal(host.peer.mid, start.mid);
});

test('a rematch never picks up moves from the match before', async () => {
  const server = createRoomServer();
  const { host, guest } = await playOnline(server, 9);
  // The host starts a rematch; the guest's old log still holds moves 0, 1, ...
  assert.ok(guest.log.length > 0);
  const start = await host.kickOff({ length: 'quick', cards: false, guestTeam: guest.team, rng: seededRng(99) });
  await settle(server);
  const hostMatch = startingMatch(start, 'host');
  // Until the guest begins the new match, its old moves are for a different mid.
  assert.notEqual(host.peer.mid, start.mid);
  await guest.beginGuest(start.mid);
  await settle(server);
  assert.equal(host.peer.mid, start.mid);
  assert.deepEqual(pendingEntries(hostMatch, host.peer.log), []);
});
