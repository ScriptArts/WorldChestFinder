import { cn } from '@renderer/lib/utils'

interface ProgressProps {
  value: number
  className?: string
}

/**
 * 進捗率を横棒で表示する。
 *
 * @param value - 0 から 100 までの進捗率
 * @param className - 追加する CSS クラス
 * @returns 進捗バー要素
 */
export function Progress({ value, className }: ProgressProps): JSX.Element {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}>
      <div
        className="h-full bg-primary transition-all duration-150 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
