/* global process, console, fetch, WebSocket, setTimeout, Buffer */
// Real Chromium input/clipboard checks through the documented DevTools Protocol.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(process.env.TMPDIR, 'markdown-next-chromium-'));
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8');
  fs.createReadStream(file).pipe(res);
});
let browser, socket;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(process.env.CHROMIUM || 'chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { env: { ...process.env, XDG_CACHE_HOME: profile, XDG_CONFIG_HOME: profile }, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr.on('data', chunk => { stderr += chunk; });
  browser.on('error', error => { stderr += error.message; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !fs.existsSync(portFile) && browser.exitCode === null; i++) await pause(50);
  assert.ok(fs.existsSync(portFile), stderr);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map(), errors = [];
  let sequence = 0;
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown' || (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')) errors.push(message);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await send('Page.navigate', { url: origin + '/examples/index.html' });
  for (let i = 0; i < 100; i++) {
    if (await evaluate('document.readyState === "complete" && !!document.getElementById("textarea")')) break;
    await pause(50);
  }
  const version = await send('Browser.getVersion');
  console.log('Chromium: ' + version.product);
  console.log('Page: /examples/index.html (local HTTP, built examples/dist/bundle.js)');
  await evaluate(`window.inputEvents = []; document.getElementById('textarea').addEventListener('input', e => inputEvents.push({ trusted: e.isTrusted, type: e.inputType })); document.getElementById('textarea').focus();`);
  const snapshot = () => evaluate(`({value: document.getElementById('textarea').value, html: document.getElementById('preview').innerHTML, events: inputEvents})`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', text: 'a', unmodifiedText: 'a', windowsVirtualKeyCode: 65 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  let state = await snapshot();
  assert.equal(state.value, 'a'); assert.equal(state.html, '<p>a</p>');
  console.log('typing first character: ' + JSON.stringify(state));
  await send('Input.insertText', { text: 'b' });
  state = await snapshot();
  assert.equal(state.value, 'ab'); assert.equal(state.html, '<p>ab</p>');
  console.log('typing next character: ' + JSON.stringify(state));
  await evaluate(`navigator.clipboard.writeText(' 貼り付け **bold**')`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers: 2, windowsVirtualKeyCode: 86 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers: 2, windowsVirtualKeyCode: 86 });
  for (let i = 0; i < 100; i++) { state = await snapshot(); if (state.value.includes('貼り付け')) break; await pause(20); }
  assert.equal(state.value, 'ab 貼り付け **bold**');
  assert.equal(state.html, '<p>ab 貼り付け <strong>bold</strong></p>');
  assert.ok(state.events.some(event => event.trusted && event.type === 'insertFromPaste'));
  console.log('real clipboard Ctrl+V: ' + JSON.stringify(state));
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'sample.png'), Buffer.from(screenshot.data, 'base64'));
  assert.deepStrictEqual(errors, []);
  console.log('screen_run: Chromium opened /examples/index.html; key input updated immediately; real clipboard Ctrl+V rendered bold text; no console errors.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close();
  if (browser && browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    browser.kill('SIGTERM'); await exited;
  }
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
