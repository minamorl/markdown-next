/* global console, Buffer */
// Independent raw-data checks: do not import the benchmark's percentile code.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { read, hash } = require('../test/characterization/support.cjs');
const { loadJournal } = require('./checkpoint.cjs');
// Historical baseline remains immutable; validate the current release candidate.
const data = read('bench/prepublish/benchmark.json');
const corpus = read('test/characterization/corpus.json');
const golden = read('test/characterization/golden.json');
const journal = loadJournal('bench/prepublish/benchmark.json.journal.jsonl');
assert.equal(journal.torn, false);
for (const key of ['parserSha256', 'compiledParserSha256', 'parserDependenciesSha256', 'harnessSha256', 'corpusSha256', 'goldenSha256', 'runtime', 'options']) assert.deepStrictEqual(journal.records[0].identity[key], data[key], key);
assert.equal(data.results.length, corpus.cases.length * 2);
assert.equal(new Set(data.results.map((r) => r.id + '/' + r.mode)).size, data.results.length);
// golden.parserSha256 identifies the original legacy capture, not this scanner.
assert.equal(data.parserSha256, hash(fs.readFileSync('src/parser.ts')));
assert.equal(data.compiledParserSha256, hash(fs.readFileSync('lib/src/parser.js')));
assert.equal(data.corpusSha256, hash(JSON.stringify(corpus)));
assert.equal(data.goldenSha256, hash(fs.readFileSync('test/characterization/golden.json')));
for (const [file, digest] of Object.entries(data.harnessSha256)) assert.equal(hash(fs.readFileSync(file)), digest, file);
for (const [file, digest] of Object.entries(data.parserDependenciesSha256)) assert.equal(hash(fs.readFileSync(file)), digest, file);
for (const [file, digest] of Object.entries(read('bench/prepublish/measurement-input-hashes.json'))) assert.equal(hash(fs.readFileSync(file)), digest, file);
const children = journal.records.filter((r) => r.type === 'sample');
assert.equal(children.length, data.results.length * data.options.samples);
assert.equal(new Set(children.map((r) => r.id + '/' + r.mode + '/' + r.sample)).size, children.length);
let cold = 0;
let warm = 0;
let exceptions = 0;
let negativeHeap = 0;
for (const fixture of corpus.cases) for (const mode of ['html', 'ast']) {
  const result = data.results.find((r) => r.id === fixture.id && r.mode === mode);
  assert.ok(result, fixture.id + '/' + mode);
  assert.equal(result.utf16Length, fixture.input.length);
  assert.equal(result.codePoints, [...fixture.input].length);
  assert.equal(result.utf8Bytes, Buffer.byteLength(fixture.input));
  assert.equal(result.cold.length, data.options.samples);
  assert.equal(result.warm.length, data.options['warm-samples']);
  assert.ok(result.cold.length >= 5 && result.warm.length >= 5);
  const expected = golden.entries.find((r) => r.id === fixture.id)[mode];
  for (const state of ['cold', 'warm']) {
    for (const sample of result[state]) {
      assert.equal(sample.outcomeSha256, hash(JSON.stringify(expected)));
      assert.equal(sample.status, expected.status);
      assert.ok(Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= 0);
      assert.ok(Number.isFinite(sample.heapDeltaBytes));
      if (state === 'cold') cold++; else warm++;
      if (sample.status === 'throw') exceptions++;
      if (sample.heapDeltaBytes < 0) negativeHeap++;
    }
    const times = result[state].map((x) => x.elapsedMs).sort((a, b) => a - b);
    assert.equal(result.summary[state].n, times.length);
    assert.equal(result.summary[state].p50Ms, times[Math.ceil(times.length / 2) - 1]);
    assert.equal(result.summary[state].p95Ms, times[Math.ceil(times.length * 0.95) - 1]);
    const heap = result[state].map((x) => x.heapDeltaBytes).sort((a, b) => a - b);
    assert.equal(result.summary[state].p50HeapDeltaBytes, heap[Math.ceil(heap.length / 2) - 1]);
  }
  for (let i = 0; i < data.options.samples; i++) {
    const saved = children.find((r) => r.id === fixture.id && r.mode === mode && r.sample === i);
    assert.deepStrictEqual(saved.cold, result.cold[i]);
    assert.deepStrictEqual(saved.warm, i === 0 ? result.warm : []);
  }
}
console.log(`Validated ${data.results.length} input/mode rows; cold=${cold}, warm=${warm}, total=${cold + warm}; journal children=${children.length}.`);
console.log('Every raw digest/status and p50/p95/heap median match golden and independent sorted recalculation.');
console.log('Source, compiled parser, corpus, golden and harness hashes match; journal matches final JSON.');
console.log(`Exception observations=${exceptions}; negative net heap deltas=${negativeHeap} (not allocation totals).`);
