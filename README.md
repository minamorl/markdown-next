# @rainpulse/markdown-next

A markdown parser that outputs either HTML strings or an AST you can render however you want. Built with a hand-written scanner.

What makes it different:
- **AST output** for React/Vue/custom renderers (not just HTML strings)
- **Aozora bunko ruby** syntax: `｜漢字《かんじ》`
- **HTML passthrough**: write `<cite>` or `<ruby>` directly in your markdown
- **Plugin system**: define custom `@[plugin:args]` blocks

## Installation

```bash
npm install @rainpulse/markdown-next
```

## Basic Usage

The simplest way to get HTML:

```typescript
import { parse } from '@rainpulse/markdown-next'

parse('# Hello **world**')
// '<h1>Hello </h1><p><strong>world</strong></p>'
```

## Getting an AST Instead

If you're building a React app or need fine-grained control over rendering, use the AST output:

```typescript
import { Parser, asAST } from '@rainpulse/markdown-next'

const parser = new Parser({ export: asAST })
const ast = parser.parse('# Hello **world**')
```

Elements use `[tagName, attributes, children]`. Text is a string, empty children may be `null`, and joins can produce nested arrays of nodes. Headers keep the existing plain-text behavior, so emphasis after a header becomes a following paragraph:

```typescript
// Input: '# Hello **world**'
// Output:
[
  ['h1', null, 'Hello '],
  ['p', null, [['strong', null, 'world']]]
]
```

### Rendering AST in React

Here's a minimal renderer:

```tsx
import * as React from 'react'
import { Parser, asAST, type ASTNode } from '@rainpulse/markdown-next'

type ElementNode = [string, Record<string, unknown> | null, ASTNode]

function isElementNode(node: ASTNode): node is ElementNode {
  return Array.isArray(node) && node.length === 3 && typeof node[0] === 'string'
    && (node[1] === null || (typeof node[1] === 'object' && !Array.isArray(node[1])))
}

function renderNode(node: ASTNode, key: number = 0): React.ReactNode {
  if (node === null || typeof node === 'string') return node
  if (!Array.isArray(node)) return null
  if (!isElementNode(node)) return node.map((child, i) => renderNode(child, i))

  const [tag, attrs, children] = node
  if (tag === 'img' || tag === 'br' || tag === 'hr') {
    return React.createElement(tag, { ...attrs, key })
  }
  return React.createElement(tag, { ...attrs, key }, renderNode(children))
}

const parser = new Parser({ export: asAST })

function Markdown({ content }: { content: string }) {
  const ast: ASTNode[] = parser.parse(content)
  return <>{ast.map((node, i) => renderNode(node, i))}</>
}
```

## Japanese Ruby Annotations

Supports [Aozora bunko](https://www.aozora.gr.jp/) ruby syntax, commonly used in Japanese publishing:

```typescript
import { parse } from '@rainpulse/markdown-next'

parse('｜漢字《かんじ》')
// '<p><ruby>漢字<rt>かんじ</rt></ruby></p>'

parse('This is ｜日本語《にほんご》 text')
// '<p>This is <ruby>日本語<rt>にほんご</rt></ruby> text</p>'
```

The `｜` (full-width pipe) marks the start of the base text, and `《》` contains the ruby reading.

## HTML Passthrough

HTML passthrough is intentional. Output is **not sanitized**: sanitize HTML from untrusted input before inserting it into a page, including plugin output and link/image URLs. Markdown code spans and fences escape `&`, `<`, and `>` as literal text.

Sometimes you need HTML that markdown doesn't support. Just write it:

```typescript
import { parse } from '@rainpulse/markdown-next'

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
import { Parser, asHTML } from '@rainpulse/markdown-next'

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
import type { Mapper } from '@rainpulse/markdown-next'

type Plugin<T> = (
  args: string,           // Inline args omit the first colon; block args retain it
  content: any,           // null inline; exporter-joined content in a block
  mapper: Mapper<T>,      // Helper to create elements
  join: Function         // Helper to join content
) => string
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
import { Parser, asHTML } from '@rainpulse/markdown-next'

const parser = new Parser({
  export: asHTML,  // or asAST
  plugins: {}      // optional
})

parser.parse('text')
// '<p>text</p>'
```

### `asHTML`

Export type that produces HTML strings.

### `asAST`

Export type that produces an array of AST nodes.

### `ASTNode`

```typescript
type ASTNode = string | null | [string, Record<string, unknown> | null, ASTNode] | ASTNode[]
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
