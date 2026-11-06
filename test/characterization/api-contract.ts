// Compile consumer-facing entrypoints without pinning Parsimmon implementation fields.
import { parse, Parser, asAST, asHTML, Plugin, Mapper, ExportType } from '../../src/parser'

const plugin: Plugin<string> = (args, content, mapper, join) =>
  mapper('span', { args })(join([content, args]))
const mapper: Mapper<string> = asHTML.mapper
const format: ExportType<string> = { mapper, join: asHTML.join, postprocess: asHTML.postprocess }
const html = new Parser<string>({ export: format, plugins: { probe: plugin } })
const ast = new Parser({ export: asAST })
const text: string = parse('text')
html.parse(text)
ast.parse('｜漢字《かんじ》')
