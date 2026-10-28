// Team cards: two each per match, drafted after the toss from five dealt
// cards. The toss loser picks first and fourth, the winner second and third,
// and the fifth card is discarded. Every card is data the engine reads at a
// named hook, so each effect is small and testable.
//
// Each card comes in four rarities. A Common card is the card as it always
// was; every rarity above it keeps everything below and adds to it. Rarity is
// rolled for each card as it is dealt, so a Mythic can turn up as any pick:
// one in five deals has at least one.
//
// value: how much the card lifts a side's chance of winning against a side
// with no card (its win rate above 50%) in a race to the target; clock: the
// same on the clock. Both measured over 4,000 CPU matches each, at standard
// length, by scripts/balance-cards.mjs. Cards count for less on the clock,
// where there are fewer scores to swing.
//
// Effects:
//   runBonus        {pos: {hitUp, special}}  added to that player's run intensity
//   faceSwap        {pos: {knockon|touch|intercept: 'pass'}}  a losing face becomes a free pass
//   passToDrop      [pos]  that player's free pass becomes a drop-goal chance
//   kickBonus       {conversion|penalty|drop: n}  added to the black die's kick distance
//   tackleBonus     {hitUp, special}  +1 on 1 (the first) or 2 (both) brown dice when you tackle that kind of run
//   ruckMax         n   highest Hit Up a Big Hit can contest (rules: 4)
//   ruckOnSecond    true  a Big Hit on the second die also contests the ruck
//   ruckAlsoWins    [results]  extra black-die results that win you the ruck
//   ruckOnSpecial   true  a Big Hit also contests the ruck against big moves
//   specialDefence  n   opponents' big moves are this much lower against you
//   hitUpDefence    n   opponents' Hit Ups are this much lower against you,
//   hitUpDefenceFrom n  for Hit Ups of this number or more
//   setPieceTies    true  scrum resets and crooked lineouts go to you
//   setPieceAdvantage n  runs of quick-tap style +1 after winning a set piece
//   ownFeedWins     true  you never lose a scrum or lineout on your own feed
//   stealFeed       [piece]  the other side's scrums or lineouts that they would win go to you
//   keepBall        [penalty|drop]  after that kind of goal they take the restart instead (limited by uses)
//   noCards         true  the referee never shows them a yellow or red card
//   uses            {tryRerolls|ownFeedPenalty|theirFeedPenalty|keepBall: {n, per}}  limited effects,
//                   per 'match' or 'half'; per 'try' is n for each try attempt; per 'always' has no limit

export const RARITIES = [
  { id: 'common', name: 'Common', odds: 0.55 },
  { id: 'rare', name: 'Rare', odds: 0.28 },
  { id: 'epic', name: 'Epic', odds: 0.13 },
  { id: 'mythic', name: 'Mythic', odds: 0.04 },
];
export const RARITY_IDS = RARITIES.map(r => r.id);
export const RARITY_BY_ID = Object.fromEntries(RARITIES.map(r => [r.id, r]));

const tiers = (common, rare, epic, mythic) => ({ common, rare, epic, mythic });

