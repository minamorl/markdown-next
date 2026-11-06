/* global process, console */
// Supplementary deterministic differential checks. Frozen corpus/golden stay read-only.
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual, format } = require('node:util');
const ts = require('typescript');
const source = execFileSync('git', ['show', '55c0a76:src/parser.ts'], { encoding: 'utf8' });
const old = new Module(path.join(process.cwd(), 'lib/src/baseline.cjs'));
old.filename = old.id;
old.paths = Module._nodeModulePaths(path.join(process.cwd(), 'lib/src'));
old._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 } }).outputText, old.filename);
const current = require('../../lib/src/parser.js');
function outcome(api, input, mode) {
  const calls = [], diagnostics = [];
  const original = console.error;
  console.error = (...args) => diagnostics.push(format(...args));
  const plugins = { probe: (args, content, mapper, join) => {
    calls.push([args, content]);
    return mapper('probe', { args, sequence: calls.length })(join([content, '!']));
  } };
  try { return { value: new api.Parser({ export: api[mode], plugins }).parse(input), calls, diagnostics }; }
  catch (error) { return { error: { name: error.name, message: error.message }, calls, diagnostics }; }
  finally { console.error = original; }
}
let seed = 0x173287;
const random = n => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
const tokens = ['a', 'Z', '=', '-', '<', '>', '_', '*', '**', '__', ' ', '\n', '\r', '\r\n', '\t', '　', '漢', '｜字《じ》', '｜', '《', '》', '$', '$$', '[x](u)', '![x](u)', '[^1]', '[^2]: ', '@[probe:x]', '@[missing:x]', '@', '[', ']', '(', ')', ':', '`', '``', '```', '````', '|', '\\|', '#', '# ', '- ', '2. ', '> ', '<b>x</b>', '<br>', '<i>', '</i>', '<br/>', '<b a="x">', '\u2028', '\u2029', '\0', '😀'];
const focused = [
  'a\u2028b', 'a<\u2028', 'a=\u2028', '\u2028*',
  '```\n```tail', '```\nx\n```tail', '```\n```\n', '````\nx\n```\n````',
  '# h- x', '# h*- x', 'a\n@[probe:x]', 'a\n@[probe:x]\n',
  '|a|\n|-|\n|`|x|', '|x|\n|bad|\n', '## h`a`- item',
];
let comparisons = 0, failures = 0;
for (let n = -focused.length; n < Number(process.env.DIFFERENTIAL_CASES || 5000); n++) {
  let input = n < 0 ? focused[n + focused.length] : '';
  if (n >= 0) for (let j = random(18) + 1; j > 0; j--) input += tokens[random(tokens.length)];
  for (const mode of ['asHTML', 'asAST']) {
    const expected = outcome(old.exports, input, mode), actual = outcome(current, input, mode);
    comparisons++;
    if (!isDeepStrictEqual(expected, actual)) {
      failures++;
      console.log(JSON.stringify({ n, input, mode, expected, actual }));
      if (failures >= 12) { console.log({ comparisons, failures }); process.exit(1); }
    }
  }
}
console.log({ comparisons, failures });
if (failures) process.exitCode = 1;
