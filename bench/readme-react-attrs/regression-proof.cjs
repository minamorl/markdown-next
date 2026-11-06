/* global console, __dirname */
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { exerciseReadme } = require('../../test/readme.test.cjs');

const root = path.resolve(__dirname, '../..');
const before = execFileSync('git', ['show', '1e49aa9:README.md'], { cwd: root, encoding: 'utf8' });
const source = before.match(/^```tsx\n([\s\S]*?)^```/m)[1];
const filename = path.join(root, 'before-readme-example.cjs');
const sample = new Module(filename);
sample.filename = filename;
sample.paths = Module._nodeModulePaths(root);
const ordinaryRequire = sample.require.bind(sample);
sample.require = name => name === '@minamorl/markdown-next' ? require('../../lib/src/parser.js') : ordinaryRequire(name);
sample._compile(ts.transpileModule(source + '\nexports.Markdown = Markdown;\n', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText, filename);

const content = '<span style="color:red">red</span>';
assert.throws(() => renderToStaticMarkup(React.createElement(sample.exports.Markdown, { content })), error => {
  console.log('Before (README at 1e49aa9): ' + error.message);
  return /style.*expects a mapping/.test(error.message);
});
let rendered = false;
exerciseReadme(Markdown => {
  const html = renderToStaticMarkup(React.createElement(Markdown, { content }));
  assert.equal(html, '<p><span style="color:red">red</span></p>');
  console.log('After (current README, consumer typechecked): ' + html);
  rendered = true;
});
assert.equal(rendered, true);
