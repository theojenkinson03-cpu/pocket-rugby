// The online lobby: host a game and share a code, or join with one. Pure
// rendering; app.js owns the session and passes the state in.

import { MATCH_LENGTHS } from './engine.js';
import { button, el, toggleRow } from './dom.js';
import { kitVars } from './color.js';

function teamBadge(team, note) {
  const b = el('div', 'ol-team');
  kitVars(b, team);
  b.append(el('span', 'ol-kit'), el('b', null, team.name), el('small', null, note));
  return b;
}

function spinner(text) {
  const p = el('p', 'ol-wait');
  p.append(el('i', 'spin'), document.createTextNode(text));
  return p;
}

// Your own side: name, kit and squad, used whichever role you take.
function teamEditor(state, handlers) {
  const box = el('div', 'ol-editor');
  const kitLabel = el('label', 'team-tag', 'Your team');
  const input = el('input', 'team-name');
  input.id = 'online-name';
  kitLabel.htmlFor = 'online-name';
  input.maxLength = 14;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = state.team.name;
  input.addEventListener('input', () => handlers.onTeam({ name: input.value }));
  const swatches = el('div', 'swatches');
  swatches.setAttribute('role', 'radiogroup');
  swatches.setAttribute('aria-label', 'Kit colour');
  for (const kit of state.kits) {
    const sw = el('button', 'swatch');
    sw.type = 'button';
    sw.style.setProperty('--kit', kit.color);
    sw.setAttribute('role', 'radio');
    sw.setAttribute('aria-label', kit.name);
    sw.setAttribute('aria-checked', String(state.team.color === kit.color));
    sw.addEventListener('click', () => handlers.onTeam({ color: kit.color }));
    swatches.append(sw);
  }
  box.style.setProperty('--kit', state.team.color);
  box.append(kitLabel, input, swatches, button('Squad', handlers.onSquad, 'squad-btn ol-squad'));
  return box;
}

function settings(state, handlers) {
  const box = el('div', 'ol-settings');
  const type = el('fieldset', 'seg');
  type.append(el('legend', null, 'Match type'));
  for (const [k, label, note] of [['rolls', 'On the clock', 'A set number of rolls'], ['points', 'Race', 'First to a score']]) {
    const lab = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = 'ol-format';
    input.value = k;
    input.checked = (state.format || 'rolls') === k;
    input.addEventListener('change', () => handlers.onSettings({ format: k }));
    const span = el('span', null, label);
    span.append(el('small', null, note));
    lab.append(input, span);
    type.append(lab);
  }
  box.append(type);
  const seg = el('fieldset', 'seg seg-3');
  seg.append(el('legend', null, 'Match length'));
  for (const [k, v] of Object.entries(MATCH_LENGTHS)) {
    const lab = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = 'ol-length';
    input.value = k;
    input.checked = state.length === k;
    input.addEventListener('change', () => handlers.onSettings({ length: k }));
    const span = el('span', null, v.label);
    span.append(el('small', null, (state.format || 'rolls') === 'rolls' ? `${v.rolls} rolls` : `FT ${v.full}`));
    lab.append(input, span);
    seg.append(lab);
  }
  box.append(
    seg,
    toggleRow('Team cards', 'A draft after the toss', state.cards, on => handlers.onSettings({ cards: on })),
    toggleRow('Bench', 'One replacement a half clears an injury', state.bench, on => handlers.onSettings({ bench: on })),
    toggleRow('Weather', 'Rain and wind, different every match', state.weather, on => handlers.onSettings({ weather: on })),
  );
  return box;
}

