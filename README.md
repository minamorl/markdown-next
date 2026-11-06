# @minamorl/markdown-next

A markdown parser that outputs either HTML strings or an AST you can render however you want. Built with a hand-written scanner.

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
// '<h1>Hello </h1><p><strong>world</strong></p>'
```

## Getting an AST Instead

If you're building a React app or need fine-grained control over rendering, use the AST output:

```typescript
import { Parser, asAST } from '@minamorl/markdown-next'

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

HTML attributes need conversion to React props, including a style object and boolean values. This renderer drops event attributes; it is not a sanitizer, so sanitize untrusted input before parsing (including URLs and CSS).

```tsx
import * as React from 'react'
import { Parser, asAST, type ASTNode } from '@minamorl/markdown-next'

type ElementNode = [string, Record<string, unknown> | null, ASTNode]

const propNames: Record<string, string> = {
  ...Object.fromEntries(
    `acceptCharset accessKey allowFullScreen autoCapitalize autoComplete autoFocus autoPlay
   cellPadding cellSpacing charSet classID colSpan contentEditable contextMenu crossOrigin
   dateTime disablePictureInPicture disableRemotePlayback encType enterKeyHint fetchPriority
   formAction formEncType formMethod formNoValidate formTarget frameBorder hrefLang httpEquiv
   inputMode isMap itemID itemProp itemRef itemScope itemType keyParams keyType marginHeight marginWidth
   maxLength mediaGroup minLength noModule noValidate playsInline radioGroup readOnly referrerPolicy
   rowSpan spellCheck srcDoc srcLang srcSet tabIndex useMap`.split(/\s+/)
    .map(name => [name.toLowerCase(), name])
  ),
  class: 'className', for: 'htmlFor', 'accept-charset': 'acceptCharset', 'http-equiv': 'httpEquiv'
}
const booleanAttrs = new Set(`allowfullscreen async autofocus autoplay checked controls default defer
  disabled disablepictureinpicture disableremoteplayback formnovalidate hidden inert ismap itemscope
  loop multiple muted nomodule novalidate open playsinline readonly required reversed scoped seamless selected`.split(/\s+/))
const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))

function reactStyle(css: string): Record<string, string> {
  const style: Record<string, string> = Object.create(null)
  let declaration = '', quote = '', depth = 0
  for (let i = 0; i <= css.length; i++) {
    const char = css[i] ?? ';'
    if (char === '\\' && i < css.length) { declaration += char + (css[++i] ?? ''); continue }
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end < 0 ? css.length : end + 1
      continue
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ';' && depth === 0) {
      const colon = declaration.indexOf(':')
      if (colon > 0) {
        const name = declaration.slice(0, colon).trim()
        const property = name.startsWith('--') ? name : name.toLowerCase()
          .replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
        const value = declaration.slice(colon + 1).trim()
        if (property && value) style[property] = value
      }
      declaration = ''
      continue
    }
    declaration += char
  }
  return style
}

function toReactProps(attrs: ElementNode[1], tag: string): Record<string, unknown> {
  const props: Record<string, unknown> = Object.create(null)
  for (const [name, value] of Object.entries(attrs ?? {})) {
    const lower = name.toLowerCase()
    // HTML cannot supply React internals or event callbacks.
    if (/^on/.test(lower) || ['key', 'ref', 'children', 'dangerouslysetinnerhtml'].includes(lower)) continue
    if (lower === 'style') {
      props.style = typeof value === 'string' ? reactStyle(value) : value
      continue
    }
    const prop = Object.prototype.hasOwnProperty.call(propNames, lower) ? propNames[lower] : lower
    // Static HTML form values become uncontrolled React defaults.
    const target = tag === 'input' && lower === 'checked' ? 'defaultChecked'
      : tag === 'input' && lower === 'value' ? 'defaultValue' : prop
    props[target] = booleanAttrs.has(lower) ? value !== false && value != null
      : (lower === 'download' || lower === 'capture') && value === '' ? true
      : ['contenteditable', 'draggable', 'spellcheck'].includes(lower) && value === 'false' ? false
      : ['contenteditable', 'draggable', 'spellcheck'].includes(lower) && value === 'true' ? true : value
  }
  return props
}

function isElementNode(node: ASTNode): node is ElementNode {
  return Array.isArray(node) && node.length === 3 && typeof node[0] === 'string'
    && (node[1] === null || (typeof node[1] === 'object' && !Array.isArray(node[1])))
}

function renderNode(node: ASTNode, key: number = 0): React.ReactNode {
  if (node === null || typeof node === 'string') return node
  if (!Array.isArray(node)) return null
  if (!isElementNode(node)) return node.map((child, i) => renderNode(child, i))

  const [tag, attrs, children] = node
  const props = { ...toReactProps(attrs, tag), key }
  if (voidTags.has(tag)) {
    return React.createElement(tag, props)
  }
  return React.createElement(tag, props, renderNode(children))
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
import { parse } from '@minamorl/markdown-next'

parse('｜漢字《かんじ》')
// '<p><ruby>漢字<rt>かんじ</rt></ruby></p>'

parse('This is ｜日本語《にほんご》 text')
// '<p>This is <ruby>日本語<rt>にほんご</rt></ruby> text</p>'
```

The `｜` (full-width pipe) marks the start of the base text, and `《》` contains the ruby reading.

## HTML Passthrough

HTML passthrough is intentional. Output is **not sanitized**: sanitize HTML from untrusted input before inserting it into a page, including HTML attributes, plugin output and link/image URLs. Event handlers and dangerous attribute URLs are preserved. Attribute values are decoded from HTML character references and escaped when exported as HTML; escaping is not sanitization. Markdown code spans and fences escape `&`, `<`, and `>` as literal text.

HTML attributes keep their source order in HTML output and AST attribute objects. Single-quoted, double-quoted, unquoted and boolean attributes are accepted (boolean attributes have an empty string value). The first occurrence of a duplicate attribute wins, ignoring case. The existing paired-tag grammar is unchanged; `br` and `hr` also accept attributes.

Sometimes you need HTML that markdown doesn't support. Just write it:

```typescript
import { parse } from '@minamorl/markdown-next'

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
import { Parser, asHTML } from '@minamorl/markdown-next'

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
import type { Mapper } from '@minamorl/markdown-next'

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
import { Parser, asHTML } from '@minamorl/markdown-next'

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
