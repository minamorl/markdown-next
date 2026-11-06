/* global process */
// A new Node process is launched for EACH cold sample; no parser warmup occurs
// before the first observation. Module loading / corpus IO are outside timing.
const { read, hash, createRunner } = require('../test/characterization/support.cjs');
const [id, mode, warmupArg, warmSamplesArg] = process.argv.slice(2);
const fixture = read('test/characterization/corpus.json').cases.find((c) => c.id === id);
if (!fixture) throw new Error(`Unknown case: ${id}`);
const run = createRunner(fixture, mode);
function measure() {
  const { outcome, ...metrics } = run(true);
  return { ...metrics, outcomeSha256: hash(JSON.stringify(outcome)), status: outcome.status };
}
global.gc();
const cold = measure();
const warm = [];
if (Number(warmSamplesArg) > 0) {
  for (let i = 0; i < Number(warmupArg); i++) run();
  for (let i = 0; i < Number(warmSamplesArg); i++) warm.push(measure());
}
process.stdout.write(JSON.stringify({ cold, warm }));
