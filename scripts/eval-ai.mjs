// Head-to-head CPU strength: plays matches between two CPU settings.
// Usage: node scripts/eval-ai.mjs [games] [levelA:personality] [levelB:personality] [rollouts]
//   node scripts/eval-ai.mjs 400 expert:balanced pro:balanced 160

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const [games = 400, a = 'expert:balanced', b = 'pro:balanced', rollouts = 160] = process.argv.slice(2);

async function work({ from, to, sides, rollouts: n, cards }) {
  const { act, newMatch, seededRng } = await import('../js/engine.js');
  const { cpuChoice, expertChoice } = await import('../js/ai.js');
  let wins = 0;
  for (let g = from; g < to; g++) {
    const rng = seededRng(424242 + g);
    const aSide = g % 2;
    let m = newMatch({ mode: '2p', cards });
    while (m.step.type !== 'fulltime') {
      let action;
      if (m.step.type === 'roll') action = { type: 'roll' };
      else if (m.step.type === 'halftime') action = { type: 'continue' };
      else {
        const [level, personality] = sides[m.step.team === aSide ? 0 : 1].split(':');
        const view = { ...m, cpuLevel: level, cpuPersonality: personality };
        const value = level === 'expert' && m.step.purpose !== 'toss' ? expertChoice(view, { rollouts: n }) : cpuChoice(view, rng);
        action = { type: 'choose', value };
      }
      m = act(m, action, rng).state;
    }
    if (m.winner === aSide) wins++;
  }
  return wins;
}

if (!isMainThread) {
  work(workerData).then(r => parentPort.postMessage(r));
} else {
  const n = Number(games);
  const threads = availableParallelism();
  const per = Math.ceil(n / threads);
  const file = fileURLToPath(import.meta.url);
  const cards = process.env.CARDS !== 'off';
  const wins = (await Promise.all(Array.from({ length: threads }, (_, i) => new Promise((resolve, reject) => {
    const w = new Worker(file, { workerData: { from: i * per, to: Math.min(n, (i + 1) * per), sides: [a, b], rollouts: Number(rollouts), cards } });
    w.on('message', resolve);
    w.on('error', reject);
  })))).reduce((x, y) => x + y, 0);
  const se = Math.sqrt(0.25 / n) * 196;
  console.log(`${a} beats ${b} in ${(100 * wins / n).toFixed(1)}% of ${n} matches (±${se.toFixed(1)}%)${cards ? ' with team cards' : ''}`);
}
