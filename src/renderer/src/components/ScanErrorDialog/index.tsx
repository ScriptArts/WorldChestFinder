import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      role="presentation"
      onClick={onClose}
    >
      <Card
        className="flex max-h-[min(80vh,640px)] w-full max-w-2xl flex-col shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-error-dialog-title"
        aria-describedby="scan-error-dialog-description"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader className="shrink-0">
          <CardTitle id="scan-error-dialog-title">読み込みエラー</CardTitle>
          <CardDescription id="scan-error-dialog-description">{summary}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <ScrollArea className="max-h-[min(50vh,420px)] rounded-md border bg-muted/20 p-3">
            <ul className="space-y-2 font-mono text-xs leading-relaxed">
              {errors.map((error, index) => {
                return (
                  <li key={`${index}-${error}`} className="break-all text-foreground">
                    {error}
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
          <div className="flex shrink-0 justify-end">
            <Button type="button" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
