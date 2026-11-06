/* global process, console, __dirname, structuredClone */
// Narrow, reviewable migration: compare against the accepted scanner revision,
// independently encode ONLY its two Markdown-code productions, never refreeze.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { isDeepStrictEqual } = require('node:util');
const root = path.resolve(__dirname, '../..');
const original = file => execFileSync('git', ['show', 'eb825d9:' + file], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const oldGolden = JSON.parse(original('test/characterization/golden.json'));
const corpus = JSON.parse(original('test/characterization/corpus.json'));
assert.equal(fs.readFileSync(path.join(root, 'test/characterization/corpus.json'), 'utf8'), original('test/characterization/corpus.json'));
let source = original('src/parser.ts');
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
  assert.deepStrictEqual(actualRunner(fixture, 'html')().outcome, permitted, fixture.id + '/html security-only change');
  assert.deepStrictEqual(actualRunner(fixture, 'ast')().outcome, before.ast, fixture.id + '/ast must not change');
  if (!isDeepStrictEqual(permitted, before.html)) {
    updated.entries[i].html = permitted;
    changes.push({ id: fixture.id, input: fixture.input, before: before.html.value, after: permitted.value });
  }
}
const file = path.join(root, 'test/characterization/golden.json');
if (process.argv.includes('--write')) fs.writeFileSync(file, JSON.stringify(updated, null, 2) + '\n');
assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), updated, 'Golden must contain ONLY the permitted changes');
const report = path.join(__dirname, 'golden-code-escaping.json');
if (process.argv.includes('--write')) fs.writeFileSync(report, JSON.stringify(changes, null, 2) + '\n');
else assert.deepStrictEqual(JSON.parse(fs.readFileSync(report, 'utf8')), changes);
console.log('Changed HTML entries: ' + changes.map(row => row.id).join(', '));
console.log('All AST entries, plugin traces, diagnostics, statuses, corpus and remaining golden fields are unchanged.');
console.log('The reference transforms only the accepted scanner\'s code span/fence productions; raw HTML passthrough is unchanged.');
