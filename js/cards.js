// Team cards: one each per match, drafted after the toss. Every card is data
// the engine reads at a named hook, so each effect is small and testable.
//
// Each card comes in four rarities. A Common card is the card as it always
// was; every rarity above it keeps everything below and adds to it. Rarity is
// rolled for each card as it is dealt: Mythic turns up in about one deal in
// nine. The side picking second catches up a rarity when the first pick was
// rarer (see catchUp).
//
// value: how much the card lifts a side's chance of winning against a side
// with no card (its win rate above 50%), measured over 10,000 CPU matches
// each by scripts/balance-cards.mjs. Each rarity sits in its own band, above
// every card of the rarity below.
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
//   uses            {tryRerolls|ownFeedPenalty|theirFeedPenalty: {n, per}}  limited effects,
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
      { value: 0.070, text: "The Forwards' Hit Ups are +1, and Line Break is 8.", effects: { runBonus: { F: { hitUp: 1, special: 2 } } } },
      { value: 0.111, text: "The Forwards' Hit Ups are +2, and Line Break is 8.", effects: { runBonus: { F: { hitUp: 2, special: 2 } } } },
      { value: 0.177, text: "The Forwards' Hit Ups are +2, Line Break is 8, and they never knock on.", effects: { runBonus: { F: { hitUp: 2, special: 2 } }, faceSwap: { F: { knockon: 'pass' } } } },
      { value: 0.224, text: "The Forwards' Hit Ups are +3, Line Break is 10, they never knock on, and the Scrum Half's Hit Up is +2 behind them.", effects: { runBonus: { F: { hitUp: 3, special: 4 }, S: { hitUp: 2, special: 0 } }, faceSwap: { F: { knockon: 'pass' } } } },
    ),
  },
  {
    id: 'midfield-maestro',
    name: 'Midfield Maestro',
    tag: 'Attack',
    tiers: tiers(
      { value: 0.089, text: 'Your Centres are never intercepted: Intercepted becomes a pass.', effects: { faceSwap: { C: { intercept: 'pass' } } } },
      { value: 0.119, text: 'Your Centres are never intercepted, and their Hit Ups are +1.', effects: { faceSwap: { C: { intercept: 'pass' } }, runBonus: { C: { hitUp: 1, special: 0 } } } },
      { value: 0.183, text: 'Your Centres are never intercepted, their Hit Ups are +1, Thru the Gap is 9, and drop goals are +20 m.', effects: { faceSwap: { C: { intercept: 'pass' } }, runBonus: { C: { hitUp: 1, special: 2 } }, kickBonus: { drop: 2 } } },
      { value: 0.230, text: "Your Centres are never intercepted, their Hit Ups are +2, Thru the Gap is 9, drop goals are +20 m, and the Centres' ‹Pass› face is a drop-goal chance too.", effects: { faceSwap: { C: { intercept: 'pass' } }, runBonus: { C: { hitUp: 2, special: 2 } }, kickBonus: { drop: 2 }, passToDrop: ['C'] } },
    ),
  },
  {
    id: 'sure-hands',
    name: 'Sure Hands',
    tag: 'Attack',
    tiers: tiers(
      { value: 0.096, text: 'Your Outside Backs never lose it: Knock On and Into Touch become passes.', effects: { faceSwap: { W: { knockon: 'pass', touch: 'pass' } } } },
      { value: 0.111, text: 'Your Outside Backs never lose it, and their Hit Ups are +1.', effects: { faceSwap: { W: { knockon: 'pass', touch: 'pass' } }, runBonus: { W: { hitUp: 1, special: 0 } } } },
      { value: 0.147, text: 'Your Outside Backs never lose it, their Hit Ups are +2, and Into the Corner is 10.', effects: { faceSwap: { W: { knockon: 'pass', touch: 'pass' } }, runBonus: { W: { hitUp: 2, special: 2 } } } },
      { value: 0.215, text: 'Your Outside Backs never lose it, their Hit Ups are +2, Into the Corner is 10, and the Fly Half never finds touch either.', effects: { faceSwap: { W: { knockon: 'pass', touch: 'pass' }, B: { touch: 'pass' } }, runBonus: { W: { hitUp: 2, special: 2 } } } },
    ),
  },
  {
    id: 'up-and-under',
    name: 'Up and Under',
    tag: 'Attack',
    tiers: tiers(
      { value: 0.094, text: "The Fly Half's High Ball is 8, Fly Half Hit Ups are +1, and Into Touch becomes a pass.", effects: { runBonus: { B: { hitUp: 1, special: 2 } }, faceSwap: { B: { touch: 'pass' } } } },
      { value: 0.127, text: "The Fly Half's High Ball is 8, Fly Half Hit Ups are +1, Into Touch becomes a pass, and conversions and penalties are +10 m.", effects: { runBonus: { B: { hitUp: 1, special: 2 } }, faceSwap: { B: { touch: 'pass' } }, kickBonus: { conversion: 1, penalty: 1 } } },
      { value: 0.169, text: "The Fly Half's High Ball is 9, Fly Half Hit Ups are +2, Into Touch becomes a pass, and every kick is +10 m.", effects: { runBonus: { B: { hitUp: 2, special: 3 } }, faceSwap: { B: { touch: 'pass' } }, kickBonus: { conversion: 1, penalty: 1, drop: 1 } } },
      { value: 0.217, text: "The Fly Half's High Ball is 10, Fly Half Hit Ups are +2, Into Touch becomes a pass, and every kick is +20 m.", effects: { runBonus: { B: { hitUp: 2, special: 4 } }, faceSwap: { B: { touch: 'pass' } }, kickBonus: { conversion: 2, penalty: 2, drop: 2 } } },
    ),
  },
  {
    id: 'golden-boot',
    name: 'Golden Boot',
    tag: 'Kicking',
    tiers: tiers(
      { value: 0.073, text: '+20 m on every conversion and penalty kick.', effects: { kickBonus: { conversion: 2, penalty: 2 } } },
      { value: 0.114, text: '+30 m on every conversion and penalty kick, and +10 m on drop goals.', effects: { kickBonus: { conversion: 3, penalty: 3, drop: 1 } } },
      { value: 0.159, text: '+40 m on every conversion and penalty kick, so they never miss, and +30 m on drop goals.', effects: { kickBonus: { conversion: 4, penalty: 4, drop: 3 } } },
      { value: 0.240, text: "Every kick is +40 m and never misses, and the Fly Half's and Centres' ‹Pass› faces are drop-goal chances.", effects: { kickBonus: { conversion: 4, penalty: 4, drop: 4 }, passToDrop: ['B', 'C'] } },
    ),
  },
  {
    id: 'drop-artist',
    name: 'Drop-Goal Artist',
    tag: 'Kicking',
    tiers: tiers(
      { value: 0.084, text: "+20 m on drop goals, and the Outside Backs' ‹Pass› face is a drop-goal chance too.", effects: { kickBonus: { drop: 2 }, passToDrop: ['W'] } },
      { value: 0.103, text: "+30 m on drop goals, and the Outside Backs' ‹Pass› face is a drop-goal chance too.", effects: { kickBonus: { drop: 3 }, passToDrop: ['W'] } },
      { value: 0.163, text: "+40 m on drop goals, so they never miss, and the Outside Backs' and Fly Half's ‹Pass› faces are drop-goal chances.", effects: { kickBonus: { drop: 4 }, passToDrop: ['W', 'B'] } },
      { value: 0.257, text: 'Drop goals never miss (+40 m), and every ‹Pass› face is a drop-goal chance.', effects: { kickBonus: { drop: 4 }, passToDrop: ['F', 'C', 'W', 'B'] } },
    ),
  },
  {
    id: 'rush-defence',
    name: 'Rush Defence',
    tag: 'Defence',
    tiers: tiers(
      { value: 0.081, text: '+1 on the first brown die when you tackle a Hit Up.', effects: { tackleBonus: { hitUp: 1, special: 0 } } },
      { value: 0.129, text: '+1 on both brown dice when you tackle a Hit Up.', effects: { tackleBonus: { hitUp: 2, special: 0 } } },
      { value: 0.151, text: '+1 on both brown dice when you tackle a Hit Up, and a Big Hit on either die contests the ruck.', effects: { tackleBonus: { hitUp: 2, special: 0 }, ruckOnSecond: true } },
      { value: 0.223, text: '+1 on both brown dice against Hit Ups and on the first against big moves, and a Big Hit on either die contests the ruck.', effects: { tackleBonus: { hitUp: 2, special: 1 }, ruckOnSecond: true } },
    ),
  },
  {
    id: 'jackal',
    name: 'Jackal',
    tag: 'Defence',
    tiers: tiers(
      { value: 0.083, text: 'A Big Hit on either die contests the ruck against Hit Ups up to 5, and VIDEO REF also wins it.', effects: { ruckMax: 5, ruckOnSecond: true, ruckAlsoWins: ['video'] } },
      { value: 0.114, text: 'A Big Hit on either die contests the ruck against Hit Ups up to 5, and VIDEO REF and NO TRY also win it.', effects: { ruckMax: 5, ruckOnSecond: true, ruckAlsoWins: ['video', 'notry'] } },
      { value: 0.159, text: 'A Big Hit on either die contests the ruck against Hit Ups up to 5 and big moves too, and VIDEO REF and NO TRY also win it.', effects: { ruckMax: 5, ruckOnSecond: true, ruckOnSpecial: true, ruckAlsoWins: ['video', 'notry'] } },
      { value: 0.273, text: 'A Big Hit on either die contests the ruck against Hit Ups up to 5 and big moves too, and every ruck roll is yours.', effects: { ruckMax: 5, ruckOnSecond: true, ruckOnSpecial: true, ruckAlsoWins: ['video', 'notry', 'try'] } },
    ),
  },
  {
    id: 'fortress',
    name: 'Fortress',
    tag: 'Defence',
    tiers: tiers(
      { value: 0.094, text: "Your opponents' big moves are −2 intensity against you.", effects: { specialDefence: 2 } },
      { value: 0.136, text: "Your opponents' big moves are −3 intensity against you.", effects: { specialDefence: 3 } },
      { value: 0.155, text: "Your opponents' big moves are −4 intensity against you.", effects: { specialDefence: 4 } },
      { value: 0.236, text: "Your opponents' big moves are −4 and their Hit Ups of 5 are −1 intensity against you.", effects: { specialDefence: 4, hitUpDefence: 1, hitUpDefenceFrom: 5 } },
    ),
  },
  {
    id: 'clinical',
    name: 'Clinical Finisher',
    tag: 'Finishing',
    tiers: tiers(
      { value: 0.081, text: 'Once a match, a NO TRY or held-up roll is rolled again.', effects: { uses: { tryRerolls: { n: 1, per: 'match' } } } },
      { value: 0.124, text: 'Once a half, a NO TRY or held-up roll is rolled again.', effects: { uses: { tryRerolls: { n: 1, per: 'half' } } } },
      { value: 0.199, text: 'On every try attempt, a NO TRY or held-up roll is rolled again.', effects: { uses: { tryRerolls: { n: 1, per: 'try' } } } },
      { value: 0.243, text: 'On every try attempt, a NO TRY or held-up roll is rolled again, up to twice.', effects: { uses: { tryRerolls: { n: 2, per: 'try' } } } },
    ),
  },
  {
    id: 'set-piece-kings',
    name: 'Set-Piece Kings',
    tag: 'Set piece',
    tiers: tiers(
      { value: 0.067, text: 'Collapsed scrums and crooked lineouts go your way, and your first run after a set piece you win is +1.', effects: { setPieceTies: true, setPieceAdvantage: 1 } },
      { value: 0.115, text: 'You never lose your own scrum or lineout, collapsed scrums and crooked lineouts go your way, and your first run after a set piece you win is +1.', effects: { setPieceTies: true, setPieceAdvantage: 1, ownFeedWins: true } },
      { value: 0.166, text: "You never lose your own scrum or lineout and you steal the other side's lineouts; resets and crooked throws go your way, and your first two runs after a set piece you win are +1.", effects: { setPieceTies: true, setPieceAdvantage: 2, ownFeedWins: true, stealFeed: ['lineout'] } },
      { value: 0.245, text: 'Every scrum and lineout is yours, whoever feeds it (penalties aside), and your first three runs after one are +1.', effects: { setPieceTies: true, setPieceAdvantage: 3, ownFeedWins: true, stealFeed: ['scrum', 'lineout'] } },
    ),
  },
  {
    id: 'squeaky-clean',
    name: 'Squeaky Clean',
    tag: 'Discipline',
    tiers: tiers(
      { value: 0.085, text: 'Once a match, PENALTY AGAINST on your own feed becomes PENALTY WON.', effects: { uses: { ownFeedPenalty: { n: 1, per: 'match' } } } },
      { value: 0.133, text: 'PENALTY AGAINST on your own feed always becomes PENALTY WON.', effects: { uses: { ownFeedPenalty: { n: 1, per: 'always' } } } },
      { value: 0.191, text: 'PENALTY AGAINST on your own feed always becomes PENALTY WON, and once a match PENALTY WON on their feed goes to you instead.', effects: { uses: { ownFeedPenalty: { n: 1, per: 'always' }, theirFeedPenalty: { n: 1, per: 'match' } } } },
      { value: 0.239, text: 'You never give away a set-piece penalty: PENALTY AGAINST on your feed and PENALTY WON on theirs both go to you.', effects: { uses: { ownFeedPenalty: { n: 1, per: 'always' }, theirFeedPenalty: { n: 1, per: 'always' } } } },
    ),
  },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
