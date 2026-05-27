import type { NbtCompound, NbtTag } from './nbtTypes'

/** SNBT 変換オプション */
export interface SnbtFormatOptions {
  /** 整形出力する場合は true */
  pretty?: boolean
}

type TokenKind =
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'colon'
  | 'semicolon'
  | 'string'
  | 'number'
  | 'identifier'
  | 'eof'

interface Token {
  kind: TokenKind
  value: string
  numberValue?: number
  numberSuffix?: string
}

/** SNBT パースエラー */
export class SnbtParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnbtParseError'
  }
}

/**
 * NBT compound を SNBT 文字列へ変換する。
 *
 * @param compound - 変換元 compound
 * @param options - 出力形式
 */
export function compoundToSnbt(compound: NbtCompound, options?: SnbtFormatOptions): string {
  let pretty = false
  // 整形出力が指定されていれば pretty を有効化する
  if (options !== undefined && options.pretty === true) {
    pretty = true
  }
  // 整形有無に応じて SNBT を組み立てる
  if (pretty) {
    return `{\n${stringifyCompoundEntries(compound, 1)}\n}`
  }
  return `{${stringifyCompoundEntries(compound, 0)}}`
}

/**
 * SNBT 文字列を NBT compound へ変換する。
 *
 * @param snbt - SNBT 文字列
 * @returns パース結果 compound
 * @throws SnbtParseError 形式が不正な場合
 */
export function snbtToCompound(snbt: string): NbtCompound {
  const parser = new SnbtParser(snbt)
  const tag = parser.parseRootCompound()
  // compound 以外のルートは許可しない
  if (tag.type !== 'compound') {
    throw new SnbtParseError('SNBT のルートは compound である必要があります')
  }
  return tag.value as NbtCompound
}

/**
 * 空スロット用の SNBT 文字列を生成する。
 *
 * @param slot - スロット番号
 * @param itemId - アイテム ID
 * @param count - 個数
 * @param usesLegacyItemCount - 空 SNBT テンプレートで Count (byte) を使う場合 true
 */
export function buildItemSnbt(
  slot: number,
  itemId: string,
  count: number,
  usesLegacyItemCount: boolean
): string {
  if (usesLegacyItemCount) {
    return compoundToSnbt(
      {
        Slot: { type: 'byte', value: slot },
        id: { type: 'string', value: itemId },
        Count: { type: 'byte', value: count }
      },
      { pretty: true }
    )
  }
  return compoundToSnbt(
    {
      Slot: { type: 'byte', value: slot },
      id: { type: 'string', value: itemId },
      count: { type: 'int', value: count }
    },
    { pretty: true }
  )
}

/**
 * SNBT 内の Slot フィールドだけを差し替える。
 *
 * @param snbt - 元 SNBT
 * @param slot - 新しいスロット番号
 */
export function replaceSlotInSnbt(snbt: string, slot: number): string {
  const compound = snbtToCompound(snbt)
  compound.Slot = { type: 'byte', value: slot }
  return compoundToSnbt(compound, { pretty: true })
}

function indentText(level: number): string {
  let result = ''
  // 指定段数分インデント空白を追加する
  for (let index = 0; index < level; index += 1) {
    result += '  '
  }
  return result
}

function escapeSnbtString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

function shouldQuoteKey(key: string): boolean {
  // 空キーは引用符で囲む
  if (key.length === 0) {
    return true
  }
  // 識別子として使えない文字が含まれる場合は引用符で囲む
  if (!/^[A-Za-z0-9_\-+.]+$/.test(key)) {
    return true
  }
  return false
}

function formatSnbtKey(key: string): string {
  // 識別子として書けるキーはそのまま出力する
  if (!shouldQuoteKey(key)) {
    return key
  }
  return `"${escapeSnbtString(key)}"`
}

function stringifyNumberTag(tag: NbtTag): string {
  const value = Number(tag.value)
  // byte 型は b サフィックス付きで出力する
  if (tag.type === 'byte') {
    return `${value}b`
  }
  // short 型は s サフィックス付きで出力する
  if (tag.type === 'short') {
    return `${value}s`
  }
  // long 型は L サフィックス付きで出力する
  if (tag.type === 'long') {
    return `${value}L`
  }
  // float 型は f サフィックス付きで出力する
  if (tag.type === 'float') {
    return `${value}f`
  }
  // double 型は d サフィックス付きで出力する
  if (tag.type === 'double') {
    return `${value}d`
  }
  return String(value)
}

