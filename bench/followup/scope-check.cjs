/* global console */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const changed = [...git(['diff', '--name-only', 'HEAD']).split('\n'), ...git(['ls-files', '--others', '--exclude-standard']).split('\n')].filter(Boolean);
for (const file of changed) assert.ok(file.startsWith('src/') || file.startsWith('bench/') || ['test/readme.test.cjs', 'test/readme-expected.json', 'test/security.test.cjs', 'test/characterization/golden.json', 'README.md', 'package.json', 'pnpm-lock.yaml', 'docs/rewrite.md'].includes(file), file);
assert.deepStrictEqual(fs.readdirSync('src'), ['parser.ts']);
for (const file of ['test/test-parser.ts', 'test/characterization/corpus.json', 'bench/worker.cjs', 'bench/stats.cjs', 'bench/checkpoint.cjs', 'test/characterization/support.cjs']) assert.equal(fs.readFileSync(file, 'utf8'), git(['show', 'eb825d9:' + file]), file);
const before = JSON.parse(git(['show', 'eb825d9:package.json']));
const after = JSON.parse(fs.readFileSync('package.json'));
const dependencies = { ...before.devDependencies, react: '19.2.4', '@types/react': '19.2.14' };
assert.deepStrictEqual(after.devDependencies, dependencies);
const expectedScripts = { ...before.scripts,
  test: 'pnpm run build && mocha lib/test && node --test test/readme.test.cjs test/security.test.cjs',
  'test:characterization': before.scripts['test:characterization'] + ' && node bench/followup/security-golden.cjs',
  'test:readme': 'npm run build && node --test test/readme.test.cjs',
};
assert.deepStrictEqual(after.scripts, expectedScripts);
assert.deepStrictEqual({ ...after, scripts: before.scripts, devDependencies: before.devDependencies }, before);
assert.equal(git(['diff', '--check']), '');
assert.ok(fs.readFileSync('bench/followup/network-incident.txt', 'utf8').includes('violates'));
console.log('src/ is product-only; changed files are inside the authorized follow-up scope.');
console.log('Legacy tests, corpus, workers, timing/percentile/checkpoint logic and support are unchanged.');
console.log('Manifest changes are only README/security tests and real React development dependencies; package version remains 2.2.4.');
console.log('git diff --check: clean. Network-constraint deviation remains explicitly recorded.');
