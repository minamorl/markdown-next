/* global console */
const fs = require('node:fs');
const baseline = require('../results/baseline.json');
const initial = require('../results/rewrite-initial/benchmark.json');
const current = require('../results/rewrite-secure.json');
const originalRows = new Map(baseline.results.map(row => [row.id + '/' + row.mode, row]));
const initialRows = new Map(initial.results.map(row => [row.id + '/' + row.mode, row]));
function table(rows) {
  return '| input | mode | baseline cold p50 / p95 | initial scanner cold p50 / p95 | secure scanner cold p50 / p95 | baseline warm p50 / p95 | initial scanner warm p50 / p95 | secure scanner warm p50 / p95 |\n|---|---|---:|---:|---:|---:|---:|---:|\n'
    + rows.map(row => {
      const old = originalRows.get(row.id + '/' + row.mode), first = initialRows.get(row.id + '/' + row.mode);
      const cells = [row.id, row.mode];
      for (const state of ['cold', 'warm']) for (const data of [old, first, row]) cells.push(data.summary[state].p50Ms.toFixed(3) + ' / ' + data.summary[state].p95Ms.toFixed(3));
      return '| ' + cells.join(' | ') + ' |';
    }).join('\n') + '\n';
}
const gateLogs = ['install-final-frozen.txt', 'characterization.txt', 'mocha-readme-security.txt', 'build.txt', 'lint.txt', 'benchmark-run.txt', 'raw-validation.txt'];
let doc = fs.readFileSync('docs/rewrite.md', 'utf8').split('\n## Secure scanner final measurements\n')[0];
doc = doc.replace('Pending final command outputs and full benchmark.', 'Final raw command/output/exit records are listed below. The execution network-constraint deviation remains explicit; functional checks passing does not erase that deviation.');
doc += `
## Secure scanner final measurements

Current raw: [rewrite-secure.json](../bench/results/rewrite-secure.json), [journal](../bench/results/rewrite-secure.json.journal.jsonl). Same corpus and sample settings: cold n=5, warm n=20 after 10 warmups, sequential child processes, construction included, nearest-rank percentile. There is no output-redirection preload in this run. The optional Parsimmon metadata is null after dependency removal; the remaining harness timing logic is unchanged. Every sample digest uses the current golden, whose only change is fence-html/html.value. Initial and baseline digests use the original golden preserved by Git and the initial evidence.

Current environment: ${current.runtime.node}, V8 ${current.runtime.v8}, ${current.runtime.cpu}, ${current.runtime.platform} ${current.runtime.release} ${current.runtime.arch}. Interval ${current.began} – ${current.ended}; shared-host load before ${current.environment.loadBefore.join(' / ')}, after ${current.environment.loadAfter.join(' / ')}. Lightweight artifact inspection, helper lint and the packaging dry-run also ran during this benchmark; no parser/source change occurred. Host load differs between all three measurements; these are observations, not an isolated causal speedup experiment. Cold p95 is the maximum of five observations. Full-precision samples and net-heap changes remain in raw; net heap is not allocation volume.

Source SHA-256 ${current.parserSha256}; compiled SHA-256 ${current.compiledParserSha256}; golden SHA-256 ${current.goldenSha256}; corpus SHA-256 ${current.corpusSha256}. measuredRevision=${current.measuredRevision} remains the accepted base because shared Git metadata is read-only; the delivery bundle carries the subsequent commits.

Long-document results, milliseconds (p50 / p95 pairs):

${table(current.results.filter(row => row.id.startsWith('long-')))}
<details>
<summary>All secure scanner comparisons (ms, p50 / p95)</summary>

${table(current.results)}
</details>

### Exact final gate evidence

`;
for (const file of gateLogs) {
  const text = fs.readFileSync('bench/followup/' + file, 'utf8');
  doc += '\n' + file + '\n\n```text\n';
  const lines = text.trimEnd().split('\n');
  doc += lines[0] + '\n';
  if (lines[1].startsWith('environment:')) doc += lines[1] + '\n';
  if (file === 'characterization.txt') doc += lines.filter(line => line.includes('exact comparisons')).join('\n') + '\n';
  if (file === 'mocha-readme-security.txt') doc += lines.filter(line => line.includes('178 passing')).join('\n') + '\n';
  doc += lines.slice(Math.max(2, lines.length - 11)).join('\n') + '\n```\n';
}
fs.writeFileSync('docs/rewrite.md', doc);
console.log(table(current.results.filter(row => row.id === 'long-ja-10000' && row.mode === 'ast')));
console.log('docs/rewrite.md includes the full current comparison and exact final command/exit excerpts.');
