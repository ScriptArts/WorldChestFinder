import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { snbtHighlightPlugin, snbtHighlightTheme } from '@renderer/lib/snbt/snbtHighlightPlugin'

interface JsonCodeEditorProps {
  id: string
  value: string
  disabled?: boolean
  /** true のとき親要素の残り高さいっぱいに伸ばす */
  fillHeight?: boolean
  onChange: (value: string) => void
}

const snbtEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: '12px'
  },
  '.cm-scroller': {
    backgroundColor: 'var(--card)',
    fontFamily: 'var(--font-data)',
    lineHeight: '1.6'
  },
  '.cm-content': {
    caretColor: 'var(--foreground)',
    padding: '6px 0'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'color-mix(in oklab, var(--muted-foreground) 65%, transparent)',
    border: 'none',
    borderRight: '1px solid var(--border)',
    paddingRight: '2px'
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 6px 0 8px',
    fontVariantNumeric: 'tabular-nums'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--selection) 8%, transparent)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--foreground)'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 30%, transparent) !important'
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 22%, transparent)',
    outline: 'none'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--foreground)',
    borderLeftWidth: '2px'
  }
})

const snbtEditorExtensions = [snbtHighlightPlugin, snbtHighlightTheme, snbtEditorTheme, EditorView.lineWrapping]

const fillHeightEditorTheme = EditorView.theme({
  '&': {
    height: '100%'
  },
  '.cm-editor': {
    height: '100%'
  },
  '.cm-scroller': {
    overflow: 'auto'
  }
})

function buildSnbtEditorExtensions(fillHeight: boolean): typeof snbtEditorExtensions {
  // 可変高さのときは CodeMirror 本体を親高さに合わせる
  if (fillHeight) {
    return [...snbtEditorExtensions, fillHeightEditorTheme]
  }
  return snbtEditorExtensions
}

/**
 * SNBT 編集専用のコードエディタ。
 *
 * @param id - 入力欄識別子
 * @param value - 表示する SNBT 文字列
 * @param disabled - 編集不可にする場合は true
 * @param onChange - 編集内容変更時の通知
 * @returns SNBT 構文ハイライト付きエディタ
 */
export function JsonCodeEditor({
  id,
  value,
  disabled = false,
  fillHeight = false,
  onChange
}: JsonCodeEditorProps): JSX.Element {
  let isEditable = true
  // 操作中は SNBT 編集を受け付けない
  if (disabled) {
    isEditable = false
  }

  let wrapperClassName = 'overflow-hidden rounded-md border border-input bg-card focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/25'
  let editorHeight = '220px'
  // 親の残り高さに合わせてエディタを伸ばす
  if (fillHeight) {
    wrapperClassName = `${wrapperClassName} flex min-h-0 flex-1 flex-col`
    editorHeight = '100%'
  }

  return (
    <div className={wrapperClassName}>
      <CodeMirror
        id={id}
        value={value}
        height={editorHeight}
        extensions={buildSnbtEditorExtensions(fillHeight)}
        editable={isEditable}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          autocompletion: false
        }}
        onChange={(nextValue) => {
          // 親コンポーネントへ SNBT 文字列の変更を通知する
          onChange(nextValue)
        }}
      />
    </div>
  )
}