export const CARD_IDS = CARDS.map(c => c.id);
export const DEAL_SIZE = 3;

// One card at one rarity: its name and kind, with that rarity's text, effects and value.
const TIERS = Object.fromEntries(CARDS.map(c => [c.id, Object.fromEntries(RARITY_IDS.map(r => {
  const { tiers: _, ...card } = c;
  return [r, Object.freeze({ ...card, rarity: r, ...c.tiers[r] })];
}))]));

export function cardTier(id, rarity = 'common') {
  return TIERS[id]?.[rarity] || TIERS[id]?.common || null;
}

// The card a team holds, at its rarity, or null.
export function teamCard(match, team) {
  const t = match.teams[team];
  return t.card ? cardTier(t.card, t.cardRarity) : null;
}

// A rarity for one dealt card, from the odds above.
export function rollRarity(rng) {
  let x = rng();
  for (const r of RARITIES) {
    if (x < r.odds) return r.id;
    x -= r.odds;
  }
  return RARITIES[0].id;
}

// The draft's catch-up: picking second, a card goes up one rarity when the
// card picked first is rarer.
export function catchUp(firstRarity, rarity) {
  const [first, mine] = [RARITY_IDS.indexOf(firstRarity), RARITY_IDS.indexOf(rarity)];
  return first > mine ? RARITY_IDS[mine + 1] : rarity;
}

const NONE = Object.freeze({});

// The effects a team's card gives it, or none.
export function cardEffects(match, team) {
  return teamCard(match, team)?.effects || NONE;
}
