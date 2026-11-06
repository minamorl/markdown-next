import { htmlEntities } from './html-entities'

export interface ListTree {
  type: 'ul' | 'ol' | 'shadow'
  children: Array<ListTree>
  value: string | null
  parent: ListTree | null
}

/** Tuple elements, text and the nested groups emitted by the AST exporter. */
export type ASTNode = string | null | [string, Record<string, unknown> | null, ASTNode] | ASTNode[]

export type Plugin<T> = (args: string, content: any, mapper: Mapper<T>, join: Function) => string

export type Mapper<T> = (tagName: string, attributes?: any) => (children: string | T | null) => T

export interface ExportType<T> {
  mapper: Mapper<T>
  join: Function
  postprocess: (x: any) => any
}

interface ParseSuccess<T> {
  status: true
  value: T
}

interface ParseFailure {
  status: false
  index: { offset: number; line: number; column: number }
  expected: string[]
}

type InlineContext = 0 | 1 | 2 | 3 // paragraph, list, quote, table

function whitespace(c: number): boolean {
  switch (c) {
    case 9:
    case 10:
    case 11:
    case 12:
    case 13:
    case 32:
    case 160:
    case 5760:
    case 8232:
    case 8233:
    case 8239:
    case 8287:
    case 12288:
    case 65279:
      return true
    default:
      return c >= 8192 && c <= 8202
  }
}

function letter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
}

function digit(c: number): boolean {
  return c >= 48 && c <= 57
}

function plain(c: number): boolean {
  return c !== 96 && c !== 95 && c !== 42 && c !== 13 && c !== 10
}

function textChar(c: number, context: InlineContext): boolean {
  switch (c) {
    case 13:
    case 10:
    case 91:
    case 93:
    case 42:
    case 96:
      return false
    case 36:
      return context === 3
    case 60:
    case 65372:
    case 64:
      return context === 1 || context === 3
    default:
      // Legacy =-\[ is the ASCII range '=' through '[', not a literal dash.
      return context !== 0 || c < 61 || c > 91
  }
}

interface QuoteTree {
  text: any
  children: QuoteTree[]
  parent?: QuoteTree
}

// One mutable cursor/value pair for a document. Speculative productions commit
// their cursor only on success; no combinators or per-token result allocations.
class Scanner<T> {
  p = 0
  value: any
  private input: string
  private end: number
  private readonly mapper: Mapper<T>
  private readonly join: Function
  private inlinePluginName: string | null = null
  private inlinePluginArgs = ''
  private lineTokens: any[] = []
  private linePlugins: { index: number; name: string; args: string }[] = []

  constructor(
    private readonly owner: Parser<T>,
    input: string
  ) {
    this.input = input
    this.end = input.length
    this.mapper = owner.opts.export.mapper
    this.join = owner.opts.export.join
  }

  private c(i: number): number {
    return this.input.charCodeAt(i)
  }

  private lineEnd(i: number): number {
    while (i < this.end && this.c(i) !== 13 && this.c(i) !== 10) i++
    return i
  }

  private newline(i: number): number {
    if (this.c(i) === 13) return this.c(i + 1) === 10 ? i + 2 : i + 1
    return this.c(i) === 10 ? i + 1 : i
  }

  private skipSpace(i: number, fullWidth = true): number {
    while (i < this.end && whitespace(this.c(i)) && (fullWidth || this.c(i) !== 12288)) i++
    return i
  }

  private run(i: number, code: number): number {
    while (this.c(i) === code) i++
    return i
  }

  private node(tag: string, children: any, attributes?: any): any {
    return this.mapper(tag, attributes)(children)
  }

  private codeNode(content: any): any {
    // Only Markdown code is literal text. Raw HTML (including <code>) keeps
    // its passthrough semantics, and custom/AST exporters receive source text.
    return this.node('code', this.mapper === (asHTML.mapper as Mapper<any>) ? content.replace(/[&<>]/g, codeEntity) : content)
  }

