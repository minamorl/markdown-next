/* global process, console */
// Commit through a private Git directory; never write the worktree's shared metadata.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = process.cwd();
const state = path.join(process.env.TMPDIR, 'markdown-next-rewrite-git');
const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options });
const common = path.resolve(root, git(['rev-parse', '--git-common-dir']).trim());
const env = { ...process.env, GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(common, 'objects'),
  GIT_AUTHOR_NAME: 'markdown-next rewrite', GIT_AUTHOR_EMAIL: 'rewrite@localhost',
  GIT_COMMITTER_NAME: 'markdown-next rewrite', GIT_COMMITTER_EMAIL: 'rewrite@localhost' };
if (!fs.existsSync(state)) {
  git(['init', '--bare', state]);
  fs.writeFileSync(path.join(state, 'objects/info/alternates'), path.join(common, 'objects') + '\n');
  const base = git(['rev-parse', 'HEAD']).trim();
  git(['--git-dir=' + state, 'update-ref', 'refs/heads/rewrite', base], { env });
  git(['--git-dir=' + state, 'read-tree', base], { env });
}
const args = ['--git-dir=' + state, '--work-tree=' + root];
const parent = git([...args, 'rev-parse', 'refs/heads/rewrite'], { env }).trim();
// Optional explicit paths permit an inventory-only first checkpoint.
const paths = process.argv.slice(3);
git([...args, 'add', '--', ...(paths.length ? paths : ['src', 'package.json', 'README.md', 'docs/rewrite.md']), ':!src/rewrite-evidence/*.bundle', ':!src/rewrite-evidence/git-delivery.txt'], { env });
const tree = git([...args, 'write-tree'], { env }).trim();
const commit = git([...args, 'commit-tree', tree, '-p', parent], { env, input: process.argv[2] + '\n' }).trim();
git([...args, 'update-ref', 'refs/heads/rewrite', commit], { env });
const bundle = path.join(root, 'src/rewrite-evidence/rewrite.bundle');
// Exclude already delivered bundles/logs from subsequent snapshots to avoid recursion.
git([...args, 'bundle', 'create', bundle, 'refs/heads/rewrite', '^' + git(['rev-parse', 'HEAD']).trim()], { env });
console.log('commit: ' + commit);
console.log(git([...args, 'bundle', 'verify', bundle], { env }));
console.log(git([...args, 'log', '--oneline', '-4', 'refs/heads/rewrite'], { env }));
