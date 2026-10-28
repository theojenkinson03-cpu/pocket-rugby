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
    const buttons = [...document.querySelectorAll(drafting ? '#draft-cards button' : '#actions button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled, waiting: b.classList.contains('waiting'), choice: b.hasAttribute('data-choice'), card: b.dataset.card || null }));
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
    };
  });
}

const ROLL_LABELS = {
  attack: s => new RegExp(`Roll (Scrum Half|Forwards|Centres|Outside Backs|Fly Half)`),
  tackle: () => /Tackle!/,
  ruck: () => /Contest the ruck/,
  try: () => /Go for the line|Video ref/,
  range: () => /range/,
  penalty: () => /Card check/,
  kick: () => /Kick! Need \d+ m/,
  setpiece: () => /Feed the scrum|Throw in/,
};
const NAMES = { S: 'Scrum Half', F: 'Forwards', C: 'Centres', W: 'Outside Backs', B: 'Fly Half' };

// Everything on screen must agree with the saved state while the game waits.
function verify(snap, label) {
  const m = snap.match;
  if (!m) return;
  m.teams.forEach((t, i) => {
    check(snap.sides[i].name === t.name, `${label}: team ${i} name "${snap.sides[i].name}" vs "${t.name}"`);
    if (!snap.sides[i].flipping) check(snap.sides[i].score === String(t.score), `${label}: team ${i} shows ${snap.sides[i].score}, state has ${t.score}`);
    const hasBall = m.attacker === i && m.step.type !== 'halftime' && m.step.type !== 'fulltime';
    check(snap.sides[i].ball === hasBall, `${label}: possession marker for team ${i}`);
    if (t.yellows >= 2) check(/Red/.test(snap.sides[i].chips), `${label}: red card chip`);
    else if (t.sinBin) check(/Sin bin/.test(snap.sides[i].chips), `${label}: sin bin chip`);
    for (const [pos, n] of Object.entries(t.injuries)) if (n) check(snap.sides[i].chips.includes(`${pos} −${n}`), `${label}: injury chip ${pos}`);
  });
  const step = m.step;
  const halfText = step.type === 'halftime' ? 'Half time' : m.half === 1 ? '1st half' : '2nd half';
  check(snap.half === halfText, `${label}: board says "${snap.half}", expected "${halfText}"`);
  if (step.type === 'roll' || step.type === 'choose') {
    check(snap.prompt.includes(m.teams[step.team].name), `${label}: prompt "${snap.prompt}" names ${m.teams[step.team].name}`);
  }
  if (step.type === 'roll') {
    const main = snap.buttons[0];
    check(snap.buttons.length === 1, `${label}: one roll button`);
    check(ROLL_LABELS[step.purpose]().test(main.text), `${label}: button "${main.text}" for ${step.purpose}`);
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
  // The draft shows all three cards, the picked ones stamped; play starts once both sides have one.
  check(snap.drafting === (step.purpose === 'draft'), `${label}: draft panel ${snap.drafting} at ${step.purpose}`);
  if (step.purpose === 'draft') {
    check(snap.buttons.length === 3, `${label}: three cards dealt`);
    for (const id of step.options) check(snap.buttons.some(b => b.card === id && b.choice), `${label}: ${id} can be picked`);
    for (const t of m.teams) if (t.card) check(snap.buttons.some(b => b.card === t.card && !b.choice && b.text.includes(t.name)), `${label}: ${t.card} stamped for ${t.name}`);
  }
  m.teams.forEach((t, i) => check(!!snap.boardCards[i] === !!t.card, `${label}: team ${i} card on the board`));
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
  const buttons = [...document.querySelectorAll('#draft:not([hidden]) #draft-cards button:not([disabled]), #actions button:not([disabled])')];
  buttons[Math.floor(Math.random() * buttons.length)]?.click();
});

async function setUp(page, { mode = '1p', length = 'quick', cpu = null, style = null, cards = null }) {
  await page.click(`[data-start="${mode}"]`);
  await page.click(`#len-${length}`, { force: true });
  if (cpu) await page.click(`#cpu-${cpu}`, { force: true });
  if (style) await page.click(`#style-${style}`, { force: true });
  if (cards !== null && (await page.isChecked('#setup-cards')) !== cards) await page.click('#setup-cards', { force: true });
  await page.click('#setup-form button[type=submit]');
}

async function playMatch(page, { label, mode = '1p', length = 'quick', tapStyle = 'random', skipScenes = true, budgetMs = 420000, setup = true, cpu, style, cards }) {
  if (setup) await setUp(page, { mode, length, cpu, style, cards });
  return playOn(page, { label, tapStyle, skipScenes, budgetMs });
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

async function newPage(browser, { prefs = {}, device = 'iPhone 13', colorScheme = 'light', reducedMotion = 'no-preference', relay = null } = {}) {
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
  return { page, context, errors };
}

const saved = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(`pocket-rugby:${k}`) || 'null'), key);

