import { useEffect, useRef, useState } from 'react'
import { MinecraftIds } from '../../../../shared/minecraftIds'
import type { ContainerRecord, ItemStackView } from '../../../../shared/types'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { JsonCodeEditor } from '../ui/json-code-editor'
import { Label } from '../ui/label'

interface SlotEditorProps {
  container: ContainerRecord | null
  slot: number | null
  onUpdated: (container: ContainerRecord, targetSlot?: number) => void
  onError: (message: string) => void
  disabled?: boolean
}

interface EditorTarget {
  containerId: string
  slot: number
}

function itemFromRaw(slot: number, itemId: string, count: number, raw: Record<string, unknown>): ItemStackView {
  const nextRaw: Record<string, unknown> = { ...raw, Slot: slot, id: itemId }
  return {
    slot,
    itemId,
    count,
    displaySummary: '',
    raw: nextRaw
  }
}

function targetsMatch(current: EditorTarget | null, expected: EditorTarget): boolean {
  // 適用開始時と同じ対象が表示中なら true を返す
  if (current !== null && current.containerId === expected.containerId && current.slot === expected.slot) {
    return true
  }
  return false
}

function parseTargetSlot(raw: Record<string, unknown>, fallback: number, slotCount: number): number | null {
  let candidate = fallback
  // NBT に Slot が数値で指定されていればそれを優先する
  if (typeof raw.Slot === 'number') {
    candidate = raw.Slot
  }
  // スロット番号が範囲外なら無効
  if (!Number.isInteger(candidate) || candidate < 0 || candidate >= slotCount) {
    return null
  }
  return candidate
}

function parseItemId(raw: Record<string, unknown>): string | null {
  // id が空文字列でなければ有効
  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    return null
  }
  return raw.id
}

function parseItemCount(raw: Record<string, unknown>): number | null {
  let value = raw.count
  // count がなければ legacy の Count を参照する
  if (value === undefined) {
    value = raw.Count
  }
  // 個数は 0 以上の整数である必要がある
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isInteger(value)) {
    return null
  }
  return value
}

/**
 * 選択スロットの NBT JSON を編集するパネル。
 *
 * @param container - 編集対象コンテナ
 * @param slot - 編集対象スロット番号
 * @param onUpdated - 適用成功時コールバック
 * @param onError - エラーメッセージ通知
 * @param disabled - 操作中は true
 */
export function SlotEditor({ container, slot, onUpdated, onError, disabled = false }: SlotEditorProps): JSX.Element {
  const [nbtJson, setNbtJson] = useState('{}')
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

    let nextRaw: Record<string, unknown> = { Slot: slot, id: MinecraftIds.ITEM_AIR, count: 0 }
    // 既存アイテムがあればその NBT をエディタへ読み込む
    if (existing !== undefined) {
      nextRaw = existing.raw
    }

    setNbtJson(JSON.stringify(nextRaw, null, 2))
  }, [container, slot])

  // コンテナまたはスロット未選択時は案内を表示する
  if (!container || slot === null) {
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
      const raw = JSON.parse(nbtJson) as Record<string, unknown>
      const targetSlot = parseTargetSlot(raw, slot, container.slotCount)
      // スロット番号が不正ならエラーを表示する
      if (targetSlot === null) {
        onError(`Slot は 0 〜 ${container.slotCount - 1} の整数で指定してください`)
        return
      }
      const itemId = parseItemId(raw)
      // id が不正ならエラーを表示する
      if (itemId === null) {
        onError('id は空でない文字列で指定してください')
        return
      }
      const count = parseItemCount(raw)
      // 個数が不正ならエラーを表示する
      if (count === null || count < 0 || count > 64) {
        onError('count または Count は 0 〜 64 の整数で指定してください')
        return
      }
      await applyItem(itemFromRaw(targetSlot, itemId, count, raw))
    } catch {
      onError('NBT JSON の形式が正しくありません')
    }
  }

  const editorDisabled = disabled || isApplying

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Slot {slot}</CardTitle>
        <CardDescription>
          変更後は「適用」を押してから、ヘッダーの「保存」でワールドに書き込みます
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="slot-nbt-json">NBT (JSON)</Label>
          <JsonCodeEditor
            id="slot-nbt-json"
            value={nbtJson}
            disabled={editorDisabled}
            onChange={(value) => {
              // JSON エディタの内容をそのまま編集状態へ反映する
              setNbtJson(value)
            }}
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={apply} disabled={editorDisabled}>適用</Button>
          <Button type="button" variant="outline" onClick={() => applyItem(null)} disabled={editorDisabled}>クリア</Button>
        </div>
      </CardContent>
    </Card>
  )
}