  private plugin(block: boolean): boolean {
    const start = this.p
    if (this.c(start) !== 64 || this.c(start + 1) !== 91) return false
    let i = start + 2
    while (letter(this.c(i))) i++
    if (i === start + 2) return false
    const nameEnd = i
    if (block && this.c(i) !== 58 && this.c(i) !== 93) return false
    if (!block && this.c(i) === 58) i++
    const argsStart = i
    while (i < this.end && this.c(i) !== 93) i++
    if (i === this.end) return false
    const args = this.input.slice(argsStart, i)
    const name = this.input.slice(start + 2, nameEnd)
    let content: any = null
    let close = ']'
    if (block) {
      if (this.c(i + 1) !== 10) return false
      i += 2
      const lines: any[] = []
      while (this.c(i) === 32 && this.c(i + 1) === 32) {
        const end = this.lineEnd(i + 2)
        if (end === i + 2) break
        lines.push(this.join(['', this.input.slice(i + 2, end), '\n']))
        i = this.newline(end)
      }
      if (lines.length === 0) return false
      content = this.join(lines)
      close = ']\n'
    } else i++
    this.p = i
    const plugin = this.owner.opts.plugins && this.owner.opts.plugins[name]
    if (!block) {
      this.inlinePluginName = name
      this.inlinePluginArgs = args
    }
    this.value = plugin
      ? plugin(args, content, this.mapper, this.join)
      : this.join(block ? ['@[', name, args, close, content] : ['@[', name, args, close])
    return true
  }

  private link(image: boolean): boolean {
    const start = this.p
    const labelStart = start + (image ? 2 : 1)
    if (this.c(start) !== (image ? 33 : 91) || (image && this.c(start + 1) !== 91)) return false
    let i = labelStart
    while (i < this.end && this.c(i) !== 93 && this.c(i) !== 13 && this.c(i) !== 10) i++
    if (i === labelStart || this.c(i) !== 93 || this.c(i + 1) !== 40) return false
    const labelEnd = i
    const targetStart = (i += 2)
    while (i < this.end && this.c(i) !== 41 && this.c(i) !== 13 && this.c(i) !== 10) i++
    if (i === targetStart || this.c(i) !== 41) return false
    const label = this.input.slice(labelStart, labelEnd)
    const target = this.input.slice(targetStart, i)
    this.p = i + 1
    this.value = image ? this.node('img', null, { src: target, alt: label }) : this.node('a', label, { href: target })
    return true
  }

  private emphasis(): boolean {
    const start = this.p
    const c = this.c(start)
    if (c !== 42 && c !== 95) return false
    let width = 1
    let i = start + 1
    if (this.c(i) === c) {
      width = 2
      i++
    }
    const textStart = i
    while (i < this.end && plain(this.c(i))) i++
    if (i === textStart || (this.c(i) !== 42 && this.c(i) !== 95)) return false
    if (width === 2 && this.c(i + 1) !== this.c(i)) return false
    this.p = i + width
    this.value = this.node(width === 1 ? 'em' : 'strong', this.input.slice(textStart, i))
    return true
  }

  private code(): boolean {
    const start = this.p
    if (this.c(start) !== 96) return false
    const textStart = this.run(start, 96)
    const width = textStart - start
    let i = textStart
    while (i < this.end && this.c(i) !== 13 && this.c(i) !== 10) {
      if (this.c(i) !== 96) {
        i++
        continue
      }
      const end = this.run(i, 96)
      if (end - i === width) {
        let a = textStart,
          b = i
        if (this.c(a) === 32 && this.c(b - 1) === 32 && this.skipSpace(a) < b) {
          a++
          b--
        }
        this.p = end
        this.value = this.codeNode(this.input.slice(a, b))
        return true
      }
      i = end
    }
    return false
  }

  private math(): boolean {
    const start = this.p
    if (this.c(start) !== 36 || this.c(start + 1) === 36) return false
    let i = start + 1
    while (i < this.end && this.c(i) !== 36 && this.c(i) !== 13 && this.c(i) !== 10) i++
    if (i === start + 1 || this.c(i) !== 36) return false
    this.p = i + 1
    this.value = this.input.slice(start, i + 1)
    return true
  }

  private ruby(): boolean {
    const start = this.p
    if (this.c(start) !== 65372) return false
    let i = start + 1
    while (i < this.end && this.c(i) !== 12298) i++
    if (i === start + 1 || i === this.end) return false
    const baseEnd = i++
    const rubyStart = i
    while (i < this.end && this.c(i) !== 12299) i++
    if (i === rubyStart || i === this.end) return false
    this.p = i + 1
    this.value = this.node(
      'ruby',
      this.join([this.input.slice(start + 1, baseEnd), this.node('rt', this.input.slice(rubyStart, i))])
    )
    return true
  }

  private footnoteRef(): boolean {
    const start = this.p
    if (this.c(start) !== 91 || this.c(start + 1) !== 94) return false
    let i = start + 2
    while (digit(this.c(i))) i++
    if (i === start + 2 || this.c(i) !== 93 || this.c(i + 1) === 58) return false
    const id = this.input.slice(start + 2, i)
    this.p = i + 1
    this.value = this.node('footnote-ref', id, { id })
    return true
  }

