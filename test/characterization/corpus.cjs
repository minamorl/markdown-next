// Deliberately deterministic: no random data, clock, network, or locale inputs.
const cases = [];
function add(id, input, category = 'boundary', plugins = 'none') {
  cases.push({ id, input, category, plugins });
}

for (const [id, input] of Object.entries({
  empty: '', spaces: ' \t\r\n ', fullwidth: '　段落\n\n　次の段落　',
  cr: 'a\rb', crlf: '# heading\r\n\r\n段落\r\n次',
  nul: 'a\u0000b', unicode: '日本語😀 café e\u0301\u2028終わり',
  'heading-no-space': '#見出し', 'heading-seven': '####### heading',
  'heading-inline': '# **bold** ｜漢字《かんじ》', 'setext-empty': '\n===',
  'setext-dashes': 'text\n---\nnext', 'horizontal-rule': '---\n\n***',
  'emphasis-crossed': '**strong__ _em*', 'emphasis-nested': '**a *b* c**',
  'emphasis-unclosed': '*a **b __c _d',
  'ruby-valid': '前｜漢字《かんじ》後', 'ruby-ascii-pipe': '|漢字《かんじ》',
  'ruby-empty-base': '｜《よみ》', 'ruby-empty-reading': '｜漢字《》',
  'ruby-unclosed': '｜漢字《かんじ', 'ruby-newline': '｜漢\n字《かんじ》',
  'ruby-nested': '｜**漢字**《かんじ》', 'ruby-double': '｜山《やま》｜川《かわ》',
  'html-attrs': '<div class="x" data-id="1">text</div>',
  'html-mismatch': '<b class="x">text</i>', 'html-unclosed': '<div><b>x</b>',
  'html-selfclosing': '<br><hr /><img src="x" />', 'html-comment': '<!-- comment -->',
  'html-case': '<DIV>x</div>', 'html-script': '<script>alert("x")</script>',
  'html-entities': '&amp; < > " \'', 'html-nested': '<div>a<span>b</span>c</div>',
  'link-attrs': '["<&](a"b&c)', 'link-unclosed': '[label](url',
  'link-empty': '[]() ![]()', 'link-parens': '[a](a(b)c)',
  'plugin-unknown': 'before @[missing:x:y] after',
  'plugin-block-unknown': '@[missing:a:b]\n  content\n  次の行',
  'plugin-malformed': '@[x:abc @[123:x] @[x',
  'footnote-missing': '参照[^99] と [^abc]',
  'footnote-duplicate': 'x[^2] [^02]\n\n[^2]: first\n[^2]: second\n[^02]: zero',
  'footnote-order': '[^10]: ten\n[^2]: two\n[^1]: one',
  'footnote-empty': '[^1]:\n\nend',
  'footnote-markup': 'x[^1]\n\n[^1]: **bold** ｜字《じ》 <b>x</b>',
  'math-unclosed': '$x $$y', 'math-empty': '$$\n$$',
  'list-indent': '- a\n   - odd\n  - even\n- last',
  'list-kind-switch': '- a\n1. b\n  - c\n2. d',
  'quote-depth': '> a\n> > > b\n> c\n> > d',
  'fence-unclosed': 'before\n```js\nx', 'fence-short-close': '````\nx\n```',
  'fence-tilde': '~~~js\nx\n~~~', 'fence-empty': '```\n```',
  'fence-html': '```html\n<script>&</script>\n```',
  'fence-tail': '```js\nx\n```tail', 'fence-crlf': '```js\r\nx\r\n```',
  'table-invalid-separator': '| a | b |\n| x | y |\n| c | d |',
  'table-no-body': '| a |\n|---|',
  'table-mismatch': '| a | b |\n|---|---|\n| c |\n| d | e | f |',
  'table-align': '| a | b | c |\n|:--|:-:|--:|\n|1|2|3|',
  'table-empty': '| | |\n|-|-|\n| | |',
  'table-pipe': '| a | b |\n|-|-|\n| `a|b` | c |',
  'table-escape': '| a | b |\n|-|-|\n| `` a\\|b `` | c |',
  'table-double-slash': '| a | b |\n|-|-|\n| a\\\\|b | c |',
  'table-triple-slash': '| a | b |\n|-|-|\n| a\\\\\\|b | c |',
  'table-no-pipes': 'a | b\n---|---\nc | d',
  'table-unclosed-code': '| a | b |\n|-|-|\n| `x | ** |',
})) add(id, input);

for (let run = 1; run <= 6; run++) {
  const ticks = '`'.repeat(run);
  add(`ticks-${run}-equal`, `${ticks} a\`b ${ticks}`);
  add(`ticks-${run}-unequal`, `${ticks}a${ticks}\`b`);
  add(`ticks-${run}-unclosed`, `${ticks}abc`);
  add(`ticks-${run}-spaces`, `${ticks}   ${ticks}`);
}
for (const [id, input] of Object.entries({
  inline: 'a @[probe:x:y] b @[probe] c',
  block: '@[probe:x:y]\n  first\n  二行目\n\nafter',
  adjacent: '@[probe:a]@[probe:b]',
  contexts: '> @[probe:q]\n\n- @[probe:l]\n\n| @[probe:h] |\n|-|\n| @[probe:c] |',
  throwing: 'a @[explode:x] b',
})) add(`plugin-${id}`, input, 'plugin', 'probe');

const mixed = '# 見出し heading\n\n　日本語と English **bold** ｜漢字《かんじ》 [link](https://example.invalid) [^2]\n\n'
  + '> quote `code` <b>HTML</b> $x+y$\n\n- one\n  - two\n\n'
  + '| a | b |\n|---|---|\n| `` a\\|b `` | z |\n\n```js\nconst x = 1;\n```\n\n'
  + '@[missing:arg]\n\n[^2]: note\n\n';
add('combination-document', mixed, 'combination');
add('combination-contexts', '# ｜字《じ》\n\n> ｜字《じ》 [^1]\n\n- ｜字《じ》 [^1]\n\n| ｜字《じ》 | [^1] |\n|-|-|\n| <b>x</b> | $x$ |\n\n[^1]: note', 'combination');
for (const size of [1000, 10000, 60000]) {
  for (const [language, seed] of [
    ['ja', '　日本語の段落です。｜漢字《かんじ》と **強調** を含みます。\n\n'],
    ['en', 'A paragraph with **bold**, `code`, and [a link](https://example.invalid).\n\n'],
    ['mixed', mixed],
  ]) add(`long-${language}-${size}`, seed.repeat(Math.ceil(size / seed.length)).slice(0, size), 'long');
}
module.exports = { cases };
