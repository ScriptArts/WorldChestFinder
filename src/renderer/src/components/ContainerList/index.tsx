import type { ContainerRecord } from '../../../../shared/types'
import { formatContainerPosition } from '../../../../shared/containerUtils'
import { formatContainerTitle } from '../ChestGrid/minecraftChestUtils'
import { Badge } from '../ui/badge'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '@renderer/lib/utils'

/** コンテナ一覧の件数表示用サマリー */
export interface ContainerListSummary {
  /** 現在一覧に表示中の件数 */
  displayed: number
  /** ワールド内の全コンテナ件数 */
  total: number
  /** 検索フィルタが有効か */
  filterActive: boolean
}

interface ContainerListProps {
  containers: ContainerRecord[]
  selectedId: string | null
  containerSummary: ContainerListSummary | null
  onSelect: (id: string) => void
  disabled?: boolean
}

/**
 * 件数サマリーの表示文言を組み立てる。
 *
 * @param summary - 件数サマリー
 */
function formatContainerSummaryLabel(summary: ContainerListSummary): string {
  // 検索中は一致数 / 全体数を表示する
  if (summary.filterActive) {
    return `検索結果: ${summary.displayed} / ${summary.total} コンテナ`
  }
  return `${summary.total} コンテナ`
}

/**
 * スキャン結果のコンテナ一覧（選択・フィルタ連動）。
 */
export function ContainerList({
  containers,
  selectedId,
  containerSummary,
  onSelect,
  disabled = false
}: ContainerListProps): JSX.Element {
  let summaryLabel: JSX.Element | null = null
  // 件数サマリーがあれば一覧上部に表示する
  if (containerSummary !== null) {
    summaryLabel = (
      <p className="shrink-0 px-1 text-sm text-muted-foreground">
        {formatContainerSummaryLabel(containerSummary)}
      </p>
    )
  }

  // コンテナが 0 件なら空状態メッセージを表示する
  if (containers.length === 0) {
    let emptyMessage = 'Items タグを持つコンテナが見つかりません'
    // 検索条件適用中で 0 件ならメッセージを差し替える
    if (containerSummary !== null && containerSummary.filterActive) {
      emptyMessage = '条件に一致するコンテナはありません'
    }
    return (
      <div className="flex flex-1 flex-col gap-2">
        {summaryLabel}
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {summaryLabel}
      <ScrollArea className="min-h-0 flex-1 pr-3">
        <div className="grid gap-2">
          {containers.map((container) => {
            const selected = selectedId === container.id
            return (
              <button
                type="button"
                key={container.id}
                disabled={disabled}
                className={cn(
                  'grid gap-1 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50',
                  selected && 'border-primary bg-accent'
                )}
                onClick={() => onSelect(container.id)}
              >
                <strong className="text-sm">{formatContainerTitle(container.blockEntityId, container)}</strong>
                <span className="text-xs text-muted-foreground">
                  {formatContainerPosition(container)}
                </span>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{container.dimension}</Badge>
                  <Badge variant="outline">{container.sourceType}</Badge>
                  <Badge variant="outline">{container.items.length} items</Badge>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
