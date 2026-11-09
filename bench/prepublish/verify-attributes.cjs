/* global console, __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { isDeepStrictEqual } = require('node:util');
const { root, read, hash, createRunner } = require('../../test/characterization/support.cjs');
const source = fs.readFileSync(path.join(__dirname, 'before-parser.ts.txt'), 'utf8');
assert.equal(hash(source), '49d149a1b4eeb7790033fc17a877f154f96cba5b3626810da5363a1315fe43d6');
const reference = new Module(path.join(root, 'lib/src/attribute-reference.cjs'));
reference.filename = reference.id;
reference.paths = Module._nodeModulePaths(path.dirname(reference.filename));
reference._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 } }).outputText, reference.filename);
const supportFile = path.join(root, 'test/characterization/support.cjs');
const support = new Module(supportFile);
support.filename = supportFile;
support.paths = Module._nodeModulePaths(path.dirname(supportFile));
const ordinaryRequire = support.require.bind(support);
support.require = name => name === '../../lib/src/parser.js' ? reference.exports : ordinaryRequire(name);
support._compile(fs.readFileSync(supportFile, 'utf8'), supportFile);
const changes = read('bench/prepublish/attribute-changes.json');
assert.deepStrictEqual(changes.map(row => row.id), ['html-attrs', 'html-mismatch']);
const golden = read('test/characterization/golden.json');
const pipeChanges = read('bench/prepublish/pipe-line-changes.json');
for (const change of pipeChanges) {
  const index = golden.entries.findIndex(row => row.id === change.id);
  assert.deepStrictEqual(golden.entries[index], change.after);
  golden.entries[index] = change.before;
}
for (const change of changes) {
  const index = golden.entries.findIndex(row => row.id === change.id);
  assert.deepStrictEqual(golden.entries[index], change.after);
  golden.entries[index] = change.before;
}
assert.equal(hash(JSON.stringify(golden, null, 2) + '\n'), 'a7cbcaa12b02467f7ad017d76d1c22208bb64e812516abad79ba810a3ce107d0');
let unchanged = 0;
const observedChanges = [];
for (const [index, fixture] of read('test/characterization/corpus.json').cases.entries()) {
  const before = { id: fixture.id }, after = { id: fixture.id };
  for (const mode of ['html', 'ast']) {
    before[mode] = support.exports.createRunner(fixture, mode)().outcome;
    const pipeChange = pipeChanges.find(row => row.id === fixture.id);
    const actual = createRunner(fixture, mode)().outcome;
    if (pipeChange) assert.deepStrictEqual(actual, pipeChange.after[mode]);
    after[mode] = pipeChange ? pipeChange.before[mode] : actual;
  }
  assert.deepStrictEqual(before, golden.entries[index], fixture.id + '/pinned baseline');
  if (!isDeepStrictEqual(before, after)) observedChanges.push({ id: fixture.id, input: fixture.input, before, after });
  else unchanged++;
}
assert.deepStrictEqual(observedChanges, changes, 'Only documented attribute inputs may change');
const fragments = ['', 'x', '&amp;', '<b>x</b>', '<b >x</b>', '<br>', '<hr />', '<b>x</i>', '<code><i>x</i></code>', '<b></b>'];
let generated = 0;
for (const left of fragments) for (const right of fragments) for (const prefix of ['', '> ', '## ']) {
  const fixture = { input: prefix + left + right, plugins: 'none' };
  for (const mode of ['html', 'ast']) {
    assert.deepStrictEqual(createRunner(fixture, mode)().outcome, support.exports.createRunner(fixture, mode)().outcome, fixture.input + '/' + mode);
    generated++;
  }
}
console.log('Changed frozen inputs: ' + changes.map(row => row.id).join(', '));
console.log(`${unchanged} frozen inputs unchanged; ${generated} generated attribute-free HTML/AST comparisons unchanged.`);
console.log('Pinned pre-fix parser and full original golden hashes match; documented old/new values match actual parsers.');
console.log('Historical attribute audit verified after reversing the separately audited pipe-line migration.');
