import { Button } from '../ui/button'

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-6"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-border-strong bg-card shadow-[0_16px_48px_-12px_rgb(0_0_0/0.4)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 py-3.5">
          <h2 id="confirm-dialog-title" className="text-[14px] font-semibold leading-none">
            {title}
          </h2>
          <p
            id="confirm-dialog-description"
            className="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-muted-foreground"
          >
            {description}
          </p>
        </div>
        {/* 操作列は罫線で区切って、押し間違えにくい位置に置く */}
        <div className="flex justify-end gap-2 border-t border-border bg-muted px-3 py-2.5">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