function stringifyTagValue(tag: NbtTag, indentLevel: number): string {
  // string タグは引用符付きで出力する
  if (tag.type === 'string') {
    return `"${escapeSnbtString(String(tag.value))}"`
  }
  // 数値タグは SNBT 数値リテラルとして出力する
  if (
    tag.type === 'byte'
    || tag.type === 'short'
    || tag.type === 'int'
    || tag.type === 'long'
    || tag.type === 'float'
    || tag.type === 'double'
  ) {
    return stringifyNumberTag(tag)
  }
  // compound タグは再帰的に SNBT へ変換する
  if (tag.type === 'compound') {
    const compound = tag.value as NbtCompound
    // 整形出力時は改行付き compound を返す
    if (indentLevel > 0) {
      return `{\n${stringifyCompoundEntries(compound, indentLevel)}\n${indentText(indentLevel - 1)}}`
    }
    return `{${stringifyCompoundEntries(compound, 0)}}`
  }
  // list タグは要素型に応じた SNBT list を出力する
  if (tag.type === 'list') {
    return stringifyListTag(tag, indentLevel)
  }
  // byteArray タグは [B;...] 形式で出力する
  if (tag.type === 'byteArray') {
    const values = tag.value as number[]
    const entries: string[] = []
    // 各 byte 値を SNBT リテラルへ変換する
    for (const entry of values) {
      entries.push(`${entry}b`)
    }
    return `[B;${entries.join(',')}]`
  }
  // intArray タグは [I;...] 形式で出力する
  if (tag.type === 'intArray') {
    const values = tag.value as number[]
    return `[I;${values.join(',')}]`
  }
  // longArray タグは [L;...] 形式で出力する
  if (tag.type === 'longArray') {
    const values = tag.value as number[]
    const entries: string[] = []
    // 各 long 値を SNBT リテラルへ変換する
    for (const entry of values) {
      entries.push(`${entry}L`)
    }
    return `[L;${entries.join(',')}]`
  }
  return `"${escapeSnbtString(String(tag.value))}"`
}

function stringifyListTag(tag: NbtTag, indentLevel: number): string {
  const listValue = tag.value as { type: string; value: unknown[] }
  const itemType = listValue.type
  const entries = listValue.value
  const rendered: string[] = []
  // 各 list 要素を SNBT へ変換する
  for (const entry of entries) {
    rendered.push(stringifyListEntry(entry, itemType, indentLevel))
  }
  // byte/int/long の typed array は [X;...] 形式で出力する
  if (itemType === 'byte') {
    return `[B;${rendered.join(',')}]`
  }
  if (itemType === 'int') {
    return `[I;${rendered.join(',')}]`
  }
  if (itemType === 'long') {
    return `[L;${rendered.join(',')}]`
  }
  return `[${rendered.join(',')}]`
}

function compoundFromListEntry(entry: unknown): NbtCompound | null {
  // NBT compound タグ形式なら value を取り出す
  if (typeof entry === 'object' && entry !== null && 'type' in entry) {
    const tag = entry as NbtTag
    if (tag.type === 'compound' && typeof tag.value === 'object' && tag.value !== null) {
      return tag.value as NbtCompound
    }
  }
  // prismarine-nbt の list 要素は plain compound の場合がある
  if (typeof entry === 'object' && entry !== null && !Array.isArray(entry) && !('type' in entry)) {
    return entry as NbtCompound
  }
  return null
}

function stringifyListEntry(entry: unknown, itemType: string, indentLevel: number): string {
  // compound list 要素は compound タグとして整形する
  if (itemType === 'compound') {
    const compound = compoundFromListEntry(entry)
    // 変換できない要素は空 compound として出力する
    if (compound === null) {
      return '{}'
    }
    return stringifyTagValue({ type: 'compound', value: compound }, indentLevel)
  }
  // 数値 list 要素は要素型に応じた SNBT 数値を出力する
  if (itemType === 'byte') {
    return `${Number(entry)}b`
  }
  if (itemType === 'short') {
    return `${Number(entry)}s`
  }
  if (itemType === 'int') {
    return String(Number(entry))
  }
  if (itemType === 'long') {
    return `${Number(entry)}L`
  }
  if (itemType === 'float') {
    return `${Number(entry)}f`
  }
  if (itemType === 'double') {
    return `${Number(entry)}d`
  }
  if (itemType === 'string') {
    return `"${escapeSnbtString(String(entry))}"`
  }
  return String(entry)
}

