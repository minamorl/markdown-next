/* global console */
const assert = require('node:assert/strict');
const { api, hash, read, createRunner } = require('./support.cjs');
const corpus = read('test/characterization/corpus.json');
const golden = read('test/characterization/golden.json');
assert.equal(hash(JSON.stringify(corpus)), golden.corpusSha256, 'Frozen corpus changed');
assert.deepStrictEqual(Object.keys(api).sort(), golden.runtimeExports, 'Runtime exports changed');
assert.deepStrictEqual(corpus.cases.map((c) => c.id), golden.entries.map((e) => e.id));
let checks = 0;
for (const [i, fixture] of corpus.cases.entries()) {
  for (const mode of ['html', 'ast']) {
    assert.deepStrictEqual(createRunner(fixture, mode)().outcome, golden.entries[i][mode], `${fixture.id}/${mode}`);
    checks++;
  }
}
// Reuse one Parser across the entire corpus, including failures, then repeat it
// in reverse order. Fresh parsers alone cannot detect leaked list/footnote state.
for (const mode of ['html', 'ast']) {
  const contexts = new Map();
  for (const index of [...corpus.cases.keys(), ...[...corpus.cases.keys()].reverse()]) {
    const fixture = corpus.cases[index];
    // createRunner closes over its fixture; switch input on the shared object.
    if (!contexts.has(fixture.plugins)) {
      const shared = { ...fixture };
      contexts.set(fixture.plugins, { shared, run: createRunner(shared, mode, { reuse: true }) });
    }
    const context = contexts.get(fixture.plugins);
    context.shared.input = fixture.input;
    assert.deepStrictEqual(context.run().outcome, golden.entries[index][mode], `reuse ${fixture.id}/${mode}`);
    checks++;
  }
}
console.log(`${corpus.cases.length} frozen inputs; ${checks} exact comparisons (AST, HTML, plugin calls, diagnostics, forward/reverse reuse).`);
console.log(`baseline=${golden.baselineRevision} corpus_sha256=${golden.corpusSha256}`);