  private selfClosing(): boolean {
    const start = this.p
    if (this.c(start) !== 60) return false
    const b = this.c(start + 1)
    if ((b !== 98 && b !== 104) || this.c(start + 2) !== 114) return false
    let i = this.skipSpace(start + 3)
    if (this.c(i) === 47) i++
    if (this.c(i) !== 62) {
      const attributes = this.htmlAttributes(start + 3, true)
      if (!attributes || !attributes.value) return false
      this.p = attributes.end
      this.value = this.node(b === 98 ? 'br' : 'hr', null, attributes.value)
      return true
    }
    this.p = i + 1
    this.value = this.node(b === 98 ? 'br' : 'hr', null)
    return true
  }

  private htmlAttributes(i: number, selfClosing = false): { end: number; value?: Record<string, string> } | null {
    let value: Record<string, string> | undefined
    const names: string[] = []
    while (i < this.end) {
      const beforeSpace = i
      i = this.skipSpace(i)
      if (selfClosing && this.c(i) === 47 && this.c(i + 1) === 62) i++
      if (this.c(i) === 62) {
        // Ordinary object enumeration sorts integer names; retain source order there too.
        if (value && Object.keys(value).some((key, index) => key !== names[index])) {
          value = new Proxy(value, { ownKeys: () => names.slice() })
        }
        return { end: i + 1, value }
      }
      if (i === beforeSpace) return null
      const nameStart = i
      while (i < this.end && !whitespace(this.c(i)) && !'\"\'<>/='.includes(this.input[i])) i++
      if (i === nameStart) return null
      const name = this.input.slice(nameStart, i)
      let text = ''
      const nameEnd = i
      i = this.skipSpace(i)
      if (this.c(i) === 61) {
        i = this.skipSpace(i + 1)
        const quote = this.c(i)
        if (quote === 34 || quote === 39) {
          const textStart = ++i
          while (i < this.end && this.c(i) !== quote) i++
          if (i === this.end) return null
          text = this.input.slice(textStart, i++)
        } else {
          const textStart = i
          while (i < this.end && !whitespace(this.c(i)) && this.c(i) !== 62) {
            if ('\"\'<=`'.includes(this.input[i])) return null
            i++
          }
          if (i === textStart) return null
          text = this.input.slice(textStart, i)
        }
      } else {
        i = nameEnd
      }
      // First duplicate wins, as in HTML. defineProperty also safely retains __proto__.
      if (!names.some(key => key.toLowerCase() === name.toLowerCase())) {
        value ??= {}
        Object.defineProperty(value, name, { value: decodeAttribute(text), enumerable: true, configurable: true, writable: true })
        names.push(name)
      }
    }
    return null
  }

  private html(): boolean {
    const start = this.p
    if (this.c(start) !== 60 || !letter(this.c(start + 1))) return false
    let i = start + 2
    while (letter(this.c(i)) || digit(this.c(i))) i++
    const tagEnd = i
    const attributes = this.htmlAttributes(i)
    if (!attributes) return false
    const tag = this.input.slice(start + 1, tagEnd)
    if (attributes.value && (tag === 'br' || tag === 'hr')) return false
    this.p = attributes.end
    const children: any[] = []
    while (this.p < this.end) {
      if (this.c(this.p) === 60) {
        if (this.html() || this.selfClosing()) {
          children.push(this.value)
          continue
        }
        break
      }
      const textStart = this.p
      while (this.p < this.end && this.c(this.p) !== 60) this.p++
      children.push(this.input.slice(textStart, this.p))
    }
    i = this.p
    if (this.c(i) !== 60 || this.c(i + 1) !== 47 || !letter(this.c(i + 2))) {
      this.p = start
      return false
    }
    const closeStart = (i += 2)
    while (letter(this.c(i)) || digit(this.c(i))) i++
    if (this.c(i) !== 62) {
      this.p = start
      return false
    }
    const closeTag = this.input.slice(closeStart, i)
    this.p = i + 1
    this.value =
      tag.toLowerCase() === closeTag.toLowerCase()
        ? this.node(tag, this.join(children), attributes.value)
        : this.join([
            '<' + tag + (attributes.value ? Object.keys(attributes.value).map(name => ` ${name}="${escapeHtml(attributes.value![name])}"`).join('') : '') + '>',
            ...children,
            '</' + closeTag + '>',
          ])
    return true
  }

