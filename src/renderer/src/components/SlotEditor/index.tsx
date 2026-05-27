import { useEffect, useRef, useState } from 'react'
import { MinecraftIds } from '../../../../shared/minecraftIds'
import { getInt, getString } from '../../../../shared/nbt/nbtAccess'
import { buildItemSnbt, SnbtParseError, snbtToCompound } from '../../../../shared/nbt/SnbtCodec'
import type { NbtCompound } from '../../../../shared/nbt/nbtTypes'
import type { ContainerRecord, ItemStackView } from '../../../../shared/types'
import { readItemCount, type WorldFormat } from '../../../../shared/world/WorldFormat'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { JsonCodeEditor } from '../ui/json-code-editor'
import { Label } from '../ui/label'

interface SlotEditorProps {
  container: ContainerRecord | null
  slot: number | null
  worldFormat: WorldFormat | null
  onUpdated: (container: ContainerRecord, targetSlot?: number) => void
  onError: (message: string) => void
  disabled?: boolean
}

interface EditorTarget {
  containerId: string
  slot: number
}

function itemFromSnbt(slot: number, itemId: string, count: number, rawSnbt: string): ItemStackView {
  return {
    slot,
    itemId,
    count,
    displaySummary: '',
    raw: rawSnbt
  }
}

function targetsMatch(current: EditorTarget | null, expected: EditorTarget): boolean {
  // 適用開始時と同じ対象が表示中なら true を返す
  if (current !== null && current.containerId === expected.containerId && current.slot === expected.slot) {
    return true
  }
  return false
}

function parseTargetSlot(compound: NbtCompound, fallback: number, slotCount: number): number | null {
  let candidate = fallback
  const slotValue = getInt(compound, 'Slot')
  // NBT に Slot が数値で指定されていればそれを優先する
  if (slotValue !== undefined) {
    candidate = slotValue
  }
  // スロット番号が範囲外なら無効
  if (!Number.isInteger(candidate) || candidate < 0 || candidate >= slotCount) {
    return null
  }
  return candidate
}

function parseItemId(compound: NbtCompound): string | null {
  const itemId = getString(compound, 'id')
  // id が空文字列でなければ有効
  if (itemId === undefined || itemId.trim() === '') {
    return null
  }
  return itemId
}

function parseItemCount(compound: NbtCompound, worldFormat: WorldFormat): number | null {
  const value = readItemCount(compound, worldFormat)
  // 個数は 0 以上の整数である必要がある
  if (Number.isNaN(value) || !Number.isInteger(value)) {
    return null
  }
  return value
}

/**
 * 選択スロットの NBT SNBT を編集するパネル。
 *
 * @param container - 編集対象コンテナ
 * @param slot - 編集対象スロット番号
 * @param onUpdated - 適用成功時コールバック
 * @param onError - エラーメッセージ通知
 * @param disabled - 操作中は true
 */
export function SlotEditor({ container, slot, worldFormat, onUpdated, onError, disabled = false }: SlotEditorProps): JSX.Element {
  const [nbtSnbt, setNbtSnbt] = useState('{}')
  const [isApplying, setIsApplying] = useState(false)
  const applyingRef = useRef(false)
  const activeTargetRef = useRef<EditorTarget | null>(null)

  useEffect(() => {
    // コンテナまたはスロット未選択なら編集対象をクリアする
    if (!container || slot === null) {
      activeTargetRef.current = null
      return
    }
    activeTargetRef.current = { containerId: container.id, slot }
    const existing = container.items.find((entry) => entry.slot === slot)

    let nextSnbt = '{}'
    if (worldFormat !== null) {
      nextSnbt = buildItemSnbt(slot, MinecraftIds.ITEM_AIR, 0, worldFormat.usesLegacyItemCount)
    }
    // 既存アイテムがあればその SNBT をエディタへ読み込む
    if (existing !== undefined) {
      nextSnbt = existing.raw
    }

    setNbtSnbt(nextSnbt)
  }, [container, slot, worldFormat])

  // コンテナまたはスロット未選択、またはワールド形式不明時は案内を表示する
  if (!container || slot === null || worldFormat === null) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          スロットを選択してください
        </CardContent>
      </Card>
    )
  }

  async function applyItem(nextItem: ItemStackView | null): Promise<void> {
    // 操作中または適用中は重複 IPC を送らない
    if (disabled || applyingRef.current) {
      return
    }
    const targetContainerId = container.id
    const targetSlotBeforeApply = slot
    const expectedTarget = { containerId: targetContainerId, slot: targetSlotBeforeApply }
    applyingRef.current = true
    setIsApplying(true)
    try {
      // メインプロセスへスロット更新を依頼する
      const updated = await window.worldChest.updateSlot({
        containerId: targetContainerId,
        slot: targetSlotBeforeApply,
        item: nextItem
      })
      // 更新成功時のみ UI を反映する
      if (updated) {
        // 適用中に別コンテナへ切り替わっていない場合だけ画面へ反映する
        if (targetsMatch(activeTargetRef.current, expectedTarget)) {
          let targetSlot: number | undefined
          // クリア以外なら移動先スロットを親へ通知する
          if (nextItem !== null) {
            targetSlot = nextItem.slot
          }
          onUpdated(updated, targetSlot)
        }
        return
      }
      onError('スロットの更新に失敗しました。スキャン後に再度お試しください。')
    } finally {
      applyingRef.current = false
      setIsApplying(false)
    }
  }

  async function apply(): Promise<void> {
    try {
      const compound = snbtToCompound(nbtSnbt.trim())
      const targetSlot = parseTargetSlot(compound, slot, container.slotCount)
      // スロット番号が不正ならエラーを表示する
      if (targetSlot === null) {
        onError(`Slot は 0 〜 ${container.slotCount - 1} の整数で指定してください`)
        return
      }
      const itemId = parseItemId(compound)
      // id が不正ならエラーを表示する
      if (itemId === null) {
        onError('id は空でない文字列で指定してください')
        return
      }
      const count = parseItemCount(compound, worldFormat)
      // 個数が不正ならエラーを表示する
      if (count === null || count < 0 || count > 64) {
        onError('count または Count は 0 〜 64 の整数で指定してください')
        return
      }
      await applyItem(itemFromSnbt(targetSlot, itemId, count, nbtSnbt.trim()))
    } catch (error) {
      // SNBT パース失敗時は専用メッセージを表示する
      if (error instanceof SnbtParseError) {
        onError(`NBT SNBT の形式が正しくありません: ${error.message}`)
        return
      }
      onError('NBT SNBT の形式が正しくありません')
    }
  }

  const editorDisabled = disabled || isApplying

  return (
    <Card className="flex h-full min-h-0 w-full flex-col">
      <CardHeader className="shrink-0">
        <CardTitle>Slot {slot}</CardTitle>
        <CardDescription>
          変更後は「適用」を押してから、ヘッダーの「保存」でワールドに書き込みます
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <Label htmlFor="slot-nbt-snbt">NBT (SNBT)</Label>
          <JsonCodeEditor
            id="slot-nbt-snbt"
            value={nbtSnbt}
            disabled={editorDisabled}
            fillHeight
            onChange={(value) => {
              // SNBT エディタの内容をそのまま編集状態へ反映する
              setNbtSnbt(value)
            }}
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" onClick={apply} disabled={editorDisabled}>適用</Button>
          <Button type="button" variant="outline" onClick={() => applyItem(null)} disabled={editorDisabled}>クリア</Button>
        </div>
      </CardContent>
    </Card>
  )
}
