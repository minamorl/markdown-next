/* global console */
// Render the checked raw numbers without modifying measurements or baselines.
const fs = require('node:fs');
const old = require('../../bench/results/baseline.json');
const current = require('./benchmark.json');
const oldRows = new Map(old.results.map(row => [row.id + '/' + row.mode, row]));
const header = '| input | mode | old cold p50 | new cold p50 | old cold p95 | new cold p95 | old warm p50 | new warm p50 | old warm p95 | new warm p95 |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
function table(rows) {
  return header + rows.map(row => {
    const before = oldRows.get(row.id + '/' + row.mode);
    const values = [];
    for (const state of ['cold', 'warm']) for (const percentile of ['p50Ms', 'p95Ms']) {
      values.push(before.summary[state][percentile].toFixed(3), row.summary[state][percentile].toFixed(3));
    }
    return '| ' + [row.id, row.mode, ...values].join(' | ') + ' |';
  }).join('\n') + '\n';
}
const file = 'docs/rewrite.md';
let doc = fs.readFileSync(file, 'utf8').split('\n## Measurement results\n')[0];
doc += `
## Measurement results

Old raw: [baseline.json](../bench/results/baseline.json). New raw: [benchmark.json](../src/rewrite-evidence/benchmark.json), [fsynced child journal](../src/rewrite-evidence/benchmark.json.journal.jsonl). Every sample outcome digest is checked against the frozen golden. [Independent validation](../src/rewrite-evidence/raw-validation.txt) recalculates every percentile from sorted samples and checks every journal child.

Unmodified harness: npm run bench -- --output=bench/results/rewrite.json. The preload src/rewrite-evidence/redirect-bench.cjs redirects only candidate output IO to src/rewrite-evidence/benchmark.json and its journal because bench/ is read-only for this assignment. The harness, worker, stats, checkpoint and golden hashes are unchanged. NODE_OPTIONS records this preload in the new raw. It is loaded before timed work and its file wrappers do not run inside the measured parser/plugin callbacks. No dependencies were installed or fetched.

Both runs: ${current.runtime.node}, V8 ${current.runtime.v8}, ${current.runtime.platform} ${current.runtime.release} ${current.runtime.arch}, ${current.runtime.cpu}. Sequential children, cold n=5, warm n=20 after 10 extra warmups, new Parser construction included, process/import/IO/GC outside timing, nearest-rank percentiles. Cold p95 with n=5 is the maximum, not a stable tail estimate. Signed net heap change is not allocation volume.

Old interval: ${old.began} – ${old.ended}; load before ${old.environment.loadBefore.join(' / ')}, after ${old.environment.loadAfter.join(' / ')}. New interval: ${current.began} – ${current.ended}; load before ${current.environment.loadBefore.join(' / ')}, after ${current.environment.loadAfter.join(' / ')}. This is the same shared host, not a controlled isolated comparison; scheduling, load and the preload differ. Tables show observed ms and do not establish a causal speedup factor. Full precision and per-call samples remain in raw.

The raw measuredRevision remains the base ${current.measuredRevision}: normal worktree Git metadata is read-only. Candidate parserSha256=${current.parserSha256}, compiledParserSha256=${current.compiledParserSha256} identify the measured code exactly. The separate delivery bundle contains phase commits. The harness's parsimmon metadata (${current.runtime.parsimmon}) describes the still-installed baseline dependency, not a runtime parser import; preflight rejects every Parsimmon module load and still parses successfully.

Long-document observations (ms, rounded to 3 decimals):

${table(current.results.filter(row => row.id.startsWith('long-')))}
<details>
<summary>All input/mode observations (ms)</summary>

${table(current.results)}
</details>

## Delivery and remaining integration work

- src/parser.ts implements the scanner; asHTML/asAST/escapeHtml/exported parse implementations remain byte-for-byte unchanged. src/rewrite-evidence/ contains commands, raw outputs, supplementary checks and delivery tooling, and is excluded by the existing package files whitelist (only compiled lib/src is shipped).
- package.json removes parsimmon and @types/parsimmon; name and version remain @minamorl/markdown-next 2.2.4. README changes only the Parsimmon sentence.
- Frozen corpus/golden, existing test/test-parser.ts, all bench files and pnpm-lock.yaml retain their pre-run hashes. The assignment forbids lockfile edits, so the lockfile still has the old dependency importer; the caller must reconcile it before a frozen-lockfile install or release. No install, network transmission or npm publish was performed.
- Normal git add failed with read-only Git metadata (raw: src/rewrite-evidence/git-checkpoint.txt). checkpoint.cjs uses a private Git directory under TMPDIR and exports src/rewrite-evidence/rewrite.bundle with phase commits based on 55c0a76. It does not change the current worktree's HEAD/index or write shared Git metadata. The bundle requires that base commit and can be fetched into an integration checkout by the caller.
- Initial compatibility mismatches and lint errors are retained in first-attempt logs; final gate logs supersede them. Existing lint warnings in test/test-parser.ts remain untouched.
- Checkpoint review requested of caller, before expensive execution: confirm unchanged benchmark/golden logic, preflight hashes and completed characterization gates. No review broker was invoked in this no-review run.
- Checkpoint review requested of caller, at lane end: independently inspect scanner compatibility, raw comparison/provenance, scope hashes, lockfile follow-up and bundle before integration/release. No child agent was started here.
`;
fs.writeFileSync(file, doc);
const row = current.results.find(row => row.id === 'long-ja-10000' && row.mode === 'ast');
console.log(table([row]));
console.log('Updated docs/rewrite.md from baseline and candidate raw.');
