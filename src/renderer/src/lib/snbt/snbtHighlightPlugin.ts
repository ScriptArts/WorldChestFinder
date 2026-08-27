import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

interface TextRange {
  from: number
  to: number
}

interface MarkEntry {
  from: number
  to: number
  className: string
  style: string
}

/** ライト / ダークの両テーマへ追従させるため、色は CSS 変数から引く */
const SNBT_COLORS = {
  string: 'var(--snbt-string)',
  number: 'var(--snbt-number)',
  key: 'var(--snbt-key)',
  arrayType: 'var(--snbt-array-type)',
  punctuation: 'var(--snbt-punctuation)'
}

/** 装飾種別ごとの優先度（大きいほど優先） */
const MARK_PRIORITY: Record<string, number> = {
  'cm-snbt-string': 50,
  'cm-snbt-array-type': 40,
  'cm-snbt-number': 30,
  'cm-snbt-key': 20,
  'cm-snbt-punctuation': 10
}

/** 範囲同士が重なるか判定する */
function rangesOverlap(left: TextRange, right: TextRange): boolean {
  // 完全に離れていれば重ならない
  if (left.to <= right.from || right.to <= left.from) {
    return false
  }
  return true
}

/** 既存範囲と重ならない一致結果を MarkEntry として収集する */
function collectMatches(
  text: string,
  baseOffset: number,
  blocked: TextRange[],
  regexp: RegExp,
  className: string,
  style: string,
  target: MarkEntry[]
): void {
  regexp.lastIndex = 0
  let match = regexp.exec(text)
  // 正規表現一致ごとに装飾候補を評価する
  while (match !== null) {
    const matchedText = match[0]
    // 空一致は無限ループ防止のため読み飛ばす
    if (matchedText.length === 0) {
      regexp.lastIndex += 1
      match = regexp.exec(text)
      continue
    }
    const from = baseOffset + match.index
    const to = from + matchedText.length
    const candidate: TextRange = { from, to }
    let blockedByExisting = false
    // 文字列など優先範囲と重なる場合は装飾しない
    for (let index = 0; index < blocked.length; index += 1) {
      if (rangesOverlap(candidate, blocked[index])) {
        blockedByExisting = true
        break
      }
    }
    // 重なりがなければ候補一覧へ追加する
    if (!blockedByExisting) {
      target.push({ from, to, className, style })
    }
    match = regexp.exec(text)
  }
}

/** 文字列リテラルの範囲一覧を収集する */
function collectStringRanges(text: string, baseOffset: number): TextRange[] {
  const blockedRanges: TextRange[] = []
  const stringPattern = /"(?:[^"\\]|\\.)*"/g
  let stringMatch = stringPattern.exec(text)
  // 文字列一致ごとに範囲を記録する
  while (stringMatch !== null) {
    blockedRanges.push({
      from: baseOffset + stringMatch.index,
      to: baseOffset + stringMatch.index + stringMatch[0].length
    })
    stringMatch = stringPattern.exec(text)
  }
  return blockedRanges
}

/** 重なる装飾候補を優先度で解決する */
function resolveNonOverlappingMarks(entries: MarkEntry[]): MarkEntry[] {
  const sortedCandidates = [...entries].sort((left, right) => {
    const leftPriority = MARK_PRIORITY[left.className]
    const rightPriority = MARK_PRIORITY[right.className]
    // 優先度が高い候補を先に採用する
    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority
    }
    const leftLength = left.to - left.from
    const rightLength = right.to - right.from
    // 同優先度なら長い一致を優先する
    if (leftLength !== rightLength) {
      return rightLength - leftLength
    }
    // 最後に位置の早い順で安定化する
    if (left.from !== right.from) {
      return left.from - right.from
    }
    return left.to - right.to
  })

  const accepted: MarkEntry[] = []
  // 高優先度から順に重ならないものだけ採用する
  for (let index = 0; index < sortedCandidates.length; index += 1) {
    const candidate = sortedCandidates[index]
    let overlapsAccepted = false
    // 採用済み範囲と重なる候補は除外する
    for (let acceptedIndex = 0; acceptedIndex < accepted.length; acceptedIndex += 1) {
      if (rangesOverlap(candidate, accepted[acceptedIndex])) {
        overlapsAccepted = true
        break
      }
    }
    // 重なりがなければ採用する
    if (!overlapsAccepted) {
      accepted.push(candidate)
    }
  }

  return accepted.sort((left, right) => {
    // builder へ渡す前に開始位置昇順へ並べ替える
    if (left.from !== right.from) {
      return left.from - right.from
    }
    return left.to - right.to
  })
}

