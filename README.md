# @minamorl/markdown-next

A markdown parser that outputs either HTML strings or an AST you can render however you want. Built with [Parsimmon](https://github.com/jneen/parsimmon).

What makes it different:
- **AST output** for React/Vue/custom renderers (not just HTML strings)
- **Aozora bunko ruby** syntax: `｜漢字《かんじ》`
- **HTML passthrough**: write `<cite>` or `<ruby>` directly in your markdown
- **Plugin system**: define custom `@[plugin:args]` blocks

## Installation

```bash
npm install @minamorl/markdown-next
```

## Basic Usage

The simplest way to get HTML:

```typescript
import { parse } from '@minamorl/markdown-next'

parse('# Hello **world**')
// '<h1>Hello <strong>world</strong></h1>'
```

## Getting an AST Instead

If you're building a React app or need fine-grained control over rendering, use the AST output:

```typescript
import { Parser, asAST } from '@minamorl/markdown-next'

const parser = new Parser({ export: asAST })
const ast = parser.parse('# Hello **world**')
```

The AST uses a simple tuple format: `[tagName, attributes, children]`

```typescript
// Input: '# Hello **world**'
// Output:
[
  ['h1', null, ['Hello ', ['strong', null, 'world']]]
]
```

### Rendering AST in React

Here's a minimal renderer:

```tsx
import { Parser, asAST, ASTNode } from '@minamorl/markdown-next'

function renderNode(node: ASTNode, key: number = 0): React.ReactNode {
  if (typeof node === 'string') return node
  if (!Array.isArray(node)) return null

  const [tag, attrs, children] = node

  // Self-closing tags
  if (tag === 'img' || tag === 'br' || tag === 'hr') {
    return React.createElement(tag, { ...attrs, key })
  }

  // Recursively render children
  const kids = Array.isArray(children)
    ? children.map((child, i) => renderNode(child, i))
    : renderNode(children, 0)

  return React.createElement(tag, { ...attrs, key }, kids)
}

// Usage
const parser = new Parser({ export: asAST })

function Markdown({ content }: { content: string }) {
  const ast = parser.parse(content)
  return <>{ast.map((node, i) => renderNode(node, i))}</>
}
```

## Japanese Ruby Annotations

Supports [Aozora bunko](https://www.aozora.gr.jp/) ruby syntax, commonly used in Japanese publishing:

```typescript
parse('｜漢字《かんじ》')
// '<p><ruby>漢字<rt>かんじ</rt></ruby></p>'

parse('This is ｜日本語《にほんご》 text')
// '<p>This is <ruby>日本語<rt>にほんご</rt></ruby> text</p>'
```

The `｜` (full-width pipe) marks the start of the base text, and `《》` contains the ruby reading.

## HTML Passthrough

Sometimes you need HTML that markdown doesn't support. Just write it:

```typescript
parse('<cite>The Art of Computer Programming</cite>')
// '<p><cite>The Art of Computer Programming</cite></p>'

parse('<ruby>東京<rt>とうきょう</rt></ruby>')
// '<p><ruby>東京<rt>とうきょう</rt></ruby></p>'

parse('<details><summary>Click me</summary>Hidden content</details>')
// '<p><details><summary>Click me</summary>Hidden content</details></p>'
```

## Plugins

Define custom syntax with plugins. Useful for embeds, custom components, or domain-specific markup.

```typescript
const parser = new Parser({
  export: asHTML,
  plugins: {
    youtube: (args) => {
      return `<iframe src="https://youtube.com/embed/${args}" frameborder="0"></iframe>`
    },
    note: (args, content, mapper) => {
      return mapper('div', { class: `note note-${args || 'info'}` })(content)
    }
  }
})

// Inline plugin
parser.parse('Check this video: @[youtube:dQw4w9WgXcQ]')

// Block plugin with content
parser.parse(`
@[note:warning]
  This is important
`)
```

Plugin function signature:
```typescript
type Plugin = (
  args: string,           // Everything after the colon
  content: Content,       // Parsed content (for block plugins)
  mapper: ElementMapper,  // Helper to create elements
  join: JoinFunction      // Helper to join content
) => string | ASTNode
```

## Supported Markdown

| Syntax | Example |
|--------|---------|
| Headers | `# H1` through `###### H6` |
| Alt headers | `Header\n===` or `Header\n---` |
| Bold | `**text**` or `__text__` |
| Italic | `*text*` or `_text_` |
| Code | `` `inline` `` or fenced blocks |
| Links | `[text](url)` |
| Images | `![alt](src)` |
| Lists | `- item` or `1. item` |
| Nested lists | 2-space indent |
| Blockquotes | `> text` |
| Tables | `| a | b |` with `|---|---|` separator |
| Ruby | `｜base《reading》` |
| HTML | Any valid HTML tag |

## API Reference

### `parse(markdown: string): string`

Quick function for HTML output.

### `Parser<T>`

```typescript
const parser = new Parser({
  export: asHTML,  // or asAST
  plugins: { ... } // optional
})

parser.parse(markdown) // returns T (string for asHTML, ASTNode[] for asAST)
```

### `asHTML`

Export type that produces HTML strings.

### `asAST`

Export type that produces an array of AST nodes.

### `ASTNode`

```typescript
type ASTNode = string | [string, Record<string, string> | null, ASTNode | ASTNode[]]
```

## Why Another Markdown Parser?

I needed:
1. Ruby annotation support for Japanese text
2. AST output for React (not just HTML strings)
3. Extensibility without forking

Most parsers give you HTML. That's fine until you need to render in React, handle custom components, or process the structure programmatically. The AST output solves this.

The ruby and HTML passthrough features came from working with Japanese content where standard markdown falls short.

## License

MIT
