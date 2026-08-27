import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'

/** スキャンエラーダイアログの表示内容 */
export interface ScanErrorDialogProps {
  /** ダイアログを表示するか */
  open: boolean
  /** 読み込み失敗メッセージ一覧 */
  errors: string[]
  /** 閉じる操作時のコールバック */
  onClose: () => void
}

/**
 * ワールドスキャン完了後の読み込み失敗詳細ダイアログ。
 *
 * @param props - 表示内容とコールバック
 */
export function ScanErrorDialog({ open, errors, onClose }: ScanErrorDialogProps): JSX.Element | null {
  // 非表示時は DOM を描画しない
  if (!open) {
    return null
  }

  const summary = `${errors.length} 件の読み込みに失敗しました。表示できないコンテナがある可能性があります。`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(80vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border-strong bg-card shadow-[0_16px_48px_-12px_rgb(0_0_0/0.4)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-error-dialog-title"
        aria-describedby="scan-error-dialog-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-l-2 border-l-destructive px-4 py-3.5">
          <h2 id="scan-error-dialog-title" className="text-[14px] font-semibold leading-none text-destructive">
            読み込みエラー
          </h2>
          <p id="scan-error-dialog-description" className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            {summary}
          </p>
        </div>
        {/* 失敗内容はログとして読むものなので等幅で並べる */}
        <ScrollArea className="min-h-0 flex-1 border-y border-border bg-muted">
          <ul className="mono-data selectable space-y-1.5 px-4 py-3 text-[11px] leading-relaxed">
            {errors.map((error, index) => {
              return (
                <li key={`${index}-${error}`} className="break-all text-foreground">
                  {error}
                </li>
              )
            })}
          </ul>
        </ScrollArea>
        <div className="flex shrink-0 justify-end bg-muted px-3 py-2.5">
          <Button type="button" onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    </div>
  )
}
