/* global console, __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { root, read, hash, createRunner } = require('../../test/characterization/support.cjs');
const changes = read('bench/prepublish/pipe-line-changes.json');
assert.deepStrictEqual(changes.map(row => row.id), ['table-invalid-separator']);
const golden = read('test/characterization/golden.json');
for (const change of changes) {
  const index = golden.entries.findIndex(row => row.id === change.id);
  assert.deepStrictEqual(golden.entries[index], change.after);
  golden.entries[index] = change.before;
}
assert.equal(hash(JSON.stringify(golden, null, 2) + '\n'), 'd1d8a973944253022d607f1d1a9e0448ac7518483ec37e44dad3684059184990',
  'Only the documented pipe-line HTML/AST entry may change; all other entries and metadata stay frozen');
const suspicious = golden.entries.filter(row => /\[object Object\]|"status":false/.test(JSON.stringify(row)));
assert.deepStrictEqual(suspicious.map(row => row.id), changes.map(row => row.id));
// Reuse the already pinned historical scanner: its invalid-table output is
// identical to the pre-2.3.1 output, and this works in shallow CI checkouts.
const source = fs.readFileSync(path.join(__dirname, 'before-parser.ts.txt'), 'utf8');
assert.equal(hash(source), '49d149a1b4eeb7790033fc17a877f154f96cba5b3626810da5363a1315fe43d6');
const reference = new Module(path.join(root, 'lib/src/pipe-line-reference.cjs'));
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
for (const change of changes) {
  const fixture = read('test/characterization/corpus.json').cases.find(row => row.id === change.id);
  assert.equal(fixture.input, change.input);
  for (const mode of ['html', 'ast']) {
    assert.deepStrictEqual(support.exports.createRunner(fixture, mode)().outcome, change.before[mode], mode + '/historical output');
    assert.deepStrictEqual(createRunner(fixture, mode)().outcome, change.after[mode], mode + '/corrected paragraph');
    assert.deepStrictEqual({ ...change.after[mode], value: change.before[mode].value }, change.before[mode], mode + '/only value may change');
  }
}
console.log('Changed frozen input: table-invalid-separator (HTML and AST values only).');
console.log(`${golden.entries.length - changes.length} other frozen inputs and all metadata unchanged; pre-migration golden SHA-256 matches.`);
console.log('Historical [object Object] / status:false entries: table-invalid-separator only; documented old/new outputs match actual parsers.');
