// Mutation testing: plants one deliberate rules bug at a time in a copy of
// the code and checks the test suite catches it. A bug that slips through
// ("survived") means a rule is not really tested.
// Usage: node scripts/mutate.mjs

import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// [rule broken, file, original text, replacement]
const MUTANTS = [
  ['Ruck steal against a Hit Up of 5', 'js/engine.js', "!face.special && intensity <= 4", "!face.special && intensity <= 5"],
  ['Ruck steal against big moves too', 'js/engine.js', "face.kind === 'run' && !face.special && intensity <= 4", "face.kind === 'run' && intensity <= 4"],
  ['Card penalty on one die only', 'js/engine.js', 'second.value + modifier]', 'second.value]'],
  ['Second-die Big Hit does not complete the tackle', 'js/engine.js', "else if (secondHit) outcome = 'bighit';", ''],
  ['Tackle must beat the intensity, not equal it', 'js/engine.js', 'total >= intensity', 'total > intensity'],
  ['Injury from a single Big Hit', 'js/engine.js', 'injury: firstHit && secondHit', 'injury: firstHit || secondHit'],
  ['Try worth 4', 'js/engine.js', "addPoints(m, ev, team, 5, 'try')", "addPoints(m, ev, team, 4, 'try')"],
  ['Conversion worth 3', 'js/engine.js', "conversion: ['conversions', 'conversionAttempts', 2]", "conversion: ['conversions', 'conversionAttempts', 3]"],
  ['Conceding side receives after a score', 'js/engine.js', "startPossession(m, ev, team, 'kickoff');\n}", "startPossession(m, ev, other(team), 'kickoff');\n}"],
  ['No conversion: straight to restart', 'js/engine.js', "m.step = { type: 'roll', purpose: 'range', dice: ['D'], team, kick: 'conversion' };", "afterScore(m, ev, team);"],
  ['Kick must beat the range, not equal it', 'js/engine.js', 'const good = distance >= range;', 'const good = distance > range;'],
  ['Video ref counts as no try', 'js/engine.js', "if (face.result === 'video') {", "if (face.result === 'never') {"],
  ['Missed drop goal keeps the ball', 'js/engine.js', "startPossession(m, ev, other(team), 'missedKick');", "startPossession(m, ev, team, 'missedKick');"],
  ['Quick tap lasts 2 runs', 'js/engine.js', 'export const QUICK_TAP_RUNS = 3;', 'export const QUICK_TAP_RUNS = 2;'],
  ['Quick tap never runs out', 'js/engine.js', '  m.quickTap--;\n', ''],
  ['Quick tap gives no bonus', 'js/engine.js', 'match.quickTap > 0 ? 1 : 0', 'match.quickTap > 0 ? 0 : 0'],
  ['Errors do not end quick tap', 'js/engine.js', "function setPiece(m, ev, piece, feeder) {\n  m.quickTap = 0;", 'function setPiece(m, ev, piece, feeder) {'],
  ['Injuries ignored', 'js/engine.js', '- match.teams[team].injuries[pos]', '- 0'],
  ['Half time in the second half too', 'js/engine.js', 'if (m.half === 1 && m.teams.some', 'if (m.teams.some'],
  ['Sin bin carries into the second half', 'js/engine.js', 'for (const t of m.teams) t.sinBin = false;', ''],
  ['Second yellow is not a red', 'js/engine.js', 'if (O.yellows >= 2) {', 'if (O.yellows >= 3) {'],
  ['Red card only -1', 'js/engine.js', 'if (t.yellows >= 2) return -2;', 'if (t.yellows >= 2) return -1;'],
  ['Crooked lineout rethrown by the same side', 'js/engine.js', "else if (outcome === 'notstraight') m.step = { ...m.step, team: other(team) };", "else if (outcome === 'notstraight') m.step = { ...m.step };"],
  ['Penalty Won goes to the wrong side', 'js/engine.js', "const awarded = face.penalty === 'won' ? team : other(team);", "const awarded = face.penalty === 'won' ? other(team) : team;"],
  ['Knock on gives the attackers the scrum', 'js/engine.js', 'setPiece(m, ev, piece, other(team));', 'setPiece(m, ev, piece, team);'],
  ['Intercept is not a turnover', 'js/engine.js', "startPossession(m, ev, other(team), 'intercept');", "startPossession(m, ev, team, 'intercept');"],
  ['Ruck won does not turn the ball over', 'js/engine.js', "if (DICE.K.faces[faceIndex].result === 'ruck') {", "if (DICE.K.faces[faceIndex].result === 'never') {"],
  ['Full time only beyond 30', 'js/engine.js', 'if (m.teams[team].score < m.target.full) return false;', 'if (m.teams[team].score <= m.target.full) return false;'],
  ['Same side receives in both halves', 'js/engine.js', "startPossession(m, ev, other(m.firstReceiver), 'kickoff');", "startPossession(m, ev, m.firstReceiver, 'kickoff');"],
  ['Passing back to the Scrum Half allowed', 'js/engine.js', "POSITIONS.filter(p => p !== 'S' && p !== from)", 'POSITIONS.filter(p => p !== from)'],
  ['Toss winner kicks instead of receiving', 'js/engine.js', 'const winner = result === action.value ? step.team : other(step.team);', 'const winner = result === action.value ? other(step.team) : step.team;'],
  ['Wing big move is 7', 'js/dice.js', "special('Into the Corner', 8)", "special('Into the Corner', 7)"],
  ['Back cannot drop goal', 'js/dice.js', "faces: [hitUp(3), hitUp(4), special('High Ball', 6), drop(), pass(), touch()]", "faces: [hitUp(3), hitUp(4), special('High Ball', 6), pass(), pass(), touch()]"],
  ['Pro CPU kicks at long odds', 'js/ai.js', 'return chance >= 0.5;', 'return chance >= 0.3;'],
  ['Break chance ignores the card', 'js/engine.js', 'lineBreak += breakChance(intensity, modifier, ruckEligible(face, intensity)) / 6;', 'lineBreak += breakChance(intensity, 0, ruckEligible(face, intensity)) / 6;'],
];

function run(cwd) {
  return new Promise(resolve => {
    const files = ['dice', 'engine', 'exhaustive', 'invariants', 'ai', 'commentary'].map(f => `test/${f}.test.mjs`);
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

const results = [];
const queue = [...MUTANTS];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) results.push(await mutant(queue.shift()));
}));

results.sort((a, b) => a.name.localeCompare(b.name));
for (const r of results) console.log(`${r.status.padEnd(20)} ${r.name}`);
const bad = results.filter(r => r.status !== 'killed');
console.log(`\n${results.length - bad.length}/${results.length} planted bugs caught`);
process.exit(bad.length ? 1 : 0);
