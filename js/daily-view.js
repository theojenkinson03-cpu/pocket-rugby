// The daily challenge screen: today's situation, your result, the shared
// leaderboard, and a score card to save or share.

import { CARD_BY_ID, RARITY_BY_ID } from './cards.js';
import { kitShapes, kitVars } from './color.js';
import { PLAYERS } from './dice.js';
import { button, el, tallButton } from './dom.js';
import { scenarioTitle, SITUATIONS } from './daily.js';
import { LEAGUES } from './tournament.js';

const TWIST_TEXT = {
  injured: (s, you) => `Your ${PLAYERS[s.twistPos].one} is carrying an injury (−1).`,
  sinbinned: () => 'You are down to fourteen: a player is in the sin bin (−1 on each tackle die).',
  theirSinBin: (s, you, them) => `${them.name} have a player in the sin bin.`,
  theirInjury: (s, you, them) => `${possessiveOf(them.name)} ${PLAYERS[s.twistPos].one} is carrying an injury (−1).`,
};
const possessiveOf = name => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

const clubs = s => s.teams.map(id => LEAGUES[s.league].teams.find(t => t.id === id));

export function conditionsLine(s, [you, them]) {
  if (!s.weather) return null;
  const parts = [s.weather.rain ? 'Rain' : 'Dry'];
  // The wind's first-half side has swapped: it's the second half.
  if (s.weather.wind !== null) parts.push(`wind with ${[you, them][1 - s.weather.wind].name}`);
  else parts.push('no wind');
  return parts.join(' · ');
}

function kitChip(team, className = 'nc-kit') {
  const chip = el('span', className);
  kitVars(chip, team);
  chip.style.setProperty('--alt', team.alt || team.color);
  return chip;
}

// Today's situation as a card: the clubs, the score, who has the ball.
export function scenarioCard(s) {
  const [you, them] = clubs(s);
  const card = el('section', 'next-card daily-card');
  kitVars(card, you);
  card.append(el('p', 'nc-kicker', `Daily #${s.number} · ${LEAGUES[s.league].short}`), el('h3', 'nc-title', scenarioTitle(s)));
  const vs = el('div', 'nc-vs');
  const side = (team, score, mine) => {
    const box = el('div', `nc-side${mine ? ' mine' : ''}`);
    box.append(kitChip(team), el('b', null, team.name), el('span', 'daily-score', score), el('small', null, mine ? 'You' : 'CPU · Pro'));
    return box;
  };
  vs.append(side(you, s.score[0], true), el('span', 'nc-v', 'v'), side(them, s.score[1], false));
  card.append(vs);
  const home = s.home === 0 ? you : them;
  card.append(el('p', 'nc-venue', `${home.ground} · second half`));
  const facts = el('ul', 'daily-facts');
  const fact = text => text && facts.append(el('li', null, text));
  const sit = SITUATIONS[s.situation];
  fact(`${sit.text}. ${s.situation === 'penalty' ? `${s.range * 10} m out: kick for goal or tap and go.` : sit.detail}`);
  fact(`First to 30. ${them.name} need ${30 - s.score[1]}; you need ${30 - s.score[0]}.`);
  if (s.twist !== 'none') fact(TWIST_TEXT[s.twist](s, you, them));
  if (s.cards) {
    const cardText = i => s.cards[i].map(c => `${RARITY_BY_ID[c.rarity].name} ${CARD_BY_ID[c.id].name}`).join(' and ');
    fact(`Team cards: yours ${cardText(0)}; theirs ${cardText(1)}.`);
  }
  fact(conditionsLine(s, [you, them]));
  fact('The bench is on. Everyone gets this same situation today; the dice are yours.');
  card.append(facts);
  return card;
}

const resultText = r => (r.won ? `Won ${r.score[0]}–${r.score[1]}` : `Lost ${r.score[0]}–${r.score[1]}`);

// The leaderboard rows: {id, rank, team, won, score, mine}, best first.
function leaderboard(state) {
  const box = el('section', 'daily-board');
  box.append(el('h3', 'page-h', 'Today’s leaderboard'));
  if (state.board === 'unavailable') {
    box.append(el('p', 'page-note', 'The shared leaderboard works on claude.ai, for people the page is shared with. Your own results are kept on this phone.'));
    return box;
  }
  if (state.board === 'loading') {
    box.append(el('p', 'page-note', 'Loading…'));
    return box;
  }
  const rows = state.board || [];
  if (!rows.length) {
    box.append(el('p', 'page-note', 'Nobody has finished today’s challenge yet. Be the first.'));
    return box;
  }
  const ol = el('ol', 'leaders board-list');
  rows.forEach(row => {
    const li = el('li', row.mine ? 'mine' : '');
    const who = el('span', 'sp-who');
    if (row.avatar) {
      const img = el('img', 'board-avatar');
      img.src = row.avatar;
      img.alt = '';
      who.append(img);
    }
    who.append(el('b', null, row.name || row.team || 'Someone'), el('small', null, row.team || ''));
    li.append(who, el('span', `sp-num ${row.won ? 'won' : 'lost'}`, resultText(row)));
    ol.append(li);
  });
  box.append(ol);
  if (state.boardNote) box.append(el('p', 'page-note', state.boardNote));
  return box;
}

