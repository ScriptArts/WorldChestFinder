import type { AssetDownloadProgress, ScanProgress, SaveProgress } from '../../../shared/types'
import { Progress } from './ui/progress'

type ProgressLike = ScanProgress | SaveProgress | AssetDownloadProgress

interface OperationProgressBarProps {
  title: string
  progress: ProgressLike
}

function toPercent(current: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return Math.round((current / total) * 100)
}

function progressCountLabel(progress: ProgressLike): string {
  if (progress.total <= 0) {
    return ''
  }
  return ` (${progress.current}/${progress.total})`
}

/** スキャン・保存中の操作進捗バー */
export function OperationProgressBar({ title, progress }: OperationProgressBarProps): JSX.Element {
  const percent = toPercent(progress.current, progress.total)
  const indeterminate = progress.total <= 0

  let progressBar: JSX.Element
  if (indeterminate) {
    progressBar = (
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-primary/20">
        <div className="absolute inset-y-0 w-1/3 animate-pulse rounded-full bg-primary" />
      </div>
    )
  } else {
    progressBar = <Progress value={percent} className="h-3" />
  }

  return (
    <div className="border-b-2 border-primary bg-primary/10 px-4 py-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-base font-semibold">{title}</span>
        <span className="font-medium text-foreground">
          {progress.message}
          {progressCountLabel(progress)}
        </span>
      </div>
      {progressBar}
    </div>
  )
}
