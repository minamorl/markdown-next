/* global console, Buffer */
// Independent percentile/digest/journal validation; no benchmark stats helper.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const data = require('../prepublish/benchmark.json');
const baseline = require('../../bench/results/baseline.json');
const corpus = require('../../test/characterization/corpus.json');
const golden = require('../../test/characterization/golden.json');
const text = fs.readFileSync('bench/prepublish/benchmark.json.journal.jsonl', 'utf8');
assert.ok(text.endsWith('\n'));
const records = text.trimEnd().split('\n').map(line => JSON.parse(line));
const children = records.filter(row => row.type === 'sample');
for (const key of ['parserSha256', 'compiledParserSha256', 'parserDependenciesSha256', 'harnessSha256', 'corpusSha256', 'goldenSha256', 'runtime', 'options']) assert.deepStrictEqual(records[0].identity[key], data[key], key);
assert.equal(data.results.length, corpus.cases.length * 2);
assert.equal(new Set(data.results.map(row => row.id + '/' + row.mode)).size, data.results.length);
assert.equal(data.parserSha256, hash(fs.readFileSync('src/parser.ts')));
assert.equal(data.compiledParserSha256, hash(fs.readFileSync('lib/src/parser.js')));
assert.equal(data.corpusSha256, hash(JSON.stringify(corpus)));
assert.equal(data.goldenSha256, hash(fs.readFileSync('test/characterization/golden.json')));
for (const [file, digest] of Object.entries(data.harnessSha256)) assert.equal(hash(fs.readFileSync(file)), digest, file);
for (const [file, digest] of Object.entries(data.parserDependenciesSha256)) assert.equal(hash(fs.readFileSync(file)), digest, file);
for (const key of ['samples', 'warm-samples', 'warmup', 'case']) assert.equal(data.options[key], baseline.options[key]);
assert.equal(data.runtime.parsimmon, null);
for (const [file, digest] of Object.entries(require('../prepublish/measurement-input-hashes.json'))) assert.equal(hash(fs.readFileSync(file)), digest, file);
assert.equal(children.length, data.results.length * data.options.samples);
assert.equal(new Set(children.map(row => row.id + '/' + row.mode + '/' + row.sample)).size, children.length);
const saved = new Map(children.map(row => [row.id + '/' + row.mode + '/' + row.sample, row]));
let cold = 0, warm = 0, exceptions = 0;
for (const fixture of corpus.cases) for (const mode of ['html', 'ast']) {
  const row = data.results.find(row => row.id === fixture.id && row.mode === mode);
  const expected = golden.entries.find(row => row.id === fixture.id)[mode];
  assert.equal(row.utf16Length, fixture.input.length);
  assert.equal(row.codePoints, [...fixture.input].length);
  assert.equal(row.utf8Bytes, Buffer.byteLength(fixture.input));
  assert.equal(row.cold.length, 5);
  assert.equal(row.warm.length, 20);
  for (const state of ['cold', 'warm']) {
    for (const observation of row[state]) {
      assert.equal(observation.outcomeSha256, hash(JSON.stringify(expected)));
      assert.equal(observation.status, expected.status);
      assert.ok(Number.isFinite(observation.elapsedMs) && observation.elapsedMs >= 0);
      assert.ok(Number.isFinite(observation.heapDeltaBytes));
      if (state === 'cold') cold++; else warm++;
      if (observation.status === 'throw') exceptions++;
    }
    const times = row[state].map(sample => sample.elapsedMs).sort((a, b) => a - b);
    assert.equal(row.summary[state].n, times.length);
    assert.equal(row.summary[state].p50Ms, times[Math.ceil(times.length * 0.5) - 1]);
    assert.equal(row.summary[state].p95Ms, times[Math.ceil(times.length * 0.95) - 1]);
    const heap = row[state].map(sample => sample.heapDeltaBytes).sort((a, b) => a - b);
    assert.equal(row.summary[state].p50HeapDeltaBytes, heap[Math.ceil(heap.length * 0.5) - 1]);
  }
  for (let i = 0; i < 5; i++) {
    const child = saved.get(row.id + '/' + row.mode + '/' + i);
    assert.deepStrictEqual(child.cold, row.cold[i]);
    assert.deepStrictEqual(child.warm, i === 0 ? row.warm : []);
  }
}
assert.deepStrictEqual(records[0].identity.parserSha256, data.parserSha256);
assert.deepStrictEqual(records[0].identity.harnessSha256, data.harnessSha256);
assert.deepStrictEqual(records[0].identity.parserDependenciesSha256, data.parserDependenciesSha256);
console.log(`Validated ${data.results.length} rows; cold=${cold}, warm=${warm}, total=${cold + warm}; journal children=${children.length}.`);
console.log('Every raw digest/status and p50/p95/heap median matches golden and independent sorted recalculation.');
console.log('Current source, entity table, compiled parser, corpus, golden, package/README and harness hashes match; journal matches JSON.');
console.log('Historical baseline is retained; sample counts/warmup match. Runtime is recorded for this run; no cross-run runtime equivalence is required or claimed.');
console.log(`Exception observations=${exceptions}. Shared-host load remains explicit in raw; no isolated causal speedup claim.`);
