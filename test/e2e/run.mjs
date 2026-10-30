// Browser tests: plays real matches in Chromium by tapping like a person and,
// whenever the game is waiting for input, checks that what is on screen
// matches the saved match state exactly.
// Usage: node test/e2e/run.mjs            (needs the playwright package)
//        E2E_ONLY=resume node test/e2e/run.mjs   run matching scenarios
//        E2E_SKIP=unskipped node test/e2e/run.mjs   leave out the slow one

import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seededRng } from '../../js/engine.js';
import { hashText, rebuild } from '../../js/friends.js';
import { createLeague, simulateFixture } from '../../js/tournament.js';
import { dayKey } from '../../js/daily.js';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

class Failure extends Error {}
const check = (ok, message) => {
  if (!ok) throw new Failure(message);
};

// Reads what the page shows and what the saved match says, side by side.
async function snapshot(page) {
  return page.evaluate(() => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('pocket-rugby:match') || 'null');
    } catch {
      saved = null;
    }
    const sides = [0, 1].map(t => {
      const side = document.querySelector(`.side[data-team="${t}"]`);
      return {
        name: side.querySelector('.side-name').textContent,
        score: side.querySelector('.side-score').textContent,
        flipping: side.querySelector('.side-score').classList.contains('flip'),
        ball: !side.querySelector('.poss').hidden,
        chips: side.querySelector('.side-status').textContent,
      };
    });
    const drafting = !document.querySelector('#draft').hidden;
    const buttons = [...document.querySelectorAll(drafting ? '#draft-cards button' : '#actions button:not(.auto-btn)')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled, waiting: b.classList.contains('waiting'), choice: b.hasAttribute('data-choice'), card: b.dataset.card || null, rarity: b.dataset.rarity || null }));
    const carrier = document.querySelector('.tok.carrier');
    return {
      match: saved?.match || null,
      sides,
      buttons,
      prompt: document.querySelector('#prompt').textContent,
      half: document.querySelector('#board-half').textContent,
      headline: document.querySelector('#headline').textContent,
      carrier: carrier ? { team: Number(carrier.dataset.team), pos: carrier.dataset.pos } : null,
      cinema: !document.querySelector('#cinema').hidden,
      dialog: document.querySelector('dialog[open]')?.id || null,
      feed: document.querySelectorAll('#feed-list li').length,
      drafting,
      coach: !document.querySelector('#coach').hidden,
      meter: !document.querySelector('#meter').hidden ? [document.querySelector('#meter-0').textContent, document.querySelector('#meter-1').textContent] : null,
      boardCards: [0, 1].map(t => { const b = document.querySelector(`.side[data-team="${t}"] .side-card`); return b.hidden ? null : b.textContent; }),
      boardRarity: [0, 1].map(t => [...(document.querySelector(`.side[data-team="${t}"] .side-card .tc-chip`)?.classList || [])].find(c => c.startsWith('r-'))?.slice(2) || null),
      rain: !document.querySelector('#rain').hidden,
      wind: document.querySelector('#conditions .wind')?.textContent || null,
      // The dice guide and the badges, and the match clock.
      guide: document.querySelector('#guide').hidden ? null : [...document.querySelectorAll('#guide .gf')].map(b => [...b.classList].find(c => c.startsWith('tone-'))),
      guideTitle: document.querySelector('#guide-text')?.textContent || '',
      rollBadge: document.querySelector('#actions .roll-btn .die-badge')?.textContent || null,
      clock: document.querySelector('#board-clock').hidden ? null : document.querySelector('#board-clock b').textContent,
      boardCount: [0, 1].map(t => document.querySelectorAll(`.side[data-team="${t}"] .side-card .tc-chip`).length),
      order: [...document.querySelectorAll('#draft-order .dp')].map(li => li.textContent),
      // The dice on the table: each one's die, face and which end it's on.
      table: [...document.querySelectorAll('#tray-dice .die')].map(d => ({ die: d.dataset.die, face: Number(d.dataset.face), team: Number(d.closest('.duel-side')?.dataset.team) })),
      ends: [...document.querySelectorAll('#tray-dice .duel-side')].map(s => Number(s.dataset.team)),
    };
  });
}

const ROLL_LABELS = {
  attack: s => new RegExp(`Roll (Scrum Half|Forwards|Centres|Outside Backs|Fly Half)`),
  tackle: () => /Tackle!/,
  ruck: () => /Contest the ruck/,
  try: s => (s.videos ? /Video ref: roll again/ : s.rerolled ? /Clinical: roll again/ : /Go for the line/),
  range: () => /range/,
  penalty: () => /Card check/,
  kick: () => /Kick! Need \d+ m/,
  setpiece: () => /Feed the scrum|Throw in/,
  restart: () => /Kick off/,
};
const NAMES = { S: 'Scrum Half', F: 'Forwards', C: 'Centres', W: 'Outside Backs', B: 'Fly Half' };

