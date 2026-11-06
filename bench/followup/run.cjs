/* global process */
// Local evidence recorder; does not alter command output or exit status.
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const [file, command, ...args] = process.argv.slice(2);
const out = fs.createWriteStream(file);
const env = { ...process.env, npm_config_update_notifier: 'false', npm_config_offline: 'true', npm_config_cache: process.env.TMPDIR + '/npm-followup-cache' };
out.write(`command: ${JSON.stringify([command, ...args])}\nenvironment: ${JSON.stringify({NODE_OPTIONS: process.env.NODE_OPTIONS || "", pnpm_config_verify_deps_before_run: process.env.pnpm_config_verify_deps_before_run || "", npm_config_update_notifier: env.npm_config_update_notifier, npm_config_offline: env.npm_config_offline, npm_config_cache: env.npm_config_cache})}\n`);
const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => { process.stdout.write(chunk); out.write(chunk); });
child.on('error', error => { out.write(String(error)); });
child.on('close', (code, signal) => { out.end(`\nexit_code: ${code}; signal: ${signal}\n`, () => { process.exitCode = code ?? 1; }); });
