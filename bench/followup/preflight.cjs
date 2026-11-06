/* global console */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const git = args => execFileSync('git', args, { maxBuffer: 8 * 1024 * 1024 });
const hash = data => createHash('sha256').update(data).digest('hex');
for (const file of git(['ls-tree', '-r', '--name-only', 'eb825d9', '--', 'src/rewrite-evidence']).toString().trim().split('\n')) {
  const moved = file.replace('src/rewrite-evidence/', 'bench/results/rewrite-initial/');
  assert.equal(hash(fs.readFileSync(moved)), hash(git(['show', 'eb825d9:' + file])), moved);
}
assert.deepStrictEqual(fs.readdirSync('src'), ['parser.ts']);
for (const file of ['test/test-parser.ts', 'test/characterization/corpus.json']) assert.deepStrictEqual(fs.readFileSync(file), git(['show', 'eb825d9:' + file]));
const manifest = JSON.parse(fs.readFileSync('package.json'));
assert.equal(manifest.name, '@minamorl/markdown-next');
assert.equal(manifest.version, '2.2.4');
assert.deepStrictEqual(manifest.dependencies, {});
assert.throws(() => require.resolve('parsimmon'), { code: 'MODULE_NOT_FOUND' });
assert.match(fs.readFileSync('lib/src/parser.d.ts', 'utf8'), /export type ASTNode =/);
const before = git(['show', 'eb825d9:bench/run.cjs']).toString();
const after = fs.readFileSync('bench/run.cjs', 'utf8');
const preamble = after.slice(after.indexOf('// Parsimmon is historical provenance'), after.indexOf('const options ='));
assert.equal(after.replace(preamble, '\n').replaceAll('parsimmon: parsimmonVersion,', "parsimmon: require('parsimmon/package.json').version,"), before, 'Only benchmark provenance handling may change');
for (const file of ['characterization.txt', 'mocha-readme-security.txt', 'readme.txt', 'build.txt', 'lint.txt', 'install-final-frozen.txt']) assert.match(fs.readFileSync('bench/followup/' + file, 'utf8'), /exit_code: 0; signal: null\n$/);
const files = ['src/parser.ts', 'lib/src/parser.js', 'test/characterization/golden.json', 'test/characterization/corpus.json', 'bench/run.cjs', 'bench/worker.cjs', 'bench/stats.cjs', 'bench/checkpoint.cjs', 'README.md', 'package.json', 'pnpm-lock.yaml'];
fs.writeFileSync('bench/followup/measurement-input-hashes.json', JSON.stringify(Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(file))])), null, 2) + '\n');
console.log('Initial evidence moved byte-for-byte; src/ contains only parser.ts.');
console.log('Legacy test/corpus unchanged; ASTNode is type-only; no Parsimmon dependency can be resolved.');
console.log('Benchmark timing logic unchanged; only historical dependency provenance permits absence.');
console.log('Characterization, mocha/README/security, build, lint and offline frozen-install logs all have exit_code 0.');
