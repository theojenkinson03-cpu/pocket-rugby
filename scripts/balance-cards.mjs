// Measures how much each team card helps at each rarity, by playing
// CPU-vs-CPU matches where one side holds the card and the other holds none,
// then full drafts to see who the draft favours.
// Usage: node scripts/balance-cards.mjs [games per card] [length]
//        CARDS=jackal,fortress RARITIES=mythic node scripts/balance-cards.mjs 4000

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const GAMES = Number(process.argv[2] || 10000);
const LENGTH = process.argv[3] || 'standard';

async function work({ jobs }) {
  const { act, newMatch, seededRng } = await import('../js/engine.js');
  const { cpuChoice } = await import('../js/ai.js');
  const play = (m, rng) => {
    while (m.step.type !== 'fulltime') {
      const action = m.step.type === 'roll' ? { type: 'roll' } : m.step.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice(m, rng) };
      m = act(m, action, rng).state;
    }
    return m;
  };
  const results = [];
  for (const job of jobs) {
    let wins = 0;
    let firstPickWins = 0;
    let points = 0;
    for (let g = 0; g < job.games; g++) {
      const rng = seededRng(job.seed + g);
      if (job.kind === 'card') {
        const holder = g % 2;
        const m = newMatch({ mode: '2p', length: LENGTH });
        m.teams[holder].card = job.card;
        m.teams[holder].cardRarity = job.rarity;
        const end = play(m, rng);
        if (end.winner === holder) wins++;
        points += end.teams[holder].score - end.teams[1 - holder].score;
      } else {
        const m = newMatch({ mode: '2p', length: LENGTH, cards: true });
        const end = play(m, rng);
        const firstPicker = 1 - end.firstReceiver;
        if (end.winner === firstPicker) firstPickWins++;
      }
    }
    results.push({ ...job, wins, firstPickWins, points });
  }
  return results;
}

if (!isMainThread) {
  work(workerData).then(r => parentPort.postMessage(r));
} else {
  const { CARD_IDS, RARITY_IDS } = await import('../js/cards.js');
  const only = process.env.CARDS ? process.env.CARDS.split(',') : null;
  const rarities = process.env.RARITIES ? process.env.RARITIES.split(',') : RARITY_IDS;
  const jobs = [];
  for (const rarity of rarities) {
    for (const card of CARD_IDS.filter(c => !only || only.includes(c))) {
      jobs.push({ kind: 'card', card, rarity, games: GAMES, seed: 10000 * (CARD_IDS.indexOf(card) + 1) + 1e6 * RARITY_IDS.indexOf(rarity) });
    }
  }
  // Drafts in slices, so they share the threads evenly.
  if (!only && !process.env.RARITIES) for (let k = 0; k < 4; k++) jobs.push({ kind: 'draft', games: GAMES, seed: 9e6 + k * GAMES });
  const threads = Math.min(availableParallelism(), jobs.length);
  const buckets = Array.from({ length: threads }, () => []);
  jobs.forEach((job, i) => buckets[i % threads].push(job));
  const file = fileURLToPath(import.meta.url);
  const out = (await Promise.all(buckets.map(b => new Promise((resolve, reject) => {
    const w = new Worker(file, { workerData: { jobs: b } });
    w.on('message', resolve);
    w.on('error', reject);
  })))).flat();

  // value: the holder's win rate above 50%, as in js/cards.js.
  const se = n => Math.sqrt(0.25 / n) * 100;
  console.log(`${GAMES} ${LENGTH} matches per card and rarity (win rate ±${(1.96 * se(GAMES)).toFixed(1)}%, value ±${(1.96 * se(GAMES) / 100).toFixed(3)} at 95%)`);
  for (const rarity of rarities) {
    console.log(`\n${rarity}`);
    for (const r of out.filter(r => r.kind === 'card' && r.rarity === rarity).sort((a, b) => b.wins - a.wins)) {
      const p = r.wins / r.games;
      console.log(`${r.card.padEnd(18)} wins ${(100 * p).toFixed(1)}%   value ${(p - 0.5).toFixed(3)}   margin ${(r.points / r.games).toFixed(2)}`);
    }
  }
  const drafts = out.filter(r => r.kind === 'draft');
  if (drafts.length) {
    const games = drafts.reduce((n, d) => n + d.games, 0);
    const wins = drafts.reduce((n, d) => n + d.firstPickWins, 0);
    console.log(`\nfull draft: toss loser (first pick) wins ${(100 * wins / games).toFixed(1)}% of ${games} (±${(1.96 * se(games)).toFixed(1)}%)`);
  }
}
