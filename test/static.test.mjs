// Static checks on the page and the build: every element the code looks up
// exists, every file the offline cache lists is real, and the single-file
// build is valid JavaScript.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const html = read('index.html');
const sources = readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).map(f => [f, read(`js/${f}`)]);
const ids = new Set([...html.matchAll(/\sid="([\w-]+)"/g)].map(m => m[1]));

test('every element id the scripts look up exists in the page', () => {
  const missing = [];
  for (const [file, src] of sources) {
    const refs = [
      // Ids followed by ${...} are built from templates and listed below.
      ...src.matchAll(/\$\(['`]#([\w-]+)(?![\w$-])/g),
      ...src.matchAll(/getElementById\(['`]([\w-]+)['`]\)/g),
      ...src.matchAll(/querySelector(?:All)?\(['`]#([\w-]+)(?![\w$-])/g),
    ].map(m => m[1]);
    for (const id of refs) if (!ids.has(id)) missing.push(`${file}: #${id}`);
  }
  // Ids built from templates.
  const templated = [
    ...['home', 'setup', 'match'].map(v => `view-${v}`),
    ...['1p', '2p'].map(v => `mode-${v}`),
    ...['quick', 'standard', 'long'].map(v => `len-${v}`),
    ...['rookie', 'pro'].map(v => `cpu-${v}`),
    ...[0, 1].flatMap(t => [`team${t}-name`, `team${t}-kits`, `team${t}-tag`]),
    ...['sound', 'odds', 'fast', 'autodef', 'haptics', 'cinema'].map(v => `set-${v}`),
  ];
  for (const id of templated) if (!ids.has(id)) missing.push(`template: #${id}`);
  assert.deepEqual(missing, []);
});

test('ids are unique', () => {
  const all = [...html.matchAll(/\sid="([\w-]+)"/g)].map(m => m[1]);
  assert.equal(all.length, new Set(all).size, 'duplicate id in index.html');
});

test('every dialog the page opens exists', () => {
  const targets = new Set([...html.matchAll(/data-open="([\w-]+)"/g), ...sources.flatMap(([, s]) => [...s.matchAll(/openDialog\('([\w-]+)'\)/g)])].map(m => m[1]));
  for (const id of targets) assert.match(html, new RegExp(`<dialog[^>]+id="${id}"`), `dialog ${id}`);
});

test('every CSS variable used is defined in the stylesheet or set by the scripts', () => {
  const css = read('css/style.css');
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  const setByJs = new Set(sources.flatMap(([, s]) => [...s.matchAll(/setProperty\('(--[\w-]+)'/g)].map(m => m[1])));
  const used = [...new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]))];
  const undefinedVars = used.filter(v => !defined.has(v) && !setByJs.has(v));
  assert.deepEqual(undefinedVars, []);
});

test('the offline cache and the manifest only list files that exist', () => {
  const sw = read('sw.js');
  const files = [...sw.matchAll(/'([^']+\.(?:html|css|js|svg|png|webmanifest))'/g)].map(m => m[1]);
  for (const f of files) assert.ok(existsSync(join(root, f)), `sw.js lists ${f}`);
  for (const [f] of sources) assert.ok(files.includes(`js/${f}`), `sw.js caches js/${f}`);
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(root, icon.src)), icon.src);
});

test('no debugging left in the game code', () => {
  for (const [file, src] of sources) {
    assert.doesNotMatch(src, /console\.log|debugger/, file);
  }
});

test('the single-file build is valid and self-contained', () => {
  execFileSync(process.execPath, [join(root, 'scripts/build-single.mjs')], { stdio: 'pipe' });
  const out = readFileSync(join(root, 'dist/pocket-rugby.html'), 'utf8');
  const script = out.slice(out.indexOf('<script type="module">') + 22, out.lastIndexOf('</script>'));
  assert.doesNotMatch(script, /^\s*(import|export)\s/m, 'no module statements left');
  assert.doesNotMatch(out, /src="js\/|href="css\//, 'no links to local files');
  const dir = mkdtempSync(join(tmpdir(), 'pocket-rugby-'));
  writeFileSync(join(dir, 'bundle.mjs'), script);
  execFileSync(process.execPath, ['--check', join(dir, 'bundle.mjs')], { stdio: 'pipe' });
  for (const id of ids) assert.ok(out.includes(`id="${id}"`), `build keeps #${id}`);
});