// Everything on screen must agree with the saved state while the game waits.
function verify(snap, label) {
  const m = snap.match;
  if (!m) return;
  m.teams.forEach((t, i) => {
    check(snap.sides[i].name === t.name, `${label}: team ${i} name "${snap.sides[i].name}" vs "${t.name}"`);
    if (!snap.sides[i].flipping) check(snap.sides[i].score === String(t.score), `${label}: team ${i} shows ${snap.sides[i].score}, state has ${t.score}`);
    // Nobody has the ball while a kick-off is in the air.
    const hasBall = m.attacker === i && m.step.type !== 'halftime' && m.step.type !== 'fulltime' && m.step.purpose !== 'restart';
    check(snap.sides[i].ball === hasBall, `${label}: possession marker for team ${i}`);
    if (t.yellows >= 2) check(/Red/.test(snap.sides[i].chips), `${label}: red card chip`);
    else if (t.sinBin) check(/Sin bin/.test(snap.sides[i].chips), `${label}: sin bin chip`);
    for (const [pos, n] of Object.entries(t.injuries)) if (n) check(snap.sides[i].chips.includes(`${pos} −${n}`), `${label}: injury chip ${pos}`);
  });
  const step = m.step;
  const halfText = step.type === 'halftime' ? 'Half time' : m.suddenDeath ? 'Sudden death' : m.half === 1 ? '1st half' : '2nd half';
  check(snap.half === halfText, `${label}: board says "${snap.half}", expected "${halfText}"`);
  // A decision names the side over its buttons; a roll names it on the button.
  if (step.type === 'choose' && step.purpose !== 'draft') {
    check(snap.prompt.includes(m.teams[step.team].name), `${label}: prompt "${snap.prompt}" names ${m.teams[step.team].name}`);
  }
  if (step.type === 'roll') {
    const roll = snap.buttons[0];
    check(roll && (roll.waiting || roll.text.includes(m.teams[step.team].name)), `${label}: roll button "${roll?.text}" names ${m.teams[step.team].name}`);
  }
  if (step.type === 'roll') {
    const main = snap.buttons[0];
    check(snap.buttons.length === 1, `${label}: one roll button`);
    check(ROLL_LABELS[step.purpose](step).test(main.text), `${label}: button "${main.text}" for ${step.purpose}`);
    if (step.purpose === 'attack') check(main.text.includes(NAMES[step.dice[0]]), `${label}: rolls the ${NAMES[step.dice[0]]}`);
    if (['attack', 'tackle', 'try', 'ruck'].includes(step.purpose)) {
      const holder = step.purpose === 'attack' ? m.carrier : step.purpose === 'ruck' ? 'S' : step.carrier;
      if (step.purpose !== 'ruck') check(snap.carrier && snap.carrier.team === m.attacker && snap.carrier.pos === holder, `${label}: ball carrier on the pitch ${JSON.stringify(snap.carrier)} vs ${m.attacker}/${holder}`);
    }
  }
  if (step.type === 'choose') {
    const choices = snap.buttons.filter(b => b.choice);
    if (!snap.buttons.some(b => b.waiting)) check(choices.length === step.options.length, `${label}: ${choices.length} choices for ${step.options.length} options`);
    if (step.purpose === 'pass') for (const p of step.options) check(choices.some(c => c.text.includes(NAMES[p])), `${label}: pass option ${p}`);
  }
  // The draft shows all five cards at their dealt rarities, the picked ones
  // stamped, and the pick order; play starts once both sides have two.
  check(snap.drafting === (step.purpose === 'draft'), `${label}: draft panel ${snap.drafting} at ${step.purpose}`);
  if (step.purpose === 'draft') {
    check(snap.buttons.length === 5, `${label}: five cards dealt`);
    for (const id of step.options) check(snap.buttons.some(b => b.card === id && b.choice), `${label}: ${id} can be picked`);
    for (const b of snap.buttons) check(b.rarity === m.dealRarity[b.card], `${label}: ${b.card} shown ${b.rarity}, dealt ${m.dealRarity[b.card]}`);
    for (const t of m.teams) for (const c of t.cards) check(snap.buttons.some(b => b.card === c.id && !b.choice && b.text.includes(t.name)), `${label}: ${c.id} stamped for ${t.name}`);
    check(snap.order.length === 4, `${label}: four picks in the order`);
    const loser = m.teams[1 - m.firstReceiver].name;
    const winner = m.teams[m.firstReceiver].name;
    [loser, winner, winner, loser].forEach((name, i) => check(snap.order[i].includes(name), `${label}: pick ${i + 1} is ${name}'s ("${snap.order[i]}")`));
  }
  // The guide under the dice: six faces, each good, bad or neither.
  if (step.type === 'roll' && m.attacker !== null) {
    check(snap.guide && snap.guide.length === 6 && snap.guide.every(Boolean), `${label}: dice guide ${JSON.stringify(snap.guide)}`);
    if (step.purpose === 'attack') check(snap.guideTitle.includes(NAMES[step.dice[0]]), `${label}: guide for the ${NAMES[step.dice[0]]} die`);
  } else check(snap.guide === null, `${label}: no guide without a roll`);
  // Badges: an injured player's die shows the penalty.
  if (step.purpose === 'attack' && !snap.buttons[0].waiting) {
    const hurt = m.teams[step.team].injuries[step.dice[0]];
    const tap = m.quickTap > 0 ? 1 : 0;
    // The player's rating: 88 and up +1, under 70 −1.
    const r = m.teams[step.team].ratings?.[step.dice[0]] ?? 80;
    const rated = r >= 88 ? 1 : r < 70 ? -1 : 0;
    const n = tap - hurt + rated;
    const want = hurt || tap || rated ? `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}` : null;
    check(want === null ? snap.rollBadge === null : snap.rollBadge === want, `${label}: badge "${snap.rollBadge}", want "${want}"`);
  }
  // The clock: rolls left in the half, last play, sudden death.
  if (m.format === 'rolls' && step.type !== 'fulltime') {
    const half = Math.round(m.target.rolls / 2);
    const want = m.suddenDeath ? 'Next' : step.type === 'halftime' ? String(half) : m.lastPlay ? 'Last' : String(Math.max(0, half - m.clock));
    check(snap.clock === want, `${label}: clock "${snap.clock}", want "${want}"`);
  } else if (m.format !== 'rolls') check(snap.clock === null, `${label}: no clock first to a score`);
  // Weather on the pitch: rain, and an arrow towards the end the wind blows to.
  check(snap.rain === !!m.weather?.rain, `${label}: rain shown ${snap.rain}`);
  const wind = m.weather?.wind ?? null;
  const windNow = wind === null ? null : m.half === 1 ? wind : 1 - wind;
  check(snap.wind === (windNow === null ? null : windNow === 0 ? 'Wind →' : '← Wind'), `${label}: wind "${snap.wind}" for ${windNow}`);
  if (step.purpose === 'bench') {
    const choices = snap.buttons.filter(b => b.choice);
    check(choices.some(c => /Play on/.test(c.text)), `${label}: the bench offers to play on`);
    // "i>pos": the sub's name on the button, and who they're for.
    for (const o of step.options.filter(x => x !== 'stay')) {
      const [i, pos] = o.split('>');
      const sub = m.teams[step.team].subs[Number(i)];
      const who = sub.name ? sub.name.replace(/^[A-Z]\.\s*/, '') : 'Replacement';
      check(choices.some(c => c.text.includes(`${who} on`) && c.text.includes(`clears the −${m.teams[step.team].injuries[pos]}`)), `${label}: replace ${o} (${who})`);
    }
  }
  // The table: the left team's end on the left, and the last roll's dice on it as they landed.
  if (snap.ends.length) check(JSON.stringify(snap.ends) === '[0,1]', `${label}: table ends ${snap.ends}`);
  if (m.roll && snap.table.length) {
    for (const [i, id] of m.roll.dice.entries()) {
      check(snap.table.some(d => d.die === id && d.face === m.roll.faces[i]), `${label}: ${id} die shows face ${m.roll.faces[i]} (${m.roll.purpose}); table ${JSON.stringify(snap.table)}`);
    }
  }
  m.teams.forEach((t, i) => check(snap.boardCount[i] === t.cards.length, `${label}: team ${i} has ${t.cards.length} cards on the board, shows ${snap.boardCount[i]}`));
  m.teams.forEach((t, i) => check(snap.boardRarity[i] === (t.cards[0]?.rarity || null), `${label}: team ${i} card's rarity on the board`));
  if (m.attacker !== null && snap.meter) {
    const [a, b] = snap.meter.map(x => Number(x.replace('%', '')));
    check(Math.abs(a + b - 100) <= 1, `${label}: win meter adds up (${snap.meter})`);
  }
}

// Clicks whatever an impatient player would: any enabled button in the
// dock or the draft, skipping coach tips.
const tapAny = page => page.evaluate(() => {
  if (!document.querySelector('#coach').hidden) {
    document.querySelector('#coach-ok').click();
    return;
  }
  const buttons = [...document.querySelectorAll('#draft:not([hidden]) #draft-cards button:not([disabled]), #actions button:not([disabled]):not(.auto-btn)')];
  buttons[Math.floor(Math.random() * buttons.length)]?.click();
});