  private inline(context: InlineContext): boolean {
    const start = this.p
    if (start >= this.end) return false
    const c = this.c(start)
    switch (c) {
      case 64:
        if ((context === 0 || context === 2) && this.plugin(false)) return true
        break
      case 65372:
        if ((context === 0 || context === 2) && this.ruby()) return true
        break
      case 91:
        if (context === 0 && this.footnoteRef()) return true
        if (this.link(false)) return true
        break
      case 33:
        if (this.link(true)) return true
        break
      case 42:
      case 95:
        if (this.emphasis()) return true
        break
      case 96:
        if (this.code()) return true
        break
      case 36:
        if (context !== 3 && this.math()) return true
        break
      case 60:
        if ((context === 0 || context === 2) && (this.selfClosing() || this.html())) return true
        break
    }
    let i = start
    while (i < this.end && textChar(this.c(i), context)) i++
    if (i > start) {
      this.p = i
      this.value = this.input.slice(start, i)
      return true
    }
    if (context === 3 || c === 13 || c === 10 || c === 8232 || c === 8233) return false
    this.p = start + 1
    this.value = this.input[start]
    return true
  }

  private inlines(context: InlineContext): boolean {
    const values: any[] = []
    const plugins: { index: number; name: string; args: string }[] = []
    while (true) {
      this.inlinePluginName = null
      if (!this.inline(context)) break
      if (context === 0 && this.inlinePluginName !== null) {
        plugins.push({ index: values.length, name: this.inlinePluginName, args: this.inlinePluginArgs })
      }
      values.push(this.value)
    }
    if (context !== 1 && values.length === 0) return false
    if (context === 0) {
      this.lineTokens = values
      this.linePlugins = plugins
    }
    this.value = this.join(values)
    return true
  }

  private heading(): boolean {
    const start = this.p
    let i = start
    // The setext title uses dot, excluding U+2028/U+2029 as well as CR/LF.
    while (i < this.end && this.c(i) !== 10 && this.c(i) !== 13 && this.c(i) !== 8232 && this.c(i) !== 8233) i++
    if (this.c(i) === 10 && (this.c(i + 1) === 61 || this.c(i + 1) === 45)) {
      const marker = this.c(i + 1)
      const after = this.run(i + 1, marker)
      if (after === this.end || this.c(after) === 10) {
        this.p = after === this.end ? after : after + 1
        this.value = this.node(marker === 61 ? 'h1' : 'h2', this.input.slice(start, i))
        return true
      }
    }
    if (this.c(start) !== 35) return false
    const hashes = this.run(start, 35) - start
    for (let level = Math.min(hashes, 6); level >= 1; level--) {
      i = start + level
      let spaceStart = i
      if (!whitespace(this.c(spaceStart))) {
        // The old /\s+/m can find whitespace at a later line boundary,
        // but consumes only its length, ignoring the regex match offset.
        while (spaceStart < this.end) {
          const before = this.c(spaceStart - 1)
          if ((before === 10 || before === 13 || before === 8232 || before === 8233) && whitespace(this.c(spaceStart)))
            break
          spaceStart++
        }
        if (spaceStart === this.end) continue
      }
      i += this.skipSpace(spaceStart) - spaceStart
      const textStart = i
      while (i < this.end && plain(this.c(i))) i++
      if (i === textStart) continue
      this.p = this.skipSpace(i, false)
      this.value = this.node('h' + level, this.input.slice(textStart, i))
      return true
    }
    return false
  }

  private tableRow(i: number): number {
    if (this.c(i) !== 124) return -1
    let last = -1
    for (let j = i + 1; j < this.end && this.c(j) !== 13 && this.c(j) !== 10; j++) {
      if (this.c(j) === 124 && j >= i + 2) last = j + 1
    }
    return last
  }

  private separator(start: number, end: number): boolean {
    let i = start + 1
    while (i < end) {
      i = this.skipSpace(i)
      if (this.c(i) === 58) i++
      const dash = i
      i = this.run(i, 45)
      if (i === dash) return false
      if (this.c(i) === 58) i++
      i = this.skipSpace(i)
      if (this.c(i) !== 124) return false
      i++
      if (i === end) return true
    }
    return false
  }

  private cells(start: number, end: number, tag: string): any {
    const cells: any[] = []
    let text = ''
    let segment = start + 1
    for (let i = segment; i < end - 1; i++) {
      const c = this.c(i)
      if (c === 92 && i + 1 < end - 1) {
        text += this.input.slice(segment, i)
        text += this.c(i + 1) === 124 ? '|' : this.input.slice(i, i + 2)
        i++
        segment = i + 1
      } else if (c === 124) {
        cells.push(this.cell(text + this.input.slice(segment, i), tag))
        text = ''
        segment = i + 1
      }
    }
    cells.push(this.cell(text + this.input.slice(segment, end - 1), tag))
    return this.node('tr', this.join(cells))
  }

