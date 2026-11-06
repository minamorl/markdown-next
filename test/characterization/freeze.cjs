/* global console, __dirname */
// Maintainer-only capture. Tests NEVER invoke this or update the golden files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Mocha = require('mocha');
const { api, root, hash, write, createRunner } = require('./support.cjs');
const { cases: extra } = require('./corpus.cjs');
const baselineRevision = 'f71fb55dd35cd102c64135ae15a9837ee3ca6b21';
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), baselineRevision,
  'Capture is restricted to the original baseline revision');
const source = fs.readFileSync(path.join(root, 'src/parser.ts'));
assert.deepStrictEqual(source, execFileSync('git', ['show', `${baselineRevision}:src/parser.ts`], { cwd: root }));
for (const file of ['corpus.json', 'golden.json']) {
  assert.ok(!fs.existsSync(path.join(__dirname, file)), `Refusing to overwrite ${file}`);
}
const cases = [];
const provenance = [];
const original = api.Parser.prototype.parse;
let currentTest = '';
api.Parser.prototype.parse = function (input) {
  const profile = Object.keys(this.opts.plugins || {}).sort().join(',') || 'none';
  const key = JSON.stringify([input, profile]);
  let index = provenance.indexOf(key);
  if (index === -1) {
    index = cases.length;
    provenance.push(key);
    cases.push({ id: `legacy-${String(index + 1).padStart(3, '0')}`, input, plugins: profile, category: 'legacy', sources: [] });
  }
  cases[index].sources.push(currentTest);
  return original.call(this, input);
};
const mocha = new Mocha({ reporter: 'dot' });
mocha.addFile(path.join(root, 'lib/test/test-parser.js'));
const runner = mocha.run((failures) => {
  api.Parser.prototype.parse = original;
  assert.equal(failures, 0, 'Existing tests must pass before capture');
  cases.push(...extra);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  const corpus = { schema: 1, baselineRevision, cases };
  const golden = {
    schema: 1, baselineRevision,
    parserSha256: hash(source),
    legacyTestSha256: hash(fs.readFileSync(path.join(root, 'test/test-parser.ts'))),
    corpusSha256: hash(JSON.stringify(corpus)),
    runtimeExports: Object.keys(api).sort(),
    entries: cases.map((fixture) => ({
      id: fixture.id,
      html: createRunner(fixture, 'html')().outcome,
      ast: createRunner(fixture, 'ast')().outcome,
    })),
  };
  write('test/characterization/corpus.json', corpus);
  write('test/characterization/golden.json', golden);
  console.log(`Frozen ${cases.length} inputs; ${runner.stats.tests} existing tests; AST + HTML + plugin traces.`);
});
runner.on('test', (test) => { currentTest = test.fullTitle(); });
