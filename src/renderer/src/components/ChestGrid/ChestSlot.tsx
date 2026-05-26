import { useEffect, useState } from 'react'
import { MinecraftIds } from '../../../../shared/minecraftIds'
import { cn } from '@renderer/lib/utils'
import { DRAG_MIME, hideNativeDragImage } from './dragUtils'

interface ChestSlotProps {
  slot: number
  itemId?: string
  count?: number
  selected: boolean
  dragging: boolean
  dragOver: boolean
  onClick: () => void
  onDragStart: (details: { x: number; y: number; textureUrl: string | null; itemId: string; count: number }) => void
  onDragEnd: () => void
  onDragEnter: () => void
  onDrop: (fromSlot: number) => void
}

function effectiveCount(count: number | undefined): number {
  if (count === undefined) {
    return 0
  }
  return count
}

/**
 * チェストグリッドの 1 スロット（クリック・DnD 対応）。
 */
export function ChestSlot({
  slot,
  itemId,
  count,
  selected,
  dragging,
  dragOver,
  onClick,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop
}: ChestSlotProps): JSX.Element {
  const [textureUrl, setTextureUrl] = useState<string | null>(null)
  const hasItem = itemId !== undefined && itemId !== MinecraftIds.ITEM_AIR && effectiveCount(count) > 0

  useEffect(() => {
    let active = true
    if (!hasItem || !itemId) {
      setTextureUrl(null)
      return
    }
    setTextureUrl(null)
    // アイテム ID からテクスチャ URL を解決する
    window.worldChest.resolveTexture(itemId).then((url) => {
      if (active) {
        setTextureUrl(url)
      }
    })
    return () => {
      active = false
    }
  }, [hasItem, itemId])

  let slotTitle = `Slot ${slot}`
  if (hasItem && itemId !== undefined) {
    slotTitle = `${itemId} x${count}`
  }

  let dragCount = 1
  if (count !== undefined) {
    dragCount = count
  }

  let itemIcon: JSX.Element | null = null
  if (hasItem && textureUrl && itemId !== undefined) {
    itemIcon = (
      <img
        src={textureUrl}
        alt={itemId}
        className="mc-item-icon"
        draggable={false}
        onError={() => setTextureUrl(null)}
      />
    )
  }

  let itemFallback: JSX.Element | null = null
  if (hasItem && !textureUrl && itemId !== undefined) {
    itemFallback = <span className="mc-item-fallback">{itemId.replace('minecraft:', '').slice(0, 4)}</span>
  }

  let countLabel: JSX.Element | null = null
  if (hasItem && effectiveCount(count) > 1) {
    countLabel = <span className="mc-item-count">{count}</span>
  }

  return (
    <button
      type="button"
      draggable={hasItem}
      className={cn(
        'mc-slot',
        selected && 'mc-slot--selected',
        dragging && 'mc-slot--dragging',
        dragOver && 'mc-slot--drag-over'
      )}
      onClick={onClick}
      title={slotTitle}
      onDragStart={(event) => {
        if (!hasItem || !itemId) {
          event.preventDefault()
          return
        }
        event.dataTransfer.setData(DRAG_MIME, String(slot))
        event.dataTransfer.effectAllowed = 'move'
        hideNativeDragImage(event)
        onDragStart({
          x: event.clientX,
          y: event.clientY,
          textureUrl,
          itemId,
          count: dragCount
        })
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDragEnter={(event) => {
        event.preventDefault()
        onDragEnter()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const raw = event.dataTransfer.getData(DRAG_MIME)
        const fromSlot = Number(raw)
        // 不正な DnD データは無視する
        if (Number.isNaN(fromSlot)) {
          return
        }
        onDrop(fromSlot)
      }}
    >
      {itemIcon}
      {itemFallback}
      {countLabel}
    </button>
  )
}