  private cell(content: string, tag: string): any {
    const text = content.trim()
    if (!text) return this.node(tag, '')
    // Temporarily switch input to the independently unescaped cell, reusing
    // this parse's state. Restore it even if a custom exporter throws.
    const input = this.input,
      end = this.end,
      position = this.p
    let contentValue: any
    try {
      this.input = text
      this.end = text.length
      this.p = 0
      const ok = this.inlines(3)
      contentValue = ok && this.p === this.end ? this.value : text
    } finally {
      this.input = input
      this.end = end
      this.p = position
    }
    return this.node(tag, contentValue)
  }

  private table(): boolean {
    const start = this.p
    const headerEnd = this.tableRow(start)
    if (headerEnd < 0 || this.newline(headerEnd) === headerEnd) return false
    const sepStart = this.newline(headerEnd)
    const sepEnd = this.tableRow(sepStart)
    if (sepEnd < 0 || this.newline(sepEnd) === sepEnd) return false
    let i = this.newline(sepEnd)
    const ranges: number[] = []
    let rowEnd: number
    while ((rowEnd = this.tableRow(i)) >= 0) {
      ranges.push(i, rowEnd)
      i = this.newline(rowEnd)
    }
    this.p = i
    if (!this.separator(sepStart, sepEnd)) {
      this.value = { status: false, index: -1, value: null, furthest: 0, expected: ['Not a valid table separator'] }
      return true
    }
    const rows: any[] = [this.cells(start, headerEnd, 'th')]
    for (let j = 0; j < ranges.length; j += 2) rows.push(this.cells(ranges[j], ranges[j + 1], 'td'))
    this.value = this.node('table', this.join(rows))
    return true
  }

  private fence(): boolean {
    const start = this.p
    if (this.c(start) !== 96) return false
    const openerEnd = this.run(start, 96)
    const width = openerEnd - start
    if (width < 3) return false
    let i = openerEnd
    while (i < this.end && this.c(i) !== 96 && this.c(i) !== 13 && this.c(i) !== 10) i++
    const definitionEnd = i
    if (this.newline(i) === i) return false
    i = this.newline(i)
    const code: string[] = []
    while (i < this.end) {
      const afterRun = this.run(i, 96)
      let after = afterRun
      while (this.c(after) === 32 || this.c(after) === 9) after++
      if (afterRun - i >= width && (after === this.end || this.c(after) === 13 || this.c(after) === 10)) {
        while (
          code.length &&
          (code[code.length - 1] === '\n' || code[code.length - 1] === '\r' || code[code.length - 1] === '\r\n')
        )
          code.pop()
        this.p = after
        const definition = this.input.slice(openerEnd, definitionEnd)
        const value = this.codeNode(this.join(code))
        this.value =
          definition === '' ? this.node('pre', value) : this.node('pre', value, { 'data-language': definition })
        return true
      }
      const end = this.lineEnd(i)
      if (end !== i) code.push(this.input.slice(i, end))
      const next = this.newline(end)
      if (next !== end) code.push(this.input.slice(end, next))
      i = next
    }
    return false
  }

  private mathBlock(): boolean {
    const start = this.p
    if (this.c(start) !== 36 || this.c(start + 1) !== 36) return false
    let i = start + 2
    while (i < this.end && (this.c(i) !== 36 || this.c(i + 1) !== 36)) i++
    if (i === this.end) return false
    const next = this.newline(i + 2)
    if (next === i + 2 && next !== this.end) return false
    this.p = next
    this.value = '$$' + this.input.slice(start + 2, i).trim() + '$$'
    return true
  }

  private footnote(): boolean {
    const start = this.p
    if (this.c(start) !== 91 || this.c(start + 1) !== 94) return false
    let i = start + 2
    while (digit(this.c(i))) i++
    if (i === start + 2 || this.c(i) !== 93 || this.c(i + 1) !== 58) return false
    const id = this.input.slice(start + 2, i)
    i = this.skipSpace(i + 2)
    let end = this.lineEnd(i)
    const lines = [this.input.slice(i, end)]
    while (this.newline(end) !== end) {
      const next = this.newline(end)
      let textStart = next
      if (this.c(next) === 9) textStart++
      else if (this.input.startsWith('    ', next)) textStart += 4
      else break
      end = this.lineEnd(textStart)
      lines.push(this.input.slice(textStart, end))
    }
    this.p = this.newline(end)
    this.value = this.node('footnote-def', lines.join('\n').trim(), { id })
    return true
  }

