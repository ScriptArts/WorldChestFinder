import type { AssetDownloadProgress, ScanProgress, SaveProgress } from '../../../shared/types'
import { Progress } from './ui/progress'

type ProgressLike = ScanProgress | SaveProgress | AssetDownloadProgress

interface OperationProgressBarProps {
  title: string
  progress: ProgressLike
}

function toPercent(current: number, total: number): number {
  // 総数が 0 以下なら進捗率は 0 とする
  if (total <= 0) {
    return 0
  }
  return Math.round((current / total) * 100)
}

function progressCountLabel(progress: ProgressLike): string {
  // 総数が 0 以下なら件数ラベルは表示しない
  if (progress.total <= 0) {
    return ''
  }
  return `${progress.current}/${progress.total}`
}

/** スキャン・保存中の操作進捗バー（ツールバー直下の 1 行帯） */
export function OperationProgressBar({ title, progress }: OperationProgressBarProps): JSX.Element {
  const percent = toPercent(progress.current, progress.total)
  const indeterminate = progress.total <= 0
  const countLabel = progressCountLabel(progress)

  let progressBar: JSX.Element
  // 総数不明時は左右に流れる不定進捗バーを表示する
  if (indeterminate) {
    progressBar = (
      <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-primary/15">
        <div className="progress-indeterminate absolute inset-y-0 w-1/3 rounded-sm bg-primary" />
      </div>
    )
  // 総数が分かる場合は通常の進捗バーを表示する
  } else {
    progressBar = <Progress value={percent} />
  }

  let percentLabel = ''
  // 進捗率が計算できるときだけ右端へ％を出す
  if (!indeterminate) {
    percentLabel = `${percent}%`
  }

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-chrome px-3 py-1.5">
      <span className="micro shrink-0 text-primary">{title}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{progress.message}</span>
      {countLabel !== '' && (
        <span className="mono-data shrink-0 text-[11px] text-muted-foreground">{countLabel}</span>
      )}
      <div className="w-32 shrink-0">{progressBar}</div>
      {percentLabel !== '' && (
        <span className="mono-data w-9 shrink-0 text-right text-[11px] text-muted-foreground">{percentLabel}</span>
      )}
    </div>
  )
}