async function setUp(page, { mode = '1p', length = 'quick', format = null, cpu = null, style = null, cards = null, weather = null }) {
  await page.click(`[data-start="${mode}"]`);
  if (format) await page.click(`#format-${format}`, { force: true });
  await page.click(`#len-${length}`, { force: true });
  if (cpu) await page.click(`#cpu-${cpu}`, { force: true });
  if (style) await page.click(`#style-${style}`, { force: true });
  if (cards !== null && (await page.isChecked('#setup-cards')) !== cards) await page.click('#setup-cards', { force: true });
  if (weather !== null && (await page.isChecked('#setup-weather')) !== weather) await page.click('#setup-weather', { force: true });
  await page.click('#setup-form button[type=submit]');
}

async function playMatch(page, { label, mode = '1p', length = 'quick', format = null, tapStyle = 'random', skipScenes = true, budgetMs = 420000, setup = true, cpu, style, cards, weather }) {
  if (setup) await setUp(page, { mode, length, format, cpu, style, cards, weather });
  return playOn(page, { label, tapStyle, skipScenes, budgetMs });
}

// Starts the user's next competition match: Play, then Kick off on the team sheet.
async function kickOff(page) {
  await page.click('.next-card .btn-primary');
  await page.waitForSelector('#dlg-sheet[open]', { timeout: 5000 });
  await page.click('#btn-sheet-done');
}

async function playOn(page, { label, tapStyle = 'random', skipScenes = true, budgetMs = 420000 }) {
  const started = Date.now();
  let checks = 0;
  let actions = 0;
  const seen = new Set();
  while (Date.now() - started < budgetMs) {
    const snap = await snapshot(page);
    if (snap.dialog === 'dlg-break') {
      const title = await page.textContent('#break-title');
      if (/half time/i.test(title)) {
        // Online, only the side receiving the second-half kick-off starts it.
        // The waiting phone's dialog closes by itself when the other phone starts it.
        const start = await page.$('#break-actions .btn-primary');
        if (start) await start.click();
        else await page.click('#break-actions .btn-quiet', { timeout: 3000 }).catch(() => {});
        seen.add('halftime-dialog');
        continue;
      }
      return { title, checks, actions, seen };
    }
    if (snap.dialog === 'dlg-ask') throw new Failure(`${label}: unexpected question "${await page.textContent('#dlg-ask')}"`);
    if (snap.cinema) {
      seen.add('cinema');
      if (skipScenes) await page.click('#cinema', { force: true }).catch(() => {});
      await page.waitForTimeout(80);
      continue;
    }
    if (snap.coach) {
      seen.add('coach');
      if (tapStyle === 'keyboard') await page.keyboard.press('Enter');
      else await page.click('#coach-ok');
      await page.waitForTimeout(60);
      continue;
    }
    const ready = snap.buttons.some(b => !b.disabled && !b.waiting);
    if (ready) {
      verify(snap, `${label} action ${actions}`);
      checks++;
      if (snap.match) seen.add(`${snap.match.step.type}:${snap.match.step.purpose || ''}`);
      if (tapStyle === 'keyboard') {
        const choices = snap.buttons.filter(b => b.choice && !b.disabled);
        if (choices.length) await page.keyboard.press(String(1 + Math.floor(Math.random() * choices.length)));
        else await page.keyboard.press('Space');
      } else {
        await tapAny(page);
      }
      actions++;
    } else {
      // Hurry along dice and banners, as an impatient player would.
      await page.evaluate(() => document.querySelector('#tray').click());
    }
    await page.waitForTimeout(60);
  }
  throw new Failure(`${label}: match did not finish in ${budgetMs / 1000}s (${actions} actions)`);
}

// The stand-in for the claude.ai room: every page that joins a relay hears
// what the others send, as two phones would.
const MOCK_ROOM = readFileSync(join(root, 'test/e2e/mock-room.js'), 'utf8');
const MOCK_DB = readFileSync(join(root, 'test/e2e/mock-db.js'), 'utf8');

// The shared data behind the db stand-in: one per scenario, shared by its pages.
class MockStore {
  constructor(names = {}) {
    this.docs = new Map();
    this.leases = new Map();
    this.names = names;
  }

  static merge(into, patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && into[k] && typeof into[k] === 'object' && !Array.isArray(into[k])) MockStore.merge(into[k], v);
      else into[k] = v;
    }
    return into;
  }

  handle(req) {
    const copy = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
    switch (req.op) {
      case 'get': return { value: copy(this.docs.get(req.path) ?? null) };
      case 'set': this.docs.set(req.path, copy(req.data)); return { value: null };
      case 'update':
        if (!this.docs.has(req.path)) return { error: 'invalid_argument' };
        MockStore.merge(this.docs.get(req.path), copy(req.data));
        return { value: null };
      case 'delete': this.docs.delete(req.path); return { value: null };
      case 'acquire': {
        const now = Date.now();
        const lease = this.leases.get(req.path);
        if (lease && lease.until > now && lease.holder !== req.holder) return { value: { acquired: false, expiresAt: new Date(lease.until).toISOString() } };
        this.leases.set(req.path, { holder: req.holder, until: now + req.ttlMs });
        return { value: { acquired: true, version: 1, holder: req.holder } };
      }
      case 'query': {
        const depth = req.path.split('/').length + 1;
        let rows = [...this.docs.entries()].filter(([p]) => p.startsWith(`${req.path}/`) && p.split('/').length === depth).map(([path, data]) => ({ path, data: copy(data) }));
        const ops = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, in: (a, b) => b.includes(a) };
        for (const [field, op, value] of req.spec.where) rows = rows.filter(r => ops[op](r.data[field], value));
        if (req.spec.orderBy) {
          const [field, dir] = req.spec.orderBy;
          rows.sort((a, b) => (a.data[field] < b.data[field] ? -1 : a.data[field] > b.data[field] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
        } else rows.sort((a, b) => a.path.localeCompare(b.path));
        if (req.spec.limit) rows = rows.slice(0, req.spec.limit);
        return { value: rows };
      }
      case 'names': return { value: Object.fromEntries(req.ids.map(id => [id, this.names[id] || ''])) };
    }
    return { error: 'invalid_argument' };
  }
}

async function newPage(browser, { prefs = {}, device = 'iPhone 13', colorScheme = 'light', reducedMotion = 'no-preference', relay = null, store = null, user = null } = {}) {
  const context = await browser.newContext({ ...devices[device], colorScheme, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));
  await page.addInitScript(p => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('pocket-rugby:prefs', JSON.stringify({ sound: false, coach: false, ...p }));
      sessionStorage.setItem('seeded', '1');
    }
  }, prefs);
  if (relay) {
    relay.push(page);
    await page.exposeBinding('__roomSend', (source, text) => {
      for (const other of relay) if (other !== page) other.evaluate(t => window.__roomDeliver?.(t), text).catch(() => {});
    });
    await page.addInitScript(MOCK_ROOM);
  }
  if (store) {
    await page.exposeBinding('__dbCall', (source, text) => JSON.stringify(store.handle(JSON.parse(text))));
    await page.addInitScript(u => (window.__mockUser = u), user);
    await page.addInitScript(MOCK_DB);
  }
  return { page, context, errors };
}

const saved = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(`pocket-rugby:${k}`) || 'null'), key);

