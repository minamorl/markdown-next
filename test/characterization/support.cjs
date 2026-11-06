/* global console, process, __dirname */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { format } = require('node:util');
const root = path.resolve(__dirname, '../..');
const api = require('../../lib/src/parser.js');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const write = (file, value) => {
  // Refuse lossy snapshots (undefined, NaN, etc.) rather than silently normalize output.
  const json = JSON.stringify(value, null, 2) + '\n';
  assert.deepStrictEqual(JSON.parse(json), value, `Not JSON-lossless: ${file}`);
  fs.writeFileSync(path.join(root, file), json);
};

function pluginsFor(profile, calls) {
  if (profile === 'none') return undefined;
  const callbacks = {
    id: (_args, content) => content,
    print: (args) => args,
    extention: (_args, content, mapper) => mapper('extention', null)(content.trim()),
    probe: (args, content, mapper, join) => mapper('probe', { args })(join([content === null ? 'inline' : content, '!'])),
    explode: () => { throw new TypeError('characterization plugin failure'); },
  };
  const names = profile === 'probe' ? ['probe', 'explode'] : profile.split(',');
  return Object.fromEntries(names.map((name) => {
    assert.equal(typeof callbacks[name], 'function', `Unknown plugin: ${name}`);
    return [name, (args, content, mapper, join) => {
      calls.push({ name, args, content, mapper: typeof mapper, join: typeof join });
      return callbacks[name](args, content, mapper, join);
    }];
  }));
}

// Construction is included in the default operation, just as in exported parse().
// Reuse is a separate characterization path, never conflated with that timing.
function createRunner(fixture, mode, { reuse = false } = {}) {
  assert.ok(['html', 'ast'].includes(mode));
  const calls = [];
  const plugins = pluginsFor(fixture.plugins, calls);
  const opts = { export: mode === 'html' ? api.asHTML : api.asAST, plugins };
  const parser = reuse ? new api.Parser(opts) : null;
  return function run(timed = false) {
    calls.length = 0;
    const diagnostics = [];
    const original = console.error;
    console.error = (...args) => diagnostics.push(format(...args));
    let outcome;
    let value;
    let error;
    let failed = false;
    let end;
    let after;
    const before = timed ? process.memoryUsage().heapUsed : 0;
    const start = timed ? process.hrtime.bigint() : 0n;
    try {
      value = parser ? parser.parse(fixture.input)
        : mode === 'html' && fixture.plugins === 'none' ? api.parse(fixture.input)
        : new api.Parser(opts).parse(fixture.input);
    } catch (caught) {
      failed = true;
      error = caught;
    } finally {
      end = timed ? process.hrtime.bigint() : 0n;
      after = timed ? process.memoryUsage().heapUsed : 0;
      console.error = original;
    }
    outcome = failed
      ? { status: 'throw', error: { name: error?.name, message: error?.message }, diagnostics, calls: [...calls] }
      : { status: 'return', value, diagnostics, calls: [...calls] };
    return { outcome, ...(timed ? { elapsedMs: Number(end - start) / 1e6, heapDeltaBytes: after - before } : {}) };
  };
}

module.exports = { api, root, hash, read, write, createRunner };
