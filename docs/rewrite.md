# Scanner rewrite

## Initial rewrite (historical scope)

Code-first; no domain spec covers this rewrite. Work stays in this worktree. Runtime exports and mapper/join/postprocess behavior remain unchanged. The initial rewrite kept corpus, golden, legacy tests, bench harness and lockfile read-only. The follow-up below authorizes one security golden change and lockfile/test/harness maintenance. Version stays 2.2.4. No network, publish, child agents or review broker.

Phase 1: inventory and baseline. Phase 2: scanner and exact compatibility. Phase 3: dependency removal, build/lint, unchanged benchmark harness, raw comparison. Evidence and recoverable raw are in bench/results/rewrite-initial/. Git checkpoints are attempted per phase; restricted Git metadata writes fall back to a local bundle.

## Existing grammar (ordered alternatives)

- Document: trim whitespace except U+3000; repeat blocks; join; postprocess. Block separators also exclude U+3000.
- Block priority: whitespace, block plugin, setext h1/h2, ATX h6 down to h1, table, backtick fence, display math, footnote definition, list, quote, paragraph, linebreak.
- Setext: any non-linebreak title, LF, one or more equals/minus, then LF or EOF. ATX: exact number of hashes, greedy ECMAScript whitespace (legacy multiline regex can find a later line-boundary match but advances only by its length), nonempty text excluding backtick/underscore/asterisk/CR/LF; skip trailing whitespace except U+3000. Heading content is not inline parsed.
- Inline priority: plugin, ruby, footnote reference, link, image, emphasis, strong, code span, inline math, br/hr, HTML element, greedy text, single character fallback. Greedy text excludes CR/LF/less-than, the ASCII range equals through left bracket (including uppercase A-Z, greater-than, question mark and at), right bracket/asterisk/backtick/U+FF5C/dollar. The dash is a range operator, so a literal dash is text; underscore and exclamation are text. Emphasis/strong accept mixed marker families; their bodies exclude backtick/underscore/asterisk/CR/LF and do not nest.
- Link/image: nonempty label and target without linebreaks; no recursive label parsing. Code span: maximal opener run, nearest equal maximal closer run, no CR/LF; strip one padding space on both ends unless all whitespace.
- Inline plugin: ASCII alphabetic name, optional colon, everything through next closing bracket (including newlines). Unknown plugin drops the first colon. Ruby can span newlines. Footnote reference: digits, closing bracket, no following colon. Inline math: single dollar and nonempty content without dollar/CR/LF.
- HTML: lowercase br/hr self-closing forms first; other opening tags use ASCII alphanumerics and optional whitespace/attributes. Attributes are discarded; recursive content allows raw newlines. Mismatched tags are reconstructed without attributes. Unclosed elements fall back to text.
- Paragraph: one or more inline tokens per line, recursively joined with br. Stops at empty line or before the legacy LF-only fenced-block lookahead. Final line is attempted twice in the legacy grammar; observable plugin callbacks are replayed on saved token values without rescanning the line. Nested join shape must remain intact for AST.
- List: pairs of spaces, unordered dash/asterisk plus space or digits-dot-space; zero or more inline tokens; optional CR/LF/CRLF. Nesting uses actual one-based column, steps down by two, and preserves the first child type for mixed lists. List inline has math/link/image/emphasis/strong/code, text excluding CR/LF/brackets/asterisk/backtick/dollar, then character fallback. Plugin/ruby/HTML/footnote are not special here.
- Quote: repeated greater-than-space prefixes, nonempty inline content, optional linebreak. Depth jumps create one shadow level. Consecutive text siblings are joined with br; quote inline omits footnote refs and permits equals/minus in text.
- Table: two pipe-ended rows each requiring linebreak; zero or more following rows with optional linebreak. Greedy row takes through last pipe before CR/LF. Separator accepts optional colons and whitespace around one or more dashes in each cell. Invalid separator returns a legacy failure object as a VALUE. Split unescaped pipes, trim cells; backslash-pipe becomes pipe even in code. Cell inline only link/image/emphasis/strong/code and text; any unconsumed character returns the original cell string.
- Fence: at least three backticks, definition without backtick/CR/LF, mandatory linebreak. Closing fence has at least opener length and optional spaces/tabs; content line exclusion requires a whole closing line. Trim trailing linebreak tokens; retain definition verbatim.
- Block plugin: alphabetic name, empty or colon-prefixed args, literal closing bracket + LF, one or more lines with two spaces and nonempty content. Each line becomes join([empty string, text, LF]); outer join preserves AST nesting. Unknown plugin retains colon and opening/closing syntax.
- Display math: two dollars, arbitrary content through first two dollars, linebreak or EOF; trim content and return raw delimiters. Footnote definition: digits and colon, greedy whitespace, first line plus four-space/tab continuations; trim, collect and numeric-sort via unchanged export postprocessing.
- Diagnostics/exceptions, invalid-table object, plugin callback order, list reuse reset, attribute order, raw unescaped HTML, duplicate footnotes and context differences are compatibility behavior, including questionable legacy output.

## Decisions

Use one scanner state per parse, integer offsets and charCodeAt dispatch. Preserve exporter implementations verbatim. No combinator graph, per-token result object, or per-token closure. Slice only materialized text; regex is reserved for export postprocessing and compatibility diagnostics where needed. Retain create() and acceptables.parse() entrypoints without a Parsimmon dependency; combinator implementation internals are not part of the characterized consumer API.

## Evidence

Phase 2: exact 1,722 comparisons and 178 legacy tests matched. Supplementary seeded differential checks compare the old source loaded from Git with the scanner, including stateful plugin return values and unusual line terminators. See raw command logs under bench/results/rewrite-initial/. No frozen test input or expected output changed. Review checkpoints are handled by the caller after this no-review run; no broker is invoked.

## Measurement results

Old raw: [baseline.json](../bench/results/baseline.json). New raw: [benchmark.json](../bench/results/rewrite-initial/benchmark.json), [fsynced child journal](../bench/results/rewrite-initial/benchmark.json.journal.jsonl). Every sample outcome digest is checked against the frozen golden. [Independent validation](../bench/results/rewrite-initial/raw-validation.txt) recalculates every percentile from sorted samples and checks every journal child.

Unmodified harness: npm run bench -- --output=bench/results/rewrite.json. The preload bench/results/rewrite-initial/redirect-bench.cjs redirects only candidate output IO to bench/results/rewrite-initial/benchmark.json and its journal because bench/ is read-only for this assignment. The harness, worker, stats, checkpoint and golden hashes are unchanged. NODE_OPTIONS records this preload in the new raw. It is loaded before timed work and its file wrappers do not run inside the measured parser/plugin callbacks. No dependencies were installed or fetched.

Both runs: v26.12.1, V8 14.6.202.34-node.40, linux 7.0.0-38-generic x64, AMD Ryzen 5 3600 6-Core Processor. Sequential children, cold n=5, warm n=20 after 10 extra warmups, new Parser construction included, process/import/IO/GC outside timing, nearest-rank percentiles. Cold p95 with n=5 is the maximum, not a stable tail estimate. Signed net heap change is not allocation volume.

Old interval: 2026-11-06T17:30:56.825Z – 2026-11-06T17:39:55.821Z; load before 13.44 / 13.36 / 14.94, after 30.52 / 30.78 / 23.71. New interval: 2026-11-06T17:55:37.967Z – 2026-11-06T18:00:05.354Z; load before 20.73 / 19.85 / 21.93, after 16.63 / 18.53 / 20.92. This is the same shared host, not a controlled isolated comparison; scheduling, load and the preload differ. Tables show observed ms and do not establish a causal speedup factor. Full precision and per-call samples remain in raw.

The raw measuredRevision remains the base 55c0a76db2299f04330f81c1efbb2e4b3512e54b: normal worktree Git metadata is read-only. Candidate parserSha256=c093cea0e313062ac3b9b1896a695467dbad5bc3d32617fbe5d2da05a8b46809, compiledParserSha256=42d853042d6019828c6e4ad25e57ad650dcecd4ad96718a67d65a1611848eab9 identify the measured code exactly. The separate delivery bundle contains phase commits. The harness's parsimmon metadata (1.18.1) describes the still-installed baseline dependency, not a runtime parser import; preflight rejects every Parsimmon module load and still parses successfully.

Long-document observations (ms, rounded to 3 decimals):

| input | mode | old cold p50 | new cold p50 | old cold p95 | new cold p95 | old warm p50 | new warm p50 | old warm p95 | new warm p95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| long-ja-1000 | html | 21.181 | 3.211 | 27.489 | 3.858 | 7.418 | 0.258 | 13.018 | 0.360 |
| long-ja-1000 | ast | 21.413 | 3.319 | 33.187 | 3.428 | 6.332 | 0.195 | 7.220 | 0.521 |
| long-en-1000 | html | 19.552 | 3.407 | 22.860 | 4.967 | 4.669 | 0.160 | 7.165 | 0.373 |
| long-en-1000 | ast | 28.554 | 2.852 | 64.197 | 5.211 | 4.028 | 0.108 | 6.298 | 0.193 |
| long-mixed-1000 | html | 38.233 | 4.457 | 52.716 | 7.772 | 3.869 | 0.334 | 15.424 | 0.438 |
| long-mixed-1000 | ast | 24.253 | 4.008 | 46.483 | 4.458 | 3.951 | 0.253 | 6.158 | 0.311 |
| long-ja-10000 | html | 104.741 | 6.541 | 137.003 | 7.381 | 80.715 | 1.603 | 135.862 | 1.962 |
| long-ja-10000 | ast | 124.802 | 6.190 | 234.196 | 6.748 | 55.934 | 1.103 | 97.067 | 1.489 |
| long-en-10000 | html | 78.477 | 6.717 | 103.532 | 7.377 | 52.672 | 1.121 | 79.176 | 1.354 |
| long-en-10000 | ast | 76.458 | 6.848 | 85.345 | 8.091 | 43.129 | 0.802 | 65.202 | 1.131 |
| long-mixed-10000 | html | 97.566 | 10.792 | 170.439 | 12.453 | 42.754 | 1.520 | 85.487 | 3.940 |
| long-mixed-10000 | ast | 83.129 | 9.356 | 91.674 | 11.146 | 42.038 | 0.835 | 114.694 | 1.849 |
| long-ja-60000 | html | 488.318 | 19.632 | 934.287 | 33.702 | 469.183 | 6.780 | 601.758 | 10.236 |
| long-ja-60000 | ast | 269.650 | 23.976 | 344.972 | 38.803 | 218.914 | 5.765 | 302.603 | 8.956 |
| long-en-60000 | html | 180.843 | 23.989 | 188.431 | 27.356 | 155.087 | 8.293 | 197.885 | 14.174 |
| long-en-60000 | ast | 169.116 | 21.758 | 183.552 | 39.258 | 161.741 | 7.915 | 201.550 | 10.228 |
| long-mixed-60000 | html | 174.147 | 51.596 | 281.151 | 178.076 | 131.181 | 13.705 | 178.204 | 28.340 |
| long-mixed-60000 | ast | 242.136 | 38.554 | 281.298 | 59.086 | 140.737 | 4.832 | 157.306 | 11.357 |

<details>
<summary>All input/mode observations (ms)</summary>

