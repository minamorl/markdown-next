const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parse, Parser, asAST, asHTML } = require('../lib/src/parser.js');
const text = '</code><script>alert("x")</script>&lt;&\'"';
const escaped = '&lt;/code&gt;&lt;script&gt;alert("x")&lt;/script&gt;&amp;lt;&amp;\'"';

test('Markdown code spans and fences encode literal HTML text', () => {
  assert.equal(parse('`' + text + '`'), '<p><code>' + escaped + '</code></p>');
  assert.equal(parse('```html\n' + text + '\n```'), '<pre data-language="html"><code>' + escaped + '</code></pre>');
  assert.equal(parse('`` ' + text + '` ``'), '<p><code>' + escaped + '`</code></p>');
  assert.equal(parse('- `' + text + '`'), '<ul><li><code>' + escaped + '</code></li></ul>');
  assert.equal(parse('> `' + text + '`'), '<blockquote><code>' + escaped + '</code></blockquote>');
  assert.equal(parse('| `' + text + '` |\n|-|\n| `<img onerror=x>` |'), '<table><tr><th><code>' + escaped + '</code></th></tr><tr><td><code>&lt;img onerror=x&gt;</code></td></tr></table>');
});

test('AST code text and custom exporters retain unescaped source', () => {
  const parser = new Parser({ export: asAST });
  assert.deepStrictEqual(parser.parse('`' + text + '`'), [['p', null, [['code', null, text]]]]);
  assert.deepStrictEqual(parser.parse('```\n' + text + '\n```'), [['pre', null, ['code', null, text]]]);
  const nodes = [];
  new Parser({ export: { ...asAST, mapper: (tag, attrs) => content => { nodes.push([tag, content]); return asAST.mapper(tag, attrs)(content); } } }).parse('`<x>&`');
  assert.deepStrictEqual(nodes.find(node => node[0] === 'code'), ['code', '<x>&']);
  assert.equal(new Parser({ export: { ...asHTML } }).parse('`<x>&`'), '<p><code>&lt;x&gt;&amp;</code></p>');
});

test('raw HTML passthrough is intentional, including raw HTML code elements', () => {
  assert.equal(parse('<script>alert(1)</script>'), '<p><script>alert(1)</script></p>');
  assert.equal(parse('<code><b>x</b>&</code>'), '<p><code><b>x</b>&</code></p>');
  assert.equal(parse('[x](javascript:alert(1))'), '<p><a href="javascript:alert(1">x</a>)</p>');
});
