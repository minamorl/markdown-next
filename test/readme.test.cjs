/* global process, __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');

function instrument(source, filename) {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  for (const statement of file.statements) {
    if (ts.isExpressionStatement(statement)) edits.push(statement.expression);
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      const value = declaration.initializer;
      if (value && ts.isCallExpression(value) && (value.expression.getText(file) === 'parse' || value.expression.getText(file).endsWith('.parse'))) edits.push(value);
    }
  }
  for (const expression of edits.reverse()) {
    const start = expression.getStart(file), end = expression.end;
    source = source.slice(0, start) + '__readmeCapture(' + source.slice(start, end) + ')' + source.slice(end);
  }
  return 'export {};\ndeclare function __readmeCapture<T>(value: T): T;\n' + source;
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!React.isValidElement(value)) return value;
  const { children, ...props } = value.props;
  return { tag: value.type === React.Fragment ? 'fragment' : value.type, key: value.key, props, children: normalize(children === undefined ? null : children) };
}

function exerciseReadme() {
  const markdown = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const blocks = [...markdown.matchAll(/^```(\w+)\n([\s\S]*?)^```/gm)].map((match, index) => ({ index, language: match[1], code: match[2] }));
  assert.ok(blocks.length > 0);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-next-readme-'));
  try {
    const files = [];
    for (const block of blocks) {
      if (block.language === 'bash') {
        assert.equal(block.code.trim(), 'npm install @minamorl/markdown-next');
        continue;
      }
      assert.ok(['typescript', 'tsx'].includes(block.language), 'Every README code block needs an explicit test treatment');
      const filename = `example-${block.index}.${block.language === 'tsx' ? 'tsx' : 'ts'}`;
      let source = instrument(block.code, filename);
      if (block.language === 'tsx') source += '\nexports.readmeComponents = { Markdown, renderNode };\n';
      fs.writeFileSync(path.join(temp, filename), source);
      files.push(filename);
    }
    // Consume the built public declaration using real React types, without
    // importing src/ or introducing a fake React/AST ambient declaration.
    fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2020', module: 'Node16', moduleResolution: 'Node16', strict: true,
      jsx: 'react', outDir: 'out', types: ['node', 'react'],
      typeRoots: [path.join(root, 'node_modules/@types')],
      paths: {
        '@minamorl/markdown-next': [path.join(root, 'lib/src/parser.d.ts')],
        react: [path.join(root, 'node_modules/@types/react/index.d.ts')],
      },
    }, files }));
    try {
      execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--project', path.join(temp, 'tsconfig.json')], { encoding: 'utf8', timeout: 30000 });
    } catch (error) { throw new Error('README consumer tsc failed:\n' + error.stdout + error.stderr, { cause: error }); }
    return blocks.map(block => {
      if (block.language === 'bash') return { language: block.language, command: block.code.trim(), output: [] };
      const filename = path.join(temp, 'out', `example-${block.index}.js`);
      const sample = new Module(filename);
      sample.filename = filename;
      sample.paths = Module._nodeModulePaths(root);
      const output = [];
      sample.capture = value => { output.push(value); return value; };
      const ordinaryRequire = sample.require.bind(sample);
      sample.require = name => name === '@minamorl/markdown-next' ? require('../lib/src/parser.js') : name === 'react' ? React : ordinaryRequire(name);
      sample._compile('const __readmeCapture = module.capture;\n' + fs.readFileSync(filename, 'utf8'), filename);
      if (block.language === 'tsx') {
        const { Markdown } = sample.exports.readmeComponents;
        for (const content of ['# Hello **world**', '```\n<x>&\n```', 'a `b`\nc', '![x](u)']) output.push(normalize(Markdown({ content })));
      }
      return { language: block.language, output };
    });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

module.exports = { exerciseReadme };
if (require.main === module) test('every README code example typechecks as a consumer and matches its frozen output', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'readme-expected.json'), 'utf8'));
  assert.deepStrictEqual(exerciseReadme(), expected);
});
