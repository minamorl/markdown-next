# 2.3.0 prepublication corrections

This code-first worker changed only its assigned worktree. No broker checkpoint, child agent, external delivery, push, merge or npm publish was invoked. The caller owns independent final verification and release.

Changes and visible decisions:

- HTML passthrough now passes attributes to both the HTML and AST exporters, in source order. Quoted, unquoted and boolean values are accepted. HTML entity values decode once and serialize escaped; boolean values are empty strings. Duplicate attribute names retain their first spelling/value, ignoring case. Numeric attribute names retain order too. Event handlers and dangerous URLs intentionally remain unsanitized; README explicitly requires sanitizing untrusted attributes.
- The WHATWG entity table is vendored in src/html-entities.ts, with source URL and source hash in its header. No package dependency or lockfile changed.
- Attribute-bearing br/hr tags are supported. Attribute-free HTML grammar and output remain unchanged. Mismatched-tag AST nodes remain text groups, with the opening tag now retaining escaped attributes.
- Complete frozen-output changes are html-attrs and html-mismatch, listed with old/new HTML and AST in docs/rewrite.md before updating golden.json. The original golden metadata is historical provenance, not the current parser hash. verify-attributes.cjs reconstructs and checks the full pre-fix golden hash, loads the hash-pinned pre-fix scanner, and compares all frozen inputs plus generated attribute-free combinations. The historical code-escaping gate reverses this separate migration before checking its original proof.
- The sample listens for input. browser.cjs runs the actual built sample in Chromium and checks trusted key entry plus an actual clipboard Ctrl+V paste. browser.txt records the input events and rendered HTML; sample.png records the screen.
- Both bench verifiers now validate the new benchmark.json and its journal against current artifacts and measurement-input-hashes.json. Historical baseline.json and rewrite-secure.json, their journals and old manifests remain unchanged. New raw records source/compiled entity-table hashes. Old/new runtime equality is no longer an acceptance requirement: these commands verify current-run integrity and do not claim causal speedup. Sample counts and warmup still match the baseline.

Evidence files contain exact commands, stdout/stderr and exit codes. test-first-attempt.txt preserves the initial pnpm failure: its automatic dependency check tried to open a store database outside the writable scope. The successful npm test run used pnpm_config_verify_deps_before_run=false with the already installed dependencies. Dependencies were not reinstalled. Lint's two unused-argument warnings predate these changes. Generated build output remains ignored by Git and is reproduced by npm run build.

Git's normal index is outside the writable scope and refused index.lock creation. Local phase commits use .prepublish-delivery-git inside the worktree; prepublish-fixes.bundle is an incremental delivery against main 81232764c7fbbfb6e1579042de488a15e70445d2. The bundle and git-delivery.txt are excluded from the committed tree to avoid self-reference. git-delivery.txt contains exact commit IDs, bundle verification and working-tree comparison.

Review checkpoints requested for caller verification (this no-review run has no broker):

- Before the expensive measurement: confirm that the new verification target retains source/package/README/hash drift detection, raw output digest checks, independent quantile calculations and complete journal checks.
- Before any external or destructive operation: none was performed in this run; publication remains the caller's action.
- Before acceptance: independently inspect attribute quoting/entity decoding and order, both documented golden migrations, attribute-free equality, final command logs, package contents and the Chromium screenshot/input/paste record.

screen_run: Chromium opened /examples/index.html; first-character and subsequent input updated immediately; real clipboard Ctrl+V rendered pasted Markdown; no console errors. See browser.txt and sample.png.
