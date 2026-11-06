/* global process, console */
// Commit through a private Git directory; never write the worktree's shared metadata.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = process.cwd();
const state = path.join(process.env.TMPDIR, 'markdown-next-followup-git');
const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options });
const common = path.resolve(root, git(['rev-parse', '--git-common-dir']).trim());
const env = { ...process.env, GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(common, 'objects'),
  GIT_AUTHOR_NAME: 'markdown-next rewrite', GIT_AUTHOR_EMAIL: 'rewrite@localhost',
  GIT_COMMITTER_NAME: 'markdown-next rewrite', GIT_COMMITTER_EMAIL: 'rewrite@localhost' };
if (!fs.existsSync(state)) {
  git(['init', '--bare', state]);
  fs.writeFileSync(path.join(state, 'objects/info/alternates'), path.join(common, 'objects') + '\n');
  const base = git(['rev-parse', 'HEAD']).trim();
  git(['--git-dir=' + state, 'update-ref', 'refs/heads/followup', base], { env });
  git(['--git-dir=' + state, 'read-tree', base], { env });
}
const args = ['--git-dir=' + state, '--work-tree=' + root];
const parent = git([...args, 'rev-parse', 'refs/heads/followup'], { env }).trim();
// Optional explicit paths permit an inventory-only first checkpoint.
const paths = process.argv.slice(3);
git([...args, 'add', '--', ...(paths.length ? paths : ['src', 'bench', 'test', 'package.json', 'pnpm-lock.yaml', 'README.md', 'docs/rewrite.md']), ':(glob,exclude)bench/**/*.bundle', ':!bench/followup/git-delivery.txt'], { env });
const tree = git([...args, 'write-tree'], { env }).trim();
const commit = git([...args, 'commit-tree', tree, '-p', parent], { env, input: process.argv[2] + '\n' }).trim();
git([...args, 'update-ref', 'refs/heads/followup', commit], { env });
const bundle = path.join(root, 'bench/followup/followup.bundle');
// Exclude already delivered bundles/logs from subsequent snapshots to avoid recursion.
git([...args, 'bundle', 'create', bundle, 'refs/heads/followup', '^' + git(['rev-parse', 'HEAD']).trim()], { env });
console.log('commit: ' + commit);
console.log(git([...args, 'bundle', 'verify', bundle], { env }));
console.log(git([...args, 'log', '--oneline', '-4', 'refs/heads/followup'], { env }));
