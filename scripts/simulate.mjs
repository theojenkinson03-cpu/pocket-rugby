// Plays CPU-vs-CPU matches and prints balance numbers.
// Usage: node scripts/simulate.mjs [games] [length]

import { act, newMatch, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';

const games = Number(process.argv[2] || 2000);
const length = process.argv[3] || 'standard';

const totals = { actions: 0, tries: 0, conversions: 0, penaltyGoals: 0, dropGoals: 0, lineBreaks: 0, cards: 0, injuries: 0, setPieces: 0, penalties: 0, quickTaps: 0, ruckSteals: 0, intercepts: 0 };
let firstReceiverWins = 0;
const actionCounts = [];
const margins = [];

for (let g = 0; g < games; g++) {
  const rng = seededRng(g + 1);
  let m = newMatch({ mode: '2p', length });
  let actions = 0;
  while (m.step.type !== 'fulltime') {
    let action;
    if (m.step.type === 'roll') action = { type: 'roll' };
    else if (m.step.type === 'halftime') action = { type: 'continue' };
    else action = { type: 'choose', value: cpuChoice(m, rng) };
    const { state, events } = act(m, action, rng);
    for (const e of events) {
      if (e.type === 'injury') totals.injuries++;
      if (e.type === 'setPiece') totals.setPieces++;
      if (e.type === 'penalty') totals.penalties++;
      if (e.type === 'quickTap') totals.quickTaps++;
      if (e.type === 'ruck' && e.won) totals.ruckSteals++;
      if (e.type === 'intercept') totals.intercepts++;
    }
    m = state;
    actions++;
    if (actions > 5000) throw new Error('runaway match');
  }
  totals.actions += actions;
  actionCounts.push(actions);
  for (const t of m.teams) {
    totals.tries += t.stats.tries;
    totals.conversions += t.stats.conversions;
    totals.penaltyGoals += t.stats.penaltyGoals;
    totals.dropGoals += t.stats.dropGoals;
    totals.lineBreaks += t.stats.lineBreaks;
    totals.cards += t.stats.cards;
  }
  if (m.winner === m.firstReceiver) firstReceiverWins++;
  margins.push(Math.abs(m.teams[0].score - m.teams[1].score));
}

actionCounts.sort((a, b) => a - b);
margins.sort((a, b) => a - b);
const per = k => (totals[k] / games).toFixed(2);
console.log(`${games} ${length} matches`);
console.log(`actions/match  mean ${per('actions')}  median ${actionCounts[games >> 1]}  p10 ${actionCounts[Math.floor(games * 0.1)]}  p90 ${actionCounts[Math.floor(games * 0.9)]}`);
for (const k of Object.keys(totals).filter(k => k !== 'actions')) console.log(`${k.padEnd(14)} ${per(k)}`);
console.log(`first receiver wins ${(100 * firstReceiverWins / games).toFixed(1)}%`);
console.log(`median margin ${margins[games >> 1]}`);
