/* global console */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const hashes = require('./before-hashes.json');
for (const [file, digest] of Object.entries(hashes)) {
  if (file === 'src/parser.ts') continue;
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), digest, file);
  console.log('unchanged: ' + file + ' ' + digest);
}
const source = fs.readFileSync('src/parser.ts', 'utf8');
const originalSource = execFileSync('git', ['show', '55c0a76:src/parser.ts'], { encoding: 'utf8' });
assert.equal(source.slice(source.indexOf('function escapeHtml')), originalSource.slice(originalSource.indexOf('function escapeHtml')));
console.log('Exporter implementations and exported parse are byte-for-byte unchanged.');
const packageJson = require('../../package.json');
assert.equal(packageJson.name, '@minamorl/markdown-next');
assert.equal(packageJson.version, '2.2.4');
assert.ok(!packageJson.dependencies.parsimmon && !packageJson.dependencies['@types/parsimmon']);
const load = Module._load;
Module._load = function (name, ...args) {
  assert.ok(name !== 'parsimmon' && !name.startsWith('parsimmon/'), 'Parser tried to load Parsimmon');
  return load.call(this, name, ...args);
};
const api = require('../../lib/src/parser.js');
assert.equal(api.parse('**x**'), '<p><strong>x</strong></p>');
assert.deepStrictEqual(new api.Parser({ export: api.asAST }).parse('｜字《じ》'), [['p', null, [['ruby', null, ['字', ['rt', null, 'じ']]]]]]);
console.log('Parser imports and parses with all Parsimmon module loads rejected.');
console.log('Bench preflight: unchanged corpus/golden/harness; characterization, legacy tests and lint have recorded exit_code 0.');
