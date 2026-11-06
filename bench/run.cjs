/* global console, process, Buffer, __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root, read, hash, write } = require('../test/characterization/support.cjs');
const { summarize } = require('./stats.cjs');
const { loadJournal, appendRecord } = require('./checkpoint.cjs');
// Parsimmon is historical provenance, not a benchmark or parser dependency.
let parsimmonVersion = null;
try { parsimmonVersion = require('parsimmon/package.json').version; }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }


const options = { samples: 5, 'warm-samples': 20, warmup: 10, output: 'bench/results/baseline.json', case: '', resume: false };
for (const arg of process.argv.slice(2)) {
  const match = /^--([^=]+)=(.*)$/.exec(arg);
  assert.ok(match && Object.hasOwn(options, match[1]), `Unknown option: ${arg}`);
  const key = match[1];
  if (typeof options[key] === 'boolean') {
    assert.ok(['true', 'false'].includes(match[2]), `Invalid --${key}`);
    options[key] = match[2] === 'true';
  } else options[key] = typeof options[key] === 'number' ? Number(match[2]) : match[2];
}
for (const key of ['samples', 'warm-samples', 'warmup']) {
  assert.ok(Number.isSafeInteger(options[key]) && options[key] >= (key === 'warmup' ? 1 : 5), `Invalid --${key}`);
}
const output = path.resolve(root, options.output);
assert.ok(output.startsWith(path.join(root, 'bench') + path.sep), 'Output must be under bench/');
assert.ok(!fs.existsSync(output) || options.resume, 'Refusing to overwrite an existing benchmark without explicit --resume=true');
const journal = output + '.journal.jsonl';
const corpus = read('test/characterization/corpus.json');
const golden = read('test/characterization/golden.json');
assert.equal(hash(JSON.stringify(corpus)), golden.corpusSha256);
const fixtures = corpus.cases.filter((c) => !options.case || c.id === options.case);
assert.ok(fixtures.length > 0, 'No matching corpus cases');
const measurementOptions = { ...options };
delete measurementOptions.resume;
const identity = {
  baselineRevision: golden.baselineRevision,
  measuredRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  parserSha256: hash(fs.readFileSync(path.join(root, 'src/parser.ts'))),
  compiledParserSha256: hash(fs.readFileSync(path.join(root, 'lib/src/parser.js'))),
  parserDependenciesSha256: Object.fromEntries(['src/html-entities.ts', 'lib/src/html-entities.js'].map(f => [f, hash(fs.readFileSync(path.join(root, f)))])),
  goldenSha256: hash(fs.readFileSync(path.join(root, 'test/characterization/golden.json'))),
  harnessSha256: Object.fromEntries(['bench/run.cjs', 'bench/worker.cjs', 'bench/stats.cjs', 'bench/checkpoint.cjs', 'test/characterization/support.cjs'].map((f) => [f, hash(fs.readFileSync(path.join(root, f)))])),
  corpusSha256: golden.corpusSha256, options: measurementOptions,
  runtime: {
    node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch,
    release: os.release(), cpu: os.cpus()[0]?.model || 'unknown',
    nodeOptions: process.env.NODE_OPTIONS || '', execArgv: process.execArgv,
    parsimmon: parsimmonVersion,
  },
};
fs.mkdirSync(path.dirname(output), { recursive: true });
let records;
if (options.resume) {
  const saved = loadJournal(journal);
  assert.deepStrictEqual(saved.records[0]?.identity, identity, 'Resume requires identical source, harness, runtime, corpus and options');
  if (saved.torn) fs.truncateSync(journal, saved.completeBytes);
  records = saved.records;
} else {
  const header = { type: 'header', schema: 1, began: new Date().toISOString(), loadBefore: os.loadavg(), identity };
  appendRecord(journal, header, true);
  records = [header];
}
const session = { type: 'session', started: new Date().toISOString(), resume: options.resume, load: os.loadavg() };
appendRecord(journal, session);
records.push(session);
const savedSamples = new Map();
for (const record of records.filter((r) => r.type === 'sample')) {
  const key = JSON.stringify([record.id, record.mode, record.sample]);
  assert.ok(!savedSamples.has(key), 'Duplicate checkpoint sample');
  savedSamples.set(key, record);
}
if (options.resume) console.log(`Resuming ${savedSamples.size} saved child measurements from ${path.relative(root, journal)}.`);
const results = [];
// Sequential children only: concurrent benchmark workers would contaminate timings.
for (const [index, fixture] of fixtures.entries()) {
  const expected = golden.entries.find((e) => e.id === fixture.id);
  for (const mode of ['html', 'ast']) {
    const cold = [];
    let warm = [];
    for (let sample = 0; sample < options.samples; sample++) {
      const key = JSON.stringify([fixture.id, mode, sample]);
      let data = savedSamples.get(key);
      if (!data) {
        const started = new Date().toISOString();
        const measured = JSON.parse(execFileSync(process.execPath, [
          '--expose-gc', path.join(__dirname, 'worker.cjs'), fixture.id, mode,
          String(options.warmup), String(sample === 0 ? options['warm-samples'] : 0),
        ], { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }));
        data = { type: 'sample', id: fixture.id, mode, sample, started, ended: new Date().toISOString(), ...measured };
      }
      assert.equal(data.warm.length, sample === 0 ? options['warm-samples'] : 0);
      for (const measurement of [data.cold, ...data.warm]) {
        assert.equal(measurement.outcomeSha256, hash(JSON.stringify(expected[mode])), `${fixture.id}/${mode}: output changed`);
        assert.ok(Number.isFinite(measurement.elapsedMs) && measurement.elapsedMs >= 0);
        assert.ok(Number.isFinite(measurement.heapDeltaBytes));
      }
      if (!savedSamples.has(key)) appendRecord(journal, data);
      cold.push(data.cold);
      if (sample === 0) warm = data.warm;
    }
    results.push({
      id: fixture.id, category: fixture.category, plugins: fixture.plugins, mode,
      utf16Length: fixture.input.length, codePoints: [...fixture.input].length,
      utf8Bytes: Buffer.byteLength(fixture.input), cold, warm,
      summary: { cold: summarize(cold), warm: summarize(warm) },
    });
  }
  if ((index + 1) % 25 === 0 || index + 1 === fixtures.length) console.log(`Measured ${index + 1}/${fixtures.length} inputs (HTML + AST).`);
}
write(path.relative(root, output), {
  schema: 1, began: records[0].began, ended: new Date().toISOString(),
  ...identity, sessions: records.filter((r) => r.type === 'session'),
  environment: {
    node: process.version, v8: process.versions.v8, versions: process.versions,
    platform: process.platform, arch: process.arch, release: os.release(),
    cpu: os.cpus()[0]?.model || 'unknown', logicalCpus: os.cpus().length,
    availableParallelism: os.availableParallelism(), totalMemoryBytes: os.totalmem(),
    loadBefore: records[0].loadBefore, loadAfter: os.loadavg(),
    nodeOptions: process.env.NODE_OPTIONS || '', execArgv: process.execArgv,
    childExecArgv: ['--expose-gc'],
    parsimmon: parsimmonVersion,
    typescript: require('typescript/package.json').version,
    mocha: require('mocha/package.json').version,
  },
  methodology: {
    clock: 'process.hrtime.bigint, milliseconds', percentile: 'nearest rank: sorted[ceil(p*n)-1]',
    cold: 'One first parse in each fresh Node process, after require/corpus IO and forced GC; startup/imports excluded.',
    warm: 'Same first child, after its cold parse and warmup additional parses; consecutive single-call samples, no forced GC between them.',
    construction: 'Every timed call includes a new Parser. Default HTML uses exported parse; plugins and AST use new Parser(opts).parse.',
    memory: 'Signed heapUsed after minus before each call, outside the timer. NET HEAP CHANGE, not allocated bytes; GC can make it negative.',
    validation: 'Every timed result including plugin traces/errors is hashed and checked against the frozen golden outside the timer.',
  },
  results,
});
console.log(`Raw samples + p50/p95: ${path.relative(root, output)}`);
