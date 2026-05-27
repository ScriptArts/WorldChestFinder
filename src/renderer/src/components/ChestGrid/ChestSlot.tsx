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
  // 個数未指定なら 0 として扱う
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
    // アイテムがなければテクスチャ表示をクリアする
    if (!hasItem || !itemId) {
      setTextureUrl(null)
      return
    }
    setTextureUrl(null)
    // アイテム ID からテクスチャ URL を解決する
    window.worldChest.resolveTexture(itemId).then((url) => {
      // アンマウント後の setState を防ぐ
      if (active) {
        // 解決失敗時はフォールバック表示へ切り替える
        if (url === null) {
          setTextureUrl(null)
          return
        }
        setTextureUrl(url)
      }
    })
    return () => {
      active = false
    }
  }, [hasItem, itemId])

  let slotTitle = `Slot ${slot}`
  // アイテムがある場合は ID と個数をツールチップに表示する
  if (hasItem && itemId !== undefined) {
    slotTitle = `${itemId} x${count}`
  }

  let dragCount = 1
  // 個数が指定されていれば DnD 用個数に反映する
  if (count !== undefined) {
    dragCount = count
  }

  let itemIcon: JSX.Element | null = null
  // テクスチャが解決済みならアイコン画像を表示する
  if (hasItem && textureUrl && itemId !== undefined) {
    itemIcon = (
      <span
        className="mc-item-icon"
        style={{ backgroundImage: `url("${textureUrl}")` }}
        aria-hidden="true"
      />
    )
  }

  let itemFallback: JSX.Element | null = null
  // テクスチャ未取得時は ID の先頭文字で代替表示する
  if (hasItem && !textureUrl && itemId !== undefined) {
    itemFallback = <span className="mc-item-fallback">{itemId.replace('minecraft:', '').slice(0, 4)}</span>
  }

  let countLabel: JSX.Element | null = null
  // 2 個以上のスタックだけ個数ラベルを表示する
  if (hasItem && effectiveCount(count) > 1) {
    countLabel = <span className="mc-item-count">{count}</span>
  }

  function handleSlotKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    // ボタン相当のキーボード操作を提供する
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={hasItem}
      className={cn(
        'mc-slot',
        selected && 'mc-slot--selected',
        dragging && 'mc-slot--dragging',
        dragOver && 'mc-slot--drag-over'
      )}
      onClick={onClick}
      onKeyDown={handleSlotKeyDown}
      title={slotTitle}
      onDragStart={(event) => {
        // アイテムがないスロットはドラッグ開始を拒否する
        if (!hasItem || !itemId) {
          event.preventDefault()
          return
        }
        event.stopPropagation()
        event.dataTransfer.clearData()
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
    </div>
  )
}
