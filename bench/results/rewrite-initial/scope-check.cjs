/* global console */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const git = args => execFileSync('git', args, { encoding: 'utf8' });
const changed = [...git(['diff', '--name-only', 'HEAD']).trim().split('\n'), ...git(['ls-files', '--others', '--exclude-standard']).trim().split('\n')].filter(Boolean);
for (const file of changed) assert.ok(file.startsWith('src/') || ['README.md', 'package.json', 'docs/rewrite.md'].includes(file), file);
assert.equal(git(['diff', 'HEAD', '--', 'bench/', 'test/', 'pnpm-lock.yaml']), '');
const oldPackage = JSON.parse(git(['show', '55c0a76:package.json']));
delete oldPackage.dependencies.parsimmon;
delete oldPackage.dependencies['@types/parsimmon'];
assert.deepStrictEqual(JSON.parse(fs.readFileSync('package.json', 'utf8')), oldPackage);
assert.equal(fs.readFileSync('README.md', 'utf8'), git(['show', '55c0a76:README.md']).replace('Built with [Parsimmon](https://github.com/jneen/parsimmon).', 'Built with a hand-written scanner.'));
assert.equal(git(['diff', '--check']), '');
console.log('All tracked/untracked changes are inside the assigned source/document/manifest scope.');
console.log('bench/, test/ and pnpm-lock.yaml have no diff; manifest differs only by the two removed dependencies; README differs only by the Parsimmon sentence.');
console.log('git diff --check: clean.');
