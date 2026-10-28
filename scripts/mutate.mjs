// Mutation testing: plants one deliberate rules bug at a time in a copy of
// the code and checks the test suite catches it. A bug that slips through
// ("survived") means a rule is not really tested.
// Usage: node scripts/mutate.mjs   (MUTANT=clock node scripts/mutate.mjs for some of
//        them, MUTANT_SHARD=1/3 for a third of them)

import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// [rule broken, file, original text, replacement]
const MUTANTS = [
  // The rules.
  ['Ruck steal against a Hit Up of 5', 'js/engine.js', 'return ruckEligible(face, intensity, fx.ruckMax || 4, !!fx.ruckOnSpecial);', 'return ruckEligible(face, intensity, fx.ruckMax || 5, !!fx.ruckOnSpecial);'],
  ['Ruck steal against big moves too', 'js/engine.js', "return face.kind === 'run' && (face.special ? onSpecial : intensity <= max);", "return face.kind === 'run' && intensity <= max;"],
  ['Card penalty on one die only', 'js/engine.js', 'second.value + modifier + b2]', 'second.value + b2]'],
  ['Second-die Big Hit does not complete the tackle', 'js/engine.js', "else if (secondHit) outcome = 'bighit';", ''],
  ['Tackle must beat the intensity, not equal it', 'js/engine.js', 'total >= intensity', 'total > intensity'],
  ['Injury from a single Big Hit', 'js/engine.js', 'injury: firstHit && secondHit', 'injury: firstHit || secondHit'],
  ['Try worth 4', 'js/engine.js', "addPoints(m, ev, team, 5, 'try')", "addPoints(m, ev, team, 4, 'try')"],
  ['Conversion worth 3', 'js/engine.js', "conversion: ['conversions', 'conversionAttempts', 2]", "conversion: ['conversions', 'conversionAttempts', 3]"],
  ['Scorers keep the ball after a score', 'js/engine.js', "startPossession(m, ev, other(team), 'restart');\n}", "startPossession(m, ev, team, 'restart');\n}"],
  ['No conversion: straight to restart', 'js/engine.js', "m.step = { type: 'roll', purpose: 'range', dice: ['D'], team, kick: 'conversion' };", 'afterScore(m, ev, team);'],
  ['Kick must beat the range, not equal it', 'js/engine.js', 'const good = distance >= range;', 'const good = distance > range;'],
  ['Video ref counts as no try', 'js/engine.js', "if (face.result === 'video') {", "if (face.result === 'never') {"],
  ['Missed drop goal keeps the ball', 'js/engine.js', "startPossession(m, ev, other(team), 'missedKick');", "startPossession(m, ev, team, 'missedKick');"],
  ['Quick tap lasts 2 runs', 'js/engine.js', 'export const QUICK_TAP_RUNS = 3;', 'export const QUICK_TAP_RUNS = 2;'],
  ['Quick tap never runs out', 'js/engine.js', '  m.quickTap--;\n', ''],
  ['Quick tap gives no bonus', 'js/engine.js', 'match.quickTap > 0 ? 1 : 0', 'match.quickTap > 0 ? 0 : 0'],
  ['Errors do not end quick tap', 'js/engine.js', "  }\n  m.quickTap = 0;\n  m.step = { type: 'roll', purpose: 'setpiece'", "  }\n  m.step = { type: 'roll', purpose: 'setpiece'"],
  ['Injuries ignored', 'js/engine.js', 'const injury = match.teams[team].injuries[pos];', 'const injury = 0;'],
  ['Half time in the second half too', 'js/engine.js', "if (m.format === 'points' && m.half === 1 && m.teams.some", "if (m.format === 'points' && m.teams.some"],
  ['Sin bin carries into the second half', 'js/engine.js', '      t.sinBin = false;\n', ''],
  ['Second yellow is not a red', 'js/engine.js', 'if (O.yellows >= 2) {', 'if (O.yellows >= 3) {'],
  ['Red card only -1', 'js/engine.js', 'if (t.yellows >= 2) return -2;', 'if (t.yellows >= 2) return -1;'],
  ['Crooked lineout rethrown by the same side', 'js/engine.js', "if (outcome === 'notstraight') m.step = { ...m.step, team: other(team) };", "if (outcome === 'notstraight') m.step = { ...m.step };"],
  ['Penalty Won goes to the wrong side', 'js/engine.js', "let awarded = face.penalty === 'won' ? team : other(team);", "let awarded = face.penalty === 'won' ? other(team) : team;"],
  ['Knock on gives the attackers the scrum', 'js/engine.js', 'setPiece(m, ev, piece, def);', 'setPiece(m, ev, piece, team);'],
  ['Intercept is not a turnover', 'js/engine.js', "startPossession(m, ev, def, 'intercept');", "startPossession(m, ev, team, 'intercept');"],
  ['Ruck won does not turn the ball over', 'js/engine.js', "if (result === 'ruck' || byCard) {", "if (result === 'never' || byCard) {"],
  ['Full time only beyond 30', 'js/engine.js', 'm.teams[team].score < m.target.full)) return false;', 'm.teams[team].score <= m.target.full)) return false;'],
  ['Same side receives in both halves', 'js/engine.js', "    if (!halfTimeBench(m)) startPossession(m, ev, other(m.firstReceiver), 'kickoff');", "    if (!halfTimeBench(m)) startPossession(m, ev, m.firstReceiver, 'kickoff');"],
  ['Passing back to the Scrum Half allowed', 'js/engine.js', "POSITIONS.filter(p => p !== 'S' && p !== from)", 'POSITIONS.filter(p => p !== from)'],
  ['Toss winner kicks instead of receiving', 'js/engine.js', 'const winner = result === action.value ? step.team : other(step.team);', 'const winner = result === action.value ? other(step.team) : step.team;'],
  ['Wing big move is 7', 'js/dice.js', "special('Into the Corner', 8)", "special('Into the Corner', 7)"],
  ['Back cannot drop goal', 'js/dice.js', "faces: [hitUp(3), hitUp(4), special('High Ball', 6), drop(), pass(), touch()]", "faces: [hitUp(3), hitUp(4), special('High Ball', 6), pass(), pass(), touch()]"],
  ['Break chance ignores the card', 'js/engine.js', 'lineBreak += breakChance(intensity, modifier, canRuck', 'lineBreak += breakChance(intensity, 0, canRuck'],

  // Team cards and the draft.
  ['Card run bonus ignored', 'js/engine.js', 'const card = bonus ? (face.special ? bonus.special : bonus.hitUp) : 0;', 'const card = 0;'],
  ['Big Pack: no bonus on the big move', 'js/cards.js', 'runBonus: { F: { hitUp: 1, special: 2 } }', 'runBonus: { F: { hitUp: 1, special: 0 } }'],
  ['Fortress protects the attackers', 'js/engine.js', 'const defence = face ? cardEffects(match, other(team)) : NO_EFFECTS;', 'const defence = face ? cardEffects(match, team) : NO_EFFECTS;'],
  ['Fortress against Hit Ups too', 'js/engine.js', 'const fortress = (face?.special ? defence.specialDefence :', 'const fortress = (face ? defence.specialDefence :'],
  ['Fortress (Mythic) cuts every Hit Up', 'js/engine.js', 'value >= (defence.hitUpDefenceFrom || 0)', 'value >= 0'],
  ['Card face swaps ignored', 'js/engine.js', "const swapped = lost && fx.faceSwap?.[pos]?.[lost] === 'pass' ? lost : null;", 'const swapped = null;'],
  ["Sure Hands for every player", 'js/engine.js', "fx.faceSwap?.[pos]?.[lost] === 'pass'", "fx.faceSwap?.W?.[lost] === 'pass'"],
  ['Drop-Goal Artist: every open pass a drop chance', 'js/engine.js', '(fx.passToDrop || []).includes(pos)', '(fx.passToDrop || []).length'],
  ['Kick bonus left off the kick', 'js/engine.js', 'const distance = rolled + bonus;', 'const distance = rolled;'],
  ['Kick bonus left out of the shown chance', 'js/engine.js', "ev.push({ type: 'range', team, kick, range, bonus, card: parts.card, wind: parts.wind, chance: kickChance(range, bonus) });", "ev.push({ type: 'range', team, kick, range, bonus, card: parts.card, wind: parts.wind, chance: kickChance(range) });"],
  ['Golden Boot helps drop goals too', 'js/cards.js', 'kickBonus: { conversion: 2, penalty: 2 }', 'kickBonus: { conversion: 2, penalty: 2, drop: 2 }'],
  ['Rush Defence on both dice', 'js/engine.js', 'return [n >= 1 ? 1 : 0, n >= 2 ? 1 : 0];', 'return [n >= 1 ? 1 : 0, n >= 1 ? 1 : 0];'],
  ['Rush Defence (Rare) still on one die', 'js/engine.js', 'return [n >= 1 ? 1 : 0, n >= 2 ? 1 : 0];', 'return [n >= 1 ? 1 : 0, 0];'],
  ['Rush Defence against big moves', 'js/engine.js', 'const n = (special ? cardEffects(m, def).tackleBonus?.special : cardEffects(m, def).tackleBonus?.hitUp) || 0;', 'const n = cardEffects(m, def).tackleBonus?.hitUp || 0;'],
  ['Second-die ruck for everyone', 'js/engine.js', "else if (secondHit && canRuck && ruckOnSecond) outcome = 'ruck';", "else if (secondHit && canRuck) outcome = 'ruck';"],
  ['Jackal: video ref does not win the ruck', 'js/engine.js', 'const byCard = (cardEffects(m, def).ruckAlsoWins || []).includes(result);', 'const byCard = false;'],
  ['Limited cards never run out', 'js/engine.js', 'if ((used[key] || 0) >= limit.n) return false;', 'if ((used[key] || 0) > 99) return false;'],
  ['Once-a-match cards refreshed at half time', 'js/engine.js', "if (limits[key]?.per !== 'match') used[key] = 0;", 'used[key] = 0;'],
  ['Set-Piece Kings ignored at resets', 'js/engine.js', 'const kings = [0, 1].find(t => cardEffects(m, t).setPieceTies);', 'const kings = undefined;'],
  ['Set-piece advantage for three runs', 'js/cards.js', 'setPieceTies: true, setPieceAdvantage: 1 } }', 'setPieceTies: true, setPieceAdvantage: 3 } }'],
  ['Squeaky Clean on the other side\'s feed', 'js/engine.js', "useCharge(m, team, 'ownFeedPenalty')", "useCharge(m, other(team), 'ownFeedPenalty')"],
  ['Toss winner picks first', 'js/engine.js', "(DRAFT_ORDER[pick] === 'winner' ? match.firstReceiver : other(match.firstReceiver))", "(DRAFT_ORDER[pick] === 'winner' ? other(match.firstReceiver) : match.firstReceiver)"],
  ['Second pick may take the same card', 'js/engine.js', 'const rest = step.options.filter(id => id !== value);', 'const rest = step.options;'],
  ['A deal can repeat a card', 'js/engine.js', 'const id = pool.splice(Math.floor(rng() * pool.length), 1)[0];', 'const id = pool[Math.floor(rng() * pool.length)];'],
  ['After the draft the toss loser receives', 'js/engine.js', "startPossession(m, ev, m.firstReceiver, 'kickoff');", "startPossession(m, ev, other(m.firstReceiver), 'kickoff');"],

  // Players.
  ['Tackles credited to the Scrum Half', 'js/engine.js', 'player(m, def, carrier).tackles++;', "player(m, def, 'S').tackles++;"],
  ['Tries credited to the Scrum Half', 'js/engine.js', 'player(m, team, m.step.carrier).tries++;', "player(m, team, 'S').tries++;"],
  ['A Centre kicks their own drop goal', 'js/engine.js', "        player(m, team, pos).passes++;\n        m.carrier = 'B';", '        player(m, team, pos).passes++;'],
  ['No lift for the winners in Player of the Match', 'js/players.js', 'row.team === match.winner ? 1.15 : 1', '1'],

  // The CPU.
  ['Pro CPU kicks at long odds', 'js/ai.js', 'return chance >= threshold - 1e-9;', 'return chance >= 0.3;'],
  ['Boot it no keener to kick', 'js/ai.js', 'dropAt: 1 / 3,\n    penaltyAt: 1 / 3,', 'dropAt: 0.5,\n    penaltyAt: 0.5,'],
  ['Draft ignores the CPU style', 'js/ai.js', 'return (cardTier(id, rarity).value || 0) + (personality.cards[id] || 0);', 'return cardTier(id, rarity).value || 0;'],
  ['CPU drafts as if every card were Common', 'js/ai.js', 'const worth = id => cardValue(id, personality, dealtRarity(match, id));', 'const worth = id => cardValue(id, personality);'],
  ['Win model forgets the second-half kick-off', 'js/winprob.js', 'const shr = match.firstReceiver === null ? 0 : (1 - match.firstReceiver === team ? 0 : 1);', 'const shr = 0;'],

  // Tournaments.
  ['A win is worth 3', 'js/tournament.js', 'row.points += POINTS.win;', 'row.points += 3;'],
  ['Losing bonus only within 6', 'js/tournament.js', '<= POINTS.losingBonusWithin', '< POINTS.losingBonusWithin'],
  ['Big-win bonus from 9', 'js/tournament.js', "if (margin >= POINTS.bigWinBy) return 'big';", "if (margin >= POINTS.bigWinBy - 1) return 'big';"],
  ['Table ignores points difference', 'js/tournament.js', 'return b.points - a.points || (b.for - b.against) - (a.for - a.against) ||', 'return b.points - a.points ||'],
  ['Champions Cup seeding ignores the tables', 'js/tournament.js', 'const order = rows => [...rows].sort(tableOrder);', 'const order = rows => [...rows];'],
  ['Pool winners meet in the semis', 'js/tournament.js', "fixture('SF1', 'semi', 0, a[0].id, b[1].id), fixture('SF2', 'semi', 0, b[0].id, a[1].id)", "fixture('SF1', 'semi', 0, a[0].id, b[0].id), fixture('SF2', 'semi', 0, a[1].id, b[1].id)"],
  ['Prem semis 1 v 2 and 3 v 4', 'js/tournament.js', "tie(t, 'SF1', 'semi', at(1), at(4)), tie(t, 'SF2', 'semi', at(2), at(3))", "tie(t, 'SF1', 'semi', at(1), at(2)), tie(t, 'SF2', 'semi', at(3), at(4))"],
  ['URC quarter-finals 1v7 and 2v8', 'js/tournament.js', "tie(t, 'QF1', 'qf', at(1), at(8))", "tie(t, 'QF1', 'qf', at(1), at(7))"],
  ['URC bracket re-drawn after the quarters', 'js/tournament.js', "tie(t, 'SF1', 'semi', w[0], w[1]), tie(t, 'SF2', 'semi', w[2], w[3])", "tie(t, 'SF1', 'semi', w[0], w[2]), tie(t, 'SF2', 'semi', w[1], w[3])"],
  ['Top 14 top seed meets the 3v6 winner', 'js/tournament.js', "tie(t, 'SF1', 'semi', first, winnerOf(byId(t, 'QF2'))), tie(t, 'SF2', 'semi', second, winnerOf(byId(t, 'QF1')))", "tie(t, 'SF1', 'semi', first, winnerOf(byId(t, 'QF1'))), tie(t, 'SF2', 'semi', second, winnerOf(byId(t, 'QF2')))"],
  ['Top 14 top two not given byes', 'js/tournament.js', '    t.byes = [at(1), at(2)];\n', ''],
  ['Super Rugby: worst-placed loser goes through', 'js/tournament.js', 'const lucky = qfs.map(loserOf).sort((a, b) => t.seeds[a] - t.seeds[b])[0];', 'const lucky = qfs.map(loserOf).sort((a, b) => t.seeds[b] - t.seeds[a])[0];'],
  ['Super Rugby semis not re-seeded', 'js/tournament.js', 'const winners = qfs.map(winnerOf).sort((a, b) => t.seeds[a] - t.seeds[b]);', 'const winners = qfs.map(winnerOf);'],
  ['Knockouts hosted by the worse seed', 'js/tournament.js', 't.seeds[a] <= t.seeds[b] ? [a, b] : [b, a]', 't.seeds[a] >= t.seeds[b] ? [a, b] : [b, a]'],
  ['Short season plays every round', 'js/tournament.js', "season === 'full' ? schedule : schedule.slice(0, SHORT_SEASON)", 'schedule'],
  ['A side with a bye counts as out', 'js/tournament.js', '(t.byes || []).includes(t.userTeam) || ', ''],
  ['Away side never changes kit', 'js/tournament.js', 'dressed(away, stripAgainst(away, home.color))', 'dressed(away, { color: away.color, kit: away.kit || null })'],
  ['No plain kit when both strips clash', 'js/tournament.js', '[team.alt, ...NEUTRALS]', '[team.alt]'],
  ['User plays as the CPU side', 'js/tournament.js', "return { mode: '1p', teams: [mine, theirs]", "return { mode: '1p', teams: [theirs, mine]"],

  // Card rarities and the catch-up.
  ['Every card dealt Common', 'js/engine.js', 'rarity[id] = rollRarity(rng);', "rarity[id] = 'common';"],
  ['Mythic as common as Epic', 'js/cards.js', "{ id: 'mythic', name: 'Mythic', odds: 0.04 }", "{ id: 'mythic', name: 'Mythic', odds: 0.13 }"],
  ['Rarity ignored: every card plays as Common', 'js/cards.js', 'return TIERS[id]?.[rarity] || TIERS[id]?.common || null;', 'return TIERS[id]?.common || null;'],
  ['A drafted card loses its rarity', 'js/engine.js', 'm.teams[step.team].cards.push({ id: value, rarity });', "m.teams[step.team].cards.push({ id: value, rarity: 'common' });"],
  ['The draft alternates picks', 'js/cards.js', "export const DRAFT_ORDER = ['loser', 'winner', 'winner', 'loser'];", "export const DRAFT_ORDER = ['loser', 'winner', 'loser', 'winner'];"],
  ['No card is discarded', 'js/engine.js', 'const last = step.pick + 1 >= DRAFT_ORDER.length || rest.length <= 1;', 'const last = rest.length < 1;'],
  ["Two cards' kick bonuses don't add up", 'js/cards.js', "key === 'ruckMax' ? Math.max(have, value) : have + value", 'Math.max(have, value)'],
  ['Rerolls on every try attempt never run out', 'js/engine.js', "if (limit.per === 'try') return (m.step.rerolled || 0) < limit.n;", "if (limit.per === 'try') return true;"],
  ["'Always' uses run out", 'js/engine.js', "  if (limit.per === 'always') return true;\n", ''],
  ['Jackal (Epic) never contests big moves', 'js/engine.js', 'return ruckEligible(face, intensity, fx.ruckMax || 4, !!fx.ruckOnSpecial);', 'return ruckEligible(face, intensity, fx.ruckMax || 4, false);'],
  ['Set-Piece Kings never steal a feed', 'js/engine.js', "(cardEffects(m, other(team)).stealFeed || []).includes(piece)", 'false'],
  ['Set-Piece Kings steal every feed', 'js/engine.js', "(cardEffects(m, other(team)).stealFeed || []).includes(piece)", '(cardEffects(m, other(team)).stealFeed || []).length'],
  ['Set-Piece Kings lose their own feed anyway', 'js/engine.js', "if (outcome === 'lose' && cardEffects(m, team).ownFeedWins) {", 'if (false) {'],
  ['Squeaky Clean never turns their feed', 'js/engine.js', "} else if (outcome === 'penaltyWon' && useCharge(m, other(team), 'theirFeedPenalty')) {", '} else if (false) {'],
  ['Win meter ignores the cards', 'js/winprob.js', 'const diff = cardsEdge(match, team) - cardsEdge(match, 1 - team);', 'const diff = 0;'],
  ['Win meter edge never fades', 'js/winprob.js', 'return 1 / (1 + Math.exp(-(logit(p) + diff * left)));', 'return 1 / (1 + Math.exp(-(logit(p) + diff)));'],
  ['Career keeps the first rarity it saw', 'js/career.js', "if (RARITY_IDS.indexOf(card.rarity) > RARITY_IDS.indexOf(c.cardRarity[card.id] ?? '')) c.cardRarity[card.id] = card.rarity;", 'c.cardRarity[card.id] ??= card.rarity;'],
  ['Mythic achievement for any card', 'js/career.js', "(m.teams[me].cards || []).some(card => card.rarity === 'mythic')", '(m.teams[me].cards || []).length > 0'],

  // Career, achievements and the coach.
  ['Two-player matches count in the record', 'js/career.js', "if (context.mode === '2p') {", "if (context.mode === 'never') {"],
  ['Comeback from 9 down', 'js/career.js', 't.maxDeficit >= 10', 't.maxDeficit >= 9'],
  ['Achievements unlock again', 'js/career.js', '    if (c.achievements[a.id]) continue;\n', ''],
  ['Every miss hits the post', 'js/career.js', 'if (!e.good && e.distance === e.range - 1) tracker.postHits++;', 'if (!e.good) tracker.postHits++;'],
  ['Coach repeats tips', 'js/coach.js', 'const fresh = id => (seen.includes(id) ? null : id);', 'const fresh = id => id;'],
  ["Coach talks on the CPU's turn", 'js/coach.js', '  if (!humanTurn) return null;\n', ''],

  // Home grounds, kits, season stats, the Champions Cup and the club career.
  ['Prem final at the better seed\'s ground', 'js/tournament.js', "prem: { final: 'Allianz Stadium, Twickenham' },", 'prem: {},'],
  ['Neutral grounds not marked neutral', 'js/tournament.js', 'neutral: name !== home?.ground && name !== teamOf(t, f.away)?.ground', 'neutral: false'],
  ['A change strip keeps the pattern', 'js/tournament.js', 'find(c => c && !clash(c, other)) || team.color, kit: null };', 'find(c => c && !clash(c, other)) || team.color, kit: team.kit || null };'],
  ['Hoops drawn as stripes', 'js/color.js', 'rect(0, i / HOOPS, 1, 1 / HOOPS,', 'rect(i / HOOPS, 0, 1 / HOOPS, 1,'],
  ['Season stats lose the away side', 'js/season.js', 'const match = unpackPlayer(lines[side]?.[pos]);', 'const match = unpackPlayer(lines[0]?.[pos]);'],
  ['Leaders sorted lowest first', 'js/season.js', '.sort((a, b) => b.value - a.value || a.apps - b.apps', '.sort((a, b) => a.value - b.value || a.apps - b.apps'],
  ['Team of the Season by total, not average', 'js/season.js', 'const [a, b] = [p.rating / p.apps, best.rating / best.apps];', 'const [a, b] = [p.rating, best.rating];'],
  ['Team of the Season lets in one-match wonders', 'js/season.js', 'const eligible = field.filter(p => p.apps * 2 >= most);', 'const eligible = field;'],
  ['Champions Cup: league rivals meet in the pools', 'js/tournament.js', '[[a1, b1], [a2, c1], [b2, c2]],', '[[a1, a2], [b1, c1], [b2, c2]],'],
  ['Champions Cup: home and away not shared out', 'js/tournament.js', 'if (ids.every(id => homes.get(id) === 2)) {', 'if (true) {'],
  ['Champions Cup: only the top two go through', 'js/tournament.js', '  through: 3,', '  through: 2,'],
  ['Champions Cup: the worst of the rest go through', 'js/tournament.js', '.slice(0, C.bestOthers)', '.slice(-C.bestOthers)'],
  ['Champions Cup: 1 v 9 in the round of 16', 'js/tournament.js', "'r16', seeds[i], seeds[15 - i]", "'r16', seeds[i], seeds[i + 8]"],
  ['Champions Cup final not in Lyon', 'js/tournament.js', "neutral: { final: 'OL Stadium, Lyon' },", 'neutral: {},'],
  ['Squads not kept between seasons', 'js/club.js', 'for (const side of t.teams) if (club.rosters[side.id]) side.roster = { ...club.rosters[side.id] };', ''],
  ['Europe for the top six only', 'js/club.js', 'export const EUROPE_PLACES = 8;', 'export const EUROPE_PLACES = 6;'],
  ['Winning run survives a defeat', 'js/club.js', '      club.run = 0;\n', ''],
  ['Season one Champions Cup re-drawn', 'js/club.js', 'const pools = club.number === 1 ? CHAMPIONS_CUP.pools : drawPools(club.cupField, rng);', 'const pools = drawPools(club.cupField, rng);'],
  ['The double never awarded', 'js/club.js', "if (season.league?.stage === 'champion' && season.europe?.stage === 'champion')", 'if (false)'],
  ['Dynasty after two titles', 'js/career.js', '(c.tournament?.leagueTitles || 0) >= 3', '(c.tournament?.leagueTitles || 0) >= 2'],

  // The daily challenge and the friends league.
  ['A different daily challenge every time', 'js/daily.js', 'const rng = seededRng(daySeed(key));', 'const rng = seededRng(Math.floor(Math.random() * 2 ** 32));'],
  ['Daily defeats rank above wins', 'js/daily.js', 'rank: won ? 1000 + margin : 500 + margin', 'rank: won ? 500 + margin : 1000 + margin'],
  ['Daily difficulty never checked', 'js/daily.js', '    if (miss === 0) break;', '    break;'],
  ['Daily scores that don\'t add up', 'js/daily.js', '    if (rest < 0 || rest % 3) continue;', '    if (rest < 0) continue;'],
  ['Friends: CPU results differ by phone', 'js/friends.js', 'seededRng(hashText(`${settings.seed}:${settings.code}:${fixtureId}`))', 'seededRng(hashText(`${settings.seed}:${settings.code}:${fixtureId}:${Math.random()}`))'],
  ['Friends: rounds don\'t wait for people', 'js/friends.js', "      } else pending.push(f);", "      } else f.result = simulateFixture(t, f, fixtureRng(settings, f.id));"],
  ['Friends: the away side hosts', 'js/friends.js', "if (humanOf(clubs, f.home) === me) return 'host';", "if (humanOf(clubs, f.home) === me) return 'guest';"],
  ['Friends: one room for every match', 'js/friends.js', 'makeCode(seededRng(hashText(`room:${settings.code}:${fixtureId}`)))', 'makeCode(seededRng(hashText(`room:${settings.code}`)))'],
  ['Friends: edited squads ignored', 'js/friends.js', '    if (team && club.roster) team.roster = { ...club.roster };', ''],

  // Weather and the bench.
  ['Rain makes no difference', 'js/engine.js', 'const wet = !!match.weather?.rain && WET_HANDS', 'const wet = false && WET_HANDS'],
  ['Everyone knocks on in the rain', 'js/engine.js', "export const WET_HANDS = ['F', 'C'];", "export const WET_HANDS = ['F', 'C', 'W', 'B'];"],
  ['Rain left out of the pass odds', 'js/engine.js', 'const { face } = attackFace(match, team, pos, i);', 'const face = DICE[pos].faces[i];'],
  ['Wind blows the same way all match', 'js/engine.js', 'return match.half === 1 ? w : other(w);', 'return w;'],
  ['Wind helps both sides', 'js/engine.js', 'return team === w ? WIND_METRES : -WIND_METRES;', 'return WIND_METRES;'],
  ['Wind left off the kick', 'js/engine.js', 'const bonus = parts.card + parts.wind;\n  const distance = rolled + bonus;', 'const bonus = parts.card;\n  const distance = rolled + bonus;'],
  ['A replacement leaves the injury', 'js/engine.js', '        T.injuries[value] = 0;\n', ''],
  ['The bench never runs out', 'js/engine.js', '        T.bench--;\n', ''],
  ['No fresh replacement at half time', 'js/engine.js', '      t.bench = m.bench ? 1 : 0;\n', ''],
  ['No bench decision after an injury', 'js/engine.js', "  if (hurt) offerBench(m, att, 'injury', carrier, m.step);\n", ''],
  ['Bench offered with nobody on it', 'js/engine.js', 'const hurt = result.injury && A.bench > 0;', 'const hurt = result.injury;'],
  ['No changes at half time', 'js/engine.js', "    if (!halfTimeBench(m)) startPossession(m, ev, other(m.firstReceiver), 'kickoff');", "    startPossession(m, ev, other(m.firstReceiver), 'kickoff');"],
  ['Receivers choose first at half time', 'js/engine.js', 'const order = [other(receiver), receiver]', 'const order = [receiver, other(receiver)]'],
  ['CPU never uses the bench', 'js/ai.js', "return cost(worst) >= hold ? worst : 'stay';", "return 'stay';"],
  ['Rookie keeps the injured player on', 'js/ai.js', "case 'bench': return step.pos && step.options.includes(step.pos) ? step.pos : step.options[0];", "case 'bench': return 'stay';"],

  // Online play.
  ['Moves accepted out of turn', 'js/online.js', "if (actingTeam(match) !== remoteTeam) return { ok: false, reason: 'not their turn' };", ''],
  ['Unused dice accepted', 'js/online.js', "if (rng.consumed() !== values.length) return { ok: false, reason: 'bad dice' };", ''],
  ['Dice of 1 accepted', 'js/online.js', 'v >= 0 && v < 1', 'v >= 0 && v <= 1'],
  ['Move order not checked', 'js/online.js', "if (!entry || entry.s !== match.seq) return { ok: false, reason: 'out of order' };", "if (!entry) return { ok: false, reason: 'out of order' };"],
  ['Phones compare who controls what', 'js/online.js', 'const { controllers, ...shared } = match;', 'const shared = match;'],
  ['Team names not cut to length', 'js/online.js', "name: String(team?.name || 'Visitors').slice(0, 14),", "name: String(team?.name || 'Visitors'),"],
  ['Kits from the other phone not checked', 'js/online.js', 'kit: sanitiseKit(team?.kit),', 'kit: team?.kit ?? null,'],

  // The clock, sudden death and the decision timer.
  ['The clock never runs out', 'js/engine.js', 'match.clock >= halfRolls(match);', 'match.clock > halfRolls(match) * 10;'],
  ['A tapped penalty ends the last play', 'js/engine.js', "if (reason !== 'quickTap' && timeUp(m)) {", 'if (timeUp(m)) {'],
  ['Choices use up the clock', 'js/engine.js', "  if (step.type === 'roll') {\n    m.rolls++;", "  if (step.type !== 'halftime') {\n    m.rolls++;"],
  ['The clock carries over into the second half', 'js/engine.js', '    m.clock = 0;\n    m.lastPlay = false;', '    m.lastPlay = false;'],
  ['No sudden death in knockouts', 'js/engine.js', 'if (a === b && m.decider) {', 'if (a === b && m.decider && m.half > 2) {'],
  ['Sudden death goes on after a score', 'js/engine.js', "if (!m.suddenDeath && (m.format === 'rolls' ||", "if ((m.format === 'rolls' ||"],
  ['A draw goes to the home side', 'js/engine.js', 'm.winner = a === b ? null : a > b ? 0 : 1;', 'm.winner = a >= b ? 0 : 1;'],
  ['A timeout gives the penalty to the slow side', 'js/engine.js', "    awardPenalty(m, ev, other(step.team));\n  } else if (step.type === 'halftime') {", "    awardPenalty(m, ev, step.team);\n  } else if (step.type === 'halftime') {"],
  ['Timeouts allowed at the draft', 'js/engine.js', "export const TIMED_DECISIONS = ['pass', 'drop', 'penalty', 'bench'];", "export const TIMED_DECISIONS = ['pass', 'drop', 'penalty', 'bench', 'draft'];"],
  ['Online timeouts not sent', 'js/online.js', "  if (action.type === 'timeout') return { t: 't' };\n", ''],
  ['The CPU kicks three late when it needs a try', 'js/ai.js', 'return behind <= 3 && chance >= 1 / 3;', 'return chance >= 1 / 3;'],
  ['Pro kicks at evens', 'js/ai.js', 'dropAt: 2 / 3, penaltyAt: 2 / 3, pass: {}, cards: {} },', 'dropAt: 0.5, penaltyAt: 0.5, pass: {}, cards: {} },'],

  // The dice guide and the badges.
  ['Guide tones not turned round for the other side', 'js/guide.js', 'tone: flip ? FLIP[f.tone] : f.tone', 'tone: f.tone'],
  ['Injury badge left off', 'js/guide.js', "{ kind: 'injury', value: -parts.injury,", "{ kind: 'injury', value: 0,"],
  ['Sin bin badge left off the tackle dice', 'js/guide.js', 'const mod = defenceModifier(match, step.team);', 'const mod = 0;'],
  ['Wind left off the kick badge', 'js/guide.js', "{ kind: 'wind', value: wind,", "{ kind: 'wind', value: 0,"],

  // Bonus points, draws, the World Cup and class.
  ['Bonus point for a draw', 'js/tournament.js', "if (margin < 0 && -margin <= POINTS.losingBonusWithin) return 'close';", "if (margin <= 0 && -margin <= POINTS.losingBonusWithin) return 'close';"],
  ['A draw worth a win', 'js/tournament.js', 'row.points += POINTS.draw;', 'row.points += POINTS.win;'],
  ['Best thirds ignore their pools', 'js/tournament.js', 'const slot = slots.find(x => !placed[x] && x.slice(2).includes(third.group));', 'const slot = slots.find(x => !placed[x]);'],
  ['Quarter-finals pair the wrong winners', 'js/tournament.js', "qf: [[2, 4, 'Stadium Australia, Sydney'], [1, 3, 'Brisbane Stadium']", "qf: [[1, 4, 'Stadium Australia, Sydney'], [2, 3, 'Brisbane Stadium']"],
  ['Third-placed sides by the wrong order', 'js/tournament.js', '({ ...rows[2], group })).sort(tableOrder).slice(0, 4);', '({ ...rows[2], group })).slice(0, 4);'],
  ['World Cup grounds neutral for Australia too', 'js/tournament.js', 'neutral: f.home !== t.host && f.away !== t.host', 'neutral: true'],
  ['Class favours the weaker side', 'js/tournament.js', 'm.teams[gap > 0 ? 0 : 1].cards = classCards(gap, rng);', 'm.teams[gap > 0 ? 1 : 0].cards = classCards(gap, rng);'],
  ['Made-up players for real sides', 'js/tournament.js', 'roster: realRoster(team.id) || randomRoster(team.flavour, rng)', 'roster: randomRoster(team.flavour, rng)'],
  ['Knockouts on the clock can end level', 'js/tournament.js', 'decider: isKnockout(f),', 'decider: false,'],
];

