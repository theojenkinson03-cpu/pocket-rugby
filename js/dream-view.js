// Dream Team screens: the club (your division and the next match), the
// squad (five to start, three on the bench), the store (packs) and your
// players; and the pack opening, card by card, with a walkout for an Elite.

import { DIVISIONS, levelFor, opponentFor, PACKS, playerOf, playerById, SELL_PRICE, squadReady, teamRating, TIER_NAMES, canSell } from './dream.js';
import { PLAYERS, POSITIONS } from './dice.js';
import { LEVELS } from './ai.js';
import { button, el } from './dom.js';

const coins = n => `${n.toLocaleString('en-GB')}`;
const surnameOf = name => name.replace(/^[A-Z]\.\s*/, '');

// A player card: rating, position, name and side, in the tier's finish.
export function playerCard(p, { size = '', note = null, onClick = null } = {}) {
  const c = el(onClick ? 'button' : 'div', `pcard t-${p.tier} ${size}`.trim());
  if (onClick) {
    c.type = 'button';
    c.addEventListener('click', onClick);
  }
  c.style.setProperty('--side', p.color);
  c.style.setProperty('--side-alt', p.alt);
  const top = el('div', 'pc-top');
  top.append(el('b', 'pc-rating', String(p.rating)), el('span', 'pc-pos', PLAYERS[p.pos].short));
  const shirt = el('span', 'pc-shirt');
  shirt.setAttribute('aria-hidden', 'true');
  c.append(top, shirt, el('b', 'pc-name', surnameOf(p.name)), el('small', 'pc-side', p.short));
  if (note) c.append(el('small', 'pc-note', note));
  c.setAttribute('aria-label', `${p.name}, ${PLAYERS[p.pos].one}, ${p.side}, rated ${p.rating}, ${TIER_NAMES[p.tier]}`);
  return c;
}

function tabs(current, onTab) {
  const bar = el('div', 'tabs dream-tabs');
  bar.setAttribute('role', 'tablist');
  for (const [id, label] of [['club', 'Club'], ['squad', 'Squad'], ['store', 'Store'], ['players', 'Players']]) {
    const b = button(label, () => onTab(id));
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(id === current));
    b.dataset.tab = id;
    bar.append(b);
  }
  return bar;
}

function header(s) {
  const head = el('div', 'dream-head');
  const crest = el('span', 'dream-crest');
  crest.style.setProperty('--kit', s.color);
  const name = el('div', 'dream-name');
  name.append(el('b', null, s.name), el('small', null, `Division ${s.division} · rated ${teamRating(s)}`));
  const purse = el('div', 'dream-coins');
  purse.append(el('i', 'coin-ico'), el('b', 'coin-n', coins(s.coins)));
  purse.setAttribute('aria-label', `${s.coins} coins`);
  head.append(crest, name, purse);
  return head;
}

function clubTab(s, h) {
  const panel = el('div', 'dream-panel');
  // The ladder: ten divisions, where you are, your best.
  const ladder = el('ol', 'ladder');
  ladder.setAttribute('aria-label', `Division ${s.division} of 10`);
  for (const d of DIVISIONS) {
    const li = el('li', `${d === s.division ? 'now' : ''}${d > s.division ? ' done' : ''}`.trim(), String(d));
    ladder.append(li);
  }
  const opp = opponentFor(s);
  const next = el('section', 'next-card dream-next');
  next.style.setProperty('--kit', s.color);
  next.append(el('p', 'nc-kicker', `Division ${s.division}${s.division === 1 ? ' · the title' : ' · win to go up'}`));
  const vs = el('div', 'nc-vs');
  const side = (name, sub, color) => {
    const x = el('div', 'nc-side');
    const kit = el('span', 'nc-kit');
    kit.style.background = color;
    x.append(kit, el('b', null, name), el('small', null, sub));
    return x;
  };
  vs.append(side(s.name, `Rated ${teamRating(s)}`, s.color), el('span', 'nc-v', 'v'), side(opp.team.name, `Rated ${opp.rating} · ${LEVELS[levelFor(s.division)].name}`, opp.team.color));
  next.append(vs);
  const ready = squadReady(s);
  const play = el('button', 'btn btn-primary btn-play');
  play.type = 'button';
  play.dataset.primary = '';
  play.append(el('span', null, 'Play'), el('small', null, ready ? 'Quick match on the clock · team cards · bench' : 'Pick five to start first'));
  play.disabled = !ready;
  play.addEventListener('click', h.onPlay);
  next.append(play);
  panel.append(ladder, next);
  if (s.last) {
    const r = s.last;
    const line = el('p', `dream-last ${r.result}`, `Last match: ${r.result === 'win' ? 'won' : r.result === 'draw' ? 'drew' : 'lost'} ${r.score[0]}–${r.score[1]} v ${r.opponent}. +${coins(r.coins)} coins${r.title ? ' · Division 1 champions!' : r.promoted ? ' · promoted' : ''}.`);
    panel.append(line);
  }
  const stats = el('div', 'dream-stats');
  for (const [label, value] of [['Played', s.played], ['Won', s.won], ['Best div', s.best], ['Titles', s.titles]]) {
    const t = el('div', 'stat-tile');
    t.append(el('span', 'st-label', label), el('b', 'st-value', String(value)));
    stats.append(t);
  }
  panel.append(stats);
  const rename = el('div', 'dream-rename');
  const input = el('input', 'team-name');
  input.value = s.name;
  input.maxLength = 14;
  input.setAttribute('aria-label', 'Club name');
  input.addEventListener('change', () => h.onRename(input.value));
  const colours = el('div', 'dream-colours');
  for (const c of ['#1d3577', '#c8102e', '#0b6e3b', '#121314', '#f2c230', '#6b3fd6', '#e8701c', '#74acdf']) {
    const sw = el('button', 'swatch');
    sw.type = 'button';
    sw.style.setProperty('--kit', c);
    sw.setAttribute('aria-label', `Club colour ${c}`);
    sw.setAttribute('aria-checked', String(c === s.color));
    sw.addEventListener('click', () => h.onColour(c));
    colours.append(sw);
  }
  rename.append(el('p', 'squad-h', 'Your club'), input, colours);
  panel.append(rename);
  return panel;
}

