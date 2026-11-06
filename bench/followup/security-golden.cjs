/* global process, console, __dirname, structuredClone */
// Narrow, reviewable migration: compare against the accepted scanner revision,
// independently encode ONLY its two Markdown-code productions, never refreeze.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const { isDeepStrictEqual } = require('node:util');
const root = path.resolve(__dirname, '../..');
const provenance = require('./accepted-reference.json');
const hash = data => createHash('sha256').update(data).digest('hex');
// A compact, hash-pinned reference keeps this gate independent of Git history
// (including shallow CI checkouts). Reconstruct the original golden by
// reverting exactly the one permitted HTML field, then verify its full hash.
const oldGolden = JSON.parse(fs.readFileSync(path.join(root, 'test/characterization/golden.json'), 'utf8'));
// Reverse the separately audited 2.3.0 attribute migration before checking this
// historical code-escaping migration. Neither gate refreezes arbitrary output.
const attributeChanges = require('../prepublish/attribute-changes.json');
for (const change of attributeChanges) {
  const index = oldGolden.entries.findIndex(row => row.id === change.id);
  assert.deepStrictEqual(oldGolden.entries[index], change.after);
  oldGolden.entries[index] = change.before;
}
oldGolden.entries.find(row => row.id === provenance.permittedId).html.value = provenance.previousHtml;
assert.equal(hash(JSON.stringify(oldGolden, null, 2) + '\n'), provenance.goldenSha256);
const corpusBytes = fs.readFileSync(path.join(root, 'test/characterization/corpus.json'));
assert.equal(hash(corpusBytes), provenance.corpusSha256);
const corpus = JSON.parse(corpusBytes);
let source = fs.readFileSync(path.join(__dirname, 'accepted-scanner.ts.txt'), 'utf8');
assert.equal(hash(source), provenance.parserSha256);
for (const site of ["this.node('code', this.input.slice(a, b))", "this.node('code', this.join(code))"]) {
  assert.equal(source.split(site).length, 2, 'Exactly one original Markdown code production per site');
  source = source.replace(site, site.replace("'code'", "'markdown-code-reference'"));
}
const reference = new Module(path.join(root, 'lib/src/security-reference.cjs'));
reference.filename = reference.id;
reference.paths = Module._nodeModulePaths(path.dirname(reference.filename));
reference._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 } }).outputText, reference.filename);
const mapper = reference.exports.asHTML.mapper;
reference.exports.asHTML.mapper = (tag, attrs) => tag === 'markdown-code-reference'
  ? content => mapper('code', attrs)(content.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;'))
  : mapper(tag, attrs);
const supportFile = path.join(root, 'test/characterization/support.cjs');
const support = new Module(supportFile);
support.filename = supportFile;
support.paths = Module._nodeModulePaths(path.dirname(supportFile));
const ordinaryRequire = support.require.bind(support);
support.require = name => name === '../../lib/src/parser.js' ? reference.exports : ordinaryRequire(name);
support._compile(fs.readFileSync(supportFile, 'utf8'), supportFile);
const actualRunner = require('../../test/characterization/support.cjs').createRunner;
const updated = structuredClone(oldGolden);
const changes = [];
for (const [i, fixture] of corpus.cases.entries()) {
  const before = oldGolden.entries[i];
  const permitted = support.exports.createRunner(fixture, 'html')().outcome;
  const oldRest = { ...before.html }, newRest = { ...permitted };
  delete oldRest.value;
  delete newRest.value;
  assert.deepStrictEqual(newRest, oldRest, fixture.id + ': only HTML value may change');
  const attributeChange = attributeChanges.find(row => row.id === fixture.id);
  if (attributeChange) {
    assert.deepStrictEqual(permitted, attributeChange.before.html);
    assert.deepStrictEqual(before.ast, attributeChange.before.ast);
  }
  assert.deepStrictEqual(actualRunner(fixture, 'html')().outcome, attributeChange ? attributeChange.after.html : permitted, fixture.id + '/html reviewed migrations');
  assert.deepStrictEqual(actualRunner(fixture, 'ast')().outcome, attributeChange ? attributeChange.after.ast : before.ast, fixture.id + '/ast reviewed migrations');
  if (!isDeepStrictEqual(permitted, before.html)) {
    updated.entries[i].html = permitted;
    changes.push({ id: fixture.id, input: fixture.input, before: before.html.value, after: permitted.value });
  }
}
const file = path.join(root, 'test/characterization/golden.json');
for (const change of attributeChanges) updated.entries[updated.entries.findIndex(row => row.id === change.id)] = change.after;
if (process.argv.includes('--write')) fs.writeFileSync(file, JSON.stringify(updated, null, 2) + '\n');
assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), updated, 'Golden must contain ONLY the permitted changes');
const report = path.join(__dirname, 'golden-code-escaping.json');
if (process.argv.includes('--write')) fs.writeFileSync(report, JSON.stringify(changes, null, 2) + '\n');
else assert.deepStrictEqual(JSON.parse(fs.readFileSync(report, 'utf8')), changes);
console.log('Changed HTML entries: ' + changes.map(row => row.id).join(', '));
console.log('Historical code-escaping migration verified after reversing the separately audited attribute migration.');
console.log('Only the listed code HTML and attribute HTML/AST entries change; plugin traces, diagnostics, statuses and corpus are unchanged.');