function run(cwd) {
  return new Promise(resolve => {
    const files = ['dice', 'engine', 'exhaustive', 'invariants', 'ai', 'commentary', 'cards', 'players', 'tournament', 'career', 'coach', 'online', 'winprob', 'color', 'season', 'champions', 'club', 'conditions', 'daily', 'friends', 'clock', 'guide'].map(f => `test/${f}.test.mjs`);
    const child = spawn(process.execPath, ['--test', ...files], { cwd, env: { ...process.env, FUZZ_MATCHES: '120' }, stdio: 'ignore' });
    child.on('exit', code => resolve(code));
  });
}

async function mutant([name, file, from, to]) {
  const dir = mkdtempSync(join(tmpdir(), 'mutant-'));
  try {
    for (const d of ['js', 'test']) cpSync(join(root, d), join(dir, d), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const path = join(dir, file);
    const src = readFileSync(path, 'utf8');
    if (!src.includes(from)) return { name, status: 'stale (code changed)' };
    writeFileSync(path, src.replace(from, to));
    const code = await run(dir);
    return { name, status: code === 0 ? 'SURVIVED' : 'killed' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// MUTANT=clock runs only the mutants whose name contains that text (or any of a|b|c);
// MUTANT_SHARD=2/3 runs every third one starting from the second, for CI.
const only = process.env.MUTANT?.toLowerCase();
const [shard, shards] = (process.env.MUTANT_SHARD || '1/1').split('/').map(Number);
const results = [];
const queue = MUTANTS.filter(([name], i) => (!only || only.split('|').some(o => name.toLowerCase().includes(o))) && i % shards === shard - 1);
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) results.push(await mutant(queue.shift()));
}));

results.sort((a, b) => a.name.localeCompare(b.name));
for (const r of results) console.log(`${r.status.padEnd(20)} ${r.name}`);
const bad = results.filter(r => r.status !== 'killed');
console.log(`\n${results.length - bad.length}/${results.length} planted bugs caught`);
process.exit(bad.length ? 1 : 0);
