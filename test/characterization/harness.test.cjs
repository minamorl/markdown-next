/* global process, Buffer */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const { root, hash, read } = require('./support.cjs');
const { percentile, summarize } = require('../../bench/stats.cjs');
const { decodeJournal } = require('../../bench/checkpoint.cjs');

test('checkpoint keeps complete UTF-8 records and discards only a torn final append', () => {
  const complete = '{"type":"header"}\n{"input":"日本語"}\n';
  const good = decodeJournal(complete);
  assert.deepStrictEqual(good.records, [{ type: 'header' }, { input: '日本語' }]);
  assert.equal(good.completeBytes, Buffer.byteLength(complete));
  assert.equal(good.torn, false);
  const torn = decodeJournal(complete + '{"type":"sam');
  assert.deepStrictEqual(torn.records, good.records);
  assert.equal(torn.completeBytes, good.completeBytes);
  assert.equal(torn.torn, true);
  assert.throws(() => decodeJournal('{broken}\n{"ok":true}\n'));
});

test('nearest-rank percentiles and minimum samples are enforced', () => {
  const values = [5, 1, 4, 2, 3];
  assert.equal(percentile(values, 0.5), 3);
  assert.equal(percentile(values, 0.95), 5);
  assert.deepStrictEqual(values, [5, 1, 4, 2, 3]);
  assert.equal(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 0.95), 19);
  assert.throws(() => summarize([{ elapsedMs: 1, heapDeltaBytes: 1 }]));
  assert.throws(() => percentile([NaN], 0.5));
});

test('comparison runner rejects HTML, AST, and plugin argument regressions', () => {
  const mutations = [
    "api.parse = () => 'wrong HTML';",
    "api.asAST.mapper = () => () => ['wrong AST', null, null];",
    `const original = api.Parser.prototype.parse;
     api.Parser.prototype.parse = function(input) {
       if (this.opts.plugins?.probe) {
         const callback = this.opts.plugins.probe;
         this.opts.plugins.probe = (args, ...rest) => callback(args + 'wrong', ...rest);
       }
       return original.call(this, input);
     };`,
  ];
  for (const mutation of mutations) {
    assert.throws(() => execFileSync(process.execPath, ['-e',
      `const api = require('./lib/src/parser.js'); ${mutation} require('./test/characterization/run.cjs');`,
    ], { cwd: root, stdio: 'pipe', timeout: 30000 }), (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr.toString(), /AssertionError/);
      return true;
    });
  }
});

test('benchmark worker returns independently verified cold and warm observations', () => {
  const corpus = read('test/characterization/corpus.json');
  const golden = read('test/characterization/golden.json');
  const id = 'plugin-inline';
  assert.ok(corpus.cases.some((c) => c.id === id));
  for (const mode of ['html', 'ast']) {
    const data = JSON.parse(execFileSync(process.execPath, [
      '--expose-gc', 'bench/worker.cjs', id, mode, '2', '5',
    ], { cwd: root, encoding: 'utf8', timeout: 30000 }));
    assert.equal(data.warm.length, 5);
    const expected = hash(JSON.stringify(golden.entries.find((e) => e.id === id)[mode]));
    for (const sample of [data.cold, ...data.warm]) {
      assert.equal(sample.outcomeSha256, expected);
      assert.ok(Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= 0);
      assert.ok(Number.isFinite(sample.heapDeltaBytes));
    }
  }
});