const SCENARIOS = {
  async 'one-player-full-cinematics'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'full', fast: true } });
    await page.goto(base);
    const result = await playMatch(page, { label: '1p full', mode: '1p' });
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
    const result = await playMatch(page, { label: '2p off', mode: '2p' });
    check(!result.seen.has('cinema'), 'no scenes when cinematics are off');
    return { errors, ...result };
  },
  async 'keyboard-only'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'short', fast: true }, device: 'Desktop Chrome' });
    await page.goto(base);
    const result = await playMatch(page, { label: 'keyboard', mode: '2p', tapStyle: 'keyboard' });
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
    await page.click('#feed .feed-more');
    const logLines = await page.$$eval('#log-list li', li => li.length);
    check(logLines > 10, `match log has ${logLines} lines`);
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
    check((await page.$$('.ach')).length === 28, 'all 28 achievements listed');
    return { errors, ...result, actions: result.actions + tips };
  },
  async 'nations-cup'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true } });
    await page.goto(base);
    await page.click('#btn-tournament');
    await page.click('.team-tile >> text=Wales');
    await page.click('#tournament-body .btn-primary');
    check(await page.isVisible('.next-card'), 'the hub shows the next match');
    const rows = await page.$$('.standings tbody tr');
    check(rows.length === 8, `two pools of four (${rows.length} rows)`);
    await page.click('.next-card .btn-primary');
    const label = await page.textContent('#period');
    check(/Nations Cup · Pool [AB] · Round 1 of 3/.test(label), `match label "${label}"`);
    const result = await playOn(page, { label: 'cup' });
    const note = await page.textContent('#break-note');
    check(/Wales are \d(st|nd|rd|th) in Pool [AB]/.test(note), `tournament note "${note}"`);
    await page.click('#break-actions .btn-primary');
    check(await page.isVisible('#view-tournament'), 'back to the hub');
    const played = await page.$$eval('.standings tr.mine td', td => td.map(x => x.textContent));
    check(played[2] === '1', `Wales have played 1 (${played})`);
    const results = await page.$$('.results .fx');
    check(results.length === 4, `round 1 results: ${results.length}`);
    // The tournament survives a reload.
    await page.reload();
    check((await page.textContent('#tournament-label')).includes('Continue the Nations Cup'), 'home offers to continue');
    await page.click('#btn-tournament');
    check((await page.textContent('.next-card .nc-kicker')).includes('Round 2 of 3'), 'next is round 2');
    return { errors, ...result };
  },
  async 'league-season'(browser, base) {
    const { page, errors } = await newPage(browser, { prefs: { cinema: 'off', fast: true } });
    await page.goto(base);
    await page.click('#btn-tournament');
    // Every league lists its real teams.
    for (const [comp, count, first] of [['Super Rugby Pacific', 11, 'Blues'], ['Prem Rugby', 10, 'Bath'], ['United Rugby Championship', 16, 'Leinster'], ['Top 14', 14, 'Toulouse']]) {
      await page.click(`.comp >> text=${comp}`);
      const tiles = await page.$$eval('.team-tile .tt-name', x => x.map(n => n.textContent));
      check(tiles.length === count && tiles[0] === first, `${comp}: ${tiles.length} teams, first ${tiles[0]}`);
    }
    await page.click('.comp >> text=Super Rugby Pacific');
    await page.click('.team-tile >> text=Fijian Drua');
    await page.click('#tournament-body .btn-primary');
    check((await page.$$('.standings tbody tr')).length === 11, 'eleven sides in the table');
    check((await page.textContent('#tournament-title')) === 'Super Rugby Pacific', 'the hub is named after the league');
    // Eleven sides: one sits out each round. A bye plays the round out without the user.
    if (await page.isVisible('.next-card.bye')) {
      await page.click('.next-card.bye .btn-primary');
      check((await page.textContent('.next-card .nc-kicker')).includes('Round 2 of 6'), 'after a bye, round 2');
    }
    await page.click('.next-card .btn-primary');
    const label = await page.textContent('#period');
    check(/^Super Rugby · Round \d of 6/.test(label), `match label "${label}"`);
    const result = await playOn(page, { label: 'league' });
    const note = await page.textContent('#break-note');
    check(/^Fijian Drua are \d+(st|nd|rd|th) in the Super Rugby\.$/.test(note), `league note "${note}"`);
    await page.click('#break-actions .btn-primary');
    check(await page.isVisible('#view-tournament'), 'back to the hub');

    // A Top 14 season over, the user top: straight into the semi-finals while the barrages are played.
    await page.evaluate(async () => {
      const T = await import('./js/tournament.js');
      const t = T.createLeague({ league: 'top14', userTeam: 'toulouse', season: 'short' });
      for (const f of t.fixtures) {
        const homeWins = f.home === 'toulouse' || (f.away !== 'toulouse' && f.home < f.away);
        f.result = { score: homeWins ? [24, 17] : [12, 22], tries: homeWins ? [4, 2] : [1, 3], winner: homeWins ? 'home' : 'away' };
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
    await page.click('.next-card .btn-primary');
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
    const results = await Promise.all([
      playOn(host.page, { label: 'host', budgetMs: 600000 }),
      playOn(guest.page, { label: 'guest', budgetMs: 600000 }),
    ]);
    const scores = await Promise.all([host, guest].map(p => p.page.textContent('#break-score')));
    check(scores[0] === scores[1], `both phones agree: ${scores}`);
    const titles = results.map(r => r.title);
    check(titles.filter(t => t === 'You win!').length === 1, `one winner: ${titles}`);
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