function squadTab(s, h) {
  const panel = el('div', 'dream-panel');
  const top = el('div', 'dream-row');
  top.append(el('p', 'squad-h', `Starting five · rated ${teamRating(s)}`), button('Best side', h.onAuto, 'btn btn-quiet btn-small'));
  const five = el('div', 'dream-five');
  for (const pos of POSITIONS) {
    const p = playerOf(s, s.squad.start[pos]);
    const slot = el('div', 'dream-slot');
    slot.append(el('span', 'slot-pos', PLAYERS[pos].short));
    if (p) slot.append(playerCard(p, { size: 'small', note: p.pos !== pos ? 'Out of position −1' : null, onClick: () => h.onSlot(`start:${pos}`) }));
    else slot.append(button('+', () => h.onSlot(`start:${pos}`), 'pcard empty small'));
    five.append(slot);
  }
  const bench = el('div', 'dream-bench');
  for (let i = 0; i < 3; i++) {
    const p = playerOf(s, s.squad.bench[i]);
    const slot = el('div', 'dream-slot');
    slot.append(el('span', 'slot-pos', `Sub ${i + 1}`));
    if (p) slot.append(playerCard(p, { size: 'small', onClick: () => h.onSlot(`bench:${i}`) }));
    else slot.append(button('+', () => h.onSlot(`bench:${i}`), 'pcard empty small'));
    bench.append(slot);
  }
  panel.append(top, five, el('p', 'squad-h', 'Bench'), bench, el('p', 'dream-help', 'Ratings change the dice: 88 and up is +1 on every run, under 70 is −1. A Fly Half under 78 can’t kick 60 m (under 70, 40 m at most); 88 and up adds 10 m. Anyone can play anywhere, at −1 out of position.'));
  return panel;
}

function storeTab(s, h) {
  const panel = el('div', 'dream-panel store');
  for (const pack of PACKS) {
    const b = el('button', `pack-tile p-${pack.id}`);
    b.type = 'button';
    const odds = Object.entries(pack.odds).filter(([, w]) => w).map(([t, w]) => `${TIER_NAMES[t]} ${w}%`).join(' · ');
    b.append(el('span', 'pack-art'), el('b', 'pack-name', pack.name), el('small', 'pack-odds', `${pack.count} players · at least one ${TIER_NAMES[pack.least]} · ${odds}`));
    const price = el('span', 'pack-price');
    price.append(el('i', 'coin-ico'), el('b', null, coins(pack.cost)));
    b.append(price);
    b.disabled = s.coins < pack.cost;
    b.addEventListener('click', () => h.onBuy(pack.id));
    panel.append(b);
  }
  panel.append(el('p', 'dream-help', `Earn coins by playing: ${coins(250)} a win, more the higher your division, and 25 a try. Let a player go from Players for ${Object.entries(SELL_PRICE).map(([t, n]) => `${n} (${TIER_NAMES[t]})`).join(', ')}.`));
  return panel;
}

