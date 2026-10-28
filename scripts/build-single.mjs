// Packs the game into one self-contained HTML page (dist/pocket-rugby.html):
// styles inlined and the ES modules wrapped into a single script.
// Usage: node scripts/build-single.mjs [--fragment] [--dev]
// --fragment leaves out <html>/<head>/<body> for hosts that add their own.
// --dev builds the dev channel (dist/pocket-rugby-dev...): titled
// "Pocket Rugby Dev", with a DEV badge and the commit it was built from.

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');
const fragment = process.argv.includes('--fragment');
const dev = process.argv.includes('--dev');
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  } catch {
    return 'unknown';
  }
})();
const build = { channel: dev ? 'dev' : 'real', commit, date: new Date().toISOString().slice(0, 10) };

// Dependencies before dependants.
const ORDER = ['dice', 'cards', 'engine', 'winprob', 'ai', 'players', 'commentary', 'tournament', 'career', 'coach', 'online', 'color', 'dom', 'dice-view', 'card-view', 'career-view', 'tournament-view', 'online-view', 'report', 'pitch', 'audio', 'cinema', 'store', 'app'];

function wrapModule(name) {
  const exported = [];
  const body = read(`js/${name}.js`)
    .replace(/^import \{([^}]+)\} from '\.\/([\w-]+)\.js';$/gm, (_, names, from) => {
      if (!ORDER.includes(from)) throw new Error(`${name} imports unknown module ${from}`);
      return `const {${names}} = __modules['${from}'];`;
    })
    .replace(/^export (async function\*?|function\*?|const|let|class)\s+([\w$]+)/gm, (_, kind, id) => {
      exported.push(id);
      return `${kind} ${id}`;
    });
  if (/^\s*(import|export)\s/m.test(body)) throw new Error(`${name}.js has an import/export the bundler does not understand`);
  return `__modules['${name}'] = (() => {\n${body}\nreturn { ${exported.join(', ')} };\n})();`;
}

const html = read('index.html');
const between = (start, end) => {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`missing ${start}`);
  return html.slice(a + start.length, b).trim();
};

const fonts = between('<!-- build:head -->', '<!-- /build:head -->')
  .split('\n')
  .filter(line => line.includes('fonts.g'))
  .join('\n');
const body = between('<!-- build:body -->', '<!-- /build:body -->');
const css = read('css/style.css');
const js = `const __modules = {};\n${ORDER.map(wrapModule).join('\n\n')}`;

const head = `<title>${dev ? 'Pocket Rugby Dev' : 'Pocket Rugby'}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="A dice rugby game for one or two players.">
${fonts}
<style>
${css}
</style>`;
const page = `${body}\n<script>window.POCKET_RUGBY_BUILD = ${JSON.stringify(build)};</script>\n<script type="module">\n${js}\n</script>`;

const out = fragment
  ? `${head}\n${page}\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${page}\n</body>\n</html>\n`;

mkdirSync(join(root, 'dist'), { recursive: true });
const file = join(root, 'dist', `pocket-rugby${dev ? '-dev' : ''}${fragment ? '.fragment' : ''}.html`);
writeFileSync(file, out);
console.log(`wrote ${file} (${(out.length / 1024).toFixed(0)} KB)`);