| input | mode | old cold p50 | new cold p50 | old cold p95 | new cold p95 | old warm p50 | new warm p50 | old warm p95 | new warm p95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| legacy-001 | html | 4.731 | 0.941 | 5.956 | 1.741 | 0.224 | 0.011 | 0.330 | 0.019 |
| legacy-001 | ast | 3.610 | 0.779 | 4.649 | 0.826 | 0.371 | 0.015 | 0.883 | 0.041 |
| legacy-002 | html | 4.912 | 1.117 | 5.304 | 1.201 | 0.386 | 0.012 | 0.799 | 0.018 |
| legacy-002 | ast | 3.885 | 0.797 | 4.729 | 0.889 | 0.354 | 0.017 | 0.984 | 0.019 |
| legacy-003 | html | 5.000 | 0.971 | 8.021 | 1.020 | 0.428 | 0.017 | 0.852 | 0.025 |
| legacy-003 | ast | 4.829 | 0.856 | 26.919 | 1.215 | 0.295 | 0.008 | 0.502 | 0.021 |
| legacy-004 | html | 7.892 | 0.967 | 15.639 | 1.005 | 0.415 | 0.013 | 0.887 | 0.023 |
| legacy-004 | ast | 5.499 | 0.788 | 15.718 | 1.030 | 0.388 | 0.011 | 1.108 | 0.016 |
| legacy-005 | html | 5.295 | 1.069 | 6.708 | 1.405 | 0.368 | 0.016 | 1.890 | 0.020 |
| legacy-005 | ast | 4.026 | 0.773 | 4.728 | 0.821 | 0.298 | 0.013 | 0.448 | 0.028 |
| legacy-006 | html | 8.914 | 0.991 | 12.535 | 1.101 | 0.374 | 0.014 | 1.155 | 0.020 |
| legacy-006 | ast | 6.741 | 0.772 | 39.146 | 0.796 | 0.374 | 0.014 | 3.626 | 0.029 |
| legacy-007 | html | 13.880 | 1.777 | 27.766 | 4.900 | 0.454 | 0.018 | 4.087 | 0.042 |
| legacy-007 | ast | 5.474 | 1.691 | 10.083 | 2.535 | 0.496 | 0.017 | 1.026 | 0.050 |
| legacy-008 | html | 5.354 | 1.912 | 6.153 | 3.005 | 0.578 | 0.027 | 0.757 | 0.041 |
| legacy-008 | ast | 5.079 | 1.607 | 13.638 | 2.567 | 0.673 | 0.025 | 1.051 | 0.160 |
| legacy-009 | html | 6.318 | 1.917 | 8.241 | 2.785 | 0.627 | 0.029 | 1.412 | 0.156 |
| legacy-009 | ast | 5.348 | 1.737 | 7.809 | 3.379 | 0.804 | 0.033 | 1.255 | 0.048 |
| legacy-010 | html | 5.427 | 1.817 | 6.574 | 4.249 | 0.356 | 0.023 | 0.866 | 0.295 |
| legacy-010 | ast | 5.234 | 1.593 | 5.786 | 4.920 | 0.357 | 0.023 | 1.266 | 0.039 |
| legacy-011 | html | 4.983 | 2.073 | 8.105 | 2.799 | 0.456 | 0.018 | 1.151 | 0.034 |
| legacy-011 | ast | 3.988 | 2.021 | 8.078 | 2.394 | 0.219 | 0.015 | 0.487 | 0.138 |
| legacy-012 | html | 4.729 | 1.763 | 7.758 | 2.003 | 0.314 | 0.015 | 0.895 | 0.059 |
| legacy-012 | ast | 3.903 | 1.675 | 4.572 | 2.087 | 0.388 | 0.019 | 0.778 | 0.044 |
| legacy-013 | html | 6.548 | 1.845 | 12.267 | 1.990 | 0.284 | 0.018 | 0.633 | 0.048 |
| legacy-013 | ast | 4.652 | 1.690 | 10.656 | 2.054 | 0.391 | 0.014 | 0.920 | 0.144 |
| legacy-014 | html | 4.456 | 2.035 | 7.129 | 2.328 | 0.303 | 0.015 | 0.458 | 0.049 |
| legacy-014 | ast | 5.256 | 1.540 | 9.897 | 2.516 | 0.424 | 0.011 | 0.811 | 0.440 |
| legacy-015 | html | 5.883 | 2.165 | 7.188 | 3.924 | 0.396 | 0.021 | 0.919 | 0.041 |
| legacy-015 | ast | 10.287 | 1.689 | 13.261 | 2.071 | 0.359 | 0.013 | 1.225 | 0.032 |
| legacy-016 | html | 22.015 | 3.893 | 47.873 | 10.440 | 5.796 | 0.128 | 11.400 | 0.504 |
| legacy-016 | ast | 43.434 | 3.495 | 85.361 | 4.619 | 9.875 | 0.122 | 20.050 | 0.142 |
| legacy-017 | html | 22.083 | 1.910 | 57.661 | 2.681 | 0.406 | 0.022 | 0.915 | 0.038 |
| legacy-017 | ast | 28.294 | 1.839 | 37.793 | 2.906 | 0.641 | 0.022 | 7.897 | 0.032 |
| legacy-018 | html | 25.810 | 1.859 | 73.074 | 9.218 | 0.739 | 0.032 | 12.346 | 0.041 |
| legacy-018 | ast | 21.360 | 1.295 | 39.818 | 1.650 | 0.861 | 0.021 | 3.616 | 0.040 |
| legacy-019 | html | 12.970 | 1.975 | 18.156 | 3.384 | 0.655 | 0.029 | 13.178 | 0.036 |
| legacy-019 | ast | 17.705 | 1.606 | 64.938 | 3.677 | 0.525 | 0.019 | 1.070 | 0.037 |
| legacy-020 | html | 14.765 | 1.241 | 19.547 | 1.383 | 0.539 | 0.020 | 10.444 | 0.022 |
| legacy-020 | ast | 21.993 | 0.968 | 30.935 | 1.277 | 0.574 | 0.010 | 2.737 | 0.019 |
| legacy-021 | html | 26.944 | 1.311 | 45.587 | 3.465 | 0.506 | 0.019 | 9.851 | 0.064 |
| legacy-021 | ast | 19.826 | 1.095 | 36.297 | 4.230 | 0.671 | 0.017 | 11.914 | 0.059 |
| legacy-022 | html | 6.857 | 3.982 | 30.661 | 6.572 | 0.543 | 0.033 | 1.513 | 0.056 |
| legacy-022 | ast | 14.353 | 1.797 | 24.781 | 3.642 | 0.484 | 0.019 | 1.443 | 0.046 |
| legacy-023 | html | 9.340 | 1.914 | 57.750 | 5.772 | 0.554 | 0.024 | 1.190 | 0.033 |
| legacy-023 | ast | 12.590 | 1.686 | 30.434 | 6.640 | 0.484 | 0.037 | 1.393 | 0.065 |
| legacy-024 | html | 27.594 | 1.642 | 33.077 | 1.785 | 0.735 | 0.030 | 5.170 | 0.033 |
| legacy-024 | ast | 14.777 | 1.787 | 42.762 | 2.955 | 0.589 | 0.036 | 15.288 | 0.041 |
| legacy-025 | html | 14.136 | 2.326 | 26.785 | 4.936 | 0.804 | 0.047 | 2.264 | 0.298 |
| legacy-025 | ast | 29.433 | 1.711 | 36.168 | 2.371 | 1.131 | 0.043 | 14.408 | 0.060 |
| legacy-026 | html | 20.943 | 2.166 | 41.041 | 4.767 | 0.885 | 0.024 | 8.524 | 0.216 |
| legacy-026 | ast | 28.012 | 1.761 | 56.050 | 2.595 | 0.728 | 0.035 | 2.699 | 0.056 |
| legacy-027 | html | 10.477 | 1.850 | 91.960 | 2.207 | 2.404 | 0.056 | 8.106 | 0.094 |
| legacy-027 | ast | 26.464 | 3.606 | 39.351 | 4.650 | 1.331 | 0.064 | 18.562 | 0.210 |
| legacy-028 | html | 30.010 | 1.750 | 32.329 | 2.579 | 0.374 | 0.025 | 9.404 | 0.039 |
| legacy-028 | ast | 17.842 | 1.434 | 40.916 | 1.591 | 0.485 | 0.023 | 6.052 | 0.199 |
| legacy-029 | html | 15.809 | 1.753 | 26.392 | 2.152 | 0.662 | 0.027 | 1.660 | 0.043 |
| legacy-029 | ast | 13.901 | 1.472 | 33.523 | 1.480 | 0.450 | 0.028 | 9.181 | 0.042 |
| legacy-030 | html | 13.003 | 1.800 | 37.973 | 1.852 | 0.659 | 0.036 | 4.766 | 0.047 |
| legacy-030 | ast | 21.949 | 1.590 | 23.560 | 1.753 | 0.849 | 0.044 | 9.355 | 0.108 |
| legacy-031 | html | 17.512 | 1.647 | 62.961 | 2.187 | 0.425 | 0.031 | 3.864 | 0.047 |
| legacy-031 | ast | 28.937 | 1.449 | 31.549 | 1.481 | 0.559 | 0.027 | 12.624 | 0.042 |
| legacy-032 | html | 17.948 | 1.902 | 36.236 | 2.416 | 0.709 | 0.047 | 1.645 | 0.233 |
| legacy-032 | ast | 10.454 | 1.644 | 23.363 | 1.948 | 0.667 | 0.049 | 1.109 | 0.150 |
| legacy-033 | html | 12.276 | 1.843 | 13.457 | 1.895 | 0.601 | 0.034 | 1.342 | 0.220 |
| legacy-033 | ast | 12.448 | 1.761 | 41.613 | 1.994 | 0.558 | 0.031 | 5.726 | 0.147 |
| legacy-034 | html | 25.140 | 2.147 | 31.422 | 5.152 | 1.734 | 0.044 | 3.529 | 0.153 |
| legacy-034 | ast | 32.017 | 1.839 | 40.217 | 3.122 | 1.257 | 0.048 | 6.928 | 0.431 |
| legacy-035 | html | 13.481 | 1.856 | 35.875 | 2.028 | 0.453 | 0.027 | 1.329 | 0.049 |
| legacy-035 | ast | 11.647 | 1.569 | 13.515 | 1.607 | 0.384 | 0.019 | 1.376 | 0.033 |
| legacy-036 | html | 23.420 | 1.902 | 29.839 | 2.671 | 0.390 | 0.022 | 2.815 | 0.034 |
| legacy-036 | ast | 11.817 | 1.609 | 18.096 | 1.641 | 0.567 | 0.018 | 2.450 | 0.035 |
| legacy-037 | html | 13.572 | 1.511 | 31.183 | 1.604 | 0.491 | 0.041 | 2.003 | 0.330 |
| legacy-037 | ast | 19.417 | 1.403 | 39.779 | 3.660 | 0.505 | 0.034 | 2.572 | 0.050 |
| legacy-038 | html | 9.474 | 0.841 | 15.315 | 0.858 | 0.450 | 0.011 | 1.039 | 0.031 |
| legacy-038 | ast | 6.442 | 0.710 | 22.856 | 0.748 | 0.396 | 0.011 | 5.544 | 0.034 |
| legacy-039 | html | 10.203 | 1.851 | 12.898 | 2.466 | 0.373 | 0.023 | 3.397 | 0.035 |
| legacy-039 | ast | 6.128 | 1.639 | 19.560 | 2.151 | 0.364 | 0.026 | 1.219 | 0.040 |
| legacy-040 | html | 9.096 | 2.040 | 16.126 | 2.076 | 0.475 | 0.041 | 0.886 | 0.069 |
| legacy-040 | ast | 10.834 | 1.808 | 20.097 | 2.380 | 0.574 | 0.042 | 3.239 | 0.068 |
| legacy-041 | html | 5.976 | 1.872 | 16.935 | 2.183 | 0.519 | 0.033 | 0.766 | 0.048 |
| legacy-041 | ast | 13.329 | 1.644 | 14.562 | 1.662 | 0.579 | 0.033 | 1.190 | 0.043 |
| legacy-042 | html | 6.960 | 1.742 | 12.448 | 2.081 | 0.374 | 0.010 | 1.543 | 0.022 |
| legacy-042 | ast | 4.831 | 1.470 | 8.423 | 1.646 | 0.294 | 0.017 | 4.381 | 0.022 |
| legacy-043 | html | 9.329 | 1.530 | 30.978 | 1.825 | 0.869 | 0.034 | 2.271 | 0.054 |
| legacy-043 | ast | 16.604 | 1.529 | 19.632 | 1.737 | 1.127 | 0.043 | 10.201 | 0.067 |
| legacy-044 | html | 8.372 | 1.945 | 17.745 | 2.172 | 0.365 | 0.016 | 0.834 | 0.029 |
| legacy-044 | ast | 12.173 | 1.625 | 18.662 | 1.642 | 0.394 | 0.022 | 0.941 | 0.039 |
| legacy-045 | html | 12.960 | 1.910 | 17.654 | 2.076 | 0.600 | 0.023 | 4.808 | 0.027 |
| legacy-045 | ast | 6.004 | 1.650 | 6.960 | 1.946 | 0.465 | 0.023 | 4.027 | 0.063 |
| legacy-046 | html | 6.163 | 1.779 | 8.556 | 1.838 | 0.358 | 0.020 | 1.357 | 0.052 |
| legacy-046 | ast | 6.120 | 1.220 | 17.251 | 1.629 | 0.438 | 0.018 | 1.539 | 0.038 |
| legacy-047 | html | 7.565 | 1.919 | 11.955 | 2.422 | 0.449 | 0.029 | 1.125 | 0.036 |
| legacy-047 | ast | 6.874 | 1.726 | 16.627 | 1.813 | 0.350 | 0.028 | 0.844 | 0.053 |
| legacy-048 | html | 13.544 | 1.923 | 16.875 | 1.946 | 0.412 | 0.024 | 8.721 | 0.066 |
| legacy-048 | ast | 7.953 | 1.624 | 13.307 | 1.773 | 0.341 | 0.022 | 0.766 | 0.027 |
| legacy-049 | html | 8.436 | 1.737 | 10.939 | 1.969 | 0.379 | 0.023 | 1.020 | 0.050 |
| legacy-049 | ast | 8.399 | 1.559 | 11.816 | 1.641 | 0.410 | 0.020 | 1.154 | 0.049 |
| legacy-050 | html | 5.999 | 1.763 | 6.551 | 1.948 | 0.353 | 0.020 | 1.049 | 0.035 |
| legacy-050 | ast | 6.613 | 1.570 | 9.134 | 4.503 | 0.342 | 0.019 | 3.271 | 0.079 |
| legacy-051 | html | 8.703 | 1.784 | 17.574 | 2.358 | 0.394 | 0.022 | 1.318 | 0.049 |
| legacy-051 | ast | 5.172 | 1.556 | 9.084 | 1.585 | 0.594 | 0.020 | 1.299 | 0.099 |
| legacy-052 | html | 14.429 | 1.899 | 21.600 | 2.023 | 0.428 | 0.028 | 1.000 | 0.045 |
| legacy-052 | ast | 9.920 | 1.673 | 23.239 | 1.870 | 0.399 | 0.026 | 2.723 | 0.036 |
| legacy-053 | html | 18.329 | 1.866 | 28.416 | 2.577 | 0.390 | 0.034 | 3.781 | 0.057 |
| legacy-053 | ast | 9.857 | 1.684 | 16.136 | 1.901 | 0.371 | 0.024 | 5.787 | 0.038 |
| legacy-054 | html | 6.692 | 2.037 | 22.245 | 2.188 | 0.574 | 0.027 | 1.475 | 0.050 |
| legacy-054 | ast | 10.378 | 1.718 | 11.926 | 1.755 | 0.482 | 0.026 | 0.982 | 0.042 |
| legacy-055 | html | 12.209 | 1.749 | 15.924 | 1.898 | 0.370 | 0.014 | 1.255 | 0.044 |
| legacy-055 | ast | 7.902 | 1.561 | 12.839 | 1.570 | 0.607 | 0.013 | 3.478 | 0.056 |
| legacy-056 | html | 8.810 | 2.099 | 24.479 | 2.210 | 0.516 | 0.018 | 1.369 | 0.034 |
| legacy-056 | ast | 15.339 | 1.599 | 17.011 | 1.813 | 0.334 | 0.016 | 1.185 | 0.032 |
| legacy-057 | html | 15.167 | 1.784 | 19.189 | 1.880 | 0.375 | 0.017 | 0.869 | 0.062 |
| legacy-057 | ast | 6.147 | 1.569 | 19.093 | 1.613 | 0.344 | 0.016 | 1.046 | 0.034 |
| legacy-058 | html | 6.754 | 1.766 | 18.626 | 1.813 | 0.339 | 0.018 | 3.934 | 0.032 |
| legacy-058 | ast | 10.520 | 1.560 | 14.379 | 2.932 | 0.424 | 0.017 | 12.117 | 0.045 |
| legacy-059 | html | 6.200 | 1.782 | 11.806 | 1.831 | 0.338 | 0.015 | 0.779 | 0.054 |
| legacy-059 | ast | 8.168 | 1.616 | 20.621 | 1.639 | 0.291 | 0.015 | 0.772 | 0.039 |
| legacy-060 | html | 5.972 | 1.343 | 17.151 | 1.833 | 0.451 | 0.021 | 0.928 | 0.069 |
| legacy-060 | ast | 7.298 | 1.601 | 9.968 | 2.024 | 0.395 | 0.018 | 1.253 | 0.029 |
| legacy-061 | html | 6.454 | 1.182 | 27.273 | 1.220 | 0.416 | 0.013 | 0.821 | 0.035 |
| legacy-061 | ast | 5.379 | 1.042 | 36.265 | 1.103 | 0.456 | 0.019 | 0.788 | 0.026 |
| legacy-062 | html | 8.638 | 1.251 | 22.032 | 2.468 | 0.455 | 0.018 | 0.872 | 0.036 |
| legacy-062 | ast | 8.227 | 0.987 | 10.442 | 1.027 | 0.383 | 0.012 | 0.801 | 0.040 |
| legacy-063 | html | 7.299 | 1.862 | 15.196 | 1.936 | 0.560 | 0.025 | 0.962 | 0.040 |
| legacy-063 | ast | 7.392 | 1.737 | 8.664 | 1.893 | 0.639 | 0.027 | 1.700 | 0.244 |
| legacy-064 | html | 4.801 | 1.585 | 5.900 | 2.529 | 0.309 | 0.031 | 1.595 | 0.056 |
| legacy-064 | ast | 4.274 | 1.359 | 5.540 | 1.541 | 0.311 | 0.018 | 1.258 | 0.038 |
| legacy-065 | html | 4.158 | 1.595 | 5.239 | 1.808 | 0.224 | 0.022 | 0.517 | 0.024 |
| legacy-065 | ast | 4.156 | 1.495 | 5.218 | 2.244 | 0.354 | 0.017 | 0.715 | 0.035 |
| legacy-066 | html | 3.784 | 1.693 | 5.985 | 1.778 | 0.212 | 0.025 | 0.487 | 0.056 |
| legacy-066 | ast | 4.245 | 1.484 | 4.800 | 1.518 | 0.271 | 0.023 | 0.559 | 0.039 |
| legacy-067 | html | 3.636 | 1.823 | 4.292 | 3.374 | 0.330 | 0.028 | 0.639 | 0.047 |
| legacy-067 | ast | 3.541 | 1.626 | 5.262 | 1.797 | 0.403 | 0.036 | 0.690 | 0.057 |
| legacy-068 | html | 3.697 | 1.826 | 7.119 | 1.987 | 0.270 | 0.022 | 0.580 | 0.050 |
| legacy-068 | ast | 4.364 | 1.781 | 4.928 | 1.818 | 0.292 | 0.018 | 0.443 | 0.025 |
| legacy-069 | html | 4.955 | 1.561 | 5.602 | 1.804 | 0.275 | 0.033 | 0.560 | 0.740 |
| legacy-069 | ast | 3.627 | 1.335 | 5.914 | 1.448 | 0.316 | 0.033 | 0.695 | 0.058 |
| legacy-070 | html | 4.354 | 0.963 | 4.546 | 1.024 | 0.325 | 0.020 | 0.401 | 0.029 |
| legacy-070 | ast | 2.778 | 0.751 | 3.299 | 0.873 | 0.188 | 0.040 | 0.338 | 0.216 |
| legacy-071 | html | 4.949 | 1.787 | 7.688 | 1.882 | 0.371 | 0.018 | 0.684 | 0.208 |
| legacy-071 | ast | 4.980 | 1.607 | 5.671 | 2.816 | 0.357 | 0.018 | 1.141 | 0.031 |
| legacy-072 | html | 4.064 | 1.132 | 4.258 | 1.147 | 0.297 | 0.010 | 0.503 | 0.019 |
| legacy-072 | ast | 4.164 | 0.902 | 4.748 | 0.949 | 0.404 | 0.010 | 1.191 | 0.019 |
| legacy-073 | html | 4.664 | 1.700 | 5.736 | 2.048 | 0.416 | 0.025 | 1.161 | 0.074 |
| legacy-073 | ast | 4.249 | 1.616 | 8.505 | 1.650 | 0.457 | 0.023 | 0.998 | 0.046 |
| legacy-074 | html | 4.758 | 1.083 | 5.408 | 1.542 | 0.298 | 0.016 | 0.544 | 0.028 |
| legacy-074 | ast | 4.372 | 0.935 | 4.675 | 0.977 | 0.315 | 0.010 | 0.426 | 0.020 |
| legacy-075 | html | 4.085 | 2.208 | 5.970 | 2.492 | 0.686 | 0.043 | 1.333 | 0.069 |
| legacy-075 | ast | 4.084 | 1.900 | 4.653 | 3.371 | 0.540 | 0.053 | 0.700 | 0.076 |
| legacy-076 | html | 3.722 | 1.808 | 4.315 | 1.914 | 0.309 | 0.027 | 0.597 | 0.031 |
| legacy-076 | ast | 4.193 | 1.580 | 8.024 | 1.609 | 0.381 | 0.016 | 0.684 | 0.023 |
| legacy-077 | html | 4.252 | 1.427 | 5.416 | 1.669 | 0.259 | 0.034 | 0.524 | 0.050 |
| legacy-077 | ast | 4.423 | 1.317 | 6.790 | 1.326 | 0.338 | 0.059 | 0.739 | 0.114 |
| legacy-078 | html | 4.156 | 1.755 | 4.337 | 1.781 | 0.349 | 0.022 | 1.862 | 0.063 |
| legacy-078 | ast | 4.366 | 1.573 | 5.136 | 2.768 | 0.330 | 0.020 | 0.647 | 0.026 |
| legacy-079 | html | 4.078 | 0.538 | 4.456 | 0.594 | 0.270 | 0.004 | 0.607 | 0.008 |
| legacy-079 | ast | 4.212 | 0.376 | 5.217 | 0.382 | 0.275 | 0.003 | 0.576 | 0.005 |
| legacy-080 | html | 3.270 | 0.579 | 4.044 | 1.149 | 0.257 | 0.004 | 0.568 | 0.006 |
| legacy-080 | ast | 3.575 | 0.414 | 4.015 | 0.429 | 0.333 | 0.004 | 0.637 | 0.005 |
| legacy-081 | html | 4.149 | 0.586 | 4.720 | 0.646 | 0.353 | 0.005 | 0.832 | 0.008 |
| legacy-081 | ast | 3.268 | 0.422 | 3.828 | 1.611 | 0.312 | 0.005 | 0.538 | 0.007 |
| legacy-082 | html | 3.668 | 0.568 | 4.732 | 0.610 | 0.342 | 0.006 | 0.764 | 0.008 |
| legacy-082 | ast | 3.913 | 0.443 | 8.359 | 0.460 | 0.305 | 0.004 | 0.651 | 0.006 |
| legacy-083 | html | 4.898 | 1.958 | 8.045 | 1.991 | 0.369 | 0.042 | 1.082 | 0.060 |
| legacy-083 | ast | 4.063 | 1.706 | 4.628 | 1.964 | 0.230 | 0.024 | 0.639 | 0.030 |
| legacy-084 | html | 4.733 | 2.056 | 6.596 | 2.217 | 0.278 | 0.029 | 0.524 | 0.039 |
| legacy-084 | ast | 3.898 | 1.649 | 4.748 | 1.683 | 0.231 | 0.022 | 0.482 | 0.033 |
| legacy-085 | html | 4.353 | 1.959 | 4.659 | 2.357 | 0.426 | 0.027 | 0.760 | 0.037 |
| legacy-085 | ast | 3.517 | 1.818 | 6.084 | 3.065 | 0.256 | 0.024 | 0.525 | 0.044 |
| legacy-086 | html | 5.025 | 1.533 | 5.683 | 1.760 | 0.444 | 0.019 | 0.743 | 0.032 |
| legacy-086 | ast | 4.949 | 1.327 | 5.955 | 1.524 | 0.372 | 0.020 | 0.603 | 0.031 |
| legacy-087 | html | 4.306 | 1.728 | 4.472 | 1.761 | 0.222 | 0.015 | 0.466 | 0.021 |
| legacy-087 | ast | 4.604 | 1.522 | 4.973 | 1.591 | 0.351 | 0.014 | 0.701 | 0.031 |
| legacy-088 | html | 4.860 | 1.713 | 5.074 | 2.411 | 0.288 | 0.019 | 0.658 | 0.030 |
| legacy-088 | ast | 3.951 | 1.446 | 5.601 | 1.529 | 0.208 | 0.018 | 0.487 | 0.025 |
| legacy-089 | html | 3.814 | 1.683 | 4.390 | 1.799 | 0.214 | 0.024 | 0.508 | 0.037 |
| legacy-089 | ast | 3.654 | 1.500 | 4.893 | 1.511 | 0.335 | 0.019 | 0.638 | 0.026 |
| legacy-090 | html | 3.667 | 1.683 | 5.378 | 1.684 | 0.326 | 0.019 | 0.755 | 0.031 |
| legacy-090 | ast | 3.747 | 1.511 | 4.766 | 1.717 | 0.224 | 0.018 | 0.497 | 0.038 |
| legacy-091 | html | 4.541 | 1.862 | 4.786 | 1.991 | 0.212 | 0.023 | 0.505 | 0.035 |
| legacy-091 | ast | 4.232 | 1.560 | 4.801 | 1.594 | 0.240 | 0.019 | 0.613 | 0.027 |
| legacy-092 | html | 5.363 | 1.719 | 5.579 | 1.836 | 0.321 | 0.027 | 0.649 | 0.141 |
| legacy-092 | ast | 5.754 | 1.222 | 7.287 | 1.579 | 0.314 | 0.020 | 0.566 | 0.036 |
| legacy-093 | html | 3.838 | 1.673 | 4.834 | 1.766 | 0.287 | 0.012 | 0.469 | 0.029 |
| legacy-093 | ast | 5.324 | 1.157 | 5.640 | 1.568 | 0.451 | 0.019 | 0.733 | 0.028 |
| legacy-094 | html | 4.699 | 1.193 | 5.031 | 1.727 | 0.272 | 0.011 | 0.631 | 0.025 |
| legacy-094 | ast | 4.369 | 1.486 | 5.574 | 1.501 | 0.262 | 0.014 | 0.452 | 0.021 |
| legacy-095 | html | 5.278 | 1.323 | 6.144 | 1.574 | 0.319 | 0.011 | 0.651 | 0.018 |
| legacy-095 | ast | 4.153 | 1.511 | 4.524 | 3.196 | 0.354 | 0.016 | 0.570 | 0.030 |
| legacy-096 | html | 3.662 | 1.729 | 4.878 | 1.786 | 0.354 | 0.016 | 0.754 | 0.025 |
| legacy-096 | ast | 4.388 | 1.578 | 4.556 | 1.607 | 0.220 | 0.019 | 0.630 | 0.029 |
| legacy-097 | html | 4.697 | 1.740 | 7.846 | 1.757 | 0.222 | 0.014 | 0.488 | 0.047 |
| legacy-097 | ast | 4.652 | 1.525 | 5.844 | 1.666 | 0.215 | 0.012 | 0.458 | 0.035 |
| legacy-098 | html | 3.581 | 1.386 | 4.400 | 1.828 | 0.300 | 0.010 | 0.677 | 0.042 |
| legacy-098 | ast | 4.245 | 1.530 | 5.193 | 1.554 | 0.361 | 0.015 | 0.757 | 0.038 |
| legacy-099 | html | 5.966 | 1.306 | 7.902 | 1.775 | 0.240 | 0.010 | 0.393 | 0.052 |
| legacy-099 | ast | 3.814 | 1.379 | 5.669 | 1.590 | 0.244 | 0.010 | 0.414 | 0.031 |
| legacy-100 | html | 3.908 | 1.267 | 4.825 | 1.806 | 0.253 | 0.013 | 0.516 | 0.020 |
| legacy-100 | ast | 3.599 | 1.581 | 4.906 | 1.619 | 0.246 | 0.015 | 0.412 | 0.048 |
| legacy-101 | html | 4.565 | 1.604 | 4.790 | 1.692 | 0.277 | 0.017 | 0.677 | 0.041 |
| legacy-101 | ast | 4.672 | 1.016 | 5.936 | 1.378 | 0.353 | 0.012 | 0.637 | 0.046 |
| legacy-102 | html | 4.878 | 1.178 | 5.332 | 3.133 | 0.334 | 0.013 | 1.000 | 0.035 |
| legacy-102 | ast | 3.979 | 1.187 | 4.311 | 1.592 | 0.383 | 0.012 | 0.911 | 0.036 |
| legacy-103 | html | 4.896 | 1.714 | 5.201 | 1.735 | 0.325 | 0.015 | 0.608 | 0.031 |
| legacy-103 | ast | 4.261 | 1.555 | 5.377 | 1.611 | 0.343 | 0.014 | 0.810 | 0.023 |
| legacy-104 | html | 4.640 | 1.811 | 5.532 | 2.999 | 0.305 | 0.020 | 1.026 | 0.045 |
| legacy-104 | ast | 4.442 | 1.474 | 5.535 | 1.639 | 0.484 | 0.012 | 0.871 | 0.025 |
| legacy-105 | html | 4.813 | 1.815 | 7.926 | 1.846 | 0.404 | 0.016 | 0.956 | 0.029 |
| legacy-105 | ast | 5.172 | 1.565 | 10.041 | 1.599 | 0.240 | 0.016 | 0.570 | 0.030 |
| legacy-106 | html | 3.812 | 1.809 | 4.129 | 1.865 | 0.286 | 0.020 | 0.599 | 0.028 |
| legacy-106 | ast | 4.068 | 1.438 | 7.333 | 1.670 | 0.207 | 0.016 | 0.428 | 0.053 |
| legacy-107 | html | 5.138 | 1.526 | 8.587 | 1.855 | 0.443 | 0.026 | 0.870 | 0.042 |
| legacy-107 | ast | 4.269 | 1.618 | 5.535 | 1.922 | 0.339 | 0.028 | 0.499 | 0.102 |
| legacy-108 | html | 4.797 | 1.873 | 5.153 | 1.947 | 0.343 | 0.021 | 0.623 | 0.035 |
| legacy-108 | ast | 4.473 | 1.704 | 12.815 | 1.725 | 0.356 | 0.030 | 0.855 | 0.060 |
| legacy-109 | html | 6.014 | 1.797 | 12.962 | 1.835 | 0.539 | 0.032 | 1.044 | 0.051 |
| legacy-109 | ast | 3.853 | 1.625 | 4.879 | 1.664 | 0.431 | 0.026 | 0.706 | 0.231 |
| legacy-110 | html | 4.565 | 1.773 | 5.978 | 1.874 | 0.333 | 0.035 | 0.570 | 0.058 |
| legacy-110 | ast | 4.110 | 1.474 | 10.464 | 1.745 | 0.412 | 0.030 | 1.362 | 0.054 |
| legacy-111 | html | 5.395 | 1.832 | 6.259 | 2.109 | 0.531 | 0.029 | 0.787 | 0.051 |
| legacy-111 | ast | 5.654 | 1.674 | 6.749 | 1.817 | 0.622 | 0.034 | 1.172 | 0.062 |
| legacy-112 | html | 5.455 | 1.824 | 5.701 | 1.916 | 0.470 | 0.031 | 0.861 | 0.047 |
| legacy-112 | ast | 5.125 | 1.604 | 5.488 | 1.872 | 0.390 | 0.028 | 0.668 | 0.042 |
| legacy-113 | html | 4.724 | 1.811 | 6.463 | 1.850 | 0.565 | 0.020 | 0.959 | 0.035 |
| legacy-113 | ast | 4.891 | 1.640 | 5.656 | 1.864 | 0.430 | 0.030 | 1.111 | 0.088 |
| legacy-114 | html | 4.868 | 1.797 | 6.062 | 2.467 | 0.417 | 0.027 | 0.805 | 0.041 |
| legacy-114 | ast | 3.965 | 1.639 | 4.939 | 1.757 | 0.409 | 0.018 | 0.862 | 0.033 |
| legacy-115 | html | 3.650 | 1.201 | 3.863 | 1.202 | 0.257 | 0.018 | 0.421 | 0.072 |
| legacy-115 | ast | 3.976 | 0.995 | 7.476 | 1.021 | 0.298 | 0.016 | 0.397 | 0.036 |
| legacy-116 | html | 3.513 | 1.026 | 4.661 | 1.168 | 0.227 | 0.011 | 0.390 | 0.032 |
| legacy-116 | ast | 3.872 | 0.982 | 4.300 | 0.990 | 0.295 | 0.007 | 0.625 | 0.035 |
| legacy-117 | html | 4.256 | 1.177 | 6.415 | 1.205 | 0.363 | 0.014 | 0.736 | 0.025 |
| legacy-117 | ast | 3.942 | 0.761 | 6.020 | 0.988 | 0.393 | 0.013 | 0.495 | 0.028 |
| legacy-118 | html | 5.530 | 1.998 | 7.426 | 2.184 | 0.559 | 0.030 | 0.828 | 0.037 |
| legacy-118 | ast | 5.021 | 1.703 | 7.201 | 1.827 | 0.494 | 0.033 | 0.768 | 0.042 |
| legacy-119 | html | 4.927 | 1.988 | 6.434 | 2.033 | 0.267 | 0.032 | 0.484 | 0.041 |
| legacy-119 | ast | 4.492 | 1.652 | 6.197 | 1.665 | 0.450 | 0.028 | 1.089 | 0.042 |
| legacy-120 | html | 6.494 | 2.027 | 6.749 | 2.282 | 0.585 | 0.038 | 1.021 | 0.053 |
| legacy-120 | ast | 4.716 | 1.759 | 6.804 | 1.783 | 0.462 | 0.039 | 0.739 | 0.066 |
| legacy-121 | html | 3.898 | 1.886 | 4.923 | 2.339 | 0.423 | 0.027 | 0.777 | 0.045 |
| legacy-121 | ast | 4.659 | 1.646 | 4.775 | 2.026 | 0.271 | 0.032 | 0.481 | 0.044 |
| legacy-122 | html | 4.891 | 1.369 | 5.561 | 2.581 | 0.324 | 0.029 | 0.600 | 0.042 |
| legacy-122 | ast | 5.654 | 1.057 | 5.896 | 1.126 | 0.359 | 0.024 | 0.554 | 0.036 |
| legacy-123 | html | 5.527 | 1.483 | 6.164 | 1.610 | 0.296 | 0.035 | 0.519 | 0.059 |
| legacy-123 | ast | 5.850 | 1.317 | 8.598 | 1.500 | 0.358 | 0.027 | 1.509 | 0.069 |
| legacy-124 | html | 5.263 | 1.512 | 8.272 | 2.103 | 0.432 | 0.032 | 1.202 | 0.049 |
| legacy-124 | ast | 4.596 | 1.440 | 8.700 | 1.640 | 0.355 | 0.030 | 0.634 | 0.066 |
| legacy-125 | html | 4.620 | 1.696 | 5.623 | 1.809 | 0.292 | 0.039 | 1.499 | 0.055 |
| legacy-125 | ast | 4.356 | 1.322 | 5.164 | 1.328 | 0.269 | 0.031 | 0.562 | 0.044 |
| legacy-126 | html | 5.713 | 1.550 | 13.613 | 1.763 | 0.363 | 0.034 | 1.230 | 0.057 |
| legacy-126 | ast | 5.026 | 1.277 | 6.387 | 2.400 | 0.493 | 0.028 | 0.987 | 0.048 |
| legacy-127 | html | 6.707 | 1.489 | 12.181 | 1.667 | 0.324 | 0.029 | 0.823 | 0.087 |
| legacy-127 | ast | 5.841 | 1.307 | 9.517 | 1.558 | 0.334 | 0.029 | 1.269 | 0.154 |
| legacy-128 | html | 5.109 | 1.442 | 11.706 | 1.566 | 0.322 | 0.031 | 0.638 | 0.051 |
| legacy-128 | ast | 4.463 | 1.265 | 10.786 | 1.467 | 0.478 | 0.025 | 0.890 | 0.039 |
| legacy-129 | html | 5.219 | 1.485 | 5.810 | 1.495 | 0.373 | 0.028 | 1.113 | 0.064 |
| legacy-129 | ast | 5.312 | 1.261 | 8.965 | 1.409 | 0.508 | 0.025 | 1.054 | 0.038 |
| legacy-130 | html | 4.526 | 1.527 | 5.539 | 1.673 | 0.355 | 0.040 | 0.562 | 0.055 |
| legacy-130 | ast | 4.798 | 1.344 | 9.794 | 1.405 | 0.432 | 0.039 | 0.637 | 0.052 |
| legacy-131 | html | 5.474 | 1.436 | 5.882 | 2.529 | 0.403 | 0.030 | 0.952 | 0.052 |
| legacy-131 | ast | 4.346 | 1.300 | 5.671 | 1.385 | 0.293 | 0.027 | 0.747 | 0.042 |
| legacy-132 | html | 5.122 | 1.674 | 5.885 | 2.610 | 0.357 | 0.040 | 0.947 | 0.055 |
| legacy-132 | ast | 5.133 | 1.382 | 6.794 | 1.477 | 0.510 | 0.031 | 1.200 | 0.053 |
| legacy-133 | html | 5.024 | 1.577 | 5.884 | 1.931 | 0.392 | 0.038 | 1.157 | 0.064 |
| legacy-133 | ast | 4.727 | 1.358 | 6.636 | 1.403 | 0.504 | 0.044 | 1.035 | 0.450 |
| legacy-134 | html | 5.359 | 1.587 | 7.601 | 2.025 | 0.316 | 0.030 | 0.537 | 0.041 |
| legacy-134 | ast | 5.481 | 1.344 | 6.363 | 1.733 | 0.413 | 0.032 | 0.698 | 0.066 |
| legacy-135 | html | 4.967 | 1.436 | 5.270 | 1.476 | 0.242 | 0.023 | 0.596 | 0.040 |
| legacy-135 | ast | 3.943 | 1.296 | 5.346 | 1.473 | 0.237 | 0.022 | 0.385 | 0.032 |
| legacy-136 | html | 4.347 | 1.523 | 5.328 | 1.590 | 0.266 | 0.023 | 0.467 | 0.036 |
| legacy-136 | ast | 4.115 | 1.233 | 4.685 | 1.323 | 0.346 | 0.029 | 0.546 | 0.051 |
| legacy-137 | html | 5.678 | 1.431 | 9.012 | 1.796 | 0.499 | 0.030 | 0.919 | 0.326 |
| legacy-137 | ast | 4.862 | 1.231 | 7.869 | 1.803 | 0.343 | 0.022 | 0.633 | 0.036 |
| legacy-138 | html | 5.305 | 1.561 | 6.328 | 2.827 | 0.456 | 0.042 | 0.802 | 0.736 |
| legacy-138 | ast | 6.363 | 1.325 | 10.500 | 1.634 | 0.314 | 0.055 | 0.895 | 0.088 |
| legacy-139 | html | 4.939 | 1.573 | 6.722 | 1.803 | 0.552 | 0.025 | 1.009 | 0.050 |
| legacy-139 | ast | 5.257 | 1.359 | 8.199 | 1.376 | 0.412 | 0.033 | 0.729 | 0.051 |
| legacy-140 | html | 4.813 | 1.578 | 9.967 | 1.585 | 0.558 | 0.028 | 0.946 | 0.051 |
| legacy-140 | ast | 4.905 | 1.190 | 5.592 | 1.404 | 0.517 | 0.032 | 0.834 | 0.045 |
| legacy-141 | html | 5.510 | 1.393 | 8.043 | 1.755 | 0.330 | 0.036 | 0.752 | 0.051 |
| legacy-141 | ast | 4.999 | 1.360 | 7.317 | 2.405 | 0.587 | 0.032 | 1.798 | 0.038 |
| legacy-142 | html | 6.031 | 1.344 | 7.920 | 1.678 | 0.446 | 0.026 | 1.163 | 0.055 |
| legacy-142 | ast | 5.497 | 1.405 | 7.003 | 1.591 | 0.462 | 0.032 | 1.423 | 0.052 |
| legacy-143 | html | 5.150 | 1.210 | 12.736 | 1.495 | 0.314 | 0.029 | 0.752 | 0.050 |
| legacy-143 | ast | 5.161 | 0.980 | 7.206 | 1.417 | 0.269 | 0.027 | 0.586 | 0.054 |
| legacy-144 | html | 4.411 | 2.048 | 6.686 | 2.154 | 0.367 | 0.044 | 0.536 | 0.065 |
| legacy-144 | ast | 4.990 | 1.536 | 5.479 | 2.270 | 0.363 | 0.035 | 0.513 | 0.049 |
| legacy-145 | html | 5.899 | 1.390 | 23.895 | 2.253 | 0.299 | 0.026 | 0.689 | 0.038 |
| legacy-145 | ast | 4.448 | 1.246 | 10.314 | 1.571 | 0.358 | 0.027 | 1.112 | 0.041 |
| legacy-146 | html | 5.436 | 1.467 | 8.852 | 2.434 | 0.286 | 0.035 | 0.606 | 0.048 |
| legacy-146 | ast | 5.076 | 1.286 | 5.459 | 1.446 | 0.385 | 0.031 | 0.885 | 0.059 |
| legacy-147 | html | 5.016 | 1.209 | 5.908 | 1.359 | 0.297 | 0.023 | 0.571 | 0.069 |
| legacy-147 | ast | 6.671 | 0.868 | 9.925 | 1.073 | 0.423 | 0.017 | 0.714 | 0.025 |
| legacy-148 | html | 5.278 | 1.483 | 6.968 | 1.635 | 0.344 | 0.035 | 1.015 | 0.056 |
| legacy-148 | ast | 5.164 | 1.193 | 9.326 | 1.268 | 0.408 | 0.024 | 0.925 | 0.033 |
| legacy-149 | html | 5.381 | 1.428 | 6.621 | 2.784 | 0.363 | 0.024 | 2.165 | 0.039 |
| legacy-149 | ast | 5.013 | 1.215 | 5.604 | 1.226 | 0.274 | 0.033 | 0.575 | 0.045 |
| legacy-150 | html | 4.482 | 1.584 | 6.498 | 3.165 | 0.303 | 0.026 | 0.551 | 0.038 |
| legacy-150 | ast | 5.605 | 1.409 | 7.227 | 1.527 | 0.308 | 0.021 | 0.586 | 0.219 |
| legacy-151 | html | 8.258 | 1.492 | 15.167 | 1.706 | 0.366 | 0.039 | 3.527 | 0.049 |
| legacy-151 | ast | 5.608 | 1.396 | 7.698 | 2.555 | 0.438 | 0.034 | 4.970 | 0.045 |
| legacy-152 | html | 6.313 | 2.085 | 12.249 | 3.039 | 0.651 | 0.043 | 2.212 | 0.058 |
| legacy-152 | ast | 6.210 | 1.814 | 7.000 | 1.865 | 0.453 | 0.039 | 1.095 | 0.219 |
| legacy-153 | html | 5.741 | 1.644 | 12.774 | 1.737 | 0.595 | 0.039 | 2.513 | 0.059 |
| legacy-153 | ast | 4.165 | 1.019 | 5.200 | 1.283 | 0.475 | 0.027 | 1.338 | 0.044 |
| legacy-154 | html | 4.560 | 1.327 | 5.250 | 1.651 | 0.288 | 0.012 | 0.937 | 0.032 |
| legacy-154 | ast | 3.619 | 1.489 | 4.408 | 1.581 | 0.229 | 0.011 | 0.563 | 0.024 |
| legacy-155 | html | 5.735 | 1.762 | 9.139 | 1.852 | 0.319 | 0.018 | 0.624 | 0.030 |
| legacy-155 | ast | 4.494 | 1.561 | 7.008 | 1.593 | 0.385 | 0.017 | 0.809 | 0.029 |
| legacy-156 | html | 4.422 | 1.787 | 6.641 | 1.798 | 0.386 | 0.024 | 0.707 | 0.036 |
| legacy-156 | ast | 4.648 | 1.558 | 5.479 | 1.713 | 0.470 | 0.023 | 0.806 | 0.037 |
| legacy-157 | html | 7.863 | 5.224 | 9.888 | 6.971 | 0.521 | 0.325 | 1.117 | 0.368 |
| legacy-157 | ast | 7.371 | 4.475 | 8.708 | 4.749 | 0.514 | 0.160 | 0.978 | 0.222 |
| legacy-158 | html | 48.246 | 4.811 | 70.333 | 5.198 | 17.070 | 1.017 | 36.996 | 1.273 |
| legacy-158 | ast | 48.144 | 4.629 | 58.518 | 4.756 | 21.318 | 1.020 | 43.377 | 2.039 |
| legacy-159 | html | 6.971 | 1.710 | 16.212 | 1.829 | 0.385 | 0.028 | 1.148 | 0.042 |
| legacy-159 | ast | 4.884 | 1.476 | 9.205 | 1.698 | 0.349 | 0.022 | 0.611 | 0.039 |
| legacy-160 | html | 5.334 | 1.813 | 6.675 | 1.936 | 0.464 | 0.027 | 0.856 | 0.045 |
| legacy-160 | ast | 5.976 | 1.718 | 6.584 | 2.743 | 0.590 | 0.028 | 0.967 | 0.036 |
| legacy-161 | html | 4.679 | 1.729 | 7.045 | 1.884 | 0.323 | 0.017 | 1.192 | 0.045 |
| legacy-161 | ast | 4.906 | 1.525 | 5.045 | 1.556 | 0.411 | 0.016 | 0.906 | 0.025 |
| legacy-162 | html | 4.418 | 1.231 | 9.160 | 1.596 | 0.297 | 0.016 | 0.720 | 0.067 |
| legacy-162 | ast | 4.415 | 1.006 | 6.366 | 1.063 | 0.318 | 0.015 | 0.443 | 0.039 |
| legacy-163 | html | 4.613 | 1.817 | 4.835 | 2.534 | 0.351 | 0.021 | 0.622 | 0.034 |
| legacy-163 | ast | 3.895 | 1.538 | 5.371 | 1.582 | 0.294 | 0.028 | 0.533 | 0.058 |
| legacy-164 | html | 6.305 | 2.319 | 6.760 | 2.520 | 0.759 | 0.034 | 2.270 | 0.069 |
| legacy-164 | ast | 6.966 | 2.257 | 9.201 | 2.283 | 0.690 | 0.031 | 1.007 | 0.079 |
| legacy-165 | html | 5.575 | 2.278 | 8.835 | 2.453 | 0.676 | 0.048 | 0.958 | 0.059 |
| legacy-165 | ast | 6.931 | 2.331 | 9.367 | 5.686 | 1.000 | 0.046 | 1.914 | 0.066 |
| legacy-166 | html | 7.457 | 1.972 | 8.556 | 2.087 | 0.615 | 0.030 | 1.259 | 0.546 |
| legacy-166 | ast | 4.961 | 1.735 | 5.736 | 2.196 | 0.541 | 0.026 | 0.801 | 0.051 |
| legacy-167 | html | 5.745 | 2.145 | 6.013 | 2.367 | 0.525 | 0.034 | 0.768 | 0.057 |
| legacy-167 | ast | 5.022 | 1.904 | 7.018 | 2.338 | 0.631 | 0.040 | 0.880 | 0.059 |
| legacy-168 | html | 4.149 | 2.034 | 6.128 | 2.208 | 0.371 | 0.043 | 0.874 | 0.054 |
| legacy-168 | ast | 4.360 | 1.848 | 5.758 | 1.990 | 0.457 | 0.043 | 0.944 | 0.056 |
| legacy-169 | html | 4.496 | 1.818 | 5.816 | 1.997 | 0.354 | 0.031 | 0.613 | 0.075 |
| legacy-169 | ast | 4.594 | 1.619 | 6.003 | 1.705 | 0.562 | 0.021 | 1.094 | 0.056 |
| legacy-170 | html | 5.074 | 1.361 | 5.695 | 1.381 | 0.335 | 0.020 | 0.604 | 0.030 |
| legacy-170 | ast | 5.463 | 1.117 | 10.387 | 1.129 | 0.389 | 0.018 | 0.932 | 0.030 |
| legacy-171 | html | 7.921 | 1.998 | 10.229 | 2.057 | 0.462 | 0.039 | 0.643 | 0.048 |
| legacy-171 | ast | 5.300 | 1.747 | 7.282 | 3.088 | 0.619 | 0.036 | 1.229 | 0.055 |
| legacy-172 | html | 4.747 | 1.985 | 8.615 | 2.689 | 0.517 | 0.046 | 1.366 | 0.286 |
| legacy-172 | ast | 5.754 | 1.869 | 8.291 | 2.123 | 0.736 | 0.041 | 4.685 | 0.064 |
| legacy-173 | html | 6.732 | 2.161 | 8.370 | 8.350 | 0.878 | 0.036 | 2.291 | 0.053 |
| legacy-173 | ast | 5.635 | 1.644 | 7.917 | 1.932 | 0.674 | 0.025 | 1.822 | 0.034 |
| legacy-174 | html | 6.185 | 2.015 | 8.491 | 3.273 | 0.458 | 0.037 | 1.042 | 0.073 |
| legacy-174 | ast | 5.682 | 1.734 | 6.816 | 1.752 | 0.706 | 0.032 | 1.351 | 0.052 |
| legacy-175 | html | 6.643 | 2.068 | 8.499 | 2.102 | 0.667 | 0.044 | 1.625 | 0.073 |
| legacy-175 | ast | 5.865 | 1.715 | 6.201 | 2.061 | 0.707 | 0.039 | 1.321 | 0.054 |
| legacy-176 | html | 5.337 | 1.349 | 7.778 | 1.425 | 0.403 | 0.012 | 0.986 | 0.032 |
| legacy-176 | ast | 3.296 | 1.126 | 4.203 | 1.159 | 0.302 | 0.019 | 0.490 | 0.036 |
| legacy-177 | html | 4.950 | 2.017 | 6.612 | 2.105 | 0.483 | 0.048 | 1.476 | 0.070 |
| legacy-177 | ast | 5.126 | 1.758 | 5.346 | 1.782 | 0.486 | 0.044 | 1.003 | 0.066 |
| legacy-178 | html | 5.446 | 1.912 | 6.253 | 1.931 | 0.500 | 0.033 | 1.063 | 0.042 |
| legacy-178 | ast | 5.679 | 1.647 | 7.851 | 1.723 | 0.503 | 0.029 | 1.350 | 0.043 |
| legacy-179 | html | 6.025 | 1.949 | 7.288 | 2.260 | 0.718 | 0.037 | 1.251 | 0.047 |
| legacy-179 | ast | 4.853 | 1.671 | 5.927 | 1.724 | 0.337 | 0.024 | 0.637 | 0.043 |
| empty | html | 4.436 | 0.503 | 7.990 | 0.535 | 0.384 | 0.002 | 1.441 | 0.005 |
| empty | ast | 4.975 | 0.356 | 10.806 | 0.362 | 0.328 | 0.003 | 1.425 | 0.005 |
| spaces | html | 4.065 | 0.427 | 4.420 | 0.554 | 0.364 | 0.003 | 0.781 | 0.007 |
| spaces | ast | 3.851 | 0.279 | 7.119 | 0.399 | 0.403 | 0.003 | 1.103 | 0.005 |
| fullwidth | html | 6.101 | 1.552 | 8.210 | 1.770 | 0.578 | 0.028 | 0.999 | 0.058 |
| fullwidth | ast | 5.448 | 1.593 | 13.091 | 1.871 | 0.482 | 0.025 | 1.161 | 0.035 |
| cr | html | 5.784 | 1.293 | 7.596 | 1.657 | 0.521 | 0.010 | 1.226 | 0.033 |
| cr | ast | 4.731 | 1.555 | 5.964 | 1.594 | 0.389 | 0.016 | 0.928 | 0.055 |
| crlf | html | 4.754 | 1.829 | 7.069 | 1.917 | 0.261 | 0.027 | 0.510 | 0.042 |
| crlf | ast | 5.394 | 1.616 | 7.682 | 1.631 | 0.322 | 0.015 | 0.514 | 0.026 |
| nul | html | 8.001 | 1.689 | 15.118 | 1.714 | 0.348 | 0.013 | 0.691 | 0.035 |
| nul | ast | 5.805 | 1.484 | 9.408 | 1.516 | 0.425 | 0.015 | 1.326 | 0.040 |
| unicode | html | 5.011 | 1.688 | 6.406 | 1.706 | 0.420 | 0.019 | 0.994 | 0.030 |
| unicode | ast | 5.456 | 1.490 | 5.724 | 1.508 | 0.364 | 0.018 | 0.918 | 0.036 |
| heading-no-space | html | 4.975 | 1.733 | 9.346 | 1.812 | 0.302 | 0.015 | 0.625 | 0.059 |
| heading-no-space | ast | 5.496 | 1.552 | 6.397 | 1.720 | 0.574 | 0.014 | 1.419 | 0.021 |
| heading-seven | html | 5.815 | 1.761 | 8.850 | 1.766 | 0.367 | 0.023 | 0.900 | 0.043 |
| heading-seven | ast | 5.526 | 1.594 | 11.537 | 1.870 | 0.424 | 0.022 | 1.422 | 0.026 |
| heading-inline | html | 5.820 | 1.899 | 6.620 | 2.522 | 0.545 | 0.027 | 0.879 | 0.038 |
| heading-inline | ast | 5.256 | 1.647 | 5.831 | 1.797 | 0.595 | 0.025 | 1.076 | 0.053 |
| setext-empty | html | 6.948 | 1.186 | 11.877 | 1.742 | 0.319 | 0.013 | 0.511 | 0.039 |
| setext-empty | ast | 6.137 | 1.158 | 6.269 | 1.593 | 0.530 | 0.009 | 1.367 | 0.035 |
| setext-dashes | html | 4.861 | 1.259 | 5.326 | 1.499 | 0.407 | 0.011 | 2.728 | 0.022 |
| setext-dashes | ast | 4.231 | 1.556 | 4.877 | 1.665 | 0.352 | 0.011 | 0.874 | 0.043 |
| horizontal-rule | html | 5.610 | 1.936 | 7.339 | 2.178 | 0.413 | 0.028 | 1.167 | 0.041 |
| horizontal-rule | ast | 4.651 | 1.626 | 5.499 | 1.690 | 0.554 | 0.026 | 1.086 | 0.039 |
| emphasis-crossed | html | 5.277 | 1.789 | 6.919 | 1.819 | 0.345 | 0.022 | 1.023 | 0.036 |
| emphasis-crossed | ast | 4.568 | 1.594 | 4.961 | 1.789 | 0.251 | 0.017 | 0.633 | 0.027 |
| emphasis-nested | html | 6.311 | 1.763 | 9.633 | 1.799 | 0.388 | 0.015 | 0.738 | 0.027 |
| emphasis-nested | ast | 5.189 | 1.137 | 8.781 | 1.654 | 0.388 | 0.016 | 0.813 | 0.051 |
| emphasis-unclosed | html | 5.145 | 1.777 | 7.974 | 2.820 | 0.355 | 0.022 | 1.003 | 0.037 |
| emphasis-unclosed | ast | 4.374 | 1.618 | 5.347 | 1.782 | 0.421 | 0.021 | 0.751 | 0.030 |
| ruby-valid | html | 5.234 | 1.830 | 7.711 | 2.606 | 0.442 | 0.018 | 0.920 | 0.028 |
| ruby-valid | ast | 4.405 | 1.581 | 4.774 | 3.104 | 0.296 | 0.018 | 0.845 | 0.065 |
| ruby-ascii-pipe | html | 3.860 | 1.701 | 5.434 | 1.728 | 0.360 | 0.018 | 0.925 | 0.030 |
| ruby-ascii-pipe | ast | 6.104 | 1.520 | 9.448 | 1.556 | 0.332 | 0.017 | 0.654 | 0.029 |
| ruby-empty-base | html | 5.503 | 1.733 | 8.636 | 1.775 | 0.451 | 0.016 | 0.908 | 0.050 |
| ruby-empty-base | ast | 5.871 | 1.531 | 7.012 | 1.557 | 0.444 | 0.014 | 1.250 | 0.050 |
| ruby-empty-reading | html | 5.261 | 1.775 | 7.815 | 1.844 | 0.319 | 0.016 | 2.395 | 0.060 |
| ruby-empty-reading | ast | 5.669 | 1.572 | 6.415 | 1.695 | 0.450 | 0.014 | 0.946 | 0.055 |
| ruby-unclosed | html | 7.890 | 1.742 | 16.646 | 1.776 | 0.374 | 0.017 | 0.971 | 0.027 |
| ruby-unclosed | ast | 5.190 | 1.608 | 5.691 | 1.852 | 0.417 | 0.016 | 1.010 | 0.030 |
| ruby-newline | html | 4.996 | 1.715 | 5.200 | 1.801 | 0.532 | 0.017 | 1.515 | 0.042 |
| ruby-newline | ast | 4.765 | 1.532 | 5.082 | 1.778 | 0.388 | 0.015 | 0.701 | 0.039 |
| ruby-nested | html | 4.937 | 1.754 | 6.277 | 1.830 | 0.424 | 0.020 | 0.949 | 0.033 |
| ruby-nested | ast | 5.018 | 1.391 | 6.025 | 1.597 | 0.330 | 0.019 | 0.672 | 0.031 |
| ruby-double | html | 5.454 | 1.691 | 8.394 | 2.228 | 0.376 | 0.015 | 0.679 | 0.083 |
| ruby-double | ast | 5.666 | 1.547 | 9.132 | 1.642 | 0.376 | 0.018 | 0.775 | 0.032 |
| html-attrs | html | 8.129 | 1.854 | 10.871 | 1.937 | 0.347 | 0.023 | 0.593 | 0.030 |
| html-attrs | ast | 4.121 | 1.492 | 5.160 | 1.673 | 0.379 | 0.020 | 0.783 | 0.046 |
| html-mismatch | html | 5.161 | 1.467 | 7.457 | 1.855 | 0.456 | 0.022 | 1.256 | 0.038 |
| html-mismatch | ast | 3.703 | 1.651 | 6.815 | 1.722 | 0.245 | 0.016 | 0.622 | 0.027 |
| html-unclosed | html | 4.625 | 1.321 | 7.117 | 1.485 | 0.476 | 0.020 | 0.784 | 0.033 |
| html-unclosed | ast | 5.425 | 1.683 | 8.810 | 1.835 | 0.563 | 0.019 | 1.229 | 0.028 |
| html-selfclosing | html | 5.631 | 1.492 | 7.585 | 1.892 | 0.641 | 0.021 | 1.545 | 0.030 |
| html-selfclosing | ast | 4.771 | 1.681 | 7.128 | 1.790 | 0.529 | 0.023 | 1.088 | 0.045 |
| html-comment | html | 4.940 | 1.935 | 5.164 | 2.338 | 0.473 | 0.025 | 1.032 | 0.038 |
| html-comment | ast | 4.229 | 1.739 | 5.323 | 1.860 | 0.310 | 0.018 | 0.545 | 0.029 |
| html-case | html | 5.094 | 1.877 | 5.151 | 2.132 | 0.286 | 0.014 | 0.624 | 0.029 |
| html-case | ast | 3.911 | 1.637 | 6.703 | 1.671 | 0.292 | 0.020 | 0.743 | 0.032 |
| html-script | html | 4.190 | 1.864 | 5.818 | 1.911 | 0.286 | 0.021 | 0.549 | 0.048 |
| html-script | ast | 4.375 | 1.669 | 5.907 | 1.813 | 0.302 | 0.020 | 0.692 | 0.042 |
| html-entities | html | 6.284 | 1.847 | 8.440 | 1.911 | 0.341 | 0.024 | 0.609 | 0.045 |
| html-entities | ast | 4.852 | 1.677 | 15.472 | 1.719 | 0.426 | 0.017 | 0.891 | 0.026 |
| html-nested | html | 4.921 | 1.891 | 6.766 | 1.925 | 0.372 | 0.024 | 1.083 | 0.059 |
| html-nested | ast | 3.791 | 1.704 | 4.789 | 3.288 | 0.325 | 0.021 | 0.640 | 0.046 |
| link-attrs | html | 4.696 | 1.938 | 6.105 | 1.970 | 0.325 | 0.025 | 0.958 | 0.056 |
| link-attrs | ast | 4.894 | 1.683 | 8.296 | 2.388 | 0.294 | 0.020 | 0.471 | 0.032 |
| link-unclosed | html | 5.497 | 1.802 | 6.664 | 1.843 | 0.317 | 0.020 | 0.668 | 0.029 |
| link-unclosed | ast | 4.300 | 1.618 | 4.939 | 1.632 | 0.330 | 0.022 | 0.636 | 0.033 |
| link-empty | html | 4.601 | 1.900 | 6.775 | 2.108 | 0.488 | 0.023 | 0.761 | 0.035 |
| link-empty | ast | 5.236 | 1.604 | 6.299 | 1.663 | 0.517 | 0.021 | 0.989 | 0.034 |
| link-parens | html | 3.669 | 1.932 | 9.517 | 4.440 | 0.285 | 0.023 | 0.592 | 0.058 |
| link-parens | ast | 4.480 | 1.651 | 5.596 | 1.721 | 0.331 | 0.019 | 1.097 | 0.038 |
| plugin-unknown | html | 4.098 | 1.762 | 5.087 | 1.841 | 0.360 | 0.023 | 0.842 | 0.043 |
| plugin-unknown | ast | 4.120 | 1.605 | 4.898 | 1.646 | 0.400 | 0.021 | 0.839 | 0.039 |
| plugin-block-unknown | html | 3.880 | 0.788 | 5.702 | 0.799 | 0.240 | 0.012 | 0.328 | 0.018 |
| plugin-block-unknown | ast | 4.260 | 0.668 | 5.966 | 0.897 | 0.291 | 0.012 | 0.617 | 0.019 |
| plugin-malformed | html | 6.017 | 1.874 | 6.667 | 2.114 | 0.481 | 0.015 | 0.902 | 0.028 |
| plugin-malformed | ast | 5.653 | 1.675 | 7.240 | 1.820 | 0.389 | 0.021 | 0.921 | 0.053 |
| footnote-missing | html | 5.707 | 1.915 | 6.360 | 2.087 | 0.359 | 0.022 | 0.636 | 0.035 |
| footnote-missing | ast | 4.484 | 1.908 | 6.171 | 3.157 | 0.666 | 0.020 | 1.197 | 0.043 |
| footnote-duplicate | html | 4.990 | 2.135 | 8.012 | 2.321 | 0.455 | 0.056 | 0.859 | 0.073 |
| footnote-duplicate | ast | 3.907 | 1.787 | 5.630 | 2.027 | 0.384 | 0.038 | 0.592 | 0.051 |
| footnote-order | html | 5.173 | 1.524 | 5.930 | 1.677 | 0.304 | 0.028 | 0.829 | 0.053 |
| footnote-order | ast | 4.300 | 1.401 | 7.734 | 4.718 | 0.376 | 0.025 | 1.568 | 0.043 |
| footnote-empty | html | 4.512 | 1.338 | 4.702 | 1.522 | 0.215 | 0.016 | 0.450 | 0.025 |
| footnote-empty | ast | 4.610 | 1.127 | 9.166 | 1.129 | 0.405 | 0.014 | 1.073 | 0.022 |
| footnote-markup | html | 5.580 | 2.259 | 7.713 | 2.475 | 0.657 | 0.036 | 0.986 | 0.060 |
| footnote-markup | ast | 5.118 | 1.729 | 6.622 | 1.871 | 0.457 | 0.036 | 0.883 | 0.053 |
| math-unclosed | html | 5.075 | 1.767 | 9.765 | 1.792 | 0.566 | 0.018 | 0.849 | 0.043 |
| math-unclosed | ast | 5.216 | 1.519 | 6.026 | 1.540 | 0.409 | 0.017 | 0.736 | 0.032 |
| math-empty | html | 4.167 | 1.013 | 8.178 | 1.040 | 0.450 | 0.010 | 0.697 | 0.039 |
| math-empty | ast | 3.919 | 0.916 | 4.358 | 0.922 | 0.332 | 0.009 | 0.575 | 0.030 |
| list-indent | html | 5.434 | 1.966 | 6.133 | 3.182 | 0.411 | 0.031 | 0.581 | 0.148 |
| list-indent | ast | 4.405 | 1.705 | 5.202 | 1.728 | 0.576 | 0.037 | 1.037 | 0.053 |
| list-kind-switch | html | 4.766 | 1.611 | 5.178 | 1.739 | 0.335 | 0.027 | 0.971 | 0.040 |
| list-kind-switch | ast | 4.634 | 1.439 | 5.760 | 1.630 | 0.401 | 0.024 | 1.062 | 0.069 |
| quote-depth | html | 5.689 | 1.700 | 6.126 | 1.738 | 0.444 | 0.026 | 1.421 | 0.037 |
| quote-depth | ast | 6.514 | 1.549 | 8.083 | 1.653 | 0.407 | 0.024 | 1.266 | 0.040 |
| fence-unclosed | html | 4.971 | 1.884 | 5.584 | 1.946 | 0.452 | 0.026 | 1.118 | 0.042 |
| fence-unclosed | ast | 5.407 | 1.738 | 5.663 | 1.953 | 0.542 | 0.023 | 0.948 | 0.212 |
| fence-short-close | html | 5.865 | 2.007 | 8.978 | 2.490 | 0.400 | 0.026 | 0.671 | 0.084 |
| fence-short-close | ast | 5.370 | 1.712 | 6.271 | 1.749 | 0.501 | 0.024 | 0.731 | 0.055 |
| fence-tilde | html | 6.096 | 1.774 | 6.437 | 1.958 | 0.409 | 0.023 | 0.679 | 0.027 |
| fence-tilde | ast | 5.478 | 1.584 | 6.519 | 1.695 | 0.382 | 0.021 | 0.603 | 0.035 |
| fence-empty | html | 4.961 | 1.166 | 7.076 | 1.342 | 0.447 | 0.012 | 1.155 | 0.046 |
| fence-empty | ast | 4.590 | 0.966 | 5.200 | 0.980 | 0.309 | 0.011 | 0.586 | 0.027 |
| fence-html | html | 6.561 | 1.283 | 8.682 | 1.292 | 0.401 | 0.021 | 0.767 | 0.025 |
| fence-html | ast | 6.230 | 0.993 | 10.840 | 1.001 | 0.373 | 0.017 | 0.976 | 0.028 |
| fence-tail | html | 6.076 | 2.151 | 7.701 | 2.776 | 0.687 | 0.032 | 1.162 | 0.047 |
| fence-tail | ast | 6.504 | 1.750 | 11.239 | 2.091 | 0.726 | 0.030 | 1.427 | 0.044 |
| fence-crlf | html | 5.070 | 1.242 | 7.902 | 1.387 | 0.306 | 0.010 | 1.021 | 0.016 |
| fence-crlf | ast | 4.618 | 0.989 | 5.184 | 1.096 | 0.324 | 0.013 | 0.578 | 0.025 |
| table-invalid-separator | html | 5.362 | 1.034 | 7.433 | 1.065 | 0.406 | 0.018 | 0.832 | 0.034 |
| table-invalid-separator | ast | 4.845 | 0.888 | 5.465 | 0.891 | 0.394 | 0.013 | 0.784 | 0.281 |
| table-no-body | html | 4.770 | 1.780 | 5.266 | 1.810 | 0.551 | 0.023 | 1.005 | 0.038 |
| table-no-body | ast | 4.892 | 1.595 | 8.308 | 1.624 | 0.508 | 0.023 | 0.931 | 0.039 |
| table-mismatch | html | 5.624 | 1.468 | 6.091 | 1.589 | 0.396 | 0.025 | 1.053 | 0.044 |
| table-mismatch | ast | 6.420 | 1.270 | 9.189 | 1.295 | 0.490 | 0.031 | 1.243 | 0.049 |
| table-align | html | 5.593 | 1.465 | 12.232 | 1.677 | 0.397 | 0.034 | 1.729 | 0.058 |
| table-align | ast | 5.638 | 1.266 | 11.687 | 1.305 | 0.481 | 0.030 | 0.933 | 0.047 |
| table-empty | html | 6.041 | 1.215 | 6.516 | 2.129 | 0.304 | 0.020 | 0.644 | 0.032 |
| table-empty | ast | 5.443 | 1.019 | 7.469 | 1.034 | 0.346 | 0.021 | 0.784 | 0.040 |
| table-pipe | html | 6.128 | 1.469 | 7.003 | 1.508 | 0.319 | 0.028 | 0.660 | 0.037 |
| table-pipe | ast | 5.099 | 1.349 | 5.685 | 1.480 | 0.286 | 0.028 | 0.725 | 0.079 |
| table-escape | html | 5.642 | 1.513 | 7.731 | 1.658 | 0.369 | 0.032 | 0.809 | 0.045 |
| table-escape | ast | 5.668 | 1.308 | 6.818 | 1.381 | 0.384 | 0.029 | 0.952 | 0.058 |
| table-double-slash | html | 5.355 | 1.413 | 6.551 | 1.576 | 0.394 | 0.031 | 1.247 | 0.045 |
| table-double-slash | ast | 5.683 | 1.213 | 7.816 | 1.316 | 0.437 | 0.029 | 1.279 | 0.045 |
| table-triple-slash | html | 7.340 | 1.430 | 13.219 | 1.529 | 0.306 | 0.030 | 0.634 | 0.044 |
| table-triple-slash | ast | 5.759 | 1.252 | 7.048 | 1.443 | 0.396 | 0.027 | 0.941 | 0.040 |
| table-no-pipes | html | 4.548 | 1.791 | 6.948 | 1.796 | 0.412 | 0.023 | 0.742 | 0.041 |
| table-no-pipes | ast | 4.691 | 1.629 | 4.904 | 1.828 | 0.366 | 0.024 | 0.685 | 0.045 |
| table-unclosed-code | html | 4.118 | 1.538 | 4.574 | 1.584 | 0.269 | 0.029 | 0.603 | 0.049 |
| table-unclosed-code | ast | 3.789 | 1.315 | 4.501 | 1.385 | 0.287 | 0.025 | 0.578 | 0.048 |
| ticks-1-equal | html | 3.411 | 1.290 | 3.835 | 1.796 | 0.256 | 0.014 | 0.506 | 0.031 |
| ticks-1-equal | ast | 3.476 | 1.144 | 4.495 | 1.461 | 0.270 | 0.014 | 0.462 | 0.027 |
| ticks-1-unequal | html | 3.333 | 1.280 | 3.715 | 1.587 | 0.328 | 0.014 | 0.516 | 0.028 |
| ticks-1-unequal | ast | 3.545 | 1.536 | 5.046 | 1.577 | 0.282 | 0.019 | 0.466 | 0.034 |
| ticks-1-unclosed | html | 3.322 | 1.761 | 3.621 | 1.796 | 0.232 | 0.010 | 0.433 | 0.025 |
| ticks-1-unclosed | ast | 3.006 | 1.552 | 3.906 | 1.607 | 0.239 | 0.015 | 0.429 | 0.035 |
| ticks-1-spaces | html | 3.116 | 1.193 | 4.208 | 1.213 | 0.224 | 0.011 | 0.548 | 0.022 |
| ticks-1-spaces | ast | 3.161 | 1.039 | 4.312 | 1.546 | 0.217 | 0.010 | 0.607 | 0.025 |
| ticks-2-equal | html | 3.365 | 1.349 | 3.559 | 1.737 | 0.240 | 0.013 | 0.471 | 0.029 |
| ticks-2-equal | ast | 3.072 | 1.527 | 4.490 | 1.643 | 0.215 | 0.012 | 0.421 | 0.023 |
| ticks-2-unequal | html | 4.960 | 1.248 | 7.388 | 1.354 | 0.387 | 0.016 | 0.548 | 0.033 |
| ticks-2-unequal | ast | 4.021 | 1.128 | 5.192 | 1.385 | 0.441 | 0.017 | 0.743 | 0.029 |
| ticks-2-unclosed | html | 5.138 | 1.215 | 14.954 | 1.325 | 0.491 | 0.012 | 2.301 | 0.026 |
| ticks-2-unclosed | ast | 7.304 | 1.151 | 10.984 | 1.650 | 0.367 | 0.012 | 1.257 | 0.024 |
| ticks-2-spaces | html | 9.955 | 1.679 | 13.815 | 1.797 | 0.650 | 0.013 | 3.861 | 0.031 |
| ticks-2-spaces | ast | 14.717 | 1.502 | 34.662 | 1.584 | 0.369 | 0.017 | 0.892 | 0.031 |
| ticks-3-equal | html | 13.956 | 1.762 | 60.347 | 1.883 | 0.591 | 0.020 | 16.143 | 0.034 |
| ticks-3-equal | ast | 19.801 | 1.557 | 49.934 | 1.576 | 0.492 | 0.019 | 5.941 | 0.042 |
| ticks-3-unequal | html | 17.969 | 1.824 | 54.551 | 1.829 | 1.050 | 0.031 | 2.715 | 0.044 |
| ticks-3-unequal | ast | 13.127 | 1.588 | 29.632 | 1.684 | 0.994 | 0.023 | 6.495 | 0.045 |
| ticks-3-unclosed | html | 18.381 | 1.783 | 23.570 | 1.809 | 0.820 | 0.014 | 4.724 | 0.027 |
| ticks-3-unclosed | ast | 32.334 | 1.233 | 36.606 | 1.822 | 0.683 | 0.018 | 4.796 | 0.032 |
| ticks-3-spaces | html | 17.461 | 1.781 | 34.823 | 1.834 | 0.537 | 0.015 | 1.055 | 0.030 |
| ticks-3-spaces | ast | 5.839 | 1.553 | 19.515 | 1.602 | 0.517 | 0.013 | 2.695 | 0.031 |
| ticks-4-equal | html | 13.002 | 1.742 | 17.945 | 1.803 | 0.522 | 0.022 | 1.218 | 0.032 |
| ticks-4-equal | ast | 12.675 | 1.472 | 24.439 | 1.587 | 0.651 | 0.017 | 13.560 | 0.030 |
| ticks-4-unequal | html | 10.936 | 1.840 | 37.874 | 2.024 | 1.188 | 0.025 | 5.241 | 0.043 |
| ticks-4-unequal | ast | 13.295 | 1.631 | 22.146 | 1.756 | 1.402 | 0.019 | 8.314 | 0.030 |
| ticks-4-unclosed | html | 8.865 | 1.306 | 32.024 | 1.839 | 0.720 | 0.016 | 1.564 | 0.031 |
| ticks-4-unclosed | ast | 16.461 | 1.636 | 21.269 | 1.744 | 0.582 | 0.021 | 1.634 | 0.035 |
| ticks-4-spaces | html | 13.911 | 1.681 | 32.444 | 1.891 | 0.779 | 0.014 | 4.429 | 0.030 |
| ticks-4-spaces | ast | 17.837 | 1.082 | 41.483 | 1.566 | 0.664 | 0.013 | 4.831 | 0.029 |
| ticks-5-equal | html | 17.134 | 1.736 | 23.657 | 1.820 | 0.531 | 0.020 | 1.654 | 0.028 |
| ticks-5-equal | ast | 17.965 | 1.579 | 38.879 | 1.590 | 0.518 | 0.016 | 1.870 | 0.050 |
| ticks-5-unequal | html | 14.199 | 1.886 | 26.026 | 2.320 | 5.758 | 0.028 | 18.832 | 0.045 |
| ticks-5-unequal | ast | 8.982 | 1.674 | 14.186 | 1.726 | 4.623 | 0.026 | 9.174 | 0.058 |
| ticks-5-unclosed | html | 11.260 | 1.800 | 21.737 | 1.846 | 0.801 | 0.022 | 7.761 | 0.047 |
| ticks-5-unclosed | ast | 10.776 | 1.649 | 39.557 | 2.118 | 0.751 | 0.024 | 1.750 | 0.038 |
| ticks-5-spaces | html | 27.855 | 1.800 | 71.168 | 1.831 | 1.529 | 0.019 | 4.763 | 0.038 |
| ticks-5-spaces | ast | 13.042 | 1.579 | 53.191 | 1.748 | 0.576 | 0.021 | 4.854 | 0.041 |
| ticks-6-equal | html | 11.453 | 1.828 | 27.574 | 2.226 | 0.552 | 0.019 | 1.113 | 0.231 |
| ticks-6-equal | ast | 10.889 | 1.566 | 25.029 | 1.598 | 0.411 | 0.016 | 0.985 | 0.025 |
| ticks-6-unequal | html | 13.592 | 1.867 | 16.173 | 1.918 | 1.608 | 0.027 | 3.902 | 0.044 |
| ticks-6-unequal | ast | 21.124 | 1.695 | 35.471 | 1.733 | 1.741 | 0.031 | 11.905 | 0.060 |
| ticks-6-unclosed | html | 8.698 | 1.753 | 14.406 | 2.453 | 0.884 | 0.020 | 1.738 | 0.047 |
| ticks-6-unclosed | ast | 12.002 | 1.660 | 34.681 | 1.761 | 0.630 | 0.023 | 3.530 | 0.043 |
| ticks-6-spaces | html | 17.855 | 1.760 | 23.540 | 1.800 | 0.580 | 0.022 | 1.283 | 0.037 |
| ticks-6-spaces | ast | 14.447 | 1.561 | 39.979 | 1.639 | 0.482 | 0.017 | 1.126 | 0.046 |
| plugin-inline | html | 11.852 | 1.933 | 15.654 | 1.991 | 0.646 | 0.033 | 3.817 | 0.051 |
| plugin-inline | ast | 27.946 | 1.658 | 32.227 | 2.559 | 0.482 | 0.026 | 1.117 | 0.037 |
| plugin-block | html | 12.934 | 1.901 | 24.141 | 1.941 | 0.517 | 0.018 | 4.233 | 0.028 |
| plugin-block | ast | 16.825 | 1.667 | 28.276 | 1.676 | 0.386 | 0.023 | 0.860 | 0.034 |
| plugin-adjacent | html | 10.602 | 1.922 | 14.629 | 3.043 | 0.382 | 0.029 | 0.849 | 0.166 |
| plugin-adjacent | ast | 7.909 | 1.651 | 22.855 | 1.733 | 0.460 | 0.022 | 2.819 | 0.040 |
| plugin-contexts | html | 11.330 | 2.328 | 20.393 | 2.521 | 0.452 | 0.042 | 1.150 | 0.056 |
| plugin-contexts | ast | 6.785 | 2.080 | 15.728 | 2.241 | 0.453 | 0.052 | 1.234 | 0.065 |
| plugin-throwing | html | 6.223 | 1.435 | 10.613 | 1.934 | 0.408 | 0.037 | 2.443 | 0.054 |
| plugin-throwing | ast | 14.023 | 1.452 | 32.648 | 1.487 | 0.359 | 0.035 | 0.823 | 0.054 |
| combination-document | html | 11.763 | 3.405 | 25.761 | 4.008 | 1.220 | 0.161 | 2.095 | 0.220 |
| combination-document | ast | 18.994 | 3.049 | 34.358 | 3.414 | 1.648 | 0.129 | 2.569 | 0.200 |
| combination-contexts | html | 15.284 | 2.473 | 27.869 | 2.783 | 0.727 | 0.077 | 3.979 | 0.097 |
| combination-contexts | ast | 8.674 | 2.115 | 22.652 | 2.197 | 0.565 | 0.068 | 1.472 | 0.087 |
| long-ja-1000 | html | 21.181 | 3.211 | 27.489 | 3.858 | 7.418 | 0.258 | 13.018 | 0.360 |
| long-ja-1000 | ast | 21.413 | 3.319 | 33.187 | 3.428 | 6.332 | 0.195 | 7.220 | 0.521 |
| long-en-1000 | html | 19.552 | 3.407 | 22.860 | 4.967 | 4.669 | 0.160 | 7.165 | 0.373 |
| long-en-1000 | ast | 28.554 | 2.852 | 64.197 | 5.211 | 4.028 | 0.108 | 6.298 | 0.193 |
| long-mixed-1000 | html | 38.233 | 4.457 | 52.716 | 7.772 | 3.869 | 0.334 | 15.424 | 0.438 |
| long-mixed-1000 | ast | 24.253 | 4.008 | 46.483 | 4.458 | 3.951 | 0.253 | 6.158 | 0.311 |
| long-ja-10000 | html | 104.741 | 6.541 | 137.003 | 7.381 | 80.715 | 1.603 | 135.862 | 1.962 |
| long-ja-10000 | ast | 124.802 | 6.190 | 234.196 | 6.748 | 55.934 | 1.103 | 97.067 | 1.489 |
| long-en-10000 | html | 78.477 | 6.717 | 103.532 | 7.377 | 52.672 | 1.121 | 79.176 | 1.354 |
| long-en-10000 | ast | 76.458 | 6.848 | 85.345 | 8.091 | 43.129 | 0.802 | 65.202 | 1.131 |
| long-mixed-10000 | html | 97.566 | 10.792 | 170.439 | 12.453 | 42.754 | 1.520 | 85.487 | 3.940 |
| long-mixed-10000 | ast | 83.129 | 9.356 | 91.674 | 11.146 | 42.038 | 0.835 | 114.694 | 1.849 |
| long-ja-60000 | html | 488.318 | 19.632 | 934.287 | 33.702 | 469.183 | 6.780 | 601.758 | 10.236 |
| long-ja-60000 | ast | 269.650 | 23.976 | 344.972 | 38.803 | 218.914 | 5.765 | 302.603 | 8.956 |
| long-en-60000 | html | 180.843 | 23.989 | 188.431 | 27.356 | 155.087 | 8.293 | 197.885 | 14.174 |
| long-en-60000 | ast | 169.116 | 21.758 | 183.552 | 39.258 | 161.741 | 7.915 | 201.550 | 10.228 |
| long-mixed-60000 | html | 174.147 | 51.596 | 281.151 | 178.076 | 131.181 | 13.705 | 178.204 | 28.340 |
| long-mixed-60000 | ast | 242.136 | 38.554 | 281.298 | 59.086 | 140.737 | 4.832 | 157.306 | 11.357 |