export function lobbyPage(state, handlers) {
  const page = el('div', 'page-inner online');

  if (state.phase === 'checking') {
    page.append(spinner('Connecting…'));
    return page;
  }

  if (state.phase === 'unavailable') {
    const card = el('section', 'ol-card');
    card.append(
      el('h3', 'page-h', 'Online play needs claude.ai'),
      el('p', null, 'Two-phone matches run through the page on claude.ai. Open this game there, signed in, on both phones.'),
      el('p', null, 'Your friend needs access to the page: share it with them from the Share menu. Pages opened from a public link can’t join a match.'),
    );
    page.append(card, button('Back', handlers.onCancel, 'btn btn-wide'));
    return page;
  }

  if (state.error) {
    const err = el('p', 'ol-error', state.error);
    err.setAttribute('role', 'alert');
    page.append(err);
  }

  if (state.phase === 'start') {
    page.append(teamEditor(state, handlers));
    const host = el('section', 'ol-card');
    host.append(el('h3', 'page-h', 'Host a match'), el('p', null, 'Get a code to share. You choose the match type and length, team cards, the bench and the weather. Online, your dice roll themselves (turn Auto off to roll by hand) and each decision has 10 seconds: run out of time and the other side gets a penalty.'), button('Host a match', handlers.onHost, 'btn btn-primary btn-wide'));
    const join = el('section', 'ol-card');
    const form = el('form', 'ol-join');
    const code = el('input', 'ol-code-input');
    code.id = 'online-code';
    code.placeholder = 'Code';
    code.autocomplete = 'off';
    code.autocapitalize = 'characters';
    code.spellcheck = false;
    code.maxLength = 8;
    code.inputMode = 'text';
    code.value = state.code || '';
    code.setAttribute('aria-label', 'Match code');
    const go = el('button', 'btn', 'Join');
    go.type = 'submit';
    form.append(code, go);
    form.addEventListener('submit', e => {
      e.preventDefault();
      handlers.onJoin(code.value);
    });
    join.append(el('h3', 'page-h', 'Join a match'), el('p', null, 'Type the six-letter code from your friend’s screen.'), form);
    page.append(host, join);
    return page;
  }

  const net = state.connected ? null : spinner('Reconnecting…');
  if (net) page.append(net);

  // A friends-league match: both phones come straight here from the league.
  if (state.friendsFixture) {
    const fx = state.friendsFixture;
    const card = el('section', 'ol-card ol-vs');
    card.append(el('p', 'nc-kicker', fx.label));
    const host = state.role === 'host';
    const theirs = state.peer?.team || fx.opponent;
    card.append(...(host ? [teamBadge(state.team, 'You · home'), el('span', 'nc-v', 'v'), teamBadge(theirs, state.peer ? 'Here' : 'On their way')] : [teamBadge(theirs, state.peer ? 'Here' : 'On their way'), el('span', 'nc-v', 'v'), teamBadge(state.team, 'You · away')]));
    page.append(card);
    if (state.mismatch) page.append(el('p', 'ol-error', 'You’re on different versions of the game. Both reload the page, then try again.'));
    else if (!state.peer) page.append(spinner(`Waiting for ${fx.friendName || 'your friend'} to open this match on their phone…`));
    else page.append(spinner(host ? 'Kicking off…' : `Waiting for ${fx.friendName || 'your friend'} to kick off…`));
    page.append(button('Back to the league', handlers.onCancel, 'btn btn-quiet btn-wide'));
    return page;
  }

  if (state.phase === 'hosting') {
    const codeBox = el('section', 'ol-card ol-code-card');
    codeBox.append(el('p', 'nc-kicker', 'Your match code'));
    const big = el('p', 'ol-code', state.code.toUpperCase().split('').join(' '));
    big.setAttribute('aria-label', `Code ${state.code.split('').join(' ')}`);
    codeBox.append(big, button(state.copied ? 'Copied' : 'Copy code', handlers.onCopy, 'btn ol-copy'));
    codeBox.append(el('p', null, 'Your friend opens this game on claude.ai, taps Online, then Join a match and types the code.'));
    page.append(codeBox);
    const vs = el('section', 'ol-card ol-vs');
    vs.append(teamBadge(state.team, 'You · host'));
    if (state.peer) vs.append(el('span', 'nc-v', 'v'), teamBadge(state.peer.team, 'Joined'));
    else vs.append(spinner('Waiting for your friend…'));
    page.append(vs);
    if (state.mismatch) page.append(el('p', 'ol-error', 'You’re on different versions of the game. Both reload the page, then try again.'));
    page.append(settings(state, handlers));
    const kick = button('Kick off', handlers.onKickOff, 'btn btn-primary btn-wide', { primary: true });
    kick.disabled = !state.peer || state.mismatch || state.starting;
    page.append(kick, button('Cancel', handlers.onCancel, 'btn btn-quiet btn-wide'));
    return page;
  }

  // Guest, joined and waiting.
  const vs = el('section', 'ol-card ol-vs');
  if (state.peer) vs.append(teamBadge(state.peer.team, 'Host'), el('span', 'nc-v', 'v'));
  vs.append(teamBadge(state.team, 'You'));
  page.append(vs);
  if (state.mismatch) page.append(el('p', 'ol-error', 'You’re on different versions of the game. Both reload the page, then try again.'));
  else if (state.peer) page.append(spinner(`Waiting for ${state.peer.team.name} to kick off…`));
  else page.append(spinner(`Looking for match ${state.code.toUpperCase()}…`), el('p', 'page-note', 'Check the code with your friend if this takes more than a few seconds. Their screen should say “Waiting for your friend”.'));
  page.append(button('Leave', handlers.onCancel, 'btn btn-quiet btn-wide'));
  return page;
}