  private list(): boolean {
    const start = this.p
    let previous = 1
    let count = 0
    let firstType: 'ul' | 'ol' = 'ul'
    while (this.p < this.end) {
      const lineStart = this.p
      let i = lineStart
      while (this.c(i) === 32 && this.c(i + 1) === 32) i += 2
      const marker = i
      let type: 'ul' | 'ol'
      if ((this.c(i) === 45 || this.c(i) === 42) && this.c(i + 1) === 32) {
        type = 'ul'
        i += 2
      } else {
        while (digit(this.c(i))) i++
        if (i === marker || this.c(i) !== 46 || this.c(i + 1) !== 32) break
        type = 'ol'
        i += 2
      }
      // Parsimmon's P.index counts CRLF as one linebreak, and CR alone too.
      let line = marker
      while (line > 0 && this.c(line - 1) !== 10 && this.c(line - 1) !== 13) line--
      const column = marker - line + 1
      this.p = i
      this.inlines(1)
      const text = this.value
      this.p = this.newline(this.p)
      if (column % 2 !== 1) {
        resetTree(this.owner)
        this.p = lineStart
        break
      }
      if (count === 0) firstType = type
      const node: ListTree = { value: text, children: [], type, parent: this.owner.currentTree }
      if (previous < column) {
        this.owner.currentTree = this.owner.currentTree.children[this.owner.currentTree.children.length - 1]
        node.parent = this.owner.currentTree
      } else if (previous > column) {
        for (let step = 0; step < (previous - column) / 2; step++) {
          if (this.owner.currentTree.parent !== null) this.owner.currentTree = this.owner.currentTree.parent
        }
        node.parent = this.owner.currentTree
      }
      this.owner.currentTree.children.push(node)
      previous = column
      count++
    }
    if (!count) {
      this.p = start
      return false
    }
    this.owner.rootTree.type = firstType
    this.value = this.listTree(this.owner.rootTree)
    resetTree(this.owner)
    return true
  }

  private listTree(tree: ListTree): any {
    const children = tree.children.map((child) => this.listTree(child))
    if (tree.type === 'shadow') return this.join(children)
    if (tree.value !== null) {
      return this.node(
        'li',
        children.length ? this.join([tree.value, this.node(tree.children[0].type, this.join(children))]) : tree.value
      )
    }
    return this.node(tree.type, this.join(children))
  }

  private quote(): boolean {
    const start = this.p
    let depth = 0
    const root: QuoteTree = { text: null, children: [] }
    let current = root
    let count = 0
    while (this.c(this.p) === 62 && this.c(this.p + 1) === 32) {
      const lineStart = this.p
      let level = -1
      while (this.c(this.p) === 62 && this.c(this.p + 1) === 32) {
        level++
        this.p += 2
      }
      if (!this.inlines(2)) {
        this.p = lineStart
        break
      }
      const text = this.value
      this.p = this.newline(this.p)
      const node: QuoteTree = { text, children: [], parent: current }
      if (level < depth) {
        for (let step = 0; step < depth - level; step++) if (current.parent) current = current.parent
        node.parent = current
        current.children.push(node)
        depth = level
      } else if (level > depth) {
        const shadow: QuoteTree = { text: null, children: [node], parent: current }
        node.parent = shadow
        current.children.push(shadow)
        current = shadow
        depth = level
      } else current.children.push(node)
      count++
    }
    if (!count) {
      this.p = start
      return false
    }
    this.value = this.quoteTree(root)
    return true
  }

