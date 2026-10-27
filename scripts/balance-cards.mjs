// Measures how much each team card helps, by playing CPU-vs-CPU matches
// where one side holds the card and the other holds none, then a full draft
// to see who the draft favours.
// Usage: node scripts/balance-cards.mjs [games per card] [length]
//        CARDS=jackal,fortress node scripts/balance-cards.mjs 4000

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const GAMES = Number(process.argv[2] || 4000);
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
        if (job.against) m.teams[1 - holder].card = job.against;
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
  const { CARD_IDS } = await import('../js/cards.js');
  const only = process.env.CARDS ? process.env.CARDS.split(',') : null;
  const jobs = CARD_IDS.filter(c => !only || only.includes(c)).map((card, i) => ({ kind: 'card', card, games: GAMES, seed: 10000 * (CARD_IDS.indexOf(card) + 1) }));
  if (!only) jobs.push({ kind: 'draft', games: GAMES * 2, seed: 999999 });
  const threads = Math.min(availableParallelism(), jobs.length);
  const buckets = Array.from({ length: threads }, () => []);
  jobs.forEach((job, i) => buckets[i % threads].push(job));
  const file = fileURLToPath(import.meta.url);
  const out = (await Promise.all(buckets.map(b => new Promise((resolve, reject) => {
    const w = new Worker(file, { workerData: { jobs: b } });
    w.on('message', resolve);
    w.on('error', reject);
  })))).flat();

  const se = n => Math.sqrt(0.25 / n) * 100;
  console.log(`${GAMES} ${LENGTH} matches per card (±${(1.96 * se(GAMES)).toFixed(1)}% at 95%)`);
  for (const r of out.filter(r => r.kind === 'card').sort((a, b) => b.wins - a.wins)) {
    console.log(`${r.card.padEnd(18)} wins ${(100 * r.wins / r.games).toFixed(1)}%   margin ${(r.points / r.games).toFixed(2)}`);
  }
  const d = out.find(r => r.kind === 'draft');
  if (d) console.log(`full draft: toss loser (first pick) wins ${(100 * d.firstPickWins / d.games).toFixed(1)}% of ${d.games}`);
}
