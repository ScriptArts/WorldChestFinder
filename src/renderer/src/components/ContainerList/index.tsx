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
 * 一覧見出しの左側に出す文言を返す。
 *
 * @param summary - 件数サマリー
 */
function formatContainerHeading(summary: ContainerListSummary | null): string {
  // 検索条件が有効なときは検索結果であることを明示する
  if (summary !== null && summary.filterActive) {
    return '検索結果'
  }
  return 'コンテナ'
}

/**
 * 一覧見出しの右側に出す件数を返す。
 *
 * @param summary - 件数サマリー
 */
function formatContainerCount(summary: ContainerListSummary | null): string {
  // サマリー未取得（スキャン前）は件数を出さない
  if (summary === null) {
    return ''
  }
  // 検索中は「一致数 / 全体数」を出す
  if (summary.filterActive) {
    return `${summary.displayed} / ${summary.total}`
  }
  return String(summary.total)
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
  const heading = (
    <div className="micro flex shrink-0 items-center justify-between gap-2 border-y border-border bg-muted px-3 py-2 text-muted-foreground">
      <span>{formatContainerHeading(containerSummary)}</span>
      <span className="mono-data text-[11px] font-semibold">{formatContainerCount(containerSummary)}</span>
    </div>
  )

  // コンテナが 0 件なら空状態メッセージを表示する
  if (containers.length === 0) {
    let emptyMessage = 'Items タグを持つコンテナが見つかりません'
    // 検索条件適用中で 0 件ならメッセージを差し替える
    if (containerSummary !== null && containerSummary.filterActive) {
      emptyMessage = '条件に一致するコンテナはありません'
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {heading}
        <div className="flex flex-1 items-center justify-center px-6 py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {heading}
      <ScrollArea className="min-h-0 flex-1">
        <ul className="divide-y divide-border/70">
          {containers.map((container) => {
            const selected = selectedId === container.id
            let itemCountToneClass = 'text-muted-foreground'
            // 空のコンテナは件数を目立たせない
            if (container.items.length === 0) {
              itemCountToneClass = 'text-muted-foreground/50'
            }

            return (
              <li key={container.id}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-current={selected}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-l-2 border-transparent py-1.5 pl-2.5 pr-2.5 text-left transition-colors',
                    'hover:bg-accent/60 disabled:pointer-events-none disabled:opacity-45',
                    selected && 'border-l-selection bg-selection/8'
                  )}
                  onClick={() => onSelect(container.id)}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-medium">
                      {formatContainerTitle(container.blockEntityId, container)}
                    </span>
                    <span className={cn('mono-data ml-auto shrink-0 text-[11px]', itemCountToneClass)}>
                      {container.items.length}
                    </span>
                  </div>
                  <div className="mono-data flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="shrink-0">{container.dimension}</span>
                    <span className="text-border-strong" aria-hidden>|</span>
                    <span className="truncate">{formatContainerPosition(container)}</span>
                    {/* block_entity が大半なので、例外の entity のときだけ印を出す */}
                    {container.sourceType === 'entity' && (
                      <Badge variant="outline" className="ml-auto h-4 shrink-0 px-1">
                        ent
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </ScrollArea>
    </div>
  )
}
