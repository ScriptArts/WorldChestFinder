import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'

interface JsonCodeEditorProps {
  id: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

const jsonEditorTheme = EditorView.theme({
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

const jsonEditorExtensions = [json(), oneDark, jsonEditorTheme, EditorView.lineWrapping]

/**
 * JSON 編集専用のコードエディタ。
 *
 * @param id - 入力欄識別子
 * @param value - 表示する JSON 文字列
 * @param disabled - 編集不可にする場合は true
 * @param onChange - 編集内容変更時の通知
 * @returns JSON 構文ハイライト付きエディタ
 */
export function JsonCodeEditor({ id, value, disabled = false, onChange }: JsonCodeEditorProps): JSX.Element {
  let isEditable = true
  // 操作中は JSON 編集を受け付けない
  if (disabled) {
    isEditable = false
  }

  return (
    <div className="overflow-hidden rounded-md border border-input bg-transparent">
      <CodeMirror
        id={id}
        value={value}
        height="220px"
        extensions={jsonEditorExtensions}
        editable={isEditable}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          autocompletion: false
        }}
        onChange={(nextValue) => {
          // 親コンポーネントへ JSON 文字列の変更を通知する
          onChange(nextValue)
        }}
      />
    </div>
  )
}