/** 可視範囲の SNBT ハイライト装飾を構築する */
function buildSnbtDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const markEntries: MarkEntry[] = []
  const keyPattern = /(?:[A-Za-z_][A-Za-z0-9_\-+.]*|"(?:[^"\\]|\\.)*")(?=[ \t]*:)/
  // 可視範囲の各行を走査する
  for (const { from, to } of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(from).number
    const endLine = view.state.doc.lineAt(to).number
    // 行単位で SNBT トークン候補を収集する
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber)
      let lineFrom = line.from
      let lineTo = line.to
      // 可視範囲外の部分は切り詰める
      if (lineFrom < from) {
        lineFrom = from
      }
      if (lineTo > to) {
        lineTo = to
      }
      // 空行はスキップする
      if (lineFrom >= lineTo) {
        continue
      }
      const lineText = view.state.doc.sliceString(lineFrom, lineTo)
      const lineOffset = lineFrom
      const blockedRanges = collectStringRanges(lineText, lineOffset)

      collectMatches(
        lineText,
        lineOffset,
        blockedRanges,
        /"(?:[^"\\]|\\.)*"/g,
        'cm-snbt-string',
        SNBT_COLORS.string,
        markEntries
      )
      collectMatches(
        lineText,
        lineOffset,
        blockedRanges,
        /\[[BILSFDbilsfd];/g,
        'cm-snbt-array-type',
        SNBT_COLORS.arrayType,
        markEntries
      )
      collectMatches(
        lineText,
        lineOffset,
        blockedRanges,
        /-?(?:\d+\.\d+|\.\d+|\d+)[bBsSiIlLfFdD]?/g,
        'cm-snbt-number',
        SNBT_COLORS.number,
        markEntries
      )
      collectMatches(
        lineText,
        lineOffset,
        blockedRanges,
        new RegExp(`^[ \\t]*${keyPattern.source}`, 'g'),
        'cm-snbt-key',
        SNBT_COLORS.key,
        markEntries
      )
      collectMatches(
        lineText,
        lineOffset,
        blockedRanges,
        new RegExp(`(?<=[\\{,][ \\t]*)${keyPattern.source}`, 'g'),
        'cm-snbt-key',
        SNBT_COLORS.key,
        markEntries
      )
      collectMatches(
        lineText,
        lineOffset,
        blockedRanges,
        /[{}:;,]/g,
        'cm-snbt-punctuation',
        SNBT_COLORS.punctuation,
        markEntries
      )
      collectMatches(
        lineText,
        lineOffset,
        blockedRanges,
        /\[(?![BILSFDbilsfd];)/g,
        'cm-snbt-punctuation',
        SNBT_COLORS.punctuation,
        markEntries
      )
      collectMatches(
        lineText,
        lineOffset,
        blockedRanges,
        /]/g,
        'cm-snbt-punctuation',
        SNBT_COLORS.punctuation,
        markEntries
      )
    }
  }

  const resolvedEntries = resolveNonOverlappingMarks(markEntries)
  // 昇順で builder へ追加する
  for (let index = 0; index < resolvedEntries.length; index += 1) {
    const entry = resolvedEntries[index]
    builder.add(
      entry.from,
      entry.to,
      Decoration.mark({
        class: entry.className,
        attributes: { style: `color: ${entry.style}` }
      })
    )
  }
  return builder.finish()
}

/**
 * SNBT 向けの正規表現ベースシンタックスハイライト。
 *
 * @remarks JSON モードでは表現できない `12b` や `[I;1,2,3]` などを色分けする。
 */
export const snbtHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildSnbtDecorations(view)
    }

    update(update: ViewUpdate): void {
      // ドキュメント変更または表示範囲変更時だけ装飾を更新する
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildSnbtDecorations(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations
  }
)

/** SNBT ハイライト用の色定義（テーマ変数に追従） */
export const snbtHighlightTheme = EditorView.theme({
  '.cm-snbt-string': {
    color: SNBT_COLORS.string
  },
  '.cm-snbt-number': {
    color: SNBT_COLORS.number
  },
  '.cm-snbt-key': {
    color: SNBT_COLORS.key
  },
  '.cm-snbt-array-type': {
    color: SNBT_COLORS.arrayType
  },
  '.cm-snbt-punctuation': {
    color: SNBT_COLORS.punctuation
  }
})