function playersTab(s, h) {
  const panel = el('div', 'dream-panel');
  const grid = el('div', 'dream-grid');
  const cards = s.cards.map(c => ({ c, p: playerById(c.pid) })).filter(x => x.p).sort((a, b) => b.p.rating - a.p.rating);
  for (const { c, p } of cards) {
    const inSide = !canSell(s, c.id);
    grid.append(playerCard(p, { size: 'small', note: inSide ? 'In the side' : null, onClick: () => h.onCard(c.id) }));
  }
  panel.append(el('p', 'squad-h', `${cards.length} players`), grid);
  return panel;
}

export function dreamPage(s, tab, h) {
  const page = el('div', 'page-inner dream');
  const panels = { club: clubTab, squad: squadTab, store: storeTab, players: playersTab };
  page.append(header(s), tabs(tab, h.onTab), panels[tab](s, h));
  return page;
}

// A list of the club's players to put in a slot, best first.
export function pickerList(s, slot, onPick) {
  const pos = slot.startsWith('start:') ? slot.slice(6) : null;
  const list = el('div', 'dream-grid picker');
  const cards = s.cards.map(c => ({ c, p: playerById(c.pid) })).filter(x => x.p)
    .sort((a, b) => (pos ? (b.p.pos === pos) - (a.p.pos === pos) : 0) || b.p.rating - a.p.rating);
  for (const { c, p } of cards) list.append(playerCard(p, { size: 'small', note: pos && p.pos !== pos ? '−1 here' : null, onClick: () => onPick(c.id) }));
  return list;
}

// ---- The pack opening ----
// The pack shakes and bursts; the cards land face down and turn over one
// by one, the best last. An Elite gets a walkout: the lights go down, the
// side's colours sweep in, the rating counts up, then the name.
export function packOpening(pack, players, { reduced = false, onDone }) {
  const stage = el('div', 'pack-stage');
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-label', `${pack.name} opening`);
  const wrapper = el('div', `pack-closed p-${pack.id}`);
  wrapper.append(el('span', 'pack-art'), el('b', 'pack-name', pack.name), el('small', null, 'Tap to open'));
  const row = el('div', 'pack-cards');
  const done = button('Add to club', () => {
    stage.classList.add('out');
    setTimeout(() => {
      stage.remove();
      onDone();
    }, reduced ? 0 : 260);
  }, 'btn btn-primary pack-done');
  done.hidden = true;
  stage.append(wrapper, row, done);
  const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));
  let skipping = false;
  const turnOver = async (p, slot) => {
    if (p.tier === 'elite' && !skipping && !reduced) await walkout(stage, p);
    slot.classList.add('flipped');
    await wait(skipping ? 60 : 520);
  };
  const reveal = async () => {
    wrapper.classList.add('burst');
    await wait(420);
    wrapper.hidden = true;
    const slots = players.map(p => {
      const slot = el('div', `flip t-${p.tier}`);
      const back = el('div', 'flip-back');
      back.append(el('span', null, '?'));
      const front = playerCard(p);
      front.classList.add('flip-front');
      slot.append(back, front);
      row.append(slot);
      return slot;
    });
    await wait(450);
    for (const [i, p] of players.entries()) await turnOver(p, slots[i]);
    done.hidden = false;
    done.focus();
  };
  wrapper.addEventListener('click', reveal, { once: true });
  row.addEventListener('click', () => (skipping = true));
  document.body.append(stage);
  wrapper.focus?.();
  return stage;
}

function walkout(stage, p) {
  return new Promise(resolve => {
    const w = el('div', 'walkout');
    w.style.setProperty('--side', p.color);
    w.style.setProperty('--side-alt', p.alt);
    const beams = el('div', 'wo-beams');
    const rating = el('b', 'wo-rating', '0');
    const pos = el('span', 'wo-pos', PLAYERS[p.pos].one);
    const side = el('span', 'wo-side', p.side);
    const name = el('b', 'wo-name', p.name);
    w.append(beams, side, pos, rating, name);
    stage.append(w);
    let n = 40;
    const tick = setInterval(() => {
      n = Math.min(p.rating, n + 3);
      rating.textContent = String(n);
      if (n >= p.rating) {
        clearInterval(tick);
        w.classList.add('named');
      }
    }, 40);
    const finish = () => {
      clearInterval(tick);
      w.classList.add('out');
      setTimeout(() => {
        w.remove();
        resolve();
      }, 300);
    };
    const timer = setTimeout(finish, 2600);
    w.addEventListener('click', () => {
      clearTimeout(timer);
      finish();
    }, { once: true });
  });
}