  private quoteTree(tree: QuoteTree): any {
    const values: any[] = []
    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i]
      if (node.text !== null)
        values.push(tree.children[i + 1]?.text != null ? this.join([node.text, this.node('br', null)]) : node.text)
      else if (node.children.length) values.push(this.quoteTree(node))
    }
    return this.node(
      'blockquote',
      values.reduce((a, b) => this.join([a, b]))
    )
  }

  private fenceAhead(start: number): boolean {
    if (this.c(start) !== 96) return false
    const end = this.run(start, 96)
    const width = end - start
    if (width < 3) return false
    let i = end
    while (i < this.end && this.c(i) !== 96 && this.c(i) !== 13 && this.c(i) !== 10) i++
    if (this.c(i) !== 10) return false
    // Legacy lookahead needs LF immediately before the closing run, and is
    // intentionally different from the actual fence's whole-line rule.
    for (i++; i < this.end; i++) {
      if (this.c(i) === 10 && this.c(i + 1) === 96) {
        const after = this.run(i + 1, 96)
        if (after - i - 1 >= width) return true
        i = after - 1
      }
    }
    return false
  }

  private paragraph(): boolean {
    const lines: any[] = []
    const breaks: any[] = []
    let lastEnd = this.p
    let lastTokens: any[] = []
    let lastPlugins: { index: number; name: string; args: string }[] = []
    while (true) {
      const start = this.p
      if (!this.inlines(0)) {
        this.p = start
        break
      }
      lastEnd = this.p
      lastTokens = this.lineTokens
      lastPlugins = this.linePlugins
      lines.push(this.value)
      const end = this.p
      const next = this.newline(end)
      if (next === end || this.fenceAhead(next)) break
      this.p = next
      // The recursive paragraph must have content, otherwise the linebreak
      // belongs to the next block separator, not to this paragraph.
      if (next === this.end || this.c(next) === 13 || this.c(next) === 10) {
        this.p = end
        break
      }
      breaks.push(this.node('br', null))
    }
    if (!lines.length) return false
    // The legacy final-line alternative reruns plugin callbacks. Replay only
    // these effects on the saved tokens; never scan the line a second time.
    this.p = lastEnd
    for (const token of lastPlugins) {
      const plugin = this.owner.opts.plugins && this.owner.opts.plugins[token.name]
      lastTokens[token.index] = plugin
        ? plugin(token.args, null, this.mapper, this.join)
        : this.join(['@[', token.name, token.args, ']'])
    }
    let result = this.join(lastTokens)
    for (let i = lines.length - 2; i >= 0; i--) result = this.join([lines[i], breaks[i], result])
    this.value = this.node('p', result)
    return true
  }

  parse(): ParseSuccess<T> | ParseFailure {
    const blocks: any[] = []
    while (this.p < this.end) {
      const start = this.p
      const afterSpace = this.skipSpace(start, false)
      if (afterSpace !== start) {
        this.p = afterSpace
        blocks.push('')
        continue
      }
      if (
        this.plugin(true) ||
        this.heading() ||
        this.table() ||
        this.fence() ||
        this.mathBlock() ||
        this.footnote() ||
        this.list() ||
        this.quote() ||
        this.paragraph()
      ) {
        blocks.push(this.value)
        continue
      }
      let line = 1,
        column = 1
      for (let i = 0; i < start; i++) {
        if (this.c(i) === 13 || (this.c(i) === 10 && this.c(i - 1) !== 13)) {
          line++
          column = 1
        } else if (this.c(i) !== 10) column++
      }
      return { status: false, index: { offset: start, line, column }, expected: ['EOF'] }
    }
    return { status: true, value: this.join(blocks) }
  }
}

function resetTree<T>(owner: Parser<T>) {
  owner.rootTree = owner.currentTree = { value: null, children: [], type: 'shadow', parent: null }
}

export class Parser<T> {
  liLevelBefore: number | null = null
  liLevel: number | null = null
  rootTree!: ListTree
  currentTree!: ListTree
  acceptables!: { parse: (input: string) => ParseSuccess<T> | ParseFailure }

  constructor(public opts: { export: ExportType<T>; plugins?: { [pluginName: string]: Plugin<T> } }) {
    resetTree(this)
    this.create()
  }

  create() {
    this.acceptables = { parse: (input: string) => new Scanner(this, input).parse() }
  }

  parse(s: string) {
    this.liLevelBefore = this.liLevel = null
    resetTree(this)
    let start = 0,
      end = s.length
    while (start < end && whitespace(s.charCodeAt(start)) && s.charCodeAt(start) !== 12288) start++
    while (end > start && whitespace(s.charCodeAt(end - 1)) && s.charCodeAt(end - 1) !== 12288) end--
    const trimmed = start === 0 && end === s.length ? s : s.slice(start, end)
    const parsed = this.acceptables.parse(trimmed)
    if (parsed.status === true && parsed.hasOwnProperty('value')) return this.opts.export.postprocess(parsed.value)
    console.error(trimmed)
    console.error(parsed)
    throw new Error('Parsing was failed.')
  }
}