function stringifyCompoundEntries(compound: NbtCompound, indentLevel: number): string {
  const lines: string[] = []
  const prefix = indentText(indentLevel)
  // 各フィールドを SNBT エントリへ変換する
  for (const [key, tag] of Object.entries(compound)) {
    const renderedValue = stringifyTagValue(tag, indentLevel + 1)
    // 整形出力時は 1 行 1 フィールドで出力する
    if (indentLevel > 0) {
      lines.push(`${prefix}${formatSnbtKey(key)}: ${renderedValue}`)
      continue
    }
    lines.push(`${formatSnbtKey(key)}:${renderedValue}`)
  }
  // 整形出力時はカンマ区切り、compact 時もカンマ区切り
  if (indentLevel > 0) {
    return lines.join(',\n')
  }
  return lines.join(',')
}

class SnbtParser {
  private readonly tokens: Token[]
  private index = 0

  constructor(input: string) {
    this.tokens = tokenizeSnbt(input)
  }

  parseRootCompound(): NbtTag {
    this.skipIgnorable()
    const tag = this.parseTagValue()
    this.skipIgnorable()
    // 末尾に余分なトークンがあればエラー
    if (this.peek().kind !== 'eof') {
      throw new SnbtParseError('SNBT の末尾に不要な文字があります')
    }
    return tag
  }

  private peek(): Token {
    return this.tokens[this.index]
  }

  private consume(): Token {
    const token = this.tokens[this.index]
    this.index += 1
    return token
  }

  private expect(kind: TokenKind, message: string): Token {
    const token = this.consume()
    // 期待したトークン種別と一致しない場合はエラー
    if (token.kind !== kind) {
      throw new SnbtParseError(message)
    }
    return token
  }

  private skipIgnorable(): void {
    // トークナイザが空白を除去済みのため何もしない
  }

  private parseTagValue(): NbtTag {
    this.skipIgnorable()
    const token = this.peek()
    // compound リテラルをパースする
    if (token.kind === 'lbrace') {
      return { type: 'compound', value: this.parseCompoundBody() }
    }
    // list リテラルをパースする
    if (token.kind === 'lbracket') {
      return this.parseListValue()
    }
    // 文字列リテラルをパースする
    if (token.kind === 'string') {
      this.consume()
      return { type: 'string', value: token.value }
    }
    // 数値リテラルをパースする
    if (token.kind === 'number') {
      return this.parseNumberTag(this.consume())
    }
    // 識別子リテラルは unquoted string として扱う
    if (token.kind === 'identifier') {
      this.consume()
      return { type: 'string', value: token.value }
    }
    throw new SnbtParseError('SNBT の値を読み取れませんでした')
  }

  private parseCompoundBody(): NbtCompound {
    this.expect('lbrace', 'compound の開始 { が必要です')
    this.skipIgnorable()
    const compound: NbtCompound = {}
    // 空 compound なら即終了する
    if (this.peek().kind === 'rbrace') {
      this.consume()
      return compound
    }
    // 各フィールドを順に読み取る
    while (true) {
      const key = this.parseKey()
      this.skipIgnorable()
      this.expect('colon', 'フィールド名の後に : が必要です')
      this.skipIgnorable()
      compound[key] = this.parseTagValue()
      this.skipIgnorable()
      const next = this.peek()
      // 閉じ括弧なら compound 終了
      if (next.kind === 'rbrace') {
        this.consume()
        return compound
      }
      this.expect('comma', 'compound フィールドの区切り , が必要です')
      this.skipIgnorable()
    }
  }

  private parseKey(): string {
    const token = this.consume()
    // キーは string または identifier である必要がある
    if (token.kind === 'string' || token.kind === 'identifier') {
      return token.value
    }
    throw new SnbtParseError('compound のキー名が不正です')
  }