</details>

## Delivery and remaining integration work

- src/parser.ts implements the scanner; asHTML/asAST/escapeHtml/exported parse implementations remain byte-for-byte unchanged. bench/results/rewrite-initial/ contains commands, raw outputs, supplementary checks and delivery tooling, and is outside src/; only compiled product code is shipped by the package files whitelist.
- package.json removes parsimmon and @types/parsimmon; name and version remain @minamorl/markdown-next 2.2.4. README changes only the Parsimmon sentence.
- Historical initial delivery: corpus/golden, legacy tests, bench files and lockfile retained their initial hashes. The lockfile follow-up is resolved below. No network transmission or npm publish was performed.
- Normal git add failed with read-only Git metadata (raw: bench/results/rewrite-initial/git-checkpoint.txt). checkpoint.cjs uses a private Git directory under TMPDIR and exports bench/results/rewrite-initial/rewrite.bundle with phase commits based on 55c0a76. It does not change the current worktree's HEAD/index or write shared Git metadata. The bundle requires that base commit and can be fetched into an integration checkout by the caller.
- Initial compatibility mismatches and lint errors are retained in first-attempt logs; final gate logs supersede them. Existing lint warnings in test/test-parser.ts remain untouched.
- Checkpoint review requested of caller, before expensive execution: confirm unchanged benchmark/golden logic, preflight hashes and completed characterization gates. No review broker was invoked in this no-review run.
- Checkpoint review requested of caller, at lane end: independently inspect scanner compatibility, raw comparison/provenance, scope hashes, lockfile follow-up and bundle before integration/release. No child agent was started here.


