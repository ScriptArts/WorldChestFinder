import CodeMirror from '@uiw/react-codemirror'
import { oneDarkTheme } from '@codemirror/theme-one-dark'
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
    fontSize: '0.75rem'
  },
  '.cm-scroller': {
    backgroundColor: 'var(--card)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace'
  },
  '.cm-content': {
    caretColor: 'var(--foreground)'
  },
  '.cm-gutters': {
    backgroundColor: 'color-mix(in oklab, var(--card) 88%, black 12%)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--accent) 28%, transparent)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--accent) 22%, transparent)'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 26%, transparent) !important'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--foreground)'
  }
})

const snbtEditorExtensions = [snbtHighlightPlugin, snbtHighlightTheme, oneDarkTheme, snbtEditorTheme, EditorView.lineWrapping]

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

  let wrapperClassName = 'overflow-hidden rounded-md border border-input bg-transparent'
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
