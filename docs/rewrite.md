# Scanner rewrite

## State and scope

Code-first; no domain spec covers this rewrite. Work stays in this worktree. Runtime exports and mapper/join/postprocess behavior remain unchanged. Frozen corpus, golden, legacy tests, bench harness and lockfile are read-only. Version stays 2.2.4. No network, publish, child agents or review broker.

Phase 1: inventory and baseline. Phase 2: scanner and exact compatibility. Phase 3: dependency removal, build/lint, unchanged benchmark harness, raw comparison. Evidence and recoverable raw are in src/rewrite-evidence/. Git checkpoints are attempted per phase; restricted Git metadata writes fall back to a local bundle.

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

Phase 2: exact 1,722 comparisons and 178 legacy tests matched. Supplementary seeded differential checks compare the old source loaded from Git with the scanner, including stateful plugin return values and unusual line terminators. See raw command logs under src/rewrite-evidence/. No frozen test input or expected output changed. Review checkpoints are handled by the caller after this no-review run; no broker is invoked.
