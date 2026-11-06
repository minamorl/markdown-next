/* global process, console, __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const [name, command, ...args] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(name || '') || !command) throw new Error('Usage: check.cjs name command [args...]');
const result = spawnSync(command, args, { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const output = `command: ${JSON.stringify([command, ...args])}\nenvironment: ${JSON.stringify({ pnpm_config_verify_deps_before_run: process.env.pnpm_config_verify_deps_before_run || '' })}\n${result.stdout || ''}${result.stderr || ''}\nexit_code: ${result.status}; signal: ${result.signal}\n${result.error ? result.error.stack + '\n' : ''}`;
fs.writeFileSync(path.join(__dirname, name + '.txt'), output);
console.log(output.split('\n').slice(-14).join('\n'));
process.exitCode = result.status === 0 ? 0 : 1;
