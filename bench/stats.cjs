const assert = require('node:assert/strict');

// Nearest rank: p95 at n=5 is the maximum, not an interpolated tail estimate.
function percentile(values, p) {
  assert.ok(values.length > 0 && p > 0 && p <= 1);
  assert.ok(values.every(Number.isFinite));
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}
function summarize(samples) {
  assert.ok(samples.length >= 5, 'At least five measurements are required');
  return {
    n: samples.length,
    p50Ms: percentile(samples.map((s) => s.elapsedMs), 0.5),
    p95Ms: percentile(samples.map((s) => s.elapsedMs), 0.95),
    p50HeapDeltaBytes: percentile(samples.map((s) => s.heapDeltaBytes), 0.5),
  };
}
module.exports = { percentile, summarize };