export const CARDS = [
  {
    id: 'big-pack',
    name: 'Big Pack',
    tag: 'Attack',
    tiers: tiers(
      { value: 0.086, clock: 0.054, text: "The Forwards' Hit Ups are +1, and Line Break is 8.", effects: { runBonus: { F: { hitUp: 1, special: 2 } } } },
      { value: 0.125, clock: 0.092, text: "The Forwards' Hit Ups are +2, and Line Break is 8.", effects: { runBonus: { F: { hitUp: 2, special: 2 } } } },
      { value: 0.193, clock: 0.136, text: "The Forwards' Hit Ups are +2, Line Break is 8, and they never knock on.", effects: { runBonus: { F: { hitUp: 2, special: 2 } }, faceSwap: { F: { knockon: 'pass' } } } },
      { value: 0.221, clock: 0.174, text: "The Forwards' Hit Ups are +3, Line Break is 10, they never knock on, and the Scrum Half's Hit Up is +2 behind them.", effects: { runBonus: { F: { hitUp: 3, special: 4 }, S: { hitUp: 2, special: 0 } }, faceSwap: { F: { knockon: 'pass' } } } },
    ),
  },
  {
    id: 'midfield-maestro',
    name: 'Midfield Maestro',
    tag: 'Attack',
    tiers: tiers(
      { value: 0.100, clock: 0.080, text: 'Your Centres are never intercepted: Intercepted becomes a pass.', effects: { faceSwap: { C: { intercept: 'pass' } } } },
      { value: 0.126, clock: 0.083, text: 'Your Centres are never intercepted, their Hit Ups are +1, and Thru the Gap is 8.', effects: { faceSwap: { C: { intercept: 'pass' } }, runBonus: { C: { hitUp: 1, special: 1 } } } },
      { value: 0.160, clock: 0.114, text: 'Your Centres are never intercepted, their Hit Ups are +2, and Thru the Gap is 9.', effects: { faceSwap: { C: { intercept: 'pass' } }, runBonus: { C: { hitUp: 2, special: 2 } } } },
      { value: 0.225, clock: 0.175, text: "Your Centres are never intercepted, their Hit Ups are +3, Thru the Gap is 10, and everyone else's Hit Ups are +1 behind them.", effects: { faceSwap: { C: { intercept: 'pass' } }, runBonus: { C: { hitUp: 3, special: 3 }, S: { hitUp: 1, special: 0 }, F: { hitUp: 1, special: 0 }, W: { hitUp: 1, special: 0 }, B: { hitUp: 1, special: 0 } } } },
    ),
  },
  {
    id: 'sure-hands',
    name: 'Sure Hands',
    tag: 'Attack',
    tiers: tiers(
      { value: 0.107, clock: 0.086, text: 'Your Outside Backs never lose it: Knock On and Into Touch become passes.', effects: { faceSwap: { W: { knockon: 'pass', touch: 'pass' } } } },
      { value: 0.138, clock: 0.091, text: 'Your Outside Backs never lose it, their Hit Ups are +1, and Into the Corner is 9.', effects: { faceSwap: { W: { knockon: 'pass', touch: 'pass' } }, runBonus: { W: { hitUp: 1, special: 1 } } } },
      { value: 0.157, clock: 0.116, text: 'Your Outside Backs never lose it, their Hit Ups are +2, and Into the Corner is 10.', effects: { faceSwap: { W: { knockon: 'pass', touch: 'pass' } }, runBonus: { W: { hitUp: 2, special: 2 } } } },
      { value: 0.218, clock: 0.181, text: 'Your Outside Backs never lose it, their Hit Ups are +2, Into the Corner is 10, and the Fly Half never finds touch either.', effects: { faceSwap: { W: { knockon: 'pass', touch: 'pass' }, B: { touch: 'pass' } }, runBonus: { W: { hitUp: 2, special: 2 } } } },
    ),
  },
  {
    id: 'up-and-under',
    name: 'Up and Under',
    tag: 'Attack',
    tiers: tiers(
      { value: 0.087, clock: 0.054, text: "The Fly Half's High Ball is 8, Fly Half Hit Ups are +1, and Into Touch becomes a pass.", effects: { runBonus: { B: { hitUp: 1, special: 2 } }, faceSwap: { B: { touch: 'pass' } } } },
      { value: 0.123, clock: 0.091, text: "The Fly Half's High Ball is 8, Fly Half Hit Ups are +1, Into Touch becomes a pass, and conversions and penalties are +10 m.", effects: { runBonus: { B: { hitUp: 1, special: 2 } }, faceSwap: { B: { touch: 'pass' } }, kickBonus: { conversion: 1, penalty: 1 } } },
      { value: 0.165, clock: 0.115, text: "The Fly Half's High Ball is 9, Fly Half Hit Ups are +2, Into Touch becomes a pass, and every kick is +10 m.", effects: { runBonus: { B: { hitUp: 2, special: 3 } }, faceSwap: { B: { touch: 'pass' } }, kickBonus: { conversion: 1, penalty: 1, drop: 1 } } },
      { value: 0.217, clock: 0.168, text: "The Fly Half's High Ball is 10, Fly Half Hit Ups are +3, Into Touch becomes a pass, and every kick is +20 m.", effects: { runBonus: { B: { hitUp: 3, special: 4 } }, faceSwap: { B: { touch: 'pass' } }, kickBonus: { conversion: 2, penalty: 2, drop: 2 } } },
    ),
  },
  {
    id: 'golden-boot',
    name: 'Golden Boot',
    tag: 'Kicking',
    tiers: tiers(
      { value: 0.112, clock: 0.085, text: '+20 m on every conversion and penalty kick.', effects: { kickBonus: { conversion: 2, penalty: 2 }, keepBall: ['penalty'], uses: { keepBall: { n: 1, per: 'match' } } } },
      { value: 0.165, clock: 0.117, text: '+30 m on every conversion and penalty kick, and +10 m on drop goals.', effects: { kickBonus: { conversion: 3, penalty: 3, drop: 1 }, keepBall: ['penalty'], uses: { keepBall: { n: 1, per: 'half' } } } },
      { value: 0.183, clock: 0.124, text: '+40 m on every conversion and penalty kick, so they never miss in still air, and +30 m on drop goals.', effects: { kickBonus: { conversion: 4, penalty: 4, drop: 3 }, keepBall: ['penalty'], uses: { keepBall: { n: 1, per: 'half' } } } },
      { value: 0.261, clock: 0.228, text: "Every kick is +40 m and never misses in still air, and the Fly Half's and Centres' ‹Pass› faces are drop-goal chances.", effects: { kickBonus: { conversion: 4, penalty: 4, drop: 4 }, passToDrop: ['B', 'C'], keepBall: ['penalty', 'drop'], uses: { keepBall: { n: 1, per: 'half' } } } },
    ),
  },
  {
    id: 'drop-artist',
    name: 'Drop-Goal Artist',
    tag: 'Kicking',
    tiers: tiers(
      { value: 0.105, clock: 0.101, text: "+20 m on drop goals, and the Outside Backs' ‹Pass› face is a drop-goal chance too.", effects: { kickBonus: { drop: 2 }, passToDrop: ['W'], keepBall: ['drop'], uses: { keepBall: { n: 1, per: 'match' } } } },
      { value: 0.146, clock: 0.127, text: "+30 m on drop goals, and the Outside Backs' ‹Pass› face is a drop-goal chance too.", effects: { kickBonus: { drop: 3 }, passToDrop: ['W'], keepBall: ['drop'], uses: { keepBall: { n: 1, per: 'half' } } } },
      { value: 0.185, clock: 0.145, text: "+40 m on drop goals, so they never miss in still air, and the Outside Backs' and Fly Half's ‹Pass› faces are drop-goal chances.", effects: { kickBonus: { drop: 4 }, passToDrop: ['W', 'B'], keepBall: ['drop'], uses: { keepBall: { n: 1, per: 'half' } } } },
      { value: 0.249, clock: 0.231, text: 'Drop goals never miss in still air (+40 m), and every ‹Pass› face is a drop-goal chance.', effects: { kickBonus: { drop: 4 }, passToDrop: ['F', 'C', 'W', 'B'], keepBall: ['drop'], uses: { keepBall: { n: 1, per: 'half' } } } },
    ),
  },
  {
    id: 'rush-defence',
    name: 'Rush Defence',
    tag: 'Defence',
    tiers: tiers(
      { value: 0.108, clock: 0.063, text: '+1 on the first brown die when you tackle a Hit Up.', effects: { tackleBonus: { hitUp: 1, special: 0 } } },
      { value: 0.149, clock: 0.091, text: '+1 on both brown dice when you tackle a Hit Up.', effects: { tackleBonus: { hitUp: 2, special: 0 } } },
      { value: 0.164, clock: 0.115, text: '+1 on both brown dice when you tackle a Hit Up, and a Big Hit on either die contests the ruck.', effects: { tackleBonus: { hitUp: 2, special: 0 }, ruckOnSecond: true } },
      { value: 0.253, clock: 0.143, text: '+1 on both brown dice against Hit Ups and on the first against big moves, and a Big Hit on either die contests the ruck.', effects: { tackleBonus: { hitUp: 2, special: 1 }, ruckOnSecond: true } },
    ),
  },
  {
    id: 'jackal',
    name: 'Jackal',
    tag: 'Defence',
    tiers: tiers(
      { value: 0.078, clock: 0.066, text: 'A Big Hit on either die contests the ruck against Hit Ups up to 5, and VIDEO REF also wins it.', effects: { ruckMax: 5, ruckOnSecond: true, ruckAlsoWins: ['video'] } },
      { value: 0.120, clock: 0.078, text: 'A Big Hit on either die contests the ruck against Hit Ups up to 5, and VIDEO REF and NO TRY also win it.', effects: { ruckMax: 5, ruckOnSecond: true, ruckAlsoWins: ['video', 'notry'] } },
      { value: 0.169, clock: 0.116, text: 'A Big Hit on either die contests the ruck against Hit Ups up to 5 and big moves too, and VIDEO REF and NO TRY also win it.', effects: { ruckMax: 5, ruckOnSecond: true, ruckOnSpecial: true, ruckAlsoWins: ['video', 'notry'] } },
      { value: 0.276, clock: 0.192, text: 'A Big Hit on either die contests the ruck against Hit Ups up to 5 and big moves too, and every ruck roll is yours.', effects: { ruckMax: 5, ruckOnSecond: true, ruckOnSpecial: true, ruckAlsoWins: ['video', 'notry', 'try'] } },
    ),
  },
  {
    id: 'fortress',
    name: 'Fortress',
    tag: 'Defence',
    tiers: tiers(
      { value: 0.125, clock: 0.084, text: "Your opponents' big moves are −2 intensity against you.", effects: { specialDefence: 2 } },
      { value: 0.150, clock: 0.087, text: "Your opponents' big moves are −3 intensity against you.", effects: { specialDefence: 3 } },
      { value: 0.169, clock: 0.107, text: "Your opponents' big moves are −4 intensity against you.", effects: { specialDefence: 4 } },
      { value: 0.279, clock: 0.185, text: "Your opponents' big moves are −4 and their Hit Ups of 5 are −1 intensity against you.", effects: { specialDefence: 4, hitUpDefence: 1, hitUpDefenceFrom: 5 } },
    ),
  },
  {
    id: 'clinical',
    name: 'Clinical Finisher',
    tag: 'Finishing',
    tiers: tiers(
      { value: 0.095, clock: 0.108, text: 'Once a match, a NO TRY or held-up roll is rolled again.', effects: { uses: { tryRerolls: { n: 1, per: 'match' } } } },
      { value: 0.132, clock: 0.118, text: 'Once a half, a NO TRY or held-up roll is rolled again.', effects: { uses: { tryRerolls: { n: 1, per: 'half' } } } },
      { value: 0.197, clock: 0.150, text: 'On every try attempt, a NO TRY or held-up roll is rolled again.', effects: { uses: { tryRerolls: { n: 1, per: 'try' } } } },
      { value: 0.274, clock: 0.210, text: 'On every try attempt, a NO TRY or held-up roll is rolled again, up to twice.', effects: { uses: { tryRerolls: { n: 2, per: 'try' } } } },
    ),
  },
  {
    id: 'set-piece-kings',
    name: 'Set-Piece Kings',
    tag: 'Set piece',
    tiers: tiers(
      { value: 0.083, clock: 0.047, text: 'Collapsed scrums and crooked lineouts go your way, and your first two runs after a set piece you win are +1.', effects: { setPieceTies: true, setPieceAdvantage: 2 } },
      { value: 0.120, clock: 0.081, text: 'You never lose your own scrum or lineout, collapsed scrums and crooked lineouts go your way, and your first two runs after a set piece you win are +1.', effects: { setPieceTies: true, setPieceAdvantage: 2, ownFeedWins: true } },
      { value: 0.172, clock: 0.116, text: "You never lose your own scrum or lineout and you steal the other side's lineouts; resets and crooked throws go your way, and your first three runs after a set piece you win are +1.", effects: { setPieceTies: true, setPieceAdvantage: 3, ownFeedWins: true, stealFeed: ['lineout'] } },
      { value: 0.248, clock: 0.175, text: 'Every scrum and lineout is yours, whoever feeds it (penalties aside), and your first three runs after one are +1.', effects: { setPieceTies: true, setPieceAdvantage: 3, ownFeedWins: true, stealFeed: ['scrum', 'lineout'] } },
    ),
  },
  {
    id: 'squeaky-clean',
    name: 'Squeaky Clean',
    tag: 'Discipline',
    tiers: tiers(
      { value: 0.085, clock: 0.045, text: 'Once a half, PENALTY AGAINST on your own feed becomes PENALTY WON.', effects: { uses: { ownFeedPenalty: { n: 1, per: 'half' } } } },
      { value: 0.120, clock: 0.057, text: 'PENALTY AGAINST on your own feed always becomes PENALTY WON, and you are never shown a card.', effects: { uses: { ownFeedPenalty: { n: 1, per: 'always' } }, noCards: true } },
      { value: 0.181, clock: 0.094, text: 'PENALTY AGAINST on your own feed always becomes PENALTY WON, once a half PENALTY WON on their feed goes to you instead, and you are never shown a card.', effects: { uses: { ownFeedPenalty: { n: 1, per: 'always' }, theirFeedPenalty: { n: 1, per: 'half' } }, noCards: true } },
      { value: 0.213, clock: 0.109, text: 'You never give away a set-piece penalty: PENALTY AGAINST on your feed and PENALTY WON on theirs both go to you, and you are never shown a card.', effects: { uses: { ownFeedPenalty: { n: 1, per: 'always' }, theirFeedPenalty: { n: 1, per: 'always' } }, noCards: true } },
    ),
  },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
export const CARD_IDS = CARDS.map(c => c.id);
export const DEAL_SIZE = 5;
// Who picks, in order: the toss loser first and fourth, the winner second and third.
export const DRAFT_ORDER = ['loser', 'winner', 'winner', 'loser'];
export const CARDS_EACH = 2;

// One card at one rarity: its name and kind, with that rarity's text, effects and value.
const TIERS = Object.fromEntries(CARDS.map(c => [c.id, Object.fromEntries(RARITY_IDS.map(r => {
  const { tiers: _, ...card } = c;
  return [r, Object.freeze({ ...card, rarity: r, ...c.tiers[r] })];
}))]));

export function cardTier(id, rarity = 'common') {
  return TIERS[id]?.[rarity] || TIERS[id]?.common || null;
}

// The cards a team holds, each at its rarity.
export function teamCards(match, team) {
  return (match.teams[team].cards || []).map(c => cardTier(c.id, c.rarity));
}

// A card's measured worth in a format: on the clock, or in a race.
export const cardWorth = (card, format = 'points') => (format === 'rolls' ? card.clock ?? card.value : card.value) || 0;

// What a team's cards are worth together in the match's format.
export const cardsValue = (match, team) => teamCards(match, team).reduce((sum, card) => sum + cardWorth(card, match.format), 0);

// A rarity for one dealt card, from the odds above.
export function rollRarity(rng) {
  let x = rng();
  for (const r of RARITIES) {
    if (x < r.odds) return r.id;
    x -= r.odds;
  }
  return RARITIES[0].id;
}

const NONE = Object.freeze({});

// Two cards' effects as one: numbers add up (the highest ruckMax counts),
// lists join, switches stay on, and nested effects merge key by key. The
// five dealt cards are all different, so no effect is ever counted twice.
function merge(into, fx) {
  for (const [key, value] of Object.entries(fx)) {
    const have = into[key];
    if (Array.isArray(value)) into[key] = [...new Set([...(have || []), ...value])];
    else if (value && typeof value === 'object') into[key] = merge(have ? { ...have } : {}, value);
    else if (typeof value === 'number') into[key] = have === undefined ? value : key === 'ruckMax' ? Math.max(have, value) : have + value;
    else into[key] = have ?? value;
  }
  return into;
}

const merged = new Map();

// The effects a team's cards give it together, or none.
export function cardEffects(match, team) {
  const cards = match.teams[team].cards;
  if (!cards?.length) return NONE;
  if (cards.length === 1) return cardTier(cards[0].id, cards[0].rarity).effects;
  const key = cards.map(c => `${c.id}:${c.rarity}`).join('|');
  if (!merged.has(key)) merged.set(key, Object.freeze(cards.reduce((fx, c) => merge(fx, cardTier(c.id, c.rarity).effects), {})));
  return merged.get(key);
}

// Which of a team's cards does something: the first whose effects pass
// `test`, as {id, rarity}, or null. For saying which card just played.
export function cardWith(match, team, test) {
  return cardsWith(match, team, test)[0] || null;
}

// All of a team's cards whose effects pass `test`.
export function cardsWith(match, team, test) {
  return (match.teams[team].cards || []).filter(c => test(cardTier(c.id, c.rarity).effects));
}
