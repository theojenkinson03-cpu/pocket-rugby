// How a team card looks: a printed card with a colour band for its kind,
// an icon, its rarity, its name and what it does. Also a small chip for the
// scoreboard.

import { cardTier, RARITY_BY_ID } from './cards.js';
import { el, svgEl } from './dom.js';
import { kitVars } from './color.js';

// Line icons on a 24-unit grid, one per kind of card.
const ICONS = {
  Attack: ['M3 12h14', 'M12 6l6 6-6 6', 'M3 7h5', 'M3 17h5'],
  Kicking: ['M7 3v18', 'M17 3v18', 'M7 13h10', 'M12 9l0 0'],
  Defence: ['M12 3l7 3v6c0 4.6-3 7.6-7 9-4-1.4-7-4.4-7-9V6z', 'M9 12l2 2 4-4'],
  Finishing: ['M5.6 18.4C3 15.8 4 10 7.5 6.5S15.8 3 18.4 5.6 20 14 16.5 17.5 8.2 21 5.6 18.4z', 'M8.5 15.5l7-7', 'M10 11.5l2.5 2.5', 'M12 9.5l2.5 2.5'],
  'Set piece': ['M5 9a2 2 0 104 0 2 2 0 10-4 0', 'M10 9a2 2 0 104 0 2 2 0 10-4 0', 'M15 9a2 2 0 104 0 2 2 0 10-4 0', 'M4 16c2-2 14-2 16 0', 'M6 20c2-1.5 10-1.5 12 0'],
  Discipline: ['M4 12a5 5 0 1010 0 5 5 0 10-10 0', 'M14 9h7v4h-6', 'M9 12h.01'],
};

export const TAG_COLORS = {
  Attack: '#d4462f',
  Kicking: '#c98a0b',
  Defence: '#2c66c8',
  Finishing: '#178a55',
  'Set piece': '#7449c6',
  Discipline: '#11837f',
};

export function cardIcon(tag, className = 'tc-icon') {
  const icon = svgEl('svg', { viewBox: '0 0 24 24', class: className, 'aria-hidden': 'true' });
  for (const d of ICONS[tag] || ICONS.Attack) svgEl('path', { d }, icon);
  return icon;
}

// The rarity, as a small gem and its name.
export function rarityBadge(rarity, className = 'tc-rarity') {
  const badge = el('span', `${className} r-${rarity}`);
  badge.append(el('i', 'tc-gem'), el('span', null, RARITY_BY_ID[rarity].name));
  return badge;
}

// The full card at its rarity. `taken`: the team that drafted it, shown as a
// stamp. `uses`: for limited cards, how many uses are left this half or match.
export function cardArt(id, { rarity = 'common', taken = null, uses = null, tag = 'div' } = {}) {
  const card = cardTier(id, rarity);
  const node = el(tag, `tcard r-${card.rarity}`);
  node.style.setProperty('--tag', TAG_COLORS[card.tag]);
  node.dataset.card = id;
  node.dataset.rarity = card.rarity;
  const band = el('span', 'tc-band');
  band.append(cardIcon(card.tag), el('span', 'tc-tag', card.tag));
  node.append(band, rarityBadge(card.rarity), el('b', 'tc-name', card.name), el('span', 'tc-text', card.text));
  if (card.rarity === 'mythic') node.append(el('span', 'tc-foil'));
  if (uses) node.append(el('span', `tc-uses${uses.left ? '' : ' spent'}`, uses.left ? `${uses.left} ${uses.left === 1 ? 'use' : 'uses'} left this ${uses.per}` : `Used this ${uses.per}`));
  if (taken) {
    const stamp = el('span', 'tc-taken');
    kitVars(stamp, taken);
    stamp.append(el('small', null, 'Picked by'), el('b', null, taken.name));
    node.append(stamp);
    node.classList.add('taken');
  }
  return node;
}

// What's left of a limited card's uses (the first one counted by the half
// or the match), or null for cards without such a limit.
export function cardUses(match, team) {
  const t = match.teams[team];
  const limits = t.card ? cardTier(t.card, t.cardRarity).effects.uses : null;
  const counted = Object.entries(limits || {}).find(([, limit]) => limit.per === 'half' || limit.per === 'match');
  if (!counted) return null;
  const [key, limit] = counted;
  return { left: Math.max(0, limit.n - (t.cardUses?.[key] || 0)), per: limit.per };
}

// A small chip: icon and name, for the scoreboard and lists. Rare and above
// show their rarity's gem.
export function cardChip(id, className = 'tc-chip', rarity = 'common') {
  const card = cardTier(id, rarity);
  const chip = el('span', `${className} r-${card.rarity}`);
  chip.style.setProperty('--tag', TAG_COLORS[card.tag]);
  chip.append(cardIcon(card.tag, 'tc-chip-icon'), el('span', null, card.name));
  if (card.rarity !== 'common') {
    const gem = el('i', 'tc-gem');
    gem.title = RARITY_BY_ID[card.rarity].name;
    chip.append(gem);
  }
  return chip;
}