export function dailyPage(state, handlers) {
  const s = state.scenario;
  const page = el('div', 'page-inner');
  page.append(scenarioCard(s));
  const mine = state.official;
  const status = el('section', 'daily-status');
  if (mine) {
    status.append(el('p', 'nc-meta', `Your result today: ${resultText(mine)}${state.practice ? ` · practice since: ${resultText(state.practice)}` : ''}.`));
    const share = el('div', 'daily-share');
    share.append(button('Save score card', handlers.onSaveCard, 'btn btn-primary'), button('Copy result', handlers.onCopy, 'btn'));
    status.append(share);
    if (state.copied) status.append(el('p', 'page-note', 'Copied. Paste it anywhere.'));
    if (state.shareError) status.append(el('p', 'page-note', state.shareError));
    status.append(tallButton('Practice', 'Play it again; it won’t count', handlers.onPractice, 'btn'));
  } else if (state.abandoned) {
    status.append(el('p', 'nc-meta', 'Today’s attempt was left unfinished, so there’s no result for the leaderboard today. Practise as much as you like.'));
    status.append(tallButton('Practice', 'Play today’s situation; it won’t count', handlers.onPractice, 'btn btn-primary'));
  } else if (state.inProgress) {
    status.append(tallButton('Carry on', 'Your attempt is still going', handlers.onResume, 'btn btn-primary'));
  } else {
    status.append(tallButton('Play today’s challenge', 'Your first finished attempt counts', handlers.onPlay, 'btn btn-primary btn-play'));
  }
  page.append(status);
  page.append(leaderboard(state));
  if (state.history?.length) {
    const past = el('section', 'daily-history');
    past.append(el('h3', 'page-h', 'Your past days'));
    const ul = el('ul', 'seasons');
    for (const h of state.history.slice(0, 14)) {
      const li = el('li', 'season-row');
      const head = el('span', 'sr-head');
      head.append(el('b', null, `#${h.number}`), el('span', null, h.title));
      li.append(head, el('span', 'sr-line', resultText(h)));
      ul.append(li);
    }
    past.append(ul);
    page.append(past);
  }
  page.append(el('p', 'fineprint', `A new challenge every day at midnight UTC. Real teams and players, named for fun: squads are a best guess at the current season and players move clubs. Not affiliated with or endorsed by any player, league, union or club.`));
  return page;
}

// ---- The score card: a picture to save and share ---------------------------------

function drawKit(c, team, x, y, w, h) {
  for (const shape of kitShapes(team)) {
    c.globalAlpha = shape.opacity;
    c.fillStyle = shape.fill;
    if (shape.type === 'rect') c.fillRect(x + shape.x * w, y + shape.y * h, shape.w * w, shape.h * h);
    else {
      c.beginPath();
      shape.points.forEach(([px, py], i) => (i ? c.lineTo(x + px * w, y + py * h) : c.moveTo(x + px * w, y + py * h)));
      c.closePath();
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

// A 1080 × 1350 card: the day, the situation, the final score and how it went.
export async function scoreCard(s, result, match, history = []) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  try {
    await document.fonts?.ready;
  } catch {
    // Fonts are a nicety.
  }
  const display = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
  const label = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const teams = match.teams;
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f1a14');
  bg.addColorStop(1, '#1b2a20');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  // Kit stripes down each side.
  drawKit(c, teams[0], 0, 0, 36, H);
  drawKit(c, teams[1], W - 36, 0, 36, H);

  c.textAlign = 'center';
  c.fillStyle = '#f3c623';
  c.font = `700 44px ${label}`;
  c.fillText(`POCKET RUGBY DAILY #${s.number}`, W / 2, 120);
  c.fillStyle = 'rgba(243, 246, 239, 0.7)';
  c.font = `600 34px ${label}`;
  c.fillText(new Date(`${s.key}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase(), W / 2, 172);

  c.fillStyle = '#f3f6ef';
  c.font = `900 96px ${display}`;
  c.fillText(scenarioTitle(s).toUpperCase(), W / 2, 300);

  // The teams and the final score.
  const row = (i, y) => {
    drawKit(c, teams[i], 120, y - 62, 70, 84);
    c.textAlign = 'left';
    c.fillStyle = '#f3f6ef';
    c.font = `900 64px ${display}`;
    const name = teams[i].name.toUpperCase();
    c.fillText(name.length > 18 ? `${name.slice(0, 17)}…` : name, 220, y);
    c.textAlign = 'right';
    c.font = `900 120px ${display}`;
    c.fillText(String(teams[i].score), W - 120, y + 10);
  };
  row(0, 520);
  row(1, 700);
  c.textAlign = 'center';
  c.fillStyle = 'rgba(243, 246, 239, 0.5)';
  c.font = `600 32px ${label}`;
  c.fillText(`FROM ${s.score[0]}–${s.score[1]}`, W / 2, 800);

  c.fillStyle = result.won ? '#4cc777' : '#ff7a6b';
  c.font = `900 110px ${display}`;
  const margin = Math.abs(result.margin);
  c.fillText(result.won ? `WON BY ${margin}` : `LOST BY ${margin}`, W / 2, 960);

  // One square per score after the start: yours green, theirs red.
  const size = 46;
  const gap = 12;
  const shown = history.slice(0, 16);
  let x = W / 2 - (shown.length * (size + gap) - gap) / 2;
  for (const team of shown) {
    c.fillStyle = team === 0 ? '#4cc777' : '#ff7a6b';
    c.fillRect(x, 1020, size, size);
    x += size + gap;
  }

  c.fillStyle = 'rgba(243, 246, 239, 0.55)';
  c.font = `600 30px ${label}`;
  c.fillText('AN UNOFFICIAL, FAN-MADE DICE RUGBY GAME', W / 2, H - 80);
  return new Promise(resolve => canvas.toBlob(blob => resolve({ blob, url: canvas.toDataURL('image/png') }), 'image/png'));
}
