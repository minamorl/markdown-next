# @minamorl/markdown-next

Markdown parser with AST output, Aozora bunko ruby support, and HTML passthrough.

## Features

- Standard Markdown: headers, lists, links, images, code blocks, tables, blockquotes
- **Aozora bunko ruby**: `｜漢字《かんじ》` → `<ruby>漢字<rt>かんじ</rt></ruby>`
- **HTML passthrough**: `<cite>text</cite>` preserved in output
- **Plugin system**: Extend with custom `@[plugin:args]` syntax
- **Dual output**: HTML string or AST (for React/Vue/custom rendering)

## Install

```bash
npm install @minamorl/markdown-next
```

## Quick Start

```typescript
import { parse } from '@minamorl/markdown-next'

const html = parse('# Hello **world**')
// => '<h1>Hello <strong>world</strong></h1>'
```

## AST Output (for React/Vue/Custom Rendering)

Use `asAST` when you need to render markdown to React, Vue, or any custom format:

```typescript
import { Parser, asAST } from '@minamorl/markdown-next'

const parser = new Parser({ export: asAST })
const ast = parser.parse('# Hello **world**')
```

### AST Format

```typescript
// Input: '# Hello **world**'
// Output:
[
  ['h1', null, ['Hello ', ['strong', null, 'world']]]
]

// Node structure: [tagName, attributes, children]
// - tagName: string (e.g., 'h1', 'p', 'strong')
// - attributes: object | null (e.g., { href: 'url' })
// - children: string | ASTNode | ASTNode[]
```

### React Example

```tsx
function renderAST(node: ASTNode): React.ReactNode {
  if (typeof node === 'string') return node
  if (!Array.isArray(node)) return null

  const [tag, attrs, children] = node
  const props = attrs ? { ...attrs, key: Math.random() } : { key: Math.random() }

  if (tag === 'img' || tag === 'br') {
    return React.createElement(tag, props)
  }

  const renderedChildren = Array.isArray(children)
    ? children.map(renderAST)
    : renderAST(children)

  return React.createElement(tag, props, renderedChildren)
}

// Usage
const ast = parser.parse(markdown)
const elements = ast.map(renderAST)
```

## HTML Output

```typescript
import { Parser, asHTML, parse } from '@minamorl/markdown-next'

// Shorthand
const html = parse('**bold**')

// Full control
const parser = new Parser({ export: asHTML })
const html = parser.parse('**bold**')
```

## Aozora Bunko Ruby

Japanese ruby annotation format:

```typescript
parse('｜漢字《かんじ》')
// => '<p><ruby>漢字<rt>かんじ</rt></ruby></p>'
```

## HTML Passthrough

HTML elements are preserved:

```typescript
parse('<cite>Reference</cite>')
// => '<p><cite>Reference</cite></p>'

parse('<ruby>漢字<rt>かんじ</rt></ruby>')
// => '<p><ruby>漢字<rt>かんじ</rt></ruby></p>'
```

## Plugin System

Extend with custom block or inline plugins:

```typescript
const parser = new Parser({
  export: asHTML,
  plugins: {
    note: (args, content, mapper, join) => {
      return mapper('div', { class: 'note' })(content)
    }
  }
})

// Block plugin
parser.parse(`
@[note]
  This is a note
`)

// Inline plugin
parser.parse('Value is @[calc:1+1]')
```

## Supported Elements

| Element | Syntax |
|---------|--------|
| Headers | `# H1` to `###### H6`, or `H1\n===` / `H2\n---` |
| Bold | `**text**` or `__text__` |
| Italic | `*text*` or `_text_` |
| Links | `[label](url)` |
| Images | `![alt](src)` |
| Code | `` `inline` `` or ``` ```block``` ``` |
| Lists | `- item` or `1. item` (nested with 2-space indent) |
| Blockquote | `> text` (nested with `> > text`) |
| Table | `\| a \| b \|` format |
| Ruby | `｜base《ruby》` |
| HTML | `<tag>content</tag>` |

## API

### `parse(markdown: string): string`

Parse markdown to HTML string.

### `Parser<T>`

```typescript
new Parser({
  export: asHTML | asAST,  // Output format
  plugins?: { [name]: Plugin }  // Optional plugins
})
```

### `asHTML: ExportType<string>`

Export type for HTML string output.

### `asAST: ExportType<any>`

Export type for AST output.

## License

MIT
