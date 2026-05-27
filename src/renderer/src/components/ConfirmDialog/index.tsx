import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

/** 確認ダイアログの表示内容 */
export interface ConfirmDialogProps {
  /** ダイアログを表示するか */
  open: boolean
  /** 見出し */
  title: string
  /** 説明文 */
  description: string
  /** 確定ボタンのラベル */
  confirmLabel: string
  /** キャンセルボタンのラベル */
  cancelLabel: string
  /** 確定時のコールバック */
  onConfirm: () => void
  /** キャンセル時のコールバック */
  onCancel: () => void
}

/**
 * 操作前確認用のモーダルダイアログ。
 *
 * @param props - 表示内容とコールバック
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element | null {
  // 非表示時は DOM を描画しない
  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <Card
        className="w-full max-w-md shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <CardTitle id="confirm-dialog-title">{title}</CardTitle>
          <CardDescription id="confirm-dialog-description" className="whitespace-pre-line">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
