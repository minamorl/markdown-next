# Restore the Minamorl package scope

Code-first scope restoration against fcea453. The version remains 2.3.0.

Visible decisions:

- Restore the package name, README heading/install/import examples, and README consumer test expectations to @minamorl/markdown-next.
- Add publishConfig.registry = https://registry.npmjs.org/ and publishConfig.access = public. No user npm configuration is modified.
- Update only the README.md and package.json entries in bench/prepublish/measurement-input-hashes.json. Both existing verifiers continue to check that manifest. Historical manifests remain historical.
- Normalize package scope labels in existing prepublication text logs to satisfy the requested removal of all old scoped-name occurrences. Each edited historical log has an annotation disclosing this transformation. Their original measurements, tarball filenames and recorded digests remain historical values; these logs do not represent a new execution.

Verification commands, stdout/stderr and exit codes are in test.txt, characterization.txt, bench-verify.txt, verify-raw.txt, lint.txt and pack.txt. All commands used pnpm_config_verify_deps_before_run=false and a temporary npm cache under TMPDIR. Dependencies were already installed; no install was needed. lint.txt records the two existing unused-argument warnings. pack.txt records npm pack --dry-run, not a publication or generated tarball.

scope-check.txt records the package metadata, absence of the former scoped name in tracked files, the two changed manifest entries, and hashes confirming unchanged parser sources, lockfile, historical manifest, measurement JSON and journals. No measurements were rerun. No runtime or UI behavior changed.

Primary source read: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#publishconfig

No broker review checkpoint was invoked, as explicitly requested for this no-review assignment. Caller review targets:

- Before costly execution: no new test harness/scorer or costly measurement was introduced; inspect that both verifiers retain their full raw-data checks and only the intended metadata hashes changed.
- Before external or destructive operations: no push, merge, npm publish or destructive action was performed; inspect the local commit/bundle before any later delivery.
- Before acceptance: inspect the scope/README/test diff, historical-log annotations, publication metadata, unchanged measurement hashes, exact command logs and bundle verification.