function codeEntity(character: string): string {
  switch (character) {
    case '&':
      return '&amp;'
    case '<':
      return '&lt;'
    default:
      return '&gt;'
  }
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

// HTML numeric references use these Windows-1252 replacements, even in UTF-8.
const numericReferences: Record<number, number> = {
  128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225,
  136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338, 142: 381, 145: 8216,
  146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732,
  153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376,
}

function decodeAttribute(text: string): string {
  return text.replace(/&(#(?:[xX][0-9a-fA-F]+|[0-9]+);?|[A-Za-z][A-Za-z0-9]{0,31};?)/g, (match, reference: string, offset: number) => {
    if (reference[0] === '#') {
      const hex = reference[1].toLowerCase() === 'x'
      const code = parseInt(reference.slice(hex ? 2 : 1), hex ? 16 : 10)
      return String.fromCodePoint(code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
        ? 0xfffd : numericReferences[code] || code)
    }
    // Longest named match; legacy semicolonless references cannot precede = or alphanumerics in attributes.
    for (let end = reference.length; end > 0; end--) {
      const name = reference.slice(0, end)
      if (!Object.prototype.hasOwnProperty.call(htmlEntities, name)) continue
      if (!name.endsWith(';') && /[=A-Za-z0-9]/.test(text[offset + 1 + end] || '')) return match
      return htmlEntities[name] + reference.slice(end)
    }
    return match
  })
}

export const asHTML: ExportType<string> = {
  mapper: (tag, args) => (children) => {
    // Handle footnote reference - output as superscript link
    if (tag === 'footnote-ref' && args?.id) {
      const id = args.id
      return `<sup id="fnref${id}"><a href="#fn${id}">${id}</a></sup>`
    }
    // Handle footnote definition - store for later collection
    if (tag === 'footnote-def' && args?.id) {
      const id = args.id
      return `<footnote-def data-id="${id}">${children}</footnote-def>`
    }
    return [
      '<' + tag,
      args
        ? ' ' +
          Object.keys(args)
            .map((x) => `${x}="${escapeHtml(String(args[x]))}"`)
            .join(' ')
        : '',
      children !== null && children !== '' ? '>' + children + '</' + tag + '>' : ' />',
    ].join('')
  },
  join: (x: string[]) => x.join(''),
  postprocess: (x: string) => {
    // Collect footnote definitions and move them to the end
    const footnoteDefRegex = /<footnote-def data-id="(\d+)">([\s\S]*?)<\/footnote-def>/g
    const footnotes: { id: string; content: string }[] = []
    let match
    while ((match = footnoteDefRegex.exec(x)) !== null) {
      footnotes.push({ id: match[1], content: match[2] })
    }
    // Remove footnote-def tags from body
    let result = x.replace(/<footnote-def data-id="\d+">([\s\S]*?)<\/footnote-def>/g, '')
    // Append footnotes section if any exist
    if (footnotes.length > 0) {
      // Sort by id
      footnotes.sort((a, b) => parseInt(a.id) - parseInt(b.id))
      const footnotesHtml = footnotes
        .map((fn) => `<li id="fn${fn.id}">${fn.content} <a href="#fnref${fn.id}">↩</a></li>`)
        .join('\n')
      result += `\n<section class="footnotes">\n<ol>\n${footnotesHtml}\n</ol>\n</section>`
    }
    return result
  },
}

export const asAST: ExportType<any> = {
  mapper: (tag, args) => (children) => [
    tag,
    args ? args : null,
    // Unwrap single-element arrays containing only a string for cleaner AST
    Array.isArray(children) && children.length === 1 && typeof children[0] === 'string' ? children[0] : children,
  ],
  join: (x: any) => {
    // Flatten nested single-element string arrays for cleaner AST
    if (!Array.isArray(x)) return x
    return x.map((item: any) => {
      if (Array.isArray(item) && item.length === 1 && typeof item[0] === 'string') {
        return item[0]
      }
      return item
    })
  },
  postprocess: (obj: Array<any>) => {
    // Filter empty strings and collect footnote definitions at top level only
    const filtered = obj.filter((x: any) => x !== '')
    const footnotes: any[] = []
    const result: any[] = []
    for (const node of filtered) {
      if (Array.isArray(node) && node[0] === 'footnote-def') {
        footnotes.push(node)
      } else {
        result.push(node)
      }
    }
    // Append footnotes section at the end if any exist
    if (footnotes.length > 0) {
      footnotes.sort((a, b) => parseInt(a[1]?.id || '0') - parseInt(b[1]?.id || '0'))
      result.push(['footnotes', null, footnotes])
    }
    return result
  },
}

export const parse = (s: string) => {
  const p = new Parser<any>({
    export: asHTML,
  })
  return p.parse(s)
}