  private parseListValue(): NbtTag {
    this.expect('lbracket', 'list の開始 [ が必要です')
    this.skipIgnorable()
    // 空 list は compound list として扱う
    if (this.peek().kind === 'rbracket') {
      this.consume()
      return { type: 'list', value: { type: 'compound', value: [] } }
    }

    let explicitType: string | null = null
    const first = this.peek()
    // typed array 形式 [T; ...] を判定する
    if (first.kind === 'identifier' && this.tokens[this.index + 1] !== undefined) {
      const maybeSemicolon = this.tokens[this.index + 1]
      // 識別子の直後が ; なら typed array として読む
      if (maybeSemicolon.kind === 'semicolon') {
        explicitType = this.consume().value.toUpperCase()
        this.consume()
        this.skipIgnorable()
      }
    }

    const values: unknown[] = []
    // list 要素を順に読み取る
    while (true) {
      const tag = this.parseTagValue()
      values.push(convertListStoredValue(tag, explicitType))
      this.skipIgnorable()
      const next = this.peek()
      // 閉じ括弧なら list 終了
      if (next.kind === 'rbracket') {
        this.consume()
        break
      }
      this.expect('comma', 'list 要素の区切り , が必要です')
      this.skipIgnorable()
    }

    const itemType = resolveListItemType(explicitType, values)
    return { type: 'list', value: { type: itemType, value: values } }
  }

  private parseNumberTag(token: Token): NbtTag {
    const suffix = token.numberSuffix
    const value = token.numberValue
    // 数値本体が無い場合はエラー
    if (value === undefined) {
      throw new SnbtParseError('数値リテラルが不正です')
    }
    // サフィックスが無い場合は int として扱う
    if (suffix === undefined || suffix === '') {
      return { type: 'int', value }
    }
    const normalized = suffix.toLowerCase()
    // byte サフィックス
    if (normalized === 'b') {
      return { type: 'byte', value }
    }
    // short サフィックス
    if (normalized === 's') {
      return { type: 'short', value }
    }
    // int サフィックス
    if (normalized === 'i') {
      return { type: 'int', value }
    }
    // long サフィックス
    if (normalized === 'l') {
      return { type: 'long', value }
    }
    // float サフィックス
    if (normalized === 'f') {
      return { type: 'float', value }
    }
    // double サフィックス
    if (normalized === 'd') {
      return { type: 'double', value }
    }
    throw new SnbtParseError(`未対応の数値サフィックスです: ${suffix}`)
  }
}

function convertListStoredValue(tag: NbtTag, explicitType: string | null): unknown {
  // typed compound list は compound エントリ形式で保持する
  if (explicitType === 'COMPOUND' || tag.type === 'compound') {
    return { type: 'compound', value: tag.value as NbtCompound }
  }
  // string list は plain string として保持する
  if (tag.type === 'string') {
    return tag.value
  }
  // 数値 list は plain number として保持する
  if (
    tag.type === 'byte'
    || tag.type === 'short'
    || tag.type === 'int'
    || tag.type === 'long'
    || tag.type === 'float'
    || tag.type === 'double'
  ) {
    return tag.value
  }
  return tag.value
}

function resolveListItemType(explicitType: string | null, values: unknown[]): string {
  // typed array 指定があればそれを優先する
  if (explicitType !== null) {
    if (explicitType === 'B') {
      return 'byte'
    }
    if (explicitType === 'I') {
      return 'int'
    }
    if (explicitType === 'L') {
      return 'long'
    }
    if (explicitType === 'S') {
      return 'short'
    }
    if (explicitType === 'F') {
      return 'float'
    }
    if (explicitType === 'D') {
      return 'double'
    }
    if (explicitType === 'COMPOUND') {
      return 'compound'
    }
    if (explicitType === 'STRING') {
      return 'string'
    }
    throw new SnbtParseError(`未対応の list 型指定です: ${explicitType}`)
  }

  // 空 list は compound list とする
  if (values.length === 0) {
    return 'compound'
  }

  const first = values[0]
  // 先頭要素から list 型を推定する
  if (typeof first === 'object' && first !== null && 'type' in first) {
    return 'compound'
  }
  if (typeof first === 'string') {
    return 'string'
  }
  if (typeof first === 'number') {
    return 'int'
  }
  return 'compound'
}

