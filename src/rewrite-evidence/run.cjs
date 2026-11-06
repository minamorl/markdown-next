/* global process, console */
// Local evidence recorder; does not alter command output or exit status.
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const [file, command, ...args] = process.argv.slice(2);
const out = fs.createWriteStream(file);
out.write(`command: ${JSON.stringify([command, ...args])}\n`);
const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => { process.stdout.write(chunk); out.write(chunk); });
child.on('error', error => { out.write(String(error)); });
child.on('close', (code, signal) => { out.end(`\nexit_code: ${code}; signal: ${signal}\n`, () => { process.exitCode = code ?? 1; }); });
