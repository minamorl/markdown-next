/* global __dirname */
// Unmodified bench/run.cjs requires a bench/ output path. Redirect only its two
// rewrite output files to the assigned src/ evidence directory, before any IO.
// No timer, worker, corpus, measurement or output content is changed.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const fake = path.join(root, 'bench/results/rewrite.json');
const target = path.join(__dirname, 'benchmark.json');
function redirect(file) {
  if (typeof file !== 'string') return file;
  const absolute = path.resolve(file);
  if (absolute === fake) return target;
  if (absolute === fake + '.journal.jsonl') return target + '.journal.jsonl';
  return file;
}
for (const name of ['openSync', 'writeFileSync', 'readFileSync', 'existsSync', 'truncateSync']) {
  const original = fs[name];
  fs[name] = function (file, ...args) { return original.call(this, redirect(file), ...args); };
}
const mkdir = fs.mkdirSync;
fs.mkdirSync = function (file, ...args) {
  return mkdir.call(this, typeof file === 'string' && path.resolve(file) === path.dirname(fake) ? __dirname : file, ...args);
};