function tokenizeSnbt(input: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < input.length) {
    const char = input[index]

    // 空白は読み飛ばす
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      index += 1
      continue
    }

    // 単記号トークンを読み取る
    if (char === '{') {
      tokens.push({ kind: 'lbrace', value: '{' })
      index += 1
      continue
    }
    if (char === '}') {
      tokens.push({ kind: 'rbrace', value: '}' })
      index += 1
      continue
    }
    if (char === '[') {
      tokens.push({ kind: 'lbracket', value: '[' })
      index += 1
      continue
    }
    if (char === ']') {
      tokens.push({ kind: 'rbracket', value: ']' })
      index += 1
      continue
    }
    if (char === ',') {
      tokens.push({ kind: 'comma', value: ',' })
      index += 1
      continue
    }
    if (char === ':') {
      tokens.push({ kind: 'colon', value: ':' })
      index += 1
      continue
    }
    if (char === ';') {
      tokens.push({ kind: 'semicolon', value: ';' })
      index += 1
      continue
    }

    // 文字列リテラルを読み取る
    if (char === '"') {
      const parsed = readQuotedString(input, index)
      tokens.push({ kind: 'string', value: parsed.value })
      index = parsed.nextIndex
      continue
    }

    // 数値または identifier を読み取る
    const literal = readNumberOrIdentifier(input, index)
    // 数値リテラルとして解釈できる場合
    if (literal.isNumber) {
      tokens.push({
        kind: 'number',
        value: literal.text,
        numberValue: literal.numberValue,
        numberSuffix: literal.numberSuffix
      })
      index = literal.nextIndex
      continue
    }
    tokens.push({ kind: 'identifier', value: literal.text })
    index = literal.nextIndex
  }

  tokens.push({ kind: 'eof', value: '' })
  return tokens
}

function readQuotedString(input: string, start: number): { value: string; nextIndex: number } {
  let index = start + 1
  let value = ''
  // 閉じ引用符まで文字を読み取る
  while (index < input.length) {
    const char = input[index]
    // 終端引用符に達したら終了する
    if (char === '"') {
      return { value, nextIndex: index + 1 }
    }
    // エスケープシーケンスを解釈する
    if (char === '\\') {
      index += 1
      // バックスラッシュ単体で文字列が終わる場合はエラー
      if (index >= input.length) {
        throw new SnbtParseError('文字列のエスケープが不正です')
      }
      const escaped = input[index]
      // よく使うエスケープを復元する
      if (escaped === 'n') {
        value += '\n'
      } else if (escaped === 'r') {
        value += '\r'
      } else if (escaped === 't') {
        value += '\t'
      } else if (escaped === '"') {
        value += '"'
      } else if (escaped === '\\') {
        value += '\\'
      } else {
        value += escaped
      }
      index += 1
      continue
    }
    value += char
    index += 1
  }
  throw new SnbtParseError('文字列が閉じられていません')
}

function readNumberOrIdentifier(
  input: string,
  start: number
): {
  text: string
  nextIndex: number
  isNumber: boolean
  numberValue?: number
  numberSuffix?: string
} {
  let index = start
  let text = ''
  // 符号を許容する
  if (input[index] === '-') {
    text += input[index]
    index += 1
  }
  const bodyStart = index
  // 整数部を読み取る
  while (index < input.length) {
    const char = input[index]
    // 数字と小数点を数値本体として読む
    if ((char >= '0' && char <= '9') || char === '.') {
      text += char
      index += 1
      continue
    }
    break
  }
  // 数字本体が無ければ identifier として読む
  if (index === bodyStart) {
    // 識別子文字を順に読む
    while (index < input.length) {
      const char = input[index]
      // 区切り記号に達したら終了する
      if (
        char === '{'
        || char === '}'
        || char === '['
        || char === ']'
        || char === ','
        || char === ':'
        || char === ';'
        || char === ' '
        || char === '\n'
        || char === '\r'
        || char === '\t'
        || char === '"'
      ) {
        break
      }
      text += char
      index += 1
    }
    return { text, nextIndex: index, isNumber: false }
  }

  let suffix = ''
  // 数値サフィックスを読み取る
  if (index < input.length) {
    const suffixChar = input[index]
    if (
      suffixChar === 'b'
      || suffixChar === 'B'
      || suffixChar === 's'
      || suffixChar === 'S'
      || suffixChar === 'i'
      || suffixChar === 'I'
      || suffixChar === 'l'
      || suffixChar === 'L'
      || suffixChar === 'f'
      || suffixChar === 'F'
      || suffixChar === 'd'
      || suffixChar === 'D'
    ) {
      suffix = suffixChar
      text += suffixChar
      index += 1
    }
  }

  const numericBody = text.endsWith(suffix) ? text.slice(0, text.length - suffix.length) : text
  const numberValue = Number(numericBody)
  // 数値として解釈できない場合は identifier とする
  if (Number.isNaN(numberValue)) {
    return { text, nextIndex: index, isNumber: false }
  }
  return {
    text,
    nextIndex: index,
    isNumber: true,
    numberValue,
    numberSuffix: suffix
  }
}
