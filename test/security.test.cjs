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

test('HTML attributes retain order, decoded values and exporter access', () => {
  const input = `<a href="https://example.com?a=1&amp;b=2" class='x' title='a > b &quot;c&quot;' data-plain=value disabled>x</a>`;
  const attrs = { href: 'https://example.com?a=1&b=2', class: 'x', title: 'a > b "c"', 'data-plain': 'value', disabled: '' };
  assert.equal(parse(input), '<p><a href="https://example.com?a=1&amp;b=2" class="x" title="a &gt; b &quot;c&quot;" data-plain="value" disabled="">x</a></p>');
  assert.deepStrictEqual(new Parser({ export: asAST }).parse(input), [['p', null, [['a', attrs, 'x']]]]);
  const seen = [];
  new Parser({ export: { ...asAST, mapper: (tag, attributes) => content => {
    if (tag === 'a') seen.push(attributes);
    return asAST.mapper(tag, attributes)(content);
  } } }).parse(input);
  assert.deepStrictEqual(seen, [attrs]);
});

test('attribute decoding follows HTML named and numeric reference rules without double escaping', () => {
  const input = `<a title="&amp;&quot;&apos;&lt;&gt;&nbsp;&copy;&NotEqualTilde;&#65;&#x1F600;&#0;&#xD800;&#x110000;&#128;|&amp test|&amp=1|&notit;|&unknown;|&amp;quot;">x</a>`;
  const expected = '&"\'<>\u00a0©≂̸A😀���€|& test|&amp=1|&notit;|&unknown;|&quot;';
  const attrs = new Parser({ export: asAST }).parse(input)[0][2][0][1];
  assert.equal(attrs.title, expected);
  assert.match(parse(input), /&amp;quot;/);
  assert.equal(parse(`<a title='" onmouseover="x'>&</a>`), '<p><a title="&quot; onmouseover=&quot;x">&</a></p>');
});

test('nested, boolean, duplicate, numeric and special attribute names are retained safely', () => {
  assert.equal(parse('<a href="https://example.com" class="x">x</a>'), '<p><a href="https://example.com" class="x">x</a></p>');
  assert.equal(parse('<div hidden><b data-x="a\'b">x</b><br class=x /><hr id=y></div>'), '<p><div hidden=""><b data-x="a&#39;b">x</b><br class="x" /><hr id="y" /></div></p>');
  const input = '<a z=0 2=two 1=one __proto__=safe constructor=c HREF=first href=second>x</a>';
  const attrs = new Parser({ export: asAST }).parse(input)[0][2][0][1];
  assert.deepStrictEqual(Object.keys(attrs), ['z', '2', '1', '__proto__', 'constructor', 'HREF']);
  assert.equal(Object.getPrototypeOf(attrs), Object.prototype);
  assert.equal(attrs.__proto__, 'safe');
  assert.equal(parse(input), '<p><a z="0" 2="two" 1="one" __proto__="safe" constructor="c" HREF="first">x</a></p>');
  assert.equal(parse('<a onclick="alert(1)" href="javascript:alert(1)">x</a>'), '<p><a onclick="alert(1)" href="javascript:alert(1)">x</a></p>');
  assert.equal(parse('<b title="&quot;">x</i>'), '<p><b title="&quot;">x</i></p>');
});

test('unterminated quotes never consume a later unrelated closing tag as an attribute', () => {
  assert.equal(parse('<a title="broken>x</a>'), '<p><a title="broken>x</a></p>');
  assert.equal(parse('<b></b>'), '<p><b /></p>');
  assert.equal(parse('<br/> <hr />'), '<p><br /> <hr /></p>');
});