const SCENARIOS = {
  async 'daily-challenge'(browser, base) {
    const store = new MockStore({ u_me: 'Sam', u_x: 'Alex', u_y: 'Kim' });
    const today = dayKey();
    // Two friends finished earlier today.
    store.docs.set('daily/u_x', { day: today, won: true, score: [30, 25], rank: 1005, at: 1 });
    store.docs.set('daily/u_y', { day: today, won: false, score: [22, 30], rank: 492, at: 2 });
    store.docs.set('daily/u_z', { day: '2000-01-01', won: true, score: [30, 3], rank: 1027, at: 0 });
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'short', fast: true }, store, user: { id: 'u_me', name: 'Sam' } });
    await page.goto(base);
    check(/^Daily challenge #\d+$/.test(await page.textContent('#daily-label')), 'the title screen names today\'s challenge');
    await page.click('#btn-daily');
    await page.waitForSelector('.board-list li');
    let rows = await page.$$eval('.board-list li', li => li.map(x => x.textContent));
    check(rows.length === 2 && rows[0].includes('Alex') && rows[1].includes('Kim'), `today's board only, best first: ${rows}`);
    check(/down, \d+ to play/i.test(await page.textContent('.daily-card .nc-title')), 'the situation in a line');
    await page.click('#daily-body .btn-play');
    const result = await playOn(page, { label: 'daily' });
    const note = await page.textContent('#break-note');
    check(/^Daily #\d+: (won|lost) \d+–\d+ from \d+–\d+\.$/.test(note), `daily note "${note}"`);
    await page.click('#break-actions .btn-primary');
    await page.waitForSelector('.board-list li.mine');
    rows = await page.$$eval('.board-list li', li => li.map(x => x.textContent));
    check(rows.length === 3, `three on the board now: ${rows}`);
    const mine = store.docs.get('daily/u_me');
    check(mine?.day === today && mine.days[today].rank === mine.rank, 'the result is saved under my id');
    const at = rows.findIndex(r => r.includes('Sam'));
    check(at === (mine.won ? (mine.rank > 1005 ? 0 : 1) : mine.rank > 492 ? 1 : 2), `ranked by result: ${rows}`);
    // The score card and the result line.
    await page.click('text=Save score card');
    await page.waitForFunction(() => window.__downloaded.length === 1);
    const file = await page.evaluate(() => window.__downloaded[0]);
    check(/^pocket-rugby-daily-\d+\.png$/.test(file.filename) && file.size > 20000, `score card ${JSON.stringify(file)}`);
    // A second go is practice: it doesn't change the result or the board.
    await page.click('text=Practice');
    await page.waitForSelector('#view-match:not([hidden])');
    check((await page.textContent('#period')).includes('practice'), 'practice is labelled');
    await page.click('#btn-menu');
    await page.click('#btn-quit');
    await page.waitForSelector('#view-daily:not([hidden])');
    check(JSON.stringify(store.docs.get('daily/u_me')) === JSON.stringify(mine), 'practice leaves the board alone');
    check(/Your result today: (Won|Lost)/.test(await page.textContent('.daily-status')), 'the day\'s result stands');
    return { errors, ...result };
  },
  async 'champions-cup-and-club-career'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true } });
    await page.goto(base);
    await page.click('#btn-tournament');
    await page.click('.comp:has(input[value="champions"])');
    await page.click('.team-tile >> text=Munster');
    await page.click('#tournament-body .btn-primary');
    check((await page.$$('.standings')).length === 4, 'four pools');
    check((await page.$$('.standings tbody tr')).length === 24, 'twenty-four clubs');
    check(/Pool 3 · Round 1 of 4/.test(await page.textContent('.next-card .nc-kicker')), 'Munster are in Pool 3');
    check((await page.textContent('.next-card .nc-venue')).length > 3, 'the ground is named');
    await kickOff(page);
    const result = await playOn(page, { label: 'champions cup' });
    const note = await page.textContent('#break-note');
    check(/^(A draw\. )?Munster are \d+(st|nd|rd|th) in Pool 3\.$/.test(note), `pool note "${note}"`);
    await page.click('#break-actions .btn-primary');
    // A URC season played out, then on into the Champions Cup and the next season.
    const playOut = async () => page.evaluate(async () => {
      const T = await import('/js/tournament.js');
      const t = JSON.parse(localStorage.getItem('pocket-rugby:tournament'));
      for (let g = 0; t.stage !== 'done' && g < 80; g++) {
        const f = T.userFixture(t);
        if (f) T.recordResult(t, f.id, T.simulateFixture(t, f));
        T.simulateRound(t);
        T.advance(t);
      }
      localStorage.setItem('pocket-rugby:tournament', JSON.stringify(t));
      return t.stage;
    });
    await page.evaluate(async () => {
      const T = await import('/js/tournament.js');
      localStorage.setItem('pocket-rugby:tournament', JSON.stringify(T.createLeague({ league: 'urc', userTeam: 'munster', season: 'short' })));
    });
    check((await playOut()) === 'done', 'a URC season played out');
    await page.reload();
    await page.click('#btn-tournament');
    check(/Play the 2026–27 Champions Cup/.test(await page.textContent('.next-card .btn-primary')), 'Munster go on to the Champions Cup');
    await page.click('.next-card .btn-primary');
    check((await page.textContent('#tournament-title')) === 'Champions Cup', 'into the Champions Cup');
    check((await page.$$('section.club')).length === 1, 'the club career has begun');
    check((await playOut()) === 'done', 'the Champions Cup played out');
    await page.reload();
    await page.click('#btn-tournament');
    check(/Start the 2027–28 season/.test(await page.textContent('.next-card .btn-primary')), 'then the next season');
    await page.click('.next-card .btn-primary');
    check(/URC 2027–28/.test(await page.textContent('.hub-head small')), 'season two of the URC');
    const history = await page.$$eval('.season-row', rows => rows.map(r => r.textContent));
    check(history.length === 1 && /2026–27/.test(history[0]) && /URC: \d+(st|nd|rd|th) of 16/.test(history[0]) && /Champions Cup:/.test(history[0]), `season one in the history: ${history}`);
    check((await page.$$('.rb-row')).length >= 5, 'a records book');
    return { errors, ...result };
  },
  async 'friends-league'(browser, base) {
    const store = new MockStore({ u_a: 'Alex', u_b: 'Sam' });
    const relay = [];
    const a = await newPage(browser, { prefs: { cinema: 'off', fast: true }, relay, store, user: { id: 'u_a', name: 'Alex' } });
    const b = await newPage(browser, { prefs: { cinema: 'off', fast: true }, device: 'Pixel 7', relay, store, user: { id: 'u_b', name: 'Sam' } });
    await a.page.goto(base);
    await b.page.goto(base);
    // Alex starts a Prem league with Bath.
    await a.page.click('#btn-friends');
    await a.page.click('.friends-create .team-tile >> text=Bath');
    await a.page.click('text=Start the league');
    await a.page.waitForSelector('.ol-code');
    const code = (await a.page.textContent('.ol-code')).replace(/\s/g, '').toLowerCase();
    // Sam joins and takes Gloucester.
    await b.page.click('#btn-friends');
    await b.page.fill('#friends-code', code);
    await b.page.click('.ol-join button[type=submit]');
    await b.page.waitForSelector('.team-tile.taken');
    check(/Bath/.test(await b.page.textContent('.team-tile.taken')), 'Alex\'s club is shown as taken');
    await b.page.click('.team-tile:not([disabled]) >> text=Gloucester');
    await a.page.waitForFunction(() => document.querySelectorAll('.members .member').length === 2);
    // Pick a seed that puts Bath and Gloucester together in round one.
    const doc = store.docs.get(`friends/${code}`);
    for (let seed = 1; ; seed++) {
      const t = createLeague({ league: 'prem', userTeam: 'bath', season: doc.season, rng: seededRng(seed) });
      if (t.fixtures.some(f => f.round === 0 && [f.home, f.away].sort().join() === 'bath,gloucester')) {
        doc.seed = seed;
        break;
      }
    }
    await a.page.click('text=Start the season');
    await Promise.all([a, b].map(p => p.page.waitForSelector('.next-card .btn-play')));
    check(/Play Sam/.test(await a.page.textContent('.next-card .btn-play')), 'Alex plays Sam');
    check(/Play Alex/.test(await b.page.textContent('.next-card .btn-play')), 'Sam plays Alex');
    // Round one: friend against friend, phone to phone.
    await a.page.click('.next-card .btn-play');
    await b.page.click('.next-card .btn-play');
    await Promise.all([a, b].map(p => p.page.waitForSelector('#view-match:not([hidden])', { timeout: 120000 })));
    const played = await Promise.all([playOn(a.page, { label: 'alex', budgetMs: 600000 }), playOn(b.page, { label: 'sam', budgetMs: 600000 })]);
    const scores = await Promise.all([a, b].map(p => p.page.textContent('#break-score')));
    check(scores[0] === scores[1], `both phones agree: ${scores}`);
    for (const p of [a, b]) await p.page.click('#break-actions .btn-primary');
    await Promise.all([a, b].map(p => p.page.waitForFunction(() => /Round 2/.test(document.querySelector('.next-card .nc-kicker')?.textContent || ''), null, { timeout: 60000 })));
    const results = [...store.docs.keys()].filter(k => k.startsWith(`friends/${code}/results/`));
    check(results.length === 1, `one result saved (${results})`);
    // Round two: each against the CPU, at the same time.
    for (const p of [a, b]) {
      check(/^Play$/.test((await p.page.textContent('.next-card .btn-play span')).trim()), 'a CPU match next');
      await p.page.click('.next-card .btn-play');
    }
    const second = await Promise.all([playOn(a.page, { label: 'alex cpu' }), playOn(b.page, { label: 'sam cpu' })]);
    for (const p of [a, b]) await p.page.click('#break-actions .btn-primary');
    await Promise.all([a, b].map(p => p.page.waitForFunction(() => /Round 3/.test(document.querySelector('.next-card .nc-kicker')?.textContent || ''), null, { timeout: 60000 })));
    const tables = await Promise.all([a, b].map(p => p.page.$$eval('.standings tbody tr', rows => rows.map(r => r.textContent))));
    check(JSON.stringify(tables[0]) === JSON.stringify(tables[1]), 'both phones show the same table');
    check(tables[0].length === 10, 'ten clubs');
    // The rest of the season: their results arrive as if played elsewhere.
    const clubs = { bath: { uid: 'u_a' }, gloucester: { uid: 'u_b' } };
    for (let guard = 0; guard < 40; guard++) {
      const shared = Object.fromEntries([...store.docs.entries()].filter(([k]) => k.startsWith(`friends/${code}/results/`)).map(([k, v]) => [k.split('/').pop(), v]));
      const built = rebuild(store.docs.get(`friends/${code}`), clubs, shared, 'u_a');
      if (built.t.stage === 'done') break;
      for (const f of built.pending) store.docs.set(`friends/${code}/results/${f.id}`, simulateFixture(built.t, f, seededRng(hashText(f.id))));
    }
    await Promise.all([a, b].map(p => p.page.waitForSelector('.next-card.champions', { timeout: 60000 })));
    const champs = await Promise.all([a, b].map(p => p.page.textContent('.next-card .nc-title')));
    check(champs[0].replace('Champions!', '') === champs[1].replace('Champions!', '') || champs.includes('Champions!'), `the same champion: ${champs}`);
    const finalTables = await Promise.all([a, b].map(p => p.page.$$eval('.standings tbody tr', rows => rows.map(r => r.textContent))));
    check(JSON.stringify(finalTables[0]) === JSON.stringify(finalTables[1]), 'the same final table');
    return { errors: [...a.errors, ...b.errors], title: champs.join(' / '), checks: played[0].checks + played[1].checks + second[0].checks + second[1].checks, actions: played[0].actions + played[1].actions + second[0].actions + second[1].actions, seen: played[0].seen };
  },
  async 'one-player-full-cinematics'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'full', fast: true } });
    await page.goto(base);
    const result = await playMatch(page, { label: '1p full', mode: '1p', weather: true });
    check(result.seen.has('cinema'), 'cinematic scenes played');
    check(/win/i.test(result.title), `full-time title "${result.title}"`);
    return { errors, ...result };
  },
  async 'one-player-watch-scenes-unskipped'(browser, base) {
    // Lets every scene run to its end at normal speed for part of a match.
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'full' } });
    await page.goto(base);
    const result = await playMatch(page, { label: '1p unskipped', mode: '1p', skipScenes: false, budgetMs: 900000 }).catch(e => {
      if (e instanceof Failure && /did not finish/.test(e.message)) return { title: 'time limit', checks: 0, actions: 0, seen: new Set(['cinema']) };
      throw e;
    });
    return { errors, ...result };
  },
  async 'two-player-no-cinematics'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true }, device: 'iPhone SE', colorScheme: 'dark' });
    await page.goto(base);
    // First to 20, the race.
    const result = await playMatch(page, { label: '2p off', mode: '2p', format: 'points' });
    check(result.seen.has('halftime-dialog'), 'half time');
    check(!result.seen.has('cinema'), 'no scenes when cinematics are off');
    return { errors, ...result };
  },
  async 'keyboard-only'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'short', fast: true }, device: 'Desktop Chrome' });
    await page.goto(base);
    const result = await playMatch(page, { label: 'keyboard', mode: '2p', tapStyle: 'keyboard' });
    return { errors, ...result };
  },
  async 'auto-roll'(browser, base) {
    // Auto-roll on: the dice roll themselves and only decisions wait for a tap.
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true, autoRoll: true } });
    await page.goto(base);
    const result = await playMatch(page, { label: 'auto', mode: '1p', format: 'points', cards: false });
    check(!result.seen.has('roll:attack') && !result.seen.has('roll:tackle'), `no rolls waited for a tap: ${[...result.seen]}`);
    check(result.seen.has('choose:pass') || result.seen.has('choose:penalty') || result.seen.has('choose:drop'), 'decisions still wait for you');
    // Turning it off hands the dice back.
    await page.click('#break-actions .btn-primary');
    await page.waitForSelector('#actions button:not([disabled])');
    await page.click('#actions button:not([disabled]) >> nth=0');
    await page.waitForSelector('.auto-btn', { timeout: 20000 });
    await page.click('.auto-btn');
    check(await page.$eval('.auto-btn', b => b.getAttribute('aria-pressed')) === 'false', 'auto off');
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-rugby:prefs')));
    check(prefs.autoRoll === false, 'remembered');
    return { errors, ...result };
  },
  async 'reduced-motion'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'full', fast: true }, reducedMotion: 'reduce' });
    await page.goto(base);
    const result = await playMatch(page, { label: 'reduced motion', mode: '2p' });
    check(!result.seen.has('cinema'), 'reduced motion turns scenes off');
    return { errors, ...result };
  },
  async 'resume-and-settings'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true } });
    await page.goto(base);
    await page.click('[data-start="2p"]');
    await page.fill('#team0-name', 'Harbour');
    await page.click('#setup-form button[type=submit]');
    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => document.querySelector('#draft:not([hidden]) #draft-cards button:not([disabled]), #actions button:not([disabled])')?.click());
      await page.waitForTimeout(250);
      await page.evaluate(() => document.querySelector('#tray').click());
      if (await page.$('dialog[open]')) await page.click('dialog[open] .btn-primary');
    }
    const before = await snapshot(page);
    check(before.match, 'match saved mid-game');
    // Change a setting, reload, and check both survive.
    await page.click('#btn-menu');
    await page.click('#dlg-menu [data-open="dlg-settings"]');
    await page.selectOption('#set-cinema', 'short');
    await page.click('#dlg-settings [data-close]');
    await page.reload();
    await page.waitForSelector('#btn-resume:not([hidden])');
    const detail = await page.textContent('#resume-detail');
    const [a, b] = before.match.teams;
    check(detail.includes(`${a.name} ${a.score}–${b.score} ${b.name}`), `resume shows the score: "${detail}"`);
    await page.click('#btn-resume');
    await page.waitForTimeout(400);
    const after = await snapshot(page);
    check(JSON.stringify(after.match.step) === JSON.stringify(before.match.step), 'resumed at the same step');
    verify(after, 'after resume');
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-rugby:prefs')));
    check(prefs.cinema === 'short', 'setting persisted');
    // The match log lists what happened, newest first.
    await page.click('#btn-menu');
    await page.click('#dlg-menu [data-open="dlg-log"]');
    const logLines = await page.$$eval('#log-list li', li => li.length);
    check(logLines > 5, `match log has ${logLines} lines`);
    await page.click('#dlg-log [data-close]');
    // Restart goes back to the toss.
    await page.click('#btn-menu');
    await page.click('#btn-restart');
    await page.click('#btn-confirm-restart');
    const fresh = await snapshot(page);
    check(fresh.match.step.purpose === 'toss' && fresh.match.teams.every(t => t.score === 0), 'restart resets the match');
    return { errors, title: 'resumed', checks: 3, actions: 40, seen: new Set() };
  },
  async 'single-file-build'(browser) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'short', fast: true } });
    await page.goto(`file://${join(root, 'dist/pocket-rugby.html')}`);
    const result = await playMatch(page, { label: 'single file', mode: '1p' });
    return { errors, ...result };
  },
  async 'expert-cpu-no-cards'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true }, device: 'Pixel 7' });
    await page.goto(base);
    const result = await playMatch(page, { label: 'expert', mode: '1p', cpu: 'expert', style: 'boot', cards: false });
    check(!result.seen.has('choose:draft'), 'no draft with cards off');
    const m = await saved(page, 'career');
    check(m.byLevel.expert.played === 1, 'the Expert match is in the career record');
    return { errors, ...result };
  },
  async 'guided-first-match'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'short', fast: true, coach: false } });
    await page.goto(base);
    check(await page.isVisible('#btn-learn'), 'a new player is offered the guided match');
    await page.click('#btn-learn');
    let tips = 0;
    const seenTips = new Set();
    page.on('console', () => {});
    const watch = setInterval(async () => {
      const t = await page.evaluate(() => (document.querySelector('#coach').hidden ? null : document.querySelector('#coach-title').textContent)).catch(() => null);
      if (t && !seenTips.has(t)) {
        seenTips.add(t);
        tips++;
      }
    }, 40);
    const result = await playOn(page, { label: 'guided' });
    clearInterval(watch);
    check(result.seen.has('coach'), 'the coach appeared');
    check(seenTips.size >= 6, `coach tips: ${[...seenTips].join(', ')}`);
    check(result.seen.has('choose:draft'), 'the guided match drafts team cards');
    await page.click('#break-actions .btn-quiet');
    check(await page.isHidden('#btn-learn'), 'the big guided-match button goes once it is done');
    const career = await saved(page, 'career');
    check(career.achievements.graduate, 'Graduate unlocked');
    // The career screen lists it.
    await page.click('#btn-career');
    const got = await page.$$eval('.ach.got', li => li.map(x => x.textContent));
    check(got.some(t => t.includes('Graduate')), 'career screen shows Graduate');
    check((await page.$$('.ach')).length === 36, 'all 36 achievements listed');
    return { errors, ...result, actions: result.actions + tips };
  },
  async 'dream-team'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true } });
    await page.goto(base);
    await page.click('#btn-dream');
    const club = () => page.evaluate(() => JSON.parse(localStorage.getItem('pocket-rugby:dream')));
    let s = await club();
    check(s.coins === 600 && s.cards.length === 8 && s.division === 10, `a new club: ${s.coins} coins, ${s.cards.length} players`);
    check((await page.textContent('.dream-next')).includes('Division 10'), 'the next match is in Division 10');
    // A Bronze pack: three cards dealt face down, turned over, added to the club.
    await page.click('.dream-tabs [data-tab="store"]');
    await page.click('.pack-tile.p-bronze');
    await page.click('.pack-closed');
    await page.waitForSelector('.pack-done:not([hidden])', { timeout: 15000 });
    check((await page.$$('.pack-cards .flip.flipped')).length === 3, 'three cards turned over');
    await page.click('.pack-done');
    await page.waitForSelector('.dream-five', { timeout: 5000 });
    s = await club();
    check(s.coins === 300 && s.cards.length === 11 && s.packs === 1, `after the pack: ${s.coins} coins, ${s.cards.length} players`);
    // The squad: five on the cards, three on the bench; swap one from the list.
    check((await page.$$('.dream-five .pcard')).length === 5 && (await page.$$('.dream-bench .pcard')).length === 3, 'five and three');
    await page.click('.dream-five .dream-slot:nth-child(2) .pcard');
    await page.waitForSelector('#dlg-pick[open]');
    await page.click('#pick-body .pcard:nth-child(2)');
    // Play the match: both sides rated, then back to the club with coins.
    await page.click('.dream-tabs [data-tab="club"]');
    await page.click('.dream-next .btn-play');
    const label = await page.textContent('#period');
    check(/Dream Team · Division 10/.test(label), `match label "${label}"`);
    const teams = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-rugby:match')).match.teams);
    check(teams.every(t => t.ratings && Object.keys(t.ratings).length === 5), 'both sides take the field rated');
    const result = await playOn(page, { label: 'dream' });
    const note = await page.textContent('#break-note');
    check(/coins/.test(note), `result note "${note}"`);
    await page.click('#break-actions .btn-primary');
    check(await page.isVisible('#view-dream'), 'back to Dream Team');
    s = await club();
    check(s.played === 1 && s.coins > 300, `after the match: played ${s.played}, ${s.coins} coins`);
    check(s.division === (s.won ? 9 : 10), `division ${s.division} after ${s.won ? 'a win' : 'no win'}`);
    return { errors, ...result };
  },
  async 'world-cup'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true } });
    await page.goto(base);
    await page.click('#btn-tournament');
    await page.click('.team-tile >> text=Wales');
    await page.click('#tournament-body .btn-primary');
    check(await page.isVisible('.next-card'), 'the hub shows the next match');
    const rows = await page.$$('.standings tbody tr');
    check(rows.length === 24, `six pools of four (${rows.length} rows)`);
    check((await page.textContent('.next-card')).includes('Stadium'), 'a World Cup ground');
    // The team sheet: Wales's first five, three on the bench; a Scrum Half on the bench instead.
    await page.click('.next-card .btn-primary');
    await page.waitForSelector('#dlg-sheet[open]');
    const starters = await page.$$eval('#sheet-list .sheet-row:not(.bench) select', s => s.map(x => x.value));
    check(JSON.stringify(starters) === JSON.stringify(['T. Williams', 'J. Morgan', 'B. Thomas', 'L. Rees-Zammit', 'D. Edwards']), `Wales's five: ${starters}`);
    const bench = await page.$$('#sheet-list .sheet-row.bench select');
    check(bench.length === 3, 'three on the bench');
    await bench[2].selectOption('R. Williams');
    // Picking a starter for a slot already filled swaps them round.
    const swapped = await page.$$eval('#sheet-list .sheet-row.bench select', s => s.map(x => x.value));
    check(swapped[2] === 'R. Williams' && new Set(swapped).size === 3, `bench: ${swapped}`);
    await page.click('#btn-sheet-done');
    const label = await page.textContent('#period');
    check(/World Cup · Pool F · Round 1 of 3/.test(label), `match label "${label}"`);
    // Real players: Wales's five, and the bench as picked.
    const team = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-rugby:match')).match.teams[0]);
    check(team.roster.S === 'T. Williams' && team.roster.B === 'D. Edwards', `Wales's squad: ${JSON.stringify(team.roster)}`);
    check(team.subs.some(x => x.name === 'R. Williams' && x.pos === 'S'), `the bench: ${JSON.stringify(team.subs)}`);
    const result = await playOn(page, { label: 'cup' });
    const note = await page.textContent('#break-note');
    check(/Wales are \d(st|nd|rd|th) in Pool F/.test(note), `tournament note "${note}"`);
    await page.click('#break-actions .btn-primary');
    check(await page.isVisible('#view-tournament'), 'back to the hub');
    const played = await page.$$eval('.standings tr.mine td', td => td.map(x => x.textContent));
    check(played[2] === '1', `Wales have played 1 (${played})`);
    const results = await page.$$('.results .fx');
    check(results.length === 12, `round 1 results: ${results.length}`);
    // The tournament survives a reload.
    await page.reload();
    check((await page.textContent('#tournament-label')).includes('Continue the World Cup'), 'home offers to continue');
    await page.click('#btn-tournament');
    check((await page.textContent('.next-card .nc-kicker')).includes('Round 2 of 3'), 'next is round 2');
    return { errors, ...result };
  },
  async 'mythic-deal'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'short', fast: true } });
    await page.goto(base);
    await setUp(page, { mode: '2p', length: 'quick', cards: true });
    await page.waitForSelector('#actions button');
    // The toss, then the deal: Golden Boot (Mythic), Jackal (Epic), Sure Hands (Rare), Big Pack and Midfield Maestro (Common).
    await page.evaluate(() => {
      const script = [0.1, 4 / 12 + 0.01, 0.99, 6 / 11 + 0.01, 0.9, 2 / 10 + 0.01, 0.6, 0.01, 0.1, 0.01, 0.2];
      const real = Math.random;
      Math.random = () => (script.length ? script.shift() : real());
    });
    await page.click('#actions button >> nth=0');
    await page.waitForSelector('.mythic-scene', { timeout: 10000 });
    check((await page.textContent('.my-kicker')) === 'Mythic card!', 'the Mythic reveal');
    check((await page.$$eval('.my-card', x => x.map(n => n.dataset.card))).join() === 'golden-boot', 'the Mythic card in the reveal');
    await page.click('#cinema', { force: true });
    await page.waitForSelector('#draft:not([hidden]) #draft-cards button[data-choice]');
    const dealt = await page.$$eval('#draft-cards .tcard', x => x.map(n => `${n.dataset.card}:${n.dataset.rarity}:${n.querySelector('.tc-rarity').textContent}`));
    check(dealt.join() === 'golden-boot:mythic:Mythic,jackal:epic:Epic,sure-hands:rare:Rare,big-pack:common:Common,midfield-maestro:common:Common', `the deal at its rarities: ${dealt}`);
    check(await page.isVisible('#draft-cards .tcard.r-mythic .tc-foil'), 'the Mythic card shines');
    check((await page.textContent('#draft-cards .tcard.r-mythic .tc-text')).startsWith('Every kick is +40 m and never misses'), 'the Mythic text');
    await page.click('#draft-cards button[data-card="golden-boot"]');
    // Three more picks: two each, and the last card goes back in the pack.
    for (let i = 0; i < 3; i++) {
      await page.waitForSelector('#draft:not([hidden]) #draft-cards button[data-choice]:not([disabled])');
      await page.click('#draft-cards button[data-choice]:not([disabled]) >> nth=0');
    }
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('pocket-rugby:match'))?.match.attacker !== null);
    const drafted = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-rugby:match')).match.teams.map(t => t.cards.map(c => c.id)));
    check(drafted.every(c => c.length === 2) && new Set(drafted.flat()).size === 4 && drafted.flat().includes('golden-boot'), `two cards each: ${JSON.stringify(drafted)}`);
    const result = await playOn(page, { label: 'mythic' });
    return { errors, ...result };
  },
  async 'league-season'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true } });
    await page.goto(base);
    await page.click('#btn-tournament');
    // Every league lists its real teams.
    for (const [comp, count, first] of [['super', 11, 'Blues'], ['prem', 10, 'Bath'], ['urc', 16, 'Leinster'], ['top14', 14, 'Toulouse'], ['champions', 24, 'Leinster']]) {
      await page.click(`.comp:has(input[value="${comp}"])`);
      const tiles = await page.$$eval('.team-tile .tt-name', x => x.map(n => n.textContent));
      check(tiles.length === count && tiles[0] === first, `${comp}: ${tiles.length} teams, first ${tiles[0]}`);
    }
    check((await page.$$('.pool-title')).length === 4, 'the Champions Cup lists its four pools');
    await page.click('.comp:has(input[value="super"])');
    await page.click('.team-tile >> text=Fijian Drua');
    await page.click('#tournament-body .btn-primary');
    check((await page.$$('.standings tbody tr')).length === 11, 'eleven sides in the table');
    check((await page.textContent('#tournament-title')) === 'Super Rugby Pacific', 'the hub is named after the league');
    // Eleven sides: one sits out each round. A bye plays the round out without the user.
    if (await page.isVisible('.next-card.bye')) {
      await page.click('.next-card.bye .btn-primary');
      check((await page.textContent('.next-card .nc-kicker')).includes('Round 2 of 6'), 'after a bye, round 2');
    }
    await kickOff(page);
    const label = await page.textContent('#period');
    check(/^Super Rugby · Round \d of 6/.test(label), `match label "${label}"`);
    const result = await playOn(page, { label: 'league' });
    const note = await page.textContent('#break-note');
    check(/^Fijian Drua are \d+(st|nd|rd|th) in the Super Rugby\.$/.test(note), `league note "${note}"`);
    await page.click('#break-actions .btn-primary');
    check(await page.isVisible('#view-tournament'), 'back to the hub');

    // A Top 14 season over, the user top by a distance: straight into the semi-finals while the barrages are played.
    await page.evaluate(async () => {
      const T = await import('./js/tournament.js');
      const E = await import('./js/engine.js');
      const t = T.createLeague({ league: 'top14', userTeam: 'toulouse', season: 'short', rng: E.seededRng(7) });
      for (const f of t.fixtures) {
        const user = f.home === 'toulouse' ? 'home' : f.away === 'toulouse' ? 'away' : null;
        const winner = user || (f.home < f.away ? 'home' : 'away');
        const big = user ? [40, 0] : [24, 17];
        f.result = { score: winner === 'home' ? big : [big[1], big[0]], tries: winner === 'home' ? [6, 1] : [1, 6], winner };
      }
      T.advance(t);
      localStorage.setItem('pocket-rugby:tournament', JSON.stringify(t));
    });
    await page.reload();
    await page.click('#btn-tournament');
    check((await page.textContent('.next-card.bye .nc-title')) === 'Straight into the semi-finals', 'a top-two finish waits out the barrages');
    const columns = await page.$$eval('.bracket .br-col', cols => cols.map(c => [c.querySelector('.br-title').textContent, c.querySelectorAll('.fx:not(.tbd)').length]));
    check(JSON.stringify(columns) === JSON.stringify([['Barrages', 2], ['Semi-finals', 0], ['Final', 0]]), `the bracket: ${JSON.stringify(columns)}`);
    check((await page.textContent('.bracket .table-note')).includes('go straight into the semi-finals'), 'the top two are named');
    await page.click('.next-card.bye .btn-primary');
    check((await page.textContent('.next-card .nc-kicker')).includes('Semi-final'), 'then the semi-final');
    await kickOff(page);
    const semi = await playOn(page, { label: 'top14-semi' });
    const out = await page.textContent('#break-note');
    check(/^Toulouse are (through to the final!|out in the semi-finals\.)$/.test(out), `semi-final note "${out}"`);
    return { errors, title: `${result.title} / ${semi.title}`, checks: result.checks + semi.checks, actions: result.actions + semi.actions, seen: result.seen };
  },
  async 'online-two-phones'(browser, base) {
    const relay = [];
    const host = await newPage(browser, { prefs: { cinema: 'short', fast: true }, relay });
    const guest = await newPage(browser, { prefs: { cinema: 'off', fast: true }, device: 'Pixel 7', relay });
    await host.page.goto(base);
    await guest.page.goto(base);
    await guest.page.evaluate(() => localStorage.setItem('pocket-rugby:setup', JSON.stringify({ names: ['Gulls', 'Foxes'], colors: ['#1d3577', '#e8701c'] })));
    await guest.page.reload();
    await host.page.click('#btn-online');
    await host.page.click('.ol-card .btn-primary');
    await host.page.waitForSelector('.ol-code', { timeout: 60000 });
    const code = (await host.page.textContent('.ol-code')).replace(/\s/g, '');
    check(/^[A-Z0-9]{6}$/.test(code), `code ${code}`);
    await guest.page.click('#btn-online');
    await guest.page.fill('#online-code', code.toLowerCase());
    await guest.page.click('.ol-join button[type=submit]');
    await host.page.waitForSelector('.page-inner > .btn-primary:not([disabled])', { timeout: 120000 });
    await host.page.click('.page-inner > .btn-primary');
    await guest.page.waitForSelector('#view-match:not([hidden])', { timeout: 120000 });
    // Same colour picked by both: the guest changes strip.
    const colours = await guest.page.$$eval('.side .kit', k => k.map(x => getComputedStyle(x).backgroundColor));
    check(colours[0] !== colours[1], `kits differ: ${colours}`);
    // The guest calls the toss, or doesn't: after 10 seconds it's called for them.
    check(await guest.page.isVisible('.decision-clock.mine'), 'the guest sees their decision clock');
    check(await host.page.isVisible('.decision-clock:not(.mine)'), 'the host sees the guest\'s clock');
    await guest.page.waitForFunction(() => JSON.parse(localStorage.getItem('pocket-rugby:match'))?.match.toss, null, { timeout: 20000 });
    // Auto-roll shows once the draft is done and the ball is in play.
    const autoOn = guest.page.waitForSelector('.auto-btn', { timeout: 180000 })
      .then(b => b.getAttribute('aria-pressed'))
      .then(v => check(v === 'true', 'auto-roll is on online'));
    const results = await Promise.all([
      playOn(host.page, { label: 'host', budgetMs: 600000 }),
      playOn(guest.page, { label: 'guest', budgetMs: 600000 }),
    ]);
    await autoOn;
    const scores = await Promise.all([host, guest].map(p => p.page.textContent('#break-score')));
    check(scores[0] === scores[1], `both phones agree: ${scores}`);
    const titles = results.map(r => r.title);
    const drawn = titles.every(t => t === 'A draw');
    check(drawn || titles.filter(t => t === 'You win!').length === 1, `one winner, or a draw on both: ${titles}`);
    for (const p of [host, guest]) {
      const career = await saved(p.page, 'career');
      check(career.online.played === 1, 'online match recorded');
    }
    return { errors: [...host.errors, ...guest.errors], title: titles.join(' / '), checks: results[0].checks + results[1].checks, actions: results[0].actions + results[1].actions, seen: results[0].seen };
  },
};

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const only = process.env.E2E_ONLY;
const skip = process.env.E2E_SKIP;
const names = Object.keys(SCENARIOS).filter(n => (!only || n.includes(only)) && (!skip || !n.includes(skip)));
let failed = 0;

// A few at a time: each scenario is a browser (the online one is two), and
// CI machines have few cores.
const queue = [...names];
const parallel = Number(process.env.E2E_PARALLEL || 3);
await Promise.all(Array.from({ length: parallel }, async () => {
  for (let name = queue.shift(); name; name = queue.shift()) await runScenario(name);
}));

async function runScenario(name) {
  const t0 = Date.now();
  try {
    const result = await SCENARIOS[name](browser, base);
    const pageErrors = result.errors.filter(e => !/favicon|Failed to load resource/.test(e));
    check(pageErrors.length === 0, `page errors:\n${pageErrors.join('\n')}`);
    console.log(`ok   ${name}  ${result.title}  (${result.actions} taps, ${result.checks} screen checks, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.message.split('\n').join('\n     ')}`);
  }
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} of ${names.length} browser scenarios failed` : `\nall ${names.length} browser scenarios passed`);
process.exit(failed ? 1 : 0);
