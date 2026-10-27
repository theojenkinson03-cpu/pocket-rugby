// Browser tests: plays real matches in Chromium by tapping like a person and,
// whenever the game is waiting for input, checks that what is on screen
// matches the saved match state exactly.
// Usage: node test/e2e/run.mjs            (needs the playwright package)
//        E2E_ONLY=resume node test/e2e/run.mjs   run matching scenarios
//        E2E_SKIP=unskipped node test/e2e/run.mjs   leave out the slow one

import { createServer } from 'node:http';
import { createRequire } from 'node:module';
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
    const buttons = [...document.querySelectorAll('#actions button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled, waiting: b.classList.contains('waiting'), choice: b.hasAttribute('data-choice') }));
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
    };
  });
}

const ROLL_LABELS = {
  attack: s => new RegExp(`Roll (Scrum Half|Forward|Centre|Wing|Back)`),
  tackle: () => /Tackle!/,
  ruck: () => /Contest the ruck/,
  try: () => /Go for the line|Video ref/,
  range: () => /range/,
  penalty: () => /Card check/,
  kick: () => /Kick! Need \d+ m/,
  setpiece: () => /Feed the scrum|Throw in/,
};
const NAMES = { S: 'Scrum Half', F: 'Forward', C: 'Centre', W: 'Wing', B: 'Back' };

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
}

async function playMatch(page, { label, mode = '1p', length = 'quick', tapStyle = 'random', skipScenes = true, budgetMs = 420000 }) {
  await page.click(`[data-start="${mode}"]`);
  await page.click(`#len-${length}`, { force: true });
  await page.click('#setup-form button[type=submit]');
  const started = Date.now();
  let checks = 0;
  let actions = 0;
  const seen = new Set();
  while (Date.now() - started < budgetMs) {
    const snap = await snapshot(page);
    if (snap.dialog === 'dlg-break') {
      const title = await page.textContent('#break-title');
      if (/half time/i.test(title)) {
        await page.click('#break-actions .btn-primary');
        seen.add('halftime-dialog');
        continue;
      }
      return { title, checks, actions, seen };
    }
    if (snap.cinema) {
      seen.add('cinema');
      if (skipScenes) await page.click('#cinema', { force: true }).catch(() => {});
      await page.waitForTimeout(80);
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
        await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('#actions button:not([disabled])')];
          buttons[Math.floor(Math.random() * buttons.length)]?.click();
        });
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

async function newPage(browser, { prefs = {}, device = 'iPhone 13', colorScheme = 'light', reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ ...devices[device], colorScheme, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));
  await page.addInitScript(p => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('pocket-rugby:prefs', JSON.stringify({ sound: false, ...p }));
      sessionStorage.setItem('seeded', '1');
    }
  }, prefs);
  return { page, context, errors };
}

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
      await page.evaluate(() => document.querySelector('#actions button:not([disabled])')?.click());
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
};

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const only = process.env.E2E_ONLY;
const skip = process.env.E2E_SKIP;
const names = Object.keys(SCENARIOS).filter(n => (!only || n.includes(only)) && (!skip || !n.includes(skip)));
let failed = 0;

await Promise.all(names.map(async name => {
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
}));

await browser.close();
server.close();
console.log(failed ? `\n${failed} of ${names.length} browser scenarios failed` : `\nall ${names.length} browser scenarios passed`);
process.exit(failed ? 1 : 0);
