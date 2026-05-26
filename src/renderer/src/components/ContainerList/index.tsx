import type { ContainerRecord } from '../../../../shared/types'
import { formatContainerPosition } from '../../../../shared/containerUtils'
import { formatContainerTitle } from '../ChestGrid/minecraftChestUtils'
import { Badge } from '../ui/badge'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '@renderer/lib/utils'

interface ContainerListProps {
  containers: ContainerRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}

/**
 * スキャン結果のコンテナ一覧（選択・フィルタ連動）。
 */
export function ContainerList({ containers, selectedId, onSelect, disabled = false }: ContainerListProps): JSX.Element {
  // コンテナが 0 件なら空状態メッセージを表示する
  if (containers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Items タグを持つコンテナが見つかりません
      </div>
    )
  }

  return (
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
  )
}