## Follow-up: security, consumer examples and install integrity

The caller accepted initial rewrite eb825d9 and authorized these changes. All initial evidence has moved, byte-for-byte, from src/rewrite-evidence/ to bench/results/rewrite-initial/. Scripts and embedded paths in that archive describe the original run; they are historical evidence, not current validation entrypoints. src/ now contains only parser.ts. Current commands and outputs are in bench/followup/.

Decisions:

- Encode `&`, `<`, `>` in Markdown code span/fence HTML output only; quotes remain literal in a text node. The built-in asHTML mapper (including a spread-copy exporter) receives escaped code text. AST/custom exporters keep source text. Raw HTML, including a literal HTML code element, keeps passthrough behavior. Untrusted input still requires sanitization; code encoding does not sanitize URLs or plugin output.
- Export ASTNode as a type only. It includes null children and recursively nested join groups as actually emitted. No runtime export or AST result changes.
- Correct both heading examples to their existing plain-text heading plus following paragraph. The React example distinguishes an element tuple from a group of children and handles null; this fixes example rendering, without changing the parser. Every README TypeScript/TSX block is compiled as an isolated consumer against lib/src/parser.d.ts. Its runtime expressions and four React component examples are compared with test/readme-expected.json. The shell install example is checked as a command string, not executed over the network; pure type declarations have no runtime output.
- Use real React 19.2.4 and @types/react 19.2.14 as development dependencies for these consumer tests (transitive csstype 3.2.3); no production dependency is added. The installed official React declarations for ReactNode/createElement and local TypeScript declarations/compiler are the API source read. Everything was available in the local package store; no network request was made.
- Synchronize lockfile by removing the two obsolete Parsimmon importer/package/snapshot entries. An offline full resolution first failed on missing registry metadata for already-locked @pkgjs/parseargs. Existing development resolutions are preserved; pnpm generated the three React test-package resolutions in an isolated TMPDIR project, which were merged into the lockfile. The actual worktree then completed pnpm install --offline --frozen-lockfile --frozen-store --ignore-scripts --trust-lockfile with no resolution/download. Frozen-store prevents writes to the shared store. Version remains 2.2.4.
- The benchmark metadata now allows an absent Parsimmon package and records null. This is the only harness logic change; timing, sample counts, workers, percentile calculations and per-sample golden checks are unchanged. The original baseline and first scanner measurements are preserved.

### Complete permitted golden change list

Only fence-html / html.value changes. Its input is:

````text
```html
<script>&</script>
```
````

Old HTML:

```html
<pre data-language="html"><code><script>&</script></code></pre>
```

New HTML:

```html
<pre data-language="html"><code>&lt;script&gt;&amp;&lt;/script&gt;</code></pre>
```

bench/followup/security-golden.cjs independently applies text encoding only to the accepted scanner's two Markdown-code productions, and compares every current output. It also checks the entire saved golden against that permitted result. Every AST entry, plugin trace, diagnostic, status, corpus and other golden field remains identical. The precise input/before/after data is in bench/followup/golden-code-escaping.json. test/security.test.cjs adds coverage for code spans/fences, longer backtick runs, list/quote/table contexts, closing-tag injection, entity double encoding, raw AST/custom exporters, spread-copy asHTML and deliberate HTML passthrough.

### Current gate results

Pending final command outputs and full benchmark. No agent-lane-review broker is called. Before-expensive-run review requested of caller: independently check the single-field golden diff, security reference, consumer snapshots and unchanged benchmark timing logic. End-of-lane review requested of caller: verify artifact scope, install integrity, output safety, performance/provenance and Git delivery before release.
