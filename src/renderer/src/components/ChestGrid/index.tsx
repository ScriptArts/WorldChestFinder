import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ContainerRecord } from '../../../../shared/types'
import { formatContainerPosition } from '../../../../shared/containerUtils'
import { Card, CardContent } from '../ui/card'
import { ChestSlot } from './ChestSlot'
import { DRAG_PREVIEW_OFFSET, prepareNativeDragImageHost, type DragPreviewState } from './dragUtils'
import { formatContainerTitle, getChestGridClass, getChestWindowClass } from './minecraftChestUtils'
import { cn } from '@renderer/lib/utils'

interface ChestGridProps {
  container: ContainerRecord | null
  selectedSlot: number | null
  onSelectSlot: (slot: number) => void
  onMoveSlot: (fromSlot: number, toSlot: number) => void | Promise<void>
  disabled?: boolean
}

function buildSlots(container: ContainerRecord): Array<{ slot: number; item: ContainerRecord['items'][number] | undefined }> {
  return Array.from({ length: container.slotCount }, (_, slot) => {
    const item = container.items.find((entry) => entry.slot === slot)
    return { slot, item }
  })
}

function renderDragPreviewContent(dragPreview: DragPreviewState): JSX.Element {
  // テクスチャが解決済みなら背景画像でプレビューする（img だとネイティブ DnD と競合しうる）
  if (dragPreview.textureUrl) {
    return (
      <span
        className="mc-drag-preview-icon"
        style={{ backgroundImage: `url("${dragPreview.textureUrl}")` }}
        aria-hidden="true"
      />
    )
  }
  return <span className="mc-drag-preview-fallback">{dragPreview.label}</span>
}

function renderDragPreviewCount(count: number): JSX.Element | null {
  // 2 個以上のスタックだけ個数バッジを表示する
  if (count > 1) {
    return <span className="mc-drag-preview-count">{count}</span>
  }
  return null
}

/**
 * Minecraft 風チェストグリッド UI。
 *
 * @param container - 表示対象コンテナ
 * @param selectedSlot - 選択中スロット
 * @param onSelectSlot - スロット選択コールバック
 * @param onMoveSlot - DnD による移動コールバック
 * @param disabled - 操作中は true で操作不可
 */
export function ChestGrid({ container, selectedSlot, onSelectSlot, onMoveSlot, disabled = false }: ChestGridProps): JSX.Element {
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null)

  useEffect(() => {
    // 初回 DnD 前にネイティブドラッグ画像ホストを DOM へ用意する
    prepareNativeDragImageHost()
  }, [])

  useEffect(() => {
    // ドラッグ中でなければカーソル追従リスナーを登録しない
    if (draggingSlot === null) {
      return
    }

    function handleDragOver(event: DragEvent): void {
      event.preventDefault()
      setDragPreview((current) => {
        // プレビュー状態がなければ更新しない
        if (!current) {
          return current
        }
        return { ...current, x: event.clientX, y: event.clientY }
      })
    }

    document.addEventListener('dragover', handleDragOver)
    return () => {
      document.removeEventListener('dragover', handleDragOver)
    }
  }, [draggingSlot])

  function clearDragState(): void {
    setDraggingSlot(null)
    setDragOverSlot(null)
    setDragPreview(null)
  }

  // コンテナ未選択時は案内メッセージを表示する
  if (!container) {
    return (
      <Card>
        <CardContent className="mc-chest-empty">コンテナを選択してください</CardContent>
      </Card>
    )
  }

  const rows = Math.ceil(container.slotCount / 9)
  const slots = buildSlots(container)

  async function handleDrop(fromSlot: number, toSlot: number): Promise<void> {
    clearDragState()
    // 同一スロットまたは操作中のドロップは無視する
    if (fromSlot === toSlot || disabled) {
      return
    }
    await onMoveSlot(fromSlot, toSlot)
  }

  let dragPreviewPortal: JSX.Element | null = null
  // ドラッグプレビューがあれば body へポータル表示する
  if (dragPreview) {
    dragPreviewPortal = createPortal(
      <div
        className="mc-drag-preview"
        style={{
          transform: `translate(${dragPreview.x - DRAG_PREVIEW_OFFSET}px, ${dragPreview.y - DRAG_PREVIEW_OFFSET}px)`
        }}
      >
        {renderDragPreviewContent(dragPreview)}
        {renderDragPreviewCount(dragPreview.count)}
      </div>,
      document.body
    )
  }

  let rootClassName = 'mc-chest-root'
  // 操作中はグリッド全体の操作を無効化する
  if (disabled) {
    rootClassName = cn('mc-chest-root', 'pointer-events-none opacity-60')
  }

  return (
    <div className={rootClassName}>
      {dragPreviewPortal}
      <div className={getChestWindowClass(container.blockEntityId, container.slotCount)}>
        <h2 className="mc-chest-title">{formatContainerTitle(container.blockEntityId, container)}</h2>
        <p className="mc-chest-meta">
          {container.dimension} · {formatContainerPosition(container)} · {container.sourceType}
        </p>
        <div
          className={getChestGridClass(container.blockEntityId, container.slotCount)}
          style={{ gridTemplateRows: `repeat(${rows}, var(--mc-slot-size))` }}
          onDragLeave={(event) => {
            // グリッド外へ完全に離れたときだけハイライトを解除する
            if (event.currentTarget === event.target) {
              setDragOverSlot(null)
            }
          }}
        >
          {slots.map(({ slot, item }) => {
            let slotItemId: string | undefined
            let slotItemCount: number | undefined
            // スロットにアイテムがあれば表示用プロパティを設定する
            if (item !== undefined) {
              slotItemId = item.itemId
              slotItemCount = item.count
            }

            return (
              <ChestSlot
                key={slot}
                slot={slot}
                itemId={slotItemId}
                count={slotItemCount}
                selected={selectedSlot === slot}
                dragging={draggingSlot === slot}
                dragOver={dragOverSlot === slot && draggingSlot !== slot}
                onClick={() => {
                  // 操作中でなければスロット選択を通知する
                  if (!disabled) {
                    onSelectSlot(slot)
                  }
                }}
                onDragStart={(details) => {
                  // 操作中はドラッグ開始を受け付けない
                  if (disabled) {
                    return
                  }
                  setDraggingSlot(slot)
                  setDragPreview({
                    x: details.x,
                    y: details.y,
                    textureUrl: details.textureUrl,
                    label: details.itemId.replace('minecraft:', '').slice(0, 4),
                    count: details.count
                  })
                }}
                onDragEnd={clearDragState}
                onDragEnter={() => setDragOverSlot(slot)}
                onDrop={(fromSlot) => handleDrop(fromSlot, slot)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
